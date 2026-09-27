import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { t, tf } from "./langue.ts";
import { renommer } from "./processus.ts";
import { tarDuSysteme } from "./pythonPrive.ts";

/**
 * OpenCode, le moteur de l'écran Code, posé par Helix.
 *
 * Demandé par Medhi le 27/09/2026 (« tout s'installe seul non ? ») : l'écran
 * Code affichait une commande à taper (`curl … | bash`, ou `npm install -g`
 * sous Windows). OpenCode est sous licence MIT (github.com/anomalyco/opencode,
 * ex-sst/opencode) : il entre dans la règle du projet.
 *
 * Comme Python et le moteur des modèles : version **épinglée**, empreintes
 * SHA-256 **écrites ici** (celles que GitHub publie pour chaque fichier de la
 * version, relevées le 27/09/2026 ; celle du Mac à puce Apple recalculée sur le
 * fichier téléchargé), aucun script exécuté. L'archive contient un seul
 * exécutable, posé dans `<données>/opencode/<version>/`, pour ce compte : ni
 * droits d'administration, ni PATH modifié. La 1.18.32 est celle avec laquelle
 * Helix Code tourne sur le Mac de développement.
 *
 * Variantes « baseline » (processeurs x64 sans AVX2) non prises : un PC de plus
 * de dix ans pourrait ne pas le démarrer, et l'essai après installation le dit.
 */

const VERSION = "1.18.32";
const DEPOT = "https://github.com/anomalyco/opencode/releases/download";

const ARCHIVES: Record<string, { fichier: string; sha256: string; octets: number }> = {
  "darwin-arm64": { fichier: "opencode-darwin-arm64.zip", sha256: "fa643f93401c13508d8d513780e54ce9cc01203d501114be9b88d62408b8101f", octets: 46_299_070 },
  "darwin-x64": { fichier: "opencode-darwin-x64.zip", sha256: "a24bf10499382f8855e19d2a081b8683e4ab99c7c2affb32dc89b17c8a00ccd6", octets: 48_490_250 },
  "linux-x64": { fichier: "opencode-linux-x64.tar.gz", sha256: "3046e0404fdc60fb80307e7a47824ba07477364178a4d09baa8548496dd6d43b", octets: 60_608_353 },
  "linux-arm64": { fichier: "opencode-linux-arm64.tar.gz", sha256: "568461b7d4d8c19865c97e9a1102e613049c6039d01fe772154de873c1865840", octets: 60_418_875 },
  "win32-x64": { fichier: "opencode-windows-x64.zip", sha256: "1483c72d5adced825590a0ecf8cc18b3e87e535960a125dbf539d33bce135d0f", octets: 62_101_772 },
  "win32-arm64": { fichier: "opencode-windows-arm64.zip", sha256: "5c1c21e85b694ac3fedccff22f934484c29273d5b5780eff006960304108e124", octets: 60_591_906 },
};

const cible = () => `${process.platform}-${process.arch}`;
const racine = () => join(process.env.HELIX_DATA_DIR ?? join(homedir(), ".helix", "data"), "opencode");
const dossierVersion = () => join(racine(), VERSION);
const nomExecutable = () => (process.platform === "win32" ? "opencode.exe" : "opencode");

/** L'OpenCode posé par Helix (chemin de l'exécutable, qu'il existe ou non). */
export const opencodeDeHelix = (): string => join(dossierVersion(), nomExecutable());

/** Helix sait-il poser OpenCode ici ? La raison sinon. */
export function opencodeInstallable(): string | null {
  return ARCHIVES[cible()] ? null : tf("OpenCode n'est pas publié pour ce système ({0}).", cible());
}

export interface EtatInstallationOpencode {
  enCours: boolean;
  pourcent: number | null;
  erreur: string | null;
}

const etat: EtatInstallationOpencode = { enCours: false, pourcent: null, erreur: null };
export const etatInstallationOpencode = (): EtatInstallationOpencode => ({ ...etat });

let enCours: Promise<string> | null = null;

/** Pose OpenCode s'il ne l'est pas ; une installation à la fois. Rend l'exécutable. */
export function installerOpencode(): Promise<string> {
  if (existsSync(opencodeDeHelix())) return Promise.resolve(opencodeDeHelix());
  if (!enCours) {
    Object.assign(etat, { enCours: true, pourcent: 0, erreur: null });
    enCours = installer()
      .catch((err: unknown) => {
        etat.erreur = err instanceof Error ? err.message : String(err);
        throw err;
      })
      .finally(() => {
        etat.enCours = false;
        enCours = null;
      });
  }
  return enCours;
}

async function installer(): Promise<string> {
  const attendu = ARCHIVES[cible()];
  if (!attendu) throw new Error(opencodeInstallable() ?? t("OpenCode n'est pas publié pour ce système."));
  // Pris avant tout téléchargement : sous un vieux Windows, l'erreur claire tout de suite.
  const tar = tarDuSysteme();

  let reponse: Response;
  try {
    reponse = await fetch(`${DEPOT}/v${VERSION}/${attendu.fichier}`, { signal: AbortSignal.timeout(30 * 60_000) });
  } catch {
    throw new Error(t("github.com est injoignable : vérifiez l'accès à internet de cette machine, puis réessayez."));
  }
  if (!reponse.ok || !reponse.body) throw new Error(tf("Téléchargement d'OpenCode impossible (HTTP {0}).", reponse.status));

  mkdirSync(racine(), { recursive: true, mode: 0o700 });
  // Dans un dossier à soi (0700), pas dans le dossier temporaire commun (même règle que pythonPrive.ts).
  const travail = mkdtempSync(join(racine(), ".telechargement-"));
  try {
    const archive = join(travail, attendu.fichier);
    const empreinte = createHash("sha256");
    let recu = 0;
    const flux = Readable.fromWeb(reponse.body as import("node:stream/web").ReadableStream<Uint8Array>);
    flux.on("data", (morceau: Buffer) => {
      empreinte.update(morceau);
      recu += morceau.length;
      if (recu > attendu.octets) flux.destroy(new Error("trop gros"));
      etat.pourcent = Math.min(99, Math.round((recu / attendu.octets) * 100));
    });
    try {
      await pipeline(flux, createWriteStream(archive, { mode: 0o600, flags: "wx" }));
    } catch {
      throw new Error(t("Le téléchargement d'OpenCode s'est interrompu : vérifiez la connexion, puis réessayez."));
    }
    if (empreinte.digest("hex") !== attendu.sha256) {
      throw new Error(t("L'archive d'OpenCode ne correspond pas à son empreinte : elle a été effacée sans être ouverte."));
    }

    const extrait = join(travail, "contenu");
    mkdirSync(extrait);
    const sortie = await new Promise<string | null>((resolve) =>
      execFile(tar, ["-xf", archive, "-C", extrait], { timeout: 10 * 60_000 }, (err, _o, e) => resolve(err ? String(e || err.message) : null)),
    );
    const exe = join(extrait, nomExecutable());
    if (sortie !== null || !existsSync(exe)) {
      throw new Error(tf("OpenCode n'a pas pu être décompressé : {0}", (sortie ?? t("archive incomplète")).slice(-200)));
    }
    if (process.platform !== "win32") chmodSync(exe, 0o755);

    // Vérifié avant d'être mis en place : il doit démarrer et dire sa version.
    const essai = await new Promise<string>((resolve) =>
      execFile(exe, ["--version"], { timeout: 60_000, windowsHide: true }, (err, o) => resolve(err ? "" : String(o).trim())),
    );
    if (essai !== VERSION) throw new Error(t("OpenCode s'est installé mais ne démarre pas sur cette machine."));

    rmSync(dossierVersion(), { recursive: true, force: true });
    mkdirSync(racine(), { recursive: true, mode: 0o700 });
    renommer(extrait, dossierVersion());
    etat.pourcent = 100;
    console.log(`[helix] OpenCode ${VERSION} posé dans ${dossierVersion()}.`);
    return opencodeDeHelix();
  } finally {
    rmSync(travail, { recursive: true, force: true });
  }
}
