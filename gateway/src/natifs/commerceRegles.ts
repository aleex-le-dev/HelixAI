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
