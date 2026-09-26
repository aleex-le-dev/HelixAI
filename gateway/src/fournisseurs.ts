import { randomBytes } from "node:crypto";
import { db } from "./db.ts";
import { brancherBackendsSupplementaires } from "./config.ts";
import { invalidate } from "./router.ts";
import { journaliser } from "./audit.ts";
import type { BackendConfig } from "./types.ts";
import { t, tf } from "./langue.ts";
import { adresseSortanteSure } from "./sortieReseau.ts";

/**
 * Modèles cloud branchés par une clé, depuis l'interface.
 *
 * Deux sources de modèles cloud coexistent :
 *  - ceux que fournit l'agence, déclarés dans le profil de déploiement
 *    (`backends`) et facturés par elle : visibles de tous ;
 *  - ceux qu'une personne branche avec sa propre clé : pour elle seule, ou pour
 *    toute l'équipe si elle le choisit. C'est ce module.
 *
 * Tous les fournisseurs parlent le protocole compatible OpenAI (y compris
 * Anthropic et Google, par leur point d'accès de compatibilité) : un modèle
 * cloud passe donc par la même route que les modèles locaux, avec la même
 * mesure de consommation, la même barrière d'approbation et le même journal.
 *
 * Chaque modèle dit où tourne le service : le client choisit en connaissance
 * de cause d'envoyer ses messages hors de l'Union européenne.
 *
 * La clé est gardée par le magasin de l'instance (chiffré) et ne ressort
 * jamais : l'écran n'en voit que les quatre derniers caractères.
 */

export interface Fournisseur {
  id: string;
  nom: string;
  baseUrl: string;
  pays: string;
  /** Page où créer une clé. */
  cles: string;
  entetes?: Record<string, string>;
  /** Adresse saisie par la personne (fournisseur « compatible OpenAI »). */
  adresseLibre?: boolean;
}

export const CATALOGUE: Fournisseur[] = [
  { id: "mistral", nom: "Mistral AI", baseUrl: "https://api.mistral.ai/v1", pays: "France", cles: "https://console.mistral.ai/api-keys" },
  { id: "scaleway", nom: "Scaleway", baseUrl: "https://api.scaleway.ai/v1", pays: "France", cles: "https://console.scaleway.com/iam/api-keys" },
  {
    id: "ovhcloud",
    nom: "OVHcloud AI Endpoints",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    pays: "France",
    cles: "https://endpoints.ai.cloud.ovh.net",
  },
  {
    id: "ionos",
    nom: "IONOS AI Model Hub",
    baseUrl: "https://openai.inference.de-txl.ionos.com/v1",
    pays: "Allemagne",
    cles: "https://dcd.ionos.com",
  },
  { id: "openai", nom: "OpenAI", baseUrl: "https://api.openai.com/v1", pays: "États-Unis", cles: "https://platform.openai.com/api-keys" },
  {
    id: "anthropic",
    nom: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    pays: "États-Unis",
    cles: "https://console.anthropic.com/settings/keys",
    entetes: { "anthropic-version": "2023-06-01" },
  },
  {
    id: "google",
    nom: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    pays: "États-Unis",
    cles: "https://aistudio.google.com/apikey",
  },
  { id: "openrouter", nom: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", pays: "États-Unis", cles: "https://openrouter.ai/keys" },
  { id: "compatible", nom: "Autre (compatible OpenAI)", baseUrl: "", pays: "Non précisé", cles: "", adresseLibre: true },
];

interface CleStockee {
  id: string;
  fournisseur: string;
  nom: string;
  baseUrl: string;
  pays: string;
  cle: string;
  portee: "moi" | "equipe";
  ownerId: string;
  modeles: string[];
  createdAt: string;
}

/** Ce que l'écran voit d'une clé : jamais la clé. */
export interface CleVue {
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

const COLLECTION = "clesModeles";
let cache: CleStockee[] = [];

async function charger(): Promise<CleStockee[]> {
  const v = await db().read(COLLECTION);
  cache = Array.isArray(v) ? (v as CleStockee[]) : [];
  return cache;
}

async function enregistrer(liste: CleStockee[]): Promise<void> {
  await db().write(COLLECTION, liste);
  cache = liste;
  invalidate();
}

/** À appeler au démarrage : les clés deviennent des backends. */
export async function chargerFournisseurs(): Promise<void> {
  await charger();
  invalidate();
}

const idBackend = (c: CleStockee) => `cle-${c.id}`;

brancherBackendsSupplementaires(() =>
  cache.map(
    (c): BackendConfig => ({
      id: idBackend(c),
      label: c.nom,
      baseUrl: c.baseUrl,
      kind: "openai-compatible",
      priority: 30,
      apiKey: c.cle,
      enabled: true,
      origine: "cle",
      ...(c.portee === "moi" ? { proprietaire: c.ownerId } : {}),
      modeles: c.modeles,
      pays: c.pays,
      fournisseur: c.nom,
      ...(CATALOGUE.find((f) => f.id === c.fournisseur)?.entetes
        ? { entetes: CATALOGUE.find((f) => f.id === c.fournisseur)?.entetes }
        : {}),
    }),
  ),
);

function vue(c: CleStockee, qui: string): CleVue {
  return {
    id: c.id,
    fournisseur: c.fournisseur,
    nom: c.nom,
    pays: c.pays,
    portee: c.portee,
    fin: c.cle.slice(-4),
    modeles: c.modeles,
    estProprietaire: c.ownerId === qui,
    createdAt: c.createdAt,
  };
}

/** Les clés que cette personne voit : les siennes, et celles de l'équipe. */
export async function listerCles(qui: string): Promise<CleVue[]> {
  return (await charger()).filter((c) => c.portee === "equipe" || c.ownerId === qui).map((c) => vue(c, qui));
}

/*
 * Un fournisseur rend aussi ses modèles d'images, de voix, de transcription et
 * de plongement : aucun ne converse. On ne propose que ceux qui le peuvent.
 */
const PAS_DE_CONVERSATION =
  /embed|tts|whisper|dall-?e|moderation|audio|realtime|transcri|image|imagen|veo|sora|speech|rerank|search-preview|davinci|babbage|computer-use|guard/i;

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; statut: number; message: string };



function adresseDe(fournisseur: string, adresse: unknown): Resultat<Fournisseur> {
  const f = CATALOGUE.find((x) => x.id === fournisseur);
  if (!f) return { ok: false, statut: 400, message: t("Fournisseur inconnu.") };
  if (!f.adresseLibre) return { ok: true, valeur: f };
  const brute = typeof adresse === "string" ? adresse.trim().replace(/\/+$/, "") : "";
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    return { ok: false, statut: 400, message: t("Adresse invalide : donnez l'adresse de l'API, par exemple https://exemple.fr/v1.") };
  }
  // Une clé part avec chaque requête : jamais en clair sur le réseau.
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    return { ok: false, statut: 400, message: t("L'adresse doit être en https : la clé voyage avec chaque requête.") };
  }
  return { ok: true, valeur: { ...f, baseUrl: brute } };
}

/**
 * Essaie une clé et rend les modèles de conversation qu'elle ouvre. Rien n'est
 * enregistré : c'est l'étape où la personne choisit ses modèles.
 */
export async function essayerCle(fournisseur: string, adresse: unknown, cle: unknown): Promise<Resultat<string[]>> {
  const f = adresseDe(fournisseur, adresse);
  if (!f.ok) return f;
  const secret = typeof cle === "string" ? cle.trim() : "";
  if (!secret) return { ok: false, statut: 400, message: t("Collez la clé du fournisseur.") };
  const sure = await adresseSortanteSure(f.valeur.baseUrl);
  if (!sure.ok) return sure;
  const entetes = { ...(f.valeur.entetes ?? {}), Authorization: `Bearer ${secret}` };
  try {
    /*
     * `redirect: "error"` : sans lui, une adresse publique pouvait renvoyer un
     * 302 vers une machine interne, et le contrôle ci-dessus ne portait que sur
     * la première adresse. On ne suit donc aucune redirection.
     */
    const r = await fetch(`${f.valeur.baseUrl}/models`, { headers: entetes, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, statut: 400, message: tf("{0} refuse cette clé. Vérifiez-la, et qu'elle a accès aux modèles.", f.valeur.nom) };
    }
    if (!r.ok) return { ok: false, statut: 502, message: tf("{0} a répondu {1}.", f.valeur.nom, r.status) };
    // OpenRouter liste ses modèles sans clé : on vérifie la clé à part.
    if (f.valeur.id === "openrouter") {
      const k = await fetch(`${f.valeur.baseUrl}/key`, { headers: entetes, redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (!k.ok) return { ok: false, statut: 400, message: t("OpenRouter refuse cette clé.") };
    }
    const corps = (await r.json()) as { data?: { id?: string }[] };
    const ids = (corps.data ?? [])
      .map((m) => (typeof m.id === "string" ? m.id.replace(/^models\//, "") : ""))
      .filter((id) => id && !PAS_DE_CONVERSATION.test(id))
      .sort((a, b) => a.localeCompare(b));
    if (ids.length === 0) return { ok: false, statut: 400, message: t("Cette clé n'ouvre aucun modèle de conversation.") };
    return { ok: true, valeur: ids };
  } catch (err) {
    return {
      ok: false,
      statut: 502,
      message: tf("{0} ne répond pas : {1}", f.valeur.nom, err instanceof Error ? err.message : String(err)),
    };
  }
}

export async function ajouterCle(brut: Record<string, unknown>, qui: string): Promise<Resultat<CleVue>> {
  const essai = await essayerCle(String(brut.fournisseur ?? ""), brut.adresse, brut.cle);
  if (!essai.ok) return essai;
  const f = adresseDe(String(brut.fournisseur), brut.adresse);
  if (!f.ok) return f;
  const demandes = Array.isArray(brut.modeles) ? brut.modeles.filter((m): m is string => typeof m === "string") : [];
  const modeles = demandes.filter((m) => essai.valeur.includes(m)).slice(0, 40);
  if (modeles.length === 0) return { ok: false, statut: 400, message: t("Choisissez au moins un modèle.") };
  const portee = brut.portee === "equipe" ? "equipe" : "moi";
  const pays =
    f.valeur.adresseLibre && typeof brut.pays === "string" && brut.pays.trim() ? brut.pays.trim().slice(0, 40) : f.valeur.pays;
  const c: CleStockee = {
    id: randomBytes(5).toString("hex"),
    fournisseur: f.valeur.id,
    nom:
      f.valeur.adresseLibre && typeof brut.nom === "string" && brut.nom.trim()
        ? brut.nom.trim().slice(0, 60)
        : f.valeur.nom,
    baseUrl: f.valeur.baseUrl,
    pays,
    cle: String(brut.cle).trim(),
    portee,
    ownerId: qui,
    modeles,
    createdAt: new Date().toISOString(),
  };
  await enregistrer([...(await charger()), c]);
  // Le journal dit quel fournisseur et pour qui, jamais la clé.
  journaliser("fournisseur.ajoute", qui, { fournisseur: c.fournisseur, pays: c.pays, portee, modeles: modeles.length });
  return { ok: true, valeur: vue(c, qui) };
}

export async function modifierCle(id: string, brut: Record<string, unknown>, qui: string): Promise<Resultat<CleVue>> {
  const liste = await charger();
  const c = liste.find((x) => x.id === id);
  if (!c || (c.portee === "moi" && c.ownerId !== qui)) return { ok: false, statut: 404, message: t("Clé introuvable.") };
  if (c.ownerId !== qui) return { ok: false, statut: 403, message: t("Seule la personne qui a branché cette clé peut la modifier.") };
  if (Array.isArray(brut.modeles)) {
    const m = brut.modeles.filter((x): x is string => typeof x === "string").slice(0, 40);
    if (m.length === 0) return { ok: false, statut: 400, message: t("Gardez au moins un modèle, ou retirez la clé.") };
    c.modeles = m;
  }
  if (brut.portee === "moi" || brut.portee === "equipe") c.portee = brut.portee;
  await enregistrer(liste);
  journaliser("fournisseur.modifie", qui, { fournisseur: c.fournisseur, portee: c.portee, modeles: c.modeles.length });
  return { ok: true, valeur: vue(c, qui) };
}

export async function retirerCle(id: string, qui: string): Promise<Resultat<null>> {
  const liste = await charger();
  const c = liste.find((x) => x.id === id);
  if (!c || (c.portee === "moi" && c.ownerId !== qui)) return { ok: false, statut: 404, message: t("Clé introuvable.") };
  if (c.ownerId !== qui) return { ok: false, statut: 403, message: t("Seule la personne qui a branché cette clé peut la retirer.") };
  await enregistrer(liste.filter((x) => x.id !== id));
  journaliser("fournisseur.retire", qui, { fournisseur: c.fournisseur });
  return { ok: true, valeur: null };
}

/** Effacement d'un compte : ses clés partent avec lui, personnelles comme partagées. */
export async function oublierClesDe(qui: string): Promise<number> {
  const liste = await charger();
  const reste = liste.filter((c) => c.ownerId !== qui);
  if (reste.length !== liste.length) await enregistrer(reste);
  return liste.length - reste.length;
}

/** Pour l'aperçu d'effacement et l'export : ce que la personne a branché, sans les clés. */
export async function clesDe(qui: string): Promise<CleVue[]> {
  return (await charger()).filter((c) => c.ownerId === qui).map((c) => vue(c, qui));
}
