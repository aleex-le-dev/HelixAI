import { t } from "@/lib/i18n";
/**
 * L'offre d'abonnement : ce qui est vendu, et à quel prix.
 *
 * ── Ce qui est vendu, et ce qui ne l'est pas ────────────────────────────────
 *
 * Le logiciel n'est **pas** vendu. Il est sous licence libre (AGPL-3.0,
 * COPYRIGHT.md) : n'importe qui peut l'installer chez lui, gratuitement, pour
 * toujours, et faire tourner ses propres modèles sur ses propres machines.
 *
 * Ce qui est vendu est le **calcul** : des modèles puissants, hébergés en
 * Europe, accessibles sans acheter de carte graphique ni gérer un serveur.
 * C'est un service, pas une licence, et cette distinction n'est pas un détail
 * de communication : c'est elle qui rend l'abonnement compatible avec un
 * logiciel libre.
 *
 * ── Pourquoi les prix sont ici, en clair ────────────────────────────────────
 *
 * Un tarif vit. Le coût des modèles a baissé de 75 % en un an, et les jetons
 * inclus doivent suivre sans qu'on aille les chercher au milieu d'un écran.
 * Tout est donc réuni ici : le coût de revient, la marge visée, et le calcul
 * qui en découle. Changer un chiffre suffit ; l'écran s'adapte.
 *
 * ── D'où viennent les coûts de revient ──────────────────────────────────────
 *
 * Relevés le 20/09/2026 chez les éditeurs (prix par million de jetons, en
 * dollars) : DeepSeek V4.1-Flash 0,15 à 0,30 en entrée, 0,60 à 1,20 en sortie ;
 * DeepSeek V4-Pro 0,66 à 1,32 et 1,98 à 3,96 ; Mistral Large 3 0,50 et 1,50.
 *
 * Mais ces prix sont ceux des serveurs de l'éditeur, en Chine ou aux
 * États-Unis. L'offre promet un hébergement **en Europe** : les poids ouverts
 * tournent alors sur des cartes louées chez un hébergeur européen, ce qui
 * coûte plus cher et se facture à l'heure de carte graphique, pas au jeton. Les
 * valeurs ci-dessous sont donc des **estimations** converties à l'heure de
 * jeton, marge d'hébergement comprise, à confirmer par un devis réel avant
 * d'ouvrir les formules.
 *
 * ⚠ Rien ici n'est branché à un système de paiement. Cet écran présente une
 * offre ; il n'encaisse rien et ne promet aucune date.
 */

export interface ModeleInclus {
  id: string;
  nom: string;
  /** Poids ouverts : c'est ce qui permet de l'héberger soi-même, en Europe. */
  origine: string;
  /** Où tournent les cartes qui le font tourner. Toujours l'Europe ici. */
  heberge: string;
  /**
   * Coût de revient estimé, en euros par million de jetons, entrée et sortie
   * mélangées dans la proportion observée en conversation (environ trois
   * jetons lus pour un écrit).
   */
  coutParMillion: number;
  role: "rapide" | "expert";
  description: string;
}

/**
 * Deux modèles, et deux seulement.
 *
 * Un catalogue de douze modèles est un catalogue de douze décisions à prendre
 * pour quelqu'un qui veut juste travailler. On en garde un rapide, pour le
 * volume, et un expert, pour ce qui est difficile. Le pays d'hébergement est
 * affiché, comme partout ailleurs dans le produit.
 */
export const MODELES_INCLUS: ModeleInclus[] = [
  {
    id: "rapide",
    nom: t("Modèle rapide"),
    origine: t("poids ouverts (DeepSeek V4.1-Flash ou équivalent)"),
    heberge: t("France"),
    coutParMillion: 0.9,
    role: "rapide",
    description:
      t("Pour le courant : rédiger, résumer, trier, répondre. Rapide, et de loin le moins cher au volume."),
  },
  {
    id: "expert",
    nom: t("Modèle expert"),
    origine: t("poids ouverts (DeepSeek V4-Pro, Mistral Large ou équivalent)"),
    heberge: t("France"),
    coutParMillion: 2.4,
    role: "expert",
    description:
      t("Pour ce qui est difficile : analyse longue, raisonnement en plusieurs étapes, code."),
  },
];

/**
 * Part du prix qui couvre le calcul. Le reste paie l'hébergement, le support
 * et le développement du logiciel — qui reste libre et gratuit pour qui
 * l'installe chez lui.
 *
 * 45 % est une hypothèse de départ, pas une mesure. Elle se règle ici.
 */
export const PART_CALCUL = 0.45;

export interface Formule {
  id: string;
  nom: string;
  /** Prix mensuel en euros, toutes taxes comprises pour un particulier. */
  prix: number;
  pour: string;
  /** Postes couverts : au-delà, c'est la formule au-dessus. */
  postes: number;
  /** Ce que cette formule ajoute et que la précédente n'a pas. */
  enPlus: string[];
}

export const FORMULES: Formule[] = [
  {
    id: "decouverte",
    nom: t("Découverte"),
    prix: 10,
    pour: t("Une personne, quelques heures par semaine"),
    postes: 1,
    enPlus: [t("Modèle rapide"), t("Vos données restent chez vous")],
  },
  {
    id: "quotidien",
    nom: t("Quotidien"),
    prix: 20,
    pour: t("Une personne qui s'en sert tous les jours"),
    postes: 1,
    enPlus: [t("Modèle expert compris"), t("Agents et tâches planifiées")],
  },
  {
    id: "equipe",
    nom: t("Équipe"),
    prix: 100,
    pour: t("Une petite équipe, jusqu'à dix postes"),
    postes: 10,
    enPlus: [
      t("Procédures et agents partagés à toute l'équipe"),
      t("Invitation d'un collègue par lien"),
    ],
  },
  {
    id: "entreprise",
    nom: t("Entreprise"),
    prix: 200,
    pour: t("Une organisation qui travaille en continu"),
    postes: 25,
    enPlus: [t("Support par courrier sous un jour ouvré"), t("Accompagnement à l'installation")],
  },
];

/**
 * Jetons inclus dans une formule, pour un modèle donné.
 *
 * Le calcul est volontairement trivial et visible : le budget de calcul, divisé
 * par le coût du modèle. Arrondi au million inférieur, parce qu'un chiffre
 * rond se retient et qu'arrondir vers le bas ne déçoit personne.
 */
export function jetonsInclus(formule: Formule, modele: ModeleInclus): number {
  const budget = formule.prix * PART_CALCUL;
  return Math.floor(budget / modele.coutParMillion);
}

/**
 * De quoi se représenter un million de jetons.
 *
 * Personne n'achète des jetons : on achète des heures de travail. Les repères
 * ci-dessous viennent de moyennes usuelles — environ 750 mots pour mille
 * jetons, une page dense à 500 mots, et un échange de conversation qui coûte
 * autour de 1 500 jetons une fois la question, le contexte et la réponse
 * comptés.
 */
export const JETONS_PAR_ECHANGE = 1500;
export const MOTS_PAR_MILLION_DE_JETONS = 750_000;
export const MOTS_PAR_PAGE = 500;

export function echangesPour(millions: number): number {
  return Math.round((millions * 1_000_000) / JETONS_PAR_ECHANGE);
}

export function pagesPour(millions: number): number {
  return Math.round((millions * MOTS_PAR_MILLION_DE_JETONS) / MOTS_PAR_PAGE);
}
