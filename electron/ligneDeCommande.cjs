/**
 * La ligne de commande `helix` (cli/helix.mjs), livrée avec l'application.
 *
 * Elle n'était pas dans le paquet : il fallait le dépôt et un Node installé.
 * Le paquet l'embarque maintenant (extraResources, `Resources/cli`), et un
 * bouton des Paramètres pose un petit lanceur dans `~/.local/bin/helix`.
 *
 * Le lanceur fait tourner le script avec un vrai Node (28/09/2026). Il le
 * faisait avec le binaire de l'application en mode Node (ELECTRON_RUN_AS_NODE),
 * ce qui obligeait à laisser ouvert le fusible RunAsNode, par lequel
 * n'importe quel programme du poste pouvait faire tourner son code sous
 * l'identité de Helix (SECURITE.md, « RunAsNode fermé »). Dans l'ordre :
 *  1. le Node que Helix pose lui-même (gateway/src/installationOpenClaw.ts :
 *     version épinglée, empreinte vérifiée), s'il est là ;
 *  2. sinon le Node du système, s'il est en version 20 ou plus (ce que
 *     demande cli/helix.mjs) ;
 *  3. sinon le lanceur le dit, et « Mettre en place » demande à la passerelle
 *     de poser le Node de Helix (par son canal, electron/main.cjs).
 * Le choix se fait à chaque lancement, dans le lanceur : un Node installé ou
 * retiré ensuite est pris en compte sans rien refaire.
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

/*
 * `app` lu au moment de s'en servir : `contenuLanceur` et les essais
 * (scripts/securite.mjs) chargent ce fichier hors d'Electron.
 */
const app = () => require("electron").app;

const MARQUE = "# Ajouté par HelixAI (ligne de commande helix)";
/** La version de Node que demande cli/helix.mjs (fetch intégré, modules standard). */
const NODE_MINIMUM = 20;
const dossierLanceur = () => path.join(os.homedir(), ".local", "bin");
const lanceur = () => path.join(dossierLanceur(), "helix");
/*
 * Le fichier que lit vraiment le shell de connexion (revue Linux du
 * 27/09/2026) : zsh lit `~/.zprofile`, bash `~/.bash_profile` s'il existe, et
 * sinon `~/.profile`. Écrire toujours dans `~/.profile` ne servait à rien aux
 * utilisateurs de zsh.
 */
function profil() {
  const maison = os.homedir();
  if (process.platform === "darwin" || /zsh$/.test(process.env.SHELL ?? "")) return path.join(maison, ".zprofile");
  const bash = path.join(maison, ".bash_profile");
  return fs.existsSync(bash) ? bash : path.join(maison, ".profile");
}

/** Le script livré : dans le paquet, ou dans le dépôt en développement. */
function script() {
  return app().isPackaged
    ? path.join(process.resourcesPath, "cli", "helix.mjs")
    : path.join(__dirname, "..", "cli", "helix.mjs");
}

/**
 * Le Node que Helix pose : même règle que `racine()` de
 * gateway/src/installationOpenClaw.ts (la passerelle reçoit le même
 * environnement que ce processus). `node` y est un lien vers la version
 * installée : le chemin reste bon quand elle change.
 */
function nodePrive() {
  const donnees = process.env.HELIX_DATA_DIR ?? path.join(os.homedir(), ".helix", "data");
  return path.join(donnees, "openclaw-moteur", "node", "bin", "node");
}

/** Le nom affiché, dans le message du lanceur quand aucun Node ne convient. */
function nomProduit() {
  try {
    const nom = require("../package.json").nomAffiche;
    if (typeof nom === "string" && nom.trim()) return nom.trim();
  } catch {
    /* paquet sans nom affiché */
  }
  return "Helix";
}

const guillemets = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * Le lanceur. Il choisit le Node à chaque lancement (voir l'en-tête) : celui
 * de Helix, puis `node` du PATH du terminal, puis les emplacements usuels, le
 * premier en version 20 ou plus. Le message final est en français, comme toute
 * la ligne de commande (cli/textes.mjs, décision du 25/09/2026).
 */
function contenuLanceur({ script: scriptCli = script(), prive = nodePrive(), nom = nomProduit() } = {}) {
  const verifier = `process.exit(Number(process.versions.node.split(".")[0]) >= ${NODE_MINIMUM} ? 0 : 1)`;
  return [
    "#!/bin/sh",
    "# Lanceur de la ligne de commande helix, posé par l'application (Paramètres).",
    `# Node : celui que l'application pose, sinon celui du système en version ${NODE_MINIMUM} ou plus.`,
    `for NODE in ${guillemets(prive)} "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do`,
    `  [ -n "$NODE" ] && [ -x "$NODE" ] || continue`,
    `  "$NODE" -e ${guillemets(verifier)} 2>/dev/null || continue`,
    `  exec "$NODE" ${guillemets(scriptCli)} "$@"`,
    "done",
    `echo ${guillemets(`helix : Node ${NODE_MINIMUM} ou plus est introuvable sur cet ordinateur. Ouvrez ${nom}, Paramètres, Ligne de commande : « Mettre en place » pose le Node de ${nom}.`)} >&2`,
    "exit 127",
    "",
  ].join("\n");
}

/** `node --version` d'un exécutable, en nombre (22 pour v22.4.1), ou 0. */
function versionNode(chemin) {
  return new Promise((resolve) => {
    execFile(chemin, ["--version"], { encoding: "utf8", timeout: 5000 }, (err, sortie) => {
      resolve(err ? 0 : Number(/^v(\d+)/.exec(String(sortie).trim())?.[1] ?? 0));
    });
  });
}

/**
 * Le Node dont se servira le lanceur, vu depuis l'application : `prive`,
 * `systeme` (dans le PATH du shell de connexion ou aux emplacements usuels),
 * ou null. Même ordre que le lanceur.
 */
async function nodeUtilisable() {
  const prive = nodePrive();
  if (fs.existsSync(prive) && (await versionNode(prive)) >= NODE_MINIMUM) return "prive";
  const dossiers = [...(await pathDuShell()).split(":").filter(Boolean), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  for (const dossier of [...new Set(dossiers)]) {
    const candidat = path.join(dossier, "node");
    if (fs.existsSync(candidat) && (await versionNode(candidat)) >= NODE_MINIMUM) return "systeme";
  }
  return null;
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
    // Le Node dont se servira le lanceur : « prive » (celui de Helix), « systeme », ou null (aucun en version 20 ou plus).
    node: disponible ? await nodeUtilisable() : null,
  };
}

/**
 * Pose le lanceur. `demanderNodePrive` (electron/main.cjs) : quand le poste
 * n'a aucun Node qui convienne, la passerelle pose celui de Helix. Le lanceur
 * est posé même si cela échoue : il le dira à chaque lancement, et l'état
 * rendu porte la raison (`erreurNode`), que l'écran affiche.
 */
async function installer({ demanderNodePrive } = {}) {
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
  let erreurNode;
  if (!(await nodeUtilisable()) && typeof demanderNodePrive === "function") {
    const r = await demanderNodePrive();
    if (!r.ok) erreurNode = r.erreur || "inconnue";
  }
  poser();
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
  return { ...(await etat()), ...(erreurNode ? { erreurNode } : {}) };
}

/** Écrit le lanceur (à côté, puis renommé). */
function poser() {
  fs.mkdirSync(dossierLanceur(), { recursive: true });
  const tmp = `${lanceur()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contenuLanceur(), { mode: 0o755 });
  fs.renameSync(tmp, lanceur());
}

/**
 * Au démarrage : un lanceur posé par une version d'avant le 28/09/2026
 * lançait le binaire de l'application avec ELECTRON_RUN_AS_NODE. Le fusible
 * RunAsNode étant fermé, il ouvrirait l'application au lieu de la ligne de
 * commande. Il est réécrit, seulement s'il est le nôtre et de cette forme
 * ancienne : rien n'est téléchargé ici, le lanceur dira s'il manque Node.
 */
function remplacerAncienLanceur() {
  if (empechement()) return false;
  try {
    const actuel = fs.readFileSync(lanceur(), "utf8");
    if (!estLeNotre(actuel) || !actuel.includes("ELECTRON_RUN_AS_NODE") || !fs.existsSync(script())) return false;
    poser();
    return true;
  } catch {
    return false;
  }
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

module.exports = { etat, installer, retirer, remplacerAncienLanceur, contenuLanceur, NODE_MINIMUM };
