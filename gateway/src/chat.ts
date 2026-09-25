import type http from "node:http";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve as resoudreChemin, sep } from "node:path";
import { entetesFlux } from "./entetes.ts";
import { niveauEffort } from "./config.ts";
import { resolve, invalidate, peutVoir } from "./router.ts";
import { loadModel } from "./backends.ts";
import { toolsForModel, hasTools, workspace } from "./mcp.ts";
import { executerOutil, cibleDe } from "./outils.ts";
import * as computer from "./computer.ts";
import * as bureau from "./bureau.ts";
import * as bibliotheque from "./bibliotheque.ts";
import * as connaissances from "./connaissances.ts";
import * as reunions from "./reunions.ts";
import { groupesDe } from "./groupes.ts";
import * as courrier from "./courrier.ts";
import * as controleWeb from "./controleWeb.ts";
import * as agenda from "./agenda.ts";
import * as drive from "./drive.ts";
import * as slack from "./slack.ts";
import { journaliser } from "./audit.ts";
import * as approbation from "./approbation.ts";
import * as usage from "./usage.ts";
import { suivreAppelModele } from "./attenteModele.ts";
import { compacterOutils } from "./allegementCode.ts";
import {
  ETAPES_TOTALES_MAX,
  PROFONDEUR_MAX,
  SOUS_ETAPES_MAX,
  consigneDeComplement,
  consigneDePartie,
  consigneDePlan,
  estQuestionSimple,
  estReplique,
  consigneDeRevue,
  consigneDeSousPlan,
  consigneDEtape,
  consigneDeCompteRendu,
  consigneDeRattrapage,
  conclusionDuControle,
  consigneDeVerification,
  cibleAbsente,
  declareRienAFaire,
  etapeDeLecture,
  etapeExigeAction,
  sansDoublons,
  lirePlan,
  manqueCouvertParLaSuite,
  rappelDes,
  regrouperParFichier,
  strategie,
  type Avancement,
  type Plan,
} from "./plan.ts";
import type { BackendConfig, ChatRequest, ModelInfo } from "./types.ts";
import { t, tf } from "./langue.ts";

/**
 * Boucle conversationnelle avec outils (ARCHITECTURE.md, ADR-003/004).
 *
 * Le modèle peut demander l'exécution d'outils MCP ; la passerelle les exécute
 * et relance le modèle avec les résultats, jusqu'à une réponse finale. Le front
 * reçoit un flux SSE compatible OpenAI, enrichi d'événements `helix` décrivant
 * l'activité des outils.
 */

/**
 * Nombre d'allers-retours d'outils dans une même demande.
 *
 * Six suffisait pour « lis ce fichier et résume-le », pas pour un vrai travail :
 * ranger quatre factures demande une liste, quatre lectures, quatre dossiers et
 * quatre déplacements. Au plafond, l'agent s'arrêtait **en pleine action**, le
 * travail à moitié fait et sans un mot pour l'utilisateur.
 *
 * Un petit modèle en consomme davantage qu'un grand — il se trompe de chemin,
 * relit, recommence. C'est précisément lui qu'il faut laisser respirer.
 */
const MAX_ITERATIONS = Number(process.env.HELIX_MAX_ETAPES ?? 30);

/**
 * Marge de fin : avant d'atteindre le plafond, on demande à l'agent de
 * conclure. Il rend alors un compte rendu de ce qui est fait et de ce qui
 * reste, au lieu d'être coupé net.
 */
const ETAPES_AVANT_CONCLUSION = 3;

interface ToolCallAccumulator {
  id: string;
  name: string;
  args: string;
}

interface UpstreamResult {
  content: string;
  toolCalls: ToolCallAccumulator[];
  finishReason: string | null;
}

function sse(res: http.ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Émet un fragment de contenu au format OpenAI (compris par le front). */
function emitContent(res: http.ServerResponse, text: string): void {
  sse(res, { choices: [{ index: 0, delta: { content: text } }] });
}

function emitHelix(res: http.ServerResponse, event: Record<string, unknown>): void {
  sse(res, { helix: event });
}

/**
 * Consomme un flux SSE amont : relaie contenu et raisonnement au client,
 * accumule les appels d'outils demandés par le modèle.
 */
async function consumeUpstream(
  upstream: Response,
  res: http.ServerResponse,
  /** Relevé de consommation de cette requête (usage.ts). */
  releve?: usage.Releve,
  /** Ce qui a déjà été écrit dans la réponse, par les appels précédents de la même demande. */
  sortie?: { fin: string },
): Promise<UpstreamResult> {
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let content = "";
  let finishReason: string | null = null;
  const toolCalls: ToolCallAccumulator[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;

        let json: {
          choices?: {
            delta?: {
              content?: string;
              reasoning_content?: string;
              tool_calls?: {
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }[];
            };
            finish_reason?: string | null;
          }[];
        };
        try {
          json = JSON.parse(raw);
        } catch {
          continue;
        }

        /*
         * Consommation, lue AVANT le test qui suit : le moteur la renvoie dans
         * un dernier fragment dont `choices` est vide. Placée après, elle
         * serait sautée à chaque requête, sans erreur ni trace.
         */
        releve?.observer(json);

        const choice = json.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};

        if (typeof delta.content === "string" && delta.content) {
          /*
           * Une étape, sa reprise et son contrôle écrivent chacun à la suite
           * dans la même réponse. Sans séparation, les textes se collaient :
           * « …avant de continuer.Le dossier… » (vu sur un plan réel). Un
           * paragraphe neuf, seulement si le texte précédent n'en finit pas déjà un.
           */
          if (!content && sortie?.fin && !/\n\s*$/.test(sortie.fin)) emitContent(res, "\n\n");
          content += delta.content;
          emitContent(res, delta.content);
          if (sortie) sortie.fin = (sortie.fin + delta.content).slice(-4);
        }
        if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
          sse(res, {
            choices: [{ index: 0, delta: { reasoning_content: delta.reasoning_content } }],
          });
        }

        // Les appels d'outils arrivent par fragments, indexés.
        for (const call of delta.tool_calls ?? []) {
          const idx = call.index ?? 0;
          while (toolCalls.length <= idx) toolCalls.push({ id: "", name: "", args: "" });
          const slot = toolCalls[idx];
          if (call.id) slot.id = call.id;
          if (call.function?.name) slot.name += call.function.name;
          if (call.function?.arguments) slot.args += call.function.arguments;
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }
  }

  return { content, toolCalls: toolCalls.filter((t) => t.name), finishReason };
}

async function callUpstream(
  backend: BackendConfig,
  payload: Record<string, unknown>,
  /** Coupé quand la personne ferme le flux : le moteur cesse alors de générer pour rien. */
  signal?: AbortSignal,
): Promise<Response> {
  const envoyer = (corps: Record<string, unknown>) =>
    fetch(`${backend.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(backend.entetes ?? {}),
        ...(backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {}),
      },
      body: JSON.stringify(corps),
    });

  /*
   * En flux, on demande au moteur sa propre consommation
   * (`stream_options.include_usage`, voir usage.ts). Un moteur qui ne connaît
   * pas ce champ peut refuser la requête entière : on la rejoue alors une fois
   * sans, et sa consommation sera estimée. Une mesure ne vaut jamais une
   * conversation cassée.
   */
  const corps = refusRaisonnement.has(backend.id)
    ? usage.avecMesure(backend.id, sansRaisonnement(payload))
    : usage.avecMesure(backend.id, payload);
  let reponse: Response;
  try {
    reponse = await envoyer(corps);
  } catch (err) {
    /*
     * Moteur éteint ou injoignable. `fetch` ne dit que « fetch failed », en
     * anglais, et c'est ce que la personne lisait dans le Chat. On dit quel
     * moteur, et quoi faire. Un arrêt demandé, lui, remonte tel quel.
     */
    if (signal?.aborted) throw err;
    throw new Error(tf("{0} ne répond pas : vérifiez qu'il est démarré, puis réessayez.", backend.label));
  }
  if (!usage.refusPossible(reponse.status)) return reponse;

  /*
   * Le moteur a refusé. Deux champs facultatifs peuvent en être la cause : on
   * retire d'abord ceux du raisonnement, plus récents et moins répandus, puis
   * la mesure de consommation s'il refuse encore. Les essayer dans cet ordre
   * plutôt que de tout retirer d'un coup évite d'accuser la mesure d'un refus
   * qui ne la concerne pas, et donc de perdre le comptage pour rien.
   *
   * Le niveau de raisonnement garde de toute façon son effet sur le plancher
   * de jetons, qui, lui, n'est refusé par personne.
   */
  let dernier = reponse;

  if (porteDuRaisonnement(corps)) {
    await dernier.body?.cancel().catch(() => {});
    dernier = await envoyer(sansRaisonnement(corps));
    if (dernier.ok) {
      refusRaisonnement.add(backend.id);
      console.log(
        `[chat] ${backend.id} refuse reasoning_effort : le niveau de raisonnement ` +
          `n'agira plus que sur le budget de jetons.`,
      );
      return dernier;
    }
    if (!usage.refusPossible(dernier.status)) return dernier;
  }

  if (corps.stream_options !== undefined) {
    await dernier.body?.cancel().catch(() => {});
    dernier = await envoyer(usage.sansMesure(sansRaisonnement(corps)));
    if (dernier.ok) usage.noterRefus(backend.id);
  }
  return dernier;
}

/**
 * Ajoute une consigne aux instructions système, sans en créer de seconde.
 *
 * Deux messages système successifs sont refusés par certains gabarits de
 * conversation (celui de Qwen3 lève une erreur) : on complète le premier
 * s'il existe, on en crée un sinon.
 */
function avecConsigne(messages: unknown[], consigne: string): unknown[] {
  const copie = [...messages] as { role?: string; content?: unknown }[];
  const i = copie.findIndex((m) => m.role === "system");
  if (i >= 0 && typeof copie[i]!.content === "string") {
    copie[i] = { ...copie[i]!, content: `${copie[i]!.content as string}\n\n${consigne}` };
  } else if (i < 0) {
    copie.unshift({ role: "system", content: consigne });
  }
  return copie;
}

/** Ajoute l'interrupteur `/no_think` de Qwen3 au dernier message de la personne. */
function avecSansReflexion(messages: unknown[]): unknown[] {
  const copie = [...messages] as { role?: string; content?: unknown }[];
  for (let i = copie.length - 1; i >= 0; i--) {
    const m = copie[i]!;
    if (m.role !== "user") continue;
    if (typeof m.content === "string") {
      copie[i] = { ...m, content: `${m.content} /no_think` };
    } else if (Array.isArray(m.content)) {
      copie[i] = { ...m, content: [...m.content, { type: "text", text: "/no_think" }] };
    }
    break;
  }
  return copie;
}

function basePayload(
  body: ChatRequest,
  model: ModelInfo,
  messages: unknown[],
): Record<string, unknown> {
  /*
   * `connaissances` est une extension Helix, déjà traduite en consigne : un
   * fournisseur cloud refuse volontiers un champ qu'il ne connaît pas.
   */
  const { role: _role, effort, messages: _m, tools: _t, connaissances: _k, ...rest } = body as Record<string, unknown> & {
    effort?: string;
  };
  const payload: Record<string, unknown> = { ...rest, model: model.id, messages, stream: true };

  /*
   * Le niveau de raisonnement choisi à l'écran. Voir `NIVEAUX_EFFORT` dans
   * config.ts pour ce que chacun change ; l'essentiel ici : le plancher de
   * jetons vaut pour tout moteur, les deux autres champs sont des extensions
   * que `callUpstream` retire si le moteur les refuse.
   */
  if (model.reasoning) {
    const niveau = niveauEffort(effort);
    const demande = typeof body.max_tokens === "number" ? body.max_tokens : 0;
    if (niveau.raisonner) {
      /*
       * Un plancher, jamais un plafond.
       *
       * Le code posait `max_tokens = max(demandé, plancher)` même quand
       * l'appelant ne demandait **rien** — ce qui est le cas de l'interface.
       * Le « plancher » devenait alors une limite : 768 jetons en « Faible »,
       * 2 048 en « Moyen ». Qwen3 en dépense plusieurs centaines à réfléchir
       * avant d'écrire, et la réponse s'arrêtait au milieu d'une phrase, ou
       * ne commençait jamais : une bulle vide, « il n'a jamais répondu ».
       * Reproduit contre LM Studio : `finish_reason: length`, réponse coupée
       * à « plusieurs ».
       *
       * Sans demande, on ne limite donc rien : le moteur va jusqu'au bout.
       * Le plancher ne sert qu'à relever une demande trop courte pour
       * contenir à la fois la réflexion et la réponse.
       */
      if (demande > 0) payload.max_tokens = Math.max(demande, niveau.minTokens);
      if (niveau.amont) payload.reasoning_effort = niveau.amont;
      if (niveau.consigne) payload.messages = avecConsigne(messages, niveau.consigne);
    } else {
      /*
       * « Aucun » : ne pas réfléchir du tout.
       *
       * `enable_thinking` est le moyen prévu, mais LM Studio ne le transmet
       * pas (mesuré : 144 jetons de réflexion malgré lui). Qwen3 a en plus un
       * interrupteur écrit dans le message même, `/no_think`, que son gabarit
       * lit directement : mesuré, zéro jeton de réflexion. On pose les deux.
       *
       * Qwen3.5 et suivants n'ont plus `/no_think` (mesuré le 24/09/2026 sur
       * Qwen3.5 9B : 1 325 caractères de réflexion malgré lui, 31 s pour une
       * phrase). Ce que LM Studio suit pour eux, c'est `reasoning_effort:
       * "none"` : zéro réflexion, 1 s. Qwen3 8B l'accepte aussi (mesuré) ; un
       * moteur qui le refuse voit la requête rejouée sans (CHAMPS_RAISONNEMENT).
       */
      if (demande > 0) payload.max_tokens = demande;
      payload.chat_template_kwargs = { enable_thinking: false };
      payload.reasoning_effort = "none";
      if (/qwen3(?![.\d])|qwq/i.test(model.id)) payload.messages = avecSansReflexion(messages);
    }
  }
  return payload;
}

/**
 * Combien de fois de suite le modèle vient-il de refaire exactement la même
 * action ? Lu dans la conversation que l'appelant renvoie à chaque tour.
 *
 * Cas réel (23/09/2026, écran Code, Qwen3 8B) : à « réponds seulement le mot
 * prêt », le modèle a écrit six fois de suite le même fichier `prêt.txt`,
 * chaque écriture réussie relançant la suivante, sans jamais répondre. Un
 * petit modèle dans une boucle d'agent fait cela ; c'est la boucle qui doit
 * l'arrêter, puisque le modèle ne le fera pas.
 */
function repetitionsOutil(messages: unknown[]): number {
  const signatures: string[] = [];
  const liste = messages as {
    role?: string;
    tool_calls?: { function?: { name?: string; arguments?: string } }[];
  }[];
  for (let i = liste.length - 1; i >= 0; i--) {
    const m = liste[i]!;
    if (m.role === "tool") continue;
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      signatures.push(
        m.tool_calls
          .map((c) => {
            let args = c.function?.arguments ?? "";
            try {
              args = JSON.stringify(JSON.parse(args));
            } catch {
              /* illisible : on compare tel quel */
            }
            return `${c.function?.name ?? ""}:${args}`;
          })
          .join("|"),
      );
      continue;
    }
    break; // une demande, ou une réponse écrite : la série s'arrête là
  }
  let n = signatures.length > 0 ? 1 : 0;
  while (n < signatures.length && signatures[n] === signatures[0]) n++;
  return n;
}

/** Au-delà, on le dit au modèle ; plus loin encore, on lui retire les outils. */
const REPETITIONS_AVERTIR = 3;
const REPETITIONS_ARRETER = 5;

/*
 * Les demandes que l'agent de code a réellement portées jusqu'au modèle.
 *
 * Sert à reconnaître une session d'OpenCode morte d'une session lente
 * (index.ts, `handleCodePrompt`). Une session vivante appelle le modèle dans
 * la seconde qui suit la demande — même si la réponse, elle, met ensuite des
 * dizaines de secondes à venir, le temps que le modèle lise le long texte
 * d'instructions d'OpenCode. Une session morte ne l'appelle jamais. On garde
 * donc, pour quelques minutes, le texte de la dernière demande de chaque appel.
 */
const appelsAgent: { quand: number; texte: string }[] = [];

function noterAppelAgent(messages: unknown): void {
  const liste = Array.isArray(messages) ? (messages as { role?: string; content?: unknown }[]) : [];
  for (let i = liste.length - 1; i >= 0; i--) {
    const m = liste[i]!;
    if (m.role !== "user") continue;
    const texte =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? (m.content as { type?: string; text?: string }[]).map((p) => p.text ?? "").join(" ")
          : "";
    appelsAgent.push({ quand: Date.now(), texte });
    break;
  }
  const limite = Date.now() - 10 * 60_000;
  while (appelsAgent.length > 0 && (appelsAgent[0]!.quand < limite || appelsAgent.length > 200)) appelsAgent.shift();
}

/** Cette demande de l'agent de code a-t-elle atteint le modèle depuis ce moment ? */
export function agentAAppele(texte: string, depuis: number): boolean {
  const cherche = texte.trim();
  return appelsAgent.some((a) => a.quand >= depuis && a.texte.includes(cherche));
}

/** Le dernier message de la personne porte-t-il une image ? */
function contientDesImages(messages: unknown[] | undefined): boolean {
  const derniers = (messages ?? []) as { role?: string; content?: unknown }[];
  const dernier = [...derniers].reverse().find((m) => m.role === "user");
  return Array.isArray(dernier?.content)
    ? (dernier.content as { type?: string }[]).some((p) => p.type === "image_url")
    : false;
}

/** Remplace chaque image par une note que le modèle lira. */
function sansImages(messages: unknown[]): unknown[] {
  return (messages as { role?: string; content?: unknown }[]).map((m) =>
    Array.isArray(m.content)
      ? {
          ...m,
          content: (m.content as { type?: string }[]).map((p) =>
            p.type === "image_url"
              ? {
                  type: "text",
                  text:
                    "[Une image était jointe ici, mais aucun modèle de cette machine ne sait lire les images. " +
                    "Dis-le simplement, et réponds à la question avec ce que tu sais.]",
                }
              : p,
          ),
        }
      : m,
  );
}

/**
 * Le refus du moteur, dit à la personne.
 *
 * Le cas courant est une conversation devenue plus longue que ce que le modèle
 * lit d'un coup (28 000 jetons pour qwen3-8b tel que chargé) : un long Chat, un
 * gros document joint. Le moteur le dit en anglais technique, dans un JSON
 * recopié tel quel ; la personne ne pouvait pas deviner qu'un nouveau Chat
 * suffisait. Les autres refus restent affichés avec leur détail.
 */
function erreurDuMoteur(statut: number, detail: string, modele: string): string {
  if (/context|n_ctx|too long|too many tokens|exceed|greater than the/i.test(detail)) {
    return tf(
      "La conversation dépasse ce que {0} peut lire d'un coup. Ouvrez un nouveau Chat, ou retirez une pièce jointe ou une partie du texte.",
      modele,
    );
  }
  return tf("Erreur du backend ({0}) : {1}", statut, detail.slice(0, 300));
}

/** Champs de raisonnement : des extensions, que tout moteur ne connaît pas. */
/**
 * La réponse décrit-elle une action à faire plutôt qu'un résultat ? Des
 * consignes à l'impératif ou une intention au futur, en fin de tour, sans
 * outil appelé : c'est le travers d'un petit modèle qui pilote un écran.
 */
function decritAuLieuDeFaire(texte: string): boolean {
  const t = texte.trim();
  if (!t || t.length > 1500) return false;
  if (/\b(enregistr[ée]|termin[ée]|c'est fait|a été (créé|enregistré|ouvert))\b/i.test(t)) return false;
  return /(^|\n)\s*(\*\*action|saisis|tape|clique|ouvre|enregistre|appuie|s[ée]lectionne|je vais|je dois|maintenant,? je|ensuite,? je|type|click|open|i will|i'll)\b/i.test(t);
}

/** Le modèle dit-il qu'il ne peut pas faire ce qu'on lui demande ? (fr, en, zh) */
function ditImpossible(texte: string): boolean {
  return /\b(impossible|je ne peux pas|je ne suis pas en mesure|je n'ai pas (?:acc[eè]s|la possibilit[eé])|aucun outil|cannot|can't|unable to|not able to)\b|无法|不能/i.test(texte);
}

const CHAMPS_RAISONNEMENT = ["reasoning_effort", "chat_template_kwargs"] as const;

/** Moteurs qui ont refusé ces champs : on ne les leur renvoie plus. */
const refusRaisonnement = new Set<string>();

function sansRaisonnement(payload: Record<string, unknown>): Record<string, unknown> {
  const copie = { ...payload };
  for (const champ of CHAMPS_RAISONNEMENT) delete copie[champ];
  return copie;
}

function porteDuRaisonnement(payload: Record<string, unknown>): boolean {
  return CHAMPS_RAISONNEMENT.some((champ) => champ in payload);
}

/**
 * Contenu actuel des fichiers texte modifiés par une demande, pour la revue
 * finale : chacun borné à 6 000 caractères, 16 000 en tout. Relu depuis le
 * disque, dans le dossier de travail seulement.
 */
function contenuDesFichiers(chemins: string[]): string {
  const racine = workspace();
  const morceaux: string[] = [];
  let reste = 16_000;
  for (const c of chemins) {
    if (!/\.(html?|css|m?js|ts|tsx|jsx|json|md|txt|py|php|xml|ya?ml|csv|sql|sh|vue|svelte)$/i.test(c)) continue;
    const absolu = isAbsolute(c) ? c : resoudreChemin(racine, c);
    if (absolu !== racine && !absolu.startsWith(racine + sep)) continue;
    let texte: string;
    try {
      texte = readFileSync(absolu, "utf8");
    } catch {
      morceaux.push(`=== ${c} ===\n(fichier absent)`);
      continue;
    }
    const bloc = `=== ${c} ===\n${texte.length > 6000 ? `${texte.slice(0, 6000)}\n[…coupé]` : texte}`;
    if (bloc.length > reste) break;
    morceaux.push(bloc);
    reste -= bloc.length;
  }
  return morceaux.join("\n\n");
}

/**
 * La conversation qui précède la dernière demande, en texte, pour que le
 * modèle qui organise le travail comprenne « vas-y » ou « fais pareil pour
 * Martin ». Bornée : six messages, 1 200 caractères chacun.
 */
function contexteDe(messages: unknown[]): string {
  const textes = (messages as { role?: string; content?: unknown }[])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      texte:
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? (m.content as { type?: string; text?: string }[]).filter((p) => p.type === "text").map((p) => p.text ?? "").join(" ")
            : "",
    }))
    .filter((m) => m.texte.trim());
  // La dernière demande est donnée à part.
  if (textes.at(-1)?.role === "user") textes.pop();
  return textes
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"} : ${m.texte.trim().slice(0, 1200)}`)
    .join("\n");
}

/**
 * Arguments d'un appel d'outil, réparés au besoin, et seulement sur la forme.
 *
 * Un petit modèle oublie volontiers l'accolade finale ou laisse une virgule de
 * trop : on referme ce qui manque. Jamais une valeur coupée en route : un
 * chemin tronqué (« decoupe/notes/202… ») refermé tel quel devient un vrai
 * chemin, faux. Mesuré sur qwen3-8b avant cette règle : une note renommée
 * « 202 ». Une chaîne restée ouverte fait donc refuser l'appel, et le modèle
 * le refait.
 */
function lireArguments(brut: string): Record<string, unknown> | null {
  const essayer = (t: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(t) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = essayer(brut);
  if (direct) return direct;
  const t = brut.trim().replace(/,\s*$/, "");
  // Une chaîne ouverte (nombre impair de guillemets non échappés) : valeur tronquée, refusée.
  if ((t.match(/(?<!\\)"/g) ?? []).length % 2 === 1) return null;
  const ouvertes = (t.match(/\{/g) ?? []).length - (t.match(/\}/g) ?? []).length;
  if (ouvertes < 0 || ouvertes > 3) return null;
  return essayer(t + "}".repeat(ouvertes));
}

/**
 * Réponse sans flux, pour un appel par clé d'API qui ne demande pas
 * `stream: true` (le défaut du paquet `openai`).
 *
 * Le moteur est toujours interrogé en flux (`basePayload`), ce qui garde la
 * mesure de consommation et l'arrêt quand le client s'en va. On recompose ici,
 * à partir des fragments, l'objet `chat.completion` qu'attend un client
 * OpenAI : texte, raisonnement, appels d'outils demandés par le modèle (que
 * le client exécutera lui-même), raison de fin, consommation.
 */
class ReponseEntiere {
  private id = "";
  private cree = 0;
  private modele = "";
  private texte = "";
  private raisonnement = "";
  private fin: string | null = null;
  private consommation: unknown = undefined;
  private erreur: unknown = undefined;
  private readonly appels: { id: string; name: string; args: string }[] = [];

  observer(json: unknown): void {
    const j = json as {
      id?: string;
      created?: number;
      model?: string;
      usage?: unknown;
      error?: unknown;
      choices?: {
        delta?: {
          content?: string;
          reasoning_content?: string;
          tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
        };
        finish_reason?: string | null;
      }[];
    };
    if (j.error) this.erreur = j.error;
    if (j.id && !this.id) this.id = j.id;
    if (j.created && !this.cree) this.cree = j.created;
    if (j.model && !this.modele) this.modele = j.model;
    if (j.usage) this.consommation = j.usage;
    const choix = j.choices?.[0];
    if (!choix) return;
    const d = choix.delta ?? {};
    if (typeof d.content === "string") this.texte += d.content;
    if (typeof d.reasoning_content === "string") this.raisonnement += d.reasoning_content;
    for (const appel of d.tool_calls ?? []) {
      const i = appel.index ?? 0;
      while (this.appels.length <= i) this.appels.push({ id: "", name: "", args: "" });
      const case_ = this.appels[i]!;
      if (appel.id) case_.id = appel.id;
      if (appel.function?.name) case_.name += appel.function.name;
      if (appel.function?.arguments) case_.args += appel.function.arguments;
    }
    if (choix.finish_reason) this.fin = choix.finish_reason;
  }

  objet(modeleDemande: string, sources: unknown[] | undefined): Record<string, unknown> {
    if (this.erreur) return { error: this.erreur };
    const appels = this.appels.filter((a) => a.name);
    return {
      id: this.id || `chatcmpl-${Date.now().toString(36)}`,
      object: "chat.completion",
      created: this.cree || Math.floor(Date.now() / 1000),
      model: this.modele || modeleDemande,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: appels.length > 0 && !this.texte ? null : this.texte,
            ...(this.raisonnement ? { reasoning_content: this.raisonnement } : {}),
            ...(appels.length > 0
              ? { tool_calls: appels.map((a) => ({ id: a.id, type: "function", function: { name: a.name, arguments: a.args } })) }
              : {}),
          },
          finish_reason: this.fin ?? "stop",
        },
      ],
      ...(this.consommation ? { usage: this.consommation } : {}),
      // Extension : les passages des bases de connaissances qui ont servi (champ `connaissances`).
      ...(sources ? { helix: { sources } } : {}),
    };
  }
}

/** Traite une requête de conversation, avec ou sans outils. */
/** La requête vient-elle de la machine qui héberge l'instance ? */
function surLaMemeMachine(req: http.IncomingMessage): boolean {
  const adresse = (req.socket.remoteAddress ?? "").replace(/^::ffff:/i, "");
  return adresse === "127.0.0.1" || adresse === "::1" || adresse === "";
}

export async function handleChatRequest(
  body: ChatRequest,
  res: http.ServerResponse,
  /** Requête d'origine : sert à poser les bons en-têtes sur le flux. */
  req: http.IncomingMessage,
  /**
   * Compte au nom duquel l'agent agit. Un agent qui déplace les factures d'un
   * client engage quelqu'un : le journal doit pouvoir dire qui.
   */
  qui: string | undefined = undefined,
  /**
   * Compte dont on vérifie l'accès aux modèles branchés par clé personnelle.
   * Le même que `qui`, sauf pour un employé : c'est alors son propriétaire.
   */
  titulaire: string | undefined = qui,
  /**
   * Appel fait avec une clé d'API personnelle (clesApi.ts). Deux différences
   * avec un client ordinaire : les bases de connaissances du champ
   * `connaissances` sont consultées, au nom de la titulaire, comme pour
   * l'écran ; et sans `stream: true`, la réponse est un objet JSON unique,
   * comme le veut l'API d'OpenAI (le relais ne rendait que du flux).
   */
  options: { parCleApi?: boolean; nonFlux?: boolean } = {},
): Promise<void> {
  const nonFlux = options.parCleApi === true && options.nonFlux === true;
  /*
   * Sans personne identifiée **et** depuis une autre machine : aucun modèle
   * payé par clé.
   *
   * `POST /v1/chat/completions` s'utilise légitimement au seul jeton
   * d'instance : c'est l'API compatible, et c'est par là qu'OpenCode parle à
   * la passerelle. Mais elle servait aussi les clés de portée « équipe »,
   * c'est-à-dire la carte bancaire de l'entreprise, à qui détient un jeton
   * présent sur chaque poste du parc, sans qu'aucun nom ne figure en face de
   * la dépense.
   *
   * La boucle locale reste servie : c'est la machine de l'instance qui parle
   * à elle-même (OpenCode), et qui la tient dépense déjà ce qu'elle veut. Les
   * modèles locaux et ceux de l'instance, eux, restent ouverts à tous.
   */
  /*
   * L'écran de Helix, ou un client ordinaire de l'API compatible ?
   *
   * L'écran envoie toujours `tools` en booléen (true ou false) : c'est
   * l'extension Helix. Un client ordinaire — OpenCode, un script — envoie une
   * liste d'outils ou rien. La différence compte : le découpage des tâches et
   * les événements `helix` n'ont de sens que pour l'écran. Glissés dans le
   * flux d'OpenCode, ils faisaient échouer la validation de son SDK
   * (« AI_TypeValidationError: Value: {"helix":{"type":"plan_debut"…}} ») :
   * l'agent de code ne répondait pas, et rien ne le disait.
   */
  const interfaceHelix = typeof body.tools === "boolean";
  /*
   * Un client ordinaire (l'agent de code) : on note que sa demande a atteint le
   * modèle. Seulement l'appel **qui porte ses outils** : OpenCode envoie aussi,
   * pour la même demande, un appel sans outils qui génère le titre de la
   * conversation. Compté, il faisait passer pour vivante une session dont le
   * travail, lui, n'était jamais parti.
   */
  if (
    !interfaceHelix &&
    !req.headers["x-helix-employe"] &&
    Array.isArray(body.tools) &&
    body.tools.length > 0
  ) {
    noterAppelAgent(body.messages);
  }
  /** Un événement pour l'écran ; rien pour un client qui ne le comprendrait pas. */
  const signaler = (evenement: Record<string, unknown>) => {
    if (interfaceHelix) emitHelix(res, evenement);
  };
  /** Réponse unique en JSON (clé d'API sans `stream: true`), avec les mêmes en-têtes de sécurité que le flux. */
  const repondreJson = (statut: number, corps: unknown) => {
    const texte = JSON.stringify(corps);
    res.writeHead(statut, {
      ...entetesFlux(req),
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(texte),
    });
    res.end(texte);
  };
  /** Une erreur, dans la langue que le client comprend. */
  const signalerErreur = (message: string) => {
    if (interfaceHelix) emitHelix(res, { type: "error", message });
    else if (nonFlux) repondreJson(502, { error: { message } });
    else sse(res, { error: { message } });
  };

  const avecImages = contientDesImages(body.messages);
  const resolution = await resolve({
    model: body.model,
    role: body.role,
    acces: titulaire,
    anonyme: !qui && !surLaMemeMachine(req),
    images: avecImages,
  });
  if ("error" in resolution) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: { message: resolution.error } }));
    return;
  }
  const { model, backend } = resolution;

  /*
   * Deux façons de demander des outils :
   *  - `tools: true`  extension Helix, la passerelle injecte ses outils MCP et
   *                   exécute la boucle elle-même (interface Helix) ;
   *  - `tools: [...]` format OpenAI standard, l'appelant fournit et exécute ses
   *                   propres outils (OpenCode, ou tout client compatible).
   * Dans le second cas la passerelle relaie sans rien exécuter : c'est le client
   * qui tient la boucle.
   */
  const callerTools = Array.isArray(body.tools) ? body.tools : undefined;

  /*
   * Les outils d'écran ne sont proposés qu'à un modèle qui sait lire une image.
   * Les offrir à un modèle de conversation le pousserait à prendre des captures
   * qu'il ne peut pas voir, puis à cliquer au hasard.
   */
  const voitLesImages = model.roles.includes("gui") || model.roles.includes("vision");
  const outilsEcran = voitLesImages ? computer.toolsForModel() : [];

  // Vide tant que l'atelier bureautique n'est pas installé : voir bureau.ts.
  const outilsBureau = bureau.toolsForModel();

  // Vide tant qu'aucune boîte n'est connectée : voir courrier.ts.
  const outilsCourrier = courrier.toolsForModel();

  // Vide tant qu'aucun agenda n'est connecté : voir agenda.ts.
  const outilsAgenda = agenda.toolsForModel();

  // Vides tant que Google Drive ou Slack ne sont pas branchés : voir drive.ts, slack.ts.
  const outilsDrive = drive.toolsForModel();
  const outilsSlack = slack.toolsForModel();

  // La bibliothèque de l'équipe et les réunions transcrites : ce que la personne y voit, en lecture.
  const outilsBibliotheque = qui ? [...bibliotheque.toolsForModel(), ...reunions.toolsForModel()] : [];

  const useTools =
    body.tools === true &&
    (hasTools() ||
      outilsEcran.length > 0 ||
      outilsBureau.length > 0 ||
      outilsCourrier.length > 0 ||
      outilsAgenda.length > 0 ||
      outilsDrive.length > 0 ||
      outilsSlack.length > 0 ||
      outilsBibliotheque.length > 0);
  // Fichiers, écran, bureautique, courrier et agenda arrivent dans la même
  // liste : l'agent enchaîne les cinq dans une seule demande, sans que
  // l'utilisateur ait à changer de surface.
  const tools = useTools
    ? [
        ...toolsForModel(),
        // Le contrôle du code web accompagne le serveur de fichiers : il lit ce que celui-ci a écrit.
        ...(hasTools() ? controleWeb.toolsForModel() : []),
        ...outilsEcran,
        ...outilsBureau,
        ...outilsCourrier,
        ...outilsAgenda,
        ...outilsDrive,
        ...outilsSlack,
        ...outilsBibliotheque,
      ]
    : undefined;

  /*
   * Ce flux transporte le contenu des conversations : il porte les mêmes
   * en-têtes de sécurité et la même restriction d'origine que les autres.
   * Il les écrivait à la main, avec `Access-Control-Allow-Origin: *` figé,
   * ce qui laissait n'importe quelle page ouverte dans le navigateur lire les
   * réponses dès lors qu'elle disposait du jeton.
   */
  // Sans flux, les en-têtes partent avec la réponse entière (`repondreJson`).
  if (!nonFlux) {
    res.writeHead(200, {
      ...entetesFlux(req),
      "X-Accel-Buffering": "no",
      "X-Helix-Model": model.uid,
      "X-Helix-Backend": backend.id,
    });
  }

  /*
   * La personne a fermé le flux (bouton Arrêter, changement de Chat, fenêtre
   * fermée) : tout s'arrête ici aussi.
   *
   * Sans cela, la passerelle continuait comme si de rien n'était : le moteur
   * finissait de générer une réponse que personne ne lirait, et un plan
   * enchaînait ses étapes, **outils compris** — des fichiers écrits ou
   * déplacés après que la personne a dit stop. Sur un moteur local qui ne
   * sert qu'une requête à la fois, la demande suivante attendait en plus
   * derrière cette réponse fantôme. `writableFinished` distingue une fin
   * normale (flux déjà clos par nous) d'une fermeture par l'autre bout.
   */
  const arret = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) arret.abort();
  });
  /** Levée pour sortir de toutes les boucles d'un coup ; rattrapée en bas, sans message (personne ne lit plus). */
  const siArrete = () => {
    if (arret.signal.aborted) throw new Error("arret-demande");
  };

  /*
   * Un modèle téléchargé mais pas en mémoire : on le charge avant de lui
   * parler, en le disant. Sans ce chargement, LM Studio répond « modèle
   * introuvable » ; sans le message, la personne regarde une bulle vide
   * pendant les quelques secondes que prend la mise en mémoire.
   */
  /*
   * Un appel de Helix Code (OpenCode joint l'identifiant de sa session) :
   * tant que le modèle n'a rien rendu, chargement compris, la passerelle dit
   * aux clients où il en est (attenteModele.ts). Mesuré le 25/09/2026 :
   * jusqu'à 146,9 s de lecture avant le premier mot, que l'écran prenait pour
   * une panne. La taille est affinée juste avant l'envoi.
   */
  // Seulement l'appel qui porte les outils : le titre de la session, demandé à côté, n'est pas le travail.
  const attente =
    interfaceHelix || !Array.isArray(body.tools) || body.tools.length === 0
      ? null
      : suivreAppelModele(req.headers, model.id, backend, JSON.stringify(body.messages).length + JSON.stringify(body.tools).length);
  if (model.backendKind === "lmstudio" && model.loaded === false) {
    signaler({ type: "statut", message: tf("Chargement de {0} en mémoire...", model.id) });
    attente?.chargement(true);
    const charge = await loadModel(model.id);
    attente?.chargement(false);
    invalidate();
    if (!charge.ok) {
      attente?.fin();
      if (nonFlux) return repondreJson(503, { error: { message: charge.message } });
      signalerErreur(charge.message);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    signaler({ type: "statut", message: "" });
  }

  let messages: unknown[] = [...body.messages];

  /*
   * Ce que le modèle peut obtenir si la personne branche un service.
   *
   * Sans cette note, un modèle sans outil de courrier ne sait pas que la
   * messagerie peut être connectée. Constaté le 23/09/2026 : à « et si je te
   * connecte (à mes mails) ? », il a répondu qu'aucune fonction ne le
   * permettait, au lieu de dire oui et d'indiquer où le faire. Seulement pour
   * l'interface Helix : un client tiers a ses propres réglages.
   */
  /*
   * Chat sans outils (le bouton « Outils » de la zone de saisie est éteint) :
   * le modèle ne peut rien créer ni modifier. Sans le lui dire, il raconte
   * volontiers qu'il l'a fait.
   */
  if (body.tools === false) {
    const note =
      "Dans cette conversation, tu n'as aucun outil : tu ne peux ni créer, ni lire, ni modifier, ni déplacer de fichier, " +
      "ni agir sur quoi que ce soit en dehors de ta réponse écrite. Si on te le demande, dis-le franchement, sans jamais " +
      "prétendre l'avoir fait, et indique que la personne peut activer « Outils » sous la zone de saisie (ou passer dans Cowork). " +
      "Tu peux proposer le contenu à copier elle-même.";
    const premier = messages[0] as { role?: string; content?: unknown } | undefined;
    messages =
      premier?.role === "system" && typeof premier.content === "string"
        ? [{ ...premier, content: `${premier.content}\n\n${note}` }, ...messages.slice(1)]
        : [{ role: "system", content: note }, ...messages];
  }

  if (body.tools === true) {
    const aBrancher = [
      outilsCourrier.length === 0 ? "la messagerie (lire, chercher, rédiger et envoyer des mails)" : "",
      // Ce que les connecteurs savent réellement faire (agenda.ts, slack.ts : lecture seule), pas plus.
      outilsAgenda.length === 0 ? "l'agenda (consulter les rendez-vous, sans en créer)" : "",
      outilsDrive.length === 0 ? "Google Drive (retrouver et lire des documents)" : "",
      outilsSlack.length === 0 ? "Slack (lire les salons et les messages, sans en envoyer)" : "",
    ].filter(Boolean);
    if (aBrancher.length > 0) {
      const note =
        "Services que la personne peut connecter mais qui ne le sont pas encore : " +
        aBrancher.join(" ; ") +
        ". Elle les connecte elle-même en un clic dans Paramètres, rubrique Connecteurs. " +
        "Si elle demande si tu pourrais t'en servir, réponds simplement oui, dis ce que tu pourras faire " +
        "une fois le service connecté et où le connecter. Ne prétends pas y avoir accès tant qu'il n'est pas connecté.";
      const premier = messages[0] as { role?: string; content?: unknown } | undefined;
      if (premier?.role === "system" && typeof premier.content === "string") {
        messages[0] = { ...premier, content: `${premier.content}\n\n${note}` };
      } else {
        messages = [{ role: "system", content: note }, ...messages];
      }
    }
  }

  /*
   * Bases de connaissances choisies par l'écran (celles de l'agent, du projet,
   * ou de la zone de saisie) : les passages proches de la question rejoignent
   * les instructions, et l'écran reçoit de quoi les citer sous la réponse.
   * Les droits se jugent ici, pas dans l'écran : une base ou un document que
   * la personne ne voit pas n'en sort pas (connaissances.ts).
   */
  /** Passages cités, rendus dans la réponse JSON d'un appel par clé d'API (`helix.sources`). */
  let sourcesCitees: unknown[] | undefined;
  if ((interfaceHelix || options.parCleApi) && qui && Array.isArray(body.connaissances) && body.connaissances.length > 0) {
    signaler({ type: "statut", message: t("Recherche dans les bases de connaissances...") });
    const r = await connaissances.contextePourChat(body.connaissances, messages, qui);
    messages = avecConsigne(messages, r.consigne);
    sourcesCitees = r.citations;
    signaler({
      type: "sources",
      sources: r.citations,
      ignorees: r.recherche.ignorees,
      aReindexer: r.recherche.aReindexer,
      ...(r.recherche.erreur ? { erreur: r.recherche.erreur } : {}),
    });
    signaler({ type: "statut", message: "" });
    console.log(
      `[chat] bases de connaissances : ${r.citations.length} passage(s) sur ${r.recherche.morceauxParcourus} morceaux, ${r.recherche.dureeMs} ms`,
    );
  }

  /*
   * Une image, et aucun modèle de la machine ne sait la lire. On ne l'envoie
   * pas à l'aveugle : un modèle de texte qui reçoit une image répond à côté,
   * avec assurance. On la remplace par une note qu'il lira, et on prévient la
   * personne — c'est elle qui peut installer un modèle de vision.
   */
  if (avecImages && !peutVoir(model)) {
    signaler({
      type: "statut",
      message: tf("{0} ne sait pas lire les images : la vôtre n'a pas été vue.", model.id),
    });
    messages = sansImages(messages);
  }

  /*
   * Client ordinaire, ou outils fournis par l'appelant : la passerelle devient
   * un simple relais. Le flux amont est retransmis octet pour octet — appels
   * d'outils compris — car c'est le client (OpenCode, par exemple) qui tient
   * la boucle. Sans outils du tout, c'est le même relais : une demande de
   * titre d'OpenCode n'a pas à passer par le découpage des tâches.
   */
  if (callerTools || !interfaceHelix) {
    /*
     * Garde-fou contre la boucle (voir `repetitionsOutil`). À trois fois la
     * même action, une note le dit au modèle ; à cinq, on lui retire les
     * outils pour la réponse suivante, ce qui l'oblige à écrire au lieu de
     * refaire. Rien n'est inventé à sa place : il répond, avec ses mots.
     */
    const repetitions = callerTools ? repetitionsOutil(messages) : 0;
    const fil =
      repetitions >= REPETITIONS_AVERTIR
        ? [
            ...messages,
            {
              role: "user",
              content:
                `[Note de l'instance] Tu viens de faire ${repetitions} fois de suite exactement la même action, ` +
                "et elle a réussi. Ne la refais pas. Réponds maintenant à la demande de départ, avec tes mots.",
            },
          ]
        : messages;
    const payload = basePayload(body, model, fil);
    if (callerTools && repetitions < REPETITIONS_ARRETER) {
      /*
       * Descriptions des outils livrés d'OpenCode raccourcies (allegementCode.ts) :
       * mesuré le 25/09/2026, 5 915 jetons d'outils sur 8 025 pour la demande la
       * plus simple, relus par le modèle chaque fois qu'il en a perdu le début.
       */
      const outils = compacterOutils(callerTools);
      payload.tools = model.backendKind === "lmstudio" ? outils.map(adapterPourMoteurLocal) : outils;
    } else if (callerTools) {
      console.log(`[chat] ${repetitions} actions identiques de suite : outils retirés pour cette réponse.`);
    }
    if (body.tool_choice !== undefined && payload.tools) payload.tool_choice = body.tool_choice;
    // Sans outils, un `tool_choice` resté dans la demande la ferait refuser.
    if (!payload.tools) delete payload.tool_choice;

    /*
     * Consommation du relais : on lit une copie de chaque morceau, après
     * l'avoir retransmis. Ce qui part vers le client reste exactement ce que
     * le moteur a envoyé ; la mesure n'y ajoute ni n'y retire un octet.
     */
    let releve: usage.Releve | undefined;
    // Une ligne au journal pour chaque appel de Helix Code, sans contenu : la taille de ce qui part au modèle.
    if (attente) {
      const corpsEnvoye = JSON.stringify(payload);
      attente.taille(corpsEnvoye.length);
      const outilsEnvoyes = Array.isArray(payload.tools) ? payload.tools : [];
      console.log(
        `[code] appel au modèle ${model.id} : ${corpsEnvoye.length} caractères, dont ${JSON.stringify(outilsEnvoyes).length} pour ${outilsEnvoyes.length} outils`,
      );
    }
    try {
      const upstream = await callUpstream(backend, payload, arret.signal);
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "");
        signalerErreur(erreurDuMoteur(upstream.status, detail, model.id));
      } else {
        releve = new usage.Releve(qui, model, payload);
        const reponse = nonFlux ? new ReponseEntiere() : null;
        const lire = usage.lecteurSSE((json) => {
          releve?.observer(json);
          reponse?.observer(json);
        });
        const reader = upstream.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          attente?.premierMorceau();
          if (!reponse) res.write(value);
          lire(value);
        }
        if (reponse) {
          const objet = reponse.objet(model.id, sourcesCitees);
          repondreJson("error" in objet ? 502 : 200, objet);
        }
      }
    } catch (err) {
      if (!arret.signal.aborted) signalerErreur(err instanceof Error ? err.message : String(err));
    } finally {
      attente?.fin();
      releve?.clore();
      res.end();
    }
    return;
  }

  /*
   * Mémoire des approbations, le temps de cette demande.
   *
   * Une réponse donnée à l'étape 2 d'un plan vaut encore à l'étape 7, pour les
   * actions de même nature au même endroit : sans cela, ranger vingt factures
   * poserait vingt fois la même question. Elle est refermée en `finally`, y
   * compris si le moteur tombe, pour qu'aucun accord ne survive à la demande
   * qui l'a obtenu.
   */
  const portee = approbation.ouvrirDemande();
  /** Fin du texte déjà envoyé à l'écran : sert à séparer deux textes du modèle (voir consumeUpstream). */
  const sortie = { fin: "" };
  /** Un texte de la passerelle dans la réponse (séparateur, récapitulatif), noté comme tel. */
  const ecrire = (texte: string) => {
    emitContent(res, texte);
    sortie.fin = (sortie.fin + texte).slice(-4);
  };
  /** Fichiers modifiés par cette demande : la revue finale contrôle le code web qui en fait partie. */
  const fichiersTouches = new Set<string>();
  /** Modifications réussies dans toute la demande : sans elles, il n'y a pas de résultat à relire en revue finale. */
  let modificationsDemande = 0;
  /** Un document a-t-il été enregistré dans la machine de l'agent pendant cette demande ? */
  let documentEnregistre = false;

  /**
   * Une boucle d'outils, sur un objectif donné.
   *
   * Extraite pour pouvoir être rejouée étape par étape : chaque étape d'un plan
   * dispose ainsi de son propre budget et de son propre contexte, au lieu de
   * partager un unique fil que les petits modèles finissent par perdre.
   */
  const boucleOutils = async (
    fil: unknown[],
    budget: number,
  ): Promise<{
    texte: string;
    interrompu: false | "moteur" | "budget";
    modifications: number;
    /** Modifications demandées par le modèle et refusées ou ratées. */
    echecs: number;
    /** Lectures réussies : ce qu'il a vérifié par lui-même. */
    lectures: number;
    /** Dernier message d'erreur d'un outil, pour le dire au modèle et à la personne. */
    derniereErreur: string;
    /** Ce que les lectures ont rendu, tel quel, pour les étapes suivantes. */
    releves: { cible: string; extrait: string }[];
    /** Actions refusées par la personne (ou restées sans réponse) : à ne pas retenter. */
    refus?: number;
  }> => {
    let texte = "";
    /*
     * Modifications réellement obtenues. Une étape peut appeler dix outils de
     * lecture et n'avoir rien changé : c'est ce compteur, pas le nombre
     * d'appels, qui dit si le travail a eu lieu.
     */
    let modifications = 0;
    let echecs = 0;
    let lectures = 0;
    let derniereErreur = "";
    let refus = 0;
    const releves: { cible: string; extrait: string }[] = [];

    for (let iteration = 0; iteration < budget; iteration++) {
      siArrete();
      const payload = basePayload(body, model, fil);
      if (tools && tools.length > 0) {
        // Mêmes précautions que pour les outils d'un appelant : un serveur MCP
        // branché peut, lui aussi, déclarer de très grandes bornes.
        payload.tools = model.backendKind === "lmstudio" ? tools.map(adapterPourMoteurLocal) : tools;
        payload.tool_choice = "auto";
      }

      /*
       * Un moteur local rend parfois une erreur passagère : mémoire saturée par
       * un autre modèle, requête arrivée pendant un rechargement. Abandonner
       * l'étape à la première secousse gâchait tout le travail déjà fait, alors
       * qu'un second essai passe presque toujours.
       */
      let upstream = await callUpstream(backend, payload, arret.signal);
      if (upstream.status >= 500) {
        await upstream.body?.cancel().catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
        upstream = await callUpstream(backend, payload, arret.signal);
      }

      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "");
        emitHelix(res, { type: "error", message: erreurDuMoteur(upstream.status, detail, model.id) });
        return { texte, interrompu: "moteur", modifications, echecs, lectures, derniereErreur, releves, refus };
      }

      /*
       * Chaque requête au moteur est comptée : étapes d'un plan, reprises et
       * comptes rendus passent tous par ici. Le relevé est clos même si le
       * flux se coupe en route, puisque le moteur a déjà travaillé.
       */
      const releve = new usage.Releve(qui, model, payload);
      const result = await consumeUpstream(upstream, res, releve, sortie).finally(() => releve.clore());
      if (result.content) texte = result.content;

      // Pas d'outil demandé : la réponse est finale.
      if (result.toolCalls.length === 0) return { texte, interrompu: false, modifications, echecs, lectures, derniereErreur, releves, refus };

      /*
       * Les arguments sont analysés AVANT d'être renvoyés au modèle, et
       * réécrits sous forme canonique.
       *
       * Un petit modèle produit régulièrement du JSON tronqué ou mal fermé.
       * Renvoyé tel quel dans l'historique, il faisait tomber LM Studio en
       * « Internal Server Error » : son gabarit de conversation analyse ce
       * champ, et une chaîne invalide y lève une exception. La demande
       * entière échouait alors, à cause d'un seul appel malformé — c'est ce
       * qui a coûté deux essais de banc, et le second réessai n'y changeait
       * rien puisque la faute était dans ce que nous envoyions.
       */
      const analyses = result.toolCalls.map((t, i) => {
        let args: Record<string, unknown> = {};
        let lisible = true;
        const lu = t.args ? lireArguments(t.args) : {};
        if (lu) args = lu;
        else lisible = false;
        return {
          ...t,
          // Deux appels ne peuvent pas porter le même identifiant : les
          // réponses d'outils ne seraient plus rattachables à leur demande.
          identifiant: t.id || `${t.name}_${i}`,
          args,
          lisible,
          canonique: JSON.stringify(args),
        };
      });

      // Trace l'appel du modèle pour le tour suivant.
      fil.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: analyses.map((t) => ({
          id: t.identifiant,
          type: "function",
          function: { name: t.name, arguments: t.canonique },
        })),
      });

      for (const call of analyses) {
        // Arrêt demandé entre deux actions : la suivante ne part pas.
        siArrete();
        const args = call.args;

        emitHelix(res, { type: "tool_start", name: call.name, args });

        /*
         * Barrière d'approbation. Elle est posée **avant** l'aiguillage vers
         * l'outil, dans la passerelle et non dans l'interface : un client qui
         * appelle cette route en direct avec `tools: true` passe exactement
         * ici. Un refus n'interrompt rien, il devient un résultat d'outil que
         * le modèle lit et dont il tient compte au tour suivant.
         *
         * Un appel dont les arguments sont illisibles ne franchit pas la
         * barrière : on ne sait pas ce qu'il ferait, donc on ne le soumet pas
         * non plus. Il est arrêté juste en dessous, sans jamais atteindre
         * l'outil.
         */
        /*
         * Un outil qu'on n'a pas proposé au modèle ne part pas, même s'il
         * existe : l'aiguillage ci-dessous l'aurait exécuté (un « ecran__… »
         * inventé quand l'écran n'est pas proposé, un outil de fichiers alors
         * que la page ne les donne pas). Refusé sans carte d'accord : il n'y a
         * rien à demander à la personne.
         */
        const propose = (tools ?? []).some((d) => (d as { function?: { name?: string } }).function?.name === call.name);
        /*
         * Un chemin de la machine de l'agent (/home/kasm-user/…) confié aux
         * outils de fichiers : ils agissent sur l'ordinateur de la personne,
         * pas dans la machine. Le refus du serveur de fichiers arrivait en
         * anglais et le modèle recommençait (mesuré le 24/09/2026) : on lui
         * dit plutôt quoi faire.
         */
        const cheminMachine =
          call.name.startsWith("fichiers__") && /\/home\/kasm-user|\/Volumes\/My Shared Files/.test(JSON.stringify(args ?? {}));
        const verdict = cheminMachine
          ? ({
              autorise: false,
              message:
                "Ce chemin est dans ta machine, pas sur l'ordinateur de la personne : les outils « fichiers__… » n'y ont pas accès. " +
                "Pour enregistrer le document ouvert, utilise « ecran__enregistrer_document » avec un nom de fichier.",
            } as approbation.Verdict)
          : !propose
          ? ({
              autorise: false,
              message: `L'outil « ${call.name} » ne fait pas partie de ceux qui te sont proposés : il n'a pas été lancé. Utilise uniquement les outils de ta liste.`,
            } as approbation.Verdict)
          : call.lisible
            ? await approbation.verifierOutil(portee, call.name, args, qui ?? "agent")
            : ({ autorise: true } as approbation.Verdict);

        /*
         * Arguments illisibles : on ne lance pas l'outil, et on le dit au
         * modèle en clair. Il corrige au tour suivant, au lieu de recevoir une
         * erreur de validation qui ne lui apprend rien sur sa propre faute.
         */
        const outcome = !call.lisible && propose
          ? {
              ok: false,
              content:
                "Les arguments de cet appel ne forment pas du JSON valide. " +
                "Rappelle l'outil en écrivant un objet JSON complet et bien fermé.",
              capture: undefined,
            }
          : !verdict.autorise
            ? { ok: false, content: verdict.message, capture: undefined }
            : call.name.startsWith("ecran__")
              ? await computer.callTool(call.name, args, qui ?? "anonyme", portee, model.id)
              : call.name.startsWith("reunions__") && qui
                ? { ...(await reunions.callTool(call.name, args, { userId: qui, groupes: await groupesDe(qui) })), capture: undefined }
                : // Le même aiguillage sert aux employés OpenClaw : voir outils.ts.
                {
                  ...(await executerOutil(call.name, args, qui ? { userId: qui, groupes: await groupesDe(qui) } : undefined)),
                  capture: undefined,
                };

        emitHelix(res, {
          type: "tool_end",
          name: call.name,
          ok: outcome.ok,
          preview: outcome.content.slice(0, 400),
        });

        /*
         * Toute action d'outil est scellée dans le journal, lectures comprises.
         * On aurait pu n'y consigner que les écritures, moins nombreuses ; mais
         * savoir quels fichiers un agent a **lus** est précisément ce qu'un
         * audit cherche après coup. Le volume n'est pas un souci : un agent
         * enchaîne quelques appels par minute, pas quelques milliers.
         *
         * Les actions d'écran ont déjà leur propre trace, plus détaillée
         * (demande, approbation, exécution) : on ne les compte pas deux fois.
         */
        /*
         * Ce qui change l'état de la machine, par opposition à ce qui l'observe.
         *
         * L'expression régulière qui tenait ce rôle cherchait « write », « edit »
         * ou « move » dans le nom de l'outil. Elle tombait juste sur les outils
         * d'aujourd'hui, mais elle décidait par ressemblance de nom : un outil
         * ajouté demain sans l'un de ces mots aurait été compté comme une simple
         * lecture, ici comme à la barrière d'approbation. C'est désormais la même
         * classification qui sert aux deux, et elle part des noms réels.
         */
        const modifiant = call.name.startsWith("ecran__") || approbation.modifie(call.name);
        if (outcome.ok && call.name === "ecran__enregistrer_document") documentEnregistre = true;
        if (outcome.ok && modifiant) {
          modifications++;
          modificationsDemande++;
          const touche = cibleDe(args);
          if (typeof touche === "string") fichiersTouches.add(touche);
          if (typeof args.destination === "string") fichiersTouches.add(args.destination);
        }
        else if (outcome.ok) {
          lectures++;
          if (releves.length < 16) {
            const cible = cibleDe(args);
            releves.push({ cible: typeof cible === "string" ? cible : Array.isArray(cible) ? cible.join(", ") : "", extrait: outcome.content.slice(0, 600) });
          }
        }
        else if (modifiant) echecs++;
        if (!verdict.autorise && verdict.parLaPersonne) refus++;
        if (!outcome.ok) derniereErreur = `${call.name.replace(/^[a-z]+__/, "")} : ${outcome.content.slice(0, 240)}`;

        if (!call.name.startsWith("ecran__")) {
          journaliser("outil.appele", qui ?? "agent", {
            outil: call.name,
            // Le chemin dit ce qui a été touché ; le contenu n'a rien à faire
            // dans un journal que l'on conserve.
            cible: cibleDe(args),
            ok: outcome.ok,
          });
        }

        fil.push({
          role: "tool",
          tool_call_id: call.identifiant,
          // Un résultat coupé le dit : sinon le modèle croit avoir tout lu, et répond sur la moitié.
          content:
            outcome.content.length > 20000
              ? `${outcome.content.slice(0, 20000)}\n\n[Résultat coupé : ${outcome.content.length} caractères, seuls les 20 000 premiers sont ici.]`
              : outcome.content,
        });

        /*
         * Une capture ne peut pas voyager dans un message `tool` : le format
         * OpenAI n'y accepte que du texte. On la joint comme un message
         * utilisateur, seul moyen de la faire parvenir au modèle.
         */
        if (outcome.capture) {
          const { base64, largeur, hauteur } = outcome.capture;
          emitHelix(res, { type: "capture", largeur, hauteur });
          fil.push({
            role: "user",
            content: [
              {
                type: "text",
                text: computer.grilleMille(model.id)
                  ? `Voici l'écran (${largeur}x${hauteur}). Donne les coordonnées des actions suivantes ` +
                    "sur ta grille de 0 à 1000 (0,0 en haut à gauche, 1000,1000 en bas à droite)."
                  : `Voici l'écran (${largeur}x${hauteur}). Donne les coordonnées ` +
                    "des actions suivantes dans ce repère.",
              },
              { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
            ],
          });
        }
      }

      // Avant la limite, on demande de conclure plutôt que de couper net.
      if (iteration === budget - ETAPES_AVANT_CONCLUSION && budget > ETAPES_AVANT_CONCLUSION) {
        fil.push({
          role: "user",
          content:
            "Tu approches de la limite d'étapes. Termine ce que tu peux " +
            "maintenant, puis réponds sans appeler d'autre outil : dis ce que tu " +
            "as effectivement fait, et ce qu'il reste à faire.",
        });
      }
    }

    return { texte, interrompu: "budget", modifications, echecs, lectures, derniereErreur, releves, refus };
  };

  try {
    /*
     * Découpage. Le modèle juge la demande (voir plus bas) : une question
     * simple part en direct, un travail composé est découpé en étapes.
     */
    const derniere = [...body.messages].reverse().find(
      (m) => (m as { role?: string }).role === "user",
    ) as { content?: unknown } | undefined;
    const demande =
      typeof derniere?.content === "string"
        ? derniere.content
        : Array.isArray(derniere?.content)
          ? (derniere.content as { type?: string; text?: string }[])
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join(" ")
          : "";

    /*
     * Le découpage s'ajuste au modèle. Un 8B a besoin qu'on lui tienne le fil ;
     * un modèle de 70 milliards, ou un service distant, s'en passe et fait
     * mieux sans. Voir `strategie` dans plan.ts.
     */
    const regime = strategie({
      params: model.params,
      sizeBytes: model.sizeBytes,
      backendKind: model.backendKind,
    });
    /*
     * Une demande qui porte une image n'est jamais découpée. Les étapes
     * repartent d'un contexte réduit au texte : l'image serait perdue dès la
     * deuxième, et le modèle répondrait sur ce qu'il croit se rappeler d'une
     * capture qu'il ne voit plus. Ces demandes sont de toute façon rarement du
     * travail répétitif sur fichiers, qui est ce que le découpage sert.
     */
    const avecImage =
      Array.isArray(derniere?.content) &&
      (derniere.content as { type?: string }[]).some((p) => p.type === "image_url");

    const avecOutils = Boolean(tools && tools.length > 0);
    /*
     * Actions accordées à une étape ; `HELIX_BUDGET_ETAPE` le fixe (réglage
     * d'administration, et essais). Quatre au moins : agir, regarder le
     * résultat et conclure en demandent déjà trois. Mesuré à deux : le travail
     * était fait, mais le contrôle n'avait pas le temps de le constater.
     */
    const budgetEtape = Math.max(4, Math.trunc(Number(process.env.HELIX_BUDGET_ETAPE)) || regime.budgetParEtape);
    /**
     * Le message système de la conversation, repris par chaque étape. Pris dans
     * `messages`, et non plus dans `body.messages` : c'est là que les passages
     * des bases de connaissances ont été ajoutés. Vu le 25/09/2026 : une
     * question en deux parties, découpée en deux étapes, répondait « consultez
     * les RH » alors que la base contenait la réponse, que chaque étape ne
     * recevait pas.
     */
    const fondation = (): unknown[] =>
      messages[0] && (messages[0] as { role?: string }).role === "system" ? [messages[0]] : [];

    /**
     * Une question d'organisation au modèle, sans outils, qui attend du JSON.
     * Sans raisonnement pour qwen3 (`/no_think`) : trier une demande n'a pas
     * besoin d'une minute de réflexion, et ce tri précède chaque demande.
     */
    const demanderAuModele = async (consigne: string): Promise<string> => {
      // `/no_think` est posé par basePayload pour l'effort « aucun ».
      const fil = [
        { role: "system", content: "Tu organises un travail. Tu réponds uniquement en JSON." },
        { role: "user", content: consigne },
      ];
      const brut = await callUpstream(backend, {
        /*
         * Effort « aucun », quel que soit celui de la conversation : ce tri
         * précède **chaque** demande. Lui laisser hériter du niveau choisi,
         * c'était payer seize mille jetons de réflexion pour décider s'il faut
         * découper un travail — et contredire le `/no_think` juste au-dessus.
         */
        ...basePayload({ ...body, effort: "aucun" }, model, fil),
        // Pas d'outils ici : organiser, ce n'est pas encore agir.
        tools: undefined,
        tool_choice: undefined,
        stream: false,
      }, arret.signal);
      if (!brut.ok) {
        await brut.body?.cancel().catch(() => {});
        return "";
      }
      const rep = (await brut.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
      // Organiser coûte une requête au moteur comme une autre : elle compte.
      usage.releverReponse(qui, model, { messages: fil }, rep);
      return rep.choices?.[0]?.message?.content ?? "";
    };

    /*
     * Le modèle juge lui-même s'il faut découper, sur chaque demande : aucune
     * liste de mots ne sait que « fais le bilan du mois » cache dix actions.
     * Ce tri coûte un aller-retour court (1 à 3 secondes mesurées sur
     * qwen3-8b) ; il n'est proposé qu'aux modèles qui en ont besoin (voir
     * `strategie`).
     */
    let plan: Plan = { objectif: demande, etapes: [] };
    /*
     * Ni plan ni étapes quand l'agent pilote un écran. Chaque étape repart
     * d'un contexte réduit au texte : l'écran vu à l'étape d'avant est perdu.
     * Mesuré le 24/09/2026 dans la machine de l'agent (qwen3-vl-4b, « ouvre
     * Writer, écris…, enregistre ») : chaque étape rouvrait Writer et
     * retapait le texte, 42 actions, jamais d'enregistrement.
     */
    const pilotageEcran = outilsEcran.length > 0;
    if (regime.decoupe && !avecImage && !pilotageEcran && demande.trim() && !estReplique(demande) && !(!avecOutils && estQuestionSimple(demande))) {
      emitHelix(res, { type: "plan_debut", regime: regime.raison });
      plan = lirePlan(
        await demanderAuModele(
          consigneDePlan(demande, {
            contexte: contexteDe(body.messages),
            espace: avecOutils ? workspace() : undefined,
            avecOutils,
          }),
        ),
        demande,
      );
      // Un fichier s'écrit d'un seul jet : un plan qui le crée vide puis le reprend est regroupé (plan.ts).
      if (avecOutils) plan.etapes = regrouperParFichier(plan.etapes);
      // Un plan d'une seule étape n'apporte rien : on repart en direct.
      if (plan.etapes.length < 2) plan.etapes = [];
      /*
       * Sans outils, un plan n'est qu'une rédaction en plusieurs parties. Un
       * plan fait d'actions (« Créer le fichier… », « Ajouter… ») serait donc
       * RACONTÉ au lieu d'être fait, puis affiché « 3 étapes faites sur 3 »
       * sans qu'aucun fichier n'existe (vu le 23/09/2026 : Outils désactivés
       * dans le Chat, « crée un fichier courses.txt »). On répond en direct :
       * la consigne ci-dessus lui fait dire qu'il ne peut pas agir, et où
       * activer les outils.
       */
      if (!avecOutils && plan.etapes.some((e) => etapeExigeAction(e))) plan.etapes = [];
      emitHelix(res, { type: "plan", etapes: plan.etapes });
    }

    if (plan.etapes.length === 0) {
      // Chemin ordinaire : un seul fil, budget complet.
      let r = await boucleOutils(messages, Math.min(regime.budgetDirect, MAX_ITERATIONS));
      /*
       * Écran piloté, et le modèle s'arrête en écrivant l'action au lieu de la
       * faire (« Saisis « Bonjour » au clavier. », « Je vais cliquer… »). Vu le
       * 24/09/2026 dans Cowork avec qwen3-vl-4b : le tour finissait là, rien
       * n'était tapé. On le relance, deux fois au plus, sans rien afficher de
       * plus que ce qu'il fera.
       */
      // Document déjà enregistré : le travail est fait, même si la dernière phrase décrit encore.
      // Ni après un refus de la personne : il doit alors s'arrêter et expliquer, pas recommencer.
      for (let relance = 0; relance < 2 && pilotageEcran && !documentEnregistre && !computer.demandeRefusee(portee) && !r.interrompu && decritAuLieuDeFaire(r.texte); relance++) {
        messages.push({ role: "assistant", content: r.texte });
        messages.push({
          role: "user",
          content:
            "Tu as décrit l'action au lieu de la faire. Fais-la toi-même, maintenant, avec les outils « ecran__… » " +
            "(capture, saisir, cliquer, enregistrer_document…), jusqu'au bout de la demande. N'écris pas d'instructions.",
        });
        emitContent(res, "\n\n");
        r = await boucleOutils(messages, Math.min(regime.budgetDirect, MAX_ITERATIONS));
      }
    } else if (!avecOutils) {
      /*
       * Rédaction longue : une partie à la fois, chacune écrite avec le plan
       * entier sous les yeux et la fin de la précédente pour enchaîner. Les
       * parties s'affichent au fil de l'eau ; ensemble, elles sont la réponse.
       */
      let ecrit = "";
      for (let i = 0; i < plan.etapes.length; i++) {
        const chemin = String(i + 1);
        emitHelix(res, { type: "etape", index: i, chemin, total: plan.etapes.length, titre: plan.etapes[i] });
        if (i > 0) ecrire("\n\n");
        const fil = [...fondation(), { role: "user", content: consigneDePartie(plan.objectif, plan.etapes, i, ecrit) }];
        let r = await boucleOutils(fil, 1);
        if (!r.interrompu && !r.texte.trim()) {
          emitHelix(res, { type: "etape_reprise", index: i, chemin });
          r = await boucleOutils(fil, 1);
        }
        const ok = !r.interrompu && Boolean(r.texte.trim());
        if (ok) ecrit += `\n\n${r.texte}`;
        emitHelix(res, { type: "etape_fin", index: i, chemin, ok, resume: r.texte.slice(0, 300) });
        if (!ok) {
          ecrire(
            // Écrit dans la réponse elle-même : dans la langue de la personne, comme le reste de l'écran.
            `\n\n*${tf(
              "La rédaction s'est arrêtée à la partie {0} (« {1} ») : {2}. Les parties suivantes n'ont pas été rédigées.",
              i + 1,
              plan.etapes[i],
              r.interrompu === "moteur" ? t("le moteur d'inférence n'a pas répondu") : t("le modèle n'a rien écrit, même après relance"),
            )}*`,
          );
          break;
        }
      }
    } else {
      /*
       * Chemin découpé : une étape à la fois, chacune repartant d'un contexte
       * court. Une étape trop grosse (actions épuisées, ou l'agent qui décrit
       * au lieu de faire) n'arrête plus le travail : le modèle la redécoupe en
       * parties plus petites, jusqu'à trois niveaux, et le travail continue.
       * C'est plus lent, mais un travail lourd aboutit sur une machine modeste.
       */
      type Cause = "moteur" | "budget" | "inaction" | "muette" | "outils" | "limite" | "impossible" | "refus";
      const faits: Avancement[] = [];
      /** Suivi à plat de toutes les étapes, redécoupages compris, pour le récapitulatif. */
      const suivi: { chemin: string; titre: string; etat: "attente" | "fait" | "echec" | "decoupee" }[] = plan.etapes.map(
        (titre, i) => ({ chemin: String(i + 1), titre, etat: "attente" }),
      );
      const marquer = (chemin: string, etat: (typeof suivi)[number]["etat"]) => {
        const e = suivi.find((x) => x.chemin === chemin);
        if (e) e.etat = etat;
      };
      let executees = 0;
      let arret: { chemin: string; cause: Cause; erreur: string } | null = null;

      /** Une étape, avec ses reprises : action oubliée ou ratée, compte rendu manquant. */
      const executerEtape = async (
        titre: string,
        repere: string,
        /** Ce que les étapes suivantes feront : le contrôle ne doit pas le compter comme manquant. */
        suivantes: string[] = [],
      ): Promise<{ texte: string; cause: Cause | false; erreur: string; releves: { cible: string; extrait: string }[] }> => {
        const fil: unknown[] = [...fondation(), { role: "user", content: consigneDEtape(plan.objectif, titre, repere, faits) }];
        const r = await boucleOutils(fil, budgetEtape);
        let texte = r.texte;
        let erreur = r.derniereErreur;
        const releves = [...r.releves];
        let cause: Cause | false = r.interrompu;

        /*
         * Ce que dit le modèle ne suffit pas : on regarde ce que les outils ont
         * rendu. Mesuré sur qwen3-8b : huit déplacements de factures, huit
         * refus du serveur de fichiers, et un compte rendu « les factures ont
         * été déplacées ». Une étape d'action sans modification réussie, une
         * étape dont des modifications ont échoué, ou une étape où rien n'a
         * marché, est reprise, avec l'erreur sous les yeux.
         */
        const riennaMarche = r.derniereErreur !== "" && r.lectures === 0 && r.modifications === 0;
        /*
         * La personne a refusé l'action (ou n'a pas répondu) : on ne la
         * retente pas. Sans cette porte, reprise, contrôle et redécoupage la
         * redemandaient en boucle (vu au banc : 25 minutes sur un seul compte
         * rendu Word refusé).
         */
        if (!cause && (r.refus ?? 0) > 0 && r.modifications === 0) {
          return { texte, cause: "refus" as const, erreur: r.derniereErreur, releves };
        }
        if (!cause && (r.echecs > 0 || riennaMarche || (r.modifications === 0 && etapeExigeAction(titre)))) {
          emitHelix(res, { type: "etape_reprise", chemin: repere });
          fil.push({ role: "assistant", content: texte || "" });
          fil.push({ role: "user", content: consigneDeRattrapage(titre, r.derniereErreur || undefined) });
          const reprise = await boucleOutils(fil, budgetEtape);
          if (reprise.texte) texte = reprise.texte;
          if (reprise.derniereErreur) erreur = reprise.derniereErreur;
          releves.push(...reprise.releves);
          if (reprise.interrompu) {
            cause = reprise.interrompu;
          } else if (reprise.echecs === 0 && reprise.modifications > 0) {
            cause = false;
          } else if (reprise.echecs === 0 && declareRienAFaire(reprise.texte) && (reprise.lectures > 0 || r.modifications > 0)) {
            /*
             * Déjà fait, et crédible : il a regardé l'état réel avant de le
             * dire, ou l'étape avait réellement modifié quelque chose (les
             * échecs étaient des tentatives en double). Mesuré sur qwen3-8b :
             * vingt-quatre renommages réussis, puis des essais redondants
             * refusés ; sans cette porte, un travail juste finissait en échec.
             */
            cause = false;
          } else if (reprise.echecs === 0 && reprise.lectures > 0 && reprise.derniereErreur === "" && !etapeExigeAction(titre) && r.echecs === 0) {
            // Une étape de lecture dont la seconde tentative a lu sans erreur.
            cause = false;
          } else if (etapeDeLecture(titre) && reprise.echecs === 0 && reprise.modifications === 0 && cibleAbsente(erreur)) {
            /*
             * Lire ce qui n'existe pas encore : c'est une information, pas une
             * panne (un dossier à créer, par exemple). Elle est transmise telle
             * quelle aux étapes suivantes, qui ne peuvent donc pas l'inventer.
             */
            cause = false;
            texte = `${texte ? `${texte}\n` : ""}Constat : la cible n'existe pas (encore). ${erreur}`;
          } else {
            cause = reprise.echecs > 0 || r.echecs > 0 || riennaMarche ? "outils" : "inaction";
          }
        }

        /*
         * Contrôle d'une étape qui a modifié (ou devait modifier) quelque
         * chose : le modèle regarde l'état réel et finit ce qui manque. C'est
         * ce constat qui tranche, pas les tentatives intermédiaires : mesuré
         * sur qwen3-8b, vingt-quatre renommages réussis entrecoupés d'un appel
         * mal formé, et l'étape était déclarée en échec alors que tout était
         * fait. Son nouveau compte rendu remplace l'ancien, qui annonçait
         * parfois plus que ce qui était fait.
         */
        const aControler = r.modifications > 0 || r.echecs > 0 || etapeExigeAction(titre);
        if (aControler && (!cause || cause === "outils" || cause === "inaction")) {
          emitHelix(res, { type: "etape_verification", chemin: repere });
          fil.push({ role: "assistant", content: texte || "" });
          fil.push({ role: "user", content: consigneDeVerification(titre, suivantes) });
          const v = await boucleOutils(fil, budgetEtape);
          releves.push(...v.releves);
          if (v.derniereErreur) erreur = v.derniereErreur;
          const conclusion = conclusionDuControle(v.texte);
          if (v.interrompu === "moteur") cause = "moteur";
          // Actions encore épuisées pendant le contrôle : il reste du travail, la suite le redécoupera.
          else if (v.interrompu === "budget") cause = "budget";
          // Il a regardé l'état réel et conclu que tout est fait : son constat fait foi.
          else if (conclusion === "fait" && v.lectures > 0) cause = false;
          // Il reste du travail : on le redécoupe (voir plus bas), plutôt que d'échouer.
          // Ce qu'il dit manquer n'est que la suite du plan (voir plan.ts) : l'étape, elle, est faite.
          else if (conclusion === "incomplet" && v.lectures > 0 && v.echecs === 0 && manqueCouvertParLaSuite(v.texte, titre, suivantes)) cause = false;
          else if (conclusion === "incomplet") cause = "inaction";
          else if (v.lectures > 0 && v.echecs === 0) cause = false;
          else if (v.echecs > 0 && v.modifications === 0) cause = "outils";
          // Sinon (il n'a pas regardé), le verdict d'avant tient.
          if (v.texte.trim()) texte = v.texte;
        }

        /*
         * Étape muette : on redemande le compte rendu. Ce texte est la seule
         * chose que verront les étapes suivantes ; s'il manque, elles
         * inventent.
         */
        if (!cause && !texte.trim()) {
          emitHelix(res, { type: "etape_reprise", chemin: repere });
          fil.push({ role: "user", content: consigneDeCompteRendu(titre) });
          const dit = await boucleOutils(fil, 3);
          if (dit.texte.trim()) texte = dit.texte;
          else cause = "muette";
        }

        /*
         * Aucune action, et le modèle écrit lui-même qu'il ne peut pas. Ce
         * n'est pas une étape faite : le récapitulatif la comptait « fait »
         * (vu au banc : « Envoyer un message Slack : fait », sans Slack
         * connecté, avec « je ne peux pas envoyer de message » dans la
         * réponse). On arrête le travail en le disant, plutôt que de laisser
         * les étapes suivantes bâtir sur une action qui n'a pas eu lieu.
         */
        if (!cause && r.lectures === 0 && r.modifications === 0 && ditImpossible(texte)) cause = "impossible";
        return { texte, cause, erreur, releves };
      };

      /** Contrôle d'une étape redécoupée, une fois toutes ses parties faites. */
      const controlerEnsemble = async (
        titre: string,
        repere: string,
        suivantes: string[] = [],
      ): Promise<{ texte: string; cause: Cause | false; erreur: string; releves: { cible: string; extrait: string }[] }> => {
        emitHelix(res, { type: "etape_verification", chemin: repere });
        const fil: unknown[] = [
          ...fondation(),
          { role: "user", content: consigneDEtape(plan.objectif, titre, repere, faits) },
          { role: "assistant", content: "J'ai fait cette étape, partie par partie." },
          { role: "user", content: consigneDeVerification(titre, suivantes) },
        ];
        const v = await boucleOutils(fil, budgetEtape);
        const conclusion = conclusionDuControle(v.texte);
        let cause: Cause | false = false;
        if (v.interrompu === "moteur") cause = "moteur";
        else if (v.interrompu === "budget") cause = "inaction";
        else if (conclusion === "incomplet" && !(v.lectures > 0 && v.echecs === 0 && manqueCouvertParLaSuite(v.texte, titre, suivantes))) cause = "inaction";
        else if (conclusion !== "fait" && v.echecs > 0 && v.modifications === 0) cause = "outils";
        return { texte: v.texte, cause, erreur: v.derniereErreur, releves: v.releves };
      };

      /** Une liste d'étapes (le plan, ou le redécoupage d'une étape). Faux si le travail s'arrête. */
      const executerListe = async (
        liste: string[],
        prefixe: string,
        profondeur: number,
        /** Étapes des niveaux au-dessus qui restent à faire après cette liste. */
        aVenir: string[] = [],
      ): Promise<boolean> => {
        for (let i = 0; i < liste.length; i++) {
          const titre = liste[i]!;
          const chemin = prefixe ? `${prefixe}.${i + 1}` : String(i + 1);
          const index = profondeur === 0 ? i : undefined;
          if (executees >= ETAPES_TOTALES_MAX) {
            arret = { chemin, cause: "limite", erreur: "" };
            return false;
          }
          executees += 1;
          emitHelix(res, { type: "etape", index, chemin, total: liste.length, titre });
          if (faits.length > 0) ecrire("\n\n");
          const r = await executerEtape(titre, chemin, [...liste.slice(i + 1), ...aVenir]);

          if (!r.cause) {
            faits.push({ titre, resultat: r.texte || "fait", ok: true, releves: r.releves });
            marquer(chemin, "fait");
            emitHelix(res, { type: "etape_fin", index, chemin, ok: true, resume: r.texte.slice(0, 300) });
            continue;
          }

          /*
           * Trop grosse pour un coup : le modèle la redécoupe, en tenant compte
           * de ce qu'elle a déjà fait. Une panne du moteur, un outil qui refuse
           * ou un compte rendu introuvable ne se règlent pas en découpant :
           * ceux-là arrêtent.
           */
          if ((r.cause === "budget" || r.cause === "inaction") && profondeur + 1 < PROFONDEUR_MAX) {
            // L'état constaté en dernier (un dossier listé, un fichier relu) : le sous-plan part du réel, pas du récit.
            const constat = r.releves
              .slice(-3)
              .map((x) => `${x.cible || "outil"} : ${x.extrait.replace(/\s+/g, " ").slice(0, 600)}`)
              .join("\n");
            const suivantesIci = [...liste.slice(i + 1), ...aVenir];
            const sous = sansDoublons(
              regrouperParFichier(
                lirePlan(
                  await demanderAuModele(consigneDeSousPlan(plan.objectif, titre, r.texte, rappelDes(faits, 4000), constat, suivantesIci)),
                  titre,
                  SOUS_ETAPES_MAX,
                ).etapes,
              ),
              suivantesIci,
            );
            if (sous.length >= 2) {
              if (r.texte.trim() || r.releves.length > 0) faits.push({ titre: `${titre} (commencée)`, resultat: r.texte || "commencée", ok: true, releves: r.releves });
              marquer(chemin, "decoupee");
              const place = suivi.findIndex((x) => x.chemin === chemin);
              suivi.splice(place + 1, 0, ...sous.map((t, k) => ({ chemin: `${chemin}.${k + 1}`, titre: t, etat: "attente" as const })));
              emitHelix(res, { type: "plan_sous", chemin, etapes: sous });
              let fini = await executerListe(sous, chemin, profondeur + 1, [...liste.slice(i + 1), ...aVenir]);
              /*
               * Toutes les parties ont réussi : l'étape d'origine est-elle
               * faite pour autant ? Un sous-plan peut oublier un élément.
               * Mesuré : « renommer les notes 03 à 08 » découpé en 03, 04, 05,
               * 06 et 07. On contrôle l'ensemble, et le modèle finit ce qui manque.
               */
              if (fini) {
                const c = await controlerEnsemble(titre, chemin, [...liste.slice(i + 1), ...aVenir]);
                if (c.cause) {
                  fini = false;
                  arret = { chemin, cause: c.cause, erreur: c.erreur };
                }
                faits.push({ titre: `${titre} (contrôle)`, resultat: c.texte || "contrôlée", ok: !c.cause, releves: c.releves });
              }
              marquer(chemin, fini ? "fait" : "echec");
              emitHelix(res, { type: "etape_fin", index, chemin, ok: fini });
              if (!fini) return false;
              continue;
            }
          }

          /*
           * Une étape ratée, et impossible à redécouper, arrête le plan. Les
           * suivantes s'appuient sur ce qu'elle devait produire : les lancer
           * quand même, c'est demander au modèle de travailler sur une
           * information qu'il n'a pas, et il l'invente. Observé tel quel :
           * l'étape « lire le nom du client » ayant échoué, la suivante a créé
           * un dossier « CLIENT1 » et y a déplacé une vraie facture.
           */
          faits.push({ titre, resultat: r.texte || "étape non terminée", ok: false, releves: r.releves });
          marquer(chemin, "echec");
          emitHelix(res, { type: "etape_fin", index, chemin, ok: false, cause: r.cause, resume: r.texte.slice(0, 300) });
          arret = { chemin, cause: r.cause, erreur: r.erreur };
          return false;
        }
        return true;
      };

      let fini = await executerListe(plan.etapes, "", 0);

      /*
       * Revue finale : la demande entière, relue contre l'état réel. Des
       * étapes toutes faites ne font pas une demande faite (un plan peut
       * oublier un fichier). Ce qui manque devient des étapes de complément,
       * exécutées comme les autres ; deux tours au plus.
       */
      /** Langue de la demande : le contrôle signale les textes d'interface écrits dans une autre. */
      const langueDemande = /[àâçéèêëîïôûùüœ]|\b(le|la|les|des|une|pour|avec|dans|chaque)\b/i.test(plan.objectif) ? ("fr" as const) : undefined;
      let revue: "fait" | "incomplet" | "non" = "non";
      /** La revue a vu des manques, mais le modèle n'a su en tirer aucune étape. */
      let revueSansSuite = false;
      /*
       * Une demande qui ne devait rien changer (chercher, lire, résumer) et
       * n'a rien changé n'a pas de revue : il n'y a pas d'état réel à relire,
       * et la revue prenait « rien trouvé » pour un travail inachevé, dont les
       * compléments inventaient la suite (voir consigneDeComplement).
       */
      const aRevoir = modificationsDemande > 0 || etapeExigeAction(plan.objectif);
      for (let tour = 1; fini && aRevoir && tour <= 2; tour++) {
        emitHelix(res, { type: "revue", etat: "encours", tour });
        // Ce qu'un programme sait vérifier dans le code web modifié : liens, fonctions, éléments, syntaxe.
        const auto = controleWeb.controlerTouches([...fichiersTouches], { langue: langueDemande });
        /*
         * Le contenu des fichiers modifiés, relu par l'instance et mis sous ses
         * yeux. Mesuré sur qwen3-8b : sans lui, la revue concluait « tout est
         * fait » sans avoir relu un seul fichier.
         */
        const contenus = contenuDesFichiers([...fichiersTouches]);
        const fil: unknown[] = [
          ...fondation(),
          { role: "user", content: consigneDEtape(plan.objectif, "Revue finale de la demande entière", "finale", faits) },
          { role: "assistant", content: "Toutes les étapes du plan sont faites." },
          { role: "user", content: consigneDeRevue(plan.objectif, auto.problemes, contenus) },
        ];
        const v = await boucleOutils(fil, budgetEtape);
        const conclusion = conclusionDuControle(v.texte);
        // Sur ce que le programme sait vérifier, c'est lui qui a le dernier mot, pas le modèle.
        const apres = controleWeb.controlerTouches([...fichiersTouches], { langue: langueDemande });
        faits.push({ titre: "Revue finale", resultat: v.texte || "revue", ok: conclusion === "fait", releves: v.releves });
        if (v.interrompu === "moteur") {
          arret = { chemin: "revue", cause: "moteur", erreur: v.derniereErreur };
          fini = false;
          break;
        }
        if (conclusion === "fait" && (v.lectures > 0 || contenus !== "") && apres.problemes.length === 0) {
          revue = "fait";
          emitHelix(res, { type: "revue", etat: "fait", tour });
          break;
        }
        revue = "incomplet";
        emitHelix(res, { type: "revue", etat: "incomplet", tour });
        if (tour === 2) break;
        const constat =
          v.texte +
          (apres.problemes.length > 0 ? `\n\nContrôle automatique du code, problèmes restants :\n${apres.problemes.map((p) => `- ${p}`).join("\n")}` : "");
        const complement = regrouperParFichier(
          lirePlan(
            await demanderAuModele(consigneDeComplement(plan.objectif, constat, rappelDes(faits, 4000))),
            plan.objectif,
            SOUS_ETAPES_MAX,
          ).etapes,
        );
        if (complement.length === 0) {
          revueSansSuite = true;
          break;
        }
        const prefixe = `C${tour}`;
        const titreComplement = t("Compléments demandés par la revue finale");
        suivi.push({ chemin: prefixe, titre: titreComplement, etat: "decoupee" });
        suivi.push(...complement.map((t, k) => ({ chemin: `${prefixe}.${k + 1}`, titre: t, etat: "attente" as const })));
        emitHelix(res, { type: "plan_ajout", chemin: prefixe, titre: titreComplement, etapes: complement });
        fini = await executerListe(complement, prefixe, 1);
        marquer(prefixe, fini ? "fait" : "echec");
        emitHelix(res, { type: "etape_fin", chemin: prefixe, ok: fini });
      }
      // Ce qui reste, dit tel quel : le récapitulatif ne cache pas un problème que le programme voit encore.
      const restants = controleWeb.controlerTouches([...fichiersTouches], { langue: langueDemande }).problemes;

      // Bilan final, rédigé à partir de ce que l'instance a constaté (les
      // retours des outils), pas de ce que le modèle affirme.
      // Le récapitulatif s'affiche tel quel dans la réponse : traduit, comme tout ce que la passerelle écrit.
      const libelle = { attente: t("non lancée"), fait: t("fait"), echec: `**${t("échec")}**`, decoupee: t("découpée") };
      const bilan = suivi.map((e) => `- **${e.chemin}** ${e.titre} : ${libelle[e.etat]}`).join("\n");
      const fin = arret as { chemin: string; cause: Cause; erreur: string } | null;
      const pourquoi = !fin
        ? ""
        : fin.cause === "moteur"
          ? t("le moteur d'inférence n'a pas répondu")
          : fin.cause === "outils"
            ? fin.erreur
              ? tf("des actions de l'agent ont échoué, même après relance (dernier refus : {0})", fin.erreur)
              : t("des actions de l'agent ont échoué, même après relance")
            : fin.cause === "inaction"
              ? t("l'étape est restée incomplète, ou l'agent a décrit ce qu'il fallait faire sans le faire, même après relance et redécoupage")
              : fin.cause === "muette"
                ? t("l'agent n'a rendu aucun compte rendu, même après relance : les étapes suivantes n'auraient rien eu à quoi se raccrocher")
                : fin.cause === "refus"
                  ? t("vous avez refusé l'action demandée (ou n'avez pas répondu à temps) : elle n'a pas été faite, et n'a pas été retentée")
                  : fin.cause === "impossible"
                  ? t("l'agent a indiqué ne pas pouvoir faire cette étape avec les outils dont il dispose (service non connecté, outil absent)")
                  : fin.cause === "limite"
                  ? tf("le travail a atteint {0} étapes, la limite d'une demande : relancez pour la suite", ETAPES_TOTALES_MAX)
                  : t("l'étape n'a pas abouti dans le nombre d'actions accordé, même redécoupée");
      const suite = fin
        ? `\n\n${tf("Le travail s'est arrêté à l'étape {0} : {1}. Les étapes marquées « non lancée » en dépendaient.", fin.chemin, pourquoi)} ` +
          t("Ce qu'a écrit l'agent plus haut peut dire le contraire : ce récapitulatif, lui, part de ce que les outils ont réellement fait.")
        : "";
      const ligneControle =
        restants.length > 0
          ? `\n\n**${tf("Contrôle automatique du code : {0} problème(s) restant(s)", restants.length)}**\n${restants.map((p) => `- ${p}`).join("\n")}`
          : fichiersTouches.size > 0 && [...fichiersTouches].some((f) => /\.(html?|css|m?js)$/i.test(f))
            ? `\n\n${t("Contrôle automatique du code web : liens, fonctions, éléments et syntaxe cohérents.")}`
            : "";
      const ligneRevue =
        revue === "fait"
          ? `\n\n${t("Revue finale : la demande entière a été relue contre les fichiers, rien ne manque.")}`
          : revue === "incomplet"
            ? revueSansSuite
              ? `\n\n**${t("Revue finale non concluante")}** : ${t("l'agent n'a ni confirmé que tout était fait, ni su dire précisément ce qui manquait. Son dernier constat est plus haut ; vérifiez le résultat.")}`
              : `\n\n**${t("Revue finale : il reste des manques")}**, ${t("que les compléments n'ont pas tous comblés. Le dernier constat de l'agent est plus haut ; relancez la demande pour les reprendre.")}`
            : "";
      ecrire(`\n\n**${t("Récapitulatif")}**\n${bilan}${suite}${ligneRevue}${ligneControle}`);
    }
  } catch (err) {
    // Arrêtée par la personne : rien à lui dire, elle ne lit plus ce flux.
    if (!arret.signal.aborted) {
      emitHelix(res, {
        type: "error",
        // Coupure du moteur en pleine réponse : « terminated » ne disait rien à personne.
        message:
          err instanceof TypeError && /terminated|fetch failed|socket|ECONNRESET/i.test(err.message)
            ? tf("La connexion à {0} s'est coupée pendant la réponse. Réessayez ; si cela recommence, vérifiez que le moteur tourne toujours.", backend.label)
            : err instanceof Error
              ? err.message
              : String(err),
      });
    } else {
      console.log("[chat] demande arrêtée par la personne : moteur et outils interrompus.");
    }
  } finally {
    approbation.fermerDemande(portee);
    computer.oublierDemandeEcran(portee);
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

/*
 * Schémas d'outils et moteurs locaux.
 *
 * LM Studio (llama.cpp) convertit le schéma de chaque outil en une grammaire
 * qui contraint la génération. Une borne comme `maxLength: 65536` y devient
 * une règle répétée soixante-cinq mille fois, et le moteur refuse toute la
 * requête (« failed to parse grammar »). Mesuré avec OpenClaw 2026.9.4 : son
 * outil `automations` porte cette borne, et aucun de ses agents ne pouvait
 * répondre à travers la passerelle. Les grandes bornes de longueur et de
 * nombre d'éléments sont des indications pour l'appelant, pas des garanties :
 * on les retire au-delà d'un seuil, le reste du schéma est transmis intact.
 */
const BORNE_MAX_GRAMMAIRE = 512;

function sansGrandesBornes(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sansGrandesBornes);
  if (!schema || typeof schema !== "object") return schema;
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(schema as Record<string, unknown>)) {
    if (
      (cle === "maxLength" || cle === "maxItems" || cle === "maxProperties") &&
      typeof valeur === "number" &&
      valeur > BORNE_MAX_GRAMMAIRE
    ) {
      continue;
    }
    sortie[cle] = sansGrandesBornes(valeur);
  }
  return sortie;
}

function adapterPourMoteurLocal(outil: unknown): unknown {
  if (!outil || typeof outil !== "object") return outil;
  const o = outil as { type?: unknown; function?: { parameters?: unknown } };
  if (!o.function || typeof o.function !== "object") return outil;
  return { ...o, function: { ...o.function, parameters: sansGrandesBornes(o.function.parameters) } };
}
