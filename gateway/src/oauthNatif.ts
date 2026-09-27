import http from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db, type StoredCollection } from "./db.ts";
import { chiffrer, dechiffrer, chiffrementActif, estChiffreLie } from "./secret.ts";
import { journaliser } from "./audit.ts";
import { clientGoogle } from "./clientGoogle.ts";
import { requeteHttps, ErreurTransport, type DemandeHttps, type ReponseHttps } from "./clientHttps.ts";
import { t, tf } from "./langue.ts";

/**
 * Connexions natives de 2026.928.2 : Google Sheets, Google Slides, YouTube,
 * LinkedIn, Facebook (Pages), Instagram (compte professionnel) et TikTok.
 *
 * Demandé par Medhi le 28/09/2026 (« il manque plein de choses : Instagram,
 * TikTok, LinkedIn, Google Sheets, Google Slides, Facebook, YouTube ; pas tout
 * Composio, mais les principales »). Aucun de ces services ne publie de
 * serveur MCP qui accepte l'enregistrement automatique (connecteurs.ts) : on
 * parle donc à leur API, depuis l'instance, sans intermédiaire (PROJET.md
 * § 3.5, « ne jamais introduire un tiers que le client n'a pas déjà choisi »).
 *
 * Ce module porte ce qui est commun aux sept : l'autorisation, les jetons,
 * leur renouvellement, leur révocation, et l'état montré à l'écran. Les outils
 * de l'agent sont dans outilsNatifs.ts.
 *
 * ── Qui fournit l'application ───────────────────────────────────────────────
 *
 * L'organisation, toujours. Pour Google, c'est l'application déjà saisie pour
 * Drive et Agenda (clientGoogle.ts). Pour LinkedIn, Meta (Facebook et
 * Instagram) et TikTok, chaque organisation crée la sienne chez le fournisseur
 * et en colle l'identifiant et le secret à l'écran, une fois. Helix ne peut pas
 * fournir d'identifiant partagé : chez ces trois fournisseurs, une application
 * qui sert d'autres comptes que ceux de son éditeur passe une revue, et la
 * réussir ferait de l'agence l'éditrice d'une application qui publie au nom de
 * tous ses clients (le même raisonnement que pour Drive, drive.ts). Ce qui
 * marche sans revue est dit service par service ci-dessous, et à l'écran.
 *
 * ── Ce qui protège l'échange ────────────────────────────────────────────────
 *
 *  - `state` tiré au hasard (32 octets), comparé à durée constante, valable dix
 *    minutes et une seule fois ; un `state` inconnu ne touche à rien (il
 *    n'annule même pas la demande en cours : sinon tout processus du poste
 *    pourrait l'interrompre) ;
 *  - PKCE quand le fournisseur l'accepte : Google (S256) et TikTok (S256 écrit
 *    en hexadécimal, sa variante à lui). LinkedIn ne le propose qu'à la
 *    demande, par un autre point d'autorisation que LinkedIn doit ouvrir pour
 *    l'application ; Meta ne le documente pas pour le parcours manuel. Pour
 *    eux, le code ne vaut rien sans le secret de l'application, qui ne quitte
 *    pas l'instance ;
 *  - retour vérifié : la portée accordée est relue, et un accès qui manque ou
 *    qui déborde est révoqué sans être gardé ; puis le compte est lu (l'essai)
 *    avant que rien ne soit enregistré ;
 *  - jetons chiffrés au repos (secret.ts, lié à leur place), jamais rendus par
 *    une route, jamais écrits au journal (qui dit qui a branché quel service,
 *    et c'est tout) ;
 *  - sorties réseau par le client HTTPS de la passerelle (clientHttps.ts) :
 *    certificat vérifié, aucune redirection suivie, tailles et délais bornés,
 *    et vers les seuls hôtes écrits ici, jamais vers une adresse venue d'une
 *    requête ou du modèle (`HOTES`).
 *
 * ⚠ Rien de ceci n'a été essayé contre les vrais services : ni compte, ni
 * application de développeur n'étaient disponibles le 28/09/2026. Tout est
 * vérifié contre de faux serveurs locaux (scripts/securite.mjs, section
 * 15 bis), d'après la documentation citée à chaque définition.
 */

export type IdNatif = "sheets" | "slides" | "youtube" | "linkedin" | "facebook" | "instagram" | "tiktok";
export const IDS_NATIFS: IdNatif[] = ["sheets", "slides", "youtube", "linkedin", "facebook", "instagram", "tiktok"];
export const estIdNatif = (v: unknown): v is IdNatif => typeof v === "string" && (IDS_NATIFS as string[]).includes(v);

/** Une option cochée à la connexion : des portées de plus, et dit si elles demandent une revue chez le fournisseur. */
export interface Choix {
  id: "ecriture" | "page";
  portees: string[];
  revue: boolean;
}

interface Definition {
  id: IdNatif;
  nom: string;
  google: boolean;
  consentement: string;
  jetons: { hote: string; chemin: string; methode: "POST" | "GET" };
  /** Portées toujours demandées : la lecture, au plus juste. */
  lecture: string[];
  choix: Choix[];
  /** Portées que le fournisseur accorde sans qu'on les demande (tolérées à la relecture). */
  implicites: string[];
  separateur: " " | ",";
  pkce: "S256" | "S256-hex" | null;
  /** `boucle` : un port de la boucle locale ouvert le temps de l'accord ; `instance` : la route publique de retour. */
  retour: "boucle" | "instance";
  cheminBoucle: string;
  cleClient: "client_id" | "client_key";
  formeIdentifiant: RegExp;
  extras: Record<string, string>;
  /** Hôtes que ce service a le droit de joindre. Aucun autre, quoi qu'on demande. */
  hotes: string[];
  documentation: string[];
}

const GOOGLE_COMMUN = {
  google: true,
  consentement: "https://accounts.google.com/o/oauth2/v2/auth",
  jetons: { hote: "oauth2.googleapis.com", chemin: "/token", methode: "POST" as const },
  implicites: [],
  separateur: " " as const,
  pkce: "S256" as const,
  retour: "boucle" as const,
  cheminBoucle: "/",
  cleClient: "client_id" as const,
  formeIdentifiant: /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
  // Sans eux, Google ne rend de jeton d'actualisation qu'à la toute première autorisation (courrierOauth.ts).
  extras: { access_type: "offline", prompt: "consent" },
};

const VERSION_META = "v25.0";

export const DEFINITIONS: Record<IdNatif, Definition> = {
  /*
   * Google Sheets. `spreadsheets.readonly` pour lire ; écrire demande
   * `spreadsheets`, qui ouvre toutes les feuilles du compte (Google n'a pas de
   * portée « écrire une feuille donnée » sans passer par un sélecteur de
   * fichiers dans une page web). Toutes deux sont « sensibles », pas
   * « restreintes » : une application interne à un Workspace n'a aucune
   * vérification à passer. Quotas : 60 lectures et 60 écritures par minute et
   * par personne, 300 par projet (https://developers.google.com/workspace/sheets/api/limits).
   */
  sheets: {
    ...GOOGLE_COMMUN,
    id: "sheets",
    nom: "Google Sheets",
    lecture: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    choix: [{ id: "ecriture", portees: ["https://www.googleapis.com/auth/spreadsheets"], revue: false }],
    hotes: ["sheets.googleapis.com", "oauth2.googleapis.com"],
    documentation: ["https://developers.google.com/workspace/sheets/api/scopes", "https://developers.google.com/workspace/sheets/api/limits"],
  },
  /*
   * Google Slides, en lecture seule (`presentations.readonly`). Quotas :
   * 600 lectures par minute et par personne, 3000 par projet
   * (https://developers.google.com/workspace/slides/api/limits).
   */
  slides: {
    ...GOOGLE_COMMUN,
    id: "slides",
    nom: "Google Slides",
    lecture: ["https://www.googleapis.com/auth/presentations.readonly"],
    choix: [],
    hotes: ["slides.googleapis.com", "oauth2.googleapis.com"],
    documentation: ["https://developers.google.com/workspace/slides/api/scopes", "https://developers.google.com/workspace/slides/api/limits"],
  },
  /*
   * YouTube, en lecture seule (`youtube.readonly`) : chaînes, vidéos et leurs
   * statistiques publiques. Quota par défaut : 10 000 unités par jour pour le
   * projet, une lecture de liste coûte 1 unité ; la recherche (`search.list`)
   * n'est pas utilisée (https://developers.google.com/youtube/v3/getting-started).
   * Publier une vidéo n'est pas proposé : Medhi a demandé de lister et de lire
   * les statistiques.
   */
  youtube: {
    ...GOOGLE_COMMUN,
    id: "youtube",
    nom: "YouTube",
    lecture: ["https://www.googleapis.com/auth/youtube.readonly"],
    choix: [],
    hotes: ["www.googleapis.com", "oauth2.googleapis.com"],
    documentation: ["https://developers.google.com/youtube/v3/guides/auth/installed-apps", "https://developers.google.com/youtube/v3/getting-started"],
  },
  /*
   * LinkedIn (https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).
   * Sans revue : les produits « Sign In with LinkedIn using OpenID Connect »
   * (`openid`, `profile`) et « Share on LinkedIn » (`w_member_social`,
   * publier au nom de la personne). Lire ses propres publications demande
   * `r_member_social`, **fermé** par LinkedIn (« We're not accepting access
   * requests at this time ») : aucun outil ne lit donc les publications d'un
   * profil. La page d'une entreprise (lire, statistiques, publier) passe par le
   * produit « Community Management API », examiné par LinkedIn (palier de
   * développement puis palier standard, avec une vidéo de démonstration), et à
   * demander sur une application neuve qui n'a pas d'autre produit
   * (https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview).
   * Pas de PKCE sur ce parcours (il existe, mais LinkedIn doit l'ouvrir pour
   * l'application). Jeton d'accès de 60 jours ; jeton d'actualisation réservé
   * à certains partenaires. Limites : 150 requêtes par personne et par jour
   * pour la publication, 100 000 pour l'application
   * (https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin),
   * remises à zéro à minuit UTC.
   */
  linkedin: {
    id: "linkedin",
    nom: "LinkedIn",
    google: false,
    consentement: "https://www.linkedin.com/oauth/v2/authorization",
    jetons: { hote: "www.linkedin.com", chemin: "/oauth/v2/accessToken", methode: "POST" },
    lecture: ["openid", "profile"],
    choix: [
      { id: "ecriture", portees: ["w_member_social"], revue: false },
      // `r_organization_admin` plutôt que `rw_organization_admin` : lire la liste des pages et leurs statistiques, pas les administrer.
      { id: "page", portees: ["r_organization_social", "w_organization_social", "r_organization_admin"], revue: true },
    ],
    implicites: [],
    separateur: " ",
    pkce: null,
    retour: "instance",
    cheminBoucle: "",
    cleClient: "client_id",
    formeIdentifiant: /^[A-Za-z0-9]{8,40}$/,
    extras: {},
    hotes: ["www.linkedin.com", "api.linkedin.com"],
    documentation: [
      "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow",
      "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin",
      "https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits",
    ],
  },
  /*
   * Facebook, pages de l'organisation, par l'API Graph de Meta
   * (https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow).
   * `pages_show_list` et `pages_read_engagement` pour lister les pages et lire
   * leurs publications avec leurs réactions ; `pages_manage_posts` pour
   * publier (https://developers.facebook.com/docs/pages-api/posts, qui cite
   * aussi `pages_manage_engagement`, pour les commentaires : pas demandé). Sans
   * revue, en « accès standard », ces permissions ne s'accordent qu'aux
   * personnes qui ont un rôle dans l'application (administrateur, développeur,
   * testeur) ; l'« accès avancé », pour tout le monde, passe par la revue de
   * l'application et la vérification de l'entreprise
   * (https://developers.facebook.com/docs/graph-api/overview/access-levels).
   * Chaque appel porte `appsecret_proof`
   * (https://developers.facebook.com/docs/graph-api/securing-requests). Jeton
   * court échangé contre un jeton de 60 jours ; pas de jeton d'actualisation.
   * Limites : 4 800 appels par jour et par personne engagée pour une page
   * (https://developers.facebook.com/docs/graph-api/overview/rate-limiting).
   */
  facebook: {
    id: "facebook",
    nom: "Facebook",
    google: false,
    consentement: `https://www.facebook.com/${VERSION_META}/dialog/oauth`,
    jetons: { hote: "graph.facebook.com", chemin: `/${VERSION_META}/oauth/access_token`, methode: "GET" },
    lecture: ["pages_show_list", "pages_read_engagement"],
    choix: [{ id: "ecriture", portees: ["pages_manage_posts"], revue: false }],
    implicites: ["public_profile"],
    separateur: ",",
    pkce: null,
    retour: "instance",
    cheminBoucle: "",
    cleClient: "client_id",
    formeIdentifiant: /^[0-9]{5,25}$/,
    extras: {},
    hotes: ["graph.facebook.com"],
    documentation: [
      "https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow",
      "https://developers.facebook.com/docs/pages-api/posts",
      "https://developers.facebook.com/docs/graph-api/overview/access-levels",
      "https://developers.facebook.com/docs/graph-api/overview/rate-limiting",
    ],
  },
  /*
   * Instagram, compte professionnel, par l'« API Instagram avec connexion
   * Instagram » de Meta : pas de page Facebook à relier
   * (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login).
   * `instagram_business_basic` (profil, publications, j'aime et commentaires
   * comptés), `instagram_business_manage_insights` (statistiques),
   * `instagram_business_content_publish` pour publier. Même règle d'accès que
   * Facebook : sans revue, seulement pour les comptes qui ont un rôle dans
   * l'application (testeur Instagram compris). Publication : une image JPEG
   * servie par une adresse publique, 100 publications par l'API sur 24 heures
   * glissantes (https://developers.facebook.com/docs/instagram-platform/content-publishing).
   * Jeton court échangé contre un jeton de 60 jours, renouvelable après 24 h.
   */
  instagram: {
    id: "instagram",
    nom: "Instagram",
    google: false,
    consentement: "https://www.instagram.com/oauth/authorize",
    jetons: { hote: "api.instagram.com", chemin: "/oauth/access_token", methode: "POST" },
    lecture: ["instagram_business_basic", "instagram_business_manage_insights"],
    choix: [{ id: "ecriture", portees: ["instagram_business_content_publish"], revue: false }],
    implicites: [],
    separateur: ",",
    pkce: null,
    retour: "instance",
    cheminBoucle: "",
    cleClient: "client_id",
    formeIdentifiant: /^[0-9]{5,25}$/,
    extras: {},
    hotes: ["api.instagram.com", "graph.instagram.com"],
    documentation: [
      "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login",
      "https://developers.facebook.com/docs/instagram-platform/content-publishing",
    ],
  },
  /*
   * TikTok, « Login Kit for Desktop » (https://developers.tiktok.com/doc/login-kit-desktop) :
   * PKCE obligatoire (défi en hexadécimal), retour sur la boucle locale avec un
   * port, joker accepté (`http://127.0.0.1:*\/callback/`). Lecture :
   * `user.info.basic`, `user.info.stats`, `video.list` ; publier une vidéo :
   * `video.publish` (Content Posting API). Sans revue : le « bac à sable »,
   * jusqu'à 10 comptes cibles (https://developers.tiktok.com/doc/add-a-sandbox) ;
   * et tant que l'application n'a pas passé l'audit de TikTok, **tout ce
   * qu'elle publie reste privé** (« restricted to private viewing mode »,
   * https://developers.tiktok.com/doc/content-posting-api-get-started). Jeton
   * d'accès de 24 heures, jeton d'actualisation d'un an
   * (https://developers.tiktok.com/doc/oauth-user-access-token-management).
   * Limites : 600 requêtes par minute pour l'utilisateur et la liste des vidéos
   * (https://developers.tiktok.com/doc/tiktok-api-v2-rate-limit).
   */
  tiktok: {
    id: "tiktok",
    nom: "TikTok",
    google: false,
    consentement: "https://www.tiktok.com/v2/auth/authorize/",
    jetons: { hote: "open.tiktokapis.com", chemin: "/v2/oauth/token/", methode: "POST" },
    lecture: ["user.info.basic", "user.info.stats", "video.list"],
    choix: [{ id: "ecriture", portees: ["video.publish"], revue: true }],
    implicites: [],
    separateur: ",",
    pkce: "S256-hex",
    retour: "boucle",
    cheminBoucle: "/callback/",
    cleClient: "client_key",
    formeIdentifiant: /^[A-Za-z0-9]{8,40}$/,
    extras: {},
    hotes: ["open.tiktokapis.com", "open-upload.tiktokapis.com"],
    documentation: [
      "https://developers.tiktok.com/doc/login-kit-desktop",
      "https://developers.tiktok.com/doc/oauth-user-access-token-management",
      "https://developers.tiktok.com/doc/content-posting-api-get-started",
    ],
  },
};

const AGENT = "Connecteur-Natif/1";
const LIMITES = { delaiMs: 20_000, delaiTotalMs: 45_000, fluxMs: 10 * 60_000, jetons: 64 * 1024, api: 4 * 1024 * 1024 };
const COLLECTION: StoredCollection = "connecteursNatifs";
const PREFIXE_ETAT = "natif.";

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

type Transport = (demande: DemandeHttps, service: string) => Promise<ReponseHttps>;
let transport: Transport = requeteHttps;

/**
 * Pour la batterie de sécurité seulement (section 15 bis) : les requêtes
 * partent vers de faux serveurs locaux au lieu des vrais services. Appelable
 * depuis le processus de la passerelle, jamais depuis une requête : aucune
 * route ne la connaît. `null` rétablit le vrai client.
 */
export function remplacerTransportPourEssais(fn: Transport | null): void {
  transport = fn ?? requeteHttps;
}

export class ErreurNatif extends Error {
  categorie: "config" | "acces" | "api" | "quota" | "portee";
  constructor(categorie: "config" | "acces" | "api" | "quota" | "portee", message: string) {
    super(message);
    this.categorie = categorie;
  }
}

export interface ReponseApi {
  statut: number;
  json: Record<string, unknown>;
  entetes: Record<string, string | string[] | undefined>;
}

function lireJson(r: ReponseHttps): Record<string, unknown> {
  try {
    const v = JSON.parse(r.corps.toString("utf8"));
    if (Array.isArray(v)) return { elements: v };
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Une requête vers un hôte du service, et aucun autre. */
export async function envoyer(
  id: IdNatif,
  d: { methode: DemandeHttps["methode"]; hote: string; chemin: string; entetes?: Record<string, string>; corps?: string | Buffer; octets?: number; delaiTotalMs?: number },
): Promise<ReponseApi> {
  const def = DEFINITIONS[id];
  if (!def.hotes.includes(d.hote)) throw new ErreurNatif("config", `Hôte non autorisé pour ${def.nom}.`);
  const r = await transport(
    {
      methode: d.methode,
      hote: d.hote,
      chemin: d.chemin,
      entetes: { Accept: "application/json", ...(d.entetes ?? {}) },
      ...(d.corps !== undefined ? { corps: d.corps } : {}),
      limiteOctets: d.octets ?? LIMITES.api,
      auDela: "refuser",
      delaiMs: LIMITES.delaiMs,
      delaiTotalMs: Math.min(d.delaiTotalMs ?? LIMITES.delaiTotalMs, 10 * 60_000),
      agentUtilisateur: AGENT,
    },
    def.nom,
  );
  return { statut: r.statut, json: lireJson(r), entetes: r.entetes as ReponseApi["entetes"] };
}

const formulaire = (p: Record<string, string>) => new URLSearchParams(p).toString();
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

/** Preuve demandée par Meta sur chaque appel : HMAC-SHA256 du jeton, clé = secret de l'application. */
export const preuveMeta = (jeton: string, secret: string): string => createHmac("sha256", secret).update(jeton).digest("hex");

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */

interface ApplicationEnregistree {
  clientId: string;
  /** Enveloppe `chiffrer()`, liée à sa place. */
  secret?: unknown;
  depuis: string;
  par: string;
}

interface JetonsClairs {
  acces: string;
  /** Péremption du jeton d'accès, en millisecondes. */
  expire?: number;
  actualisation?: string;
  expireActualisation?: number;
}

interface CompteEnregistre {
  compte: string;
  choix: Choix["id"][];
  portees: string[];
  /** Identifiants publics renvoyés par le service (membre LinkedIn, compte Instagram, open_id TikTok). */
  ids: Record<string, string>;
  /** Enveloppe `chiffrer()` des jetons, liée à sa place. */
  jetons: unknown;
  clientId: string;
  depuis: string;
  par: string;
  perdu?: string;
}

interface Magasin {
  applications: Partial<Record<IdNatif, ApplicationEnregistree>>;
  comptes: Partial<Record<IdNatif, CompteEnregistre>>;
}

let magasin: Magasin | undefined;
/** Le magasin n'a pas pu être lu : on n'écrit rien par-dessus (règle du projet, pertes du 20/09 et du 24/09). */
let illisible = false;
let chargement: Promise<void> | null = null;

const placeSecret = (id: IdNatif) => `connecteursNatifs#${id}#secret`;
const placeJetons = (id: IdNatif) => `connecteursNatifs#${id}#jetons`;

export async function charger(): Promise<void> {
  if (magasin) return;
  if (chargement) return chargement;
  chargement = (async () => {
    try {
      const v = (await db().read(COLLECTION)) as Partial<Magasin> | null;
      magasin = {
        applications: v && typeof v.applications === "object" && v.applications ? v.applications : {},
        comptes: v && typeof v.comptes === "object" && v.comptes ? v.comptes : {},
      };
      illisible = false;
    } catch (err) {
      console.error("[connecteurs natifs] magasin illisible :", err instanceof Error ? err.message : err);
      magasin = { applications: {}, comptes: {} };
      illisible = true;
    }
  })();
  try {
    await chargement;
  } finally {
    chargement = null;
  }
}

async function ecrire(): Promise<void> {
  if (illisible) {
    throw new ErreurNatif("config", t("Les connexions enregistrées n'ont pas pu être lues : rien n'est modifié tant qu'elles ne le sont pas. Redémarrez l'application ; si cela persiste, le trousseau ou la clé de chiffrement est en cause."));
  }
  await db().write(COLLECTION, magasin);
}

/* ------------------------------------------------------------------ */
/* Application du fournisseur                                          */
/* ------------------------------------------------------------------ */

type Client = { ok: true; clientId: string; clientSecret: string; source: "google" | "ecran" } | { ok: false };

function clientDe(id: IdNatif): Client {
  const def = DEFINITIONS[id];
  if (def.google) {
    const g = clientGoogle();
    return g.ok ? { ok: true, clientId: g.clientId, clientSecret: g.clientSecret, source: "google" } : { ok: false };
  }
  const a = magasin?.applications[id];
  if (!a) return { ok: false };
  let secret = "";
  if (a.secret !== undefined) {
    try {
      const clair = estChiffreLie(a.secret) ? dechiffrer(a.secret, placeSecret(id)) : null;
      secret = typeof clair === "string" ? clair : "";
    } catch {
      secret = "";
    }
  }
  return { ok: true, clientId: a.clientId, clientSecret: secret, source: "ecran" };
}

/** Enregistre l'application créée par l'organisation chez LinkedIn, Meta ou TikTok. Le secret est chiffré, et ne ressort plus. */
export async function enregistrerApplication(id: unknown, brutId: unknown, brutSecret: unknown, qui: string): Promise<{ ok: boolean; message: string }> {
  if (!estIdNatif(id)) return { ok: false, message: t("Service inconnu.") };
  const def = DEFINITIONS[id];
  if (def.google) return { ok: false, message: t("Les services Google utilisent l'application Google de l'instance, saisie une fois pour Drive, Agenda, Sheets, Slides et YouTube.") };
  await charger();
  const clientId = typeof brutId === "string" ? brutId.trim() : "";
  const secret = typeof brutSecret === "string" ? brutSecret.trim() : "";
  if (!def.formeIdentifiant.test(clientId)) return { ok: false, message: tf("Cet identifiant n'a pas la forme de ceux de {0}. Vérifiez le copier-coller.", def.nom) };
  // Les trois exigent le secret pour échanger le code (documentation citée plus haut).
  if (!secret || secret.length > 200 || /\s/.test(secret)) return { ok: false, message: tf("Collez aussi le secret de l'application {0}, sans espace.", def.nom) };
  if (!chiffrementActif()) return { ok: false, message: t("Le chiffrement des données n'est pas actif sur cette machine : le secret ne sera pas enregistré en clair.") };
  const avant = magasin!.applications[id];
  magasin!.applications[id] = { clientId, secret: chiffrer(secret, placeSecret(id)), depuis: new Date().toISOString(), par: qui };
  // Une autre application : le compte branché avec l'ancienne ne vaut plus.
  const compte = magasin!.comptes[id];
  if (compte && compte.clientId !== clientId) compte.perdu = new Date().toISOString();
  try {
    await ecrire();
  } catch (err) {
    if (avant) magasin!.applications[id] = avant;
    else delete magasin!.applications[id];
    throw err;
  }
  journaliser("natif.application_enregistree", qui, { service: id });
  return { ok: true, message: tf("Application {0} enregistrée. Vous pouvez maintenant vous connecter.", def.nom) };
}

export async function effacerApplication(id: unknown, qui: string): Promise<{ ok: boolean; message: string }> {
  if (!estIdNatif(id) || DEFINITIONS[id].google) return { ok: false, message: t("Service inconnu.") };
  await charger();
  if (magasin!.comptes[id]) await oublier(id, qui);
  delete magasin!.applications[id];
  await ecrire();
  journaliser("natif.application_effacee", qui, { service: id });
  return { ok: true, message: tf("Application {0} retirée de cette instance.", DEFINITIONS[id].nom) };
}

/* ------------------------------------------------------------------ */
/* Jetons et comptes                                                   */
/* ------------------------------------------------------------------ */

function jetonsDe(id: IdNatif, c: CompteEnregistre): JetonsClairs | null {
  if (!estChiffreLie(c.jetons)) return null;
  try {
    const v = dechiffrer(c.jetons, placeJetons(id)) as Partial<JetonsClairs> | null;
    return v && typeof v.acces === "string" && v.acces ? (v as JetonsClairs) : null;
  } catch {
    return null;
  }
}

function utilisable(id: IdNatif): CompteEnregistre | null {
  const c = magasin?.comptes[id];
  if (!c || c.perdu) return null;
  const client = clientDe(id);
  if (!client.ok || client.clientId !== c.clientId) return null;
  return c;
}

/** Synchrone, pour la liste des outils : le service est-il branché et utilisable ? */
export function connecte(id: IdNatif): boolean {
  if (!magasin) {
    void charger();
    return false;
  }
  return utilisable(id) !== null;
}

/** Synchrone : une option (écriture, page d'entreprise) a-t-elle été accordée ? */
export function aChoisi(id: IdNatif, choix: Choix["id"]): boolean {
  const c = connecte(id) ? magasin!.comptes[id] : null;
  return Boolean(c?.choix.includes(choix));
}

export function idsDe(id: IdNatif): Record<string, string> {
  return { ...(magasin?.comptes[id]?.ids ?? {}) };
}

async function marquerPerdu(id: IdNatif): Promise<void> {
  const c = magasin?.comptes[id];
  if (!c || c.perdu) return;
  c.perdu = new Date().toISOString();
  await ecrire().catch(() => {});
  journaliser("natif.acces_perdu", "agent", { service: id });
}

const enCoursActualisation = new Map<IdNatif, Promise<string>>();

/** Le secret de l'application, pour Meta (`appsecret_proof`). Jamais rendu hors de la passerelle. */
export function secretApplication(id: IdNatif): string {
  const c = clientDe(id);
  return c.ok ? c.clientSecret : "";
}

/** Un jeton d'accès valable, renouvelé si le service le permet. */
export async function accesValide(id: IdNatif, forcer = false): Promise<string> {
  await charger();
  const c = utilisable(id);
  if (!c) throw new ErreurNatif("acces", magasin?.comptes[id] ? `L'accès à ${DEFINITIONS[id].nom} a été perdu : il faut le reconnecter dans Paramètres, Connecteurs.` : `${DEFINITIONS[id].nom} n'est pas connecté.`);
  const j = jetonsDe(id, c);
  if (!j) throw new ErreurNatif("acces", `Le jeton enregistré pour ${DEFINITIONS[id].nom} est illisible : il faut le reconnecter dans Paramètres, Connecteurs.`);
  if (!forcer && (!j.expire || j.expire - 60_000 > Date.now())) return j.acces;
  const deja = enCoursActualisation.get(id);
  if (deja) return deja;
  const p = (async () => {
    const neufs = await rafraichir(id, j);
    if (!neufs) {
      await marquerPerdu(id);
      throw new ErreurNatif("acces", `L'accès à ${DEFINITIONS[id].nom} a expiré et ne se renouvelle pas seul : il faut le reconnecter dans Paramètres, Connecteurs.`);
    }
    c.jetons = chiffrer(neufs, placeJetons(id));
    await ecrire();
    return neufs.acces;
  })();
  enCoursActualisation.set(id, p);
  try {
    return await p;
  } finally {
    enCoursActualisation.delete(id);
  }
}

async function rafraichir(id: IdNatif, j: JetonsClairs): Promise<JetonsClairs | null> {
  const def = DEFINITIONS[id];
  const client = clientDe(id);
  if (!client.ok) return null;
  const secret: Record<string, string> = client.clientSecret ? { client_secret: client.clientSecret } : {};
  if (id === "instagram") {
    // Renouvelable après 24 heures et avant expiration (documentation de la connexion Instagram).
    const r = await envoyer(id, { methode: "GET", hote: "graph.instagram.com", chemin: `/refresh_access_token?${formulaire({ grant_type: "ig_refresh_token", access_token: j.acces })}`, octets: LIMITES.jetons });
    return r.statut === 200 && typeof r.json.access_token === "string" ? { acces: r.json.access_token, expire: Date.now() + (Number(r.json.expires_in) || 5_184_000) * 1000 } : null;
  }
  // Facebook : pas de jeton d'actualisation ; LinkedIn : seulement pour certains partenaires.
  if (!j.actualisation) return null;
  const p: Record<string, string> =
    id === "tiktok"
      ? { client_key: client.clientId, ...secret, grant_type: "refresh_token", refresh_token: j.actualisation }
      : { client_id: client.clientId, ...secret, grant_type: "refresh_token", refresh_token: j.actualisation };
  const r = await envoyer(id, { methode: "POST", hote: def.jetons.hote, chemin: def.jetons.chemin, entetes: FORM, corps: formulaire(p), octets: LIMITES.jetons });
  if (r.statut !== 200 || typeof r.json.access_token !== "string") return null;
  return {
    acces: r.json.access_token,
    expire: r.json.expires_in ? Date.now() + Number(r.json.expires_in) * 1000 : undefined,
    // Certains fournisseurs font tourner le jeton d'actualisation (TikTok le peut).
    actualisation: typeof r.json.refresh_token === "string" ? r.json.refresh_token : j.actualisation,
    expireActualisation: r.json.refresh_expires_in ? Date.now() + Number(r.json.refresh_expires_in) * 1000 : j.expireActualisation,
  };
}

/**
 * Un appel d'API authentifié. Un 401 déclenche un renouvellement et une seule
 * reprise ; un second 401 débranche le service (jeton révoqué chez lui).
 */
export async function appelerApi(id: IdNatif, construire: (acces: string) => Parameters<typeof envoyer>[1]): Promise<ReponseApi> {
  for (let essai = 0; essai < 2; essai++) {
    const acces = await accesValide(id, essai > 0);
    const r = await envoyer(id, construire(acces));
    if (r.statut === 401 && essai === 0) continue;
    if (r.statut === 401) {
      await marquerPerdu(id);
      throw new ErreurNatif("acces", `${DEFINITIONS[id].nom} n'accepte plus l'accès enregistré : il faut le reconnecter dans Paramètres, Connecteurs.`);
    }
    return r;
  }
  throw new ErreurNatif("acces", `${DEFINITIONS[id].nom} n'accepte plus l'accès enregistré.`);
}

/* ------------------------------------------------------------------ */
/* Autorisation                                                        */
/* ------------------------------------------------------------------ */

interface Flux {
  id: IdNatif;
  etat: string;
  verificateur: string;
  redirection: string;
  choix: Choix["id"][];
  portees: string[];
  qui: string;
  serveur: http.Server | null;
  minuterie: ReturnType<typeof setTimeout>;
  echangeEnCours: boolean;
}

const flux = new Map<IdNatif, Flux>();
const issues = new Map<IdNatif, { ok: boolean; message: string; quand: string }>();

function fermerFlux(id: IdNatif): void {
  const f = flux.get(id);
  if (!f) return;
  clearTimeout(f.minuterie);
  flux.delete(id);
  if (f.serveur) {
    const s = f.serveur;
    s.close();
    s.closeIdleConnections?.();
    // Plus tard : la réponse qui conclut passe par l'une de ces connexions (mesuré sur Drive).
    setTimeout(() => s.closeAllConnections?.(), 2000).unref?.();
  }
}

function conclure(id: IdNatif, ok: boolean, message: string): { ok: boolean; message: string } {
  issues.set(id, { ok, message, quand: new Date().toISOString() });
  fermerFlux(id);
  return { ok, message };
}

const base64url = (b: Buffer) => b.toString("base64url");

function memeEtat(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export const estEtatNatif = (etat: string): boolean => etat.startsWith(PREFIXE_ETAT);

const echapperHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function pageBoucle(res: http.ServerResponse, statut: number, titre: string, message: string): void {
  res.writeHead(statut, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Connexion</title></head>' +
      '<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5">' +
      `<h1 style="font-size:1.25rem">${echapperHtml(titre)}</h1><p>${echapperHtml(message)}</p></body></html>`,
  );
}

/** L'adresse de retour à déclarer chez le fournisseur, telle que l'écran doit la montrer. */
export function adresseDeRetour(id: IdNatif, base: string): string {
  const def = DEFINITIONS[id];
  if (def.retour === "instance") return `${base.replace(/\/+$/, "")}/helix/oauth/retour`;
  // Google accepte tout port de la boucle locale pour une application « de bureau » ; TikTok, le joker `*`.
  return def.google ? "http://127.0.0.1" : `http://127.0.0.1:*${def.cheminBoucle}`;
}

/**
 * Lance l'autorisation. `base` est l'adresse par laquelle le navigateur
 * atteint l'instance (index.ts, `adresseVue`) : pour LinkedIn et Meta, c'est
 * là que le fournisseur renverra la personne.
 */
export async function demarrer(brutId: unknown, qui: string, base: string, brutChoix: unknown): Promise<{ ok: boolean; message: string; url?: string }> {
  if (!estIdNatif(brutId)) return { ok: false, message: t("Service inconnu.") };
  const id = brutId;
  const def = DEFINITIONS[id];
  await charger();
  const client = clientDe(id);
  if (!client.ok) {
    return {
      ok: false,
      message: def.google
        ? t("Aucune application Google n'est enregistrée sur cette instance : renseignez-la d'abord.")
        : tf("Aucune application {0} n'est enregistrée sur cette instance : créez-la chez {0}, puis collez son identifiant et son secret.", def.nom),
    };
  }
  if (!chiffrementActif()) return { ok: false, message: t("Le chiffrement des données n'est pas actif sur cette machine : l'accès ne sera pas enregistré en clair.") };
  if (flux.get(id)?.echangeEnCours) return { ok: false, message: t("Une connexion est en train d'aboutir. Patientez quelques secondes.") };
  fermerFlux(id);
  issues.delete(id);

  const demandes = Array.isArray(brutChoix) ? brutChoix.filter((c): c is string => typeof c === "string") : [];
  const choix = def.choix.filter((c) => demandes.includes(c.id));
  // La page d'une entreprise LinkedIn sans écriture : on lit, on ne publie pas.
  const portees = [...def.lecture, ...choix.flatMap((c) => (c.id === "page" && !demandes.includes("ecriture") ? c.portees.filter((p) => !p.startsWith("w_")) : c.portees))];

  const etat = PREFIXE_ETAT + base64url(randomBytes(32));
  const verificateur = base64url(randomBytes(48));
  let redirection: string;
  let serveur: http.Server | null = null;

  if (def.retour === "boucle") {
    serveur = http.createServer((req, res) => {
      const adresse = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method !== "GET" || adresse.pathname !== def.cheminBoucle) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable.");
        return;
      }
      void recevoir(adresse.searchParams, null).then(
        (r) => pageBoucle(res, r.ok ? 200 : 400, r.ok ? tf("{0} est connecté", def.nom) : t("La connexion n'a pas abouti"), r.ok ? `${r.message} ${t("Vous pouvez fermer cet onglet.")}` : r.message),
        () => pageBoucle(res, 500, t("La connexion n'a pas abouti"), t("Erreur inattendue.")),
      );
    });
    serveur.keepAliveTimeout = 1000;
    const s = serveur;
    const port = await new Promise<number>((ok, ko) => {
      s.once("error", ko);
      s.listen(0, "127.0.0.1", () => {
        const a = s.address();
        ok(typeof a === "object" && a ? a.port : 0);
      });
    }).catch(() => 0);
    if (!port) {
      s.close();
      return { ok: false, message: t("Impossible d'ouvrir un port sur la boucle locale pour recevoir la réponse du service.") };
    }
    redirection = `http://127.0.0.1:${port}${def.cheminBoucle}`;
  } else {
    redirection = adresseDeRetour(id, base);
  }

  const f: Flux = {
    id,
    etat,
    verificateur,
    redirection,
    choix: choix.map((c) => c.id),
    portees,
    qui,
    serveur,
    echangeEnCours: false,
    minuterie: setTimeout(() => conclure(id, false, t("Le délai de dix minutes est dépassé : rien n'a été enregistré. Recommencez.")), LIMITES.fluxMs),
  };
  f.minuterie.unref?.();
  flux.set(id, f);

  const p = new URLSearchParams({
    [def.cleClient]: client.clientId,
    redirect_uri: redirection,
    response_type: "code",
    scope: portees.join(def.separateur),
    state: etat,
    ...def.extras,
  });
  if (def.pkce) {
    const empreinte = createHash("sha256").update(verificateur).digest();
    p.set("code_challenge", def.pkce === "S256-hex" ? empreinte.toString("hex") : base64url(empreinte));
    p.set("code_challenge_method", "S256");
  }
  return { ok: true, message: tf("Autorisez l'accès dans la page de {0} qui s'ouvre. Cette demande expire dans dix minutes.", def.nom), url: `${def.consentement}?${p.toString()}` };
}

/**
 * Le retour du fournisseur : par la boucle locale, par la route publique de
 * l'instance (index.ts, `/helix/oauth/retour`), ou recopié à l'écran.
 */
export async function recevoir(parametres: URLSearchParams, quiCollage: string | null): Promise<{ ok: boolean; message: string; nom?: string }> {
  const recu = parametres.get("state") ?? "";
  const f = [...flux.values()].find((x) => memeEtat(recu, x.etat));
  // Un `state` inconnu n'annule rien : ce serait donner à n'importe qui le moyen d'interrompre.
  if (!f) return { ok: false, message: t("Cette réponse ne correspond à aucune demande de connexion en cours : elle est ignorée.") };
  const def = DEFINITIONS[f.id];
  const erreur = parametres.get("error");
  if (erreur) {
    return { ...conclure(f.id, false, /denied|cancel/i.test(erreur) ? tf("Vous avez refusé l'accès dans {0} : rien n'a été enregistré.", def.nom) : tf("{0} a interrompu l'autorisation : rien n'a été enregistré. Recommencez.", def.nom)), nom: def.nom };
  }
  const code = (parametres.get("code") ?? "").replace(/#_$/, "");
  if (!code || code.length > 2048) return { ...conclure(f.id, false, t("La réponse ne contient pas de code d'autorisation. Recommencez.")), nom: def.nom };
  if (f.echangeEnCours) return { ok: false, message: t("La connexion est déjà en train d'aboutir.") };
  f.echangeEnCours = true;
  try {
    return { ...conclure(f.id, true, await echanger(f, code, quiCollage ?? f.qui)), nom: def.nom };
  } catch (err) {
    return { ...conclure(f.id, false, messageUtilisateur(err)), nom: def.nom };
  }
}

export async function collerAdresse(brutId: unknown, brut: unknown, qui: string): Promise<{ ok: boolean; message: string }> {
  if (!estIdNatif(brutId) || DEFINITIONS[brutId].retour !== "boucle") return { ok: false, message: t("Service inconnu.") };
  const texte = typeof brut === "string" ? brut.trim() : "";
  if (!texte || texte.length > 4096) return { ok: false, message: t("Collez l'adresse complète affichée par le navigateur après votre accord.") };
  let parametres: URLSearchParams;
  try {
    const a = new URL(texte);
    if (a.hostname !== "127.0.0.1" && a.hostname !== "localhost") throw new Error("hôte");
    parametres = a.searchParams;
  } catch {
    return { ok: false, message: t("Cette adresse n'est pas celle du retour : elle commence par http://127.0.0.1.") };
  }
  return recevoir(parametres, qui);
}

const decouper = (v: unknown): string[] =>
  typeof v === "string" ? v.split(/[\s,]+/).filter(Boolean) : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function erreurJetons(nom: string, json: Record<string, unknown>): ErreurNatif {
  const e = json.error;
  const code = typeof e === "string" ? e : typeof (e as { code?: unknown })?.code === "string" ? String((e as { code: string }).code) : "";
  if (code === "invalid_grant") return new ErreurNatif("acces", tf("Le code d'autorisation a expiré ou a déjà servi. Recommencez la connexion à {0}.", nom));
  if (code === "invalid_client" || code === "unauthorized_client") return new ErreurNatif("config", tf("{0} ne reconnaît pas l'application enregistrée (identifiant ou secret). Vérifiez-les dans Paramètres, Connecteurs.", nom));
  if (/redirect/i.test(code) || /redirect/i.test(String(json.error_description ?? ""))) return new ErreurNatif("config", tf("{0} refuse l'adresse de retour : déclarez-la à l'identique dans l'application, telle que l'écran la montre.", nom));
  return new ErreurNatif("api", tf("{0} a refusé l'échange d'autorisation.", nom));
}

/** Échange le code, relit les portées, lit le compte (l'essai), puis seulement enregistre. */
async function echanger(f: Flux, code: string, qui: string): Promise<string> {
  const id = f.id;
  const def = DEFINITIONS[id];
  const client = clientDe(id);
  if (!client.ok) throw new ErreurNatif("config", tf("L'application {0} n'est plus configurée sur cette instance.", def.nom));
  const secret: Record<string, string> = client.clientSecret ? { client_secret: client.clientSecret } : {};

  let r: ReponseApi;
  if (id === "facebook") {
    // Meta documente un GET, paramètres dans l'adresse, de serveur à serveur.
    r = await envoyer(id, { methode: "GET", hote: def.jetons.hote, chemin: `${def.jetons.chemin}?${formulaire({ client_id: client.clientId, redirect_uri: f.redirection, ...secret, code })}`, octets: LIMITES.jetons });
  } else {
    const p: Record<string, string> = {
      [def.cleClient]: client.clientId,
      ...secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: f.redirection,
      ...(def.pkce ? { code_verifier: f.verificateur } : {}),
    };
    r = await envoyer(id, { methode: "POST", hote: def.jetons.hote, chemin: def.jetons.chemin, entetes: FORM, corps: formulaire(p), octets: LIMITES.jetons });
  }
  // Instagram rend parfois ses champs dans `data[0]`.
  const json = Array.isArray(r.json.data) && r.json.data[0] && typeof r.json.data[0] === "object" ? (r.json.data[0] as Record<string, unknown>) : r.json;
  if (r.statut !== 200 || typeof json.access_token !== "string") throw erreurJetons(def.nom, r.json);

  let jetons: JetonsClairs = {
    acces: json.access_token,
    expire: json.expires_in ? Date.now() + Number(json.expires_in) * 1000 : undefined,
    ...(typeof json.refresh_token === "string" ? { actualisation: json.refresh_token } : {}),
    ...(json.refresh_expires_in ? { expireActualisation: Date.now() + Number(json.refresh_expires_in) * 1000 } : {}),
  };
  const ids: Record<string, string> = {};
  if (typeof json.open_id === "string") ids.openId = json.open_id.slice(0, 100);
  if (json.user_id !== undefined) ids.utilisateur = String(json.user_id).slice(0, 40);

  const revoquer = () => revocation(id, jetons).catch(() => false);

  // Jeton court de Meta : échangé contre celui de 60 jours, qui seul vaut la peine d'être gardé.
  if (id === "facebook" || id === "instagram") {
    const l =
      id === "facebook"
        ? await envoyer(id, { methode: "GET", hote: "graph.facebook.com", chemin: `/${VERSION_META}/oauth/access_token?${formulaire({ grant_type: "fb_exchange_token", client_id: client.clientId, ...secret, fb_exchange_token: jetons.acces })}`, octets: LIMITES.jetons })
        : await envoyer(id, { methode: "GET", hote: "graph.instagram.com", chemin: `/access_token?${formulaire({ grant_type: "ig_exchange_token", ...secret, access_token: jetons.acces })}`, octets: LIMITES.jetons });
    if (l.statut !== 200 || typeof l.json.access_token !== "string") {
      await revoquer();
      throw new ErreurNatif("api", tf("{0} n'a pas remis d'accès durable. Recommencez la connexion.", def.nom));
    }
    jetons = { acces: l.json.access_token, expire: Date.now() + (Number(l.json.expires_in) || 5_184_000) * 1000 };
  }

  // Ce qui a été accordé, relu. Meta ne le dit pas dans la réponse : on le lui demande.
  let accordees: string[];
  if (id === "facebook") {
    const p = await envoyer(id, { methode: "GET", hote: "graph.facebook.com", chemin: `/${VERSION_META}/me/permissions?${formulaire({ access_token: jetons.acces, appsecret_proof: preuveMeta(jetons.acces, client.clientSecret) })}` });
    const liste = Array.isArray(p.json.data) ? (p.json.data as { permission?: unknown; status?: unknown }[]) : [];
    accordees = liste.filter((x) => x.status === "granted" && typeof x.permission === "string").map((x) => String(x.permission));
  } else {
    accordees = decouper(json.scope ?? json.permissions);
  }
  if (accordees.length === 0) {
    // Les quatre documentations disent rendre les portées accordées : leur absence est une anomalie, pas un accord.
    await revoquer();
    throw new ErreurNatif("portee", t("Le service n'a pas dit quels accès il accordait : rien n'a été enregistré."));
  }
  const manquantes = f.portees.filter((p) => !accordees.includes(p));
  if (manquantes.length > 0) {
    await revoquer();
    throw new ErreurNatif("portee", tf("Tous les accès demandés n'ont pas été accordés dans {0} (une case décochée, ou une permission que l'application n'a pas). Rien n'a été enregistré.", def.nom));
  }
  const enTrop = accordees.filter((p) => !f.portees.includes(p) && !def.implicites.includes(p));
  if (enTrop.length > 0) {
    await revoquer();
    throw new ErreurNatif("portee", tf("{0} a accordé plus que ce qui était demandé. Par prudence, rien n'a été enregistré et l'accès a été révoqué.", def.nom));
  }

  // L'essai : lire le compte avec ce jeton. Rien n'est gardé s'il échoue.
  let compte: string;
  try {
    const lu = await identite(id, jetons.acces, client);
    compte = lu.compte;
    Object.assign(ids, lu.ids);
  } catch (err) {
    await revoquer();
    throw err;
  }

  await charger();
  const avant = magasin!.comptes[id];
  magasin!.comptes[id] = {
    compte,
    choix: f.choix,
    portees: f.portees,
    ids,
    jetons: chiffrer(jetons, placeJetons(id)),
    clientId: client.clientId,
    depuis: new Date().toISOString(),
    par: qui,
  };
  try {
    await ecrire();
  } catch (err) {
    if (avant) magasin!.comptes[id] = avant;
    else delete magasin!.comptes[id];
    await revoquer();
    throw err;
  }
  journaliser("natif.branche", qui, { service: id, choix: f.choix });
  return f.choix.length > 0 ? tf("{0} connecté : {1}. Chaque écriture ou publication vous sera montrée et demandera votre accord.", def.nom, compte) : tf("{0} connecté en lecture seule : {1}.", def.nom, compte);
}

const texteCourt = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").trim().slice(0, max) : "");

/** Lit le compte avec le jeton obtenu : c'est l'essai qui précède l'enregistrement. */
async function identite(id: IdNatif, acces: string, client: { clientId: string; clientSecret: string }): Promise<{ compte: string; ids: Record<string, string> }> {
  const bearer = { Authorization: `Bearer ${acces}` };
  const echec = (r: ReponseApi) => new ErreurNatif(r.statut === 401 || r.statut === 403 ? "acces" : "api", tf("{0} n'a pas laissé lire le compte avec l'accès accordé (code {1}). Rien n'a été enregistré.", DEFINITIONS[id].nom, r.statut));
  switch (id) {
    case "sheets":
    case "slides": {
      // Ni Sheets ni Slides n'ont de « qui suis-je » avec leur seule portée : on vérifie que le jeton est bien pour cette application.
      const r = await envoyer(id, { methode: "GET", hote: "oauth2.googleapis.com", chemin: `/tokeninfo?${formulaire({ access_token: acces })}` });
      if (r.statut !== 200 || r.json.aud !== client.clientId) throw echec(r);
      return { compte: t("compte Google"), ids: {} };
    }
    case "youtube": {
      const r = await envoyer(id, { methode: "GET", hote: "www.googleapis.com", chemin: "/youtube/v3/channels?part=snippet&mine=true", entetes: bearer });
      if (r.statut !== 200) throw echec(r);
      const ch = Array.isArray(r.json.items) ? (r.json.items[0] as { id?: unknown; snippet?: { title?: unknown } } | undefined) : undefined;
      return { compte: texteCourt(ch?.snippet?.title) || t("compte Google sans chaîne"), ids: typeof ch?.id === "string" ? { chaine: ch.id } : {} };
    }
    case "linkedin": {
      const r = await envoyer(id, { methode: "GET", hote: "api.linkedin.com", chemin: "/v2/userinfo", entetes: bearer });
      if (r.statut !== 200 || typeof r.json.sub !== "string") throw echec(r);
      return { compte: texteCourt(r.json.name) || "LinkedIn", ids: { membre: r.json.sub.slice(0, 100) } };
    }
    case "facebook": {
      const r = await envoyer(id, { methode: "GET", hote: "graph.facebook.com", chemin: `/${VERSION_META}/me?${formulaire({ fields: "id,name", access_token: acces, appsecret_proof: preuveMeta(acces, client.clientSecret) })}` });
      if (r.statut !== 200 || typeof r.json.id !== "string") throw echec(r);
      return { compte: texteCourt(r.json.name) || "Facebook", ids: { utilisateur: r.json.id.slice(0, 40) } };
    }
    case "instagram": {
      const r = await envoyer(id, { methode: "GET", hote: "graph.instagram.com", chemin: `/${VERSION_META}/me?${formulaire({ fields: "user_id,username,account_type", access_token: acces })}` });
      if (r.statut !== 200 || r.json.user_id === undefined) throw echec(r);
      return { compte: texteCourt(r.json.username) ? `@${texteCourt(r.json.username)}` : "Instagram", ids: { utilisateur: String(r.json.user_id).slice(0, 40) } };
    }
    case "tiktok": {
      const r = await envoyer(id, { methode: "GET", hote: "open.tiktokapis.com", chemin: "/v2/user/info/?fields=open_id,display_name", entetes: bearer });
      const u = ((r.json.data ?? {}) as { user?: { display_name?: unknown; open_id?: unknown } }).user;
      if (r.statut !== 200 || !u) throw echec(r);
      return { compte: texteCourt(u.display_name) || "TikTok", ids: typeof u.open_id === "string" ? { openId: u.open_id.slice(0, 100) } : {} };
    }
  }
}

/** Révoque chez le fournisseur quand il le permet. Rend vrai s'il l'a confirmé. */
async function revocation(id: IdNatif, j: JetonsClairs): Promise<boolean> {
  const client = clientDe(id);
  if (DEFINITIONS[id].google) {
    const r = await envoyer(id, { methode: "POST", hote: "oauth2.googleapis.com", chemin: "/revoke", entetes: FORM, corps: formulaire({ token: j.actualisation ?? j.acces }), octets: LIMITES.jetons });
    return r.statut === 200;
  }
  if (id === "facebook" && client.ok) {
    // « DELETE /me/permissions » retire toutes les permissions accordées à l'application.
    const r = await envoyer(id, { methode: "DELETE", hote: "graph.facebook.com", chemin: `/${VERSION_META}/me/permissions?${formulaire({ access_token: j.acces, appsecret_proof: preuveMeta(j.acces, client.clientSecret) })}` });
    return r.statut === 200;
  }
  if (id === "tiktok" && client.ok) {
    const r = await envoyer(id, { methode: "POST", hote: "open.tiktokapis.com", chemin: "/v2/oauth/revoke/", entetes: FORM, corps: formulaire({ client_key: client.clientId, client_secret: client.clientSecret, token: j.acces }), octets: LIMITES.jetons });
    return r.statut === 200;
  }
  // LinkedIn et Instagram : pas de révocation documentée pour ces parcours ; l'écran dit où retirer l'accès.
  return false;
}

/** Débranche, et révoque chez le fournisseur quand il le permet : un jeton effacé ici mais valable là-bas resterait utilisable. */
export async function oublier(brutId: unknown, qui: string): Promise<{ ok: boolean; message: string }> {
  if (!estIdNatif(brutId)) return { ok: false, message: t("Service inconnu.") };
  const id = brutId;
  const def = DEFINITIONS[id];
  await charger();
  fermerFlux(id);
  issues.delete(id);
  const avant = magasin!.comptes[id];
  let revoque = false;
  if (avant) {
    const j = jetonsDe(id, avant);
    if (j) revoque = await revocation(id, j).catch(() => false);
  }
  delete magasin!.comptes[id];
  await ecrire();
  journaliser("natif.debranche", qui, { service: id, revoque });
  if (!avant) return { ok: true, message: tf("{0} n'était pas connecté.", def.nom) };
  return {
    ok: true,
    message: revoque
      ? tf("{0} a été débranché, et l'accès révoqué chez {0}.", def.nom)
      : tf("{0} a été débranché de cette instance. {0} n'a pas confirmé la révocation : retirez aussi l'accès de l'application dans les réglages de votre compte {0}.", def.nom),
  };
}

export function messageUtilisateur(err: unknown): string {
  if (err instanceof ErreurNatif || err instanceof ErreurTransport) return err.message;
  return t("La connexion au service a échoué.");
}

/* ------------------------------------------------------------------ */
/* État montré à l'écran                                               */
/* ------------------------------------------------------------------ */

export interface EtatNatif {
  id: IdNatif;
  nom: string;
  google: boolean;
  /** L'application du fournisseur est-elle renseignée ? */
  application: { disponible: boolean; identifiant?: string; avecSecret?: boolean; source?: "google" | "ecran" };
  choix: { id: Choix["id"]; portees: string[]; revue: boolean }[];
  lecture: string[];
  /** Adresse de retour à déclarer chez le fournisseur. */
  retour: string;
  configure: boolean;
  compte?: string;
  accordes?: Choix["id"][];
  depuis?: string;
  /** Date où l'accès expirera sans renouvellement possible (Facebook, LinkedIn). */
  expireLe?: string;
  aReconnecter: boolean;
  attente: boolean;
  issue?: { ok: boolean; message: string; quand: string };
  documentation: string[];
}

/** Ce que l'écran peut savoir : aucun jeton ni secret, sous aucune forme. */
export async function etat(base: string): Promise<EtatNatif[]> {
  await charger();
  return IDS_NATIFS.map((id) => {
    const def = DEFINITIONS[id];
    const client = clientDe(id);
    const c = magasin!.comptes[id];
    const ok = utilisable(id) !== null;
    const j = c && ok ? jetonsDe(id, c) : null;
    const sansRenouvellement = j && !j.actualisation && id !== "instagram" && j.expire;
    return {
      id,
      nom: def.nom,
      google: def.google,
      application: client.ok ? { disponible: true, identifiant: client.clientId, avecSecret: Boolean(client.clientSecret), source: client.source } : { disponible: false },
      choix: def.choix.map((x) => ({ id: x.id, portees: [...x.portees], revue: x.revue })),
      lecture: [...def.lecture],
      retour: adresseDeRetour(id, base),
      configure: ok,
      ...(c ? { compte: c.compte, accordes: [...c.choix], depuis: c.depuis } : {}),
      ...(sansRenouvellement ? { expireLe: new Date(j.expire!).toISOString() } : {}),
      aReconnecter: Boolean(c) && !ok,
      attente: flux.has(id),
      ...(issues.get(id) ? { issue: issues.get(id) } : {}),
      documentation: [...def.documentation],
    };
  });
}
