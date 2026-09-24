import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
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

/** Télécharge le paquet en calculant son empreinte au fil de l'eau. */
async function telecharger(
  paquet: Paquet,
  destination: string,
  onProgress: (p: EngineProgress) => void,
): Promise<string> {
  const res = await fetch(paquet.url, { signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (HTTP ${res.status}).`);

  const total = Number(res.headers.get("content-length") ?? 0);
  const hash = createHash("sha256");
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
  if (process.platform !== "darwin") {
    throw new Error("L'installation automatique n'est disponible que sur macOS.");
  }

  const dejaLa = await appInstallee();
  if (dejaLa) return dejaLa;

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
