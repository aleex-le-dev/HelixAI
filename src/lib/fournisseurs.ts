import { apiFetch } from "./endpoint";
import { t } from "@/lib/i18n";

/**
 * Clés de fournisseurs de modèles cloud (gateway/src/fournisseurs.ts). La clé
 * part une fois vers l'instance, à l'essai puis à l'ajout, et n'en revient
 * jamais : l'écran n'en voit que les quatre derniers caractères.
 */

export interface Fournisseur {
  id: string;
  nom: string;
  baseUrl: string;
  pays: string;
  cles: string;
  adresseLibre?: boolean;
}

export interface CleModele {
  id: string;
  fournisseur: string;
  nom: string;
  pays: string;
  portee: "moi" | "equipe";
  fin: string;
  modeles: string[];
  estProprietaire: boolean;
  createdAt: string;
}

async function lire<T>(res: Response): Promise<T> {
  const corps = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(corps.error?.message ?? t("L'instance n'a pas répondu."));
  return corps;
}

const poster = (chemin: string, corps: unknown) =>
  apiFetch(chemin, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });

export async function chargerFournisseurs(): Promise<{ catalogue: Fournisseur[]; cles: CleModele[] }> {
  return lire(await apiFetch("/helix/fournisseurs"));
}

export async function essayerCle(fournisseur: string, cle: string, adresse?: string): Promise<string[]> {
  return (await lire<{ modeles: string[] }>(await poster("/helix/fournisseurs/essayer", { fournisseur, cle, adresse })))
    .modeles;
}

export async function ajouterCle(donnees: {
  fournisseur: string;
  cle: string;
  adresse?: string;
  nom?: string;
  pays?: string;
  portee: "moi" | "equipe";
  modeles: string[];
}): Promise<CleModele> {
  return (await lire<{ cle: CleModele }>(await poster("/helix/fournisseurs", donnees))).cle;
}

export async function modifierCle(id: string, changements: { modeles?: string[]; portee?: "moi" | "equipe" }): Promise<void> {
  await lire(await poster(`/helix/fournisseurs/${encodeURIComponent(id)}`, changements));
}

export async function retirerCle(id: string): Promise<void> {
  await lire(await poster(`/helix/fournisseurs/${encodeURIComponent(id)}/supprimer`, {}));
}

/** « Cloud · France », « Cloud · États-Unis », ou rien pour un modèle de la machine. */
export function lieuDuModele(m: { origine?: string; pays?: string }): string | null {
  if (m.origine !== "cle" && m.origine !== "agence") return null;
  return m.pays ? `Cloud · ${m.pays}` : "Cloud";
}
