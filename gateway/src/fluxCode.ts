import type http from "node:http";
import { api, enMarche, ensureServer, fluxEvenements, portEnCours } from "./opencode.ts";
import { journaliser } from "./audit.ts";

/**
 * Le flux d'évènements de Helix Code, fabriqué par la passerelle à partir de
 * l'**ancienne** API d'OpenCode.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Helix Code ouvrait ses sessions par la nouvelle API d'OpenCode
 * (`/api/session`), et l'écran, l'extension VS Code et la ligne de commande
 * lisent son flux (`session.next.*`). Or les sessions de cette nouvelle API
 * **n'ont pas d'outils MCP**, quelle que soit la configuration : lu dans le
 * code d'OpenCode 1.18.32 (dernière version publiée au 25/09/2026), son
 * registre d'outils « v2 » ne contient que les outils livrés (apply_patch,
 * bash, edit, glob, grep, question, read, skill, todowrite, webfetch,
 * websearch, write), enregistrés un par un ; rien n'y inscrit ceux des
 * serveurs MCP, et la note de l'équipe d'OpenCode sur la branche de
 * développement le dit : « MCP and future Session-scoped registrations still
 * need an explicit canonical registration design »
 * (packages/core/src/tool/AGENTS.md). Aucun réglage, agent ni champ `tools`
 * n'y change rien. L'ancienne API, elle, ajoute les outils MCP à ceux de
 * l'agent (vérifié le 25/09/2026 : un outil d'un serveur MCP d'essai appelé
 * par Qwen3 8B dans une session `/session`, sans rien d'autre à régler).
 *
 * Les sessions de Helix Code passent donc par l'ancienne API. Mais son flux
 * (`/event`, un seul pour tout un dossier, fait de `message.part.updated`) ne
 * ressemble pas à celui que lisent les trois clients. Plutôt que de réécrire
 * trois clients, la passerelle traduit : elle écoute `/event` et rend, pour
 * chaque session, les évènements `session.next.*` que les clients connaissent
 * déjà, avec les mêmes champs, un numéro (`durable.seq`) et la reprise par
 * `after`. Seuls les évènements que les clients lisent sont fabriqués.
 *
 * ── Ce que cela change, et ce qui reste ─────────────────────────────────────
 *
 *  - L'historique rejoué à l'ouverture est celui que la passerelle a vu depuis
 *    son démarrage (en mémoire, borné), et non plus toute l'histoire gardée
 *    par OpenCode. Les clients n'en ont besoin que pour reprendre un tour en
 *    cours ; après un redémarrage de la passerelle, OpenCode redémarre aussi.
 *  - Un évènement émis pendant que la passerelle se reconnecte à `/event`
 *    (OpenCode redémarré en plein tour) est perdu ; le guet de silence des
 *    clients le signale.
 *  - Les numéros partent de l'heure du démarrage (au centième de seconde) et
 *    sont communs à toutes les sessions : un client qui reprend avec le
 *    numéro d'avant un redémarrage ne manque pas les nouveaux, tant que la
 *    passerelle a fabriqué moins de cent évènements par seconde en moyenne.
 */

/** Un évènement tel que les clients de Helix Code le lisent. */
export interface EvenementCode {
  type: string;
  data: Record<string, unknown>;
  durable?: { seq: number };
}

type Auditeur = (evenement: EvenementCode) => void;

/** Ce que la passerelle retient d'une session pour la traduire. */
interface Suivi {
  dossier: string;
  /** Messages de la personne déjà annoncés (`prompted`). */
  demandes: Set<string>;
  /** Parts de texte ou de raisonnement déjà rendues entières. */
  finies: Set<string>;
  /** Appels d'outil déjà annoncés, puis déjà terminés. */
  appels: Set<string>;
  termines: Set<string>;
  /** Un échec a déjà été dit pour ce tour : OpenCode envoie parfois deux `session.error`. */
  echecDit: boolean;
  /** Derniers évènements numérotés, pour la reprise (`after`). */
  tampon: EvenementCode[];
  octets: number;
  auditeurs: Set<Auditeur>;
  /** Dernier signe de vie envoyé pendant qu'un texte s'écrit. */
  dernierSigne: number;
  vu: number;
}

const sessions = new Map<string, Suivi>();
const TAMPON_MAX = 2000;
const OCTETS_MAX = 2_000_000;
const SESSIONS_MAX = 200;

/** Voir l'en-tête : au centième de seconde, douze chiffres jusqu'en 2286. */
let numero = Math.floor(Date.now() / 10);

/**
 * La passerelle suit cette session, ouverte dans ce dossier. Appelée à la
 * création d'une session de Helix Code, avant tout envoi.
 */
export function suivreSession(sessionID: string, dossier: string): void {
  const connu = sessions.get(sessionID);
  if (connu) {
    connu.dossier = dossier;
    connu.vu = Date.now();
    return;
  }
  if (sessions.size >= SESSIONS_MAX) {
    // La session restée le plus longtemps sans évènement ni auditeur s'oublie d'abord.
    const vieille = [...sessions.entries()]
      .filter(([, s]) => s.auditeurs.size === 0)
      .sort((a, b) => a[1].vu - b[1].vu)[0];
    if (vieille) sessions.delete(vieille[0]);
  }
  sessions.set(sessionID, {
    dossier,
    demandes: new Set(),
    finies: new Set(),
    appels: new Set(),
    termines: new Set(),
    echecDit: false,
    tampon: [],
    octets: 0,
    auditeurs: new Set(),
    dernierSigne: 0,
    vu: Date.now(),
  });
}

export const sessionSuivie = (sessionID: string): boolean => sessions.has(sessionID);
export const dossierSuivi = (sessionID: string): string | undefined => sessions.get(sessionID)?.dossier;

function publier(sessionID: string, suivi: Suivi, type: string, data: Record<string, unknown>, durable = true): void {
  const evenement: EvenementCode = {
    type,
    data: { sessionID, timestamp: Date.now(), ...data },
    ...(durable ? { durable: { seq: ++numero } } : {}),
  };
  suivi.vu = Date.now();
  if (durable) {
    suivi.tampon.push(evenement);
    suivi.octets += JSON.stringify(evenement).length;
    while (suivi.tampon.length > TAMPON_MAX || suivi.octets > OCTETS_MAX) {
      const sorti = suivi.tampon.shift();
      if (!sorti) break;
      suivi.octets -= JSON.stringify(sorti).length;
    }
  }
  for (const auditeur of suivi.auditeurs) {
    try {
      auditeur(evenement);
    } catch {
      /* un client qui décroche ne doit pas priver les autres */
    }
  }
}

/** Message lisible d'une erreur d'OpenCode (`{ name, data: { message } }`). */
function messageDe(erreur: unknown): string {
  const e = erreur as { name?: unknown; message?: unknown; data?: { message?: unknown } } | undefined;
  if (typeof e?.data?.message === "string") return e.data.message.split("\n")[0]!;
  if (typeof e?.message === "string") return e.message.split("\n")[0]!;
  return typeof e?.name === "string" ? e.name : "";
}

interface PartV1 {
  id?: string;
  messageID?: string;
  type?: string;
  text?: string;
  synthetic?: boolean;
  time?: { start?: number; end?: number };
  tool?: string;
  callID?: string;
  reason?: string;
  state?: { status?: string; input?: unknown; output?: unknown; error?: unknown };
}

/**
 * Traduit un évènement de l'ancienne API et le publie aux auditeurs de sa
 * session. Un évènement d'une session que la passerelle n'a pas ouverte est
 * ignoré. `repondre` sert à refuser une question d'OpenCode (voir plus bas).
 * Les formes ont été relevées sur OpenCode 1.18.32 le 25/09/2026 : un tour
 * avec un outil MCP, un modèle inconnu.
 */
export function traduire(brut: { type?: string; properties?: Record<string, unknown> }, repondre?: (chemin: string, corps: unknown) => void): void {
  const p = brut.properties ?? {};
  // Mesuré le 25/09/2026 : chaque évènement d'une session porte `sessionID` à la racine de `properties`.
  const sessionID = typeof p.sessionID === "string" ? p.sessionID : "";
  const suivi = sessionID ? sessions.get(sessionID) : undefined;
  if (!suivi) return;

  switch (brut.type) {
    case "message.updated": {
      const info = p.info as { id?: string; role?: string } | undefined;
      if (info?.role === "user" && typeof info.id === "string" && !suivi.demandes.has(info.id)) {
        suivi.demandes.add(info.id);
        suivi.echecDit = false;
        publier(sessionID, suivi, "session.next.prompted", { messageID: info.id });
      }
      return;
    }
    case "message.part.delta": {
      /*
       * Pas d'évènement fabriqué pour chaque morceau : les clients n'affichent
       * que les textes entiers. Mais ils tiennent tout ce qui arrive pour un
       * signe de vie (guet de silence de 90 s, src/hooks/useCode.ts) : sans ce
       * signal, un long raisonnement de Qwen3 passait pour un agent muet. Au
       * plus un par seconde, sans numéro, jamais rejoué.
       */
      if (Date.now() - suivi.dernierSigne < 1000) return;
      suivi.dernierSigne = Date.now();
      publier(sessionID, suivi, "helix.activite", {}, false);
      return;
    }
    case "message.part.updated": {
      const part = (p.part ?? {}) as PartV1;
      if (!part.messageID || suivi.demandes.has(part.messageID)) return; // le texte de la personne
      const id = part.id ?? "";
      switch (part.type) {
        case "step-start":
          suivi.echecDit = false;
          publier(sessionID, suivi, "session.next.step.started", { assistantMessageID: part.messageID });
          return;
        case "reasoning":
        case "text":
          if (!part.time?.end || suivi.finies.has(id) || part.synthetic || typeof part.text !== "string") return;
          suivi.finies.add(id);
          publier(sessionID, suivi, part.type === "text" ? "session.next.text.ended" : "session.next.reasoning.ended", {
            assistantMessageID: part.messageID,
            text: part.text,
          });
          return;
        case "tool": {
          const appel = part.callID ?? id;
          const etat = part.state ?? {};
          if (etat.status === "pending" || !etat.status) return;
          if (!suivi.appels.has(appel)) {
            suivi.appels.add(appel);
            publier(sessionID, suivi, "session.next.tool.called", {
              assistantMessageID: part.messageID,
              callID: appel,
              tool: part.tool ?? "outil",
              input: (etat.input as Record<string, unknown>) ?? {},
            });
          }
          if ((etat.status === "completed" || etat.status === "error") && !suivi.termines.has(appel)) {
            suivi.termines.add(appel);
            if (etat.status === "completed") {
              publier(sessionID, suivi, "session.next.tool.success", {
                assistantMessageID: part.messageID,
                callID: appel,
                content: [{ type: "text", text: typeof etat.output === "string" ? etat.output : "" }],
                structured: {},
              });
            } else {
              publier(sessionID, suivi, "session.next.tool.failed", {
                assistantMessageID: part.messageID,
                callID: appel,
                error: { message: typeof etat.error === "string" ? etat.error : messageDe(etat.error) },
              });
            }
          }
          return;
        }
        case "step-finish":
          publier(sessionID, suivi, "session.next.step.ended", {
            assistantMessageID: part.messageID,
            finish: part.reason ?? "unknown",
          });
          return;
        case "compaction":
          if (suivi.finies.has(id)) return;
          suivi.finies.add(id);
          publier(sessionID, suivi, "session.next.compaction.started", {});
          return;
      }
      return;
    }
    case "session.status": {
      const statut = p.status as { type?: string; message?: string; attempt?: number } | undefined;
      if (statut?.type === "retry") {
        publier(sessionID, suivi, "session.next.retried", { attempt: statut.attempt, error: { message: statut.message ?? "" } });
      }
      return;
    }
    case "session.error": {
      if (suivi.echecDit) return;
      suivi.echecDit = true;
      const erreur = p.error as { name?: string } | undefined;
      // La réponse coupée par la limite de longueur reste une réponse : les clients le disent comme tel.
      if (erreur?.name === "MessageOutputLengthError") {
        publier(sessionID, suivi, "session.next.step.ended", { finish: "length" });
        return;
      }
      publier(sessionID, suivi, "session.next.step.failed", { error: { message: messageDe(erreur) } });
      return;
    }
    case "permission.asked":
    case "question.asked": {
      /*
       * Jamais de question en attente (même règle que `permission` dans
       * opencode.ts) : aucune ne passe par les clients, la session resterait
       * bloquée. La configuration les refuse déjà ; celles qui passeraient
       * quand même sont refusées ici, et l'agent lit un refus.
       */
      const demande = typeof p.id === "string" ? p.id : "";
      if (!demande || !/^[A-Za-z0-9_-]{1,80}$/.test(demande) || !repondre) return;
      journaliser("outil.refuse", "systeme", { surface: "code", cause: `${brut.type}-refuse`, session: sessionID });
      repondre(
        brut.type === "permission.asked" ? `/permission/${demande}/reply` : `/question/${demande}/reject`,
        brut.type === "permission.asked" ? { reply: "reject" } : {},
      );
      return;
    }
  }
}

/* ------------------------- écoute de /event, par dossier ------------------------ */

/**
 * Écoutes ouvertes, une par serveur OpenCode et par dossier : chacune est
 * prête quand OpenCode a dit « connecté ». Le port fait partie de la clé :
 * OpenCode redémarré (`assurerModele`), l'écoute de l'ancien serveur peut
 * paraître encore ouverte un instant, et un envoi fait sur sa foi perdrait
 * tous ses évènements.
 */
interface Ecoute {
  cle: string;
  prete?: Promise<void>;
}
const ecoutes = new Map<string, Ecoute>();

/**
 * S'assure que la passerelle écoute les évènements d'OpenCode pour ce dossier,
 * et attend que l'écoute soit prête : un envoi fait avant perdrait ses
 * premiers évènements (`/event` ne rejoue rien).
 */
export async function ecouterDossier(dossier: string): Promise<void> {
  if (!(await ensureServer())) throw new Error("OpenCode indisponible.");
  const cle = `${portEnCours()}|${dossier}`;
  const deja = ecoutes.get(cle);
  if (deja?.prete) return deja.prete;
  const ecoute: Ecoute = { cle };
  ecoutes.set(cle, ecoute);
  ecoute.prete = ouvrir(dossier, ecoute);
  ecoute.prete.catch(() => {
    if (ecoutes.get(cle) === ecoute) ecoutes.delete(cle);
  });
  return ecoute.prete;
}

function ouvrir(dossier: string, ecoute: Ecoute): Promise<void> {
  return new Promise<void>((pret, echec) => {
    let amont: http.IncomingMessage | undefined;
    let annonce = false;
    const delai = setTimeout(() => {
      if (annonce) return;
      amont?.destroy();
      echec(new Error("OpenCode n'a pas ouvert son flux d'évènements."));
    }, 10_000);
    fluxEvenements(dossier)
      .then((reponse) => {
        amont = reponse;
        if (reponse.statusCode !== 200) {
          reponse.resume();
          clearTimeout(delai);
          echec(new Error(`Flux d'évènements d'OpenCode : ${reponse.statusCode}`));
          return;
        }
        const d = encodeURIComponent(dossier);
        const repondre = (chemin: string, corps: unknown) =>
          void api(`${chemin}?directory=${d}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corps),
          }).catch(() => {});
        let reste = "";
        reponse.setEncoding("utf8");
        reponse.on("data", (morceau: string) => {
          reste += morceau;
          const blocs = reste.split("\n\n");
          reste = blocs.pop() ?? "";
          for (const bloc of blocs) {
            const donnee = bloc
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("");
            if (!donnee) continue;
            let brut: { type?: string; properties?: Record<string, unknown> };
            try {
              brut = JSON.parse(donnee);
            } catch {
              continue;
            }
            if (!annonce && brut.type === "server.connected") {
              annonce = true;
              clearTimeout(delai);
              pret();
            }
            traduire(brut, repondre);
          }
        });
        let fini = false;
        const fin = () => {
          if (fini) return;
          fini = true;
          clearTimeout(delai);
          const encore = ecoutes.get(ecoute.cle) === ecoute;
          if (encore) ecoutes.delete(ecoute.cle);
          if (!annonce) echec(new Error("Flux d'évènements d'OpenCode fermé."));
          // OpenCode tourne encore (flux coupé, pas arrêté) : on se rebranche sans attendre qu'on le demande.
          else if (encore && enMarche()) setTimeout(() => void ecouterDossier(dossier).catch(() => {}), 1000);
        };
        reponse.on("end", fin);
        reponse.on("error", fin);
        reponse.on("close", fin);
      })
      .catch((err) => {
        clearTimeout(delai);
        echec(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/**
 * Abonne un client au flux traduit d'une session. `apres` : dernier numéro
 * déjà reçu ; absent, tout ce que la passerelle garde de la session est
 * rejoué d'abord, comme le faisait OpenCode (les clients trient par
 * l'identifiant de leur message). Rend de quoi se désabonner.
 */
export function abonner(sessionID: string, apres: number | undefined, auditeur: Auditeur): () => void {
  const suivi = sessions.get(sessionID);
  if (!suivi) return () => {};
  for (const evenement of suivi.tampon) {
    if (apres === undefined || (evenement.durable?.seq ?? 0) > apres) auditeur(evenement);
  }
  suivi.auditeurs.add(auditeur);
  return () => suivi.auditeurs.delete(auditeur);
}
