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
const path = require("node:path");
const { execFile } = require("node:child_process");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

/** Toutes les six heures, et une première fois peu après le lancement. */
const INTERVALLE_MS = 6 * 60 * 60 * 1000;
const PREMIERE_VERIFICATION_MS = 15 * 1000;

let updater = null;
let adresseFlux = null;
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

function brancher() {
  ipcMain.handle("helix:maj-etat", () => ({ ...etat }));
  ipcMain.handle("helix:maj-verifier", () => verifier());
  ipcMain.handle("helix:maj-installer", () => {
    // Seulement une mise à jour téléchargée, dans une application signée.
    if (!updater || etat.phase !== "prete" || !etat.automatique) return false;
    setImmediate(() => updater.quitAndInstall());
    return true;
  });
  ipcMain.handle("helix:maj-ouvrir-paquet", () => {
    // Le lien vient du flux de l'agence, jamais de la page, et reste du web :
    // un flux altéré ne doit pas pouvoir faire ouvrir un `file:` ou un `smb:`.
    if (!etat.lienPaquet || !/^https?:\/\//i.test(etat.lienPaquet)) return false;
    void shell.openExternal(etat.lienPaquet);
    return true;
  });
}

/**
 * À appeler une fois, application prête. En développement, rien n'est fait :
 * il n'y a pas de paquet à remplacer.
 */
async function demarrerMiseAJour() {
  if (!app.isPackaged) {
    publier({ phase: "inactif", message: "Pas de mise à jour en développement." });
    return;
  }

  const flux = lireAdresseFlux();
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
  updater.autoDownload = signee;
  updater.autoInstallOnAppQuit = signee;
  updater.allowPrerelease = false;
  updater.logger = null;
  publier({ signee, automatique: signee });

  updater.on("update-available", (info) => {
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

brancher();

module.exports = { demarrerMiseAJour };
