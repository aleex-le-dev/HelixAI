/**
 * Client de la passerelle modèles Helix (voir gateway/ et ARCHITECTURE.md, ADR-001).
 * Seul point de contact du front avec l'inférence : le front ne connaît jamais
 * l'infrastructure (LM Studio, cluster exo, cloud européen).
 */

import { apiFetch } from "@/lib/endpoint";
import type { NiveauRaisonnement } from "@/lib/store/profile";
import { ouvrirFlux } from "@/lib/flux";
import { t, tf } from "@/lib/i18n";

export type Role = "chat" | "code" | "vision" | "gui" | "embed";

export interface GatewayModel {
  id: string;
  uid: string;
  backendId: string;
  backendLabel: string;
  roles: Role[];
  loaded?: boolean;
  sizeBytes?: number;
  params?: string;
  arch?: string;
  reasoning?: boolean;
  /** `local` (machine, cluster), `agence` (fourni par l'agence), `cle` (branché par une clé). */
  origine?: "local" | "agence" | "cle";
  /** Où tourne le service, pour un modèle cloud. */
  pays?: string;
  fournisseur?: string;
  /** Présent quand le modèle vient d'une clé personnelle (la sienne : les autres ne le voient pas). */
  proprietaire?: string;
  /** Entraîné sur la machine de l'instance : choisissable, jamais choisi d'office. */
  entraine?: boolean;
}

export interface BackendStatus {
  id: string;
  label: string;
  baseUrl: string;
  online: boolean;
  latencyMs?: number;
  error?: string;
  modelCount: number;
}

export interface HealthReport {
  ok: boolean;
  backends: BackendStatus[];
  modelCount: number;
}

export async function fetchHealth(): Promise<HealthReport> {
  const res = await apiFetch(`/health`);
  if (!res.ok) throw new Error(`Passerelle injoignable (${res.status})`);
  return res.json();
}

export async function fetchModels(): Promise<GatewayModel[]> {
  const res = await apiFetch(`/helix/models`);
  if (!res.ok) throw new Error(tf("Impossible de lister les modèles ({0})", res.status));
  const data = (await res.json()) as { models: GatewayModel[] };
  return data.models;
}

/**
 * Un tour de conversation.
 *
 * Le contenu est du texte dans l'immense majorité des cas ; il devient une
 * liste de fragments quand une image accompagne la question, format que les
 * modèles de vision attendent.
 */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

/** Événement d'activité d'outil relayé par la passerelle. */
export type HelixEvent =
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok: boolean; preview: string }
  /* Découpage d'une demande lourde : voir gateway/src/plan.ts. */
  | { type: "plan_debut"; regime?: string }
  | { type: "plan"; etapes: string[] }
  /*
   * `chemin` situe l'étape : « 2 », ou « 2.1 » pour la première partie de
   * l'étape 2 redécoupée. `index` (étapes du premier plan) reste pour une
   * passerelle plus ancienne.
   */
  | { type: "plan_sous"; chemin: string; etapes: string[] }
  /* Étapes ajoutées après la revue finale, pour compléter ce qui manquait. */
  | { type: "plan_ajout"; chemin: string; titre: string; etapes: string[] }
  /* Revue finale de la demande entière, relue contre l'état réel. */
  | { type: "revue"; etat: "encours" | "fait" | "incomplet"; tour: number }
  | { type: "etape"; index?: number; chemin?: string; total: number; titre: string }
  | { type: "etape_reprise"; index?: number; chemin?: string }
  /* L'étape a modifié quelque chose : le modèle en contrôle le résultat réel. */
  | { type: "etape_verification"; chemin?: string }
  | { type: "etape_fin"; index?: number; chemin?: string; ok: boolean; cause?: "moteur" | "budget" | "inaction" | "muette" | "limite"; resume?: string }
  | { type: "capture"; largeur: number; hauteur: number }
  /* Ce que la passerelle fait avant la réponse (chargement d'un modèle…). Vide : c'est fini. */
  | { type: "statut"; message: string }
  | { type: "error"; message: string };

export interface StreamHandlers {
  /** Fragment de réponse visible. */
  onContent: (chunk: string) => void;
  /** Fragment du canal de raisonnement (modèles type Qwen3). */
  onReasoning?: (chunk: string) => void;
  /** Modèle réellement utilisé, renvoyé par la passerelle. */
  onModel?: (uid: string) => void;
  /** Activité des outils MCP. */
  onEvent?: (event: HelixEvent) => void;
}

export interface McpToolInfo {
  name: string;
  description: string;
}

export interface McpServerStatus {
  id: string;
  label: string;
  description: string;
  running: boolean;
  toolCount: number;
  error?: string;
  tools: McpToolInfo[];
}

export async function fetchMcp(): Promise<{
  workspace: string;
  /** Tous les emplacements ouverts à l'agent, le principal en tête. */
  espaces?: string[];
  /** La portée couvre-t-elle le poste entier (dossier personnel et disques) ? */
  toutLePoste?: boolean;
  servers: McpServerStatus[];
}> {
  const res = await apiFetch(`/helix/mcp`);
  if (!res.ok) throw new Error(tf("Impossible de lister les serveurs MCP ({0})", res.status));
  return res.json();
}

export async function toggleMcpServer(id: string, start: boolean): Promise<void> {
  const res = await apiFetch(`/helix/mcp/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, start }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? tf("Échec ({0})", res.status));
  }
}

/* ----------------------- approbation des actions ------------------------ */

/**
 * Niveau d'approbation des actions de l'agent.
 *
 * Il vit dans la passerelle, jamais ici : ce que le navigateur affiche est une
 * copie, et une copie ne protège rien. Toute action passe par la barrière de
 * l'instance, y compris si un client appelle la route de conversation en direct.
 */
export type NiveauApprobation = "tout" | "modifications" | "chaque";

export interface DemandeApprobation {
  id: string;
  /** Ce que l'agent veut faire, en français courant. */
  resume: string;
  detail: {
    outil?: string;
    cible?: string | null;
    niveau?: NiveauApprobation;
    employe?: string;
    /** Le mail tel qu'il partira, pour un envoi : destinataires résolus, objet, texte entier. */
    envoi?: { a: string; cc: string; objet: string; corps: string; enReponse: boolean };
  };
  createdAt: number;
}

export interface EtatApprobation {
  niveau: NiveauApprobation;
  /** Délai au bout duquel une demande sans réponse est refusée. */
  delaiMs: number;
  enAttente: DemandeApprobation[];
}

export async function fetchApprobation(): Promise<EtatApprobation> {
  const res = await apiFetch(`/helix/approbation`);
  if (!res.ok) throw new Error(`Niveau d'approbation illisible (${res.status})`);
  return res.json();
}

export async function setNiveauApprobation(niveau: NiveauApprobation): Promise<void> {
  const res = await apiFetch(`/helix/approbation/niveau`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ niveau }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? tf("Échec ({0})", res.status));
  }
}

export async function repondreApprobation(id: string, accord: boolean): Promise<boolean> {
  try {
    const res = await apiFetch(`/helix/approbation/repondre`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, accord }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type EvenementApprobation =
  | ({ type: "approbation_demandee" } & DemandeApprobation)
  | { type: "approbation_resolue"; id: string; accord: boolean }
  | { type: "approbation_expiree"; id: string };

/** S'abonne aux demandes d'approbation d'outils. Renvoie de quoi se désabonner. */
export function subscribeApprobation(
  onEvent: (event: EvenementApprobation) => void,
): () => void {
  return ouvrirFlux("/helix/approbation/evenements", (donnees) =>
    onEvent(JSON.parse(donnees) as EvenementApprobation),
  );
}

/**
 * Envoie une conversation et relaie le flux SSE.
 * `model` explicite, sinon la passerelle choisit selon le `role`.
 */
export async function streamChat(
  opts: {
    messages: ChatTurn[];
    model?: string;
    role?: Role;
    effort?: NiveauRaisonnement;
    /** Autoriser l'agent à utiliser les outils MCP. */
    tools?: boolean;
    signal?: AbortSignal;
  },
  handlers: StreamHandlers,
): Promise<void> {
  const res = await apiFetch(`/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      messages: opts.messages,
      model: opts.model,
      role: opts.model ? undefined : (opts.role ?? "chat"),
      effort: opts.effort ?? "moyen",
      tools: opts.tools ?? false,
      stream: true,
    }),
  });

  if (!res.ok) {
    let message = tf("Erreur {0}", res.status);
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {
      /* réponse non JSON */
    }
    throw new Error(message);
  }

  const served = res.headers.get("X-Helix-Model");
  if (served) handlers.onModel?.(served);

  if (!res.body) throw new Error(t("Réponse sans flux."));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  /*
   * La passerelle clôt toujours son flux par `[DONE]`, erreur comprise. Un
   * flux qui s'arrête sans lui a été coupé en route (passerelle redémarrée,
   * connexion perdue) : la réponse affichée est un morceau, pas une réponse,
   * et le dire vaut mieux que la laisser passer pour complète.
   */
  let termine = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Les événements SSE sont séparés par une ligne vide.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") termine = true;
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          if (json?.helix) {
            handlers.onEvent?.(json.helix as HelixEvent);
            continue;
          }
          const delta = json?.choices?.[0]?.delta;
          if (!delta) continue;
          if (typeof delta.reasoning_content === "string") {
            handlers.onReasoning?.(delta.reasoning_content);
          }
          if (typeof delta.content === "string") {
            handlers.onContent(delta.content);
          }
        } catch {
          /* fragment non parsable, ignoré */
        }
      }
    }
  }
  if (!termine && !opts.signal?.aborted) {
    throw new Error(t("La réponse a été coupée avant la fin : la connexion à l'instance s'est interrompue. Ce qui s'affiche est incomplet ; réessayez."));
  }
}

/**
 * Réécrit des instructions d'agent pour qu'elles soient claires et complètes,
 * sans en changer le sens. Passe par le modèle local choisi d'office (jamais
 * un modèle cloud branché par clé : la passerelle ne le choisit pas seule).
 */
export async function optimiserInstructions(
  entree: { nom: string; description: string; instructions: string },
  signal?: AbortSignal,
): Promise<string> {
  let texte = "";
  await streamChat(
    {
      role: "chat",
      effort: "faible",
      signal,
      messages: [
        {
          role: "system",
          content:
            t("Tu rédiges les instructions (le prompt système) d'un agent d'entreprise. Réécris celles qu'on te donne ") +
            t("pour qu'elles soient claires, précises et complètes, en français, à la deuxième personne (« Tu… »). ") +
            t("Garde exactement l'intention et le périmètre : n'invente ni tâche, ni outil, ni chiffre. Structure en ") +
            t("quelques lignes : son rôle, ce qu'il fait, comment il répond (ton, format), ce qu'il ne fait pas. ") +
            t("Pas de titre, pas de Markdown lourd, des tirets pour les listes. Rends uniquement les instructions."),
        },
        {
          role: "user",
          content:
            tf("Nom de l'agent : {0}\n", entree.nom || "(sans nom)") +
            `Description : ${entree.description || "(aucune)"}\n\n` +
            `Instructions actuelles :\n${entree.instructions || t("(vides : propose-les à partir du nom et de la description)")}`,
        },
      ],
    },
    { onContent: (c) => (texte += c) },
  );
  // Un modèle qui raisonne peut laisser ses balises dans le texte.
  return texte.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
