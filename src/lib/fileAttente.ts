/**
 * File d'attente des messages d'un Chat (29/09/2026).
 *
 * Demandé par Medhi : « il y a des gens impatients : ça évite que le message
 * se coupe pendant une réponse ». Avant, pendant qu'une réponse s'écrivait,
 * Entrée ne faisait rien et le bouton d'envoi devenait « Arrêter » à la même
 * place : la personne qui avait écrit la suite et cliquait là où elle clique
 * toujours coupait la réponse, et son message restait dans le champ.
 *
 * Maintenant, un message envoyé pendant une réponse entre dans la file de son
 * Chat. À la fin **normale** de la réponse, le premier part seul, puis le
 * suivant à la fin de la sienne. Une réponse qui échoue ou que la personne
 * arrête met la file en pause : on n'enchaîne pas des messages sur une erreur,
 * et « Arrêter » veut dire « attendez ». La file repart par « Envoyer
 * maintenant » (ou « Reprendre » si une autre réponse s'écrit déjà).
 *
 * Ce module ne fait que tenir les files, sans React, sans réseau, sans
 * stockage : il s'essaie tel quel sous Node (scripts/securite.mjs, section
 * 40). C'est `useChat` qui envoie ce qu'il rend. Les files vivent en mémoire,
 * par Chat, et ne sont ni enregistrées ni synchronisées : elles sont propres
 * à ce poste et à cette page. Une page rechargée les perd, comme elle coupe
 * déjà la réponse en cours ; c'est voulu, la déconnexion recharge la page, et
 * une file gardée au-delà serait vue (et envoyée) par la personne suivante.
 */

/** Au-delà, on dit que la file est pleine plutôt que d'empiler sans fin. */
export const LIMITE_FILE = 10;

/** Comment s'est finie la réponse dont la file attendait la fin. */
export type IssueReponse = "terminee" | "erreur" | "arretee";

export interface MessageEnFile<T> {
  id: string;
  contenu: T;
  /** En cours de modification à l'écran : il ne part pas tant que la personne n'a pas fini. */
  enEdition?: boolean;
}

export interface EtatFile<T> {
  messages: readonly MessageEnFile<T>[];
  /**
   * La file ne part plus seule : la dernière réponse a échoué (« erreur ») ou
   * la personne l'a arrêtée (« arret »). `null` : elle part à la fin normale
   * de la réponse en cours.
   */
  pause: null | "erreur" | "arret";
  /**
   * La réponse s'est finie pendant que le premier message était modifié : il
   * part dès que la modification est finie, s'il n'y a rien en cours.
   */
  departRetenu: boolean;
}

export type Ajout = { ok: true; id: string } | { ok: false; raison: "pleine" };

export function creerFiles<T>(reglages: { limite?: number; identifiant?: () => string } = {}) {
  const limite = reglages.limite ?? LIMITE_FILE;
  let compteur = 0;
  const identifiant = reglages.identifiant ?? (() => `f${Date.now().toString(36)}${(compteur++).toString(36)}`);
  /*
   * Un état figé par Chat, remplacé à chaque changement : l'écran le lit par
   * `useSyncExternalStore`, qui compare les références.
   */
  const files = new Map<string, EtatFile<T>>();
  const abonnes = new Set<() => void>();
  const VIDE: EtatFile<T> = Object.freeze({ messages: Object.freeze([]) as readonly MessageEnFile<T>[], pause: null, departRetenu: false });

  const lire = (cle: string | null | undefined): EtatFile<T> => (cle ? (files.get(cle) ?? VIDE) : VIDE);

  const ecrire = (cle: string, etat: EtatFile<T>) => {
    // Une file vide n'a plus rien à retenir : ni pause, ni départ.
    if (etat.messages.length === 0) files.delete(cle);
    else files.set(cle, etat);
    for (const f of [...abonnes]) f();
  };

  /** Retire le premier message s'il peut partir ; sinon retient le départ (il est en cours de modification). */
  const depart = (cle: string, etat: EtatFile<T>): MessageEnFile<T> | null => {
    const premier = etat.messages[0];
    if (!premier) return null;
    if (premier.enEdition) {
      ecrire(cle, { ...etat, departRetenu: true });
      return null;
    }
    ecrire(cle, { messages: etat.messages.slice(1), pause: null, departRetenu: false });
    return { ...premier, enEdition: false };
  };

  return {
    lire,
    /** Les Chats qui ont une file, pour oublier celles des Chats supprimés. */
    cles: (): string[] => [...files.keys()],

    ajouter(cle: string, contenu: T): Ajout {
      const etat = lire(cle);
      if (etat.messages.length >= limite) return { ok: false, raison: "pleine" };
      const id = identifiant();
      ecrire(cle, { ...etat, messages: [...etat.messages, { id, contenu }] });
      return { ok: true, id };
    },

    /** Remplace le contenu d'un message en attente (« Modifier »). */
    modifier(cle: string, id: string, contenu: T): boolean {
      const etat = lire(cle);
      if (!etat.messages.some((m) => m.id === id)) return false;
      ecrire(cle, { ...etat, messages: etat.messages.map((m) => (m.id === id ? { ...m, contenu } : m)) });
      return true;
    },

    retirer(cle: string, id: string): void {
      const etat = lire(cle);
      if (!etat.messages.some((m) => m.id === id)) return;
      ecrire(cle, { ...etat, messages: etat.messages.filter((m) => m.id !== id) });
    },

    /** Le message passe en modification : il ne partira pas avant la fin de celle-ci. */
    commencerEdition(cle: string, id: string): void {
      const etat = lire(cle);
      if (!etat.messages.some((m) => m.id === id)) return;
      ecrire(cle, { ...etat, messages: etat.messages.map((m) => (m.id === id ? { ...m, enEdition: true } : m)) });
    },

    /**
     * Fin de la modification (enregistrée ou non). Si la réponse s'est finie
     * entre-temps et que rien d'autre ne s'écrit (`occupe` faux), le premier
     * message est rendu : c'est à l'appelant de l'envoyer.
     */
    finirEdition(cle: string, id: string, contenu: T | undefined, occupe: boolean): MessageEnFile<T> | null {
      const etat = lire(cle);
      if (!etat.messages.some((m) => m.id === id)) return null;
      const suite: EtatFile<T> = {
        ...etat,
        messages: etat.messages.map((m) => (m.id === id ? { id: m.id, contenu: contenu ?? m.contenu } : m)),
      };
      ecrire(cle, suite);
      if (!suite.departRetenu || occupe || suite.pause) return null;
      return depart(cle, suite);
    },

    /**
     * La réponse du Chat s'est finie. Finie normalement, et la file sans
     * pause : le premier message est rendu (retiré de la file), à envoyer.
     * Échouée ou arrêtée : la file se met en pause et rien n'est rendu.
     */
    apresReponse(cle: string, issue: IssueReponse): MessageEnFile<T> | null {
      const etat = lire(cle);
      if (etat.messages.length === 0) return null;
      if (issue !== "terminee") {
        ecrire(cle, { ...etat, pause: issue === "erreur" ? "erreur" : "arret", departRetenu: false });
        return null;
      }
      if (etat.pause) return null;
      return depart(cle, etat);
    },

    /**
     * « Envoyer maintenant » ou « Reprendre » : la pause est levée. Rien ne
     * s'écrit (`occupe` faux) : le premier message est rendu, à envoyer. Une
     * réponse s'écrit déjà : il partira à sa fin.
     */
    reprendre(cle: string, occupe: boolean): MessageEnFile<T> | null {
      const etat = lire(cle);
      if (etat.messages.length === 0) return null;
      const suite: EtatFile<T> = { ...etat, pause: null };
      if (occupe) {
        ecrire(cle, suite);
        return null;
      }
      return depart(cle, suite);
    },

    /** Le Chat est supprimé : sa file part avec lui. */
    oublier(cle: string): void {
      if (files.has(cle)) ecrire(cle, VIDE);
    },

    abonner(f: () => void): () => void {
      abonnes.add(f);
      return () => {
        abonnes.delete(f);
      };
    },
  };
}

export type Files<T> = ReturnType<typeof creerFiles<T>>;
