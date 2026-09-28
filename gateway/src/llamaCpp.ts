import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { t, tf } from "./langue.ts";
import { cleLlamaCpp, fichierCleLlamaCpp, moteurOuvert, portLlamaCpp, racineLlamaCpp, urlLlamaCpp } from "./llamaCppBase.ts";
import { renommer } from "./processus.ts";
import { tarDuSysteme } from "./pythonPrive.ts";

/**
 * Le moteur ouvert : llama.cpp (MIT), posé et démarré par Helix là où LM
 * Studio n'existe pas, c'est-à-dire sur les Mac à processeur Intel.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Demandé par Medhi le 28/09/2026 (« un moteur automatique pour les Mac
 * Intel, avec llama.cpp : go »). Depuis le 27/09/2026, un Mac Intel n'avait
 * aucun moteur : LM Studio ne publie plus que pour les puces Apple, et le
 * chemin Homebrew, sans version figée ni empreinte, avait été retiré
 * (engine.ts). Ces Mac ne pouvaient converser qu'avec une clé de fournisseur.
 * llama.cpp est aussi le moteur ouvert que PROJET.md § 1 réclamait pour une
 * instance servie à plusieurs organisations, ce que les conditions de LM
 * Studio interdisent.
 *
 * ── Ce qui est posé, et d'où ────────────────────────────────────────────────
 *
 * Même règle que RTK et OpenCode : version épinglée, empreinte SHA-256 écrite
 * ici, aucun script exécuté, rien hors de `<données>/llamacpp/`.
 *  - Le moteur : l'archive publiée par ggml-org pour macOS (b11146, la
 *    construction de la version v0.5.0 du 23/09/2026 ; `nightly-tag.txt` de
 *    la publication v0.5.0 pointe sur elle). Empreintes relevées le
 *    28/09/2026 dans l'API de GitHub (`digest` de chaque fichier) et
 *    recalculées sur les archives téléchargées : identiques. 11 Mo.
 *    L'archive Intel ne contient pas Metal : le calcul se fait au
 *    processeur, ce que `tientSur` suppose déjà pour une machine sans puce
 *    Apple (provision.ts).
 *  - Les modèles : les fichiers GGUF que Qwen publie lui-même (dépôts
 *    `Qwen/Qwen3-*-GGUF`, Apache 2.0), à une révision figée, vérifiés par
 *    l'empreinte que Hugging Face donne de chaque fichier (l'identifiant LFS
 *    est son SHA-256). Seulement des modèles déjà essayés avec Helix sous LM
 *    Studio (`verifie` du catalogue) : Qwen3 1.7B, 4B, 8B et 30B A3B.
 *    Qwen3.5 est écarté ici : c'est avec llama.cpp au processeur qu'il
 *    rendait « 不 時//// » sur le PC de Medhi (PROJET.md, 27/09/2026).
 *
 * ── Comment il tourne ───────────────────────────────────────────────────────
 *
 * `llama-server` en mode « routeur » : un seul processus sur 127.0.0.1, qui
 * connaît tous les modèles posés (fichier `modeles.ini`) et en charge un à la
 * fois (`--models-max 1`), à la demande, sous le nom du catalogue de Helix
 * (« qwen3-4b ») : les notes, l'essai de santé et le sélecteur le
 * reconnaissent comme sous LM Studio. Il exige une clé (llamaCppBase.ts),
 * n'a ni interface web ni accès au réseau (`--no-webui`, `--offline`), et
 * libère la mémoire après vingt minutes sans question (`sleep-idle-seconds`),
 * comme le TTL posé à LM Studio. Réglages de Qwen pour Qwen3 quantifié
 * (fiche de Qwen/Qwen3-4B-GGUF, relue le 28/09/2026) : température 0,6,
 * top_k 20, top_p 0,95, min_p 0, pénalité de présence 1,5 ; 32 768 jetons de
 * conversation, une réponse à la fois (le processeur calcule).
 */

const VERSION = "b11146";
const DEPOT = "https://github.com/ggml-org/llama.cpp/releases/download";

const ARCHIVES: Record<string, { fichier: string; sha256: string; octets: number }> = {
  "darwin-x64": { fichier: "llama-b11146-bin-macos-x64.tar.gz", sha256: "305f0e3a17d2c01eb205cd0a62128357f1ec3b55329cb084d94e5ec0115d7a3b", octets: 11_237_237 },
  "darwin-arm64": { fichier: "llama-b11146-bin-macos-arm64.tar.gz", sha256: "1ad3f9eff80edb9dbef4259ad564d1720612ef7eea48fa4afed0e54f5f3d5711", octets: 11_189_714 },
};

export interface FichierGguf {
  depot: string;
  /** Révision figée du dépôt (relevée le 28/09/2026). */
  revision: string;
  fichier: string;
  sha256: string;
  octets: number;
  params: string;
}

/**
 * Les modèles que le moteur ouvert sait poser, par clé du catalogue de Helix
 * (provision.ts). Quantification Q4_K_M, celle que Qwen montre en premier ;
 * Qwen3 1.7B n'est publié qu'en Q8_0.
 */
export const MODELES_GGUF: Record<string, FichierGguf> = {
  "qwen3-1.7b": {
    depot: "Qwen/Qwen3-1.7B-GGUF",
    revision: "90862c4b9d2787eaed51d12237eafdfe7c5f6077",
    fichier: "Qwen3-1.7B-Q8_0.gguf",
    sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a",
    octets: 1_834_426_016,
    params: "1.7B",
  },
  "qwen3-4b": {
    depot: "Qwen/Qwen3-4B-GGUF",
    revision: "bc640142c66e1fdd12af0bd68f40445458f3869b",
    fichier: "Qwen3-4B-Q4_K_M.gguf",
    sha256: "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5",
    octets: 2_497_280_256,
    params: "4B",
  },
  "qwen3-8b": {
    depot: "Qwen/Qwen3-8B-GGUF",
    revision: "7c41481f57cb95916b40956ab2f0b139b296d974",
    fichier: "Qwen3-8B-Q4_K_M.gguf",
    sha256: "d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785",
    octets: 5_027_783_488,
    params: "8B",
  },
  "qwen/qwen3-30b-a3b": {
    depot: "Qwen/Qwen3-30B-A3B-GGUF",
    revision: "e4d4bafdfb96a411a163846265362aceb0b9c63a",
    fichier: "Qwen3-30B-A3B-Q4_K_M.gguf",
    sha256: "0d003f6662faee786ed5da3e31b29c978de5ae5d275c8794c606a7f3c01aa8f5",
    octets: 18_556_685_824,
    params: "30B",
  },
};

const cible = () => `${process.platform}-${process.arch}`;
const dossierVersion = () => join(racineLlamaCpp(), VERSION);
const dossierModeles = () => join(racineLlamaCpp(), "modeles");
const fichierPreset = () => join(racineLlamaCpp(), "modeles.ini");
const fichierJournal = () => join(racineLlamaCpp(), "serveur.log");
/** Le cache de modèles du routeur, vide : sans lui, il listerait ceux de `~/Library/Caches/llama.cpp`, posés par d'autres. */
const dossierCache = () => join(racineLlamaCpp(), "cache");

export const serveurLlamaCpp = (): string => join(dossierVersion(), "llama-server");
const cheminModele = (cle: string) => join(dossierModeles(), MODELES_GGUF[cle]!.fichier);

/** Le moteur est-il posé ? */
export const llamaCppInstalle = (): boolean => existsSync(serveurLlamaCpp());

/** Les modèles posés et vérifiés (un fichier n'a son nom définitif qu'une fois son empreinte vérifiée). */
export function modelesLlamaCpp(): string[] {
  return Object.keys(MODELES_GGUF).filter((cle) => existsSync(cheminModele(cle)));
}

/** Ce que la découverte ajoute à un modèle servi par le moteur ouvert (backends.ts). */
export function infoGguf(id: string): { sizeBytes: number; params: string; outils: true } | null {
  const f = MODELES_GGUF[id];
  return f ? { sizeBytes: f.octets, params: f.params, outils: true } : null;
}

export interface AvanceeLlama {
  message: string;
  percent?: number;
}

/* ── Téléchargement vérifié ────────────────────────────────────────────── */

/** Place libre sur le disque des données, en octets (`null` si illisible). */
function placeLibre(dossier: string): number | null {
  try {
    const s = statfsSync(dossier);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** Empreinte SHA-256 de ce qui est déjà sur le disque (reprise d'un téléchargement coupé). */
async function empreinteDe(chemin: string, hash: ReturnType<typeof createHash>): Promise<number> {
  let lus = 0;
  for await (const morceau of createReadStream(chemin)) {
    hash.update(morceau as Buffer);
    lus += (morceau as Buffer).length;
  }
  return lus;
}

/**
 * Télécharge `url` vers `destination`, en vérifiant taille et empreinte.
 *
 * Reprise : un `.partiel` laissé par un téléchargement coupé est relu (son
 * empreinte recalculée) puis complété par une requête `Range`. Pour les
 * 18 Go de Qwen3 30B A3B sur une connexion lente, repartir de zéro à chaque
 * coupure revenait à ne jamais finir. Arrêt quand plus rien n'arrive depuis
 * deux minutes, comme pour le moteur de LM Studio (engine.ts).
 */
async function telechargerVerifie(
  url: string,
  destination: string,
  attendu: { sha256: string; octets: number },
  avancer: (percent: number) => void,
): Promise<void> {
  const partiel = `${destination}.partiel`;
  const hash = createHash("sha256");
  let deja = 0;
  if (existsSync(partiel)) {
    deja = statSync(partiel).size;
    if (deja > attendu.octets) {
      rmSync(partiel, { force: true });
      deja = 0;
    } else {
      await empreinteDe(partiel, hash);
    }
  }

  // Déjà complet (coupé juste avant la vérification) : rien à redemander, `Range` rendrait 416.
  if (deja > 0 && deja === attendu.octets) {
    if (hash.digest("hex") === attendu.sha256) {
      renommer(partiel, destination);
      return;
    }
    rmSync(partiel, { force: true });
    return telechargerVerifie(url, destination, attendu, avancer);
  }

  const arret = new AbortController();
  let silence: NodeJS.Timeout | undefined;
  const veiller = () => {
    clearTimeout(silence);
    silence = setTimeout(() => arret.abort(), 2 * 60_000);
  };
  veiller();
  let reponse: Response;
  try {
    reponse = await fetch(url, { signal: arret.signal, headers: deja > 0 ? { Range: `bytes=${deja}-` } : {} });
  } catch {
    clearTimeout(silence);
    throw new Error(t("Le serveur de téléchargement est injoignable : vérifiez l'accès à internet de cette machine, puis réessayez."));
  }
  // Un serveur qui ignore la reprise renvoie tout (200) : on repart de zéro.
  if (deja > 0 && reponse.status === 200) deja = 0;
  const empreinte = deja > 0 ? hash : createHash("sha256");
  if (!reponse.ok || !reponse.body) {
    clearTimeout(silence);
    throw new Error(tf("Téléchargement impossible (HTTP {0}).", reponse.status));
  }

  let recu = deja;
  let dernier = -1;
  const flux = Readable.fromWeb(reponse.body as import("node:stream/web").ReadableStream<Uint8Array>);
  flux.on("data", (morceau: Buffer) => {
    veiller();
    empreinte.update(morceau);
    recu += morceau.length;
    if (recu > attendu.octets) flux.destroy(new Error("trop gros"));
    const p = Math.min(99, Math.floor((recu / attendu.octets) * 100));
    if (p !== dernier) {
      dernier = p;
      avancer(p);
    }
  });
  try {
    await pipeline(flux, createWriteStream(partiel, { mode: 0o600, flags: deja > 0 ? "a" : "w" }));
  } catch {
    throw new Error(t("Le téléchargement s'est interrompu (plus rien reçu depuis deux minutes, ou connexion coupée) : vérifiez la connexion, puis réessayez. Il reprendra où il s'est arrêté."));
  } finally {
    clearTimeout(silence);
  }
  if (recu !== attendu.octets || empreinte.digest("hex") !== attendu.sha256) {
    rmSync(partiel, { force: true });
    throw new Error(t("Le fichier téléchargé ne correspond pas à son empreinte publiée : il a été effacé sans être ouvert. Réessayez."));
  }
  renommer(partiel, destination);
}

/* ── Le moteur ─────────────────────────────────────────────────────────── */

let installationEnCours: Promise<string> | null = null;

/** Pose llama.cpp s'il ne l'est pas ; une installation à la fois. Rend le chemin de `llama-server`. */
export function installerLlamaCpp(avancer: (a: AvanceeLlama) => void): Promise<string> {
  if (llamaCppInstalle()) return Promise.resolve(serveurLlamaCpp());
  installationEnCours ??= poser(avancer).finally(() => {
    installationEnCours = null;
  });
  return installationEnCours;
}

async function poser(avancer: (a: AvanceeLlama) => void): Promise<string> {
  const attendu = ARCHIVES[cible()];
  if (!attendu) throw new Error(tf("Le moteur llama.cpp n'est pas prévu pour ce système ({0}).", cible()));
  mkdirSync(racineLlamaCpp(), { recursive: true, mode: 0o700 });
  // Dans un dossier à soi (0700), pas dans le dossier temporaire commun (même règle que rtk.ts).
  const travail = mkdtempSync(join(racineLlamaCpp(), ".telechargement-"));
  try {
    avancer({ message: t("Téléchargement du moteur..."), percent: 0 });
    const archive = join(travail, attendu.fichier);
    await telechargerVerifie(`${DEPOT}/${VERSION}/${attendu.fichier}`, archive, attendu, (p) =>
      avancer({ message: tf("Téléchargement du moteur... {0} %", p), percent: p }),
    );
    avancer({ message: t("Installation...") });
    const extrait = join(travail, "contenu");
    mkdirSync(extrait);
    const erreur = await new Promise<string | null>((resolve) =>
      execFile(tarDuSysteme(), ["-xf", archive, "-C", extrait], { timeout: 5 * 60_000 }, (err, _o, e) => resolve(err ? String(e || err.message) : null)),
    );
    // L'archive range tout sous `llama-b11146/` : le serveur et ses bibliothèques, côte à côte.
    const dedans = join(extrait, `llama-${VERSION}`);
    const serveur = join(dedans, "llama-server");
    if (erreur !== null || !existsSync(serveur)) {
      throw new Error(tf("Le moteur n'a pas pu être décompressé : {0}", (erreur ?? t("archive incomplète")).slice(-200)));
    }
    chmodSync(serveur, 0o755);
    // Essayé avant d'être mis en place : il doit démarrer et dire sa version.
    const essai = await new Promise<string>((resolve) =>
      execFile(serveur, ["--version"], { timeout: 30_000, env: envServeur() }, (err, o, e) => resolve(err ? "" : `${o}${e}`)),
    );
    if (!essai.includes(VERSION.slice(1))) throw new Error(t("Le moteur s'est installé mais ne démarre pas sur cette machine."));
    rmSync(dossierVersion(), { recursive: true, force: true });
    renommer(dedans, dossierVersion());
    console.log(`[helix] llama.cpp ${VERSION} posé dans ${dossierVersion()}.`);
    return serveurLlamaCpp();
  } finally {
    rmSync(travail, { recursive: true, force: true });
  }
}

/* ── Les modèles ───────────────────────────────────────────────────────── */

const telechargements = new Map<string, Promise<void>>();

/** Pose le modèle `cle` du catalogue (un téléchargement par modèle à la fois), puis le fait connaître au serveur. */
export function installerModeleLlama(cle: string, avancer: (a: AvanceeLlama) => void): Promise<void> {
  const f = MODELES_GGUF[cle];
  if (!f) return Promise.reject(new Error(tf("{0} n'est pas proposé avec le moteur llama.cpp.", cle)));
  if (existsSync(cheminModele(cle))) return Promise.resolve();
  let enCours = telechargements.get(cle);
  if (!enCours) {
    enCours = (async () => {
      mkdirSync(dossierModeles(), { recursive: true, mode: 0o700 });
      const partiel = `${cheminModele(cle)}.partiel`;
      const deja = existsSync(partiel) ? statSync(partiel).size : 0;
      const libre = placeLibre(dossierModeles());
      // 1 Go de marge au-delà du fichier : le système et le journal en ont besoin.
      if (libre !== null && libre < f.octets - deja + 1024 ** 3) {
        throw new Error(
          tf(
            "Pas assez de place sur le disque pour ce modèle : il faut {0} Go libres, il en reste {1}. Libérez de la place, puis réessayez.",
            ((f.octets - deja) / 1e9 + 1).toFixed(1),
            (libre / 1e9).toFixed(1),
          ),
        );
      }
      const url = `https://huggingface.co/${f.depot}/resolve/${f.revision}/${f.fichier}`;
      await telechargerVerifie(url, cheminModele(cle), f, (p) => avancer({ message: tf("Téléchargement de {0}... {1}%", cle, p), percent: p }));
      ecrirePreset();
      await rechargerListe();
    })().finally(() => telechargements.delete(cle));
    telechargements.set(cle, enCours);
  }
  return enCours;
}

/**
 * Le fichier des modèles connus du routeur, réécrit à chaque changement.
 * Chemins absolus (la documentation du serveur le conseille) ; rien n'y vient
 * d'une saisie : les noms sont ceux du catalogue écrit plus haut.
 */
function ecrirePreset(): void {
  const lignes = [
    "; Écrit par la passerelle Helix (gateway/src/llamaCpp.ts) : réécrit à chaque modèle posé.",
    "version = 1",
    "",
    "[*]",
    "c = 32768",
    "np = 1",
    "jinja = true",
    "temp = 0.6",
    "top-k = 20",
    "top-p = 0.95",
    "min-p = 0",
    "presence-penalty = 1.5",
    "sleep-idle-seconds = 1200",
    "",
  ];
  for (const cle of modelesLlamaCpp()) lignes.push(`[${cle}]`, `model = ${cheminModele(cle)}`, "");
  mkdirSync(racineLlamaCpp(), { recursive: true, mode: 0o700 });
  writeFileSync(fichierPreset(), lignes.join("\n"), { mode: 0o600 });
}

/* ── Le serveur ────────────────────────────────────────────────────────── */

let serveur: ChildProcess | null = null;
let demarrage: Promise<boolean> | null = null;

/**
 * L'environnement du serveur : le strict nécessaire. Il n'hérite pas de celui
 * de la passerelle, qui porte les secrets de l'instance (clés de
 * fournisseurs, jetons) : un modèle n'en a pas besoin.
 */
function envServeur(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { LLAMA_CACHE: dossierCache(), PATH: "/usr/bin:/bin:/usr/sbin:/sbin" };
  for (const nom of ["HOME", "TMPDIR", "LANG", "USER"]) if (process.env[nom]) env[nom] = process.env[nom];
  return env;
}

const entetes = () => ({ Authorization: `Bearer ${cleLlamaCpp()}` });

/** Le serveur répond-il, avec notre clé ? */
export async function llamaCppRepond(): Promise<boolean> {
  try {
    const r = await fetch(`${urlLlamaCpp()}/models`, { headers: entetes(), signal: AbortSignal.timeout(2000) });
    await r.body?.cancel().catch(() => {});
    return r.ok;
  } catch {
    return false;
  }
}

/** Quelqu'un d'autre écoute-t-il déjà ce port (sans notre clé) ? */
async function portPrisParUnAutre(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${portLlamaCpp()}/`, { signal: AbortSignal.timeout(1500) });
    await r.body?.cancel().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Démarre le serveur s'il ne tourne pas, et qu'il y a de quoi servir (moteur
 * et au moins un modèle posés). Rend vrai quand il répond.
 *
 * Un serveur laissé par une passerelle arrêtée brutalement répond encore avec
 * la même clé : il est gardé tel quel, plutôt qu'un second lancé à côté.
 */
export function assurerServeurLlama(): Promise<boolean> {
  if (!moteurOuvert() || !llamaCppInstalle() || modelesLlamaCpp().length === 0) return Promise.resolve(false);
  demarrage ??= lancer().finally(() => {
    demarrage = null;
  });
  return demarrage;
}

async function lancer(): Promise<boolean> {
  if (await llamaCppRepond()) return true;
  if (serveur && serveur.exitCode === null) return attendreReponse(20_000);
  if (await portPrisParUnAutre()) {
    console.warn(`[helix] llama.cpp : le port ${portLlamaCpp()} est déjà pris par un autre programme (HELIX_LLAMACPP_PORT pour en changer).`);
    return false;
  }
  cleLlamaCpp();
  ecrirePreset();
  mkdirSync(dossierCache(), { recursive: true, mode: 0o700 });
  // Le journal repart de zéro à chaque démarrage : il ne grossit pas sans fin.
  const journal = openSync(fichierJournal(), "w", 0o600);
  try {
    serveur = spawn(
      serveurLlamaCpp(),
      [
        "--models-preset", fichierPreset(),
        "--models-max", "1",
        "--host", "127.0.0.1",
        "--port", String(portLlamaCpp()),
        "--api-key-file", fichierCleLlamaCpp(),
        "--no-webui",
        "--offline",
      ],
      { cwd: racineLlamaCpp(), env: envServeur(), stdio: ["ignore", journal, journal], detached: false },
    );
  } finally {
    closeSync(journal);
  }
  const lui = serveur;
  lui.on("exit", (code, signal) => {
    if (serveur === lui) serveur = null;
    if (code !== 0 && signal !== "SIGTERM") console.warn(`[helix] llama.cpp s'est arrêté (code ${code ?? signal}) : voir ${fichierJournal()}.`);
  });
  lui.on("error", (err) => console.warn(`[helix] llama.cpp n'a pas pu démarrer : ${err.message}`));
  console.log(`[helix] llama.cpp démarré (PID ${lui.pid}) sur 127.0.0.1:${portLlamaCpp()}.`);
  return attendreReponse(20_000);
}

async function attendreReponse(delaiMs: number): Promise<boolean> {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (await llamaCppRepond()) return true;
    if (!serveur || serveur.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Relit la liste des modèles (après en avoir posé un) ; relance le serveur s'il ne le voit pas. */
async function rechargerListe(): Promise<void> {
  if (!(await llamaCppRepond())) {
    await assurerServeurLlama();
    return;
  }
  try {
    const r = await fetch(`${urlLlamaCpp().replace(/\/v1$/, "")}/models?reload=1`, { headers: entetes(), signal: AbortSignal.timeout(10_000) });
    const json = (await r.json()) as { data?: { id?: string }[] };
    const vus = new Set((json.data ?? []).map((m) => m.id));
    if (modelesLlamaCpp().every((c) => vus.has(c))) return;
  } catch {
    /* relance ci-dessous */
  }
  // Seul un serveur lancé par cette passerelle est relancé ; un autre garde sa liste jusqu'au prochain démarrage.
  if (serveur) {
    arreterLlama();
    await new Promise((r) => setTimeout(r, 500));
    await assurerServeurLlama();
  }
}

interface EtatRouteur {
  id?: string;
  status?: { value?: string; failed?: boolean; exit_code?: number };
}

async function etatDuModele(cle: string): Promise<EtatRouteur["status"] | null> {
  try {
    const r = await fetch(`${urlLlamaCpp().replace(/\/v1$/, "")}/models`, { headers: entetes(), signal: AbortSignal.timeout(5000) });
    const json = (await r.json()) as { data?: EtatRouteur[] };
    return json.data?.find((m) => m.id === cle)?.status ?? null;
  } catch {
    return null;
  }
}

/**
 * Charge `cle` en mémoire et attend qu'il soit prêt (le routeur décharge
 * l'autre). Sans cette attente, la première question partait pendant le
 * chargement, et l'écran ne disait rien : au processeur d'un Mac Intel, lire
 * 5 Go du disque prend plusieurs dizaines de secondes (estimation, pas une
 * mesure sur un Mac Intel).
 */
export async function chargerModeleLlama(cle: string, delaiMs = 5 * 60_000): Promise<{ ok: boolean; message: string }> {
  if (!(await assurerServeurLlama())) return { ok: false, message: t("Le moteur llama.cpp ne répond pas. Quittez l'application puis rouvrez-la ; si cela se répète, redémarrez la machine.") };
  const etat = await etatDuModele(cle);
  if (etat?.value === "loaded") return { ok: true, message: "" };
  if (etat?.value !== "loading") {
    try {
      const r = await fetch(`${urlLlamaCpp().replace(/\/v1$/, "")}/models/load`, {
        method: "POST",
        headers: { ...entetes(), "Content-Type": "application/json" },
        body: JSON.stringify({ model: cle }),
        signal: AbortSignal.timeout(30_000),
      });
      await r.body?.cancel().catch(() => {});
    } catch {
      /* l'état ci-dessous le dira */
    }
  }
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const s = await etatDuModele(cle);
    if (s?.value === "loaded") return { ok: true, message: "" };
    if (s?.failed) {
      return {
        ok: false,
        message: tf("{0} n'a pas pu être chargé par le moteur (code {1}) : la mémoire de cette machine ne suffit peut-être pas. Essayez un modèle plus léger.", cle, s.exit_code ?? "?"),
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, message: tf("{0} met trop de temps à se charger.", cle) };
}

/** Décharge `cle` de la mémoire (après un essai raté). */
export async function dechargerModeleLlama(cle: string): Promise<void> {
  try {
    const r = await fetch(`${urlLlamaCpp().replace(/\/v1$/, "")}/models/unload`, {
      method: "POST",
      headers: { ...entetes(), "Content-Type": "application/json" },
      body: JSON.stringify({ model: cle }),
      signal: AbortSignal.timeout(30_000),
    });
    await r.body?.cancel().catch(() => {});
  } catch {
    /* déjà déchargé, ou serveur arrêté */
  }
}

/** Arrête le serveur lancé par cette passerelle (par son PID ; le routeur arrête ses modèles). */
export function arreterLlama(): void {
  const lui = serveur;
  serveur = null;
  if (lui && lui.exitCode === null) {
    try {
      lui.kill("SIGTERM");
    } catch {
      /* déjà parti */
    }
  }
}

/** Efface les `.partiel` abandonnés d'un modèle qui n'est plus au catalogue (ménage, au démarrage). */
export function menageLlama(): void {
  try {
    const connus = new Set(Object.values(MODELES_GGUF).flatMap((f) => [f.fichier, `${f.fichier}.partiel`]));
    for (const nom of readdirSync(dossierModeles())) if (!connus.has(nom)) rmSync(join(dossierModeles(), nom), { force: true });
  } catch {
    /* pas encore de dossier */
  }
}
