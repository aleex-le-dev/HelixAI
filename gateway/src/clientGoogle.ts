import { db } from "./db.ts";
import { chiffrer, dechiffrer } from "./secret.ts";
import { deployment } from "./deployment.ts";
import { journaliser } from "./audit.ts";
import { t } from "./langue.ts";

/**
 * Le client OAuth Google de l'instance, partagé par Google Drive (drive.ts) et
 * Google Agenda (agendaGoogle.ts).
 *
 * Aucun identifiant Google n'est livré avec le produit : chaque organisation
 * crée le sien dans sa console Google Cloud (drive.ts dit pourquoi). Jusqu'au
 * 26/09/2026, il ne se renseignait que dans helix.config.json, à la main. Ajouté
 * ce jour-là, quand Medhi a voulu brancher son Google Agenda : il se saisit
 * aussi dans l'écran des connecteurs, une fois, pour les deux services. Le
 * profil de déploiement, s'il en porte un, l'emporte (c'est l'intégrateur qui
 * décide) et l'écran ne peut alors pas le remplacer.
 *
 * L'identifiant n'est pas un secret (il figure dans chaque adresse de
 * consentement) ; le secret du client, lui, est chiffré au repos et ne ressort
 * par aucune route.
 */

export const FORME_IDENTIFIANT_GOOGLE = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

interface Enregistre {
  clientId: string;
  /** Enveloppe `chiffrer()`, ou absent pour un client public (PKCE seul). */
  secret?: unknown;
  depuis: string;
}

let cache: Enregistre | null | undefined;

async function lire(): Promise<Enregistre | null> {
  const v = await db().read("clientGoogle").catch(() => null);
  if (!v || typeof v !== "object") return null;
  const e = v as Partial<Enregistre>;
  if (typeof e.clientId !== "string" || !e.clientId) return null;
  return { clientId: e.clientId, secret: e.secret, depuis: String(e.depuis ?? "") };
}

/** À appeler au démarrage : `clientGoogle()` est synchrone. */
export async function chargerClientGoogle(): Promise<void> {
  if (cache === undefined) cache = await lire();
}

export type ClientGoogle =
  | { ok: true; clientId: string; clientSecret: string; source: "config" | "ecran" }
  | { ok: false; manque: "identifiant" | "identifiant-invalide" };

/** Le client en vigueur : celui du profil de déploiement, sinon celui saisi à l'écran. */
export function clientGoogle(): ClientGoogle {
  const google = deployment().google;
  const idConfig = typeof google?.clientId === "string" ? google.clientId.trim() : "";
  if (idConfig) {
    if (!FORME_IDENTIFIANT_GOOGLE.test(idConfig)) return { ok: false, manque: "identifiant-invalide" };
    const secret = typeof google?.clientSecret === "string" ? google.clientSecret.trim() : "";
    return { ok: true, clientId: idConfig, clientSecret: secret, source: "config" };
  }
  if (cache === undefined) void chargerClientGoogle();
  if (!cache) return { ok: false, manque: "identifiant" };
  const clair = cache.secret !== undefined ? dechiffrer(cache.secret) : "";
  return { ok: true, clientId: cache.clientId, clientSecret: typeof clair === "string" ? clair : "", source: "ecran" };
}

/** Ce que l'écran peut savoir : jamais le secret. */
export function etatClientGoogle(): { disponible: boolean; source?: "config" | "ecran"; identifiant?: string; avecSecret?: boolean } {
  const c = clientGoogle();
  if (!c.ok) return { disponible: false };
  return { disponible: true, source: c.source, identifiant: c.clientId, avecSecret: Boolean(c.clientSecret) };
}

export async function enregistrerClientGoogle(brutId: unknown, brutSecret: unknown, qui: string): Promise<{ ok: boolean; message: string }> {
  if (deployment().google?.clientId) {
    return { ok: false, message: t("Le client Google de cette instance est fixé par son profil de déploiement : il ne se change pas depuis l'écran.") };
  }
  const clientId = typeof brutId === "string" ? brutId.trim() : "";
  const secret = typeof brutSecret === "string" ? brutSecret.trim() : "";
  if (!FORME_IDENTIFIANT_GOOGLE.test(clientId)) {
    return { ok: false, message: t("Cet identifiant n'a pas la bonne forme : il se termine par « .apps.googleusercontent.com ». Vérifiez le copier-coller.") };
  }
  if (secret.length > 200 || /\s/.test(secret)) return { ok: false, message: t("Ce secret n'a pas la bonne forme. Vérifiez le copier-coller.") };
  const enregistre: Enregistre = { clientId, ...(secret ? { secret: chiffrer(secret) } : {}), depuis: new Date().toISOString() };
  await db().write("clientGoogle", enregistre);
  cache = enregistre;
  journaliser("google.client_enregistre", qui, { avecSecret: Boolean(secret) });
  return { ok: true, message: t("Application Google enregistrée. Vous pouvez maintenant vous connecter.") };
}

export async function effacerClientGoogle(qui: string): Promise<{ ok: boolean; message: string }> {
  await db().write("clientGoogle", null);
  cache = null;
  journaliser("google.client_efface", qui, {});
  return { ok: true, message: t("Application Google retirée de cette instance.") };
}
