/**
 * Client de l'écran Code : pilote OpenCode à travers la passerelle Helix
 * (ARCHITECTURE.md, ADR-003). Le front ne connaît ni OpenCode ni le modèle :
 * il parle à la passerelle, qui choisit le moteur et le fournisseur.
 */

import { apiFetch } from "@/lib/endpoint";
import { t, tf } from "@/lib/i18n";

export interface CodeStatus {
  available: boolean;
  running: boolean;
  port: number | null;
  projectDir: string;
  error?: string;
}

export async function fetchCodeStatus(): Promise<CodeStatus> {
  const res = await apiFetch(`/helix/code`);
  if (!res.ok) throw new Error(`Passerelle injoignable (${res.status})`);
  return res.json();
}

/** Réglages choisis à l'écran : modèle (identifiant d'interface) et niveau de raisonnement. */
export interface ReglagesCode {
  model?: string;
  effort?: string;
}

export async function createCodeSession(
  reglages: ReglagesCode,
  /** Dossier de travail ; l'instance le valide avant de l'accepter. */
  dossier?: string,
): Promise<string> {
  const res = await apiFetch(`/helix/code/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: reglages.model, effort: reglages.effort, dossier }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? tf("Impossible d'ouvrir une session ({0})", res.status));
  }
  const payload = await res.json();
  const id = payload?.data?.id ?? payload?.id;
  if (!id) throw new Error(t("Session sans identifiant."));
  return id as string;
}

/**
 * Envoie une demande. Rend l'identifiant d'une **nouvelle** session quand
 * l'instance a dû relancer la demande ailleurs (la première n'avait jamais
 * atteint le modèle : voir `handleCodePrompt`, gateway/src/index.ts), et
 * l'identifiant du message, qui permet de reconnaître dans le flux les
 * événements de CETTE demande (voir `useCode`).
 */
export async function sendCodePrompt(
  sessionID: string,
  text: string,
  reglages: ReglagesCode,
): Promise<{ relance?: string; messageID?: string }> {
  const res = await apiFetch(`/helix/code/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionID, text, model: reglages.model, effort: reglages.effort }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    data?: { id?: string };
    helixRelance?: { sessionID?: string };
  };
  if (!res.ok) throw new Error(body?.error?.message ?? tf("Envoi refusé ({0})", res.status));
  return { relance: body.helixRelance?.sessionID, messageID: body.data?.id };
}

/** Demande l'arrêt. Rend `false` si l'instance ne l'a pas confirmé. */
export async function interruptCode(sessionID: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/helix/code/interrupt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionID }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Événement OpenCode traduit en langage Helix. */
export type CodeEvent =
  /** Une demande commence à être traitée : `messageID` dit laquelle. */
  | { kind: "demande"; messageID: string }
  /** Une étape du modèle commence : l'agent travaille (encore). */
  | { kind: "etape" }
  | { kind: "reasoning"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool_start"; callID: string; tool: string; input: Record<string, unknown> }
  | { kind: "tool_end"; callID: string; ok: boolean; preview: string }
  /** Ce qui se passe sans être une réponse : nouvelle tentative, résumé… */
  | { kind: "statut"; text: string }
  /** Le moteur a échoué : sans cet événement, l'écran attend indéfiniment. */
  | { kind: "error"; message: string }
  /**
   * Le tour est fini, mais pas normalement (longueur, filtre, arrêt sans
   * motif) : ce qui a été écrit reste affiché, avec la raison.
   */
  | { kind: "fin"; note: string }
  | { kind: "done" };

/** Message d'erreur d'un événement OpenCode, quelle que soit sa forme. */
function messageErreur(erreur: unknown): string {
  if (typeof erreur === "string") return erreur;
  const message = (erreur as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : "";
}

/**
 * Traduit un événement brut d'OpenCode. Renvoie `null` si sans intérêt pour l'UI.
 *
 * La liste des événements vient du schéma du flux d'OpenCode 1.18.32
 * (`SessionDurableEvent`, lu dans `/doc`) ; les fins de tour ont été
 * provoquées une à une contre un faux fournisseur pour voir ce qu'OpenCode
 * émet réellement (23/09/2026).
 */
export function translate(raw: unknown): CodeEvent | null {
  const event = raw as { type?: string; data?: Record<string, unknown> };
  const type = event.type ?? "";
  const data = event.data ?? {};

  if (type === "session.next.prompted" && typeof data.messageID === "string") {
    return { kind: "demande", messageID: data.messageID };
  }
  if (type === "session.next.step.started") return { kind: "etape" };
  if (type === "session.next.reasoning.ended" && typeof data.text === "string") {
    return { kind: "reasoning", text: data.text };
  }
  if (type === "session.next.text.ended" && typeof data.text === "string") {
    return { kind: "text", text: data.text };
  }
  if (type === "session.next.tool.called") {
    return {
      kind: "tool_start",
      callID: String(data.callID ?? ""),
      tool: String(data.tool ?? "outil"),
      input: (data.input as Record<string, unknown>) ?? {},
    };
  }
  /*
   * Échec d'une étape : le tour s'arrête là. Sans traduction, l'interface ne
   * recevait rien : la réponse restait « en cours » pour toujours, et tout
   * envoi suivant était ignoré. Un moteur qui échoue doit le dire.
   */
  if (type === "session.next.step.failed") {
    return {
      kind: "error",
      message: messageErreur(data.error) || t("Le moteur de code a interrompu la tâche."),
    };
  }
  /*
   * Échec d'un OUTIL, pas du tour : un fichier introuvable, une commande en
   * erreur. Le modèle reçoit l'échec et continue — il essaie autre chose, ou
   * explique. Le traiter comme la fin du tour (ce qui était fait) rendait la
   * main pendant que l'agent travaillait encore, laissait l'outil tourner à
   * l'écran pour toujours, et cachait sa réponse finale derrière le message
   * d'erreur de l'outil.
   */
  if (type === "session.next.tool.failed") {
    return {
      kind: "tool_end",
      callID: String(data.callID ?? ""),
      ok: false,
      preview: messageErreur(data.error) || t("L'outil a échoué."),
    };
  }
  if (type === "session.next.tool.success") {
    const parts = (data.content as { type: string; text?: string }[] | undefined) ?? [];
    const preview = parts
      .map((p) => p.text ?? "")
      .join("\n")
      .trim();
    return {
      kind: "tool_end",
      callID: String(data.callID ?? ""),
      ok: true,
      preview: preview || String((data.structured as { target?: string })?.target ?? ""),
    };
  }
  /*
   * Le fournisseur n'a pas répondu et OpenCode réessaie : sans ce statut,
   * l'écran restait muet pendant les tentatives.
   */
  if (type === "session.next.retried") {
    const motif = messageErreur(data.error);
    return {
      kind: "statut",
      text: motif
        ? tf("Le modèle n'a pas répondu ({0}). Nouvelle tentative...", motif)
        : t("Le modèle n'a pas répondu. Nouvelle tentative..."),
    };
  }
  if (type === "session.next.compaction.started") {
    return { kind: "statut", text: t("La conversation est longue : l'agent la résume pour continuer...") };
  }
  if (type === "session.next.step.ended") {
    /*
     * « tool-calls » n'est pas une fin : l'étape s'arrête pour laisser l'outil
     * travailler, et l'étape suivante reprend avec son résultat. La traiter
     * comme une interruption arrêtait l'écran après la première action (vu par
     * le client le 23/09/2026 : « write index.html » puis « Tâche interrompue
     * par le moteur (tool-calls) », alors que le travail continuait).
     */
    if (data.finish === "tool-calls" || data.finish === "tool_calls") return null;
    if (data.finish === "stop") return { kind: "done" };
    /*
     * Toute autre valeur termine le tour : vérifié contre un faux fournisseur,
     * OpenCode ne relance pas d'étape après « length », « content-filter » ou
     * « unknown ». Ce qui a été écrit reste affiché ; on dit pourquoi ça
     * s'arrête, en mots, jamais avec le code brut du moteur.
     */
    if (typeof data.finish === "string") {
      return {
        kind: "fin",
        note:
          data.finish === "length"
            ? t("Réponse interrompue : la limite de longueur du modèle est atteinte.")
            : data.finish === "content-filter"
              ? t("Réponse bloquée par le filtre de contenu du modèle.")
              : data.finish === "error"
                ? t("Le modèle a signalé une erreur et s'est arrêté.")
                : t("Le modèle s'est arrêté sans indiquer qu'il avait fini : la réponse peut être incomplète."),
      };
    }
  }
  return null;
}

/*
 * Noms des outils d'OpenCode rapprochés de ceux que l'affichage sait déjà dire
 * en français (libellesOutils.ts). Les autres gardent leur nom.
 */
const OUTILS_CONNUS: Record<string, string> = {
  read: "read_text_file",
  write: "write_file",
  edit: "edit_file",
  list: "list_directory",
  glob: "search_files",
};

/** Nom affichable d'un outil d'OpenCode, au format « serveur__outil » de l'affichage. */
export function nomOutil(tool: string): string {
  /*
   * Connecteurs de l'instance servis à l'agent de code (outilsCode.ts) :
   * OpenCode les nomme « helix_<serveur>__<outil> ». Sans le préfixe, c'est le
   * nom que l'affichage connaît déjà depuis le Chat (« drive__chercher »…).
   */
  if (tool.startsWith("helix_") && tool.includes("__")) return tool.slice("helix_".length);
  return OUTILS_CONNUS[tool] ? `fichiers__${OUTILS_CONNUS[tool]}` : `code__${tool}`;
}

/**
 * Arguments affichables : l'affichage montre `path`, `query`, `pattern`… et
 * OpenCode nomme parfois le chemin `filePath`, et une commande `command`.
 */
export function argumentsOutil(input: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (typeof input.path !== "string" && typeof input.filePath === "string") extra.path = input.filePath;
  if (typeof input.command === "string" && typeof input.source !== "string") extra.source = input.command;
  return { ...input, ...extra };
}
