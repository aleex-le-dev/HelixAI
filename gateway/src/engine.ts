import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { t, tf } from "./langue.ts";

const exec = promisify(execFile);

/**
 * Installation du moteur d'exécution des modèles.
 *
 * Helix ne sait pas faire tourner un modèle tout seul : il s'appuie sur LM
 * Studio. Demander à l'utilisateur d'aller le chercher lui-même, c'est lui
 * demander de comprendre une plomberie qui ne le regarde pas — et c'est là que
 * la plupart des installations s'arrêtent.
 *
 * Tout est donc automatique, sans clic ni fenêtre d'installation :
 *
 *  1. l'adresse et l'empreinte du paquet viennent du catalogue Homebrew, qui
 *     suit les versions officielles — rien n'est figé dans le code ;
 *  2. le paquet est téléchargé, puis **son empreinte SHA-256 est vérifiée**
 *     avant d'être ouvert : sans cette étape, un paquet altéré en chemin
 *     s'installerait sans que personne ne le voie ;
 *  3. l'image est montée, l'application copiée, l'image démontée ;
 *  4. l'outil en ligne de commande est déclaré depuis le paquet lui-même, ce
 *     qui évite d'ouvrir l'interface graphique.
 */

/** Catalogue Homebrew : source d'adresse et d'empreinte, tenue à jour en amont. */
const CATALOGUE = "https://formulae.brew.sh/api/cask/lm-studio.json";

export interface EngineProgress {
  phase: "resolution" | "telechargement" | "verification" | "installation" | "pret" | "erreur";
  message: string;
  percent?: number;
  error?: string;
}

interface Paquet {
  version: string;
  url: string;
  sha256: string;
}

/** Interroge le catalogue pour connaître la version courante et son empreinte. */
async function resoudrePaquet(): Promise<Paquet> {
  const res = await fetch(CATALOGUE, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Catalogue injoignable (HTTP ${res.status}).`);

  const data = (await res.json()) as { version?: string; url?: string; sha256?: string };
  if (!data.url || !data.sha256) {
    throw new Error("Le catalogue ne fournit ni adresse ni empreinte.");
  }
  if (!/^https:\/\/installers\.lmstudio\.ai\//.test(data.url)) {
    // Le paquet doit venir de l'éditeur, pas d'une adresse quelconque.
    throw new Error(`Adresse de téléchargement inattendue : ${data.url}`);
  }
  return { version: data.version ?? "?", url: data.url, sha256: data.sha256 };
}

/** Télécharge le paquet en calculant son empreinte au fil de l'eau (SHA-256, ou SHA-512 pour llmster). */
async function telecharger(
  paquet: Pick<Paquet, "url">,
  destination: string,
  onProgress: (p: EngineProgress) => void,
  algorithme: "sha256" | "sha512" = "sha256",
): Promise<string> {
  const res = await fetch(paquet.url, { signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (HTTP ${res.status}).`);

  const total = Number(res.headers.get("content-length") ?? 0);
  const hash = createHash(algorithme);
  let recu = 0;
  let dernierPourcent = -1;

  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on("data", (morceau: Buffer) => {
    hash.update(morceau);
    recu += morceau.length;
    if (!total) return;
    const percent = Math.floor((recu / total) * 100);
    if (percent !== dernierPourcent) {
      dernierPourcent = percent;
      onProgress({
        phase: "telechargement",
        message: tf("Téléchargement du moteur... {0} %", percent),
        percent,
      });
    }
  });

  await pipeline(source, createWriteStream(destination));
  return hash.digest("hex");
}

/**
 * Emplacements où l'application peut se trouver, du plus général au plus
 * personnel. `HELIX_APPS_DIR` permet d'installer ailleurs — utile pour vérifier
 * une installation sans toucher à celle de la machine.
 */
function emplacements(): string[] {
  const force = process.env.HELIX_APPS_DIR;
  if (force) return [force];
  return ["/Applications", join(homedir(), "Applications")];
}

/** Dossier d'applications utilisable : le dossier système, sinon celui du compte. */
async function dossierApplications(): Promise<string> {
  const [premier, ...replis] = emplacements();
  try {
    await mkdir(premier, { recursive: true });
    await access(premier, constants.W_OK);
    return premier;
  } catch {
    // Compte sans droits d'administration : on installe pour cet utilisateur.
    const perso = replis[0] ?? join(homedir(), "Applications");
    await mkdir(perso, { recursive: true });
    return perso;
  }
}

/** L'application est-elle déjà installée quelque part ? */
export async function appInstallee(): Promise<string | null> {
  if (process.platform !== "darwin") {
    const lms = lmsDeLlmster();
    return existsSync(lms) ? lms : null;
  }
  for (const base of emplacements()) {
    const chemin = join(base, "LM Studio.app");
    try {
      await access(chemin, constants.R_OK);
      return chemin;
    } catch {
      /* emplacement suivant */
    }
  }
  return null;
}

/**
 * Installe le moteur. Renvoie le chemin de l'application installée.
 *
 * Chaque étape échoue bruyamment plutôt que de continuer à moitié : une
 * installation partielle serait plus difficile à diagnostiquer qu'une absence.
 */
export async function installerMoteur(
  onProgress: (p: EngineProgress) => void,
): Promise<string> {
  const dejaLa = await appInstallee();
  if (dejaLa) return dejaLa;
  if (process.platform === "win32" || process.platform === "linux") return installerLlmster(onProgress);
  if (process.platform !== "darwin") throw new Error(t("L'installation automatique du moteur n'existe pas pour ce système."));

  onProgress({ phase: "resolution", message: t("Recherche de la dernière version...") });
  const paquet = await resoudrePaquet();

  const travail = await mkdtemp(join(tmpdir(), "helix-moteur-"));
  const image = join(travail, "moteur.dmg");
  let pointDeMontage: string | null = null;

  try {
    onProgress({ phase: "telechargement", message: t("Téléchargement du moteur..."), percent: 0 });
    const empreinte = await telecharger(paquet, image, onProgress);

    onProgress({ phase: "verification", message: t("Vérification du paquet...") });
    if (empreinte !== paquet.sha256) {
      throw new Error(
        "L'empreinte du paquet téléchargé ne correspond pas à celle publiée. " +
          "Installation interrompue.",
      );
    }

    onProgress({ phase: "installation", message: "Installation..." });

    /*
     * `-nobrowse` évite d'ouvrir une fenêtre du Finder, `-noverify` évite une
     * seconde vérification longue et redondante — on vient de contrôler
     * l'empreinte du fichier entier.
     *
     * `-plist` : la sortie tabulée est ambiguë (colonnes vides, chemins avec
     * espaces) et macOS renvoie le chemin résolu (`/private/var/...`) là où on
     * avait demandé `/var/...`. La sortie structurée lève les deux pièges.
     */
    const { stdout } = await exec(
      "hdiutil",
      ["attach", image, "-nobrowse", "-noverify", "-plist", "-mountrandom", travail],
      { timeout: 180_000 },
    );

    // Une seule clé nous intéresse : inutile de dérouler tout le plist.
    pointDeMontage =
      /<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/.exec(stdout)?.[1] ?? null;

    if (!pointDeMontage) throw new Error("L'image du moteur n'a pas pu être ouverte.");

    const destination = await dossierApplications();
    await exec(
      "cp",
      ["-R", join(pointDeMontage, "LM Studio.app"), destination],
      { timeout: 300_000 },
    );

    const app = join(destination, "LM Studio.app");

    /*
     * Déclare l'outil en ligne de commande depuis le paquet : c'est lui que la
     * passerelle utilise ensuite. Sans cela il faudrait ouvrir l'interface
     * graphique une première fois.
     */
    const cli = join(app, "Contents", "Resources", "app", ".webpack", "lms");
    try {
      await exec(cli, ["bootstrap"], { timeout: 120_000 });
    } catch {
      // Non bloquant : l'application est installée, le CLI apparaîtra au
      // premier lancement. On le signale sans faire échouer l'installation.
      console.warn("[helix] moteur installé, mais l'outil en ligne de commande n'a pas pu être déclaré.");
    }

    onProgress({ phase: "pret", message: tf("Moteur installé (version {0}).", paquet.version), percent: 100 });
    return app;
  } finally {
    if (pointDeMontage) {
      await exec("hdiutil", ["detach", pointDeMontage, "-quiet"], { timeout: 60_000 }).catch(
        () => {},
      );
    }
    await rm(travail, { recursive: true, force: true }).catch(() => {});
  }
}

/* ------------------------- Linux et Windows : llmster ------------------------- */

/*
 * Linux et Windows (27/09/2026, demandé par Medhi : « tout s'installe en
 * automatique » sur les trois systèmes). LM Studio publie pour eux un moteur
 * sans interface, llmster, avec le même outil `lms` : c'est lui que Helix
 * installe, comme le fait l'installateur officiel de l'éditeur
 * (lmstudio.ai/install.sh et install.ps1), mais sans exécuter de script
 * téléchargé :
 *
 *  1. la version courante est lue dans le script officiel (une ligne,
 *     vérifiée par une expression stricte) ;
 *  2. l'archive vient du dépôt de l'éditeur, et **son empreinte SHA-512**, que
 *     l'éditeur publie à côté, est vérifiée avant ouverture ;
 *  3. l'archive est ouverte par `tar` (celui de Windows lui-même, pas un autre
 *     trouvé dans le PATH), puis `llmster bootstrap` pose `lms` dans
 *     `~/.lmstudio/bin`, pour ce compte seulement : ni droits
 *     d'administration, ni fenêtre, ni PATH modifié.
 *
 * Limite dite : l'empreinte vient du même serveur que l'archive. Elle écarte
 * un fichier abîmé ou coupé en route, pas un serveur de l'éditeur compromis.
 * Sur macOS, l'empreinte vient d'un catalogue tiers (Homebrew). Pas encore
 * essayé sur une vraie machine Windows ni Linux.
 */

const SCRIPT_OFFICIEL = process.platform === "win32" ? "https://lmstudio.ai/install.ps1" : "https://lmstudio.ai/install.sh";
const DEPOT_LLMSTER = "https://llmster.lmstudio.ai/download";

/** Le dossier de LM Studio pour ce compte : `~/.lmstudio`, ou celui que désigne `~/.lmstudio-home-pointer`. */
export function dossierLmStudio(): string {
  try {
    const pointe = readFileSync(join(homedir(), ".lmstudio-home-pointer"), "utf8").trim();
    if (pointe) return pointe;
  } catch {
    /* pas de pointeur : l'emplacement habituel */
  }
  return join(homedir(), ".lmstudio");
}

export const lmsDeLlmster = (): string => join(dossierLmStudio(), "bin", process.platform === "win32" ? "lms.exe" : "lms");

/**
 * Le dossier temporaire interne du moteur, que llmster 0.0.25 ne crée pas
 * lui-même (essai sous Ubuntu 24.04 du 27/09/2026) : sans lui, chaque
 * chargement de modèle échouait (`ENOENT … mkdtemp .internal/temp/…`), juste
 * après une installation réussie. Créé à l'installation, et à chaque démarrage
 * du moteur pour les installations déjà faites. Sans effet s'il existe.
 */
export function preparerDossiersLlmster(): void {
  if (process.platform === "darwin") return;
  const racine = dossierLmStudio();
  if (!existsSync(racine)) return;
  try {
    mkdirSync(join(racine, ".internal", "temp"), { recursive: true });
  } catch {
    /* dossier du moteur en lecture seule : le chargement le dira */
  }
}

/** Version courante de llmster, lue dans le script officiel. */
async function versionLlmster(): Promise<string> {
  const res = await fetch(SCRIPT_OFFICIEL, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(tf("Le site de LM Studio ne répond pas (HTTP {0}).", res.status));
  const texte = await res.text();
  const version = /^\s*\$?APP_VERSION\s*=\s*["']([0-9]+\.[0-9]+\.[0-9]+-[0-9]+)["']\s*$/m.exec(texte)?.[1];
  if (!version) throw new Error(t("La version du moteur de LM Studio est introuvable dans son installateur officiel."));
  return version;
}

/** Pilote NVIDIA assez récent pour la version CUDA 12 du moteur (même seuil que l'installateur officiel : 550.54.14). */
function cuda12(): boolean {
  try {
    const brut = execFileSync("nvidia-smi", ["--query-gpu=driver_version", "--format=csv,noheader"], {
      timeout: 5000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const v = (brut.split("\n")[0] ?? "").trim().split(".").map(Number);
    const seuil = [550, 54, 14];
    for (let i = 0; i < 3; i++) {
      const x = v[i] ?? 0;
      if (!Number.isFinite(x)) return false;
      if (x !== seuil[i]) return x > seuil[i];
    }
    return true;
  } catch {
    return false;
  }
}

/** Le nom de l'archive pour ce système, comme le calcule l'installateur officiel. */
function nomLlmster(version: string): { nom: string; extension: string } {
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
  if (!arch) throw new Error(tf("Le moteur de LM Studio n'existe pas pour ce processeur ({0}).", process.arch));
  if (process.platform === "win32") return { nom: `${version}-win32-${arch}.full`, extension: ".zip" };
  return { nom: `${version}-linux-${arch}.full${arch === "x64" && cuda12() ? "+cuda12" : ""}`, extension: ".tar.gz" };
}

/*
 * Linux : le moteur a besoin de `libatomic` (et, en pratique, de `libgomp`).
 * Une installation minimale ne les a pas, et Helix ne passe pas
 * administrateur : il le dit, avec la commande à lancer.
 */
function bibliothequesManquantes(): string[] {
  if (process.platform !== "linux") return [];
  let liste = "";
  for (const ldconfig of ["ldconfig", "/sbin/ldconfig", "/usr/sbin/ldconfig"]) {
    try {
      liste = execFileSync(ldconfig, ["-p"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
      break;
    } catch {
      /* suivant */
    }
  }
  if (!liste) return [];
  return ["libatomic.so.1"].filter((b) => !liste.includes(b));
}

/** `tar` du système : sous Windows, celui de Windows (celui de Git ne sait pas lire `C:`). */
const tarDuSysteme = () =>
  process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";

async function installerLlmster(onProgress: (p: EngineProgress) => void): Promise<string> {
  const manquantes = bibliothequesManquantes();
  if (manquantes.length > 0) {
    throw new Error(
      tf(
        "Il manque au système une bibliothèque dont le moteur a besoin ({0}). Installez-la, puis réessayez : sudo apt-get install -y libatomic1 (Debian, Ubuntu), ou sudo dnf install -y libatomic (Fedora).",
        manquantes.join(", "),
      ),
    );
  }

  onProgress({ phase: "resolution", message: t("Recherche de la dernière version...") });
  const version = await versionLlmster();
  const { nom, extension } = nomLlmster(version);

  // L'empreinte publiée par l'éditeur : `<archive>.sha512`, sinon `<nom>.sha512` (les deux formes de son installateur).
  let attendue: string | null = null;
  for (const fichier of [`${nom}${extension}.sha512`, `${nom}.sha512`]) {
    try {
      const r = await fetch(`${DEPOT_LLMSTER}/${fichier}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) continue;
      attendue = /\b([0-9a-f]{128})\b/i.exec(await r.text())?.[1]?.toLowerCase() ?? null;
      if (attendue) break;
    } catch {
      /* forme suivante */
    }
  }
  // Sans empreinte, rien n'est installé : c'est la règle du projet, sans exception.
  if (!attendue) throw new Error(t("L'éditeur ne publie pas d'empreinte pour ce moteur : installation interrompue."));

  const travail = await mkdtemp(join(tmpdir(), "helix-moteur-"));
  try {
    const archive = join(travail, `llmster${extension}`);
    onProgress({ phase: "telechargement", message: t("Téléchargement du moteur..."), percent: 0 });
    const empreinte = await telecharger({ url: `${DEPOT_LLMSTER}/${nom}${extension}` }, archive, onProgress, "sha512");
    onProgress({ phase: "verification", message: t("Vérification du paquet...") });
    if (empreinte !== attendue) {
      throw new Error(t("L'empreinte du paquet téléchargé ne correspond pas à celle publiée. Installation interrompue."));
    }

    onProgress({ phase: "installation", message: t("Installation...") });
    const dossier = join(travail, "contenu");
    await mkdir(dossier, { recursive: true });
    await exec(tarDuSysteme(), ["-xf", archive, "-C", dossier], { timeout: 600_000 });
    const amorce = join(dossier, process.platform === "win32" ? "llmster.exe" : "llmster");
    if (!existsSync(amorce)) throw new Error(t("L'archive du moteur ne contient pas ce qui était attendu. Installation interrompue."));
    // Ce que fait l'installateur officiel, sans toucher au PATH ni aux profils du terminal.
    await exec(amorce, ["bootstrap"], {
      timeout: 600_000,
      env: { ...process.env, LMS_BOOTSTRAP_INSTALL_SH: "1", LMS_NO_MODIFY_PATH: "1" },
    });
    const lms = lmsDeLlmster();
    if (!existsSync(lms)) throw new Error(t("Le moteur s'est installé, mais son outil `lms` est introuvable. Réessayez, ou installez LM Studio depuis lmstudio.ai."));
    preparerDossiersLlmster();
    onProgress({ phase: "pret", message: tf("Moteur installé (version {0}).", version), percent: 100 });
    return lms;
  } finally {
    await rm(travail, { recursive: true, force: true }).catch(() => {});
  }
}
