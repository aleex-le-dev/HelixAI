import { apiFetch } from "./endpoint";
import { t } from "@/lib/i18n";

/**
 * Consommation mesurée par l'instance, côté interface.
 *
 * Les chiffres viennent tous de la passerelle, qui lit les jetons dans la
 * réponse de chaque moteur. Rien ici ne calcule, n'estime ni ne complète :
 * cet écran affichait autrefois des montants inventés, et c'est précisément ce
 * qu'on ne refait pas.
 */

export type Periode = "jour" | "semaine" | "mois" | "tout";

export const PERIODES: { valeur: Periode; nom: string }[] = [
  { valeur: "jour", nom: t("Aujourd'hui") },
  { valeur: "semaine", nom: t("7 jours") },
  { valeur: "mois", nom: t("30 jours") },
  { valeur: "tout", nom: t("Tout") },
];

export type Cout =
  | { statut: "gratuit" }
  | { statut: "non-renseigne" }
  | { statut: "calcule"; montant: number; estime: boolean };

export interface Compteurs {
  requetes: number;
  entree: number;
  sortie: number;
  raisonnement: number;
  requetesEstimees: number;
}

export interface LigneModele extends Compteurs {
  uid: string;
  backend: string;
  local: boolean;
  cout: Cout;
}

export interface ModeleDistant {
  uid: string;
  backend: string;
  tarif: { entree: number; sortie: number; depuis: string } | null;
}

export interface Rapport {
  periode: Periode;
  du: string;
  au: string;
  totaux: Compteurs & { cout: number; coutEstime: boolean; sansTarif: number };
  modeles: LigneModele[];
  jours: { jour: string; entree: number; sortie: number; requetes: number }[];
  distants: ModeleDistant[];
  conservationJours: number;
}

export async function lireRapport(periode: Periode): Promise<Rapport | null> {
  try {
    const res = await apiFetch(`/helix/usage?periode=${periode}`);
    return res.ok ? ((await res.json()) as Rapport) : null;
  } catch {
    return null;
  }
}

/**
 * Enregistre le tarif d'un modèle distant, en euros par million de jetons.
 * `null` pour les deux prix retire le tarif.
 */
export async function definirTarif(
  modele: string,
  entree: number | null,
  sortie: number | null,
): Promise<{ ok: boolean; raison?: string }> {
  try {
    const res = await apiFetch("/helix/usage/tarif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modele, entree, sortie }),
    });
    const corps = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      raison?: string;
      error?: { message?: string };
    };
    if (res.ok && corps.ok !== false) return { ok: true };
    return { ok: false, raison: corps.raison ?? corps.error?.message ?? t("Tarif refusé.") };
  } catch {
    return { ok: false, raison: "Instance injoignable." };
  }
}

/** Nombre de jetons lisible : 1 234 · 12,3 k · 1,2 M. */
export function jetons(n: number): string {
  if (n < 10_000) return n.toLocaleString("fr-FR");
  if (n < 1_000_000) return `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M`;
}

/** Montant en euros, avec assez de décimales pour les petites sommes. */
export function euros(montant: number): string {
  const decimales = montant > 0 && montant < 1 ? 4 : 2;
  return `${montant.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimales,
  })} €`;
}
