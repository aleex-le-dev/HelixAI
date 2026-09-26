/**
 * La ligne de commande `helix` (cli/helix.mjs), livrée avec l'application.
 *
 * Elle n'était pas dans le paquet : il fallait le dépôt et un Node installé.
 * Le paquet l'embarque maintenant (extraResources, `Resources/cli`), et un
 * bouton des Paramètres pose un petit lanceur dans `~/.local/bin/helix`. Le
 * lanceur fait tourner le script avec le binaire de l'application en mode Node
 * (ELECTRON_RUN_AS_NODE, comme la passerelle) : le poste n'a pas besoin de
 * Node.
 *
 * Aucun droit d'administrateur : rien n'est écrit hors du dossier personnel.
 * Si `~/.local/bin` n'est pas dans le PATH du shell de connexion, une ligne
 * marquée est ajoutée à `~/.zprofile` (macOS) ou `~/.profile` (Linux) ; le
 * bouton « Retirer » enlève le lanceur et cette ligne, et rien d'autre.
 *
 * Windows : pas encore fait (il faudrait un .cmd et le PATH du registre).
 * Linux en AppImage : non plus (audit du 27/09/2026). L'application y tourne
 * depuis un dossier monté à un nouvel endroit à chaque lancement
 * (`/tmp/.mount_…`) : le lanceur aurait visé un chemin disparu au redémarrage
 * suivant. Le paquet .deb, installé à une place fixe, l'a.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { app } = require("electron");

const MARQUE = "# Ajouté par HelixAI (ligne de commande helix)";
const dossierLanceur = () => path.join(os.homedir(), ".local", "bin");
const lanceur = () => path.join(dossierLanceur(), "helix");
const profil = () => path.join(os.homedir(), process.platform === "darwin" ? ".zprofile" : ".profile");

/** Le script livré : dans le paquet, ou dans le dépôt en développement. */
function script() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "cli", "helix.mjs")
    : path.join(__dirname, "..", "cli", "helix.mjs");
}

const guillemets = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function contenuLanceur() {
  return [
    "#!/bin/sh",
    "# Lanceur de la ligne de commande helix, posé par l'application (Paramètres).",
    `ELECTRON_RUN_AS_NODE=1 exec ${guillemets(process.execPath)} ${guillemets(script())} "$@"`,
    "",
  ].join("\n");
}

/**
 * Le PATH du shell de connexion. Une application lancée depuis le Finder n'a
 * pas celui du terminal : on le demande au shell de la personne.
 *
 * Asynchrone, et gardé cinq minutes : revue du 26/09/2026, l'appel synchrone
 * gelait le processus principal jusqu'à 4 s à chaque ouverture de l'onglet, et
 * relançait .zprofile / .zlogin à chaque fois.
 */
let pathGarde = null;
function pathDuShell() {
  if (pathGarde && Date.now() - pathGarde.le < 5 * 60_000) return Promise.resolve(pathGarde.valeur);
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  return new Promise((resolve) => {
    execFile(shell, ["-l", "-c", 'printf %s "$PATH"'], { encoding: "utf8", timeout: 4000 }, (err, sortie) => {
      const valeur = err ? "" : String(sortie);
      pathGarde = { le: Date.now(), valeur };
      resolve(valeur);
    });
  });
}

/** Le lanceur posé par l'application porte cette phrase ; un autre programme nommé helix, non. */
const estLeNotre = (contenu) => contenu.includes("posé par l'application");

/** Pourquoi la commande n'est pas proposée ici, ou null. */
const empechement = () => (process.platform === "win32" ? "windows" : process.env.APPIMAGE ? "appimage" : null);

async function etat() {
  const disponible = empechement() === null && fs.existsSync(script());
  let installe = false;
  let aJour = false;
  // Un fichier ~/.local/bin/helix qui n'est pas le nôtre : on ne le remplace pas (revue du 26/09/2026).
  let etranger = false;
  try {
    const actuel = fs.readFileSync(lanceur(), "utf8");
    etranger = !estLeNotre(actuel);
    installe = !etranger;
    // L'application a pu être déplacée ou mise à jour ailleurs : le lanceur viserait un binaire absent.
    aJour = installe && actuel === contenuLanceur();
  } catch {
    etranger = fs.existsSync(lanceur());
  }
  const dansLePath = (await pathDuShell()).split(":").includes(dossierLanceur());
  let ligneAjoutee = false;
  try {
    ligneAjoutee = fs.readFileSync(profil(), "utf8").includes(MARQUE);
  } catch {
    /* pas de profil */
  }
  return {
    disponible,
    empechement: empechement(),
    installe,
    aJour,
    etranger,
    dansLePath: dansLePath || ligneAjoutee,
    chemin: lanceur(),
    profil: profil(),
    ligneAjoutee,
  };
}

async function installer() {
  if (empechement()) throw new Error(empechement() === "appimage" ? "Pas avec l'AppImage : installez le paquet .deb." : "Windows n'est pas encore pris en charge.");
  if (!fs.existsSync(script())) throw new Error("La ligne de commande est absente de ce paquet.");
  if (fs.existsSync(lanceur())) {
    let actuel = "";
    try {
      actuel = fs.readFileSync(lanceur(), "utf8");
    } catch {
      /* illisible : traité comme étranger */
    }
    if (!estLeNotre(actuel)) return etat();
  }
  fs.mkdirSync(dossierLanceur(), { recursive: true });
  const tmp = `${lanceur()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contenuLanceur(), { mode: 0o755 });
  fs.renameSync(tmp, lanceur());
  if (!(await pathDuShell()).split(":").includes(dossierLanceur())) {
    let actuel = "";
    try {
      actuel = fs.readFileSync(profil(), "utf8");
    } catch {
      /* profil absent : il sera créé */
    }
    if (!actuel.includes(MARQUE)) {
      const ajout = `${actuel && !actuel.endsWith("\n") ? "\n" : ""}\n${MARQUE}\nexport PATH="$HOME/.local/bin:$PATH"\n`;
      fs.appendFileSync(profil(), ajout);
    }
  }
  return etat();
}

async function retirer() {
  try {
    const actuel = fs.readFileSync(lanceur(), "utf8");
    // On ne retire qu'un lanceur posé par l'application, jamais un autre programme nommé helix.
    if (estLeNotre(actuel)) fs.rmSync(lanceur(), { force: true });
  } catch {
    /* déjà absent */
  }
  try {
    const actuel = fs.readFileSync(profil(), "utf8");
    if (actuel.includes(MARQUE)) {
      const nettoye = actuel.replace(new RegExp(`\\n${MARQUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\nexport PATH="\\$HOME/\\.local/bin:\\$PATH"\\n`), "");
      fs.writeFileSync(profil(), nettoye);
    }
  } catch {
    /* pas de profil */
  }
  return etat();
}

module.exports = { etat, installer, retirer };
