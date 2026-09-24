import { storage, newId } from "./storage";
import type { User } from "./identity";
import { t } from "@/lib/i18n";

/**
 * Tâches, et délégation à un agent (ARCHITECTURE.md, ADR-006).
 * Une tâche déléguée est un *run* du runtime rattaché à une carte : l'agent
 * travaille, et la carte avance toute seule dans le tableau.
 */

export type TaskStatus = "a-faire" | "en-cours" | "terminee" | "annulee";
export type TaskPriority = "basse" | "moyenne" | "haute";

export interface TaskToolTrace {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  ownerId: string;
  organisationId: string;
  /**
   * Échéance : un **jour** du calendrier, écrit « AAAA-MM-JJ » (voir `jourDe`).
   *
   * Pas un instant : une échéance au 12 septembre vaut pour le 12 septembre du
   * poste qui la lit. Un instant ISO en UTC (« 2026-09-12T00:00:00Z ») devient
   * le 11 au soir à Montréal, et la tâche changerait de colonne « Aujourd'hui »
   * selon le fuseau. Écrit ainsi, le jour se compare aussi comme une chaîne.
   */
  dueDate?: string;
  /**
   * Projet dans lequel la personne a rangé sa tâche.
   *
   * Classement personnel, comme pour les conversations (lib/store/sessions.ts,
   * champ `projectId`). La passerelle ne montre une tâche qu'à son propriétaire
   * (`voitTache`, gateway/src/authz.ts) et ce champ n'y change rien : ranger une
   * tâche dans un projet partagé ne la montre pas aux autres membres. Chacun y
   * retrouve ses propres tâches. Partager des tâches entre membres serait une
   * autre décision, à prendre dans la passerelle, pas un effet de bord d'un
   * classement.
   */
  projectId?: string;
  /** Agent chargé d'exécuter la tâche. */
  agentId?: string;
  /**
   * Tâches qui doivent être terminées avant celle-ci. Leur compte rendu est
   * donné à l'agent de celle-ci : c'est ce qui fait d'une suite de cartes une
   * chaîne de travail, et pas seulement un ordre d'affichage.
   */
  dependsOn?: string[];
  /** Déléguée d'elle-même à son agent dès que ses prérequis sont terminés. */
  autoStart?: boolean;
  /** Compte rendu produit par l'agent. */
  result?: string;
  /** Outils employés pendant l'exécution. */
  toolLog?: TaskToolTrace[];
  error?: string;
  /** Horodatages d'exécution. */
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const KEY = "tasks";

function all(): Task[] {
  return storage.get<Task[]>(KEY, []);
}

function persist(tasks: Task[]): void {
  storage.set(KEY, tasks);
}

export const STATUSES: { id: TaskStatus; label: string }[] = [
  { id: "a-faire", label: t("À faire") },
  { id: "en-cours", label: t("En cours") },
  { id: "terminee", label: t("Terminée") },
  { id: "annulee", label: t("Annulée") },
];

/**
 * Tâches que la personne voit : les siennes, et elles seules.
 *
 * Même règle que la passerelle (`voitTache`, gateway/src/authz.ts). Ce filtre
 * montrait aussi les tâches de toute l'organisation, ce que l'instance ne
 * livre jamais : l'écart ne se voyait que sur un poste autonome partagé par
 * plusieurs comptes, où une collègue découvrait les tâches de l'autre. Le
 * poste ne doit pas être plus généreux que la barrière.
 */
export function visibleTo(user: User): Task[] {
  return all()
    .filter((t) => t.ownerId === user.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* ------------------------------------------------------------------ */
/* Échéances                                                           */
/* ------------------------------------------------------------------ */

const FORME_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

const deux = (n: number) => String(n).padStart(2, "0");

/** Jour local d'une date, sous la forme stockée : « AAAA-MM-JJ ». */
export function jourDe(date: Date): string {
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

/**
 * Date locale (minuit) d'un jour stocké, pour l'afficher ou le placer dans un
 * calendrier. `new Date("2026-09-12")` lirait minuit **UTC** : on assemble
 * donc la date à la main. Nul si la valeur n'est pas un jour valide.
 */
export function dateDuJour(jour: string | undefined): Date | null {
  const m = jour ? FORME_JOUR.exec(jour) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // « 2026-02-31 » passe l'expression mais n'est pas un jour : on le refuse
  // plutôt que de laisser `Date` le glisser au 3 mars.
  return jourDe(date) === jour ? date : null;
}

/** Échéance valide d'une tâche, ou nul (absente ou illisible). */
export function echeanceDe(task: Task): string | null {
  return dateDuJour(task.dueDate) ? task.dueDate! : null;
}

/** Une tâche close (terminée ou annulée) n'est jamais en retard. */
export const estClose = (task: Task) => task.status === "terminee" || task.status === "annulee";

/**
 * Situation d'une tâche par rapport au jour `aujourdhui` (« AAAA-MM-JJ »).
 *
 * « retard » suppose une échéance passée **et** une tâche encore ouverte : une
 * tâche terminée hier à temps n'a rien d'un retard. Une tâche close à
 * l'échéance passée est dite « passee », pour qu'aucune vue ne la confonde.
 */
export function situation(
  task: Task,
  aujourdhui: string,
): "aucune" | "retard" | "passee" | "aujourdhui" | "avenir" {
  const jour = echeanceDe(task);
  if (!jour) return "aucune";
  if (jour === aujourdhui) return "aujourdhui";
  if (jour > aujourdhui) return "avenir";
  return estClose(task) ? "passee" : "retard";
}

export function getTask(id: string): Task | undefined {
  return all().find((t) => t.id === id);
}

export function createTask(
  owner: User,
  data: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    agentId?: string;
    /*
     * Colonne d'arrivée. Le « + » d'une colonne du tableau la désigne : sans ce
     * champ, toute tâche naissait dans « À faire », et cliquer sur le « + » de
     * « En cours » posait la carte ailleurs que là où on venait de cliquer.
     */
    status?: TaskStatus;
    /* Jour « AAAA-MM-JJ » ; une valeur illisible est ignorée plutôt que stockée. */
    dueDate?: string;
    /* Classement personnel, voir le champ `projectId`. */
    projectId?: string;
    /* Prérequis : voir le champ `dependsOn`. */
    dependsOn?: string[];
    autoStart?: boolean;
  },
): Task {
  const now = new Date().toISOString();
  const task: Task = {
    id: newId(),
    title: data.title.trim() || t("Tâche sans titre"),
    description: (data.description ?? "").trim(),
    status: data.status ?? "a-faire",
    priority: data.priority ?? "moyenne",
    ownerId: owner.id,
    organisationId: owner.organisationId,
    agentId: data.agentId,
    ...(dateDuJour(data.dueDate) ? { dueDate: data.dueDate } : {}),
    ...(data.projectId ? { projectId: data.projectId } : {}),
    ...(data.dependsOn && data.dependsOn.length > 0
      ? { dependsOn: [...new Set(data.dependsOn)], autoStart: data.autoStart !== false }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
  persist([task, ...all()]);
  return task;
}

export function updateTask(id: string, changes: Partial<Task>): void {
  persist(
    all().map((t) =>
      t.id === id ? { ...t, ...changes, updatedAt: new Date().toISOString() } : t,
    ),
  );
}

/** Une tâche supprimée cesse d'être le prérequis des autres : elles ne l'attendraient pas indéfiniment. */
export function deleteTask(id: string): void {
  persist(
    all()
      .filter((t) => t.id !== id)
      .map((t) => (t.dependsOn?.includes(id) ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== id) } : t)),
  );
}

/* ------------------------------------------------------------------ */
/* Enchaînement                                                        */
/* ------------------------------------------------------------------ */

/** Où en sont les prérequis d'une tâche. */
export interface EtatPrerequis {
  /** Prérequis encore à faire ou en cours. */
  attend: Task[];
  /** Prérequis annulés (échec ou abandon) : la tâche ne partira pas d'elle-même. */
  bloque: Task[];
  /** Tous terminés (ou aucun) : la tâche peut partir. */
  pret: boolean;
}

export function etatPrerequis(task: Task, taches: Task[] = all()): EtatPrerequis {
  const parId = new Map(taches.map((t) => [t.id, t]));
  // Un prérequis supprimé, ou qu'on ne voit plus, ne retient rien.
  const prerequis = (task.dependsOn ?? []).map((id) => parId.get(id)).filter((t): t is Task => Boolean(t));
  const attend = prerequis.filter((t) => t.status === "a-faire" || t.status === "en-cours");
  const bloque = prerequis.filter((t) => t.status === "annulee");
  return { attend, bloque, pret: attend.length === 0 && bloque.length === 0 };
}

/**
 * Faire dépendre `tache` de `candidat` créerait-il une boucle ? Oui si
 * `candidat` est `tache` elle-même, ou attend déjà (même de loin) `tache` :
 * aucune des deux ne partirait jamais.
 */
export function creeUneBoucle(tacheId: string, candidatId: string, taches: Task[] = all()): boolean {
  if (tacheId === candidatId) return true;
  const parId = new Map(taches.map((t) => [t.id, t]));
  const vus = new Set<string>();
  const pile = [candidatId];
  while (pile.length > 0) {
    const id = pile.pop()!;
    if (id === tacheId) return true;
    if (vus.has(id)) continue;
    vus.add(id);
    pile.push(...(parId.get(id)?.dependsOn ?? []));
  }
  return false;
}

/** Tâches qui attendent `id`, directement. */
export function suitesDe(id: string, taches: Task[] = all()): Task[] {
  return taches.filter((t) => t.dependsOn?.includes(id));
}
