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
 * logiciel libre. La plateforme entière est comprise dans chaque formule parce
 * qu'elle est déjà gratuite : l'abonnement n'en débloque rien, il ajoute les
 * modèles hébergés.
 *
 * ── Pourquoi les prix sont ici, en clair ────────────────────────────────────
 *
 * Un tarif vit. Le coût des modèles a baissé de 75 % en un an, et les jetons
 * inclus doivent suivre sans qu'on aille les chercher au milieu d'un écran.
 * Tout est donc réuni ici : le coût de revient, la part du prix qui paie le
 * calcul, les frais de paiement, et le calcul qui en découle. Changer un
 * chiffre suffit ; l'écran s'adapte, et `npm run securite` (§ 38) refait les
 * comptes.
 *
 * ── La grille (décision de Medhi, 29/09/2026, PROJET.md) ────────────────────
 *
 * Elle se place palier par palier en face de ChatGPT et de Claude, moins cher
 * à chaque marche, avec la plateforme complète en plus. En face (prix publics
 * donnés dans la décision du 29/09/2026, en dollars par mois, **non affichés**
 * à l'écran : ils changent sans prévenir et ne sont pas les nôtres à tenir à
 * jour) :
 *  - Découverte 4,99 € : ChatGPT Go, 8 $ ;
 *  - Plus 12,99 € : ChatGPT Plus et Claude Pro, 20 $ ;
 *  - Pro 49,99 € : ChatGPT Pro et Claude Max, 100 $ ;
 *  - Max 99,99 € : ChatGPT Pro et Claude Max, 200 $ ;
 *  - Équipe 14,99 € HT par poste : ChatGPT Business et Claude Team, 25 $ ;
 *  - Équipe Premium 69,99 € HT par poste : les mêmes en premium, 125 $.
 *
 * ── D'où viennent les coûts de revient ──────────────────────────────────────
 *
 * Choix refait le 30/09/2026, à la demande de Medhi, d'après le marché du
 * jour (Artificial Analysis, indice d'intelligence) : les trois modèles du
 * 29/09 étaient dépassés (Mistral Small autour de 11, DeepSeek V4 Flash 34,
 * Qwen3.5 397B 18 : l'« expert » valait moins que le « polyvalent », plus
 * cher). Décision : « hébergé en Europe suffit », « le meilleur rapport
 * qualité-prix », et « je ne dois surtout pas payer pour les clients ».
 *
 * Relevés le 30/09/2026 chez les hébergeurs qui annoncent une infrastructure
 * en Europe (TensorX, Lyceum Technology, sference ; pages publiques et
 * comparateur Requesty), en dollars par million de jetons, entrée puis sortie,
 * en retenant le plus cher des trois :
 *  - GLM-5.3 Flash (Z.ai, MIT, indice 42) : 0,20 et 0,60 ;
 *  - DeepSeek V4.1 Flash (poids ouverts, indice 39, 209 jetons par seconde) :
 *    0,50 et 1,50.
 * Le dollar est compté pour un euro (il vaut moins : l'écart est une marge).
 * Pas d'« expert » aujourd'hui : le meilleur modèle ouvert, MiMo-V2.6-Pro
 * (Xiaomi, MIT, indice 46, 0,43 et 0,87 $), n'est encore hébergé par personne
 * en Europe ; GLM-5.3 (indice 45) y est, mais neuf fois plus cher que sa
 * version Flash pour trois points, et sous une licence qui n'est pas MIT. Le
 * rôle « expert » reste dans le code : il suffit d'ajouter le modèle ici.
 * Ce sont des prix au jeton, pas une location de cartes : le coût suit
 * l'usage réel, et une formule peu servie ne coûte presque rien. Le cache
 * n'est pas compté : le calcul reste du côté prudent.
 *
 * Avant d'ouvrir les formules : le pays du centre de données et le contrat de
 * traitement des données de l'hébergeur retenu sont à obtenir par écrit
 * (PROJET.md) ; l'écran dit « Europe », ce que ces hébergeurs annoncent.
 *
 * ⚠ Rien ici n'est branché à un système de paiement. Cet écran présente une
 * offre ; il n'encaisse rien et ne promet aucune date.
 */

/* ── Les modèles hébergés ─────────────────────────────────────────────────── */

export type RoleModele = "rapide" | "polyvalent" | "expert";

export interface ModeleInclus {
  id: RoleModele;
  /** Le nom à l'écran : le rôle, parce que c'est lui qu'on choisit. */
  nom: string;
  /** Le modèle réel derrière le rôle, à poids ouverts. */
  modele: string;
  /** Où tournent les cartes qui le font tourner. */
  heberge: string;
  /** Prix de l'hébergeur par million de jetons lus (en dollars, comptés pour des euros). */
  entree: number;
  /** Prix de l'hébergeur par million de jetons écrits (réflexion comprise). */
  sortie: number;
  description: string;
}

/**
 * Deux jetons lus pour un écrit, pour les **estimations** affichées : ces
 * modèles réfléchissent avant de répondre, et leur réflexion se paie au prix
 * des jetons écrits, deux à trois fois plus chers que les jetons lus. (Trois
 * pour un jusqu'au 29/09/2026 : trop optimiste pour des modèles qui
 * raisonnent.)
 */
export const LUS_PAR_ECRIT = 2;

/**
 * Marge de sécurité sur le prix de l'hébergeur : le crédit se consomme au
 * prix relevé **plus 15 %**. Elle absorbe une hausse de tarif, le change, et
 * les arrondis de facturation de l'hébergeur : quand un abonné a vidé son
 * crédit, il a coûté moins que ce crédit.
 */
export const MARGE_SECURITE = 0.15;

/**
 * Deux modèles aujourd'hui, pas douze.
 *
 * Un catalogue de douze modèles est un catalogue de douze décisions à prendre
 * pour quelqu'un qui veut juste travailler. On garde le meilleur rapport
 * qualité-prix hébergé en Europe, pour tout, et le plus rapide, pour qui ne
 * veut pas attendre. Tous sont à poids ouverts ; la région d'hébergement est
 * affichée, comme partout dans le produit. Le premier de la liste est le
 * moins cher : c'est lui qui vaut « crédit ×1 ».
 */
export const MODELES_INCLUS: ModeleInclus[] = [
  {
    id: "polyvalent",
    nom: t("Polyvalent"),
    modele: "GLM-5.3 Flash",
    heberge: t("Europe"),
    entree: 0.2,
    sortie: 0.6,
    description: t("Pour tout : rédiger, analyser des documents longs, agents, tâches de Code. Le meilleur rapport qualité-prix, et le plus économe : c'est lui qui donne le plus de jetons."),
  },
  {
    id: "rapide",
    nom: t("Rapide"),
    modele: "DeepSeek V4.1 Flash",
    heberge: t("Europe"),
    entree: 0.5,
    sortie: 1.5,
    description: t("Pour ne pas attendre : il écrit nettement plus vite. À prendre quand la vitesse compte plus que le volume."),
  },
];

/**
 * Ce que coûte **réellement** un usage, en euros de crédit : les jetons lus
 * et les jetons écrits, chacun à son prix, plus la marge de sécurité. C'est
 * ainsi que le crédit doit se décompter le jour où les formules ouvrent (au
 * relais, sur les compteurs de jetons que rend l'hébergeur), et pas en
 * millions de jetons : un abonné qui fait surtout écrire le modèle coûte
 * jusqu'à deux fois plus par jeton qu'un abonné qui lui fait surtout lire, et
 * un plafond en jetons laisserait l'écart à la charge de la maison. Compté
 * ainsi, le pire cas est connu d'avance : le crédit, jamais plus.
 */
export function coutReel(modele: ModeleInclus, jetonsLus: number, jetonsEcrits: number): number {
  return ((jetonsLus * modele.entree + jetonsEcrits * modele.sortie) / 1_000_000) * (1 + MARGE_SECURITE);
}

/**
 * Coût d'un million de jetons de Chat, pour les **estimations** de l'écran :
 * entrée et sortie mélangées (deux lus pour un écrit), marge comprise. Environ
 * 0,38 € en polyvalent, 0,96 € en rapide.
 */
export function coutParMillion(modele: ModeleInclus): number {
  return coutReel(modele, (LUS_PAR_ECRIT * 1_000_000) / (LUS_PAR_ECRIT + 1), 1_000_000 / (LUS_PAR_ECRIT + 1));
}

/**
 * Ce qu'un modèle consomme du crédit, rapporté au moins cher : ×1, ×2,5.
 * C'est ce qu'on affiche plutôt que des prix au jeton, qu'aucun abonné n'a à
 * retenir.
 */
export function facteur(modele: ModeleInclus): number {
  const base = MODELES_INCLUS.reduce((a, b) => (coutParMillion(b) < coutParMillion(a) ? b : a), modele);
  return coutParMillion(modele) / coutParMillion(base);
}

/* ── Les règles du calcul ─────────────────────────────────────────────────── */

/** TVA française, appliquée aux particuliers (prix affichés TTC). */
export const TVA = 0.2;

/**
 * Frais de paiement estimés, sur le montant TTC réellement payé : une carte
 * de l'Union européenne chez Stripe (1,5 % + 0,25 € par paiement), plus
 * Stripe Billing pour l'abonnement (0,7 %). Tarifs retenus dans la décision
 * du 29/09/2026 ; rien n'est branché, c'est une estimation pour que le crédit
 * ne soit pas calculé sur de l'argent qu'on ne touche pas.
 */
export const FRAIS_PAIEMENT = { partCarte: 0.015, fixe: 0.25, partFacturation: 0.007 };

/**
 * Part du net qui paie le calcul. Le reste paie l'hébergement de la
 * passerelle, le support, et le développement du logiciel, qui reste libre et
 * gratuit pour qui l'installe chez lui.
 *
 * Corrigé le 29/09/2026 : l'ancien calcul prenait 45 % du prix **TTC**, TVA et
 * frais de paiement compris, c'est-à-dire de l'argent qui n'arrive jamais. On
 * part désormais du net (HT, moins les frais), et on en prend 60 %.
 */
export const PART_CALCUL = 0.6;

/**
 * Rabais de lancement : −30 % sur le mensuel, pendant les six premiers mois
 * de l'abonnement. Il ne réduit **pas** le crédit, calculé sur le prix
 * normal : vérifié le 29/09/2026 (et à chaque `npm run securite`), même si
 * tout le monde vidait son crédit, aucune formule ne perd d'argent à −30 %.
 * À −40 %, Découverte en perdrait. `actif: false` le coupe partout.
 */
export const LANCEMENT = { actif: true, taux: 0.3, mois: 6 };

/**
 * Annuel : deux mois offerts (dix fois le mensuel normal, arrondi en ,99).
 * Le rabais de lancement ne s'y ajoute pas : il ne vaut que pour le mensuel,
 * pour que la grille reste simple à lire.
 */
export const MOIS_PAYES_PAR_AN = 10;

/* ── Les formules ─────────────────────────────────────────────────────────── */

export type Public = "particulier" | "entreprise";

export interface Formule {
  id: string;
  nom: string;
  public: Public;
  /**
   * Prix mensuel normal, en euros : TTC pour un particulier, HT et par poste
   * pour une entreprise.
   */
  prix: number;
  pour: string;
  /** Les modèles hébergés auxquels la formule donne accès. */
  modeles: RoleModele[];
  /** Postes au minimum (les entreprises paient par poste). */
  postesMin: number;
}

const TOUS: RoleModele[] = ["polyvalent", "rapide"];

export const FORMULES: Formule[] = [
  {
    id: "decouverte",
    nom: t("Découverte"),
    public: "particulier",
    prix: 4.99,
    pour: t("Pour essayer, quelques fois par semaine"),
    modeles: ["polyvalent"],
    postesMin: 1,
  },
  {
    id: "plus",
    nom: t("Plus"),
    public: "particulier",
    prix: 12.99,
    pour: t("Pour s'en servir tous les jours"),
    modeles: TOUS,
    postesMin: 1,
  },
  {
    id: "pro",
    nom: t("Pro"),
    public: "particulier",
    prix: 49.99,
    pour: t("Pour un usage intensif : agents, Code, documents longs"),
    modeles: TOUS,
    postesMin: 1,
  },
  {
    id: "max",
    nom: t("Max"),
    public: "particulier",
    prix: 99.99,
    pour: t("Pour qui fait travailler les modèles toute la journée"),
    modeles: TOUS,
    postesMin: 1,
  },
  {
    id: "equipe",
    nom: t("Équipe"),
    public: "entreprise",
    prix: 14.99,
    pour: t("Pour une équipe qui s'en sert au quotidien"),
    modeles: TOUS,
    postesMin: 2,
  },
  {
    id: "equipe-premium",
    nom: t("Équipe Premium"),
    public: "entreprise",
    prix: 69.99,
    pour: t("Pour une équipe qui fait tourner agents et Code en continu"),
    modeles: TOUS,
    postesMin: 2,
  },
];

/**
 * La formule Entreprise, sur devis : pas de prix affiché. Un abonnement par
 * poste, plus la consommation réelle facturée au coût de l'hébergeur majoré
 * de `majoration`, l'installation sur les serveurs du client,
 * l'accompagnement et un support garanti.
 */
export const SUR_DEVIS = {
  id: "entreprise",
  nom: t("Entreprise"),
  majoration: 0.3,
};

/* ── Le calcul ────────────────────────────────────────────────────────────── */

/** Arrondi au centime, pour que 4,99 × 100 ne vaille pas 499,000…01. */
const centimes = (euros: number) => Math.round(euros * 100);

/** Montant réellement payé, TTC. */
export function montantTTC(formule: Formule, montant: number): number {
  return formule.public === "particulier" ? montant : montant * (1 + TVA);
}

/** Montant hors taxes, celui qui reste une fois la TVA reversée. */
export function montantHT(formule: Formule, montant: number): number {
  return formule.public === "particulier" ? montant / (1 + TVA) : montant;
}

/** Frais de paiement estimés sur un paiement (voir FRAIS_PAIEMENT). */
export function fraisPaiement(ttc: number): number {
  return ttc * (FRAIS_PAIEMENT.partCarte + FRAIS_PAIEMENT.partFacturation) + FRAIS_PAIEMENT.fixe;
}

/** Ce qui arrive vraiment d'un paiement : HT, moins les frais. */
export function net(formule: Formule, montant: number): number {
  return montantHT(formule, montant) - fraisPaiement(montantTTC(formule, montant));
}

/**
 * Crédit de calcul du mois, en euros (par poste pour une entreprise, mis en
 * commun dans l'équipe) : 60 % du net du **prix normal**, rabais ou pas.
 */
export function creditMensuel(formule: Formule): number {
  return PART_CALCUL * net(formule, formule.prix);
}

/**
 * Millions de jetons que le crédit du mois paie sur un modèle donné, **en
 * estimation** (`coutParMillion` : deux lus pour un écrit). Un seul crédit,
 * en euros, que chaque modèle consomme à son tarif réel (`coutReel`) : ces
 * nombres ne s'additionnent pas, ce sont plusieurs façons de dépenser la même
 * chose. L'écran arrondit vers le bas (`arrondiBas`) et dit « environ ».
 */
export function jetonsInclus(formule: Formule, modele: ModeleInclus): number {
  return creditMensuel(formule) / coutParMillion(modele);
}

/**
 * Arrondi au dixième inférieur : un chiffre arrondi vers le bas ne déçoit
 * personne. (Les chiffres de la décision du 29/09/2026 étaient arrondis au
 * plus proche : 30,9 M y devient 30,8 M ici, jamais plus que ce qui est payé.)
 */
export function arrondiBas(millions: number): number {
  return Math.floor(millions * 10 + 1e-9) / 10;
}

/**
 * Prix de lancement : le prix normal moins `LANCEMENT.taux`, ramené au
 * montant en ,49 ou ,99 juste en dessous (12,99 € donne 9,09 €, affiché
 * 8,99 €). Le prix normal si le rabais est coupé.
 */
export function prixLancement(formule: Formule): number {
  if (!LANCEMENT.actif) return formule.prix;
  const plafond = Math.floor(centimes(formule.prix) * (1 - LANCEMENT.taux) + 1e-6);
  return (Math.floor((plafond - 49) / 50) * 50 + 49) / 100;
}

/** Prix annuel : dix mois du prix normal, arrondi en ,99 au-dessus. */
export function prixAnnuel(formule: Formule): number {
  const dix = centimes(formule.prix) * MOIS_PAYES_PAR_AN;
  return (Math.floor(dix / 100) * 100 + 99) / 100;
}

/**
 * Ce qui reste au pire, pour un mois payé `montant`, si l'abonné dépense tout
 * son crédit. Doit rester positif pour chaque formule, au prix de lancement
 * comme au prix normal (contrôlé par `npm run securite`). Le crédit étant en
 * euros et décompté au coût réel plus la marge, ce reste ne dépend pas de la
 * façon dont l'abonné se sert des modèles ; l'hébergeur, lui, aura facturé le
 * crédit divisé par (1 + MARGE_SECURITE).
 */
export function resteAuPireCas(formule: Formule, montant: number): number {
  return net(formule, montant) - creditMensuel(formule);
}

/* ── Se représenter des millions de jetons ────────────────────────────────── */

/**
 * Personne n'achète des jetons : on achète du travail. Deux repères, qui sont
 * des estimations et se disent « environ » à l'écran :
 *  - un échange de Chat ≈ 3 000 jetons, question, historique et réponse
 *    comptés (1 500 avant le 29/09/2026, ce qui oubliait l'historique qui se
 *    relit à chaque message) ;
 *  - une tâche d'agent ou de Code ≈ 150 000 jetons : l'agent relit les
 *    fichiers et ses propres étapes à chaque tour.
 */
export const JETONS_PAR_ECHANGE = 3000;
export const JETONS_PAR_TACHE = 150_000;
export const JOURS_PAR_MOIS = 30;

export function echangesParJour(millions: number): number {
  return Math.floor((millions * 1_000_000) / JETONS_PAR_ECHANGE / JOURS_PAR_MOIS);
}

export function tachesParMois(millions: number): number {
  return Math.floor((millions * 1_000_000) / JETONS_PAR_TACHE);
}
