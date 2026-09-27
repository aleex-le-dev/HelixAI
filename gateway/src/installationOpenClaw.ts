import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, readlinkSync, unlinkSync } from "node:fs";
import { homedir, release, platform, arch } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { deployment } from "./deployment.ts";
import { journaliser } from "./audit.ts";
import { t, tf } from "./langue.ts";
import { renommer } from "./processus.ts";

/**
 * Installe OpenClaw pour les employés, depuis l'interface, sans droits
 * d'administrateur et sans toucher au reste de la machine.
 *
 * Même chemin que l'installateur « sans root » documenté par OpenClaw
 * (`install-cli.sh`, docs.openclaw.ai/install/installer), refait ici pas à pas
 * plutôt que d'exécuter un script téléchargé :
 *
 *  1. un Node officiel (24.21.0 LTS, épinglé avec ses empreintes, ou la version
 *     du profil), dont l'archive est vérifiée avant d'être ouverte ;
 *  2. OpenClaw installé par le npm de ce Node, dans ce même dossier, à la
 *     version qu'Helix a éprouvée (ou celle du profil), avec l'autorisation de
 *     scripts d'installation limitée au seul paquet `openclaw` (npm 11.16+) ;
 *  3. vérification : `openclaw --version`.
 *
 * Tout vit dans `<données>/openclaw-moteur`. Le Node du système, la
 * configuration du shell et toute installation personnelle d'OpenClaw restent
 * tels quels. Désinstaller, c'est supprimer ce dossier.
 */

/** Version d'OpenClaw sur laquelle la configuration écrite par Helix a été éprouvée. */
export const VERSION_OPENCLAW_EPROUVEE = "2026.9.4";

/**
 * Les dépendances que npm résout pour OpenClaw et pour les serveurs d'outils
 * lancés par `npx` (mcp.ts) : seulement des versions publiées avant cette date
 * (`--before` de npm, seconde tournée de l'audit, 28/09/2026).
 *
 * Aucun de ces paquets ne publie de fichier de verrouillage (`npm-shrinkwrap`,
 * relu sur le registre) : sans date, chaque installation prend la dernière
 * version de chaque dépendance, publiée peut-être la veille. C'est la porte
 * des paquets repris par un tiers, qui publie une version piégée et compte
 * sur les installations des heures suivantes. Mesuré ce jour-là :
 * `ansi-regex` 6.4.0, publiée le 27/09/2026 à 03:34 (UTC), entrait sans date
 * dans les arbres de Firecrawl et de Kubernetes ; avec la date, 6.3.0 (du
 * 12/08), et aucun autre écart dans les treize arbres. Le registre n'accepte
 * pas qu'une version publiée soit remplacée : à date fixe, l'arbre est le
 * même d'une installation à l'autre.
 *
 * Ce n'est pas une empreinte écrite dans le code : npm vérifie chaque archive
 * contre l'empreinte que le registre publie. **Monter la version d'un paquet
 * du catalogue, ou celle d'OpenClaw, c'est avancer cette date au jour de
 * l'essai** : une version publiée après elle est refusée (`ETARGET … with a
 * date before`), et le contrôle 14 bis de `npm run securite` le rappelle.
 */
export const DEPENDANCES_NPM_AVANT = "2026-09-27T00:00:00.000Z";

const racine = () =>
  join(process.env.HELIX_DATA_DIR ?? join(homedir(), ".helix", "data"), "openclaw-moteur");

/** Exécutable d'OpenClaw installé par Helix (disposition « préfixe global » du Node privé). */
export const binaireGere = () => join(racine(), "node", "bin", "openclaw");

export type Etape = "repos" | "preparation" | "node" | "openclaw" | "verification" | "termine" | "erreur";

export interface EtatInstallation {
  etape: Etape;
  message: string;
  /** Avancement du téléchargement de Node, de 0 à 100. */
  avancement?: number;
  version?: string;
  /** Version remplacée, quand c'était une mise à jour. */
  de?: string;
}

let etat: EtatInstallation = { etape: "repos", message: "" };
let enCours: Promise<void> | null = null;

export function etatInstallation(): EtatInstallation {
  return etat;
}

function executer(bin: string, args: string[], env: NodeJS.ProcessEnv, delaiMs: number): Promise<{ ok: boolean; sortie: string; erreur: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { env, timeout: delaiMs, maxBuffer: 32 * 1024 * 1024 }, (err, sortie, erreur) =>
      resolve({ ok: !err, sortie: String(sortie), erreur: String(erreur) || (err ? err.message : "") }),
    );
  });
}

/**
 * Archive officielle de Node pour cette machine, ou la raison pour laquelle il
 * n'y en a pas. `pour` : OpenClaw ne s'installe pas sous Windows (il y demande
 * WSL) ; l'atelier, lui, s'y sert de ce Node pour npm quand la machine n'en a
 * pas (27/09/2026).
 */
function plateformeNode(pour: "openclaw" | "atelier" = "openclaw"): { dossier: string; cleIndex: string; extension: ".tar.gz" | ".zip" } | { erreur: string } {
  const a = arch() === "arm64" ? "arm64" : arch() === "x64" ? "x64" : null;
  if (!a) return { erreur: tf("Processeur non pris en charge ({0}).", arch()) };
  if (platform() === "win32" && pour === "atelier") return { dossier: `win-${a}`, cleIndex: `win-${a}-zip`, extension: ".zip" };
  if (platform() === "darwin") {
    // Node 24 exige macOS 13.5 ou plus récent (Darwin 22.6).
    const [maj = 0, min = 0] = release().split(".").map(Number);
    if (maj < 22 || (maj === 22 && min < 6)) {
      return { erreur: t("OpenClaw demande macOS 13.5 ou plus récent sur cette machine.") };
    }
    return { dossier: `darwin-${a}`, cleIndex: `osx-${a}-tar`, extension: ".tar.gz" };
  }
  if (platform() === "linux") return { dossier: `linux-${a}`, cleIndex: `linux-${a}`, extension: ".tar.gz" };
  return { erreur: t("L'installation automatique d'OpenClaw n'existe que pour macOS et Linux (sous Windows, OpenClaw demande WSL).") };
}

/** Le Node privé : `node.exe` à la racine de son dossier sous Windows, dans `bin/` ailleurs. */
const executableNode = (dossier: string) => (platform() === "win32" ? join(dossier, "node.exe") : join(dossier, "bin", "node"));

/**
 * Le npm du Node privé, s'il est installé : son script (`npm-cli.js`), que
 * l'atelier lance par Node (atelier.ts).
 */
export function npmPrive(): string | null {
  const dossier = join(racine(), "node");
  // Le script lui-même, lancé par Node (atelier.ts) : `bin/npm` passe par `env node`, introuvable sans Node sur la machine.
  const npm = platform() === "win32" ? join(dossier, "node_modules", "npm", "bin", "npm-cli.js") : join(dossier, "lib", "node_modules", "npm", "bin", "npm-cli.js");
  return existsSync(npm) && existsSync(executableNode(dossier)) ? npm : null;
}

/**
 * Le Node privé pour lancer `npx` (serveurs MCP, mcp.ts) : son exécutable, son
 * dossier (à mettre en tête du PATH, pour que les paquets lancés trouvent
 * `node`) et le script de `npx`. Null s'il n'est pas installé.
 */
export function npxPrive(): { node: string; dossier: string; script: string } | null {
  const dossier = join(racine(), "node");
  const node = executableNode(dossier);
  const script = platform() === "win32" ? join(dossier, "node_modules", "npm", "bin", "npx-cli.js") : join(dossier, "lib", "node_modules", "npm", "bin", "npx-cli.js");
  return existsSync(node) && existsSync(script) ? { node, dossier: platform() === "win32" ? dossier : join(dossier, "bin"), script } : null;
}

/** Le Node privé peut-il être installé ici ? La raison sinon. */
export function nodePriveInstallable(): string | null {
  const p = plateformeNode("atelier");
  return "erreur" in p ? p.erreur : null;
}

/** Installe le Node privé seul (sans OpenClaw), pour l'atelier. Rend le chemin de son npm. */
export async function assurerNodePrive(): Promise<string> {
  const deja = npmPrive();
  if (deja) return deja;
  await installerNode("atelier");
  const npm = npmPrive();
  if (!npm) throw new Error(t("Node s'est installé, mais son npm est introuvable."));
  return npm;
}

/** `fetch`, avec une erreur en français quand le réseau manque (« fetch failed » sinon). */
async function telecharger(url: string, delaiMs: number): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(delaiMs) });
  } catch {
    throw new Error(tf("{0} est injoignable : vérifiez l'accès à internet de cette machine.", new URL(url).host));
  }
}

/*
 * Node épinglé, avec l'empreinte SHA-256 de chaque archive écrite ici (revue
 * de sécurité du 27/09/2026, relevées ce jour-là dans `SHASUMS256.txt` de
 * nodejs.org) : avant, Helix prenait la dernière 24 LTS publiée et son
 * empreinte sur le même serveur. Une version imposée par le profil
 * (`openclaw.node`) reste possible : c'est alors l'exploitant qui la choisit,
 * et son empreinte est lue dans `SHASUMS256.txt`.
 */
const NODE_EPINGLE = "24.21.0";
const EMPREINTES_NODE: Record<string, string> = {
  "node-v24.21.0-darwin-arm64.tar.gz": "bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057",
  "node-v24.21.0-darwin-x64.tar.gz": "1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097",
  "node-v24.21.0-linux-x64.tar.gz": "6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff",
  "node-v24.21.0-linux-arm64.tar.gz": "724282c3b43aec998aa9527380465b45d229e021b58035f5f4f63095eabfe5d5",
  "node-v24.21.0-win-x64.zip": "158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541",
  "node-v24.21.0-win-arm64.zip": "8779b1bde1d39f8d420e3b57aa657b39891af434d3de44a919044cec06785921",
};

const versionNode = (): string => deployment().openclaw?.node?.replace(/^v/, "") || NODE_EPINGLE;

/*
 * Une installation à la fois (revue de sécurité du 27/09/2026) : l'atelier et
 * deux serveurs d'outils pouvaient la demander ensemble, et chacune effaçait
 * puis remettait le dossier de Node sous l'autre, en train de s'en servir.
 */
const nodeEnCours = new Map<string, Promise<string>>();
function installerNode(pour: "openclaw" | "atelier" = "openclaw"): Promise<string> {
  let enCoursIci = nodeEnCours.get(pour);
  if (!enCoursIci) {
    enCoursIci = installerNodeUneFois(pour).finally(() => nodeEnCours.delete(pour));
    nodeEnCours.set(pour, enCoursIci);
  }
  return enCoursIci;
}

async function installerNodeUneFois(pour: "openclaw" | "atelier"): Promise<string> {
  const p = plateformeNode(pour);
  if ("erreur" in p) throw new Error(p.erreur);
  const version = versionNode();
  const nom = `node-v${version}-${p.dossier}`;
  const dossierNode = join(racine(), nom);
  const lien = join(racine(), "node");
  if (existsSync(executableNode(dossierNode))) {
    relier(lien, nom);
    return version;
  }

  const base = `https://nodejs.org/dist/v${version}`;
  let attendue: string | undefined = version === NODE_EPINGLE ? EMPREINTES_NODE[`${nom}${p.extension}`] : undefined;
  if (version !== NODE_EPINGLE) {
    const sommes = await telecharger(`${base}/SHASUMS256.txt`, 20_000);
    if (!sommes.ok) throw new Error(tf("Empreintes de Node introuvables ({0}).", sommes.status));
    attendue = (await sommes.text())
      .split("\n")
      .map((l) => l.trim().split(/\s+/))
      .find(([, f]) => f === `${nom}${p.extension}`)?.[0];
  }
  if (!attendue) throw new Error(t("Empreinte de l'archive de Node introuvable."));

  const r = await telecharger(`${base}/${nom}${p.extension}`, 10 * 60_000);
  if (!r.ok || !r.body) throw new Error(tf("Téléchargement de Node impossible ({0}).", r.status));
  /*
   * Dans un dossier à soi (0700), pas dans le dossier temporaire commun : sous
   * Linux, `/tmp` est partagé, et un autre compte pouvait y préparer le nom
   * de l'archive (lien vers un fichier de ce compte) ou la remplacer entre la
   * vérification de l'empreinte et l'extraction. Même règle que pythonPrive.ts
   * et opencodePrive.ts (audit de la chaîne d'approvisionnement du 27/09/2026).
   */
  mkdirSync(racine(), { recursive: true, mode: 0o700 });
  const dossierArchive = mkdtempSync(join(racine(), ".telechargement-"));
  const archive = join(dossierArchive, `${nom}${p.extension}`);
  const total = Number(r.headers.get("content-length") ?? 0);
  const empreinte = createHash("sha256");
  let recu = 0;
  const flux = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream<Uint8Array>);
  flux.on("data", (morceau: Buffer) => {
    empreinte.update(morceau);
    recu += morceau.length;
    if (total > 0) etat = { ...etat, avancement: Math.round((recu / total) * 100) };
  });
  try {
    await pipeline(flux, createWriteStream(archive, { mode: 0o600, flags: "wx" }));
  } catch {
    rmSync(dossierArchive, { recursive: true, force: true });
    throw new Error(t("Le téléchargement de Node s'est interrompu : vérifiez la connexion, puis réessayez."));
  }
  if (empreinte.digest("hex") !== attendue) {
    rmSync(dossierArchive, { recursive: true, force: true });
    throw new Error(t("L'archive de Node ne correspond pas à son empreinte officielle : installation arrêtée."));
  }

  mkdirSync(racine(), { recursive: true, mode: 0o700 });
  const provisoire = join(racine(), `.extraction-${Date.now()}`);
  mkdirSync(provisoire, { recursive: true });
  // Le `tar` du système : sous Windows, celui de Windows, qui ouvre aussi les .zip (celui de Git ne sait pas lire `C:`).
  const tar = platform() === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar";
  const extraction = await executer(tar, [p.extension === ".zip" ? "-xf" : "-xzf", archive, "-C", provisoire], process.env, 5 * 60_000);
  rmSync(dossierArchive, { recursive: true, force: true });
  if (!extraction.ok) {
    rmSync(provisoire, { recursive: true, force: true });
    throw new Error(tf("Extraction de Node impossible : {0}", extraction.erreur.slice(-200)));
  }
  // Déjà posé entre-temps (autre processus) : on garde celui en place, on ne l'efface pas sous qui s'en sert.
  if (existsSync(executableNode(dossierNode))) {
    rmSync(provisoire, { recursive: true, force: true });
  } else {
    rmSync(dossierNode, { recursive: true, force: true });
    try {
      renommer(join(provisoire, nom), dossierNode);
    } finally {
      rmSync(provisoire, { recursive: true, force: true });
    }
  }
  relier(lien, nom);
  return version;
}

/** `<racine>/node` pointe sur la version installée : l'exécutable d'OpenClaw garde un chemin stable. */
function relier(lien: string, cible: string): void {
  try {
    const actuel = readlinkSync(lien);
    /*
     * Sous Windows, une « junction » se relit en chemin absolu : comparée au
     * nom relatif, elle paraissait toujours fausse, et était effacée puis
     * refaite à chaque appel, même sous qui s'en servait (revue Windows du
     * 27/09/2026).
     */
    const memeCible =
      platform() === "win32"
        ? resolve(actuel).replace(/[\\/]+$/, "").toLowerCase() === join(racine(), cible).toLowerCase()
        : actuel === cible;
    if (memeCible) return;
    unlinkSync(lien);
  } catch {
    /* pas encore de lien */
  }
  // Sous Windows, une « junction » (un lien de dossier ordinaire y demande les droits d'administration), vers un chemin absolu.
  if (platform() === "win32") symlinkSync(join(racine(), cible), lien, "junction");
  else symlinkSync(cible, lien);
}

async function installerPaquet(version: string): Promise<string> {
  const binNode = join(racine(), "node", "bin");
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${binNode}:/usr/bin:/bin:/usr/sbin:/sbin` };
  for (const k of Object.keys(env)) if (k.startsWith("HELIX_") || k.startsWith("ELECTRON_") || k.startsWith("npm_")) delete env[k];
  const npm = join(binNode, "npm");
  const v = await executer(npm, ["--version"], env, 30_000);
  const [maj = 0, min = 0] = v.sortie.trim().split(".").map(Number);
  if (!v.ok) throw new Error("npm, livré avec Node, ne répond pas.");
  const args = ["install", "-g", `openclaw@${version}`, "--no-fund", "--no-audit", "--loglevel=error"];
  /*
   * Ses dépendances à la date de l'essai (DEPENDANCES_NPM_AVANT), pour la
   * version éprouvée seulement : une version choisie par le profil peut être
   * plus récente que la date, et serait refusée.
   */
  if (version === VERSION_OPENCLAW_EPROUVEE) args.push(`--before=${DEPENDANCES_NPM_AVANT}`);
  // npm 11.16 et suivants bloquent les scripts d'installation non approuvés : on n'approuve qu'OpenClaw.
  if (maj > 11 || (maj === 11 && min >= 16)) args.push("--allow-scripts=openclaw");
  const r = await executer(npm, args, env, 20 * 60_000);
  if (!r.ok || !existsSync(binaireGere())) throw new Error(`OpenClaw ne s'est pas installé : ${raisonNpm(r.erreur || r.sortie, version)}`);
  const verif = await executer(binaireGere(), ["--version"], env, 60_000);
  const trouvee = /(\d{4}\.\d+\.\d+)/.exec(verif.sortie)?.[1];
  if (!verif.ok || !trouvee) throw new Error("OpenClaw s'est installé mais ne démarre pas.");
  return trouvee;
}

/** Version d'OpenClaw qu'Helix installe : celle du profil, sinon celle qu'il a éprouvée. */
export const versionVisee = () => deployment().openclaw?.version ?? VERSION_OPENCLAW_EPROUVEE;

/** « 2026.9.10 » est plus récente que « 2026.9.4 » : comparaison nombre par nombre, pas en texte. */
export function plusRecente(a: string, b: string): boolean {
  const n = (v: string) => v.replace(/^v/, "").split(/[.-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

let parue: { version: string | null; at: number } | null = null;
let releve: Promise<void> | null = null;

/**
 * Dernière version publiée d'OpenClaw (registre npm, étiquette « latest »),
 * pour dire à l'écran qu'elle existe. Relue en arrière-plan au plus deux fois
 * par jour, sans jamais faire attendre l'écran ; `null` tant qu'on ne sait pas
 * (ou hors ligne). Helix ne l'installe pas d'office : il installe la version
 * qu'il a éprouvée, et c'est une mise à jour d'Helix qui fait avancer celle-ci.
 */
export function versionParue(): string | null {
  if (!releve && (!parue || Date.now() - parue.at > 12 * 3_600_000)) {
    releve = (async () => {
      try {
        const r = await fetch("https://registry.npmjs.org/openclaw/latest", { signal: AbortSignal.timeout(8000) });
        const v = r.ok ? ((await r.json()) as { version?: unknown }).version : null;
        parue = { version: typeof v === "string" && /^\d{4}\.\d+\.\d+$/.test(v) ? v : null, at: Date.now() };
      } catch {
        parue = { version: parue?.version ?? null, at: Date.now() };
      } finally {
        releve = null;
      }
    })();
  }
  return parue?.version ?? null;
}

/** Ce que l'instance des agents fait autour de l'installation (voir employes.ts). */
export interface Crochets {
  /** Avant : arrêter l'instance et mettre ses données de côté (mise à jour seulement). */
  preparer?: () => Promise<void>;
  /** Une fois le paquet en place : (re)démarrer. Lève une erreur si l'instance ne repart pas. */
  apres: () => Promise<void>;
  /** La mise à jour a échoué : remettre les données mises de côté et relancer. */
  retablir?: () => Promise<void>;
}

/**
 * Ce que npm a dit, en une phrase : ses messages bruts portent des chemins de
 * la machine et un jargon qui n'apprend rien à qui installe.
 */
function raisonNpm(sortie: string, version: string): string {
  if (/notarget|No matching version/i.test(sortie)) return `la version ${version} d'OpenClaw n'est pas publiée`;
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET|network/i.test(sortie)) {
    return "le registre npm est injoignable : vérifiez l'accès à internet de cette machine";
  }
  if (/ENOSPC/i.test(sortie)) return "il n'y a plus assez de place sur le disque";
  if (/EACCES|EPERM/i.test(sortie)) return "le dossier d'installation n'est pas accessible en écriture";
  const ligne = sortie
    .split("\n")
    .map((l) => l.replace(/^npm (error|ERR!)\s*/i, "").trim())
    .find((l) => l && !/log of this run|^A complete log|\/_logs\//i.test(l));
  return `npm a échoué${ligne ? ` (${ligne.replace(/\/[^\s]+/g, "…").slice(0, 160)})` : ""}`;
}

/**
 * Lance l'installation (une seule à la fois) et rend la main aussitôt : l'écran
 * suit `etatInstallation()`.
 *
 * `avant` : la version en place, quand c'est une mise à jour. Une mise à jour
 * est réversible jusqu'au bout : une nouvelle version d'OpenClaw fait migrer
 * sa base sans retour possible (une version plus ancienne refuse ensuite de
 * l'ouvrir), les données sont donc mises de côté avant, et si la nouvelle
 * version ne démarre pas, l'ancienne est réinstallée et les données remises.
 */
export function installerOpenClaw(qui: string, crochets: Crochets, avant?: string): void {
  if (enCours) return;
  enCours = (async () => {
    let paquetChange = false;
    try {
      if (avant && crochets.preparer) {
        etat = { etape: "preparation", message: t("Mise de côté des données de vos agents…") };
        await crochets.preparer();
      }
      etat = { etape: "node", message: t("Téléchargement de Node.js (environ 50 Mo)…"), avancement: 0 };
      const node = await installerNode();
      etat = {
        etape: "openclaw",
        message: avant ? `Mise à jour d'OpenClaw vers ${versionVisee()} (une à deux minutes)…` : "Installation d'OpenClaw (quelques minutes)…",
      };
      paquetChange = true;
      const version = await installerPaquet(versionVisee());
      etat = { etape: "verification", message: avant ? "Redémarrage de vos agents…" : "Vérification…" };
      await crochets.apres();
      etat = {
        etape: "termine",
        message: avant ? `OpenClaw est passé de ${avant} à ${version}.` : `OpenClaw ${version} est installé.`,
        version,
        ...(avant ? { de: avant } : {}),
      };
      if (avant) journaliser("openclaw.mis_a_jour", qui, { de: avant, a: version, node });
      else journaliser("openclaw.installe", qui, { version, node, dossier: racine() });
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err);
      if (avant && crochets.retablir) {
        etat = { etape: "verification", message: tf("Retour à OpenClaw {0}…", avant) };
        try {
          if (paquetChange) await installerPaquet(avant);
          await crochets.retablir();
          message = `La mise à jour n'a pas abouti (${message.replace(/\.$/, "")}). Vos agents sont revenus à OpenClaw ${avant}, sans rien perdre.`;
        } catch (err2) {
          message = `La mise à jour n'a pas abouti, et le retour à OpenClaw ${avant} non plus : ${err2 instanceof Error ? err2.message : String(err2)}`;
        }
      }
      etat = { etape: "erreur", message };
      journaliser("openclaw.installation_echouee", qui, { raison: message.slice(0, 300), ...(avant ? { de: avant, vers: versionVisee() } : {}) });
    } finally {
      enCours = null;
    }
  })();
}
