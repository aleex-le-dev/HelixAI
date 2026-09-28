import { posix, win32 } from "node:path";
import { t, tf } from "./langue.ts";

/**
 * Ce qui change d'un système à l'autre pour l'OpenClaw de Helix : l'archive
 * de Node, la disposition des fichiers qu'elle pose, la façon de lancer
 * OpenClaw, le PATH, l'arrêt d'un arbre de processus.
 *
 * Pourquoi un module à part (28/09/2026) : sous Windows, Helix refusait
 * OpenClaw (« OpenClaw demande WSL »). La documentation d'OpenClaw, relue ce
 * jour-là (docs.openclaw.ai/platforms/windows), dit le contraire : « OpenClaw
 * ships a native Windows Hub companion app plus Windows CLI support », WSL2
 * seulement recommandé. Installer WSL pour la personne n'était pas possible
 * (droits d'administrateur, redémarrage) : Helix pose donc un OpenClaw natif,
 * comme sur macOS et Linux. Aucune de ces fonctions ne lit `process.platform` :
 * le système leur est passé, pour qu'un Mac puisse les essayer telles que
 * Windows les verra (scripts/essai-openclaw-windows.mjs, avec `path.win32`).
 *
 * Ce qu'on sait de Windows natif, lu dans le paquet `openclaw@2026.9.4`
 * (28/09/2026), et qui décide de ce qui suit :
 *  - le lanceur est `openclaw.mjs` (champ `bin`), lancé par Node. npm pose à
 *    côté un `openclaw.cmd`, qu'on ne lance pas : Node refuse d'exécuter un
 *    `.cmd` sans passer par `cmd.exe` (CVE-2024-27980), et `cmd.exe` couperait
 *    les chemins qui ont des espaces ou des accents. Helix lance donc
 *    `node.exe openclaw.mjs …` lui-même, sans interpréteur de commandes ;
 *  - ses commandes (`exec`, palier Libre) passent par PowerShell sous Windows
 *    (`getShellConfig` : PowerShell 7 s'il est là, sinon Windows PowerShell
 *    5.1), pas par un shell Unix ;
 *  - ses modules natifs ont leur version Windows x64 et arm64 (koffi,
 *    node-pty) ; `sqlite-vec` n'a pas d'arm64 sous Windows, mais il ne sert
 *    qu'aux embeddings de la mémoire, que Helix ne règle pas (la recherche se
 *    fait par mots, partout) ;
 *  - les messageries que Helix propose sont en JavaScript ou en WebAssembly
 *    (Baileys et whatsapp-rust-bridge, grammY, discord.js et libopus-wasm,
 *    Bolt) : rien à compiler.
 */

export interface Machine {
  platform: NodeJS.Platform;
  arch: string;
  /** `os.release()` : la version du noyau (Darwin 22.6 pour macOS 13.5). */
  release: string;
}

/** Variables d'environnement, telles que `process.env` ou une copie. */
export type Env = Record<string, string | undefined>;

const chemins = (p: NodeJS.Platform) => (p === "win32" ? win32 : posix);
const separateur = (p: NodeJS.Platform) => (p === "win32" ? ";" : ":");

/**
 * Une variable, lue comme le système la lit : sous Windows, les noms ne
 * tiennent pas compte de la casse (`Path`, `SystemRoot`), et une copie de
 * `process.env` n'est plus qu'un objet ordinaire, qui en tient compte.
 */
export function lireVariable(env: Env, nom: string, p: NodeJS.Platform): string | undefined {
  if (p !== "win32") return env[nom];
  const bas = nom.toLowerCase();
  for (const [k, v] of Object.entries(env)) if (k.toLowerCase() === bas && v !== undefined) return v;
  return undefined;
}

/** Retire une variable sous tous ses noms (sous Windows, `Path` et `PATH` sont la même). */
export function retirerVariable(env: Env, nom: string, p: NodeJS.Platform): void {
  for (const k of Object.keys(env)) if (p === "win32" ? k.toLowerCase() === nom.toLowerCase() : k === nom) delete env[k];
}

/**
 * Pose le PATH. Sous Windows, un `{ ...process.env, PATH }` gardait aussi le
 * `Path` d'origine : deux variables pour une, et le processus lancé lisait
 * l'une ou l'autre selon l'ordre du bloc d'environnement.
 */
export function poserPath(env: Env, valeur: string, p: NodeJS.Platform): Env {
  retirerVariable(env, "PATH", p);
  env.PATH = valeur;
  return env;
}

/** Des dossiers, en un PATH : `;` sous Windows, `:` ailleurs ; vides et doublons retirés. */
export function joindrePath(dossiers: (string | undefined | null)[], p: NodeJS.Platform): string {
  const vus = new Set<string>();
  const garde: string[] = [];
  for (const d of dossiers.flatMap((x) => (x ? x.split(separateur(p)) : []))) {
    const propre = d.trim();
    const cle = p === "win32" ? propre.toLowerCase() : propre;
    if (!propre || vus.has(cle)) continue;
    vus.add(cle);
    garde.push(propre);
  }
  return garde.join(separateur(p));
}

/** Le dossier du système (`C:\Windows`), tel que Windows le déclare. */
const racineWindows = (env: Env) => lireVariable(env, "SystemRoot", "win32") ?? lireVariable(env, "windir", "win32") ?? "C:\\Windows";

/**
 * Le PATH minimal du système : ce qu'un npm ou un OpenClaw lancé avec un
 * environnement réduit doit encore trouver. Sous Windows, `System32` (où
 * sont `cmd.exe`, qui fait tourner les scripts d'installation de npm, et
 * `taskkill.exe`) et Windows PowerShell (les commandes d'un employé Libre).
 */
export function pathSysteme(p: NodeJS.Platform, env: Env): string {
  if (p !== "win32") return "/usr/bin:/bin:/usr/sbin:/sbin";
  const w = win32;
  const r = racineWindows(env);
  return joindrePath([w.join(r, "System32"), r, w.join(r, "System32", "Wbem"), w.join(r, "System32", "WindowsPowerShell", "v1.0")], "win32");
}

/**
 * Ne garde que les variables nommées (et celles qui commencent par l'un des
 * préfixes). Sous Windows, sans tenir compte de la casse : `ComSpec`,
 * `SYSTEMROOT` ou `Temp` varient d'une machine à l'autre, et une variable
 * écartée pour une majuscule empêchait un processus de démarrer.
 */
export function garderVariables(source: Env, noms: readonly string[], prefixes: readonly string[], p: NodeJS.Platform): Env {
  const env: Env = {};
  const plier = (s: string) => (p === "win32" ? s.toLowerCase() : s);
  const admis = new Set(noms.map(plier));
  const prefixesPlies = prefixes.map(plier);
  for (const [nom, valeur] of Object.entries(source)) {
    if (valeur === undefined) continue;
    const n = plier(nom);
    if (admis.has(n) || prefixesPlies.some((x) => n.startsWith(x))) env[nom] = valeur;
  }
  return env;
}

/* ---- Archive officielle de Node ---------------------------------------- */

export type ArchiveNode = { dossier: string; cleIndex: string; extension: ".tar.gz" | ".zip" };

/**
 * L'archive de Node pour cette machine, ou la raison pour laquelle il n'y en
 * a pas. La même pour OpenClaw et pour l'atelier : depuis le 28/09/2026,
 * OpenClaw s'installe aussi sous Windows (x64 et arm64), avec l'archive
 * `.zip` officielle.
 */
export function archiveNode(m: Machine): ArchiveNode | { erreur: string } {
  const a = m.arch === "arm64" ? "arm64" : m.arch === "x64" ? "x64" : null;
  if (!a) return { erreur: tf("Processeur non pris en charge ({0}).", m.arch) };
  if (m.platform === "win32") return { dossier: `win-${a}`, cleIndex: `win-${a}-zip`, extension: ".zip" };
  if (m.platform === "darwin") {
    // Node 24 exige macOS 13.5 ou plus récent (Darwin 22.6).
    const [maj = 0, min = 0] = m.release.split(".").map(Number);
    if (maj < 22 || (maj === 22 && min < 6)) {
      return { erreur: t("OpenClaw demande macOS 13.5 ou plus récent sur cette machine.") };
    }
    return { dossier: `darwin-${a}`, cleIndex: `osx-${a}-tar`, extension: ".tar.gz" };
  }
  if (m.platform === "linux") return { dossier: `linux-${a}`, cleIndex: `linux-${a}`, extension: ".tar.gz" };
  return { erreur: t("L'installation automatique d'OpenClaw existe pour macOS, Windows et Linux, pas pour ce système.") };
}

/**
 * L'extraction de l'archive : le `tar` du système. Sous Windows, celui de
 * Windows (`System32\tar.exe`, bsdtar, livré depuis Windows 10 1803), qui
 * ouvre aussi les `.zip` ; celui de Git, s'il passe avant dans le PATH, ne
 * sait pas lire `C:`.
 */
export function commandeExtraction(archive: string, destination: string, extension: ArchiveNode["extension"], p: NodeJS.Platform, env: Env): { fichier: string; args: string[] } {
  const tar = p === "win32" ? win32.join(racineWindows(env), "System32", "tar.exe") : "/usr/bin/tar";
  return { fichier: tar, args: [extension === ".zip" ? "-xf" : "-xzf", archive, "-C", destination] };
}

/* ---- Ce que l'archive pose ----------------------------------------------- */

export interface DispositionNode {
  /** L'exécutable de Node. */
  node: string;
  /** Le script de npm, lancé par ce Node (jamais `npm.cmd` ni `bin/npm`, qui passe par `env node`). */
  npmCli: string;
  npxCli: string;
  /** Le dossier à mettre en tête du PATH pour que les programmes lancés trouvent `node`. */
  dossierBin: string;
  /** Les paquets installés en global par ce npm (`-g --prefix <dossier>`). */
  paquets: string;
  /** Le lanceur que npm pose pour la commande `openclaw`. */
  lanceurOpenClaw: string;
}

/**
 * Disposition d'un Node officiel dans `dossier`, qui sert aussi de préfixe
 * global à son npm. Windows : tout à la racine (`node.exe`, `openclaw.cmd`,
 * `node_modules\`) ; ailleurs, `bin/` et `lib/node_modules/`. Relevé dans
 * l'archive `node-v24.21.0-win-x64.zip` le 28/09/2026 (son `.npmrc` intégré
 * est vide : aucun préfixe imposé, npm prend le dossier de `node.exe`).
 */
export function dispositionNode(dossier: string, p: NodeJS.Platform): DispositionNode {
  const c = chemins(p);
  if (p === "win32") {
    const paquets = c.join(dossier, "node_modules");
    return {
      node: c.join(dossier, "node.exe"),
      npmCli: c.join(paquets, "npm", "bin", "npm-cli.js"),
      npxCli: c.join(paquets, "npm", "bin", "npx-cli.js"),
      dossierBin: dossier,
      paquets,
      lanceurOpenClaw: c.join(dossier, "openclaw.cmd"),
    };
  }
  const paquets = c.join(dossier, "lib", "node_modules");
  return {
    node: c.join(dossier, "bin", "node"),
    npmCli: c.join(paquets, "npm", "bin", "npm-cli.js"),
    npxCli: c.join(paquets, "npm", "bin", "npx-cli.js"),
    dossierBin: c.join(dossier, "bin"),
    paquets,
    lanceurOpenClaw: c.join(dossier, "bin", "openclaw"),
  };
}

/**
 * L'environnement de l'installation par npm : celui de la passerelle, moins
 * ce qui la regarde (`HELIX_*`, `ELECTRON_*`) et ce qui réglerait npm à notre
 * insu (`npm_config_prefix`, un registre…), sans tenir compte de la casse
 * (npm lit `NPM_CONFIG_PREFIX` comme `npm_config_prefix`). PATH : le Node
 * privé, puis le minimum du système.
 */
export function envInstallation(source: Env, dossierBin: string, p: NodeJS.Platform): Env {
  const env: Env = { ...source };
  for (const k of Object.keys(env)) if (/^(helix_|electron_|npm_)/i.test(k)) delete env[k];
  return poserPath(env, joindrePath([dossierBin, pathSysteme(p, source)], p), p);
}

/** Les arguments de `npm install` pour OpenClaw : préfixe explicite, pour qu'aucun `.npmrc` de la personne ne l'envoie ailleurs. */
export function argumentsInstallation(version: string, prefixe: string, options: { avant?: string; scriptsApprouves: boolean }): string[] {
  const args = ["install", "-g", "--prefix", prefixe, `openclaw@${version}`, "--no-fund", "--no-audit", "--loglevel=error"];
  if (options.avant) args.push(`--before=${options.avant}`);
  // npm 11.16 et suivants bloquent les scripts d'installation non approuvés : on n'approuve qu'OpenClaw.
  if (options.scriptsApprouves) args.push("--allow-scripts=openclaw");
  return args;
}

/* ---- Trouver et lancer OpenClaw ------------------------------------------ */

/**
 * Où chercher un OpenClaw : celui imposé par le profil, celui de Helix, puis
 * ceux du PATH et des emplacements usuels. Sous Windows, le lanceur de npm
 * (`openclaw.cmd`) : dans le PATH, et dans le préfixe global par défaut de
 * npm (`%APPDATA%\npm`), qu'une application ouverte depuis le menu Démarrer
 * n'a pas toujours dans son PATH.
 */
export function candidatsOpenClaw(o: {
  platform: NodeJS.Platform;
  env: Env;
  maison: string;
  impose?: string;
  gere: string;
  /** Versions de Node posées par nvm (macOS, Linux). */
  versionsNvm: () => string[];
}): string[] {
  const c = chemins(o.platform);
  const liste: string[] = [];
  if (o.impose) liste.push(o.impose);
  // Celui qu'Helix a installé passe avant tout autre : c'est la version éprouvée.
  liste.push(o.gere);
  const dossiersPath = (lireVariable(o.env, "PATH", o.platform) ?? "")
    .split(separateur(o.platform))
    // Windows : un dossier du PATH peut être écrit entre guillemets.
    .map((d) => d.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
  if (o.platform === "win32") {
    for (const d of dossiersPath) liste.push(c.join(d, "openclaw.cmd"));
    const appdata = lireVariable(o.env, "APPDATA", "win32");
    if (appdata) liste.push(c.join(appdata, "npm", "openclaw.cmd"));
  } else {
    for (const d of dossiersPath) liste.push(c.join(d, "openclaw"));
    // L'application lancée depuis le Finder n'hérite pas du PATH du terminal.
    const nvm = c.join(o.maison, ".nvm", "versions", "node");
    for (const v of o.versionsNvm()) liste.push(c.join(nvm, v, "bin", "openclaw"));
    liste.push("/opt/homebrew/bin/openclaw", "/usr/local/bin/openclaw", c.join(o.maison, ".local", "bin", "openclaw"));
  }
  const vus = new Set<string>();
  return liste.filter((x) => {
    const cle = o.platform === "win32" ? x.toLowerCase() : x;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

/** Un programme dans le PATH, par son nom (Windows : avec `.exe`), hors des alias du Microsoft Store. */
export function chercherDansPath(nom: string, env: Env, p: NodeJS.Platform, existe: (f: string) => boolean): string | null {
  const c = chemins(p);
  const noms = p === "win32" && !c.extname(nom) ? [`${nom}.exe`] : [nom];
  for (const brut of (lireVariable(env, "PATH", p) ?? "").split(separateur(p))) {
    const d = brut.trim().replace(/^"(.*)"$/, "$1");
    if (!d) continue;
    // `WindowsApps\node.exe` n'est pas Node : c'est un raccourci qui ouvre le Store.
    if (p === "win32" && /[\\/]WindowsApps[\\/]?$/i.test(d)) continue;
    for (const n of noms) if (existe(c.join(d, n))) return c.join(d, n);
  }
  return null;
}

/**
 * Windows : le paquet derrière un lanceur de npm (`openclaw.cmd`, `.ps1`,
 * `.bat` ou sans extension), dans `node_modules\openclaw` à côté. Null
 * ailleurs, et pour un script : sur macOS et Linux, le paquet se trouve en
 * suivant le lien.
 */
export function paquetDerriereLanceur(bin: string, p: NodeJS.Platform): string | null {
  if (p !== "win32") return null;
  const c = chemins(p);
  return ["", ".cmd", ".bat", ".ps1"].includes(c.extname(bin).toLowerCase()) ? c.join(c.dirname(bin), "node_modules", "openclaw") : null;
}

export interface Lancement {
  /** Le programme à lancer. */
  fichier: string;
  /** Ce qui précède les arguments d'OpenClaw (sous Windows, le script `openclaw.mjs`). */
  prefixe: string[];
  /** Le Node qui fait tourner cet OpenClaw (pour lire sa version, ouvrir sa base). */
  node: string;
  /** Le dossier du paquet, quand on le connaît sans suivre de lien (Windows). */
  paquet: string | null;
}

/**
 * Comment lancer un OpenClaw trouvé à `bin`, ou `null` s'il ne se lance pas
 * d'ici.
 *
 *  - macOS, Linux : `bin` lui-même (le lien que npm pose vers `openclaw.mjs`,
 *    qui passe par `env node`) ; le Node est celui posé à côté, sinon celui du
 *    PATH.
 *  - Windows : jamais le `.cmd` (voir l'en-tête). Derrière un lanceur de npm
 *    (`openclaw.cmd`, `openclaw.ps1`, ou `openclaw` sans extension), le paquet
 *    est dans `node_modules\openclaw` à côté ; derrière un script (`.mjs`,
 *    `.js`), c'est lui. Le Node : `node.exe` à côté du lanceur (le Node privé
 *    de Helix, ou un Node installé sans préfixe à part), sinon celui du PATH,
 *    comme le fait le `.cmd` de npm lui-même.
 */
export function lancementOpenClaw(bin: string, p: NodeJS.Platform, existe: (f: string) => boolean, nodeDuPath: () => string | null, entree = "openclaw.mjs"): Lancement | null {
  const c = chemins(p);
  if (p !== "win32") {
    const voisin = c.join(c.dirname(bin), "node");
    return { fichier: bin, prefixe: [], node: existe(voisin) ? voisin : "node", paquet: null };
  }
  const ext = c.extname(bin).toLowerCase();
  const paquet = paquetDerriereLanceur(bin, p);
  let script: string;
  if ([".mjs", ".js", ".cjs"].includes(ext)) script = bin;
  else if (paquet) script = c.join(paquet, entree);
  else return null;
  if (!existe(script)) return null;
  const voisin = c.join(c.dirname(bin), "node.exe");
  const node = existe(voisin) ? voisin : nodeDuPath();
  if (!node) return null;
  return { fichier: node, prefixe: [script], node, paquet };
}

/**
 * Les dossiers à mettre en tête du PATH d'OpenClaw : celui de son Node (qu'il
 * relance pour ses propres sous-processus, et où il trouve npm pour ses
 * extensions), puis celui de son lanceur.
 */
export function dossiersDuLancement(bin: string, l: Lancement, p: NodeJS.Platform): string[] {
  const c = chemins(p);
  if (p !== "win32") return [c.dirname(bin)];
  return [c.isAbsolute(l.node) ? c.dirname(l.node) : null, c.dirname(bin)].filter((d): d is string => Boolean(d));
}

/* ---- Processus -------------------------------------------------------------- */

/**
 * Lire la ligne de commande d'un processus par son numéro, pour ne jamais
 * arrêter un programme qu'on n'a pas lancé (un numéro se réutilise).
 *
 * Windows n'a pas de `ps` : PowerShell (CIM, `Win32_Process`), présent sur
 * toute machine Windows 10 et 11. `wmic`, l'ancienne voie, est retiré de
 * Windows 11 24H2. Le script passe encodé (`-EncodedCommand`, UTF-16LE en
 * base64) : aucun guillemet à échapper, et il ne porte qu'un nombre entier.
 */
export function commandeLigneDeProcessus(pid: number, p: NodeJS.Platform, env: Env): { fichier: string; args: string[] } {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("numéro de processus invalide");
  if (p !== "win32") return { fichier: "/bin/ps", args: ["-p", String(pid), "-o", "command="] };
  const script = `$p = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}'; if ($p) { [Console]::Out.Write($p.CommandLine) }`;
  return {
    fichier: win32.join(racineWindows(env), "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
  };
}

/**
 * Cette ligne de commande est-elle celle d'une passerelle OpenClaw ? macOS et
 * Linux : OpenClaw se renomme « openclaw-gateway », sa ligne ne porte plus ses
 * arguments ; Windows ne renomme pas un processus, la ligne reste
 * `node.exe …\openclaw.mjs gateway run --port …`.
 */
export function estPasserelleOpenClaw(ligne: string, p: NodeJS.Platform, port?: number): boolean {
  if (p !== "win32") return ligne.includes("openclaw");
  if (!/openclaw/i.test(ligne) || !/\bgateway\b/i.test(ligne)) return false;
  /*
   * Et sur le port de Helix, quand on le connaît (test d'intrusion du
   * 28/09/2026, SECURITE.md § 58) : l'OpenClaw personnel de la personne
   * (`gateway run --port 18789`) a la même ligne, et un numéro de processus
   * noté par Helix, puis réutilisé par lui après un redémarrage, l'aurait fait
   * arrêter. Sous Windows la ligne garde ses arguments : on peut le distinguer.
   */
  return port === undefined || new RegExp(`--port[=\\s]+"?${port}"?(\\s|$)`).test(ligne);
}

/**
 * Arrêter un processus et tout ce qu'il a lancé, sous Windows : `taskkill`
 * par son numéro (`/PID`, jamais `/IM` par le nom : ce serait tous les
 * `node.exe` de la machine, l'OpenClaw personnel compris), `/T` pour l'arbre
 * (le lanceur d'OpenClaw relance Node pour lui-même), `/F` parce qu'une
 * application console sans fenêtre n'a pas d'autre arrêt. C'est ce que fait
 * OpenClaw lui-même quand on arrête sa tâche planifiée (« terminates the
 * Gateway and its descendants »). Par son chemin dans `System32`, pas par le
 * PATH.
 */
export function commandeArretArbre(pid: number, env: Env): { fichier: string; args: string[] } {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("numéro de processus invalide");
  return { fichier: win32.join(racineWindows(env), "System32", "taskkill.exe"), args: ["/PID", String(pid), "/T", "/F"] };
}

/**
 * Un message de npm sans les chemins de la machine : ceux d'Unix (`/Users/…`)
 * et ceux de Windows (`C:\Users\…`, `\\serveur\partage`).
 */
export function sansChemins(texte: string): string {
  return texte
    .replace(/\b[A-Za-z]:[\\/][^\s"']*/g, "…")
    .replace(/\\\\[^\s"']+/g, "…")
    .replace(/(^|[\s"'(=])\/[^\s"')]+/g, "$1…");
}
