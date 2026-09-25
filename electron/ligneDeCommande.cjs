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
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
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
 */
function pathDuShell() {
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  try {
    return execFileSync(shell, ["-l", "-c", 'printf %s "$PATH"'], { encoding: "utf8", timeout: 4000 });
  } catch {
    return "";
  }
}

function etat() {
  const disponible = process.platform !== "win32" && fs.existsSync(script());
  let installe = false;
  let aJour = false;
  try {
    const actuel = fs.readFileSync(lanceur(), "utf8");
    installe = true;
    // L'application a pu être déplacée ou mise à jour ailleurs : le lanceur viserait un binaire absent.
    aJour = actuel === contenuLanceur();
  } catch {
    /* pas de lanceur */
  }
  const dansLePath = pathDuShell().split(":").includes(dossierLanceur());
  let ligneAjoutee = false;
  try {
    ligneAjoutee = fs.readFileSync(profil(), "utf8").includes(MARQUE);
  } catch {
    /* pas de profil */
  }
  return {
    disponible,
    installe,
    aJour,
    dansLePath: dansLePath || ligneAjoutee,
    chemin: lanceur(),
    profil: profil(),
    ligneAjoutee,
  };
}

function installer() {
  if (process.platform === "win32") throw new Error("Windows n'est pas encore pris en charge.");
  if (!fs.existsSync(script())) throw new Error("La ligne de commande est absente de ce paquet.");
  fs.mkdirSync(dossierLanceur(), { recursive: true });
  const tmp = `${lanceur()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contenuLanceur(), { mode: 0o755 });
  fs.renameSync(tmp, lanceur());
  if (!pathDuShell().split(":").includes(dossierLanceur())) {
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

function retirer() {
  try {
    const actuel = fs.readFileSync(lanceur(), "utf8");
    // On ne retire qu'un lanceur posé par l'application, jamais un autre programme nommé helix.
    if (actuel.includes("posé par l'application")) fs.rmSync(lanceur(), { force: true });
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
