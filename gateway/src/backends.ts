import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { homedir, totalmem } from "node:os";
import { BACKENDS, classifyRoles, isReasoningModel, tousLesBackends } from "./config.ts";
import type { BackendConfig, BackendStatus, ModelInfo } from "./types.ts";
import { t, tf } from "./langue.ts";

const exec = promisify(execFile);

/** Emplacements usuels du binaire `lms` (LM Studio l'ajoute rarement au PATH). */
const LMS_CANDIDATES = [
  `${homedir()}/.lmstudio/bin/lms`,
  `${homedir()}/.cache/lm-studio/bin/lms`,
  "lms",
];

let lmsPathCache: string | null | undefined;

/**
 * Oublie l'emplacement mémorisé de `lms`.
 *
 * Indispensable après l'installation du moteur : au démarrage, `findLms` a
 * mémorisé « absent », et sans cet oubli l'étape suivante croirait encore que
 * LM Studio n'est pas là — juste après l'avoir installé.
 */
export function oublierLms(): void {
  lmsPathCache = undefined;
  dernierEssai = 0;
}

/** Localise le binaire `lms`, ou `null` s'il est absent. */
export async function findLms(): Promise<string | null> {
  if (lmsPathCache !== undefined) return lmsPathCache;
  for (const candidate of LMS_CANDIDATES) {
    try {
      await exec(candidate, ["version"], { timeout: 5000 });
      lmsPathCache = candidate;
      return candidate;
    } catch {
      /* candidat suivant */
    }
  }
  lmsPathCache = null;
  return null;
}

interface LmsModelEntry {
  modelKey?: string;
  /** « idle » au repos ; autre chose pendant un calcul. */
  status?: string;
  path?: string;
  sizeBytes?: number;
  paramsString?: string;
  architecture?: string;
  type?: string;
  /** Déclaré par LM Studio : le modèle lit-il les images ? */
  vision?: boolean;
  /** Déclaré par LM Studio : le modèle a-t-il appris à appeler des outils ? */
  trainedForToolUse?: boolean;
  /** `lms ls` : plus grande taille de conversation acceptée ; `lms ps` : celle du chargement en cours. */
  maxContextLength?: number;
  contextLength?: number;
}

/**
 * Métadonnées enrichies des modèles LM Studio (taille, paramètres, archi, chargé).
 * Utilise `lms ls --json` et `lms ps --json`. Échec silencieux : la passerelle
 * fonctionne sans, avec moins d'informations.
 */
async function lmStudioMetadata(): Promise<Map<string, Partial<ModelInfo>>> {
  const meta = new Map<string, Partial<ModelInfo>>();
  const lms = await findLms();
  if (!lms) return meta;

  const parse = async (args: string[]): Promise<LmsModelEntry[]> => {
    try {
      const { stdout } = await exec(lms, args, { timeout: 8000, maxBuffer: 4 * 1024 * 1024 });
      const parsed = JSON.parse(stdout);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  for (const entry of await parse(["ls", "--json"])) {
    const key = entry.modelKey ?? entry.path;
    if (!key) continue;
    meta.set(key, {
      sizeBytes: entry.sizeBytes,
      params: entry.paramsString,
      arch: entry.architecture,
      loaded: false,
      ...(entry.type ? { nature: entry.type } : {}),
      ...(typeof entry.vision === "boolean" ? { voit: entry.vision } : {}),
      ...(typeof entry.trainedForToolUse === "boolean" ? { outils: entry.trainedForToolUse } : {}),
      ...(typeof entry.maxContextLength === "number" ? { contexteMax: entry.maxContextLength } : {}),
      // Rangé par l'entraînement sous son propre éditeur (entrainement.ts).
      ...((entry.path ?? "").startsWith("helix-entrainement/") ? { entraine: true } : {}),
    });
  }

  for (const entry of await parse(["ps", "--json"])) {
    const key = entry.modelKey ?? entry.path;
    if (!key) continue;
    meta.set(key, {
      ...(meta.get(key) ?? {}),
      loaded: true,
      ...(typeof entry.contextLength === "number" ? { contexteCharge: entry.contextLength } : {}),
    });
  }

  return meta;
}

async function fetchJson(
  url: string,
  apiKey?: string,
  timeoutMs = 4000,
  entetes: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { ...entetes, ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------- démarrage de LM Studio -------------------------- */

/**
 * Le serveur local de LM Studio ne tourne pas toujours : il s'arrête quand
 * l'utilisateur quitte l'application, et ne revient pas seul après un
 * redémarrage. Sans lui, Helix n'a plus aucun modèle et l'utilisateur devrait
 * aller le relancer à la main — exactement ce qu'un logiciel installé ne doit
 * pas demander.
 *
 * On le démarre donc nous-mêmes, sans bruit.
 */
const LMSTUDIO_URL = BACKENDS.find((b) => b.id === "lmstudio")?.baseUrl ?? "";

/** Ne pas relancer en boucle quand la machine n'a tout simplement pas LM Studio. */
let dernierEssai = 0;
const DELAI_ENTRE_ESSAIS_MS = 30_000;

async function repond(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/models`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * S'assure que le serveur LM Studio écoute. Renvoie `true` s'il répond à la
 * sortie, que ce soit parce qu'il tournait déjà ou parce qu'on l'a démarré.
 */
export async function ensureLmStudioServer(): Promise<boolean> {
  if (!LMSTUDIO_URL) return false;
  if (await repond(LMSTUDIO_URL)) return true;

  const maintenant = Date.now();
  if (maintenant - dernierEssai < DELAI_ENTRE_ESSAIS_MS) return false;
  dernierEssai = maintenant;

  const lms = await findLms();
  if (!lms) return false;

  /*
   * Ne rien démarrer si le serveur tourne déjà. `/models` peut ne pas
   * répondre en 1,5 s alors que le serveur est bien là : occupé à lire un long
   * contexte, ou servant une autre adresse que celle-ci. `lms server start`
   * sur un serveur en marche le **redémarre** : toutes les réponses en cours
   * sont coupées net (« Client disconnected. Stopping generation »). Vu le
   * 23/09/2026 : des Chats coupés en plein plan, avec « terminated ».
   */
  try {
    const { stdout } = await exec(lms, ["server", "status", "--json"], { timeout: 10_000 });
    const etat = JSON.parse(String(stdout).trim() || "{}") as { running?: boolean };
    if (etat.running) return false;
  } catch {
    /*
     * Statut illisible (ancienne version de `lms`, ou commande en échec quand
     * le serveur est arrêté) : on garde le comportement d'avant, démarrer.
     */
  }

  try {
    console.log("[helix] serveur LM Studio arrêté, démarrage...");
    await exec(lms, ["server", "start"], { timeout: 30_000 });
  } catch {
    // Peut échouer si LM Studio n'est pas installé ou pas encore initialisé.
    return false;
  }

  // Le serveur met un instant à écouter : on lui laisse le temps.
  for (let i = 0; i < 10; i++) {
    if (await repond(LMSTUDIO_URL)) {
      console.log("[helix] serveur LM Studio démarré.");
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Modèles que cette instance a chargés elle-même (loadModel). */
const chargesParHelix = new Set<string>();

/**
 * À la fermeture : rendre la mémoire, sans casser le travail des autres.
 *
 * On arrêtait le serveur LM Studio s'il avait été démarré par Helix. Mais il
 * est partagé : l'agent personnel de la personne (OpenClaw), une seconde
 * instance, LM Studio lui-même s'en servent. Mesuré le 24/09/2026 : une
 * instance qui s'arrêtait a coupé le serveur sous les autres, et leurs
 * réponses en cours ont été perdues. On ne décharge donc que les modèles
 * chargés par cette instance, et seulement s'ils sont au repos ; le serveur
 * reste allumé.
 */
/*
 * Synchrone : à l'arrêt du processus, une promesse n'aurait pas le temps
 * d'aboutir.
 */
export function stopLmStudioIfStarted(): void {
  if (!lmsPathCache || chargesParHelix.size === 0) return;
  let enMemoire: LmsModelEntry[] = [];
  try {
    enMemoire = JSON.parse(execFileSync(lmsPathCache, ["ps", "--json"], { timeout: 8000, encoding: "utf8" })) as LmsModelEntry[];
  } catch {
    return;
  }
  for (const e of enMemoire) {
    const cle = e.modelKey ?? e.path ?? "";
    if (!chargesParHelix.has(cle) || (e.status && e.status !== "idle")) continue;
    try {
      execFileSync(lmsPathCache, ["unload", cle], { timeout: 10_000, stdio: "ignore" });
      console.log(`[helix] ${cle} déchargé à la fermeture.`);
    } catch {
      /* déjà parti */
    }
  }
}

export interface Discovery {
  backends: BackendStatus[];
  models: ModelInfo[];
}

/** Interroge tous les backends activés et agrège leurs modèles. */
export async function discover(): Promise<Discovery> {
  const enabled = tousLesBackends()
    .filter((b) => b.enabled)
    .sort((a, b) => a.priority - b.priority);

  // Un backend LM Studio activé mais muet : on tente de le réveiller avant de
  // conclure qu'il n'y a aucun modèle.
  if (enabled.some((b) => b.id === "lmstudio")) await ensureLmStudioServer();

  const lmMeta = await lmStudioMetadata();

  const results = await Promise.all(
    enabled.map(async (backend): Promise<{ status: BackendStatus; models: ModelInfo[] }> => {
      const started = Date.now();
      try {
        // Un fournisseur cloud répond moins vite qu'un serveur local, et rend des centaines de modèles.
        const distant = backend.origine === "agence" || backend.origine === "cle";
        const payload = (await fetchJson(
          `${backend.baseUrl}/models`,
          backend.apiKey,
          distant ? 8000 : 4000,
          backend.entetes,
        )) as {
          data?: { id: string }[];
        };
        const retenus = backend.modeles ? new Set(backend.modeles) : null;
        // Google préfixe ses identifiants (« models/gemini-… ») mais les attend sans préfixe.
        const entries = (payload.data ?? [])
          .map((m) => ({ ...m, id: m.id.replace(/^models\//, "") }))
          .filter((m) => !retenus || retenus.has(m.id));
        /*
         * Ce que l'API de LM Studio liste est **chargé**, par définition : elle
         * ne montre que les modèles en mémoire. On l'écrit donc tel quel, sans
         * s'en remettre à `lms ps`.
         *
         * Pourquoi c'est important : `lms ps` a un délai de huit secondes, et
         * un LM Studio occupé à répondre le dépasse. La commande échouait
         * alors en silence, tous les modèles passaient pour « non chargés »,
         * et la passerelle rechargeait celui qui tournait déjà — LM Studio en
         * ouvrait une seconde copie (« qwen3-8b:2 », 5 Go de plus) et la
         * machine saturait. Observé chez le client le 23/09/2026.
         */
        const models = entries.map((m) => ({
          ...toModelInfo(m.id, backend, lmMeta),
          ...(backend.kind === "lmstudio" ? { loaded: true } : {}),
        }));

        /*
         * LM Studio ne liste par son API que les modèles **chargés** en
         * mémoire. Ceux qui dorment sur le disque restaient donc invisibles —
         * et le Chat ne pouvait pas s'en servir, même quand ils étaient les
         * seuls capables de faire ce qu'on lui demandait.
         *
         * Cas réel qui l'a montré : une capture d'écran envoyée en mode Auto.
         * Trois modèles de vision étaient téléchargés sur la machine ; aucun
         * n'était chargé ; l'image est partie vers le seul modèle chargé, qui
         * ne voit pas les images, et il a répondu « je n'ai pas
         * l'information ». On ajoute donc les modèles relevés par `lms ls`,
         * marqués non chargés : la passerelle les charge au moment de s'en
         * servir (chat.ts), et le sélecteur les montre.
         */
        if (backend.kind === "lmstudio") {
          const deja = new Set(models.map((m) => m.id));
          for (const [cle, info] of lmMeta) {
            if (deja.has(cle)) continue;
            if (info.nature === "embedding" || /embed/i.test(cle)) continue;
            models.push(toModelInfo(cle, backend, lmMeta));
          }
        }
        return {
          status: {
            id: backend.id,
            label: backend.label,
            kind: backend.kind,
            baseUrl: backend.baseUrl,
            online: true,
            latencyMs: Date.now() - started,
            modelCount: models.length,
          },
          models,
        };
      } catch (err) {
        return {
          status: {
            id: backend.id,
            label: backend.label,
            kind: backend.kind,
            baseUrl: backend.baseUrl,
            online: false,
            error: err instanceof Error ? err.message : String(err),
            modelCount: 0,
          },
          models: [],
        };
      }
    }),
  );

  return {
    backends: results.map((r) => r.status),
    models: results.flatMap((r) => r.models),
  };
}

function toModelInfo(
  id: string,
  backend: BackendConfig,
  lmMeta: Map<string, Partial<ModelInfo>>,
): ModelInfo {
  const extra = backend.kind === "lmstudio" ? lmMeta.get(id) ?? {} : {};
  /*
   * Ce que LM Studio déclare l'emporte sur ce que le nom laisse deviner.
   *
   * Les rôles viennent d'abord de motifs sur l'identifiant (« -vl- » veut
   * dire vision). C'est une supposition ; LM Studio, lui, **sait** — il lit
   * les fichiers du modèle. Quand il se prononce, on le suit, dans les deux
   * sens : un « gemma-3 » sans projecteur d'images n'est pas un modèle de
   * vision, quoi qu'en dise son nom.
   */
  let roles = classifyRoles(id);
  if (extra.voit === true && !roles.includes("vision")) roles = [...roles, "vision"];
  if (extra.voit === false) roles = roles.filter((r) => r !== "vision" && r !== "gui");
  /*
   * Le code aussi : un modèle de conversation que LM Studio déclare entraîné à
   * appeler des outils (`trainedForToolUse`) sait travailler en agent de code,
   * quel que soit son nom. Vu le 26/09/2026 : le rôle ne venait que du nom
   * (« coder », « qwen3 », « glm »…), et un poste qui n'avait que Mistral,
   * gpt-oss ou Granite, pourtant installés par Helix, n'avait « aucun modèle
   * disponible » dans Code.
   */
  // Sauf un modèle fait pour l'écran (Qwen3-VL, UI-TARS…) : LM Studio le déclare lui aussi « outils », et il code mal.
  if (extra.outils === true && roles.includes("chat") && !roles.includes("code") && !/-vl-|\bvl\b|ui-?tars|open-?cua|embed|nomic|rerank/i.test(id)) {
    roles = [...roles, "code"];
  }
  return {
    id,
    uid: `${backend.id}/${id}`,
    backendId: backend.id,
    backendLabel: backend.label,
    backendKind: backend.kind,
    roles,
    reasoning: isReasoningModel(id),
    origine: backend.origine ?? "local",
    ...(backend.proprietaire ? { proprietaire: backend.proprietaire } : {}),
    ...(backend.pays ? { pays: backend.pays } : {}),
    ...(backend.fournisseur ? { fournisseur: backend.fournisseur } : {}),
    ...extra,
  };
}

export function backendById(id: string): BackendConfig | undefined {
  return tousLesBackends().find((b) => b.id === id);
}

/** Durée d'inactivité au bout de laquelle un modèle libère la mémoire. */
const TTL_SECONDES = "1200";

/**
 * Taille de conversation et parallélisme au chargement, selon la mémoire.
 *
 * Sans rien préciser, LM Studio prenait de grands défauts : Qwen3 8B chargé
 * avec 28 160 jetons de contexte occupait 12 Go pour 5 Go de poids, et le
 * modèle de vision avait 4 réponses en parallèle, chacune avec sa mémoire.
 * Mesuré le 24/09/2026 sur un Mac de 16 Go : la machine saturait dès que
 * Cowork et un Chat tournaient ensemble. 16 384 jetons suffisent à une
 * conversation avec outils et à une tâche d'écran (une capture en coûte
 * environ 1 000) ; au-delà de 32 Go, on laisse les défauts.
 */
/*
 * Jamais moins de 32 768 jetons : mesuré le 24/09/2026, les consignes de
 * l'agent de code (OpenCode, outils compris) en font à elles seules environ
 * 18 000. Avec 16 384, réglé le matin même pour gagner de la mémoire, Code ne
 * pouvait plus rien faire sur un Mac de 16 Go. La mémoire se gagne par la
 * requête unique, pas par un contexte trop court.
 */
export function optionsDeChargement(): string[] {
  const go = totalmem() / 1024 ** 3;
  if (go <= 18) return ["--context-length", "32768", "--parallel", "1"];
  if (go <= 36) return ["--context-length", "32768", "--parallel", "2"];
  return [];
}

/** Le refus vient-il d'un manque de mémoire plutôt que d'une panne ? */
const manqueDeMemoire = (texte: string) =>
  /insufficient system resources|not enough memory|overload/i.test(texte);

/**
 * Décharge les modèles résidents autres que celui demandé.
 *
 * Les modèles d'embarquement sont épargnés : quelques dizaines de mégaoctets,
 * et ils servent à la recherche documentaire.
 */
async function unloadOthers(lms: string, garder: string): Promise<number> {
  let charges: LmsModelEntry[] = [];
  try {
    const { stdout } = await exec(lms, ["ps", "--json"], { timeout: 8000 });
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) charges = parsed;
  } catch {
    return 0;
  }

  /*
   * Un modèle en train de répondre n'est pas déchargé sous les pieds de qui
   * s'en sert : LM Studio est partagé (autre instance, agent personnel de la
   * personne). Mesuré le 24/09/2026 : des déchargements pendant les réponses
   * d'un autre programme. On attend qu'il ait fini, 45 s au plus ; au-delà,
   * on le laisse, et le chargement se fera à côté.
   */
  const occupe = (e: LmsModelEntry) => Boolean(e.status && e.status !== "idle");
  for (let i = 0; i < 15 && charges.some((e) => (e.modelKey ?? e.path) !== garder && occupe(e)); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const { stdout } = await exec(lms, ["ps", "--json"], { timeout: 8000 });
      const relu = JSON.parse(stdout);
      if (Array.isArray(relu)) charges = relu;
    } catch {
      break;
    }
  }

  let liberes = 0;
  for (const entree of charges) {
    const cle = entree.modelKey ?? entree.path;
    if (!cle || cle === garder) continue;
    if (/embed/i.test(cle) || entree.type === "embedding") continue;
    if (occupe(entree)) {
      console.log(`[helix] ${cle} est en train de répondre : il n'est pas déchargé.`);
      continue;
    }
    try {
      await exec(lms, ["unload", cle], { timeout: 30_000 });
      liberes += 1;
      console.log(`[helix] ${cle} déchargé pour libérer la mémoire.`);
    } catch {
      /* déjà parti, ou refus : on continue */
    }
  }
  return liberes;
}

/**
 * Libère la mémoire avant de charger `modelKey`, si les deux ne tiennent pas
 * ensemble. Sert au chargement à la demande et à l'installation.
 */
export async function faireLaPlace(lms: string, modelKey: string, enMemoire?: LmsModelEntry[]): Promise<void> {
  let charges = enMemoire;
  if (!charges) {
    try {
      const { stdout } = await exec(lms, ["ps", "--json"], { timeout: 15_000 });
      const lu = JSON.parse(stdout);
      charges = Array.isArray(lu) ? lu : [];
    } catch {
      charges = [];
    }
  }
  /*
   * Place d'abord, chargement ensuite.
   *
   * Avant, le nouveau modèle était chargé À CÔTÉ de celui déjà en mémoire, et
   * on ne libérait la place que si LM Studio refusait. Or LM Studio refuse
   * rarement : il accepte, puis la machine bascule sur le disque (swap) et
   * tout l'ordinateur se fige, pas seulement Helix. Constaté sur un Mac de
   * 16 Go : Qwen3 8B résident + Qwen3-VL 8B chargé pour lire une image.
   *
   * On estime donc l'empreinte (poids + environ 30 % pour le contexte) et on
   * vide la mémoire avant de charger si l'ensemble dépasse 45 % de la RAM : le
   * système, le navigateur et les autres applications gardent le reste.
   */
  const empreinte = (octets: number) => octets * 1.3;
  let tailleNouveau = 0;
  try {
    const { stdout } = await exec(lms, ["ls", "--json"], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 });
    const liste = JSON.parse(stdout) as LmsModelEntry[];
    // Le catalogue dit « qwen3-vl-4b », LM Studio range « qwen/qwen3-vl-4b » : le suffixe suffit.
    const meme = (cle?: string) => Boolean(cle) && (cle === modelKey || cle!.endsWith(`/${modelKey}`));
    tailleNouveau = liste.find((e) => meme(e.modelKey) || meme(e.path))?.sizeBytes ?? 0;
  } catch {
    /* inconnue : on raisonne comme si le modèle était gros */
  }
  const resident = charges
    .filter((e) => e.type !== "embedding" && !/embed/i.test(e.modelKey ?? e.path ?? ""))
    .reduce((somme, e) => somme + empreinte(e.sizeBytes ?? 0), 0);
  const budget = totalmem() * 0.45;
  const nouveau = tailleNouveau > 0 ? empreinte(tailleNouveau) : budget;
  if (resident > 0 && resident + nouveau > budget) {
    await unloadOthers(lms, modelKey);
  }
}

/**
 * Fait de la place avant une création d'image (images.ts) : le modèle
 * d'images ne passe pas par LM Studio, qui ne sait donc pas qu'il arrive.
 * Même règle que `faireLaPlace` : si les modèles de conversation résidents
 * plus l'image dépassent 80 % de la mémoire, on décharge ceux qui sont au
 * repos, jamais un modèle en train de répondre. LM Studio les rechargera à la
 * prochaine question.
 */
export async function libererPourImage(octets: number): Promise<number> {
  const lms = await findLms();
  if (!lms) return 0;
  let charges: LmsModelEntry[] = [];
  try {
    const { stdout } = await exec(lms, ["ps", "--json"], { timeout: 15_000 });
    const lu = JSON.parse(stdout);
    charges = Array.isArray(lu) ? lu : [];
  } catch {
    return 0;
  }
  const resident = charges
    .filter((e) => e.type !== "embedding" && !/embed/i.test(e.modelKey ?? e.path ?? ""))
    .reduce((somme, e) => somme + (e.sizeBytes ?? 0) * 1.3, 0);
  if (resident === 0 || resident + octets <= totalmem() * 0.8) return 0;
  return unloadOthers(lms, "");
}

/** Charge un modèle en mémoire via `lms load` (provisionnement transparent). */
export async function loadModel(modelKey: string): Promise<{ ok: boolean; message: string }> {
  const lms = await findLms();
  if (!lms) return { ok: false, message: t("LM Studio (lms) introuvable sur cette machine.") };

  /*
   * Déjà en mémoire ? Alors on ne charge rien : `lms load` sur un modèle
   * chargé n'échoue pas, il en ouvre une **copie** (« qwen3-8b:2 »). Et si on
   * ne peut pas le vérifier — LM Studio trop occupé pour répondre à `lms ps` —
   * on s'abstient aussi : mieux vaut que la demande échoue et le dise qu'une
   * copie de plusieurs gigaoctets qui fait tomber tout le reste.
   */
  let enMemoire: LmsModelEntry[] | null = null;
  try {
    const { stdout } = await exec(lms, ["ps", "--json"], { timeout: 15_000 });
    const lu = JSON.parse(stdout);
    enMemoire = Array.isArray(lu) ? lu : null;
  } catch {
    enMemoire = null;
  }
  if (enMemoire === null) {
    return { ok: true, message: tf("Modèle {0} non rechargé : LM Studio n'a pas pu confirmer son état.", modelKey) };
  }
  if (enMemoire.some((e) => (e.modelKey ?? e.path) === modelKey)) {
    return { ok: true, message: tf("Modèle {0} déjà chargé.", modelKey) };
  }

  const charger = () =>
    exec(lms, ["load", modelKey, "--yes", "--ttl", TTL_SECONDES, ...optionsDeChargement()], { timeout: 300_000 });

  await faireLaPlace(lms, modelKey, enMemoire);

  try {
    await charger();
    chargesParHelix.add(modelKey);
    return { ok: true, message: tf("Modèle {0} chargé.", modelKey) };
  } catch (err) {
    const detail = err instanceof Error ? `${err.message}` : String(err);

    /*
     * Sur une machine modeste, conversation et vision ne tiennent pas ensemble
     * en mémoire. Plutôt que de renvoyer un refus que l'utilisateur ne peut ni
     * comprendre ni résoudre, on libère la place et on réessaie une fois.
     */
    if (manqueDeMemoire(detail)) {
      const liberes = await unloadOthers(lms, modelKey);
      if (liberes > 0) {
        try {
          await charger();
          return {
            ok: true,
            message: tf("Modèle {0} chargé (mémoire libérée au préalable).", modelKey),
          };
        } catch (second) {
          return {
            ok: false,
            message: second instanceof Error ? second.message : String(second),
          };
        }
      }
      return {
        ok: false,
        message:
          `Mémoire insuffisante pour ${modelKey} sur cette machine, même après ` +
          "libération. Choisissez un modèle plus léger.",
      };
    }
    return { ok: false, message: detail };
  }
}
