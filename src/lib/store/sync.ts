import { apiFetch } from "@/lib/endpoint";
import { retenirGroupes } from "@/lib/store/identity";
import { auGrand, ecrireGrand, lireGrand } from "@/lib/store/grandStockage";

/**
 * Synchronisation multi-postes.
 *
 * Les données vivent dans l'instance (voir `gateway/src/db.ts`) ; chaque poste
 * en garde une copie locale pour rester réactif et utilisable hors ligne.
 *
 * - **Au démarrage** : on tire l'état de l'instance dans le cache local.
 * - **À chaque écriture** : on pousse vers l'instance.
 * - **En continu** : on compare les révisions et on re-tire ce qui a bougé
 *   ailleurs, ce qui fait apparaître les projets et conversations partagés par
 *   un collègue depuis un autre poste.
 *
 * Le cache local reste la source de lecture : tous les appels existants
 * demeurent synchrones, sans réécriture des écrans.
 */

export const COLLECTIONS = [
  "accounts",
  "projects",
  "sessions",
  "tasks",
  "agents",
  "profiles",
  "competences",
] as const;

export type Collection = (typeof COLLECTIONS)[number];

/** Événement émis quand l'instance a apporté des changements. */
export const SYNCED = "helix:synced";

const PREFIX = "helix:";
const POLL_MS = 4000;

let online = false;
let timer: ReturnType<typeof setInterval> | null = null;
const revisions = new Map<Collection, number>();
/** Collections que ce poste vient d'écrire : on ignore l'écho du serveur. */
const pushing = new Set<Collection>();

export function isOnline(): boolean {
  return online;
}

/** Nom de la clé locale correspondant à une collection. */
function localKey(collection: Collection): string {
  // Les profils sont stockés par utilisateur : « profile:<id> ».
  return collection === "profiles" ? `${PREFIX}profiles` : `${PREFIX}${collection}`;
}

function readLocal(collection: Collection): unknown {
  if (collection === "profiles") {
    // Regroupe tous les profils individuels en un seul objet transportable.
    const bag: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${PREFIX}profile:`)) continue;
      try {
        bag[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key)!);
      } catch {
        /* entrée illisible, ignorée */
      }
    }
    return bag;
  }
  try {
    // Les Chats, dans l'application de bureau, vivent dans le grand stockage (grandStockage.ts).
    const raw = auGrand(collection) ? lireGrand(collection) : localStorage.getItem(localKey(collection));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(collection: Collection, value: unknown): void {
  if (collection === "profiles") {
    const bag = (value ?? {}) as Record<string, unknown>;
    for (const [suffix, profile] of Object.entries(bag)) {
      localStorage.setItem(`${PREFIX}${suffix}`, JSON.stringify(profile));
    }
    return;
  }
  if (value === null || value === undefined) return;
  if (auGrand(collection)) {
    ecrireGrand(collection, JSON.stringify(value));
    return;
  }
  localStorage.setItem(localKey(collection), JSON.stringify(value));
}

/**
 * Prévient les écrans qu'une collection a changé.
 * On réémet les mêmes événements que les écritures locales : les vues se
 * rafraîchissent sans qu'aucun écran n'ait à connaître la synchronisation.
 */
/** Émis quand la liste des comptes change (écran de connexion). */
export const ACCOUNTS_CHANGED = "helix:accounts-changed";

const CHANGE_EVENTS: Record<Collection, string> = {
  accounts: ACCOUNTS_CHANGED,
  projects: "helix:projects-changed",
  sessions: "helix:sessions-changed",
  tasks: "helix:tasks-changed",
  agents: "helix:agents-changed",
  profiles: "helix:profile-changed",
  competences: "helix:competences-changed",
};

function announce(collections: Collection[]): void {
  for (const collection of collections) {
    window.dispatchEvent(new Event(CHANGE_EVENTS[collection]));
  }
  window.dispatchEvent(new Event(SYNCED));
}

/**
 * Issue d'une tentative de lecture. Les trois cas ne se confondent pas, et
 * c'est le cœur du problème corrigé ci-dessous.
 */
type Tirage =
  /** L'instance a rendu la collection : le cache local a été remplacé. */
  | "tiree"
  /** L'instance n'a jamais eu cette collection : c'est à ce poste de l'amorcer. */
  | "absente"
  /** La demande a échoué : instance muette, séance expirée, réseau coupé. */
  | "echec";

/** Tire une collection depuis l'instance vers le cache local. */
async function pull(collection: Collection): Promise<Tirage> {
  const res = await apiFetch(`/helix/data/${collection}`);
  if (!res.ok) return "echec";
  const payload = (await res.json()) as { value: unknown; revision: number };
  revisions.set(collection, payload.revision);
  if (payload.value === null) return "absente";
  // Les conversations partagées à un groupe se lisent selon les groupes de la personne : on les relit avec.
  if (collection === "sessions") await relireMesGroupes();
  writeLocal(collection, payload.value);
  return "tiree";
}

async function relireMesGroupes(): Promise<void> {
  try {
    const res = await apiFetch("/helix/groupes");
    if (!res.ok) return;
    const { groupes } = (await res.json()) as { groupes: { id: string; estMembre: boolean }[] };
    retenirGroupes(groupes.filter((g) => g.estMembre).map((g) => g.id));
  } catch {
    /* hors ligne : les groupes connus restent */
  }
}

/**
 * Collections que ce poste ne pousse jamais.
 *
 * Les comptes ne s'écrivent que par les routes d'authentification, qui seules
 * savent hacher un mot de passe et tenir le journal. L'instance refusait donc
 * la poussée avec un 403 à chaque création de compte : une erreur silencieuse,
 * répétée, et parfaitement inutile puisque le serveur a raison de refuser.
 * On les tire, on ne les renvoie pas.
 */
const JAMAIS_POUSSEES: Collection[] = ["accounts"];

/** Pousse le cache local vers l'instance. */
export async function push(collection: Collection): Promise<void> {
  if (!online) return;
  if (JAMAIS_POUSSEES.includes(collection)) return;
  const value = readLocal(collection);
  if (value === null) return;
  pushing.add(collection);
  try {
    const res = await apiFetch(`/helix/data/${collection}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (res.ok) {
      const payload = (await res.json()) as { revision: number };
      revisions.set(collection, payload.revision);
    }
  } catch {
    online = false;
  } finally {
    pushing.delete(collection);
  }
}

/** Compare les révisions et re-tire ce qui a changé sur un autre poste. */
async function refresh(): Promise<void> {
  try {
    const res = await apiFetch(`/helix/data`);
    if (!res.ok) return;
    const { revisions: remote } = (await res.json()) as {
      revisions: Record<Collection, number>;
    };

    const touched: Collection[] = [];
    for (const collection of COLLECTIONS) {
      if (pushing.has(collection)) continue;
      const known = revisions.get(collection) ?? 0;
      if ((remote[collection] ?? 0) > known) {
        if ((await pull(collection)) === "tiree") touched.push(collection);
      }
    }
    online = true;
    if (touched.length > 0) announce(touched);
  } catch {
    online = false;
  }
}

/**
 * Démarre la synchronisation. Sans instance joignable, l'application continue
 * de fonctionner sur son cache local : c'est un confort, pas une dépendance.
 */
export async function startSync(): Promise<void> {
  try {
    const res = await apiFetch(`/helix/data`);
    if (!res.ok) throw new Error(String(res.status));
    online = true;
  } catch {
    online = false;
    return;
  }

  /*
   * Premier échange : l'instance fait foi si elle a des données, sinon ce
   * poste l'amorce avec les siennes.
   *
   * ── Le piège, mesuré et corrigé ───────────────────────────────────────────
   *
   * Cette boucle poussait le cache local dès que la lecture **échouait**, sans
   * distinguer « l'instance n'a pas cette collection » de « l'instance a
   * refusé de répondre ». Un refus est pourtant le pire moment pour écrire :
   * on ne sait rien de ce qu'il y a en face, et le cache local peut être vide
   * — poste qui vient de changer d'origine, séance expirée, données jamais
   * tirées. Pousser une liste vide par-dessus une instance pleine efface les
   * conversations de la personne, et `authz.ts` ne s'y oppose pas : elle en
   * est propriétaire, c'est donc une suppression légitime à ses yeux.
   *
   * On n'amorce donc que sur « absente », jamais sur « échec ».
   */
  for (const collection of COLLECTIONS) {
    const etat = await pull(collection);
    if (etat === "absente" && readLocal(collection) !== null) await push(collection);
  }
  announce([...COLLECTIONS]);

  if (timer) clearInterval(timer);
  timer = setInterval(() => void refresh(), POLL_MS);
}

export function stopSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
