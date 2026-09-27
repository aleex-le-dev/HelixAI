import { execFileSync, spawn } from "node:child_process";
import os from "node:os";
import { readdirSync, statSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { backendById, faireLaPlace, findLms, lmStudioRepond, optionsDeChargement } from "./backends.ts";
import { nomProduit } from "./marque.ts";
import { langue, t, tf } from "./langue.ts";
import { noteDuModele } from "./notesModeles.ts";
import { dossierLmStudio, moteurAPoser, preparerDossiersLlmster } from "./engine.ts";
import { aEssayer, essayerModele, estDefaillant, nomDuModele, noterCoupure, noterEssai, type Verdict } from "./santeModeles.ts";
import { autoProvisionEnabled } from "./deployment.ts";
import { invalidate, resolve } from "./router.ts";
import type { ModelInfo } from "./types.ts";

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

/*
 * Lue une fois par démarrage (audit Windows du 27/09/2026) : `detectHardware`
 * est appelé d'une quinzaine d'endroits, et chaque appel attendait
 * `nvidia-smi` (jusqu'à 3 s), la passerelle entière bloquée pendant ce temps.
 * La mémoire d'une carte ne change pas en cours de route.
 */
let vramLue: { valeur: number | undefined } | null = null;

/** Mémoire de la carte NVIDIA, lue par `nvidia-smi`. Indéfinie si absente. */
function memoireGraphique(platform: NodeJS.Platform): number | undefined {
  if (platform !== "win32" && platform !== "linux") return undefined;
  if (vramLue) return vramLue.valeur;
  vramLue = { valeur: lireMemoireGraphique() };
  return vramLue.valeur;
}

function lireMemoireGraphique(): number | undefined {
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

/**
 * Le modèle doit-il calculer au processeur ? Windows ou Linux sans carte
 * NVIDIA vue par `nvidia-smi` : c'est ainsi que `tientSur` choisit déjà le
 * modèle, et c'est là qu'il est chargé (`--gpu off`, backends.ts, 27/09/2026).
 */
export function calculSurProcesseur(hw: Hardware): boolean {
  return (hw.platform === "win32" || hw.platform === "linux") && hw.gpuVramGb === undefined;
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
   * Note ECI d'Epoch AI (notesModeles.ts, relevé du 27/09/2026), lue par le
   * nom du modèle. Absente quand Epoch ne note pas ce modèle : c'est le cas des
   * plus petits (Qwen3 4B, Qwen3.5 4B, Ministral 3…), et rien ne la remplace.
   */
  eci?: number;
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
 * Choisi sur trois sources, relevées le 23/09/2026 (la note, le 27/09/2026) :
 *  - le catalogue de LM Studio (lmstudio.ai/models) : ce qu'on peut installer
 *    d'un clic, avec la mémoire minimale publiée et les capacités (outils,
 *    raisonnement, images) ;
 *  - l'indice ECI d'Epoch AI (CC BY 4.0, notesModeles.ts) : une seule échelle
 *    pour tous, quand le modèle y figure ;
 *  - la licence de chaque modèle : seulement des licences libres (Apache 2.0,
 *    MIT). Gemma, Llama et les licences « ouvertes » à conditions sont écartées :
 *    elles obligent à répercuter leurs restrictions dans chaque contrat client.
 *
 * Aucun éditeur n'est privilégié : à chaque taille de machine, c'est la note
 * qui départage. Qwen domine aujourd'hui presque toutes les tailles, mais
 * Mistral (France), OpenAI (gpt-oss), IBM et Meta sont au catalogue et
 * gagneront leur place s'ils dépassent. Modèles écartés parce qu'un autre fait
 * mieux pour la même mémoire : Qwen3.5 27B et Qwen3.6 27B (Qwen3.8 27B les
 * dépasse), Granite 4.1 30B, OLMo 3, LFM2, MiniMax M2 (121 Go),
 * Nemotron 3 (licence NVIDIA).
 */
const FICHES: Fiche[] = [
  /*
   * Pour les très grosses machines (Mac Studio de 256 Go et plus). Kimi K3
   * (ECI 157,7), GLM-5.3 (155,6) et MiniMax, plus forts encore, pèsent plusieurs
   * centaines de Go : ils ne tournent que sur un serveur à plusieurs cartes, et
   * s'utilisent dans Helix par un prestataire ou une clé, pas en local.
   */
  { key: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", editeur: "DeepSeek", licence: "MIT", downloadGb: 150, moe: true, verifie: false },
  { key: "qwen/qwen3.8-27b", label: "Qwen3.8 27B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 16, vision: true, verifie: false },
  { key: "qwen/qwen3.5-35b-a3b", label: "Qwen3.5 35B A3B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 20, moe: true, vision: true, verifie: false },
  { key: "zai-org/glm-4.7-flash", label: "GLM-4.7 Flash", editeur: "Zhipu (Z.ai)", licence: "MIT", downloadGb: 16, moe: true, verifie: false },
  { key: "meta/muse-glimmer", label: "Muse Glimmer", editeur: "Meta", licence: "Apache 2.0", downloadGb: 25, vision: true, verifie: false },
  { key: "qwen/qwen3.5-9b", label: "Qwen3.5 9B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 6, vision: true, verifie: true },
  { key: "qwen/qwen3.5-4b", label: "Qwen3.5 4B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 3, vision: true, verifie: false },
  { key: "openai/gpt-oss-20b", label: "gpt-oss 20B", editeur: "OpenAI", licence: "Apache 2.0", downloadGb: 12, moe: true, verifie: false },
  { key: "mistralai/magistral-small-2509", label: "Magistral Small", editeur: "Mistral AI", licence: "Apache 2.0", downloadGb: 14, vision: true, verifie: false },
  { key: "qwen/qwen3-32b", label: "Qwen3 32B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 19, verifie: true },
  { key: "qwen/qwen3-14b", label: "Qwen3 14B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 9, verifie: true },
  { key: "qwen/qwen3-30b-a3b", label: "Qwen3 30B A3B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 18, moe: true, verifie: true },
  { key: "qwen3-8b", label: "Qwen3 8B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 5, verifie: true },
  { key: "qwen3-4b", label: "Qwen3 4B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 2.5, verifie: true },
  { key: "qwen/qwen3.5-2b", label: "Qwen3.5 2B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 1.6, vision: true, verifie: false },
  { key: "ibm/granite-4.1-8b", label: "Granite 4.1 8B", editeur: "IBM", licence: "Apache 2.0", downloadGb: 5, verifie: false },
  { key: "mistralai/ministral-3-14b-reasoning", label: "Ministral 3 14B", editeur: "Mistral AI", licence: "Apache 2.0", downloadGb: 9, vision: true, verifie: false },
  { key: "qwen3-1.7b", label: "Qwen3 1.7B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 1.2, verifie: true },
  { key: "mistralai/ministral-3-8b", label: "Ministral 3 8B", editeur: "Mistral AI", licence: "Apache 2.0", downloadGb: 5.5, vision: true, verifie: false },
  { key: "allenai/olmo-3-7b-think", label: "OLMo 3 7B Think", editeur: "Ai2", licence: "Apache 2.0", downloadGb: 4.5, verifie: false },
  { key: "mistralai/ministral-3-3b", label: "Ministral 3 3B", editeur: "Mistral AI", licence: "Apache 2.0", downloadGb: 2.5, vision: true, verifie: false },
];

/**
 * Modèles capables de désigner un élément sur une capture d'écran (rôle
 * « gui »), pour le contrôle de l'écran. Qwen3-VL est le seul essayé à ce
 * geste ; les Qwen3.5 et suivants lisent les images mais n'ont pas encore été
 * éprouvés au pointage.
 */
const FICHES_ECRAN: Fiche[] = [
  { key: "qwen/qwen3-vl-30b", label: "Qwen3-VL 30B A3B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 18, moe: true, vision: true, verifie: true },
  { key: "qwen3-vl-8b", label: "Qwen3-VL 8B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 6, vision: true, verifie: true },
  { key: "qwen3-vl-4b", label: "Qwen3-VL 4B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 3.5, vision: true, verifie: true },
  { key: "qwen3-vl-2b", label: "Qwen3-VL 2B", editeur: "Alibaba (Qwen)", licence: "Apache 2.0", downloadGb: 2, vision: true, verifie: true },
];

/**
 * Fiche plus description. La description est un accesseur : elle se calcule à
 * chaque lecture, donc dans la langue de la demande en cours. Calculée une fois
 * au chargement du module, elle resterait figée en français.
 */
function decrire(f: Fiche, ecran = false): CatalogEntry {
  const eci = f.eci ?? noteDuModele(f.key)?.eci;
  return {
    ...f,
    ...(eci !== undefined ? { eci } : {}),
    get description() {
      const usage = ecran
        ? t("Lit l'écran et désigne les éléments à cliquer.")
        : f.vision
          ? t("Conversation, rédaction, outils et images.")
          : t("Conversation, rédaction et outils.");
      const note =
        eci !== undefined
          ? tf("Note ECI d'Epoch AI : {0}.", eci.toLocaleString(({ fr: "fr-FR", zh: "zh-CN" } as Record<string, string>)[langue()] ?? "en-US"))
          : t("Pas de note publiée par Epoch AI pour ce modèle.");
      const rapide = f.moe ? ` ${t("Rapide, même sans carte graphique.")}` : "";
      // La note sur sa propre ligne (Medhi, 27/09/2026) : collée à la phrase, elle se coupait au milieu.
      return `${usage}${rapide}\n${note}`;
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

/**
 * Ce que la machine peut faire tourner, du mieux noté au moins bien noté.
 *
 * Un modèle noté passe devant un modèle sans note (27/09/2026, passage à
 * l'indice d'Epoch AI) : on ne lui prête pas une note qu'il n'a pas. Entre
 * deux modèles sans note, le plus lourd d'abord, comme le fait déjà le
 * sélecteur (« la note si elle existe, le poids sinon ») : à famille égale, un
 * modèle plus gros répond mieux. Conséquence mesurée sur le catalogue : sur un
 * PC de 16 Go sans carte graphique, Qwen3 8B (noté 136,2) passe devant
 * Qwen3.5 4B (non noté), qui passait devant avec l'ancien relevé ; sur un Mac
 * ou un PC de 8 Go, où aucun modèle noté ne tient, Qwen3.5 4B reste le premier.
 *
 * Sans les modèles qui ont mal répondu sur cette machine (santeModeles.ts,
 * 27/09/2026) : ils ne sont plus installés, recommandés ni proposés d'office.
 * On peut toujours les choisir à la main.
 */
function classement(hw: Hardware, catalogue: CatalogEntry[], verifiesSeulement: boolean): CatalogEntry[] {
  return catalogue
    .filter((e) => (!verifiesSeulement || e.verifie) && tientSur(hw, e) && !estDefaillant(e.key))
    .sort((a, b) => {
      if (a.eci !== undefined && b.eci !== undefined) return b.eci - a.eci || a.downloadGb - b.downloadGb;
      if (a.eci !== undefined) return -1;
      if (b.eci !== undefined) return 1;
      return b.downloadGb - a.downloadGb;
    });
}

/** Le plus léger des modèles vérifiés, hors ceux qui ont mal répondu ici (tous, s'ils ont tous mal répondu). */
function legerVerifie(catalogue: CatalogEntry[]): CatalogEntry | undefined {
  const verifies = catalogue.filter((e) => e.verifie).sort((a, b) => a.downloadGb - b.downloadGb);
  return verifies.find((e) => !estDefaillant(e.key)) ?? verifies[0];
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
  return classement(hw, catalogue, verifiesSeulement)[0] ?? legerVerifie(catalogue) ?? catalogue[catalogue.length - 1]!;
}

/**
 * Modèles de repli si le conseillé ne se charge pas, ou répond mal à l'essai :
 * les suivants du classement, puis le plus léger vérifié. Ceux qui ont déjà
 * mal répondu sur cette machine n'y sont pas (sauf le départ, s'il a été
 * demandé nommément : il est alors réessayé).
 */
export function replis(hw: Hardware, catalogue: CatalogEntry[], depart: CatalogEntry): CatalogEntry[] {
  const suite = classement(hw, catalogue, false).filter((e) => e.key !== depart.key);
  const leger = legerVerifie(catalogue);
  const garderLeger = leger && leger.key !== depart.key && !suite.includes(leger) && !estDefaillant(leger.key);
  return [depart, ...suite, ...(garderLeger ? [leger] : [])];
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
  silenceMaxMs?: number,
  activite?: () => number,
): Promise<{ ok: boolean; output: string; muet?: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    /*
     * `silenceMaxMs` : plus rien de la commande pendant ce temps, elle est
     * arrêtée. Un `lms get` bloqué par une coupure du réseau gardait sinon
     * l'écran sur le même pourcentage, et toute nouvelle tentative attendait
     * derrière lui (revue du 27/09/2026).
     */
    let muet = false;
    let garde: NodeJS.Timeout | undefined;
    const armer = () => {
      if (!silenceMaxMs) return;
      clearTimeout(garde);
      garde = setTimeout(() => {
        muet = true;
        child.kill();
      }, silenceMaxMs);
    };
    armer();
    /*
     * `activite` : une mesure qui bouge tant que le travail avance (la taille
     * des fichiers du modèle). Un `lms` qui n'écrit rien sans terminal (celui
     * de llmster sous Linux, pas vérifié) n'est donc pas coupé tant que le
     * téléchargement grossit (revue Linux du 27/09/2026).
     */
    let derniere = activite?.();
    const sonde = activite
      ? setInterval(() => {
          const v = activite();
          if (v !== derniere) {
            derniere = v;
            armer();
          }
        }, 30_000)
      : undefined;
    const handle = (chunk: Buffer) => {
      armer();
      const text = chunk.toString();
      output += text;
      for (const line of text.split(/\r?\n|\r/)) {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      }
    };
    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("close", (code) => {
      clearTimeout(garde);
      clearInterval(sonde);
      resolve({ ok: code === 0 && !muet, output, muet });
    });
    child.on("error", (err) => {
      clearTimeout(garde);
      clearInterval(sonde);
      resolve({ ok: false, output: String(err) });
    });
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

/** Taille totale, en octets, des modèles et téléchargements en cours du moteur : elle grossit tant qu'un téléchargement avance. */
function tailleDesModeles(): number {
  let total = 0;
  const parcourir = (dossier: string, profondeur: number) => {
    let entrees: Dirent[] = [];
    try {
      entrees = readdirSync(dossier, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory() && profondeur < 4) parcourir(chemin, profondeur + 1);
      else if (e.isFile()) {
        try {
          total += statSync(chemin).size;
        } catch {
          /* disparu entre-temps */
        }
      }
    }
  };
  const racine = dossierLmStudio();
  parcourir(join(racine, "models"), 0);
  parcourir(join(racine, ".internal", "temp-downloads"), 0);
  return total;
}

/** Un `lms get` tourne-t-il déjà pour ce modèle, lancé par une session passée ? */
async function dejaEnTelechargement(key: string): Promise<boolean> {
  /*
   * Pas de `pgrep` sous Windows : un `lms get` y est l'enfant de la passerelle,
   * et meurt sans doute avec elle (supposé, pas vu sur un vrai PC). On n'y
   * reprend donc rien (revue Windows du 27/09/2026).
   */
  if (process.platform === "win32") return false;
  const { ok } = await run("/usr/bin/pgrep", ["-f", `lms get ${key}`], () => {});
  return ok;
}

/**
 * L'essai du modèle qu'on vient de charger (santeModeles.ts, 27/09/2026) :
 * une courte question, un verdict, noté pour cette machine. Réussi : l'écran
 * dit « prêt ». Raté : le modèle est déchargé et l'écran dit lequel suit.
 */
async function essaiReussi(lms: string, choice: CatalogEntry, suivant: CatalogEntry | undefined): Promise<boolean> {
  setState({
    phase: "loading",
    message: tf("Vérification de {0} : une courte question d'essai...", choice.label),
    percent: undefined,
  });
  const backend = backendById("lmstudio");
  // Sans serveur connu, rien à essayer : le modèle est pris tel quel, comme avant.
  const verdict: Verdict = backend ? await essayerModele(backend.baseUrl, choice.key, backend.apiKey) : { ok: true, indecis: "sans serveur" };
  noterEssai(choice.key, verdict);
  if (verdict.ok) {
    setState({ phase: "ready", message: tf("{0} est prêt.", choice.label), percent: 100 });
    return true;
  }
  await run(lms, ["unload", choice.key], () => {});
  invalidate();
  if (suivant) {
    setState({
      phase: "checking",
      message: tf("{0} ne répond pas correctement sur cette machine, essai de {1}...", choice.label, suivant.label),
    });
  }
  return false;
}

/**
 * Poste déjà installé (27/09/2026) : le modèle conseillé pour cette machine,
 * s'il est déjà là mais n'a jamais été essayé, passe l'essai une fois, au
 * démarrage de la passerelle. S'il répond mal, la mise en route prend le
 * suivant d'elle-même, téléchargement compris : c'est ce qui fait basculer le
 * PC de Medhi, où Qwen3.5 4B était installé, sans rien réinstaller.
 *
 * Rien si le modèle conseillé n'est pas installé (on n'installe rien de neuf
 * au démarrage), ni sans serveur local qui réponde, ni quand l'intégrateur
 * prépare les modèles.
 */
export async function verifierModeleEnPlace(): Promise<void> {
  if (enCours || !autoProvisionEnabled()) return;
  if (!backendById("lmstudio")?.enabled || !(await lmStudioRepond())) return;
  const lms = await findLms();
  if (!lms || moteurAPoser()) return;
  const conseil = best(detectHardware(), CATALOG);
  if (!aEssayer(conseil.key)) return;
  const installes = await run(lms, ["ls"], () => {});
  if (!installes.ok || !installes.output.includes(conseil.key)) return;
  console.log(`[helix] ${conseil.key} n'a jamais été essayé sur cette machine : essai au démarrage.`);
  await ensureLocalModel();
  invalidate();
}

/** Deux identifiants désignent-ils le même modèle (avec ou sans éditeur, copie « :2 ») ? */
const memeModele = (a: string, b: string) => nomDuModele(a) === nomDuModele(b);

/**
 * Ce qui prend le relais d'un modèle qui vient d'être noté défaillant sur
 * cette machine, dit en une phrase pour le Chat.
 *
 *  - Un autre modèle est là : en « Auto », c'est lui qui répondra ensuite ;
 *    avec un modèle choisi à la main, la personne garde son choix, et on lui
 *    dit comment en changer.
 *  - Aucun autre : la mise en route en installe un adapté à la machine, en
 *    arrière-plan (hors déploiement piloté par l'intégrateur).
 */
export async function relaisApresDefaillance(modele: string, auto: boolean): Promise<string> {
  invalidate();
  const r = await resolve({ role: "chat" });
  const autre = "error" in r || memeModele(r.model.id, modele) || estDefaillant(r.model.id) ? null : r.model;
  if (autre) {
    return auto
      ? tf("En « Auto », {0} n'est plus choisi sur cette machine : la prochaine réponse viendra de {1}.", modele, autre.id)
      : tf("{0} n'est plus choisi d'office sur cette machine ; il reste sélectionné pour ce Chat : passez en « Auto » ou choisissez un autre modèle.", modele);
  }
  if (autoProvisionEnabled() && !enCours) {
    void ensureLocalModel()
      .then(() => invalidate())
      .catch((err: unknown) => console.error("[helix] relais après défaillance", err));
    return tf("{0} n'est plus choisi d'office sur cette machine, et {1} installe un modèle qui lui convient : les réponses suivantes viendront de lui dès qu'il sera prêt.", modele, nomProduit());
  }
  return tf("{0} n'est plus choisi d'office sur cette machine, et aucun autre modèle n'y est installé.", modele);
}

/**
 * Une réponse d'un modèle local vient d'être coupée par le garde-fou (chat.ts) :
 * noté pour cette machine. La phrase rendue complète le message du Chat.
 */
export async function apresCoupure(model: ModelInfo, auto: boolean): Promise<string> {
  if (model.backendKind !== "lmstudio") return "";
  const etat = noterCoupure(model.id);
  if (etat === "douteux") return tf("Si cela se reproduit, {0} ne sera plus choisi d'office sur cette machine.", model.id);
  if (etat !== "defaillant") return "";
  console.warn(`[helix] ${model.id} noté défaillant sur cette machine : deux réponses parties en boucle.`);
  return `${t("C'est la deuxième fois sur cette machine.")} ${await relaisApresDefaillance(model.id, auto)}`;
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
  // `lms` sans moteur qu'il sache démarrer (Mac à puce Apple, engine.ts) : le moteur est à installer.
  if (!lms || moteurAPoser()) {
    setState({
      phase: "error",
      message: t("LM Studio est introuvable sur cette machine."),
      error: tf("Installez le moteur depuis l'écran de mise en route, ou LM Studio depuis lmstudio.ai (ouvrez-le une fois), puis relancez : {0} s'occupe du reste.", nomProduit()),
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

  /*
   * Un modèle déjà chargé en mémoire suffit : ne rien refaire. Sauf s'il n'a
   * jamais été essayé sur cette machine (poste installé avant l'essai, comme
   * le PC de Medhi, 27/09/2026) : l'essai se fait alors une fois, sans le
   * recharger, et un modèle qui répond mal cède la place au suivant.
   */
  const loadedNow = await run(lms, ["ps"], () => {});
  const dejaCharge = loadedNow.output.includes(start.key);
  if (dejaCharge && !aEssayer(start.key)) {
    setState({ phase: "ready", message: tf("{0} est déjà prêt.", start.label), percent: 100 });
    return state;
  }

  let installed = await run(lms, ["ls"], () => {});

  // On tente le modèle recommandé, puis les plus légers si la machine refuse ou s'il répond mal.
  const candidates = replis(hw, catalogue, start);
  /** Le prochain qui sera vraiment essayé après `apres`, pour le dire à l'écran. */
  const suivantDe = (apres: CatalogEntry): CatalogEntry | undefined =>
    candidates.slice(candidates.indexOf(apres) + 1).find((c) => c.downloadGb < plafondGo && !estDefaillant(c.key));

  /*
   * Après un refus faute de mémoire, seuls les modèles plus légers que celui
   * refusé : le classement suit la note, pas la taille, et sur un Mac de
   * 24 Go le « plus léger » après Qwen3.5 4B (3 Go) était gpt-oss 20B (12 Go),
   * téléchargé pour rien (revue du 27/09/2026).
   */
  let plafondGo = Infinity;
  /*
   * Le dernier échec autre que la mémoire (téléchargement, chargement refusé) :
   * le modèle suivant est essayé, comme le promet `replis`, et c'est cet échec
   * que l'écran montre si aucun ne passe. Avant, seul un manque de mémoire
   * faisait passer au suivant (revue du 27/09/2026).
   */
  let echec: { message: string; error: string } | null = null;
  for (const choice of candidates) {
    if (choice.downloadGb >= plafondGo) continue;
    // Noté défaillant pendant cette mise en route, ou avant : pas réessayé d'office.
    if (choice !== start && estDefaillant(choice.key)) continue;
    setState({ model: choice.key, error: undefined });

    // Déjà en mémoire, jamais essayé : directement à l'essai.
    if (choice === start && dejaCharge) {
      if (await essaiReussi(lms, choice, suivantDe(choice))) return state;
      echec = {
        message: tf("{0} ne répond pas correctement sur cette machine.", choice.label),
        error: t("Aucun autre modèle adapté à cette machine ne reste à essayer. Choisissez-en un dans le sélecteur de modèles du Chat, ou branchez un modèle par une clé."),
      };
      continue;
    }

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
        /*
         * Celui d'un lancement précédent, que personne ne suit plus : il est
         * arrêté, et un nouveau `lms get` repart avec sa progression à l'écran
         * (le suivre sans rien voir laissait l'écran sur « reprise du suivi »
         * pour toujours, 27/09/2026). Que LM Studio reprenne là où l'ancien
         * s'était arrêté n'a pas été vérifié ; au pire, il recommence.
         */
        await run("/usr/bin/pkill", ["-f", `lms get ${choice.key}`], () => {});
        await new Promise((r) => setTimeout(r, 2000));
        installed = await run(lms, ["ls"], () => {});
      }
    }

    if (!installed.output.includes(choice.key)) {
      setState({
        phase: "downloading",
        message: tf("Téléchargement de {0} (~{1} Go)...", choice.label, choice.downloadGb),
        percent: 0,
      });

      // Dix minutes sans un mot de `lms` : téléchargement arrêté, dit comme tel.
      const got = await run(lms, ["get", choice.key, "--yes"], (line) => {
        const percent = parsePercent(line);
        if (percent !== undefined) {
          setState({
            percent,
            message: tf("Téléchargement de {0}... {1}%", choice.label, Math.round(percent)),
          });
        }
      }, 10 * 60_000, tailleDesModeles);

      if (!got.ok) {
        const message = tf("Le téléchargement de {0} a échoué.", choice.label);
        // Réseau muet : un autre modèle n'irait pas mieux, on le dit tout de suite.
        if (got.muet) {
          setState({ phase: "error", message, error: t("Plus aucune progression depuis dix minutes : vérifiez la connexion, puis réessayez.") });
          return state;
        }
        console.error(`[helix] téléchargement de ${choice.key} refusé : ${got.output.slice(-400)}`);
        echec = { message, error: got.output.slice(-400) };
        continue;
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
    /*
     * Le dossier interne du moteur sans interface, juste avant de charger
     * (27/09/2026) : ce chemin appelait `lms load` sans passer par le
     * démarrage du moteur, qui seul le recréait, et le chargement échouait
     * (`ENOENT … .internal/temp`) quand la mise en route arrivait la première.
     */
    preparerDossiersLlmster();
    let loaded = await charger();
    // Échec sans manque de mémoire (moteur encore en train de démarrer) : une seconde tentative, et la vraie réponse au journal.
    if (!loaded.ok && !isResourceError(loaded.output)) {
      console.error(`[helix] chargement de ${choice.key} refusé : ${loaded.output.slice(-400)}`);
      await new Promise((r) => setTimeout(r, 3000));
      preparerDossiersLlmster();
      loaded = await charger();
    }

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
      if (await essaiReussi(lms, choice, suivantDe(choice))) return state;
      // Mal répondu : noté, déchargé, et le suivant est essayé (ou l'échec dit, s'il n'y en a plus).
      echec = {
        message: tf("{0} ne répond pas correctement sur cette machine.", choice.label),
        error: t("Aucun autre modèle adapté à cette machine ne reste à essayer. Choisissez-en un dans le sélecteur de modèles du Chat, ou branchez un modèle par une clé."),
      };
      continue;
    }

    // Mémoire toujours insuffisante : on redescend d'un cran plutôt que d'échouer.
    if (isResourceError(loaded.output)) {
      // Dans tous les cas : après un refus faute de mémoire, jamais plus lourd (relu le 27/09/2026).
      plafondGo = Math.min(plafondGo, choice.downloadGb);
    }
    if (isResourceError(loaded.output) && candidates.some((c) => c.downloadGb < choice.downloadGb)) {
      setState({
        phase: "checking",
        message: tf("{0} est trop lourd pour cette machine, essai d'un modèle plus léger...", choice.label),
      });
      continue;
    }

    console.error(`[helix] chargement de ${choice.key} refusé : ${loaded.output.slice(-400)}`);
    echec = {
      message: isResourceError(loaded.output) ? t("Aucun modèle n'a pu être chargé sur cette machine.") : t("Le chargement du modèle a échoué."),
      error: loaded.output.slice(-400),
    };
  }

  setState({
    phase: "error",
    message: echec?.message ?? t("Aucun modèle n'a pu être chargé sur cette machine."),
    error: echec?.error,
  });
  return state;
}
