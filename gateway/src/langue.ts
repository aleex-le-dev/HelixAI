import { AsyncLocalStorage } from "node:async_hooks";
import en from "../i18n/en.json" with { type: "json" };
import zh from "../i18n/zh.json" with { type: "json" };
import ja from "../i18n/ja.json" with { type: "json" };

/**
 * Traduction des messages écrits par la passerelle.
 *
 * ── Le problème ─────────────────────────────────────────────────────────────
 *
 * L'interface se traduit entièrement (`src/lib/i18n.ts`), mais une part de ce
 * qui s'affiche ne vient pas d'elle : « L'adresse CalDAV n'est pas une URL
 * valide », « Agenda connecté en lecture seule : 3 calendrier(s) », les étapes
 * d'une installation. Ces phrases-là sont écrites ici, et arrivaient en
 * français au milieu d'un écran anglais ou chinois.
 *
 * ── Le choix : la langue voyage avec la requête ─────────────────────────────
 *
 * La passerelle sert plusieurs postes à la fois, qui peuvent lire dans quatre
 * langues différentes. Une langue « de l'instance » serait donc fausse pour
 * quelqu'un. Chaque requête porte la sienne (`X-Helix-Langue`, posé par
 * `authHeaders()` côté écran), et `AsyncLocalStorage` la rend lisible depuis
 * n'importe quelle profondeur d'appel sans la passer en paramètre à trois cents
 * endroits. C'est du Node standard : la passerelle reste sans dépendance.
 *
 * Hors requête — démarrage, tâches planifiées, journal — il n'y a personne à
 * qui parler : la phrase reste en français, sa langue source.
 *
 * ── La clé est la phrase française ──────────────────────────────────────────
 *
 * Comme côté écran. Un message sans traduction s'affiche donc en français : le
 * pire cas est une phrase non traduite, jamais une phrase absente.
 */

// Le japonais depuis le 28/09/2026, demandé par Medhi.
export type Langue = "fr" | "en" | "zh" | "ja";

const CATALOGUES: Record<Exclude<Langue, "fr">, Record<string, string>> = {
  en: en as Record<string, string>,
  zh: zh as Record<string, string>,
  ja: ja as Record<string, string>,
};

const contexte = new AsyncLocalStorage<Langue>();

function normaliser(brut: string | undefined): Langue {
  const base = (brut ?? "").trim().toLowerCase().split(/[-_,;]/)[0];
  // Langue inconnue ou absente : l'anglais, langue de base du produit (27/09/2026, décidé par Medhi).
  return base === "en" || base === "zh" || base === "fr" || base === "ja" ? (base as Langue) : "en";
}

/**
 * Exécute le traitement d'une requête en retenant la langue de son auteur.
 * Posé une seule fois, à l'entrée du serveur : une route ajoutée plus tard en
 * hérite sans rien avoir à faire.
 */
export function avecLangueDe<T>(
  entetes: Record<string, string | string[] | undefined>,
  adresse: URL,
  travail: () => T,
): T {
  const entete = entetes["x-helix-langue"];
  const brut =
    (Array.isArray(entete) ? entete[0] : entete) ??
    // Les flux d'évènements du navigateur ne portent pas d'en-tête.
    adresse.searchParams.get("langue") ??
    undefined;
  return contexte.run(normaliser(brut ?? undefined), travail);
}

/** La langue de la requête en cours, anglais hors requête (langue de base du produit). */
export function langue(): Langue {
  return contexte.getStore() ?? "en";
}

/** Traduit une phrase française. Sans traduction, la rend telle quelle. */
export function t(fr: string): string {
  const courante = langue();
  if (courante === "fr") return fr;
  return CATALOGUES[courante][fr] ?? fr;
}

/**
 * Traduit une phrase à trous : `tf("{0} calendrier(s) accessible(s).", 3)`.
 *
 * Les valeurs sont insérées **après** la traduction, pour que chaque langue
 * place ses morceaux dans son propre ordre. Un trou sans valeur reste tel
 * quel : mieux vaut voir `{1}` que perdre le reste de la phrase.
 */
export function tf(modele: string, ...valeurs: unknown[]): string {
  return t(modele).replace(/\{(\d+)\}/g, (brut, index: string) => {
    const valeur = valeurs[Number(index)];
    return valeur === undefined ? brut : String(valeur);
  });
}
