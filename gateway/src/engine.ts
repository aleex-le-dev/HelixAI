import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { t, tf } from "./langue.ts";
import { workspace } from "./mcp.ts";
import { tarDuSysteme } from "./pythonPrive.ts";

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
  if (!res.ok || !res.body) throw new Error(tf("Téléchargement impossible (HTTP {0}).", res.status));

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
  const application = applicationLmStudio();
  // Mac Intel : l'application, seule possible (pas de llmster pour eux).
  if (process.arch !== "arm64") return application;
  // Mac à puce Apple : l'application si elle a déjà servi, sinon le moteur sans interface.
  if (application && installationDeclaree("app-install-location.json")) return application;
  return moteurSansInterface() && existsSync(lmsDeLlmster()) ? lmsDeLlmster() : null;
}

/**
 * LM Studio a-t-il déclaré cette installation ? `lms` ne trouve son moteur que
 * par ces fichiers de `.internal` : `app-install-location.json`, écrit au
 * premier lancement de l'application, et `llmster-install-location.json`, écrit
 * par `llmster bootstrap` (relevé le 27/09/2026 sur macOS, llmster 0.0.25-1).
 * Sans l'un ni l'autre, `lms` répond « daemon is not running and no valid
 * installation could be found », même avec l'application dans Applications.
 */
function installationDeclaree(fichier: "app-install-location.json" | "llmster-install-location.json"): boolean {
  try {
    const { path } = JSON.parse(readFileSync(join(dossierLmStudio(), ".internal", fichier), "utf8")) as { path?: unknown };
    return typeof path === "string" && existsSync(path);
  } catch {
    return false;
  }
}

/**
 * Mac à puce Apple où `lms` est là mais sans moteur qu'il sache démarrer :
 * l'application LM Studio posée par une version précédente de Helix, jamais
 * ouverte (vu sur un MacBook le 27/09/2026, deux fois). Le moteur y compte
 * comme absent : l'écran de mise en route propose de l'installer, et c'est le
 * moteur sans interface qui est posé, à côté de l'application.
 */
export function moteurAPoser(): boolean {
  if (process.platform !== "darwin" || process.arch !== "arm64") return false;
  return !installationDeclaree("app-install-location.json") && !installationDeclaree("llmster-install-location.json");
}

/** L'application LM Studio (avec son interface) sur ce Mac, ou null. */
export function applicationLmStudio(): string | null {
  if (process.platform !== "darwin") return null;
  for (const base of emplacements()) {
    const chemin = join(base, "LM Studio.app");
    if (existsSync(chemin)) return chemin;
  }
  return null;
}

/**
 * Le moteur est-il le moteur sans interface (llmster) ? Sous Windows et Linux,
 * toujours ; sur macOS, quand llmster est posé (par Helix, sur un Mac à puce
 * Apple) et que l'application LM Studio n'a jamais servi. Une application qui a
 * déjà servi garde la main : c'est elle que partagent les autres logiciels de la
 * machine (un agent personnel, LM Studio lui-même).
 */
export function moteurSansInterface(): boolean {
  if (process.platform !== "darwin") return true;
  return installationDeclaree("llmster-install-location.json") && !(applicationLmStudio() && installationDeclaree("app-install-location.json"));
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
  /*
   * Mac à puce Apple aussi, depuis le 27/09/2026 : l'application LM Studio
   * posée par Helix n'avait jamais été ouverte, et `lms` refusait alors de
   * démarrer son service (« daemon is not running and no valid installation
   * could be found », vu sur un MacBook). Le moteur sans interface démarre
   * sans elle. Les Mac Intel gardent l'application (pas de llmster pour eux).
   */
  if (process.platform === "win32" || process.platform === "linux" || (process.platform === "darwin" && process.arch === "arm64")) {
    return installerLlmster(onProgress);
  }
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
 *  1. la version est épinglée ici, avec l'empreinte SHA-512 de chaque archive
 *     (relevée dans les fichiers `.sha512` que l'éditeur publie) ;
 *  2. l'archive vient du dépôt de l'éditeur, et son empreinte est vérifiée
 *     avant ouverture ;
 *  3. l'archive est ouverte par `tar` (celui de Windows lui-même, pas un autre
 *     trouvé dans le PATH), puis `llmster bootstrap` pose `lms` dans
 *     `~/.lmstudio/bin`, pour ce compte seulement : ni droits
 *     d'administration, ni fenêtre, ni PATH modifié.
 *
 * Limite dite : l'empreinte a été relevée sur le même serveur que l'archive,
 * mais une fois, le 27/09/2026, et écrite ici : un serveur compromis ensuite
 * ne peut plus faire installer autre chose. Sur macOS, l'empreinte vient d'un
 * catalogue tiers (Homebrew). Essayé dans un Ubuntu 24.04 (conteneur), pas
 * encore sur une vraie machine Windows ni Linux.
 */

/*
 * Version épinglée et empreintes SHA-512 écrites ici (revue de sécurité du
 * 27/09/2026), relevées ce jour-là dans les fichiers `.sha512` de l'éditeur :
 * plus rien n'est lu en ligne pour décider quoi installer, et une archive
 * changée sur le serveur, même avec une empreinte changée à côté, est refusée.
 * Passer à une version plus récente, c'est relever ses empreintes et les
 * écrire ici. L'empreinte de `linux-x64.full` est celle vérifiée par
 * l'installation réelle dans un Ubuntu 24.04 le même jour.
 */
const LLMSTER_VERSION = "0.0.25-1";
const LLMSTER: Record<string, { sha512: string; octets: number }> = {
  "0.0.25-1-linux-x64.full": { sha512: "4d119af740379fc7509894d761a85183420a6dd3cb994596a1b6e4b37208a5d3e8cb94ffe583115b1473a6722bab5fffc09b90eb22c755f5dde1458774ab4951", octets: 1_005_168_404 },
  "0.0.25-1-linux-x64.full+cuda12": { sha512: "179e05cee62c1e1f61f1c6480179b1e21df63af64ffa3a949a94f026afc4552d7a36db7208345e65f21f040d864c1603bf6cd1c0292e4751d696bee5679db007", octets: 1_105_623_572 },
  "0.0.25-1-linux-arm64.full": { sha512: "9743cfce0fd1e2b76f4fcbef6fbe4ed68f4e953781c0eba5c5db33308209f007939f3f946995618f22f8c4bb977919408c23a5cbbb369f530e2c92738f6891bc", octets: 1_257_501_655 },
  "0.0.25-1-win32-x64.full": { sha512: "a17bfd052ea7a63182c4cd39b0619982e8027d19f6b00d0207207c8fa308540e502251662886a8ce8191a2bd0eb9132a48ee4991e784ebb5474d62ed3103fffe", octets: 868_484_756 },
  "0.0.25-1-darwin-arm64.full": { sha512: "edf1fb01f49b6ea101b3bd7027b4516eb73261d7b0df871c4286fac7011eb4f12633f7f03c9c6a66322659231c248989b7d235528b41bd2f30d87ce085c13b32", octets: 615_370_329 },
  "0.0.25-1-win32-arm64.full": { sha512: "fde8717b0ec91758a5dbd3e2ef15d7d8cbe26d4190fedde258c9c38846fc7c79e320c75bf3e0793c53163a3460f5259f3036016929ea38098f7abeedb7e5e15b", octets: 279_979_911 },
};
const DEPOT_LLMSTER = "https://llmster.lmstudio.ai/download";

/** Le dossier de LM Studio pour ce compte : `~/.lmstudio`, ou celui que désigne `~/.lmstudio-home-pointer`. */
export function dossierLmStudio(): string {
  const habituel = join(homedir(), ".lmstudio");
  try {
    const pointe = readFileSync(join(homedir(), ".lmstudio-home-pointer"), "utf8").trim();
    /*
     * Le pointeur n'est suivi que vers un dossier local sûr (revue de sécurité
     * du 27/09/2026) : chemin absolu, pas un partage réseau (`\\serveur`, qui
     * enverrait les identifiants Windows ailleurs), un vrai dossier, à ce
     * compte sous macOS et Linux, et hors des dossiers que les agents peuvent
     * écrire. Sinon, l'emplacement habituel : c'est `bin/lms` de ce dossier
     * que la passerelle lance.
     */
    if (pointe && isAbsolute(pointe) && !/^[\\/]{2}/.test(pointe)) {
      const st = statSync(pointe);
      const aMoi = process.platform === "win32" || typeof process.getuid !== "function" || st.uid === process.getuid();
      if (st.isDirectory() && aMoi && !espaceEcrivable(pointe)) return pointe;
    }
  } catch {
    /* pas de pointeur, ou illisible : l'emplacement habituel */
  }
  return habituel;
}

/** Le dossier est-il dans l'espace de travail des agents, ou le contient-il ? */
function espaceEcrivable(dossier: string): boolean {
  const a = resolve(dossier).toLowerCase();
  const b = resolve(workspace()).toLowerCase();
  return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
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
  if (!moteurSansInterface()) return;
  const racine = dossierLmStudio();
  if (!existsSync(racine)) return;
  try {
    mkdirSync(join(racine, ".internal", "temp"), { recursive: true });
  } catch {
    /* dossier du moteur en lecture seule : le chargement le dira */
  }
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
  if (process.platform === "darwin") return { nom: `${version}-darwin-${arch}.full`, extension: ".tar.gz" };
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
  const version = LLMSTER_VERSION;
  const { nom, extension } = nomLlmster(version);
  // Sans empreinte écrite ici, rien n'est installé : c'est la règle du projet, sans exception.
  const attendue = LLMSTER[nom]?.sha512;
  if (!attendue) throw new Error(tf("Le moteur de LM Studio n'existe pas pour ce processeur ({0}).", process.arch));

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
