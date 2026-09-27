import { apiFetch } from "./endpoint";
import { t, tf } from "@/lib/i18n";

/**
 * Google Sheets, Google Slides, YouTube, LinkedIn, Facebook, Instagram et
 * TikTok (gateway/src/oauthNatif.ts). Aucun jeton ni secret ne revient par
 * ici : le secret d'une application part une fois, à l'enregistrement, et
 * l'instance le garde chiffré.
 */

export type IdNatif = "sheets" | "slides" | "youtube" | "linkedin" | "facebook" | "instagram" | "tiktok";
export type IdChoix = "ecriture" | "page";

export interface EtatNatif {
  id: IdNatif;
  nom: string;
  google: boolean;
  application: { disponible: boolean; identifiant?: string; avecSecret?: boolean; source?: "google" | "ecran" };
  choix: { id: IdChoix; portees: string[]; revue: boolean }[];
  lecture: string[];
  retour: string;
  configure: boolean;
  compte?: string;
  accordes?: IdChoix[];
  depuis?: string;
  expireLe?: string;
  aReconnecter: boolean;
  attente: boolean;
  issue?: { ok: boolean; message: string; quand: string };
  documentation: string[];
}

export interface EtatNatifs {
  services: EtatNatif[];
  administrateur: boolean;
}

export interface ResultatNatif {
  ok: boolean;
  message: string;
  url?: string;
  etat?: EtatNatifs;
}

export async function etatNatifs(): Promise<EtatNatifs | null> {
  try {
    const res = await apiFetch("/helix/natifs");
    if (!res.ok) return null;
    return (await res.json()) as EtatNatifs;
  } catch {
    return null;
  }
}

async function poster(suite: string, corps: Record<string, unknown>): Promise<ResultatNatif> {
  try {
    const res = await apiFetch(`/helix/natifs${suite}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    const json = (await res.json().catch(() => ({}))) as Partial<ResultatNatif> & Partial<EtatNatifs> & { error?: { message?: string } };
    if (json.error?.message) return { ok: false, message: json.error.message };
    return {
      ok: json.ok === true,
      message: json.message ?? tf("La demande a échoué ({0}).", res.status),
      url: typeof json.url === "string" ? json.url : undefined,
      etat: Array.isArray(json.services) ? { services: json.services, administrateur: json.administrateur === true } : undefined,
    };
  } catch {
    return { ok: false, message: t("L'instance n'a pas répondu. Vérifiez qu'elle est démarrée, puis recommencez.") };
  }
}

export const enregistrerApplication = (service: IdNatif, clientId: string, clientSecret: string) => poster("/application", { service, clientId, clientSecret });
export const effacerApplication = (service: IdNatif) => poster("/application/effacer", { service });
export const connecterNatif = (service: IdNatif, choix: IdChoix[]) => poster("/connecter", { service, choix });
export const collerAdresseNatif = (service: IdNatif, adresse: string) => poster("/code", { service, adresse });
export const oublierNatif = (service: IdNatif) => poster("/oublier", { service });
