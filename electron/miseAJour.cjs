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
 * D'où vient l'annonce, dans cet ordre : le serveur de l'agence s'il est
 * inscrit dans le paquet (`publish.url`, fournisseur `generic`) ; sinon, pour
 * un poste rattaché, son instance (décidé par Medhi le 26/09/2026) ; sinon,
 * pour un poste installé seul, les publications GitHub du dépôt (décidé par
 * Medhi le 27/09/2026, sourceGithub.cjs : sur macOS et sous Windows
 * l'installation d'un clic, signature de l'éditeur vérifiée ; sous Linux, le
 * paquet proposé au téléchargement). `HELIX_SANS_MISE_A_JOUR=1` : rien n'est
 * contacté. HTTPS exigé, sauf sur la boucle locale (essais).
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile, spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain, shell, net } = require("electron");
const coffre = require("./coffre.cjs");
const signatureEditeur = require("./signatureEditeur.cjs");
const sourceGithub = require("./sourceGithub.cjs");
const { changerLangue, tx, raison } = require("./textesMiseAJour.cjs");

/** Toutes les six heures, et une première fois peu après le lancement. */
const INTERVALLE_MS = 6 * 60 * 60 * 1000;
const PREMIERE_VERIFICATION_MS = 15 * 1000;

let updater = null;
let adresseFlux = null;
/** En-têtes de la source : le jeton d'instance quand la source est l'instance du poste. */
let entetesFlux = {};
/** Ce que la source a annoncé (fichiers et empreintes), pour l'installation sans signature. */
let annonce = null;
/**
 * Windows : l'installateur décrit par le manifeste de la publication, signature
 * de l'éditeur déjà vérifiée (sourceGithub.lireManifesteWindows), et son
 * adresse de téléchargement prise dans la réponse de GitHub.
 */
let annonceWindows = null;
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
  /** Le système du poste : hors de macOS, l'écran dit que la mise à jour se fait à la main. */
  plateforme: process.platform,
  /** D'où vient l'annonce : `agence`, `instance`, `github`, ou null. */
  source: null,
  /** L'installation d'un clic est-elle possible ici (macOS, archive décrite ; Windows, installateur signé) ? Sinon, le paquet se télécharge. */
  unClic: false,
};

/** Le dépôt des publications, inscrit dans le package.json livré (`depotMisesAJour`). */
const DEPOT = (() => {
  try {
    return sourceGithub.depotValide(require("../package.json").depotMisesAJour);
  } catch {
    return null;
  }
})();

/**
 * L'identifiant que signe l'éditeur pour l'installateur Windows : le `name` du
 * package.json, le seul que garde le package.json livré (electron-builder en
 * retire `build`, donc `appId`). Le même est lu par
 * scripts/manifeste-mise-a-jour.mjs.
 */
const IDENTIFIANT_WINDOWS = (() => {
  try {
    const nom = require("../package.json").name;
    return typeof nom === "string" && nom ? nom : null;
  } catch {
    return null;
  }
})();

/** Windows : le dossier où l'installateur est téléchargé, à Helix seul (dans son profil, pas le dossier temporaire commun). */
const dossierInstallateur = () => path.join(app.getPath("userData"), "mise-a-jour");

/**
 * La dernière publication GitHub du dépôt. Sur macOS, l'annonce vient du
 * manifeste publié avec elle (`helix-mise-a-jour.json`) ; ailleurs, le lien du
 * paquet qui convient suffit.
 */
async function verifierGithub() {
  publier({ phase: "verification", message: null });
  try {
    const entetes = { Accept: "application/vnd.github+json", "User-Agent": "Helix" };
    const reponse = await net.fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, { headers: entetes });
    if (reponse.status === 404) {
      publier({ phase: "erreur", message: tx("githubVide") });
      return;
    }
    if (!reponse.ok) throw new Error(`GitHub a répondu ${reponse.status}`);
    const publication = await reponse.json();
    const version = String(publication.tag_name ?? "").replace(/^v/, "");
    const maintenant = new Date().toISOString();
    if (publication.draft || publication.prerelease || !sourceGithub.plusRecente(version, app.getVersion())) {
      annonce = null;
      publier({ phase: "a-jour", versionDisponible: null, derniereVerification: maintenant, unClic: false });
      return;
    }
    const fichiers = publication.assets ?? [];
    const paquet = sourceGithub.choisirPaquet(fichiers, { plateforme: process.platform, arch: process.arch, appImage: Boolean(process.env.APPIMAGE) });
    annonce = null;
    annonceWindows = null;
    if (process.platform === "darwin") {
      const manifeste = fichiers.find((f) => f.name === "helix-mise-a-jour.json");
      if (manifeste) {
        const lu = await net.fetch(manifeste.browser_download_url, { headers: { "User-Agent": "Helix" } });
        annonce = lu.ok ? sourceGithub.lireManifeste(await lu.text(), version) : null;
        // L'archive décrite doit être dans la même publication.
        if (annonce && !fichiers.some((f) => f.name === annonce.files[0].url)) annonce = null;
      }
      adresseFlux = `https://github.com/${DEPOT}/releases/download/${encodeURIComponent(publication.tag_name)}/`;
    }
    /*
     * Windows (27/09/2026) : l'installateur, si le manifeste le décrit et que
     * sa signature est bonne avec la clé de cette application. Sans clé (paquet
     * fabriqué sans elle), sans partie Windows, ou signature fausse : l'écran
     * garde « Télécharger ». Seulement sur x64, le seul installateur publié.
     */
    if (process.platform === "win32" && process.arch === "x64") {
      const manifeste = fichiers.find((f) => f.name === "helix-mise-a-jour.json");
      const cle = signatureEditeur.cleDesRessources(process.resourcesPath);
      if (manifeste && cle && IDENTIFIANT_WINDOWS) {
        const lu = await net.fetch(manifeste.browser_download_url, { headers: { "User-Agent": "Helix" } });
        const decrit = lu.ok ? sourceGithub.lireManifesteWindows(await lu.text(), version, cle, IDENTIFIANT_WINDOWS) : null;
        // L'installateur décrit doit être dans la même publication, avec une adresse https.
        const fichier = decrit ? fichiers.find((f) => f.name === decrit.fichier) : null;
        if (decrit && fichier && typeof fichier.browser_download_url === "string" && /^https:\/\//i.test(fichier.browser_download_url)) {
          annonceWindows = { ...decrit, url: fichier.browser_download_url };
        }
      }
    }
    publier({
      phase: "disponible",
      versionDisponible: version,
      derniereVerification: maintenant,
      lienPaquet: paquet ? paquet.browser_download_url : (typeof publication.html_url === "string" ? publication.html_url : null),
      unClic: Boolean(annonce) || Boolean(annonceWindows),
    });
  } catch (err) {
    publier({ phase: "erreur", message: messageErreur(err) });
  }
}

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
  if (etat.source === "github") {
    await verifierGithub();
    return { ...etat };
  }
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
    return tx("serveurMuet");
  }
  if (/404/.test(brut)) return tx("rienA");
  if (/code signature|signature/i.test(brut)) {
    return tx("signatureApple");
  }
  return tx("verificationImpossible", brut.slice(0, 160));
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
    // Windows : l'installateur signé par l'éditeur, lancé en silence sur le clic de la personne.
    // « Réessayer » après un échec : l'annonce reste, et tout est revérifié.
    if (process.platform === "win32" && (etat.phase === "disponible" || etat.phase === "erreur") && annonceWindows) {
      void installerWindows().catch((err) => publier({ phase: "erreur", message: tx("installationImpossible", String(err?.message ?? err).slice(0, 200)) }));
      return true;
    }
    // Sans signature : Helix l'installe lui-même, sur le clic de la personne.
    if (etat.phase === "disponible" && annonce) {
      void installerSansSignature().catch((err) => publier({ phase: "erreur", message: tx("installationImpossible", String(err?.message ?? err).slice(0, 200)) }));
      return true;
    }
    return false;
  }));
  ipcMain.handle("helix:maj-ouvrir-paquet", garde(() => {
    // Le lien vient du flux de l'agence ou de GitHub, jamais de la page, et reste du web :
    // un flux altéré ne doit pas pouvoir faire ouvrir un `file:` ou un `smb:`.
    if (!etat.lienPaquet || !/^https:\/\//i.test(etat.lienPaquet)) return false;
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
    publier({ phase: "inactif", message: tx("developpement") });
    return;
  }
  if (process.env.HELIX_SANS_MISE_A_JOUR === "1") {
    publier({ phase: "non-configuree", message: null });
    return;
  }

  /*
   * Poste installé seul (ni serveur de l'agence dans le paquet, ni instance) :
   * les publications GitHub, sur les trois systèmes (sourceGithub.cjs).
   */
  const brancherGithub = () => {
    if (!DEPOT) return false;
    publier({ source: "github", signee: false, automatique: false });
    // Windows : l'installateur de la mise à jour précédente, s'il en reste un (il ne s'efface pas lui-même).
    if (process.platform === "win32") setTimeout(() => nettoyerInstallateur(), PREMIERE_VERIFICATION_MS).unref?.();
    setTimeout(() => void verifier(), PREMIERE_VERIFICATION_MS).unref?.();
    minuterie = setInterval(() => void verifier(), INTERVALLE_MS);
    minuterie.unref?.();
    return true;
  };

  /*
   * Windows et Linux (audit du 27/09/2026) : l'instance ne sert que
   * l'application macOS. Un poste rattaché suit son prestataire, à la main ;
   * un poste installé seul voit la nouvelle version annoncée par GitHub :
   * sous Windows, installée d'un clic si l'installateur est signé par
   * l'éditeur (27/09/2026, `installerWindows`) ; sous Linux, son paquet à
   * télécharger (un .deb demande les droits d'administrateur).
   */
  if (process.platform !== "darwin") {
    if (sourceInstance() || !brancherGithub()) publier({ phase: "non-configuree", message: null });
    return;
  }

  // Le serveur de l'agence s'il a été inscrit dans le paquet, sinon l'instance du poste, sinon GitHub.
  let flux = lireAdresseFlux();
  let source = flux ? "agence" : null;
  if (!flux) {
    const instance = sourceInstance();
    if (instance) {
      flux = { url: instance.url };
      entetesFlux = instance.entetes;
      source = "instance";
    }
  }
  if (!flux) {
    if (!brancherGithub()) publier({ phase: "non-configuree", message: null });
    return;
  }
  publier({ source });
  if (flux.refusee) {
    publier({
      phase: "non-configuree",
      message: tx("adresseRefusee", flux.refusee),
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
    publier({ unClic: !signee && (info.files ?? []).some((f) => /\.zip$/i.test(f.url)) });
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
  if (!zip || !zip.sha512) throw new Error(tx("sansArchive"));
  const url = new URL(zip.url, adresseFlux).toString();
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "helix-maj-"));
  const fichier = path.join(dossier, "maj.zip");
  publier({ phase: "telechargement", pourcent: 0, message: null });
  const reponse = await net.fetch(url, { headers: entetesFlux });
  if (!reponse.ok || !reponse.body) throw new Error(tx("sourceRepond", reponse.status));
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
  if (hash.digest("base64") !== zip.sha512) throw new Error(tx("empreinte"));
  const extrait = path.join(dossier, "extrait");
  fs.mkdirSync(extrait);
  await new Promise((resolve, reject) => execFile("/usr/bin/ditto", ["-x", "-k", fichier, extrait], (err) => (err ? reject(err) : resolve())));
  const nomApp = fs.readdirSync(extrait).find((n) => n.endsWith(".app"));
  if (!nomApp) throw new Error(tx("pasDApplication"));
  const nouvelle = path.join(extrait, nomApp);
  const actuelle = path.resolve(path.dirname(process.execPath), "..", "..");
  const lirePlist = (appli, cle) =>
    new Promise((resolve) =>
      execFile("/usr/bin/plutil", ["-extract", cle, "raw", path.join(appli, "Contents", "Info.plist")], (err, out) => resolve(err ? "" : String(out).trim())),
    );
  if ((await lirePlist(nouvelle, "CFBundleIdentifier")) !== (await lirePlist(actuelle, "CFBundleIdentifier"))) {
    throw new Error(tx("autreApplication"));
  }
  const identifiant = await lirePlist(actuelle, "CFBundleIdentifier");
  if ((await lirePlist(nouvelle, "CFBundleShortVersionString")) !== annonce.version) throw new Error(tx("autreVersion"));
  /*
   * La signature de l'éditeur (electron/signatureEditeur.cjs, 27/09/2026).
   * L'empreinte ci-dessus vient de la même source que l'archive : elle dit
   * que rien ne s'est abîmé en route, pas qui l'a faite. La clé qui tranche
   * est celle de l'application qui tourne ici, jamais celle qu'apporte la
   * nouvelle. Sans clé, ou si la signature ne va pas : rien ne s'installe.
   */
  const cle = signatureEditeur.cleDeLApplication(actuelle);
  if (!cle) throw new Error(tx("sansCle"));
  publier({ message: tx("verificationSignature") });
  const verdict = await signatureEditeur.verifierApplication(nouvelle, cle, { identifiant, version: annonce.version });
  if (!verdict.ok) throw new Error(tx("refusee", raison(verdict.raison)));
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
  publier({ phase: "prete", pourcent: 100, message: tx("fermetureRelance") });
  spawn("/bin/sh", [script], { detached: true, stdio: "ignore" }).unref();
  setTimeout(() => app.quit(), 800);
}

/** Efface le dossier de l'installateur Windows ; un fichier encore tenu (installateur en cours, antivirus) attendra la fois suivante. */
function nettoyerInstallateur() {
  try {
    fs.rmSync(dossierInstallateur(), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* tenu : la prochaine fois */
  }
}

/**
 * Renomme, en réessayant sous Windows : un antivirus tient un fichier neuf un
 * instant pour l'analyser (EPERM, EACCES, EBUSY). Même règle que `renommer`
 * dans gateway/src/processus.ts, que ce processus ne peut pas importer.
 */
async function renommerAvecReprise(de, vers) {
  for (let essai = 0; ; essai++) {
    try {
      fs.renameSync(de, vers);
      return;
    } catch (err) {
      const code = err && err.code;
      if (process.platform !== "win32" || essai >= 20 || (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")) throw err;
      await new Promise((r) => setTimeout(r, 100 * Math.min(essai + 1, 10)));
    }
  }
}

/** SHA-512 (base64) d'un fichier sur le disque, lu par morceaux. */
function empreinteSurLeDisque(chemin) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha512");
    fs.createReadStream(chemin)
      .on("data", (m) => h.update(m))
      .on("error", reject)
      .on("end", () => resolve(h.digest("base64")));
  });
}

/**
 * Windows (27/09/2026) : installe la version annoncée par GitHub, d'un clic.
 *
 * L'installateur NSIS décrit par le manifeste est téléchargé dans le dossier de
 * Helix (`userData\mise-a-jour`, jamais le dossier d'installation : NSIS y
 * arrête tout ce qui tourne), plafonné à la taille annoncée ; puis son
 * empreinte SHA-512 et la signature de l'éditeur sont vérifiées, avec la clé
 * de l'application qui tourne ici. L'empreinte est relue sur le disque juste
 * avant le lancement : c'est ce fichier-là, et pas les octets reçus, qui
 * s'exécute.
 *
 * Le lancement reprend celui d'electron-updater (NsisUpdater) :
 * `--updated /S --force-run`. `/S` installe sans fenêtre, par utilisateur
 * (`nsis.oneClick`, `perMachine: false` : pas de droits d'administrateur) ;
 * `--updated` fait attendre à l'installateur que Helix se ferme (puis il
 * l'arrête s'il tourne encore) ; `--force-run` le fait relancer Helix une fois
 * l'installation faite : sans lui, un installateur « un clic » lancé avec `/S`
 * ne relance rien (modèle installSection.nsh d'electron-builder, lu le
 * 27/09/2026). Un fichier écrit par Helix lui-même ne porte pas la marque
 * « téléchargé » (Mark of the Web) : SmartScreen ne devrait pas s'interposer.
 * Pas essayé sur un vrai PC (27/09/2026), ni avec Smart App Control actif, qui
 * bloque un exécutable non signé même sans cette marque.
 */
async function installerWindows() {
  const a = annonceWindows;
  if (!a) throw new Error(tx("sansInstallateur"));
  const cle = signatureEditeur.cleDesRessources(process.resourcesPath);
  if (!cle) throw new Error(tx("sansCle"));
  const description = { identifiant: a.identifiant, version: a.version, fichier: a.fichier, sha512: a.sha512, octets: a.octets };
  const dossier = dossierInstallateur();
  nettoyerInstallateur();
  fs.mkdirSync(dossier, { recursive: true });
  const partiel = path.join(dossier, `${a.fichier}.partiel`);
  const final = path.join(dossier, a.fichier);
  publier({ phase: "telechargement", pourcent: 0, message: null });
  try {
    await telechargerInstallateur(a, cle, description, partiel, final);
  } catch (err) {
    // Rien de refusé ne reste sur le disque (tenu par l'antivirus : effacé au prochain essai).
    for (const f of [partiel, final]) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* tenu */
      }
    }
    throw err;
  }
  publier({ phase: "prete", pourcent: 100, message: tx("fermetureRelance") });
  // Sans interpréteur de commandes : le chemin (espaces, accents du nom de profil) passe tel quel.
  const enfant = spawn(final, ["--updated", "/S", "--force-run"], { cwd: dossier, detached: true, stdio: "ignore", windowsHide: true });
  await new Promise((resolve, reject) => {
    enfant.once("spawn", resolve);
    enfant.once("error", reject);
  });
  enfant.unref();
  setTimeout(() => app.quit(), 800);
}

/** Télécharge l'installateur dans `partiel`, le vérifie (taille, empreinte, signature), puis le met à sa place et en relit l'empreinte. */
async function telechargerInstallateur(a, cle, description, partiel, final) {
  const reponse = await net.fetch(a.url, { headers: { "User-Agent": "Helix" } });
  if (!reponse.ok || !reponse.body) throw new Error(tx("sourceRepond", reponse.status));
  const hash = crypto.createHash("sha512");
  const sortie = fs.createWriteStream(partiel, { flags: "wx" });
  const ecrit = new Promise((resolve, reject) => {
    sortie.on("finish", resolve);
    sortie.on("error", reject);
  });
  let recu = 0;
  const lecteur = reponse.body.getReader();
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      recu += value.length;
      // Jamais plus que la taille annoncée : une source qui n'en finit pas ne remplit pas le disque.
      if (recu > a.octets) throw new Error(tx("tailleInstallateur"));
      hash.update(value);
      if (!sortie.write(Buffer.from(value))) await new Promise((r) => sortie.once("drain", r));
      publier({ pourcent: Math.min(99, Math.round((recu / a.octets) * 100)) });
    }
  } catch (err) {
    // Fermé pour de bon avant de rendre la main : sinon le fichier s'ouvrait après avoir été effacé.
    const ferme = sortie.closed ? Promise.resolve() : new Promise((r) => sortie.once("close", r));
    sortie.destroy();
    await ferme;
    throw err;
  }
  sortie.end();
  await ecrit;
  if (recu !== a.octets) throw new Error(tx("tailleInstallateur"));
  if (hash.digest("base64") !== a.sha512) throw new Error(tx("empreinteInstallateur"));
  publier({ message: tx("verificationSignature") });
  const verdict = signatureEditeur.verifierInstallateur(cle, a.signature, description);
  if (!verdict.ok) throw new Error(tx("refusee", raison(verdict.raison)));
  await renommerAvecReprise(partiel, final);
  if ((await empreinteSurLeDisque(final)) !== a.sha512) throw new Error(tx("empreinteInstallateur"));
}

brancher();

module.exports = { demarrerMiseAJour, changerLangue };
