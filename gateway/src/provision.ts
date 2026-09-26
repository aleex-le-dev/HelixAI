import { execFileSync, spawn } from "node:child_process";
import os from "node:os";
import { faireLaPlace, findLms, optionsDeChargement } from "./backends.ts";
import { nomProduit } from "./marque.ts";
import { t, tf } from "./langue.ts";

/**
 * Provisionnement automatique du modèle local (ARCHITECTURE.md, ADR-009).
 *
 * Objectif produit : si l'utilisateur choisit « local », il ne doit rien avoir
 * à configurer. La passerelle profile la machine, choisit un modèle adapté,
 * le télécharge et le charge — avec une progression visible.
 */

export interface Hardware {
  platform: NodeJS.Platform;
  arch: string;
  /** Mémoire totale, en gigaoctets. */
  totalMemoryGb: number;
  cpuCount: number;
  /** Apple Silicon : mémoire unifiée, donc utilisable par le GPU. */
  appleSilicon: boolean;
  /**
   * Mémoire de la carte graphique NVIDIA, en Go, sur Windows et Linux. Absente
   * sans carte NVIDIA (ou sans `nvidia-smi`) : la machine est alors traitée
   * comme calculant au processeur, ce qui est prudent.
   */
  gpuVramGb?: number;
}

/** Mémoire de la carte NVIDIA, lue par `nvidia-smi`. Indéfinie si absente. */
function memoireGraphique(platform: NodeJS.Platform): number | undefined {
  if (platform !== "win32" && platform !== "linux") return undefined;
  try {
    const sortie = execFileSync("nvidia-smi", ["--query-gpu=memory.total", "--format=csv,noheader,nounits"], {
      timeout: 3000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    // Plusieurs cartes : on retient la plus grosse, c'est elle qui portera le modèle.
    const mo = Math.max(...sortie.split("\n").map((l) => Number(l.trim())).filter((n) => Number.isFinite(n) && n > 0));
    return Number.isFinite(mo) ? Math.round((mo / 1024) * 10) / 10 : undefined;
  } catch {
    return undefined;
  }
}

export function detectHardware(): Hardware {
  const platform = os.platform();
  const arch = os.arch();
  const vram = memoireGraphique(platform);
  return {
    platform,
    arch,
    totalMemoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    cpuCount: os.cpus().length,
    appleSilicon: platform === "darwin" && arch === "arm64",
    ...(vram !== undefined ? { gpuVramGb: vram } : {}),
  };
}

export interface CatalogEntry {
  /** Identifiant de téléchargement compris par `lms get` (catalogue LM Studio). */
  key: string;
  label: string;
  /** Qui publie les poids. */
  editeur: string;
  licence: string;
  /** Taille approximative du téléchargement (les poids), en Go. */
  downloadGb: number;
  /**
   * Indice d'intelligence Artificial Analysis (v4.3.2, relevé le 23/09/2026),
   * en mode raisonnement quand le modèle en a un : c'est ainsi que Helix le
   * fait travailler par défaut.
   */
  intelligence: number;
  /** Architecture à experts : seule une petite partie des poids calcule, donc rapide même sans carte graphique. */
  moe?: boolean;
  /** Lit les images (captures, photos, documents scannés). */
  vision?: boolean;
  /**
   * Essayé avec Helix : niveaux de raisonnement, outils, découpage des tâches.
   * Seul un modèle vérifié est installé d'office ; les autres sont proposés,
   * en le disant.
   */
  verifie: boolean;
  /** Texte d'accompagnement, calculé dans la langue de la personne. */
  description: string;
}

type Fiche = Omit<CatalogEntry, "description">;

/*
 * Le catalogue.
 *
 * Choisi sur trois sources, relevées le 23/09/2026 :
 *  - le catalogue de LM Studio (lmstudio.ai/models) : ce qu'on peut installer
 *    d'un clic, avec la mémoire minimale publiée et les capacités (outils,
 *    raisonnement, images) ;
 *  - Artificial Analysis : l'indice d'intelligence, même échelle pour tous ;
 *  - la licence de chaque modèle : seulement des licences libres (Apache 2.0,
 *    MIT). Gemma, Llama et les licences « ouvertes » à conditions sont écartées :
 *    elles obligent à répercuter leurs restrictions dans chaque contrat client.
 *
 * Aucun éditeur n'est privilégié : à chaque taille de machine, c'est la note
 * qui départage. Qwen domine aujourd'hui presque toutes les tailles, mais
 * Mistral (France), OpenAI (gpt-oss), IBM et Meta sont au catalogue et
 * gagneront leur place s'ils dépassent. Modèles écartés parce qu'un autre fait
 * mieux pour la même mémoire : Qwen3.5 27B et Qwen3.6 27B (Qwen3.8 27B les
 * dépasse), Granite 4.1 30B, OLMo 3, LFM2, MiniMax M2 (121 Go pour 18,6),
 * Nemotron 3 (licence NVIDIA).
 */
const FICHES: Fiche[] = [
  /*
   * Pour les très grosses machines (Mac Studio de 256 Go et plus). Kimi K3
   * (43,6), GLM-5.3 (44,8) et MiniMax, plus forts encore, pèsent plusieurs
   * centaines de Go : ils ne tournent que sur un serveur à plusieurs cartes, et
   * s'utilisent dans Helix par un prestataire ou une clé, pas en local.
   */
  { key: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", editeur: "DeepSeek", licence: "MIT", downloadGb: 150, intelligence: 34.3, moe: true, verifie: false },
  { key: "qwen/qwen3.8-27b", label: "Qwen3.8 27B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 16, intelligence: 27.6, vision: true, verifie: false },
  { key: "qwen/qwen3.5-35b-a3b", label: "Qwen3.5 35B A3B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 20, intelligence: 19.3, moe: true, vision: true, verifie: false },
  { key: "zai-org/glm-4.7-flash", label: "GLM-4.7 Flash", editeur: "Zhipu (Z.ai)", licence: "MIT", downloadGb: 16, intelligence: 14.9, moe: true, verifie: false },
  { key: "meta/muse-glimmer", label: "Muse Glimmer", editeur: "Meta", licence: "Apache 2.0", downloadGb: 25, intelligence: 17.5, vision: true, verifie: false },
  { key: "qwen/qwen3.5-9b", label: "Qwen3.5 9B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 6, intelligence: 13.7, vision: true, verifie: true },
  { key: "qwen/qwen3.5-4b", label: "Qwen3.5 4B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 3, intelligence: 13.1, vision: true, verifie: false },
  { key: "openai/gpt-oss-20b", label: "gpt-oss 20B", editeur: "OpenAI", licence: "Apache 2.0", downloadGb: 12, intelligence: 9.5, moe: true, verifie: false },
  { key: "mistralai/magistral-small-2509", label: "Magistral Small", editeur: "Mistral AI", licence: "Apache 2.0", downloadGb: 14, intelligence: 8.6, vision: true, verifie: false },
  { key: "qwen/qwen3-32b", label: "Qwen3 32B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 19, intelligence: 8.6, verifie: true },
  { key: "qwen/qwen3-14b", label: "Qwen3 14B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 9, intelligence: 8.2, verifie: true },
  { key: "qwen/qwen3-30b-a3b", label: "Qwen3 30B A3B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 18, intelligence: 7.6, moe: true, verifie: true },
  { key: "qwen3-8b", label: "Qwen3 8B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 5, intelligence: 7.3, verifie: true },
  { key: "qwen3-4b", label: "Qwen3 4B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 2.5, intelligence: 7.2, verifie: true },
  { key: "qwen/qwen3.5-2b", label: "Qwen3.5 2B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 1.6, intelligence: 6.9, vision: true, verifie: false },
  { key: "ibm/granite-4.1-8b", label: "Granite 4.1 8B", editeur: "IBM", licence: "Apache 2.0", downloadGb: 5, intelligence: 6.6, verifie: false },
  { key: "mistralai/ministral-3-14b-reasoning", label: "Ministral 3 14B", editeur: "Mistral AI", licence: "Apache 2.0", downloadGb: 9, intelligence: 6.0, vision: true, verifie: false },
  { key: "qwen3-1.7b", label: "Qwen3 1.7B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 1.2, intelligence: 5.2, verifie: true },
  { key: "mistralai/ministral-3-8b", label: "Ministral 3 8B", editeur: "Mistral AI", licence: "Apache 2.0", downloadGb: 5.5, intelligence: 5.5, vision: true, verifie: false },
  { key: "allenai/olmo-3-7b-think", label: "OLMo 3 7B Think", editeur: "Ai2", licence: "Apache 2.0", downloadGb: 4.5, intelligence: 5.6, verifie: false },
  { key: "mistralai/ministral-3-3b", label: "Ministral 3 3B", editeur: "Mistral AI", licence: "Apache 2.0", downloadGb: 2.5, intelligence: 4.8, vision: true, verifie: false },
];

/**
 * Modèles capables de désigner un élément sur une capture d'écran (rôle
 * « gui »), pour le contrôle de l'écran. Qwen3-VL est le seul essayé à ce
 * geste ; les Qwen3.5 et suivants lisent les images mais n'ont pas encore été
 * éprouvés au pointage.
 */
const FICHES_ECRAN: Fiche[] = [
  { key: "qwen/qwen3-vl-30b", label: "Qwen3-VL 30B A3B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 18, intelligence: 9.5, moe: true, vision: true, verifie: true },
  { key: "qwen3-vl-8b", label: "Qwen3-VL 8B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 6, intelligence: 8.2, vision: true, verifie: true },
  { key: "qwen3-vl-4b", label: "Qwen3-VL 4B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 3.5, intelligence: 7.0, vision: true, verifie: true },
  { key: "qwen3-vl-2b", label: "Qwen3-VL 2B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 2, intelligence: 5.5, vision: true, verifie: true },
];

/**
 * Fiche plus description. La description est un accesseur : elle se calcule à
 * chaque lecture, donc dans la langue de la demande en cours. Calculée une fois
 * au chargement du module, elle resterait figée en français.
 */
function decrire(f: Fiche, ecran = false): CatalogEntry {
  return {
    ...f,
    get description() {
      const usage = ecran
        ? t("Lit l'écran et désigne les éléments à cliquer.")
        : f.vision
          ? t("Conversation, rédaction, outils et images.")
          : t("Conversation, rédaction et outils.");
      const note = tf("Note Artificial Analysis : {0}.", String(f.intelligence));
      const rapide = f.moe ? ` ${t("Rapide, même sans carte graphique.")}` : "";
      return `${usage} ${note}${rapide}`;
    },
  };
}

export const CATALOG: CatalogEntry[] = FICHES.map((f) => decrire(f));
export const VISION_CATALOG: CatalogEntry[] = FICHES_ECRAN.map((f) => decrire(f, true));

/**
 * Ce modèle tourne-t-il confortablement sur cette machine ?
 *
 * « Confortablement » : sans que l'ordinateur bascule sur le disque, ce qui le
 * fige tout entier (constaté chez le client le 23/09/2026). On compte les
 * poids plus 30 % pour le contexte, et on laisse au système et aux autres
 * applications 30 % de la mémoire (au moins 3 Go, au plus 8).
 *
 *  - Mac Apple Silicon : mémoire unifiée, la carte graphique s'en sert.
 *  - PC avec carte NVIDIA : un modèle dense doit tenir dans la mémoire de la
 *    carte ; un modèle à experts peut déborder sur la mémoire vive.
 *  - PC sans carte graphique : le processeur calcule, lentement. Seuls les
 *    petits modèles et ceux à experts restent utilisables.
 */
export function tientSur(hw: Hardware, f: { downloadGb: number; moe?: boolean }): boolean {
  const besoin = f.downloadGb * 1.3;
  const reserve = Math.min(8, Math.max(3, hw.totalMemoryGb * 0.3));
  if (hw.appleSilicon) return besoin + reserve <= hw.totalMemoryGb;
  const vram = hw.gpuVramGb ?? 0;
  if (vram >= 6) {
    if (f.moe) return besoin + reserve <= vram + hw.totalMemoryGb;
    return besoin <= vram;
  }
  if (f.moe) return besoin + reserve <= hw.totalMemoryGb;
  return f.downloadGb <= 5 && besoin + reserve <= hw.totalMemoryGb;
}

/** Ce que la machine peut faire tourner, du mieux noté au moins bien noté. */
function classement(hw: Hardware, catalogue: CatalogEntry[], verifiesSeulement: boolean): CatalogEntry[] {
  return catalogue
    .filter((e) => (!verifiesSeulement || e.verifie) && tientSur(hw, e))
    .sort((a, b) => b.intelligence - a.intelligence || a.downloadGb - b.downloadGb);
}

/**
 * Le modèle installé d'office : le mieux noté parmi ceux qui tiennent sur la
 * machine. À défaut, le plus léger vérifié.
 *
 * Pour converser, la note seule décide depuis le 25/09/2026, essayé avec
 * Helix ou non. Demandé par Medhi : « le but du logiciel est d'installer, en
 * fonction du PC, le meilleur modèle », même quand on n'a pas la machine pour
 * l'essayer. Avant, seuls les modèles essayés ici comptaient : sur un Mac de
 * 32 Go ou plus, Helix installait Qwen3.5 9B alors que Qwen3.8 27B, mieux
 * noté, tenait. Un modèle pas encore essayé le reste dit à l'écran
 * (`verifie`), et s'il ne se charge pas, les suivants du classement prennent
 * le relais (`replis`), jusqu'au plus léger vérifié.
 *
 * Pour piloter l'écran, même règle depuis le 26/09/2026 (Medhi : « pour tout,
 * tout doit s'adapter, et au pire toujours plusieurs modèles proposés ») : le
 * mieux noté qui tient est installé, et s'il ne se charge pas, les suivants,
 * jusqu'au plus léger essayé (Qwen3-VL). Un modèle qui lit les images sans
 * savoir désigner un point à l'écran clique à côté : l'écran le dit (« pas
 * encore vérifié avec Helix »), et les autres restent proposés.
 */
function best(hw: Hardware, catalogue: CatalogEntry[], verifiesSeulement = false): CatalogEntry {
  const verifies = catalogue.filter((e) => e.verifie).sort((a, b) => a.downloadGb - b.downloadGb);
  return classement(hw, catalogue, verifiesSeulement)[0] ?? verifies[0] ?? catalogue[catalogue.length - 1]!;
}

/** Modèles de repli si le conseillé ne se charge pas : les suivants du classement, puis le plus léger vérifié. */
export function replis(hw: Hardware, catalogue: CatalogEntry[], depart: CatalogEntry): CatalogEntry[] {
  const suite = classement(hw, catalogue, false).filter((e) => e.key !== depart.key);
  const leger = [...catalogue].filter((e) => e.verifie).sort((a, b) => a.downloadGb - b.downloadGb)[0];
  return [depart, ...suite, ...(leger && leger.key !== depart.key && !suite.includes(leger) ? [leger] : [])];
}

/**
 * Modèles que cette machine peut faire tourner, pour qu'on puisse en ajouter
 * un sans rien savoir des tailles ni de la mémoire.
 *
 * Voulu par le client : l'installation pose UN modèle adapté (plus la dictée),
 * pas « 150 modèles » ; les autres sont seulement proposés, et seulement ceux
 * qui conviennent à la machine : les trois mieux notés et le meilleur de
 * chaque autre éditeur pour converser, et le meilleur pour piloter l'écran.
 */
export function adaptesALaMachine(hw: Hardware): (CatalogEntry & { role: "chat" | "gui"; recommande: boolean })[] {
  const conseilChat = best(hw, CATALOG).key;
  const conseilEcran = best(hw, VISION_CATALOG).key;
  /*
   * Du choix, pas six variantes du même éditeur. Classés à la note seule, les
   * six premiers étaient presque tous des Qwen (le client : « ils proposent pas
   * des modèles Mistral ? »). On garde donc les trois mieux notés, puis le
   * meilleur de chaque autre éditeur que la machine peut faire tourner.
   */
  const tous = classement(hw, CATALOG, false);
  const tete = tous.slice(0, 3);
  const editeursVus = new Set(tete.map((e) => e.editeur));
  const unParEditeur = tous.filter((e) => {
    if (tete.includes(e) || editeursVus.has(e.editeur)) return false;
    editeursVus.add(e.editeur);
    return true;
  });
  return [
    ...[...tete, ...unParEditeur].map((e) => ({ ...e, role: "chat" as const, recommande: e.key === conseilChat })),
    // Plusieurs modèles d'écran proposés, pas un seul : si le conseillé déçoit, on en installe un autre d'un clic.
    ...classement(hw, VISION_CATALOG, false)
      .slice(0, 3)
      .map((e) => ({ ...e, role: "gui" as const, recommande: e.key === conseilEcran })),
  ];
}

export function recommend(hw: Hardware): CatalogEntry {
  return best(hw, CATALOG);
}

/**
 * Modèle d'écran conseillé. La contrainte mémoire s'ajoute à celle du modèle de
 * conversation : les deux tournent en même temps quand Cowork pilote l'écran.
 */
export function recommendVision(hw: Hardware): CatalogEntry {
  return best(hw, VISION_CATALOG);
}

/** Délai d'inactivité au bout duquel un modèle libère la mémoire. */
const TTL_SECONDES = 20 * 60;

export type ProvisionPhase =
  | "idle"
  | "checking"
  | "downloading"
  | "loading"
  | "ready"
  | "error";

export interface ProvisionState {
  phase: ProvisionPhase;
  message: string;
  /** Progression du téléchargement, de 0 à 100 quand elle est connue. */
  percent?: number;
  model?: string;
  error?: string;
}

// Message vide au repos : il est écrit au moment de le lire, dans la langue de qui le lit.
let state: ProvisionState = { phase: "idle", message: "" };
const listeners = new Set<(s: ProvisionState) => void>();

export function getProvisionState(): ProvisionState {
  if (state.phase === "idle" && !state.message) return { ...state, message: t("En attente.") };
  return state;
}

export function onProvisionChange(fn: (s: ProvisionState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Permet aux autres étapes de mise en route (moteur) de publier leur progression. */
export function setProvisionState(next: Partial<ProvisionState>): void {
  setState(next);
}

function setState(next: Partial<ProvisionState>): void {
  state = { ...state, ...next };
  for (const fn of listeners) fn(state);
}

/** Extrait un pourcentage d'une ligne de sortie de `lms get`. */
function parsePercent(line: string): number | undefined {
  const match = line.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (!match) return undefined;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
}

function run(
  command: string,
  args: string[],
  onLine: (line: string) => void,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const handle = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      for (const line of text.split(/\r?\n|\r/)) {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      }
    };
    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("close", (code) => resolve({ ok: code === 0, output }));
    child.on("error", (err) => resolve({ ok: false, output: String(err) }));
  });
}

/**
 * Installe et charge un modèle de conversation si aucun n'est disponible.
 * Idempotent : si un modèle est déjà chargé, l'appel se termine aussitôt.
 */
/** Le message d'échec traduit-il un manque de mémoire plutôt qu'une panne ? */
function isResourceError(output: string): boolean {
  return /insufficient system resources|not enough memory|overload/i.test(output);
}

/**
 * Décharge les modèles résidents autres que celui demandé, et renvoie combien
 * ont été libérés. Les embarquements sont épargnés : ils pèsent quelques
 * dizaines de mégaoctets et servent à la recherche documentaire.
 */
async function unloadOthers(lms: string, garder: string): Promise<number> {
  const { output } = await run(lms, ["ps", "--json"], () => {});
  let charges: { modelKey?: string; path?: string; type?: string }[] = [];
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) charges = parsed;
  } catch {
    return 0;
  }

  let liberes = 0;
  for (const entree of charges) {
    const cle = entree.modelKey ?? entree.path;
    if (!cle || cle === garder) continue;
    if (/embed/i.test(cle) || entree.type === "embedding") continue;
    const res = await run(lms, ["unload", cle], () => {});
    if (res.ok) {
      liberes += 1;
      console.log(`[helix] ${cle} déchargé pour libérer la mémoire.`);
    }
  }
  return liberes;
}

/**
 * Un seul provisionnement à la fois.
 *
 * Deux téléchargements du même modèle se ralentissent l'un l'autre sans jamais
 * finir : c'est arrivé en développement, où un double clic suffisait.
 */
let enCours: Promise<ProvisionState> | null = null;

/** Un `lms get` tourne-t-il déjà pour ce modèle, lancé par une session passée ? */
async function dejaEnTelechargement(key: string): Promise<boolean> {
  const { ok } = await run("/usr/bin/pgrep", ["-f", `lms get ${key}`], () => {});
  return ok;
}

export function ensureLocalModel(
  requested?: string,
  catalogue: CatalogEntry[] = CATALOG,
): Promise<ProvisionState> {
  if (enCours) return enCours;
  enCours = provision(requested, catalogue).finally(() => {
    enCours = null;
  });
  return enCours;
}

async function provision(
  requested?: string,
  catalogue: CatalogEntry[] = CATALOG,
): Promise<ProvisionState> {
  const lms = await findLms();
  if (!lms) {
    setState({
      phase: "error",
      message: t("LM Studio est introuvable sur cette machine."),
      error:
        "Installez LM Studio (lmstudio.ai) puis relancez : " + nomProduit() + " s'occupe du reste.",
    });
    return state;
  }

  const hw = detectHardware();
  const start = requested
    ? (catalogue.find((c) => c.key === requested) ?? best(hw, catalogue))
    : best(hw, catalogue);

  setState({
    phase: "checking",
    message: t("Vérification des modèles disponibles..."),
    model: start.key,
    percent: undefined,
    error: undefined,
  });

  // Un modèle déjà chargé en mémoire suffit : ne rien refaire.
  const loadedNow = await run(lms, ["ps"], () => {});
  if (loadedNow.output.includes(start.key)) {
    setState({ phase: "ready", message: tf("{0} est déjà prêt.", start.label), percent: 100 });
    return state;
  }

  const installed = await run(lms, ["ls"], () => {});

  // On tente le modèle recommandé, puis les plus légers si la machine refuse.
  const candidates = replis(hw, catalogue, start);

  for (const choice of candidates) {
    setState({ model: choice.key, error: undefined });

    if (!installed.output.includes(choice.key)) {
      /*
       * Un redémarrage de la passerelle laisse le téléchargement précédent
       * tourner tout seul : en relancer un second doublerait la charge réseau
       * pour le même fichier.
       */
      if (await dejaEnTelechargement(choice.key)) {
        setState({
          phase: "downloading",
          message: tf("Téléchargement de {0} déjà en cours, reprise du suivi...", choice.label),
          percent: undefined,
        });
        return state;
      }

      setState({
        phase: "downloading",
        message: tf("Téléchargement de {0} (~{1} Go)...", choice.label, choice.downloadGb),
        percent: 0,
      });

      const got = await run(lms, ["get", choice.key, "--yes"], (line) => {
        const percent = parsePercent(line);
        if (percent !== undefined) {
          setState({
            percent,
            message: tf("Téléchargement de {0}... {1}%", choice.label, Math.round(percent)),
          });
        }
      });

      if (!got.ok) {
        setState({
          phase: "error",
          message: tf("Le téléchargement de {0} a échoué.", choice.label),
          error: got.output.slice(-400),
        });
        return state;
      }
    }

    setState({
      phase: "loading",
      message: tf("Chargement de {0} en mémoire...", choice.label),
      percent: undefined,
    });

    /*
     * `--ttl` : un modèle inutilisé pendant 20 minutes se décharge tout seul.
     *
     * Sans cela les modèles s'empilent — conversation, vision, embarquements —
     * et une machine de 16 Go bascule en mémoire virtuelle : le modèle de
     * vision met alors plusieurs minutes à lire une capture au lieu d'une
     * vingtaine de secondes.
     */
    const charger = () =>
      run(lms, ["load", choice.key, "--yes", "--ttl", String(TTL_SECONDES), ...optionsDeChargement()], () => {});

    // Pas à côté d'un autre modèle si les deux ne tiennent pas : le Mac se figerait (voir backends.ts).
    await faireLaPlace(lms, choice.key);
    let loaded = await charger();

    /*
     * Mémoire refusée alors qu'un autre modèle occupe la place : sur une
     * machine de 16 Go, conversation et vision ne tiennent pas ensemble. On
     * libère les autres avant d'abandonner — sinon l'utilisateur qui revient
     * de Cowork vers le Chat se heurterait à un refus qu'il ne peut pas
     * comprendre ni résoudre.
     */
    if (!loaded.ok && isResourceError(loaded.output)) {
      const liberes = await unloadOthers(lms, choice.key);
      if (liberes > 0) {
        setState({
          phase: "loading",
          message: tf("Libération de la mémoire, puis chargement de {0}...", choice.label),
        });
        loaded = await charger();
      }
    }

    if (loaded.ok) {
      setState({ phase: "ready", message: tf("{0} est prêt.", choice.label), percent: 100 });
      return state;
    }

    // Mémoire toujours insuffisante : on redescend d'un cran plutôt que d'échouer.
    if (isResourceError(loaded.output) && choice !== candidates[candidates.length - 1]) {
      setState({
        phase: "checking",
        message: tf("{0} est trop lourd pour cette machine, essai d'un modèle plus léger...", choice.label),
      });
      continue;
    }

    setState({
      phase: "error",
      message: t("Le chargement du modèle a échoué."),
      error: loaded.output.slice(-400),
    });
    return state;
  }

  setState({
    phase: "error",
    message: t("Aucun modèle n'a pu être chargé sur cette machine."),
  });
  return state;
}
