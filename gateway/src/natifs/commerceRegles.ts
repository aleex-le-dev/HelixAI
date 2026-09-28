/**
 * Commerce et relation client : les noms d'outils que lit la barrière
 * (approbation.ts). Fichier sans aucune dépendance, pour que la barrière puisse
 * les lire à son chargement quel que soit l'ordre des imports (28/09/2026).
 */

export type IdCommerce = "stripe" | "shopify" | "woocommerce" | "salesforce" | "pipedrive" | "zendesk";
export const IDS_COMMERCE: IdCommerce[] = ["stripe", "shopify", "woocommerce", "salesforce", "pipedrive", "zendesk"];
/** Les préfixes d'outils réservés au commerce (outilsNatifs.ts les lit à son chargement). */
export const PREFIXES_COMMERCE: string[] = [...IDS_COMMERCE];

/*
 * Les noms exacts, lus par la barrière (approbation.ts) : les lectures ne
 * demandent rien au niveau « Demander avant de modifier » ; les écritures sont
 * confirmées à chaque fois, à tout niveau. Aucun outil de Stripe, Shopify ni
 * WooCommerce n'écrit.
 */
export const LECTURES_COMMERCE = [
  "stripe__paiements",
  "stripe__clients",
  "stripe__factures",
  "stripe__abonnements",
  "shopify__commandes",
  "shopify__produits",
  "shopify__stocks",
  "woocommerce__commandes",
  "woocommerce__produits",
  "salesforce__contacts",
  "salesforce__affaires",
  "pipedrive__contacts",
  "pipedrive__affaires",
  "zendesk__tickets",
  "zendesk__ticket",
];
export const ECRITURES_COMMERCE = ["salesforce__noter", "pipedrive__noter", "zendesk__repondre"];

/*
 * La phrase de la carte d'accord, ici plutôt que dans commerce.ts : la barrière
 * (approbation.ts) doit rester chargeable seule, sans tirer tout le module (et,
 * par lui, mcp.ts) dans la chaîne d'imports (vu le 28/09/2026, fusion des connecteurs).
 */
/** La phrase de la carte d'accord (approbation.ts). Le texte entier est aussi dans le détail de la carte. */
export function resumeCommerce(outil: string, args: Record<string, unknown>): string | null {
  const extrait = (v: unknown, n = 120) => {
    const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
    return s ? ` « ${s.slice(0, n)}${s.length > n ? " …" : ""} »` : "";
  };
  const court = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, 40) : "?");
  switch (outil) {
    case "stripe__paiements":
    case "stripe__clients":
    case "stripe__factures":
    case "stripe__abonnements":
      return "consulter Stripe, en lecture seule";
    case "shopify__commandes":
    case "shopify__produits":
    case "shopify__stocks":
      return "consulter la boutique Shopify";
    case "woocommerce__commandes":
    case "woocommerce__produits":
      return "consulter la boutique WooCommerce";
    case "salesforce__contacts":
    case "salesforce__affaires":
      return "consulter Salesforce";
    case "pipedrive__contacts":
    case "pipedrive__affaires":
      return "consulter Pipedrive";
    case "zendesk__tickets":
    case "zendesk__ticket":
      return "consulter les tickets Zendesk";
    case "salesforce__noter":
      return `ajouter dans Salesforce, sur la fiche ${court(args.fiche)}, la note${extrait(args.titre, 80)} :${extrait(args.texte)} (une note ajoutée ne se reprend pas ici)`;
    case "pipedrive__noter":
      // Comme l'outil (commerce.ts, `pipedriveNoter`) : `null` et "" ne désignent rien.
      return `ajouter dans Pipedrive, ${args.affaire !== undefined && args.affaire !== null && args.affaire !== "" ? `sur l'affaire ${court(args.affaire)}` : `sur la personne ${court(args.personne)}`}, la note${extrait(args.texte)} (une note ajoutée ne se reprend pas ici)`;
    case "zendesk__repondre":
      return args.publique === true
        ? `répondre au client sur le ticket Zendesk n° ${court(args.ticket)}, par une réponse publique que Zendesk lui enverra :${extrait(args.texte)} (une réponse envoyée ne se reprend pas)`
        : `ajouter une note interne au ticket Zendesk n° ${court(args.ticket)} :${extrait(args.texte)}`;
  }
  return null;
}
