import { models, resolve } from "./router.ts";
import { backendById } from "./backends.ts";
import * as usage from "./usage.ts";
import type { ModelInfo } from "./types.ts";
import { t, tf } from "./langue.ts";

/**
 * Une réponse de modèle demandée par l'instance elle-même, hors conversation :
 * le compte rendu d'une réunion, par exemple.
 *
 * Un modèle de la machine d'abord (le texte ne quitte pas l'instance) ; à
 * défaut, un modèle fourni par le prestataire. Jamais un modèle branché par la
 * clé de quelqu'un : ce serait sa carte bancaire, sans qu'il l'ait décidé. Le
 * modèle retenu est rendu avec la réponse, pour que l'écran dise où le texte
 * est passé.
 */

export type Message = { role: "system" | "user" | "assistant"; content: string };

export type Completion =
  | { ok: true; texte: string; modele: string; origine: "local" | "agence"; pays?: string }
  | { ok: false; message: string; tropLong?: boolean };

/** Modèle de conversation à utiliser : local et chargé d'abord, puis local, puis celui du prestataire. */
async function choisir(qui: string): Promise<{ model: ModelInfo } | { error: string }> {
  // Un modèle entraîné sur la machine n'est jamais pris d'office (router.ts).
  const tous = (await models()).filter((m) => m.roles.includes("chat") && !m.proprietaire && !m.entraine);
  const locaux = tous.filter((m) => (m.origine ?? "local") === "local");
  const local = locaux.find((m) => m.loaded) ?? locaux[0];
  if (local) return { model: local };
  const r = await resolve({ role: "chat", acces: qui });
  if ("error" in r) return { error: r.error };
  if (r.model.origine === "cle") return { error: "Aucun modèle de la machine ni du prestataire n'est disponible." };
  return { model: r.model };
}

export async function completer(
  messages: Message[],
  options: {
    qui: string;
    maxTokens?: number;
    delaiMs?: number;
    /**
     * Réponse tenue à un schéma JSON (LM Studio : `response_format`, sortie
     * contrainte par grammaire). Ajouté le 26/09/2026 pour le plan des
     * applications de Helix Code (application.ts) : un petit modèle libre
     * d'écrire oublie une accolade une fois sur quelques-unes.
     */
    schema?: { nom: string; schema: Record<string, unknown> };
    /**
     * Ce modèle-là plutôt que celui de conversation : le plan d'une demande de
     * Helix Code se fait avec le modèle choisi pour le code (sequenceCode.ts).
     */
    modele?: string;
  },
): Promise<Completion> {
  const choix = options.modele ? await resolve({ model: options.modele }) : await choisir(options.qui);
  if ("error" in choix) return { ok: false, message: choix.error };
  const { model } = choix;
  const backend = backendById(model.backendId);
  if (!backend) return { ok: false, message: tf("Moteur introuvable pour {0}.", model.id) };

  /*
   * Les modèles Qwen3 raisonnent avant de répondre, longuement : pour un
   * compte rendu, le raisonnement double le temps sans rien ajouter. `/no_think`
   * est l'interrupteur que la famille documente.
   */
  const sansRaisonnement = /qwen3(?![.\d])/i.test(model.id);
  const envoyes = sansRaisonnement
    ? messages.map((m, i) => (i === messages.length - 1 && m.role === "user" ? { ...m, content: `${m.content}\n\n/no_think` } : m))
    : messages;
  const payload: Record<string, unknown> = {
    model: model.id,
    messages: envoyes,
    stream: false,
    temperature: 0.2,
    max_tokens: options.maxTokens ?? 2048,
    // Qwen3.5 et suivants : `/no_think` n'y fait plus rien, LM Studio suit ce champ (chat.ts).
    ...(backend.kind === "lmstudio" && /qwen3/i.test(model.id) ? { reasoning_effort: "none" } : {}),
    ...(options.schema && backend.kind === "lmstudio"
      ? { response_format: { type: "json_schema", json_schema: { name: options.schema.nom, strict: true, schema: options.schema.schema } } }
      : {}),
  };

  let reponse: Response;
  try {
    reponse = await fetch(`${backend.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(backend.entetes ?? {}),
        ...(backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.delaiMs ?? 10 * 60_000),
    });
  } catch {
    return { ok: false, message: tf("Le modèle {0} n'a pas répondu à temps.", model.id) };
  }
  const corps = (await reponse.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string } | string;
  } | null;
  if (!reponse.ok || !corps) {
    const detail = typeof corps?.error === "string" ? corps.error : (corps?.error?.message ?? "");
    const tropLong = /context|too long|maximum|exceed/i.test(detail);
    return {
      ok: false,
      tropLong,
      message: tropLong ? "Le texte dépasse ce que le modèle peut lire d'un coup." : `Le modèle a refusé la demande (${reponse.status}).`,
    };
  }
  usage.releverReponse(options.qui, model, payload, corps);
  const brut = corps.choices?.[0]?.message?.content ?? "";
  const texte = brut.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!texte) return { ok: false, message: t("Le modèle n'a rien répondu.") };
  return { ok: true, texte, modele: model.id, origine: (model.origine ?? "local") === "local" ? "local" : "agence", ...(model.pays ? { pays: model.pays } : {}) };
}
