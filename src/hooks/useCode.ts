import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCodeStatus,
  createCodeSession,
  sendCodePrompt,
  interruptCode,
  translate,
  nomOutil,
  argumentsOutil,
  actionOutil,
  texteAttente,
  historiqueSessionCode,
  signalerSessionsCode,
  type CodeEvent,
  type CodeStatus,
  type HistoriqueCode,
  type ReglagesCode,
} from "@/lib/code";
import type { Message, ToolTrace } from "./useChat";
import { appliquerSuivi, suiviNeuf, terminerSuivi, type ActionCode, type SuiviCode } from "@/lib/suiviCode";

import { ouvrirFlux } from "@/lib/flux";
import { t } from "@/lib/i18n";
import { currentUser } from "@/lib/store/identity";
import { aleatoire } from "@/lib/store/storage";

/** Au-delà de ce silence, l'écran Code le signale. */
const SILENCE_MAX_MS = 90_000;
/** Réabonnements tentés quand le flux tombe en plein travail. */
const REABONNEMENTS_MAX = 3;
const newId = () => aleatoire(11);

/**
 * Une demande en cours, et de quoi reconnaître ce qui lui appartient.
 *
 * Le flux d'une session OpenCode mélange tout : l'historique rejoué à chaque
 * ouverture (vérifié le 23/09/2026 : sans `after`, tout revient depuis le
 * premier événement), les derniers échos d'un tour qu'on vient d'arrêter, puis
 * la demande en cours. Tout appliquer à « la réponse affichée » faisait
 * atterrir la fin d'un ancien tour sur la nouvelle réponse — un « stop »
 * d'avant la terminait avant qu'elle commence. On ne retient donc que ce qui
 * suit l'événement `prompted` portant l'identifiant de NOTRE message, rendu
 * par l'envoi.
 */
interface Tour {
  replyId: string;
  sessionID: string;
  /** Identifiant du message envoyé ; inconnu tant que l'envoi n'a pas répondu. */
  messageID?: string;
  /** Notre `prompted` est passé : les événements suivants sont les nôtres. */
  actif: boolean;
  /** Événements arrivés avant de connaître `messageID`, rejoués ensuite. */
  enAttente: CodeEvent[];
  /** Le tour s'est terminé (normalement ou non). */
  fini: boolean;
  /** Quand il s'est terminé : une relance du contrôle automatique peut encore le rouvrir un moment. */
  finiLe?: number;
  /** Position de chaque outil dans la liste affichée, par identifiant d'appel. */
  outils: Map<string, number>;
}

/**
 * La conversation de l'écran Code vit ici, hors du composant.
 *
 * Elle vivait dans le composant, qui disparaît dès qu'on ouvre une autre page :
 * aller voir le Chat pendant que l'agent travaillait, c'était revenir sur un
 * écran Code vide, pendant que l'agent continuait de modifier les fichiers
 * sans que rien ne le montre. Ici, la conversation et son flux survivent au
 * changement de page ; le composant ne fait que s'y abonner.
 *
 * Elle appartient à la personne connectée : une autre personne qui se connecte
 * sur le poste repart d'un écran vierge (`proprietaire`).
 */
const ref = <T,>(valeur: T) => ({ current: valeur });
const memoire = {
  proprietaire: ref<string | undefined>(undefined),
  messages: ref<Message[]>([]),
  busy: ref(false),
  session: ref<string | null>(null),
  /** Flux ouvert : sa session et de quoi le fermer (lib/flux.ts). */
  flux: ref<{ sessionID: string; fermer: () => void } | null>(null),
  /** Dernier numéro d'événement reçu, par session : pour se réabonner sans rejeu. */
  dernierSeq: ref(new Map<string, number>()),
  reabonnements: ref(0),
  tour: ref<Tour | null>(null),
  /*
   * Génération de la conversation. `reset` (nouveau dossier) et `stop` la font
   * avancer : un envoi encore en route — ouverture de session, démarrage à
   * froid du moteur — voit alors qu'il n'a plus rien à faire à l'écran, au lieu
   * de venir peupler la conversation suivante.
   */
  generation: ref(0),
  /** Dernier signe de vie de l'agent : voir le guet plus bas. */
  dernierSigne: ref(0),
  /** La dernière demande a été arrêtée : le prochain envoi le dit au modèle. */
  arretee: ref(false),
  /** Où en est l'agent sur la dernière demande : le panneau de suivi (lib/suiviCode.ts). */
  suivi: ref<SuiviCode | null>(null),
  /** Écrans abonnés, prévenus à chaque changement. */
  abonnes: new Set<() => void>(),
};

const prevenir = () => memoire.abonnes.forEach((f) => f());

/**
 * Session de travail de l'écran Code, adossée à OpenCode.
 * Les événements du moteur sont traduits dans le même format de message que le
 * Chat, si bien que l'affichage est partagé.
 *
 * @param dossier Dossier de travail choisi. Transmis à l'ouverture de la
 * session : le moteur y ancre le projet, comme un éditeur qu'on ouvre sur un
 * répertoire.
 * @param reglages Modèle et niveau de raisonnement choisis à l'écran. Ils
 * partent avec chaque demande : l'instance les applique à la session s'ils ont
 * changé. Ils n'étaient transmis nulle part — les sélecteurs de l'écran Code
 * étaient décoratifs.
 */
export function useCode(dossier?: string, reglages: ReglagesCode = {}) {
  /*
   * Une autre personne connectée : la conversation précédente n'est pas la
   * sienne. Sa session d'agent est arrêtée, pas seulement cachée.
   */
  const moi = currentUser().id;
  if (memoire.proprietaire.current !== moi) {
    if (memoire.busy.current && memoire.tour.current) void interruptCode(memoire.tour.current.sessionID);
    memoire.flux.current?.fermer();
    memoire.proprietaire.current = moi;
    memoire.messages.current = [];
    memoire.busy.current = false;
    memoire.session.current = null;
    memoire.flux.current = null;
    memoire.tour.current = null;
    memoire.arretee.current = false;
    memoire.suivi.current = null;
    memoire.generation.current += 1;
  }

  const [status, setStatus] = useState<CodeStatus | null>(null);
  const [messages, setMessages] = useState<Message[]>(memoire.messages.current);
  const [busy, setBusy] = useState(memoire.busy.current);
  const [suivi, setSuivi] = useState<SuiviCode | null>(memoire.suivi.current);
  /** Session affichée (celle que l'adresse `/code?s=` désigne une fois ouverte). */
  const [sessionId, setSessionId] = useState<string | null>(memoire.session.current);
  /** Miroir de `busy`, lisible depuis les fonctions mémorisées. */
  const busyRef = memoire.busy;
  const marquerOccupe = useCallback((valeur: boolean) => {
    busyRef.current = valeur;
    prevenir();
  }, [busyRef]);
  const [error, setError] = useState<string | undefined>();

  const sessionRef = memoire.session;
  const fluxRef = memoire.flux;
  const dernierSeqRef = memoire.dernierSeq;
  const reabonnementsRef = memoire.reabonnements;
  const tourRef = memoire.tour;
  const generationRef = memoire.generation;
  const dernierSigneRef = memoire.dernierSigne;
  const listRef = memoire.messages;
  const reglagesRef = useRef(reglages);
  reglagesRef.current = reglages;
  /** Dossier du projet, pour montrer des chemins relatifs dans le suivi. */
  const dossierRef = useRef<string | undefined>(dossier);
  dossierRef.current = dossier ?? status?.projectDir;

  // Cet écran suit la conversation, qu'elle change par lui ou pendant son absence.
  useEffect(() => {
    const suivre = () => {
      setMessages(memoire.messages.current);
      setBusy(memoire.busy.current);
      setSuivi(memoire.suivi.current);
      setSessionId(memoire.session.current);
    };
    memoire.abonnes.add(suivre);
    suivre();
    return () => {
      memoire.abonnes.delete(suivre);
    };
  }, []);

  const commit = useCallback((next: Message[]) => {
    listRef.current = next;
    prevenir();
  }, [listRef]);

  const patch = useCallback(
    (id: string, changes: Partial<Message>) => {
      commit(listRef.current.map((m) => (m.id === id ? { ...m, ...changes } : m)));
    },
    [commit],
  );

  useEffect(() => {
    fetchCodeStatus()
      .then(setStatus)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      // Au repos, le flux peut se fermer ; en plein travail, il continue de
      // remplir la conversation pour le retour de la personne.
      const tour = memoire.tour.current;
      if (!tour || tour.fini) {
        memoire.flux.current?.fermer();
        memoire.flux.current = null;
      }
    };
  }, []);

  /**
   * Termine la réponse du tour : plus de curseur, la main rendue.
   *
   * `note` : pourquoi le tour s'arrête, quand ce n'est pas une fin normale.
   * Ce qui a déjà été écrit reste visible, la note s'ajoute dessous ; sans
   * rien d'écrit, elle devient le message d'erreur. (Posée en `error`, elle
   * cachait tout le texte de la réponse : l'affichage ne montre que l'erreur.)
   */
  const terminer = useCallback(
    (tour: Tour, note?: string, issue: "fini" | "echec" = note ? "echec" : "fini") => {
      tour.fini = true;
      tour.finiLe = Date.now();
      if (memoire.suivi.current) memoire.suivi.current = terminerSuivi(memoire.suivi.current, issue);
      const current = listRef.current.find((m) => m.id === tour.replyId);
      if (current) {
        // Un outil encore « en cours » quand le tour s'arrête ne se terminera plus.
        const tools = current.tools?.map((trace) =>
          trace.running ? { ...trace, running: false, ok: false, preview: trace.preview ?? note } : trace,
        );
        const changes: Partial<Message> = { streaming: false, statut: undefined, tools };
        if (note) {
          if (current.content) changes.content = `${current.content}\n\n*${note}*`;
          else changes.error = note;
        } else if (!current.content && !current.tools?.length) {
          // Rien écrit, rien fait : le dire plutôt que laisser une bulle vide.
          changes.content = t("L'agent a terminé sans réponse écrite.");
        }
        patch(tour.replyId, changes);
      }
      marquerOccupe(false);
    },
    [patch, marquerOccupe],
  );

  /** Applique à l'écran un événement du tour en cours. */
  const appliquer = useCallback(
    (tour: Tour, event: CodeEvent) => {
      if (event.kind === "demande") {
        /*
         * Une relance du contrôle automatique de Helix est la suite de notre
         * demande : même bulle, et le tour rendu se rouvre. Sans cela, l'écran
         * disait « terminé » pendant que l'agent corrigeait derrière.
         */
        if (event.relance) {
          tour.actif = true;
          if (tour.fini) {
            tour.fini = false;
            if (memoire.suivi.current) memoire.suivi.current = { ...memoire.suivi.current, fin: undefined, issue: undefined };
            patch(tour.replyId, { streaming: true, error: undefined });
            marquerOccupe(true);
          }
          return;
        }
        // Sans identifiant rendu par l'envoi, on ne peut pas trier : tout est pris.
        if (tour.messageID !== undefined) tour.actif = event.messageID === tour.messageID;
        return;
      }
      if (!tour.actif) return;
      // Le bilan du contrôle automatique arrive après la fin du tour : il s'ajoute à la réponse.
      if (tour.fini && event.kind === "statut" && event.controle) {
        const actuel = listRef.current.find((m) => m.id === tour.replyId);
        if (actuel && event.text) patch(tour.replyId, { content: actuel.content ? `${actuel.content}\n\n*${event.text}*` : `*${event.text}*`, statut: undefined });
        return;
      }
      // Tour déjà terminé : seule une nouvelle étape le rouvre (voir « etape »).
      if (tour.fini && event.kind !== "etape") return;
      const current = listRef.current.find((m) => m.id === tour.replyId);
      if (!current) return;
      // L'agent reparle : l'avertissement de silence n'a plus lieu d'être.
      if (current.statut && event.kind !== "statut") patch(tour.replyId, { statut: undefined });
      // Le panneau de suivi : les écrans ne sont prévenus que si quelque chose a changé.
      if (memoire.suivi.current) {
        const avant = memoire.suivi.current;
        const apres = appliquerSuivi(avant, event, dossierRef.current);
        if (apres !== avant) {
          memoire.suivi.current = apres;
          prevenir();
        }
      }

      switch (event.kind) {
        case "etape":
          /*
           * Une étape qui commence après une fin annoncée : l'agent continue.
           * On le montre au lieu de le laisser travailler derrière un écran
           * qui a rendu la main.
           */
          if (tour.fini) {
            tour.fini = false;
            if (memoire.suivi.current) memoire.suivi.current = { ...memoire.suivi.current, fin: undefined, issue: undefined };
            patch(tour.replyId, { streaming: true, error: undefined });
            marquerOccupe(true);
          }
          break;
        case "attente":
          // Le modèle n'a encore rien rendu : on dit pourquoi, au lieu d'annoncer une panne.
          patch(tour.replyId, { statut: event.etat === "fin" ? undefined : texteAttente(event) });
          break;
        case "statut":
          patch(tour.replyId, { statut: event.text });
          break;
        case "reasoning":
          patch(tour.replyId, {
            reasoning: current.reasoning ? `${current.reasoning}\n\n${event.text}` : event.text,
          });
          break;
        case "text":
          patch(tour.replyId, {
            content: current.content ? `${current.content}\n\n${event.text}` : event.text,
          });
          break;
        case "tool_start": {
          const { libelle, cible } = actionOutil(event.tool, event.input, dossierRef.current);
          const traces: ToolTrace[] = [
            ...(current.tools ?? []),
            { name: nomOutil(event.tool), args: argumentsOutil(event.input), running: true, libelle, cible },
          ];
          tour.outils.set(event.callID, traces.length - 1);
          patch(tour.replyId, { tools: traces });
          break;
        }
        case "tool_end": {
          const position = tour.outils.get(event.callID);
          if (position === undefined) break;
          const traces = (current.tools ?? []).map((trace, i) =>
            i === position ? { ...trace, running: false, ok: event.ok, preview: event.preview } : trace,
          );
          patch(tour.replyId, { tools: traces });
          break;
        }
        case "error":
          /*
           * L'échec doit rendre la main : afficher le motif, arrêter le
           * défilement, et surtout libérer `busy`. Sans ce dernier point, la
           * conversation se croit occupée pour toujours et ignore
           * silencieusement tout ce que l'utilisateur tape ensuite.
           */
          terminer(tour, event.message);
          break;
        case "fin":
          // Fin sans « stop » (longueur, filtre) : ce qui est écrit reste une réponse.
          terminer(tour, event.note, "fini");
          break;
        case "done":
          terminer(tour);
          break;
      }
    },
    [patch, marquerOccupe, terminer],
  );

  /** Abonne l'interface au flux d'événements d'une session. */
  const listen = useCallback(
    (sessionID: string) => {
      fluxRef.current?.fermer();
      /*
       * `after` : le dernier événement déjà reçu de cette session. Sans lui,
       * OpenCode rejoue toute l'histoire de la session à chaque abonnement.
       */
      const dernier = dernierSeqRef.current.get(sessionID);
      const suite = dernier !== undefined ? `&after=${dernier}` : "";
      /*
       * `sessionID` désigne la session OpenCode ; l'authentification, elle,
       * passe par un billet à usage unique ajouté par `ouvrirFlux` sous le nom
       * `flux` (lib/flux.ts). Deux paramètres du même nom auraient donné le
       * premier des deux à la passerelle.
       */
      const fermer = ouvrirFlux(
        `/helix/code/events?sessionID=${encodeURIComponent(sessionID)}${suite}`,
        (donnees) => {
          let parsed: { durable?: { seq?: unknown } };
          try {
            parsed = JSON.parse(donnees);
          } catch {
            return;
          }
          const seq = parsed?.durable?.seq;
          if (typeof seq === "number") {
            const vu = dernierSeqRef.current.get(sessionID);
            if (vu === undefined || seq > vu) dernierSeqRef.current.set(sessionID, seq);
          }
          // Tout ce qui arrive, même un événement qu'on n'affiche pas, prouve que l'agent vit.
          dernierSigneRef.current = Date.now();
          const event = translate(parsed);
          if (!event) return;
          const tour = tourRef.current;
          if (!tour || tour.sessionID !== sessionID) return;
          /*
           * Helix prépare une application avant d'envoyer la demande (plusieurs
           * minutes avec un petit modèle) : l'étape en cours s'affiche tout de
           * suite, sans attendre l'identifiant de la demande.
           */
          if (event.kind === "statut" && event.preparation && !tour.fini) {
            patch(tour.replyId, { statut: event.text });
            return;
          }
          // L'envoi n'a pas encore dit quel est notre message : on garde pour plus tard.
          if (tour.messageID === undefined && !tour.actif) {
            tour.enAttente.push(event);
            return;
          }
          appliquer(tour, event);
        },
        {
          /*
           * La reprise est faite ici plutôt que par `ouvrirFlux` : elle doit
           * repartir du dernier événement reçu (`after`), pas de l'adresse
           * d'origine.
           */
          reprendre: false,
          onOuvert: () => {
            reabonnementsRef.current = 0;
          },
          onErreur: () => {
            if (fluxRef.current?.fermer !== fermer) return;
            fluxRef.current = null;
            const tour = tourRef.current;
            /*
             * Au repos, rien à faire : l'envoi suivant se réabonnera. Sauf juste
             * après un tour : le contrôle automatique de Helix peut encore relancer
             * l'agent (gateway/src/controleCode.ts). Vu le 26/09/2026 : le flux
             * tombé entre deux corrections, l'écran ratait toutes les suivantes.
             */
            const relancePossible = tour?.fini && tour.finiLe !== undefined && Date.now() - tour.finiLe < 15 * 60_000;
            if (!tour || tour.sessionID !== sessionID || (tour.fini && !relancePossible)) return;
            if (tour.fini) {
              setTimeout(() => {
                if (tourRef.current === tour && !fluxRef.current) listen(sessionID);
              }, 2000);
              return;
            }
            /*
             * En plein travail : on se réabonne, sans rien perdre ni rien
             * rejouer. Le flux pouvait tomber sans prévenir (délai
             * d'inactivité de la passerelle, redémarrage du moteur) ; l'écran
             * libérait alors la conversation sans un mot, et la réponse
             * n'arrivait jamais.
             */
            if (reabonnementsRef.current < REABONNEMENTS_MAX) {
              reabonnementsRef.current += 1;
              const generation = generationRef.current;
              setTimeout(() => {
                if (generationRef.current === generation && tourRef.current === tour && !tour.fini) {
                  listen(sessionID);
                }
              }, 1000 * reabonnementsRef.current);
              return;
            }
            terminer(
              tour,
              t("La connexion avec l'agent de code a été perdue : la suite de sa réponse n'a pas pu être affichée. Ses modifications de fichiers, elles, ont pu continuer."),
            );
          },
        },
      );
      fluxRef.current = { sessionID, fermer };
    },
    [appliquer, terminer, patch],
  );

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      /*
       * `busyRef` et non `busy` : cette fonction est mémorisée, et lire l'état
       * directement y figerait la valeur du rendu où elle a été créée. Une fois
       * la conversation passée à « occupée », tous les envois suivants étaient
       * abandonnés en silence — la saisie disparaissait sans rien afficher.
       */
      if (!prompt || busyRef.current) return;
      setError(undefined);
      const generation = generationRef.current;
      const reglagesEnvoi = { ...reglagesRef.current };

      /*
       * La demande s'affiche et la conversation est occupée AVANT d'ouvrir la
       * session. L'ouverture peut prendre plusieurs secondes (démarrage du
       * moteur, chauffe) : l'écran restait vide pendant ce temps, la saisie
       * effacée, et un second clic ouvrait une seconde session.
       */
      const replyId = newId();
      commit([
        ...listRef.current,
        { id: newId(), role: "user", content: prompt },
        {
          id: replyId,
          role: "assistant",
          content: "",
          streaming: true,
          statut: sessionRef.current ? undefined : t("Démarrage de l'agent de code..."),
        },
      ]);
      memoire.suivi.current = suiviNeuf();
      marquerOccupe(true);
      dernierSigneRef.current = Date.now();

      try {
        if (!sessionRef.current) {
          const ouverte = await createCodeSession(reglagesEnvoi, dossier);
          if (generationRef.current !== generation) return;
          sessionRef.current = ouverte;
          prevenir();
        }
      } catch (err) {
        if (generationRef.current !== generation) return;
        patch(replyId, {
          streaming: false,
          statut: undefined,
          error: err instanceof Error ? err.message : String(err),
        });
        if (memoire.suivi.current) memoire.suivi.current = terminerSuivi(memoire.suivi.current, "echec");
        marquerOccupe(false);
        return;
      }

      const sessionID = sessionRef.current!;
      const tour: Tour = {
        replyId,
        sessionID,
        actif: false,
        enAttente: [],
        fini: false,
        outils: new Map(),
      };
      tourRef.current = tour;
      reabonnementsRef.current = 0;
      // Flux absent (première demande, ou tombé pendant le repos) : on s'abonne.
      if (fluxRef.current?.sessionID !== sessionID) listen(sessionID);

      /*
       * Une demande arrêtée reste dans l'historique de la session : OpenCode
       * ne sait pas l'en retirer (essayé : `revert` la marque, le modèle la
       * reçoit encore). Vu le 23/09/2026 : arrêtée avant d'avoir commencé,
       * elle était exécutée à la demande suivante (« réponds OK » a créé les
       * fichiers de la demande arrêtée). On le dit donc au modèle, sans
       * l'afficher : l'écran montre ce que la personne a écrit.
       */
      const texte = memoire.arretee.current
        ? `[La demande précédente a été arrêtée par la personne : ne la réalise pas, sauf si elle la redemande.]\n\n${prompt}`
        : prompt;
      memoire.arretee.current = false;

      try {
        const { relance, messageID } = await sendCodePrompt(sessionID, texte, reglagesEnvoi);
        if (generationRef.current !== generation) {
          // Arrêté pendant l'envoi : la session relancée travaille peut-être déjà.
          if (relance) void interruptCode(relance);
          return;
        }
        /*
         * Si l'instance a dû relancer la demande dans une session neuve (la
         * première était perdue), on suit la nouvelle : c'est elle qui répond.
         */
        if (relance) {
          sessionRef.current = relance;
          tour.sessionID = relance;
          tour.enAttente = [];
          listen(relance);
          prevenir();
        }
        // La liste des sessions de Code : titre (la première demande) et date viennent de changer.
        signalerSessionsCode();
        if (messageID === undefined) {
          // Réponse sans identifiant : on ne peut pas trier, on prend tout.
          tour.actif = true;
        }
        tour.messageID = messageID;
        const enAttente = tour.enAttente;
        tour.enAttente = [];
        for (const event of enAttente) appliquer(tour, event);
      } catch (err) {
        if (generationRef.current !== generation) return;
        terminer(tour, err instanceof Error ? err.message : String(err));
      }
    },
    [commit, listen, patch, dossier, marquerOccupe, appliquer, terminer],
  );

  /*
   * Le guet du silence.
   *
   * OpenCode peut accepter une demande puis ne plus jamais rien émettre : un
   * modèle qu'il ne connaît pas, un moteur tombé en route, un fournisseur qui
   * coupe sa réponse sans la conclure (vérifié : aucun événement de fin ne
   * vient alors). Après 90 secondes sans le moindre signe, on le dit, avec ce
   * qu'on peut y faire. On n'interrompt rien : un gros modèle qui se charge
   * peut légitimement se taire un moment, et c'est la personne qui décide.
   */
  useEffect(() => {
    if (!busy) return;
    const minuterie = setInterval(() => {
      const tour = tourRef.current;
      if (!tour || !busyRef.current) return;
      if (Date.now() - dernierSigneRef.current < SILENCE_MAX_MS) return;
      patch(tour.replyId, {
        statut: t(
          "Aucun signe de l'agent de code depuis 90 secondes. Il charge peut-être un modèle ; sinon, arrêtez et réessayez, ou choisissez un autre modèle.",
        ),
      });
    }, 5000);
    return () => clearInterval(minuterie);
  }, [busy, patch]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    const tour = tourRef.current;
    // Plus rien de ce tour ne doit toucher l'écran : ses derniers échos arrivent après.
    tourRef.current = null;
    const session = tour?.sessionID ?? sessionRef.current;
    if (session) memoire.arretee.current = true;
    if (memoire.suivi.current) memoire.suivi.current = terminerSuivi(memoire.suivi.current, "arrete");
    if (tour && !tour.fini) {
      tour.fini = true;
      const current = listRef.current.find((m) => m.id === tour.replyId);
      const note = t("Arrêté à votre demande.");
      patch(tour.replyId, {
        streaming: false,
        statut: undefined,
        tools: current?.tools?.map((trace) =>
          trace.running ? { ...trace, running: false, ok: false, preview: note } : trace,
        ),
        content: current?.content ? `${current.content}\n\n*${note}*` : note,
      });
    } else {
      // Arrêt pendant l'ouverture de la session : la réponse attendait encore.
      const enCours = listRef.current.find((m) => m.role === "assistant" && m.streaming);
      if (enCours) patch(enCours.id, { streaming: false, statut: undefined, content: t("Arrêté à votre demande.") });
    }
    marquerOccupe(false);
    if (session) {
      void interruptCode(session).then((ok) => {
        if (!ok) {
          setError(t("L'arrêt n'a pas été confirmé par l'agent de code : il travaille peut-être encore."));
        }
      });
    }
  }, [patch, marquerOccupe]);

  /*
   * Arrêter une seule tâche du panneau de suivi (demandé par Medhi le
   * 26/09/2026, comme « Tâches en arrière-plan » de Claude Code). Une
   * sous-tâche a sa propre session chez OpenCode : on n'arrête qu'elle, et
   * l'agent principal lit l'échec de sa sous-tâche puis continue. Une commande
   * n'a pas de session à elle : OpenCode ne sait arrêter une commande qu'en
   * arrêtant le tour entier, et c'est ce que fait le bouton (il le dit).
   */
  const arreterAction = useCallback(
    (action: ActionCode) => {
      if (action.tool === "task" && action.sousSession) {
        void interruptCode(action.sousSession).then((ok) => {
          if (!ok) setError(t("L'arrêt de la sous-tâche n'a pas été confirmé par l'agent de code."));
        });
        return;
      }
      stop();
    },
    [stop],
  );

  const reset = useCallback(() => {
    // Repartir de zéro ne doit pas laisser l'agent travailler en arrière-plan, sans écran.
    if (busyRef.current && tourRef.current) void interruptCode(tourRef.current.sessionID);
    generationRef.current += 1;
    fluxRef.current?.fermer();
    fluxRef.current = null;
    sessionRef.current = null;
    tourRef.current = null;
    memoire.arretee.current = false;
    memoire.suivi.current = null;
    setError(undefined);
    commit([]);
    marquerOccupe(false);
  }, [commit, marquerOccupe]);

  /**
   * Revenir à l'accueil de Code pour une nouvelle session, **sans arrêter**
   * celle qui travaille : comme dans Claude Code, elle continue et se retrouve
   * dans la liste des sessions, où on la rouvre pour voir la suite (`ouvrir`).
   * Seul l'écran s'en détache : son flux se ferme, ses échos ne touchent plus
   * la conversation suivante (`generation`).
   */
  const nouvelle = useCallback(() => {
    generationRef.current += 1;
    fluxRef.current?.fermer();
    fluxRef.current = null;
    sessionRef.current = null;
    tourRef.current = null;
    memoire.arretee.current = false;
    memoire.suivi.current = null;
    setError(undefined);
    commit([]);
    marquerOccupe(false);
  }, [commit, marquerOccupe]);

  /**
   * Rouvre une session de la liste : son historique est relu chez OpenCode par
   * l'instance (rien n'est gardé en double ici). Si l'agent y travaille encore,
   * l'écran se rebranche sur son flux à partir du dernier évènement vu par
   * l'instance, et la suite s'affiche comme si l'on n'était jamais parti.
   * La session déjà affichée (retour depuis une autre page) n'est pas relue :
   * sa conversation est en mémoire, flux compris.
   */
  const ouvrir = useCallback(
    async (id: string): Promise<HistoriqueCode | null> => {
      if (sessionRef.current === id) return null;
      nouvelle();
      const generation = generationRef.current;
      let h: HistoriqueCode;
      try {
        h = await historiqueSessionCode(id);
      } catch (err) {
        if (generationRef.current === generation) setError(err instanceof Error ? err.message : String(err));
        return null;
      }
      if (generationRef.current !== generation) return null;
      const dossierSession = h.session.dossier;
      const liste: Message[] = h.messages.map((m) =>
        m.role === "user"
          ? { id: newId(), role: "user", content: m.texte }
          : {
              id: newId(),
              role: "assistant",
              content: m.texte,
              ...(m.raisonnement ? { reasoning: m.raisonnement } : {}),
              tools: m.outils.map((o) => ({
                name: nomOutil(o.tool),
                args: argumentsOutil(o.input),
                running: o.etat === "encours",
                ok: o.etat === "fini",
                preview: o.apercu,
                ...actionOutil(o.tool, o.input, dossierSession),
              })),
            },
      );
      sessionRef.current = id;
      dernierSeqRef.current.set(id, h.dernier);
      if (h.enCours) {
        /*
         * L'agent travaille encore : sa réponse commencée (le dernier message,
         * s'il est de lui) reçoit la suite du flux, outils en cours compris,
         * au lieu d'une seconde bulle qui répéterait le début.
         */
        const derniere = liste[liste.length - 1];
        const outils = new Map<string, number>();
        let replyId: string;
        if (derniere?.role === "assistant") {
          replyId = derniere.id;
          const brut = h.messages[h.messages.length - 1]!;
          brut.outils.forEach((o, i) => o.etat === "encours" && o.callID && outils.set(o.callID, i));
          liste[liste.length - 1] = { ...derniere, streaming: true, statut: t("L'agent travaille encore sur cette session...") };
        } else {
          replyId = newId();
          liste.push({ id: replyId, role: "assistant", content: "", streaming: true, statut: t("L'agent travaille encore sur cette session...") });
        }
        tourRef.current = { replyId, sessionID: id, actif: true, enAttente: [], fini: false, outils };
        memoire.suivi.current = suiviNeuf();
        dernierSigneRef.current = Date.now();
        commit(liste);
        marquerOccupe(true);
        listen(id);
      } else {
        commit(liste);
      }
      return h;
    },
    [nouvelle, commit, marquerOccupe, listen],
  );

  /** Relit l'état du moteur de code (après son installation par Helix). */
  const rafraichirStatut = useCallback(() => fetchCodeStatus().then(setStatus), []);

  return { status, messages, busy, error, send, stop, arreterAction, reset, suivi, sessionId, nouvelle, ouvrir, rafraichirStatut };
}
