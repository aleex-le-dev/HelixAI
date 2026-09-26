/**
 * Mise à jour de l'application.
 *
 * Deux régimes, et l'écran dit toujours lequel s'applique :
 *
 *  - **application signée** (certificat « Developer ID Application », voir
 *    SIGNATURE.md) : la nouvelle version se télécharge en arrière-plan et
 *    s'installe au redémarrage. macOS n'accepte d'installer une mise à jour que
 *    si elle porte la même signature que l'application en place : c'est ce qui
 *    empêche un tiers de glisser une version piégée ;
 *  - **application non signée** (le cas tant que le certificat manque) :
 *    Helix vérifie qu'une version plus récente existe et le dit, avec un lien
 *    vers le paquet. L'installation reste manuelle, parce que macOS refuserait
 *    de toute façon de remplacer une application non signée.
 *
 * Souveraineté : la seule adresse contactée est celle que l'agence a inscrite
 * à la construction du paquet (`publish.url`, fournisseur `generic`), sur son
 * propre serveur. Aucune plateforme tierce, aucun GitHub. Sans adresse, rien
 * n'est contacté et l'écran le dit. HTTPS exigé, sauf sur la boucle locale
 * (essais).
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile, spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain, shell, net } = require("electron");
const coffre = require("./coffre.cjs");

/** Toutes les six heures, et une première fois peu après le lancement. */
const INTERVALLE_MS = 6 * 60 * 60 * 1000;
const PREMIERE_VERIFICATION_MS = 15 * 1000;

let updater = null;
let adresseFlux = null;
/** En-têtes de la source : le jeton d'instance quand la source est l'instance du poste. */
let entetesFlux = {};
/** Ce que la source a annoncé (fichiers et empreintes), pour l'installation sans signature. */
let annonce = null;
let minuterie = null;

const etat = {
  /** inactif | non-configuree | verification | a-jour | disponible | telechargement | prete | erreur */
  phase: "inactif",
  versionInstallee: app.getVersion(),
  versionDisponible: null,
  pourcent: null,
  signee: false,
  automatique: false,
  derniereVerification: null,
  message: null,
  lienPaquet: null,
};

function publier(changements) {
  Object.assign(etat, changements);
  // À toutes les fenêtres : sur macOS, la fenêtre peut être refermée puis recréée.
  for (const f of BrowserWindow.getAllWindows()) {
    if (!f.isDestroyed()) f.webContents.send("helix:maj-etat", { ...etat });
  }
}

/** L'application porte-t-elle une vraie signature d'éditeur (et pas ad hoc) ? */
function lireSignature() {
  return new Promise((resolve) => {
    if (process.platform !== "darwin") return resolve(false);
    // …/Helix.app/Contents/MacOS/Helix → …/Helix.app
    const paquet = path.resolve(path.dirname(process.execPath), "..", "..");
    execFile("/usr/bin/codesign", ["-dv", "--verbose=2", paquet], (err, _out, sortie) => {
      if (err) return resolve(false);
      const equipe = /TeamIdentifier=(\S+)/.exec(String(sortie))?.[1];
      resolve(Boolean(equipe) && equipe !== "not" && !/Signature=adhoc/.test(String(sortie)));
    });
  });
}

/**
 * L'instance à laquelle ce poste est rattaché, source de ses mises à jour
 * (gateway/src/telechargement.ts, fluxMiseAJour). Décidé par Medhi le
 * 26/09/2026 : pas de serveur à tenir, l'instance a déjà l'application dans sa
 * version exacte. HTTPS exigé hors de la boucle locale, comme pour le reste.
 */
function sourceInstance() {
  try {
    const brut = coffre.lire()["helix:instance"];
    if (!brut) return null;
    const config = JSON.parse(brut);
    if (!config || config.remote !== true || typeof config.url !== "string" || !config.token) return null;
    const u = new URL(config.url);
    const locale = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && locale)) return null;
    return { url: `${config.url.replace(/\/+$/, "")}/helix/mises-a-jour/`, entetes: { Authorization: `Bearer ${config.token}` } };
  } catch {
    return null;
  }
}

/** Adresse du flux inscrite dans le paquet par electron-builder, ou null. */
function lireAdresseFlux() {
  const fichier = path.join(process.resourcesPath, "app-update.yml");
  if (!fs.existsSync(fichier)) return null;
  const url = /^url:\s*['"]?([^'"\s]+)/m.exec(fs.readFileSync(fichier, "utf8"))?.[1];
  if (!url) return null;
  try {
    const u = new URL(url);
    const locale = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && locale)) return { refusee: url };
    return { url: url.endsWith("/") ? url : `${url}/` };
  } catch {
    return { refusee: url };
  }
}

async function verifier() {
  if (!updater) return { ...etat };
  publier({ phase: "verification", message: null });
  try {
    await updater.checkForUpdates();
  } catch (err) {
    publier({ phase: "erreur", message: messageErreur(err) });
  }
  return { ...etat };
}

function messageErreur(err) {
  const brut = err instanceof Error ? err.message : String(err);
  // Codes de Node et de Chromium (`net::ERR_…`) : electron-updater passe par l'un ou l'autre.
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|net::ERR_(CONNECTION|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT|ADDRESS_UNREACHABLE|NETWORK)/.test(brut)) {
    return "Le serveur de mises à jour ne répond pas. Nouvel essai plus tard.";
  }
  if (/404/.test(brut)) return "Aucune publication trouvée à l'adresse de mise à jour.";
  if (/code signature|signature/i.test(brut)) {
    return "La mise à jour n'a pas été installée : sa signature ne correspond pas à celle de l'application.";
  }
  return `Vérification impossible : ${brut.slice(0, 160)}`;
}

/*
 * Qui a le droit d'appeler ces canaux : la fenêtre principale seule, comme
 * tous les autres (main.cjs, `depuisLaFenetre`). Ils ne vérifiaient rien
 * jusqu'à la revue du 26/09/2026. Tant que main.cjs n'a pas donné sa règle,
 * personne.
 */
let expediteurPermis = () => false;
const garde = (fn) => (event, ...args) => {
  if (!expediteurPermis(event)) throw new Error("Refusé.");
  return fn(event, ...args);
};

function brancher() {
  ipcMain.handle("helix:maj-etat", garde(() => ({ ...etat })));
  ipcMain.handle("helix:maj-verifier", garde(() => verifier()));
  ipcMain.handle("helix:maj-installer", garde(() => {
    // Application signée : la mise à jour téléchargée par electron-updater.
    if (updater && etat.phase === "prete" && etat.automatique) {
      setImmediate(() => updater.quitAndInstall());
      return true;
    }
    // Sans signature : Helix l'installe lui-même, sur le clic de la personne.
    if (etat.phase === "disponible" && annonce) {
      void installerSansSignature().catch((err) => publier({ phase: "erreur", message: `Installation impossible : ${String(err?.message ?? err).slice(0, 200)}` }));
      return true;
    }
    return false;
  }));
  ipcMain.handle("helix:maj-ouvrir-paquet", garde(() => {
    // Le lien vient du flux de l'agence, jamais de la page, et reste du web :
    // un flux altéré ne doit pas pouvoir faire ouvrir un `file:` ou un `smb:`.
    if (!etat.lienPaquet || !/^https?:\/\//i.test(etat.lienPaquet)) return false;
    void shell.openExternal(etat.lienPaquet);
    return true;
  }));
}

/**
 * À appeler une fois, application prête. En développement, rien n'est fait :
 * il n'y a pas de paquet à remplacer.
 */
/** @param {(event: Electron.IpcMainInvokeEvent) => boolean} permis la règle des canaux (main.cjs). */
async function demarrerMiseAJour(permis) {
  if (typeof permis === "function") expediteurPermis = permis;
  if (!app.isPackaged) {
    publier({ phase: "inactif", message: "Pas de mise à jour en développement." });
    return;
  }

  // Le serveur de l'agence s'il a été inscrit dans le paquet, sinon l'instance du poste.
  let flux = lireAdresseFlux();
  if (!flux) {
    const instance = sourceInstance();
    if (instance) {
      flux = { url: instance.url };
      entetesFlux = instance.entetes;
    }
  }
  if (!flux) {
    publier({ phase: "non-configuree", message: null });
    return;
  }
  if (flux.refusee) {
    publier({
      phase: "non-configuree",
      message: `Adresse de mise à jour refusée, faute de HTTPS : ${flux.refusee}`,
    });
    return;
  }
  adresseFlux = flux.url;

  const signee = await lireSignature();
  ({ autoUpdater: updater } = require("electron-updater"));
  if (entetesFlux.Authorization) {
    updater.setFeedURL({ provider: "generic", url: adresseFlux });
    updater.requestHeaders = entetesFlux;
  }
  updater.autoDownload = signee;
  updater.autoInstallOnAppQuit = signee;
  updater.allowPrerelease = false;
  updater.logger = null;
  publier({ signee, automatique: signee });

  updater.on("update-available", (info) => {
    annonce = info;
    const dmg = (info.files ?? []).find((f) => /\.dmg$/i.test(f.url));
    publier({
      phase: signee ? "telechargement" : "disponible",
      versionDisponible: info.version,
      derniereVerification: new Date().toISOString(),
      pourcent: signee ? 0 : null,
      lienPaquet: dmg ? new URL(dmg.url, adresseFlux).toString() : null,
    });
  });
  updater.on("update-not-available", () =>
    publier({
      phase: "a-jour",
      versionDisponible: null,
      derniereVerification: new Date().toISOString(),
    }),
  );
  updater.on("download-progress", (p) =>
    publier({ phase: "telechargement", pourcent: Math.round(p.percent ?? 0) }),
  );
  updater.on("update-downloaded", (info) =>
    publier({ phase: "prete", versionDisponible: info.version, pourcent: 100 }),
  );
  updater.on("error", (err) => publier({ phase: "erreur", message: messageErreur(err) }));

  setTimeout(() => void verifier(), PREMIERE_VERIFICATION_MS).unref?.();
  minuterie = setInterval(() => void verifier(), INTERVALLE_MS);
  minuterie.unref?.();
}

/**
 * Installe une version annoncée, sans signature Apple, sur le clic de la
 * personne : l'archive est téléchargée depuis la même source, vérifiée par son
 * empreinte SHA-512 (celle de l'annonce), décompressée par `ditto`, et
 * contrôlée (même identifiant d'application, version annoncée). Puis un petit
 * script remplace l'application une fois celle-ci fermée, et la relance ;
 * l'ancienne est gardée à côté jusqu'à ce que la nouvelle soit en place.
 *
 * Pourquoi on peut le faire sans signature : macOS ne marque « téléchargé »
 * (quarantaine) que ce que téléchargent les navigateurs ; une archive lue par
 * l'application elle-même ne l'est pas, et l'attribut est retiré au cas où.
 */
async function installerSansSignature() {
  const zip = (annonce.files ?? []).find((f) => /\.zip$/i.test(f.url));
  if (!zip || !zip.sha512) throw new Error("l'annonce ne décrit pas d'archive vérifiable");
  const url = new URL(zip.url, adresseFlux).toString();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "helix-maj-"));
  const fichier = path.join(dossier, "maj.zip");
  publier({ phase: "telechargement", pourcent: 0, message: null });
  const reponse = await net.fetch(url, { headers: entetesFlux });
  if (!reponse.ok || !reponse.body) throw new Error(`la source a répondu ${reponse.status}`);
  const total = Number(reponse.headers.get("content-length")) || zip.size || 0;
  const hash = crypto.createHash("sha512");
  const sortie = fs.createWriteStream(fichier);
  let recu = 0;
  const lecteur = reponse.body.getReader();
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    hash.update(value);
    sortie.write(Buffer.from(value));
    recu += value.length;
    if (total) publier({ pourcent: Math.min(99, Math.round((recu / total) * 100)) });
  }
  await new Promise((r) => sortie.end(r));
  if (hash.digest("base64") !== zip.sha512) throw new Error("l'empreinte de l'archive ne correspond pas à l'annonce");
  const extrait = path.join(dossier, "extrait");
  fs.mkdirSync(extrait);
  await new Promise((resolve, reject) => execFile("/usr/bin/ditto", ["-x", "-k", fichier, extrait], (err) => (err ? reject(err) : resolve())));
  const nomApp = fs.readdirSync(extrait).find((n) => n.endsWith(".app"));
  if (!nomApp) throw new Error("l'archive ne contient pas d'application");
  const nouvelle = path.join(extrait, nomApp);
  const actuelle = path.resolve(path.dirname(process.execPath), "..", "..");
  const lirePlist = (appli, cle) =>
    new Promise((resolve) =>
      execFile("/usr/bin/plutil", ["-extract", cle, "raw", path.join(appli, "Contents", "Info.plist")], (err, out) => resolve(err ? "" : String(out).trim())),
    );
  if ((await lirePlist(nouvelle, "CFBundleIdentifier")) !== (await lirePlist(actuelle, "CFBundleIdentifier"))) {
    throw new Error("l'archive contient une autre application");
  }
  if ((await lirePlist(nouvelle, "CFBundleShortVersionString")) !== annonce.version) throw new Error("la version de l'archive n'est pas celle annoncée");
  fs.accessSync(path.dirname(actuelle), fs.constants.W_OK);
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const avant = `${actuelle}.avant-maj`;
  const script = path.join(dossier, "installer.sh");
  fs.writeFileSync(
    script,
    [
      "#!/bin/sh",
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done`,
      `rm -rf ${q(avant)}`,
      `mv ${q(actuelle)} ${q(avant)} || exit 1`,
      `if mv ${q(nouvelle)} ${q(actuelle)}; then`,
      `  xattr -dr com.apple.quarantine ${q(actuelle)} 2>/dev/null`,
      `  rm -rf ${q(avant)}`,
      "else",
      `  mv ${q(avant)} ${q(actuelle)}`,
      "fi",
      `open ${q(actuelle)}`,
      `rm -rf ${q(dossier)}`,
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  publier({ phase: "prete", pourcent: 100, message: "Installation : l'application va se fermer et se rouvrir." });
  spawn("/bin/sh", [script], { detached: true, stdio: "ignore" }).unref();
  setTimeout(() => app.quit(), 800);
}

brancher();

module.exports = { demarrerMiseAJour };
