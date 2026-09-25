import { storage, newId } from "./storage";
import type { User } from "./identity";
import { t } from "@/lib/i18n";

/**
 * Agents personnalisés : une configuration réutilisable exécutée par le runtime
 * (ARCHITECTURE.md, ADR-006). Un agent n'est pas un moteur : c'est un prompt
 * système, un périmètre d'outils et un modèle préféré.
 */

/**
 * Qui voit et utilise l'agent : son auteur seul, les membres de certains
 * groupes (ajouté le 25/09/2026, comme dans la Bibliothèque), ou toute
 * l'organisation. L'instance applique la même règle (gateway/src/authz.ts).
 */
export type AgentVisibility = "personnel" | "groupes" | "organisation";

export interface Agent {
  id: string;
  name: string;
  description: string;
  /** Prompt système : la personnalité et l'expertise de l'agent. */
  instructions: string;
  visibility: AgentVisibility;
  /** Pour la visibilité « groupes » : les groupes (de son auteur) à qui il est partagé. */
  groupIds?: string[];
  /** Masquer le prompt aux non-administrateurs (agents d'organisation). */
  hidePrompt: boolean;
  ownerId: string;
  organisationId: string;
  /** Autoriser cet agent à utiliser les outils MCP. */
  toolsEnabled: boolean;
  /** Modèle imposé (uid passerelle) ; sinon celui de l'utilisateur. */
  modelUid?: string;
  /**
   * Bases de connaissances où l'agent cherche avant de répondre, dans le Chat.
   * Chacun n'y lit que ce qu'il voit : l'instance le vérifie à chaque question.
   */
  connaissances?: string[];
  createdAt: string;
  updatedAt: string;
}

const KEY = "agents";

function all(): Agent[] {
  return storage.get<Agent[]>(KEY, []);
}

function persist(agents: Agent[]): void {
  storage.set(KEY, agents);
}

/**
 * Agents visibles : les siens, ceux publiés dans l'organisation, et ceux
 * partagés à l'un de ses groupes. Une copie gardée sur ce poste après une
 * sortie de groupe n'apparaît plus : les groupes sont relus avec l'instance
 * (sync.ts), qui ne l'envoie plus non plus.
 */
export function visibleTo(user: User): Agent[] {
  const groupes = user.groupIds ?? [];
  return all()
    .filter(
      (a) =>
        a.ownerId === user.id ||
        (a.visibility === "organisation" && a.organisationId === user.organisationId) ||
        (a.visibility === "groupes" && (a.groupIds ?? []).some((g) => groupes.includes(g))),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAgent(id: string): Agent | undefined {
  return all().find((a) => a.id === id);
}

export function createAgent(
  owner: User,
  data: Pick<Agent, "name" | "description" | "instructions" | "visibility" | "hidePrompt"> &
    Partial<Pick<Agent, "toolsEnabled" | "modelUid" | "connaissances" | "groupIds">>,
): Agent {
  const now = new Date().toISOString();
  const agent: Agent = {
    id: newId(),
    name: data.name.trim() || t("Agent sans nom"),
    description: data.description.trim(),
    instructions: data.instructions.trim(),
    visibility: data.visibility,
    ...(data.visibility === "groupes" ? { groupIds: [...new Set(data.groupIds ?? [])] } : {}),
    hidePrompt: data.hidePrompt,
    ownerId: owner.id,
    organisationId: owner.organisationId,
    toolsEnabled: data.toolsEnabled ?? true,
    modelUid: data.modelUid,
    ...(data.connaissances && data.connaissances.length > 0 ? { connaissances: data.connaissances } : {}),
    createdAt: now,
    updatedAt: now,
  };
  persist([agent, ...all()]);
  return agent;
}

export function updateAgent(id: string, changes: Partial<Agent>): void {
  persist(
    all().map((a) =>
      a.id === id ? { ...a, ...changes, updatedAt: new Date().toISOString() } : a,
    ),
  );
}

export function deleteAgent(id: string): void {
  persist(all().filter((a) => a.id !== id));
}

/** Agent par défaut, toujours disponible. */
export const DEFAULT_AGENT: Agent = {
  id: "agent-defaut",
  name: t("Agent par défaut"),
  description: t("Agent généraliste, disponible sans configuration"),
  instructions: "",
  visibility: "organisation",
  hidePrompt: false,
  ownerId: "system",
  organisationId: "*",
  toolsEnabled: true,
  createdAt: "",
  updatedAt: "",
};
