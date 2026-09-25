import type { Collection } from "./db.ts";

/**
 * Cloisonnement des données, côté instance.
 *
 * Jusqu'ici l'interface décidait seule de ce qu'elle montrait : n'importe quel
 * poste légitime pouvait demander la collection entière et lire les projets,
 * les conversations et les tâches de tous ses collègues. La règle est
 * désormais appliquée ici, à l'endroit qui détient les données.
 *
 * Deux opérations symétriques :
 *  - `filtrer` : ce que la personne a le droit de **voir** ;
 *  - `fusionner` : ce qu'elle a le droit de **modifier**. Les postes envoient
 *    la collection entière ; on ne garde de leur envoi que les enregistrements
 *    qui les concernent, et on conserve les autres tels qu'ils étaient. Sans
 *    cela, un poste pourrait effacer le travail de toute l'entreprise en
 *    poussant une liste vide.
 */

export interface Demandeur {
  userId: string;
  email: string;
  /** Groupes dont la personne est membre (groupes.ts) : ce qu'on leur partage, elle le voit. */
  groupes?: string[];
}

/** La conversation est-elle partagée avec un des groupes de la personne ? */
const partageeAuGroupe = (s: Record<string, unknown>, qui: Demandeur) =>
  Array.isArray(s.sharedGroupIds) && s.sharedGroupIds.some((g) => typeof g === "string" && (qui.groupes ?? []).includes(g));

/** Un objet nu, par opposition à `null`, un tableau ou une valeur scalaire. */
const estEnregistrement = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/*
 * Un poste envoie ce qu'il veut, y compris `[null]` ou `[1, 2]`. Le tableau
 * était pris tel quel, et `String(item.id)` sur `null` faisait échouer la
 * requête en 500 — avec le message d'exception interne renvoyé au client.
 * Ce qui n'est pas un enregistrement n'en devient pas un : on l'écarte ici,
 * une fois, plutôt que de garder chaque règle sur ses gardes.
 */
const tableau = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(estEnregistrement) : [];

/** Sac de profils indexé par personne, ou sac vide si l'envoi n'en est pas un. */
const sacProfils = (value: unknown): Record<string, unknown> =>
  estEnregistrement(value) ? value : {};

const memeEmail = (a: unknown, b: string) =>
  typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* Règles de visibilité                                                */
/* ------------------------------------------------------------------ */

function voitProjet(projet: Record<string, unknown>, qui: Demandeur): boolean {
  if (projet.ownerId === qui.userId) return true;
  const membres = Array.isArray(projet.members) ? projet.members : [];
  return membres.some(
    (m) =>
      (m as { userId?: string }).userId === qui.userId ||
      memeEmail((m as { email?: string }).email, qui.email),
  );
}

/**
 * Exportée pour les images créées dans un Chat (images.ts) : elles se
 * montrent à qui voit le Chat, selon cette même règle et aucune autre.
 */
export function voitConversation(session: Record<string, unknown>, qui: Demandeur): boolean {
  if (session.ownerId === qui.userId) return true;
  const partages = Array.isArray(session.sharedWith) ? session.sharedWith : [];
  if (
    partages.some(
      (p) =>
        (p as { userId?: string }).userId === qui.userId ||
        memeEmail((p as { email?: string }).email, qui.email),
    )
  ) {
    return true;
  }
  if (partageeAuGroupe(session, qui)) return true;
  // Une conversation ouverte à l'organisation est lisible par tous.
  return session.visibility === "organisation";
}

function voitAgent(agent: Record<string, unknown>, qui: Demandeur): boolean {
  return agent.ownerId === qui.userId || agent.visibility === "organisation";
}

/** Une tâche appartient à une personne ; rien ne la partage aujourd'hui. */
const voitTache = (tache: Record<string, unknown>, qui: Demandeur) =>
  tache.ownerId === qui.userId;

/* ------------------------------------------------------------------ */
/* Règles de modification                                              */
/* ------------------------------------------------------------------ */

/*
 * Voir n'est pas modifier. Un agent d'organisation est lisible par tous mais
 * n'appartient qu'à son auteur ; une conversation partagée reste sous la
 * responsabilité de celui qui l'a ouverte.
 */
const modifieProjet = voitProjet; // membre d'un projet : il y travaille
const modifieConversation = (s: Record<string, unknown>, qui: Demandeur) =>
  s.ownerId === qui.userId ||
  partageeAuGroupe(s, qui) ||
  (Array.isArray(s.sharedWith) &&
    s.sharedWith.some(
      (p) =>
        (p as { userId?: string }).userId === qui.userId ||
        memeEmail((p as { email?: string }).email, qui.email),
    ));
const estProprietaire = (item: Record<string, unknown>, qui: Demandeur) =>
  item.ownerId === qui.userId;

/**
 * Ce qu'une personne à qui l'on a partagé une conversation peut y changer :
 * son contenu, pas la liste de ceux qui la voient. Sans cette règle, un
 * invité pouvait l'ouvrir à un autre groupe, ou en retirer les autres
 * invités. Une seule exception : sa **propre** invitation, qu'il accepte en
 * s'y rattachant (`claimSessionShares`, côté poste).
 */
function partageDuProprietaire(
  avant: Record<string, unknown>,
  envoye: Record<string, unknown>,
  qui: Demandeur,
): Record<string, unknown> {
  const concerne = (p: unknown) =>
    (p as { userId?: string }).userId === qui.userId || memeEmail((p as { email?: string }).email, qui.email);
  const anciens = Array.isArray(avant.sharedWith) ? avant.sharedWith : [];
  const nouveaux = Array.isArray(envoye.sharedWith) ? envoye.sharedWith : [];
  const aMoi = anciens.some(concerne);
  const monEntree = nouveaux.find(
    (p) => concerne(p) && estEnregistrement(p) && memeEmail(p.email, String((anciens.find(concerne) as { email?: string } | undefined)?.email ?? "")),
  );
  const partages = anciens.map((p) => (concerne(p) && aMoi && monEntree ? { ...(monEntree as object), userId: qui.userId } : p));
  const { sharedWith: _s, sharedGroupIds: _g, visibility: _v, ...reste } = envoye;
  return {
    ...reste,
    ...(avant.sharedWith !== undefined ? { sharedWith: partages } : {}),
    ...(avant.sharedGroupIds !== undefined ? { sharedGroupIds: avant.sharedGroupIds } : {}),
    ...(avant.visibility !== undefined ? { visibility: avant.visibility } : {}),
  };
}

interface Regle {
  voit: (item: Record<string, unknown>, qui: Demandeur) => boolean;
  modifie: (item: Record<string, unknown>, qui: Demandeur) => boolean;
  /**
   * Supprimer n'est pas modifier : un collaborateur travaille dans un projet
   * partagé, il n'a pas à le faire disparaître pour tout le monde. Ce droit
   * reste au propriétaire.
   */
  supprime: (item: Record<string, unknown>, qui: Demandeur) => boolean;
}

const REGLES: Partial<Record<Collection, Regle>> = {
  projects: { voit: voitProjet, modifie: modifieProjet, supprime: estProprietaire },
  sessions: { voit: voitConversation, modifie: modifieConversation, supprime: estProprietaire },
  agents: { voit: voitAgent, modifie: estProprietaire, supprime: estProprietaire },
  tasks: { voit: voitTache, modifie: estProprietaire, supprime: estProprietaire },
  /*
   * Même règle qu'un agent : lisible par toute l'organisation si son auteur l'a
   * voulu, modifiable par lui seul. Une procédure que chacun pourrait réécrire
   * ne serait plus une procédure.
   */
  competences: { voit: voitAgent, modifie: estProprietaire, supprime: estProprietaire },
};

/** Clé du profil d'une personne, tel que les postes l'envoient. */
const cleProfil = (userId: string) => `profile:${userId}`;

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

/** Ce que `qui` a le droit de voir dans une collection. */
export function filtrer(collection: Collection, valeur: unknown, qui: Demandeur): unknown {
  if (collection === "accounts") return valeur; // déjà expurgé en amont

  if (collection === "profiles") {
    // Le profil porte les instructions et la mémoire personnelles : il ne sort
    // jamais de son propriétaire, même vers un collègue du même projet.
    const sac = sacProfils(valeur);
    const cle = cleProfil(qui.userId);
    return cle in sac ? { [cle]: sac[cle] } : {};
  }

  const regle = REGLES[collection];
  if (!regle) return valeur;
  return tableau(valeur).filter((item) => regle.voit(item, qui));
}

/* ------------------------------------------------------------------ */
/* Écriture                                                            */
/* ------------------------------------------------------------------ */

export interface Fusion {
  valeur: unknown;
  /** Enregistrements refusés, pour la trace : utile au diagnostic et à l'audit. */
  refuses: number;
}

/**
 * Applique l'envoi d'un poste sans lui laisser toucher ce qui ne le regarde pas.
 *
 * - un enregistrement qu'il ne peut pas voir est conservé tel quel ;
 * - un enregistrement qu'il peut modifier prend la valeur qu'il envoie ;
 * - un enregistrement nouveau n'est accepté que s'il lui appartiendrait ;
 * - un enregistrement visible mais absent de l'envoi est considéré supprimé,
 *   à condition qu'il ait eu le droit de le supprimer.
 */
export function fusionner(
  collection: Collection,
  existant: unknown,
  entrant: unknown,
  qui: Demandeur,
): Fusion {
  if (collection === "profiles") {
    const avant = sacProfils(existant);
    const apres = sacProfils(entrant);
    const cle = cleProfil(qui.userId);
    const refuses = Object.keys(apres).filter((k) => k !== cle).length;
    // Seul son propre profil est repris ; ceux des autres restent intacts.
    return {
      valeur: cle in apres ? { ...avant, [cle]: apres[cle] } : avant,
      refuses,
    };
  }

  const regle = REGLES[collection];
  if (!regle) return { valeur: entrant, refuses: 0 };

  const avant = tableau(existant);
  const apres = tableau(entrant);
  const parId = (liste: Record<string, unknown>[]) =>
    new Map(liste.map((item) => [String(item.id), item]));

  const avantParId = parId(avant);
  const apresParId = parId(apres);
  let refuses = 0;

  const resultat: Record<string, unknown>[] = [];

  // 1. Le sort de chaque enregistrement déjà présent.
  for (const item of avant) {
    const id = String(item.id);
    const envoye = apresParId.get(id);

    if (!envoye) {
      // Absent de l'envoi : suppression, réservée au propriétaire. Un poste qui
      // n'a simplement pas encore reçu l'enregistrement ne doit rien effacer.
      if (regle.supprime(item, qui)) continue;
      resultat.push(item);
      continue;
    }

    if (!regle.modifie(item, qui)) {
      resultat.push(item);
      if (JSON.stringify(envoye) !== JSON.stringify(item)) refuses += 1;
      continue;
    }

    /*
     * Un collaborateur peut modifier le contenu, pas se l'approprier :
     * le propriétaire reste celui d'origine, quoi que le poste envoie.
     */
    if (regle.supprime(item, qui)) {
      resultat.push(envoye);
      continue;
    }
    const retouche = collection === "sessions" ? partageDuProprietaire(item, envoye, qui) : envoye;
    resultat.push({ ...retouche, ownerId: item.ownerId });
  }

  // 2. Les nouveaux enregistrements, s'ils lui appartiennent bien.
  for (const item of apres) {
    if (avantParId.has(String(item.id))) continue;
    if (regle.modifie(item, qui)) resultat.push(item);
    else refuses += 1;
  }

  return { valeur: resultat, refuses };
}
