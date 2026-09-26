import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat, type ChatTurn } from "@/lib/gateway";
import { notifySessionsChanged } from "./useSessions";
import { contexteTexte, images, type Attachment } from "@/lib/attachments";
import { currentUser } from "@/lib/store/identity";
import { t, tf } from "@/lib/i18n";
import { creerImage as creerSurLaMachine, creerVideo as creerVideoSurLaMachine, type Format, type ImageCreee } from "@/lib/images";
import type { NiveauRaisonnement } from "@/lib/store/profile";
import type { Citation } from "@/lib/connaissances";
import {
  createSession,
  updateSession,
  deriveTitle,
  type Session,
  type SessionOrigin,
  type StoredMessage,
} from "@/lib/store/sessions";

/** Trace d'un outil utilisé par l'agent pendant sa réponse. */
export interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
  running: boolean;
  ok?: boolean;
  preview?: string;
  /**
   * Libellé et cible déjà mis en mots par qui connaît l'outil (l'écran Code,
   * `actionOutil`) : « Sous-tâche : explorer le dossier src » plutôt que
   * « task ». Absents, l'affichage les tire du nom et des arguments.
   */
  libelle?: string;
  cible?: string;
}

/** Une étape du plan suivi par l'agent, et où il en est. */
export interface EtapePlan {
  titre: string;
  /** « découpée » : trop grosse, elle a été redécoupée en parties (qui suivent dans la liste). */
  etat: "attente" | "encours" | "fait" | "echec" | "decoupee";
  /** L'étape a dû être redemandée : elle n'avait rien modifié. */
  reprise?: boolean;
  /** Son résultat a été contrôlé sur l'état réel, après coup. */
  controlee?: boolean;
  /** « 2 », ou « 2.1 » pour une partie de l'étape 2. */
  chemin?: string;
  /** 0 pour une étape du plan, 1 pour une partie, 2 pour une partie de partie. */
  profondeur?: number;
}

/** L'étape visée par un évènement : par son chemin, ou par son rang (passerelle plus ancienne). */
function etapeDe(plan: EtapePlan[], ev: { index?: number; chemin?: string }): EtapePlan | undefined {
  const chemin = ev.chemin ?? (ev.index !== undefined ? String(ev.index + 1) : undefined);
  return chemin ? plan.find((e) => (e.chemin ?? "") === chemin) ?? (ev.index !== undefined ? plan[ev.index] : undefined) : undefined;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Canal de raisonnement (modèles type Qwen3), affiché repliable. */
  reasoning?: string;
  /** Outils appelés pendant la génération de cette réponse. */
  tools?: ToolTrace[];
  /**
   * Plan suivi quand la demande a été découpée. Sans lui, une tâche longue
   * n'offre que du silence entre deux appels d'outils : l'utilisateur ne sait
   * ni où en est l'agent, ni combien il reste.
   */
  plan?: EtapePlan[];
  /** Revue finale de la demande entière, après les étapes. */
  revue?: "encours" | "fait" | "incomplet";
  /** Réponse en cours de génération. */
  streaming?: boolean;
  /** Ce qui se passe avant la réponse : « Chargement de qwen3-vl-4b en mémoire... ». */
  statut?: string;
  /** Pièces jointes à la question : on garde le nom, pas le contenu. */
  pieces?: { nom: string; type: "texte" | "image" }[];
  /** Image créée en réponse (bouton « Image » du composeur). */
  image?: ImageCreee;
  /**
   * Passages des bases de connaissances donnés au modèle pour cette réponse.
   * `ignorees` : bases choisies que la personne ne voit pas (l'instance les a
   * écartées) ; `erreur` : les bases n'ont pas pu être consultées.
   */
  sources?: { citations: Citation[]; ignorees?: number; aReindexer?: number; erreur?: string };
  error?: string;
}

const newId = () => Math.random().toString(36).slice(2);

/*
 * Réponses en cours, par Chat, hors de l'écran.
 *
 * Signalé par Medhi le 26/09/2026 : « si dans le Chat je pars de la
 * discussion, tout s'arrête au lieu de continuer ». La réponse vivait dans
 * l'écran : ouvrir un autre Chat ou en commencer un nouveau appelait
 * « Arrêter ». Elle vit maintenant ici, rattachée à son Chat : l'écran s'y
 * abonne quand il affiche ce Chat, s'en détache quand il en affiche un autre,
 * et la réponse continue, puis s'enregistre dans son Chat. Seul le bouton
 * « Arrêter » l'arrête. Une page rechargée ou l'application fermée, elle, la
 * coupe : ce qui était écrit n'est gardé qu'à la fin de la réponse.
 */
interface ReponseEnCours {
  history: Message[];
  controller: AbortController;
  abonnes: Set<(history: Message[]) => void>;
}
const reponsesEnCours = new Map<string, ReponseEnCours>();
export const CHATS_EN_COURS = "helix:chats-en-cours";

/** Un Chat a-t-il une réponse en train de s'écrire (pour la barre latérale) ? */
export const chatEnCours = (sessionId: string) => reponsesEnCours.has(sessionId);

function signalerEnCours() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHATS_EN_COURS));
}

/** Arrête la réponse en cours d'un Chat, par exemple quand il est supprimé. */
export function arreterReponse(sessionId: string) {
  reponsesEnCours.get(sessionId)?.controller.abort();
}

/**
 * Ce que la personne lit quand l'envoi échoue.
 *
 * Une panne réseau remonte du navigateur en anglais technique (« Failed to
 * fetch », « Load failed » sur Safari, « fetch failed » sous Node) : elle ne
 * dit ni quoi ni que faire. Les refus de la passerelle, eux, sont déjà écrits
 * pour la personne et dans sa langue : on les laisse tels quels.
 */
function messageDErreur(err: unknown): string {
  // Seulement l'échec du transport : une autre TypeError serait un défaut du code, à montrer tel quel.
  if (err instanceof TypeError && /fetch|network|load failed|terminated/i.test(err.message)) {
    return t("L'instance ne répond pas : la réponse n'a pas pu être obtenue. Vérifiez que l'application est ouverte, puis réessayez.");
  }
  return err instanceof Error ? err.message : String(err);
}

interface Options {
  model?: string;
  effort?: NiveauRaisonnement;
  /** Message système construit depuis le profil privé de l'utilisateur. */
  systemPrompt?: string | null;
  /** Origine du modèle : conditionne le partage de la session. */
  origin?: SessionOrigin;
  /** Autoriser l'agent à utiliser les outils MCP. */
  tools?: boolean;
  /** Bases de connaissances consultées à chaque question : celles de l'agent, du projet, et le choix de la zone de saisie. */
  connaissances?: string[];
}

/** État d'une conversation branchée sur la passerelle, persistée en session. */
export function useChat(options: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<Session | null>(null);
  /**
   * Miroir synchrone de `messages`. Les mises à jour d'état React ne sont pas
   * appliquées immédiatement : on ne peut donc pas construire l'historique
   * depuis l'intérieur d'un updater.
   */
  const historyRef = useRef<Message[]>([]);

  /** Enregistre l'historique d'un Chat : celui de l'écran, ou celui d'une réponse qui a continué sans lui. */
  const persisterDans = useCallback((session: Session, history: Message[]) => {
    const stored: StoredMessage[] = history
      .filter((m) => !m.error && m.content.trim().length > 0)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        reasoning: m.reasoning,
        ...(m.image ? { image: m.image } : {}),
        // Les citations restent avec la réponse : rouvert, le Chat dit encore d'où elle venait.
        ...(m.sources && m.sources.citations.length > 0 ? { sources: m.sources.citations } : {}),
        createdAt: new Date().toISOString(),
      }));
    updateSession(session.id, { messages: stored, modelUid: options.model });
    notifySessionsChanged();
  }, [options.model]);

  /** L'abonnement de l'écran à la réponse en cours du Chat affiché. */
  const detacherRef = useRef<(() => void) | null>(null);
  const detacher = useCallback(() => {
    detacherRef.current?.();
    detacherRef.current = null;
  }, []);
  const attacher = useCallback((sessionId: string) => {
    detacher();
    const r = reponsesEnCours.get(sessionId);
    if (!r) return false;
    const suivre = (history: Message[]) => {
      historyRef.current = history;
      setMessages(history);
    };
    r.abonnes.add(suivre);
    detacherRef.current = () => r.abonnes.delete(suivre);
    suivre(r.history);
    setBusy(true);
    return true;
  }, [detacher]);
  // L'écran qui disparaît se détache ; la réponse, elle, continue.
  useEffect(() => detacher, [detacher]);

  /**
   * Une réponse terminée pendant que l'écran montrait ce même Chat : il reprend
   * la main. Terminée ailleurs : rien à faire ici, elle est déjà enregistrée.
   */
  const finirReponse = useCallback((sessionId: string, r: ReponseEnCours) => {
    if (reponsesEnCours.get(sessionId) === r) reponsesEnCours.delete(sessionId);
    signalerEnCours();
    if (sessionRef.current?.id === sessionId) {
      detacher();
      setBusy(false);
    }
  }, [detacher]);

  const commit = useCallback((next: Message[]) => {
    historyRef.current = next;
    setMessages(next);
  }, []);

  /** « Arrêter » : la réponse du Chat affiché, et elle seule. */
  const stop = useCallback(() => {
    const id = sessionRef.current?.id;
    if (id) reponsesEnCours.get(id)?.controller.abort();
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const send = useCallback(
    async (text: string, pieces: Attachment[] = []) => {
      const prompt = text.trim();
      if ((!prompt && pieces.length === 0) || busy) return;

      /*
       * Le contenu des documents joints part avec la question, mais n'encombre
       * pas la conversation affichée : on garde à l'écran ce que la personne a
       * écrit, plus le nom des pièces.
       */
      const documents = contexteTexte(pieces);
      const vues = images(pieces);
      const etiquettes = pieces.map((p) => p.nom).join(", ");

      const userMsg: Message = {
        id: newId(),
        role: "user",
        content: prompt || (etiquettes ? `(${etiquettes})` : ""),
        pieces: pieces.length > 0 ? pieces.map((p) => ({ nom: p.nom, type: p.type })) : undefined,
      };
      const replyId = newId();

      // Ouvre une session à la première question.
      if (!sessionRef.current) {
        sessionRef.current = createSession({
          owner: currentUser(),
          title: deriveTitle(prompt),
          origin: options.origin ?? "local",
          modelUid: options.model,
        });
        notifySessionsChanged();
      }

      // Historique envoyé : message système du profil + tours valides.
      const turns: ChatTurn[] = [...historyRef.current, userMsg]
        .filter((m) => !m.error && m.content.trim().length > 0)
        /*
         * Une question restée sans réponse (arrêtée, ou refusée par une
         * erreur) n'est pas renvoyée. Elle suivait la précédente sans réponse
         * entre les deux, et le modèle répondait à la première : arrêté sur
         * « écris un essai de 2000 mots », puis « réponds seulement OK »,
         * il a écrit l'essai dans un fichier (essai réel, qwen3-8b). Deux
         * questions de suite, c'est la dernière qui compte.
         */
        .filter((m, i, liste) => !(m.role === "user" && liste[i + 1]?.role === "user"))
        .map((m) => ({ role: m.role, content: m.content }));

      // Le dernier tour porte les pièces jointes de cette question.
      if (turns.length > 0 && (documents || vues.length > 0)) {
        const dernier = turns[turns.length - 1];
        const texte = [documents, typeof dernier.content === "string" ? dernier.content : ""]
          .filter(Boolean)
          .join("\n\n");

        turns[turns.length - 1] = {
          role: "user",
          content:
            vues.length > 0
              ? [
                  { type: "text" as const, text: texte },
                  ...vues.map((v) => ({
                    type: "image_url" as const,
                    image_url: { url: v.dataUrl },
                  })),
                ]
              : texte,
        };
      }

      const payload: ChatTurn[] = options.systemPrompt
        ? [{ role: "system", content: options.systemPrompt }, ...turns]
        : turns;

      const session = sessionRef.current!;
      const controller = new AbortController();
      const enCours: ReponseEnCours = { history: historyRef.current, controller, abonnes: new Set() };
      reponsesEnCours.set(session.id, enCours);
      signalerEnCours();
      // Tout passe par la réponse en cours ; l'écran la suit tant qu'il montre ce Chat.
      const ecrire = (next: Message[]) => {
        enCours.history = next;
        for (const f of enCours.abonnes) f(next);
      };
      const patch = (id: string, changes: Partial<Message> | ((actuel: Message) => Partial<Message>)) =>
        ecrire(enCours.history.map((m) => (m.id === id ? { ...m, ...(typeof changes === "function" ? changes(m) : changes) } : m)));
      const persist = () => persisterDans(session, enCours.history);
      attacher(session.id);
      ecrire([...enCours.history, userMsg, { id: replyId, role: "assistant", content: "", streaming: true }]);
      abortRef.current = controller;

      let content = "";
      let reasoning = "";
      const traces: ToolTrace[] = [];
      let plan: EtapePlan[] = [];

      try {
        await streamChat(
          {
            messages: payload,
            model: options.model,
            effort: options.effort,
            tools: options.tools,
            connaissances: options.connaissances,
            signal: controller.signal,
          },
          {
            onContent: (chunk) => {
              content += chunk;
              patch(replyId, { content });
            },
            onReasoning: (chunk) => {
              reasoning += chunk;
              patch(replyId, { reasoning });
            },
            onEvent: (event) => {
              if (event.type === "plan") {
                plan = event.etapes.map((titre, i) => ({ titre, etat: "attente" as const, chemin: String(i + 1), profondeur: 0 }));
                patch(replyId, { plan: [...plan] });
              } else if (event.type === "plan_sous") {
                // Les parties d'une étape redécoupée s'insèrent juste après elle.
                const i = plan.findIndex((e) => e.chemin === event.chemin);
                if (i >= 0) {
                  const parent = plan[i]!;
                  parent.etat = "decoupee";
                  const parties = event.etapes.map((titre, k) => ({
                    titre,
                    etat: "attente" as const,
                    chemin: `${event.chemin}.${k + 1}`,
                    profondeur: (parent.profondeur ?? 0) + 1,
                  }));
                  plan.splice(i + 1, 0, ...parties);
                  patch(replyId, { plan: [...plan] });
                }
              } else if (event.type === "etape") {
                const e = etapeDe(plan, event);
                if (e) e.etat = "encours";
                patch(replyId, { plan: [...plan] });
              } else if (event.type === "plan_ajout") {
                plan.push(
                  { titre: event.titre, etat: "decoupee" as const, chemin: event.chemin, profondeur: 0 },
                  ...event.etapes.map((titre, k) => ({ titre, etat: "attente" as const, chemin: `${event.chemin}.${k + 1}`, profondeur: 1 })),
                );
                patch(replyId, { plan: [...plan] });
              } else if (event.type === "revue") {
                patch(replyId, { revue: event.etat });
              } else if (event.type === "etape_verification") {
                const e = etapeDe(plan, event);
                if (e) e.controlee = true;
                patch(replyId, { plan: [...plan] });
              } else if (event.type === "etape_reprise") {
                const e = etapeDe(plan, event);
                if (e) e.reprise = true;
                patch(replyId, { plan: [...plan] });
              } else if (event.type === "etape_fin") {
                const e = etapeDe(plan, event);
                if (e) e.etat = event.ok ? "fait" : "echec";
                patch(replyId, { plan: [...plan] });
              } else if (event.type === "tool_start") {
                traces.push({ name: event.name, args: event.args, running: true });
                patch(replyId, { tools: [...traces] });
              } else if (event.type === "tool_end") {
                const last = [...traces].reverse().find((t) => t.name === event.name && t.running);
                if (last) {
                  last.running = false;
                  last.ok = event.ok;
                  last.preview = event.preview;
                }
                patch(replyId, { tools: [...traces] });
              } else if (event.type === "sources") {
                patch(replyId, {
                  sources: { citations: event.sources ?? [], ignorees: event.ignorees, aReindexer: event.aReindexer, erreur: event.erreur },
                });
              } else if (event.type === "error") {
                patch(replyId, { error: event.message });
              } else if (event.type === "statut") {
                patch(replyId, { statut: event.message || undefined });
              }
            },
          },
        );
        /*
         * Une réponse vide, sans erreur, sans rien : c'est « il n'a jamais
         * répondu ». La cause la plus fréquente était un modèle qui épuisait
         * son budget à réfléchir (gateway/src/chat.ts, `basePayload`) ; il en
         * reste d'autres, et aucune ne doit laisser une bulle blanche. On le
         * dit, avec ce qu'on peut y faire.
         */
        patch(replyId, (actuel) =>
          !actuel.content.trim() && !actuel.error && !(actuel.plan && actuel.plan.length > 0)
            ? {
                streaming: false,
                statut: undefined,
                error: t(
                  "Le modèle n'a rien répondu. Réessayez ; si cela recommence, baissez le niveau de raisonnement ou choisissez un autre modèle.",
                ),
              }
            : { streaming: false, statut: undefined },
        );
        persist();
      } catch (err) {
        if (controller.signal.aborted) {
          /*
           * Arrêtée avant le premier mot : la bulle restait blanche, sans
           * rien qui dise pourquoi. Elle le dit. Ce qui était déjà écrit,
           * lui, reste tel quel, et est gardé dans le Chat.
           */
          patch(replyId, (actuel) => ({
            // Un outil en cours ne recevra plus sa fin : sa roue tournait pour toujours (Cowork).
            tools: actuel.tools?.map((trace) =>
              trace.running ? { ...trace, running: false, ok: false, preview: t("Interrompu à votre demande.") } : trace,
            ),
            ...(!actuel.content.trim() && !actuel.error
              ? { streaming: false, statut: undefined, error: t("Réponse arrêtée à votre demande, avant d'avoir été écrite.") }
              : { streaming: false, statut: undefined }),
          }));
        } else {
          patch(replyId, {
            streaming: false,
            statut: undefined,
            error: messageDErreur(err),
          });
        }
        /*
         * Gardé dans tous les cas, erreur comprise : la question de la
         * personne n'était enregistrée qu'en cas de succès. Un modèle
         * inconnu ou un moteur éteint laissait un Chat dont le titre
         * existait dans la liste, et qui s'ouvrait vide.
         */
        persist();
      } finally {
        /*
         * Le plan ne doit pas continuer de tourner à l'écran une fois le flux
         * fini. Arrêté par la personne ou coupé par une erreur, l'étape en
         * cours ne recevra jamais sa fin : sa roue tournait pour toujours,
         * comme si l'agent travaillait encore. Arrêtée, elle redevient « à
         * faire » ; coupée par une panne, elle est marquée en échec.
         */
        patch(replyId, (actuel) =>
          actuel.plan?.some((e) => e.etat === "encours") || actuel.revue === "encours"
            ? {
                plan: actuel.plan?.map((e) =>
                  e.etat === "encours" ? { ...e, etat: controller.signal.aborted ? ("attente" as const) : ("echec" as const) } : e,
                ),
                revue: actuel.revue === "encours" ? undefined : actuel.revue,
              }
            : {},
        );
        /*
         * Seulement si c'est encore cette demande-ci qui est en cours : après
         * « Arrêter » puis un nouvel envoi, la fin tardive de l'ancienne
         * effaçait le contrôleur de la nouvelle, qui ne pouvait plus être
         * arrêtée, et rendait la main alors qu'elle tournait encore.
         */
        if (abortRef.current === controller) abortRef.current = null;
        finirReponse(session.id, enCours);
      }
    },
    [
      busy,
      options.model,
      options.effort,
      options.systemPrompt,
      options.origin,
      options.tools,
      options.connaissances,
      attacher,
      finirReponse,
      persisterDans,
    ],
  );

  /** Nouvelle conversation : la session courante est close, pas supprimée. */
  const reset = useCallback(() => {
    // Nouvelle conversation : la réponse en cours de l'autre Chat continue.
    detacher();
    abortRef.current = null;
    setBusy(false);
    sessionRef.current = null;
    commit([]);
  }, [detacher, commit]);

  /** Reprend une session existante (partagée ou personnelle). */
  const open = useCallback(
    (session: Session) => {
      detacher();
      abortRef.current = null;
      setBusy(false);
      sessionRef.current = session;
      // Une réponse s'écrit encore dans ce Chat : on la suit en direct.
      if (attacher(session.id)) return;
      commit(
        session.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          reasoning: m.reasoning,
          image: m.image,
          ...(m.sources && m.sources.length > 0 ? { sources: { citations: m.sources } } : {}),
        })),
      );
    },
    [detacher, attacher, commit],
  );

  /**
   * Crée une image au lieu de répondre (bouton « Image »). La demande et
   * l'image restent dans le Chat, comme un échange ordinaire ; la réponse
   * garde une phrase de texte, pour que la suite de la conversation sache
   * qu'une image a été faite, et de quoi.
   */
  const creerImage = useCallback(
    /** `video` : une courte vidéo plutôt qu'une image, par le même moteur (27/09/2026). */
    async (description: string, format: Format, video = false) => {
      const texte = description.trim();
      if (!texte || busy) return;
      const userMsg: Message = { id: newId(), role: "user", content: texte };
      const replyId = newId();
      if (!sessionRef.current) {
        sessionRef.current = createSession({
          owner: currentUser(),
          title: deriveTitle(texte),
          origin: options.origin ?? "local",
          modelUid: options.model,
        });
        notifySessionsChanged();
      }
      const session = sessionRef.current!;
      const controller = new AbortController();
      const enCours: ReponseEnCours = { history: historyRef.current, controller, abonnes: new Set() };
      reponsesEnCours.set(session.id, enCours);
      signalerEnCours();
      const ecrire = (next: Message[]) => {
        enCours.history = next;
        for (const f of enCours.abonnes) f(next);
      };
      const patch = (id: string, changes: Partial<Message>) =>
        ecrire(enCours.history.map((m) => (m.id === id ? { ...m, ...changes } : m)));
      const persist = () => persisterDans(session, enCours.history);
      attacher(session.id);
      ecrire([
        ...enCours.history,
        userMsg,
        { id: replyId, role: "assistant", content: "", streaming: true, statut: t("Préparation de la description...") },
      ]);
      abortRef.current = controller;
      try {
        const creer = video ? creerVideoSurLaMachine : creerSurLaMachine;
        const image = await creer(texte, format, (tr) => patch(replyId, { statut: tr.message }), controller.signal, sessionRef.current?.id);
        patch(replyId, { content: video ? tf("Vidéo créée : « {0} »", texte) : tf("Image créée : « {0} »", texte), image, streaming: false, statut: undefined });
        persist();
      } catch (err) {
        if (controller.signal.aborted) {
          patch(replyId, { streaming: false, statut: undefined, error: video ? t("Suivi arrêté : la vidéo se termine quand même sur la machine, mais n'apparaîtra pas ici.") : t("Suivi arrêté : l'image se termine quand même sur la machine, mais n'apparaîtra pas ici.") });
        } else {
          patch(replyId, { streaming: false, statut: undefined, error: messageDErreur(err) });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        finirReponse(session.id, enCours);
      }
    },
    [busy, options.origin, options.model, attacher, finirReponse, persisterDans],
  );

  return {
    messages,
    busy,
    send,
    creerImage,
    stop,
    reset,
    open,
    session: sessionRef.current,
  };
}
