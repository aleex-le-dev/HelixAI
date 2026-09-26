import http from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, type StoredCollection } from "./db.ts";
import { chiffrer, dechiffrer, chiffrementActif } from "./secret.ts";
import { journaliser } from "./audit.ts";
import { clientGoogle } from "./clientGoogle.ts";
import { requeteHttps, ErreurTransport, type ReponseHttps } from "./clientHttps.ts";
import type { Calendrier, Evenement } from "./agenda.ts";
import { t, tf } from "./langue.ts";

/**
 * Google Agenda par la connexion Google (OAuth), en lecture seule.
 *
 * Pourquoi un second chemin à côté de CalDAV (agenda.ts) : essayé le 26/09/2026
 * sur le compte de Medhi, un mot de passe d'application que Google accepte pour
 * Gmail (IMAP) est refusé par le CalDAV de Google Agenda. Google n'ouvre ses
 * agendas qu'avec sa propre connexion. L'écran promettait l'inverse ; il ne le
 * promet plus, et ce module ouvre le chemin qui marche.
 *
 * Même conception que Google Drive (drive.ts), dont il reprend les règles :
 *  - aucun tiers de plus que Google : l'instance parle à `oauth2.googleapis.com`
 *    et à `www.googleapis.com`, sans intermédiaire ;
 *  - le client OAuth est celui de l'organisation (clientGoogle.ts, partagé avec
 *    Drive), jamais un identifiant livré avec le produit ;
 *  - parcours des applications installées : redirection vers la boucle locale,
 *    port choisi par le système et ouvert le temps de l'autorisation, PKCE en
 *    S256, `state` aléatoire comparé à durée constante ; si l'instance est sur
 *    une autre machine, la personne recopie l'adresse de retour ;
 *  - portée : `calendar.readonly`, et rien d'autre ; la portée accordée est
 *    relue, et un accès plus large ou plus étroit est révoqué sans être gardé ;
 *  - le jeton d'actualisation est chiffré au repos, le jeton d'accès (une
 *    heure) ne vit qu'en mémoire ; aucun des deux ne sort par une route.
 *
 * ⚠ LECTURE SEULE, par construction : des GET vers l'API Calendar, et des POST
 * vers le seul point d'échange (et de révocation) des jetons.
 *
 * Les événements sont rendus dans la forme de agenda.ts (`Evenement`), pour que
 * les outils de l'agent (`agenda__prochains`, `agenda__jour`,
 * `agenda__chercher`) soient les mêmes quel que soit le chemin. Google rend les
 * séries déjà dilatées (`singleEvents`), sans calcul de notre part.
 */

const HOTE_JETONS = "oauth2.googleapis.com";
const HOTE_API = "www.googleapis.com";
const CONSENTEMENT = "https://accounts.google.com/o/oauth2/v2/auth";
const PORTEE = "https://www.googleapis.com/auth/calendar.readonly";
// Neutre : le produit est livré en marque blanche.
const AGENT = "Connecteur-Agenda/1";
const LIMITES = { delaiMs: 20_000, delaiTotalMs: 45_000, fluxMs: 10 * 60_000, octets: 4 * 1024 * 1024, evenementsParAgenda: 250 };
const COLLECTION: StoredCollection = "agendaGoogle";
const RECONNECTER = "Reconnectez Google Agenda dans Paramètres, Connecteurs, puis recommencez.";

// Sans propriété déclarée dans le constructeur : Node lit ce fichier en ôtant les types, et ne l'accepte pas.
class ErreurAgendaGoogle extends Error {
  categorie: "config" | "acces" | "api" | "quota";
  constructor(categorie: "config" | "acces" | "api" | "quota", message: string) {
    super(message);
    this.categorie = categorie;
  }
}

interface CompteEnregistre {
  compte: string;
  secret: unknown;
  clientId: string;
  depuis: string;
  perdu?: string;
}

let cache: CompteEnregistre | null | undefined;
let jetonAcces: { valeur: string; expire: number } | null = null;
let actualisationEnCours: Promise<string> | null = null;

async function lireCompte(): Promise<CompteEnregistre | null> {
  const v = await db().read(COLLECTION).catch(() => null);
  if (!v || typeof v !== "object") return null;
  const c = v as Partial<CompteEnregistre>;
  if (!c.compte || c.secret === undefined || !c.clientId) return null;
  return { compte: String(c.compte), secret: c.secret, clientId: String(c.clientId), depuis: String(c.depuis ?? ""), perdu: c.perdu ? String(c.perdu) : undefined };
}

export async function charger(): Promise<boolean> {
  if (cache === undefined) cache = await lireCompte();
  return utilisable(cache);
}

function utilisable(c: CompteEnregistre | null | undefined): c is CompteEnregistre {
  if (!c || c.perdu) return false;
  const id = clientGoogle();
  return id.ok && id.clientId === c.clientId;
}

/** Synchrone, pour la liste des outils : un Google Agenda utilisable est-il branché ? */
export function connecte(): boolean {
  if (cache === undefined) {
    void charger();
    return false;
  }
  return utilisable(cache);
}

async function marquerPerdu(): Promise<void> {
  jetonAcces = null;
  if (!cache || cache.perdu) return;
  cache = { ...cache, perdu: new Date().toISOString() };
  await db().write(COLLECTION, cache).catch(() => {});
  journaliser("agenda_google.acces_perdu", "agent", { compte: cache.compte });
}

function lireJson(r: ReponseHttps): Record<string, unknown> {
  try {
    const v = JSON.parse(r.corps.toString("utf8"));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function pointDeJetons(chemin: "/token" | "/revoke", parametres: URLSearchParams): Promise<{ statut: number; json: Record<string, unknown> }> {
  const r = await requeteHttps(
    {
      methode: "POST",
      hote: HOTE_JETONS,
      chemin,
      entetes: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      corps: parametres.toString(),
      limiteOctets: 64 * 1024,
      auDela: "refuser",
      delaiMs: LIMITES.delaiMs,
      delaiTotalMs: LIMITES.delaiTotalMs,
      agentUtilisateur: AGENT,
    },
    "Google",
  );
  return { statut: r.statut, json: lireJson(r) };
}

function erreurJetons(json: Record<string, unknown>): ErreurAgendaGoogle {
  const code = typeof json.error === "string" ? json.error : "";
  const detail = typeof json.error_description === "string" ? json.error_description : "";
  if (code === "invalid_grant") {
    return new ErreurAgendaGoogle(
      "acces",
      "Google a refusé l'accès enregistré : il a été révoqué, ou il a expiré. Une application Google Cloud restée « En test » voit ses accès expirer au bout de sept jours. " + RECONNECTER,
    );
  }
  if (code === "invalid_client" || code === "unauthorized_client") {
    return new ErreurAgendaGoogle("config", "Google ne reconnaît pas l'application Google de cette instance (identifiant ou secret). Vérifiez-les dans Paramètres, Connecteurs.");
  }
  if (code === "invalid_request" && /client_secret/i.test(detail)) {
    return new ErreurAgendaGoogle("config", "Google exige le secret de l'application Google. Ajoutez-le dans Paramètres, Connecteurs, puis recommencez.");
  }
  if (code === "admin_policy_enforced") {
    return new ErreurAgendaGoogle("acces", "L'administrateur de votre domaine Google bloque l'accès de cette application à l'agenda.");
  }
  return new ErreurAgendaGoogle("api", "Google a refusé l'échange d'autorisation.");
}

async function jetonValide(): Promise<string> {
  if (jetonAcces && jetonAcces.expire - 60_000 > Date.now()) return jetonAcces.valeur;
  if (actualisationEnCours) return actualisationEnCours;
  actualisationEnCours = (async () => {
    await charger();
    if (!cache) throw new ErreurAgendaGoogle("acces", "Aucun Google Agenda n'est connecté.");
    if (cache.perdu) throw new ErreurAgendaGoogle("acces", `L'accès à Google Agenda a été perdu. ${RECONNECTER}`);
    const id = clientGoogle();
    if (!id.ok) throw new ErreurAgendaGoogle("config", "L'application Google n'est plus configurée sur cette instance.");
    if (id.clientId !== cache.clientId) throw new ErreurAgendaGoogle("acces", `L'application Google de l'instance a changé depuis la connexion de l'agenda. ${RECONNECTER}`);
    const clair = dechiffrer(cache.secret);
    if (typeof clair !== "string" || !clair) throw new ErreurAgendaGoogle("acces", `Le jeton enregistré est illisible. ${RECONNECTER}`);
    const p = new URLSearchParams({ client_id: id.clientId, grant_type: "refresh_token", refresh_token: clair });
    if (id.clientSecret) p.set("client_secret", id.clientSecret);
    const { statut, json } = await pointDeJetons("/token", p);
    if (statut !== 200 || typeof json.access_token !== "string") {
      const e = erreurJetons(json);
      if (e.categorie === "acces") await marquerPerdu();
      throw e;
    }
    const duree = Math.max(60, Math.min(Number(json.expires_in) || 3600, 3600));
    jetonAcces = { valeur: json.access_token, expire: Date.now() + duree * 1000 };
    return jetonAcces.valeur;
  })();
  try {
    return await actualisationEnCours;
  } finally {
    actualisationEnCours = null;
  }
}

function erreurApi(statut: number, json: Record<string, unknown>): ErreurAgendaGoogle {
  const erreur = (json.error ?? {}) as { status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };
  const raisons = [...(erreur.errors ?? []).map((e) => e.reason ?? ""), ...(erreur.details ?? []).map((d) => d.reason ?? ""), erreur.status ?? ""];
  const a = (r: string) => raisons.includes(r);
  if (a("accessNotConfigured") || a("SERVICE_DISABLED")) {
    return new ErreurAgendaGoogle(
      "config",
      "L'API Google Calendar n'est pas activée dans le projet Google Cloud de cette application. Dans la console Google Cloud, ouvrez « API et services », puis « Bibliothèque », cherchez « Google Calendar API » et activez-la. L'activation peut demander quelques minutes.",
    );
  }
  if (a("insufficientPermissions") || a("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) return new ErreurAgendaGoogle("acces", `L'autorisation accordée ne couvre pas la lecture de l'agenda. ${RECONNECTER}`);
  if (statut === 429 || a("rateLimitExceeded") || a("userRateLimitExceeded") || a("RESOURCE_EXHAUSTED")) return new ErreurAgendaGoogle("quota", "Google limite momentanément le nombre de requêtes. Réessaie dans une minute.");
  if (statut === 404) return new ErreurAgendaGoogle("api", "Agenda introuvable, ou inaccessible avec le compte Google connecté.");
  if (statut === 403) return new ErreurAgendaGoogle("acces", "Google refuse l'accès à cet agenda.");
  if (statut >= 500) return new ErreurAgendaGoogle("api", "Google Agenda est momentanément indisponible.");
  return new ErreurAgendaGoogle("api", `Google Agenda a refusé la requête (code ${statut}).`);
}

/** Un GET à l'API Calendar ; un 401 déclenche une actualisation et une seule reprise. */
async function api(chemin: string, jetonForce?: string): Promise<Record<string, unknown>> {
  for (let essai = 0; essai < 2; essai++) {
    const jeton = jetonForce ?? (await jetonValide());
    const r = await requeteHttps(
      {
        methode: "GET",
        hote: HOTE_API,
        chemin,
        entetes: { Authorization: `Bearer ${jeton}`, Accept: "application/json" },
        limiteOctets: LIMITES.octets,
        auDela: "refuser",
        delaiMs: LIMITES.delaiMs,
        delaiTotalMs: LIMITES.delaiTotalMs,
        agentUtilisateur: AGENT,
      },
      "Google Agenda",
    );
    if (r.statut === 401 && !jetonForce && essai === 0) {
      jetonAcces = null;
      continue;
    }
    if (r.statut !== 200) throw erreurApi(r.statut, lireJson(r));
    return lireJson(r);
  }
  throw new ErreurAgendaGoogle("acces", `Google n'accepte plus l'accès enregistré. ${RECONNECTER}`);
}

/* ------------------------------ lecture des agendas ------------------------------ */

const texteSimple = (v: unknown, max = 2000) =>
  typeof v === "string"
    ? v
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim()
        .slice(0, max)
    : "";

/** Minuit local d'une date « AAAA-MM-JJ » (journée entière chez Google). */
function jourLocal(valeur: string): number {
  const [a, m, j] = valeur.split("-").map(Number);
  return new Date(a!, (m ?? 1) - 1, j ?? 1).getTime();
}

function versEvenement(brut: Record<string, unknown>, calendrier: string): Evenement | null {
  const debut = (brut.start ?? {}) as { dateTime?: string; date?: string };
  const fin = (brut.end ?? {}) as { dateTime?: string; date?: string };
  const journeeEntiere = !debut.dateTime && typeof debut.date === "string";
  const debutMs = debut.dateTime ? Date.parse(debut.dateTime) : debut.date ? jourLocal(debut.date) : NaN;
  const finMs = fin.dateTime ? Date.parse(fin.dateTime) : fin.date ? jourLocal(fin.date) : debutMs;
  if (!Number.isFinite(debutMs)) return null;
  const organisateur = (brut.organizer ?? {}) as { email?: string; displayName?: string };
  const participants = Array.isArray(brut.attendees)
    ? (brut.attendees as { email?: string; displayName?: string }[]).slice(0, 50).map((p) => (p.displayName && p.email && p.displayName !== p.email ? `${p.displayName} (${p.email})` : (p.email ?? p.displayName ?? ""))).filter(Boolean)
    : [];
  return {
    uid: String(brut.id ?? ""),
    titre: texteSimple(brut.summary, 300) || "(sans titre)",
    debutMs,
    finMs: Number.isFinite(finMs) ? finMs : debutMs,
    debutIso: new Date(debutMs).toISOString(),
    finIso: new Date(Number.isFinite(finMs) ? finMs : debutMs).toISOString(),
    journeeEntiere,
    lieu: texteSimple(brut.location, 300),
    description: texteSimple(brut.description),
    organisateur: organisateur.displayName && organisateur.email ? `${organisateur.displayName} (${organisateur.email})` : (organisateur.email ?? organisateur.displayName ?? ""),
    participants,
    statut: typeof brut.status === "string" ? brut.status.toUpperCase() : "",
    recurrence: "",
    // `singleEvents=true` : Google rend chaque occurrence, déjà calculée.
    dilatee: true,
    zoneInconnue: false,
    calendrier,
  };
}

/**
 * Même forme que le client CalDAV d'agenda.ts (`decouvrir`, `evenements`) :
 * les outils de l'agent ne savent pas par quel chemin passe l'agenda.
 */
export class ClientGoogleAgenda {
  async decouvrir(): Promise<Calendrier[]> {
    const json = await api(`/calendar/v3/users/me/calendarList?${new URLSearchParams({ minAccessRole: "reader", maxResults: "100" }).toString()}`);
    const items = Array.isArray(json.items) ? (json.items as Record<string, unknown>[]) : [];
    return items
      .filter((c) => typeof c.id === "string" && c.hidden !== true)
      .map((c) => ({
        nom: texteSimple(c.summaryOverride ?? c.summary, 120) || String(c.id),
        url: String(c.id),
        couleur: typeof c.backgroundColor === "string" ? c.backgroundColor : "",
      }));
  }

  async evenements(
    calendrier: Calendrier,
    debutMs: number,
    finMs: number,
    filtre: { champ: "SUMMARY" | "DESCRIPTION"; texte: string } | null,
  ): Promise<Evenement[]> {
    const p = new URLSearchParams({
      timeMin: new Date(debutMs).toISOString(),
      timeMax: new Date(finMs).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(LIMITES.evenementsParAgenda),
    });
    // Google cherche dans le titre, la description, le lieu et les participants : agenda.ts refiltre ensuite.
    if (filtre) p.set("q", filtre.texte.slice(0, 200));
    const json = await api(`/calendar/v3/calendars/${encodeURIComponent(calendrier.url)}/events?${p.toString()}`);
    const items = Array.isArray(json.items) ? (json.items as Record<string, unknown>[]) : [];
    return items
      .filter((e) => e.status !== "cancelled")
      .map((e) => versEvenement(e, calendrier.nom))
      .filter((e): e is Evenement => e !== null);
  }
}

/* --------------------------------- autorisation ---------------------------------- */

interface Flux {
  etat: string;
  verificateur: string;
  redirection: string;
  serveur: http.Server;
  minuterie: ReturnType<typeof setTimeout>;
  qui: string;
  echangeEnCours: boolean;
}
let flux: Flux | null = null;
let issue: { ok: boolean; message: string; quand: string } | null = null;

function fermerFlux(): void {
  if (!flux) return;
  clearTimeout(flux.minuterie);
  const serveur = flux.serveur;
  flux = null;
  serveur.close();
  serveur.closeIdleConnections?.();
  // Plus tard seulement : la réponse qui conclut passe par l'une de ces connexions (mesuré sur Drive).
  setTimeout(() => serveur.closeAllConnections?.(), 2000).unref?.();
}

function conclure(ok: boolean, message: string): { ok: boolean; message: string } {
  issue = { ok, message, quand: new Date().toISOString() };
  fermerFlux();
  return { ok, message };
}

const echapperHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function pageRetour(res: http.ServerResponse, statut: number, titre: string, message: string): void {
  res.writeHead(statut, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Google Agenda</title></head>' +
      '<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5">' +
      `<h1 style="font-size:1.25rem">${echapperHtml(titre)}</h1><p>${echapperHtml(message)}</p></body></html>`,
  );
}

export async function demarrer(qui: string): Promise<{ ok: boolean; message: string; url?: string }> {
  const id = clientGoogle();
  if (!id.ok) {
    return {
      ok: false,
      message:
        id.manque === "identifiant"
          ? t("Aucune application Google n'est enregistrée sur cette instance : renseignez-la d'abord ci-dessus.")
          : t("L'identifiant de l'application Google n'a pas la bonne forme : il se termine par « .apps.googleusercontent.com »."),
    };
  }
  if (!chiffrementActif()) {
    return { ok: false, message: t("Le chiffrement des données n'est pas actif sur cette machine : l'accès à l'agenda ne sera pas enregistré en clair.") };
  }
  if (flux?.echangeEnCours) return { ok: false, message: t("Une connexion Google est en train d'aboutir. Patientez quelques secondes.") };
  fermerFlux();
  issue = null;

  const etat = randomBytes(32).toString("base64url");
  const verificateur = randomBytes(48).toString("base64url");
  const defi = createHash("sha256").update(verificateur).digest("base64url");
  const serveur = http.createServer((req, res) => {
    const adresse = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" || adresse.pathname !== "/") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable.");
      return;
    }
    void recevoir(adresse.searchParams, null).then(
      (r) => pageRetour(res, r.ok ? 200 : 400, r.ok ? t("Google Agenda est connecté") : t("La connexion n'a pas abouti"), r.ok ? `${r.message} ${t("Vous pouvez fermer cet onglet.")}` : r.message),
      () => pageRetour(res, 500, t("La connexion n'a pas abouti"), t("Erreur inattendue.")),
    );
  });
  serveur.keepAliveTimeout = 1000;
  const port = await new Promise<number>((ok, ko) => {
    serveur.once("error", ko);
    serveur.listen(0, "127.0.0.1", () => {
      const a = serveur.address();
      ok(typeof a === "object" && a ? a.port : 0);
    });
  }).catch(() => 0);
  if (!port) {
    serveur.close();
    return { ok: false, message: t("Impossible d'ouvrir un port sur la boucle locale pour recevoir la réponse de Google.") };
  }
  const redirection = `http://127.0.0.1:${port}/`;
  flux = {
    etat,
    verificateur,
    redirection,
    serveur,
    qui,
    echangeEnCours: false,
    minuterie: setTimeout(() => conclure(false, t("Le délai de dix minutes est dépassé : rien n'a été enregistré. Recommencez.")), LIMITES.fluxMs),
  };
  flux.minuterie.unref?.();
  const p = new URLSearchParams({
    client_id: id.clientId,
    redirect_uri: redirection,
    response_type: "code",
    scope: PORTEE,
    code_challenge: defi,
    code_challenge_method: "S256",
    state: etat,
    access_type: "offline",
    prompt: "consent",
  });
  return { ok: true, message: t("Autorisez l'accès dans la fenêtre Google qui s'ouvre. Cette demande expire dans dix minutes."), url: `${CONSENTEMENT}?${p.toString()}` };
}

function memeEtat(recu: string, attendu: string): boolean {
  const a = Buffer.from(recu, "utf8");
  const b = Buffer.from(attendu, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function recevoir(parametres: URLSearchParams, quiCollage: string | null): Promise<{ ok: boolean; message: string }> {
  if (!flux) return { ok: false, message: t("Aucune connexion Google n'est en cours. Relancez-la depuis les paramètres.") };
  // Un `state` faux n'annule rien : ce serait donner à tout processus du poste le moyen d'interrompre.
  if (!memeEtat(parametres.get("state") ?? "", flux.etat)) {
    return { ok: false, message: t("Cette réponse ne correspond pas à la demande de connexion en cours : elle est ignorée.") };
  }
  const erreur = parametres.get("error");
  if (erreur) {
    return conclure(false, erreur === "access_denied" ? t("Vous avez refusé l'accès dans Google : rien n'a été enregistré.") : t("Google a interrompu l'autorisation : rien n'a été enregistré. Recommencez."));
  }
  const code = parametres.get("code") ?? "";
  if (!code || code.length > 2048) return conclure(false, t("La réponse de Google ne contient pas de code d'autorisation. Recommencez."));
  if (flux.echangeEnCours) return { ok: false, message: t("La connexion est déjà en train d'aboutir.") };
  flux.echangeEnCours = true;
  const qui = quiCollage ?? flux.qui;
  try {
    return conclure(true, await echanger(code, flux.verificateur, flux.redirection, qui));
  } catch (err) {
    return conclure(false, messageUtilisateur(err));
  }
}

/** Échange le code, vérifie la portée, lit l'agenda principal (l'essai), puis seulement enregistre. */
async function echanger(code: string, verificateur: string, redirection: string, qui: string): Promise<string> {
  const id = clientGoogle();
  if (!id.ok) throw new ErreurAgendaGoogle("config", "L'application Google n'est plus configurée sur cette instance.");
  const p = new URLSearchParams({ client_id: id.clientId, code, code_verifier: verificateur, grant_type: "authorization_code", redirect_uri: redirection });
  if (id.clientSecret) p.set("client_secret", id.clientSecret);
  const { statut, json } = await pointDeJetons("/token", p);
  if (statut !== 200 || typeof json.access_token !== "string") {
    if (json.error === "invalid_grant") throw new ErreurAgendaGoogle("acces", "Le code d'autorisation a expiré ou a déjà servi. Recommencez la connexion.");
    throw erreurJetons(json);
  }
  const acces = json.access_token;
  const actualisation = typeof json.refresh_token === "string" ? json.refresh_token : "";
  const accordees = typeof json.scope === "string" ? json.scope.split(/\s+/).filter(Boolean) : [];
  const revoquer = () => pointDeJetons("/revoke", new URLSearchParams({ token: actualisation || acces })).catch(() => null);
  if (!accordees.includes(PORTEE)) {
    await revoquer();
    throw new ErreurAgendaGoogle("acces", "L'accès à l'agenda n'a pas été accordé : la case correspondante était décochée dans la fenêtre Google. Recommencez en la laissant cochée.");
  }
  if (accordees.some((x) => x !== PORTEE)) {
    await revoquer();
    throw new ErreurAgendaGoogle("acces", "Google a accordé plus que la lecture de l'agenda. Par prudence, rien n'a été enregistré et l'accès a été révoqué.");
  }
  if (!actualisation) {
    await revoquer();
    throw new ErreurAgendaGoogle("api", "Google n'a pas remis d'accès durable (jeton d'actualisation). Recommencez la connexion.");
  }
  // L'essai : l'agenda principal, dont l'identifiant est l'adresse du compte.
  let compte = "";
  try {
    const liste = await api(`/calendar/v3/users/me/calendarList?${new URLSearchParams({ minAccessRole: "reader", maxResults: "100" }).toString()}`, acces);
    const items = Array.isArray(liste.items) ? (liste.items as { id?: unknown; primary?: unknown }[]) : [];
    const principal = items.find((c) => c.primary === true);
    compte = typeof principal?.id === "string" ? principal.id.slice(0, 200) : "";
  } catch (err) {
    await revoquer();
    throw err;
  }
  if (!compte) {
    await revoquer();
    throw new ErreurAgendaGoogle("api", "Google Agenda n'a pas indiqué l'agenda principal du compte. Recommencez.");
  }
  const enregistre: CompteEnregistre = { compte, secret: chiffrer(actualisation), clientId: id.clientId, depuis: new Date().toISOString() };
  await db().write(COLLECTION, enregistre);
  cache = enregistre;
  jetonAcces = { valeur: acces, expire: Date.now() + Math.min(Number(json.expires_in) || 3600, 3600) * 1000 };
  journaliser("agenda_google.branche", qui, { compte });
  return tf("Google Agenda connecté en lecture seule : {0}.", compte);
}

export async function collerAdresse(brut: unknown, qui: string): Promise<{ ok: boolean; message: string }> {
  const texte = typeof brut === "string" ? brut.trim() : "";
  if (!texte || texte.length > 4096) return { ok: false, message: t("Collez l'adresse complète affichée par le navigateur après votre accord.") };
  let parametres: URLSearchParams;
  try {
    const a = new URL(texte);
    if (a.hostname !== "127.0.0.1" && a.hostname !== "localhost") throw new Error("hôte");
    parametres = a.searchParams;
  } catch {
    return { ok: false, message: t("Cette adresse n'est pas celle du retour de Google : elle commence par http://127.0.0.1.") };
  }
  return recevoir(parametres, qui);
}

/* ------------------------------ état et retrait ---------------------------------- */

export interface EtatAgendaGoogle {
  configure: boolean;
  compte?: string;
  depuis?: string;
  aReconnecter: boolean;
  attente: boolean;
  issue?: { ok: boolean; message: string; quand: string };
}

/** Ce que l'écran peut savoir : aucun jeton, sous aucune forme. */
export async function etat(): Promise<EtatAgendaGoogle> {
  await charger();
  const c = cache ?? null;
  return {
    configure: utilisable(c),
    compte: c?.compte,
    depuis: c?.depuis,
    aReconnecter: Boolean(c) && !utilisable(c),
    attente: flux !== null,
    issue: issue ?? undefined,
  };
}

/** Débranche, et révoque l'accès chez Google : un jeton effacé ici mais valide là-bas resterait utilisable. */
export async function oublier(qui: string): Promise<{ ok: true; message: string }> {
  await charger();
  fermerFlux();
  issue = null;
  const avant = cache ?? null;
  let revoque = false;
  if (avant) {
    const clair = dechiffrer(avant.secret);
    if (typeof clair === "string" && clair) {
      const r = await pointDeJetons("/revoke", new URLSearchParams({ token: clair })).catch(() => null);
      revoque = r?.statut === 200;
    }
  }
  await db().write(COLLECTION, null);
  cache = null;
  jetonAcces = null;
  journaliser("agenda_google.debranche", qui, { compte: avant?.compte ?? null, revoque });
  return {
    ok: true,
    message: !avant
      ? t("Aucun Google Agenda n'était connecté.")
      : revoque
        ? t("Google Agenda a été débranché, et l'accès révoqué chez Google.")
        : t("Google Agenda a été débranché de cette instance. Google n'a pas confirmé la révocation : retirez l'accès depuis votre compte Google, rubrique Sécurité, « Vos connexions à des applications et services tiers »."),
  };
}

export function messageUtilisateur(err: unknown): string {
  if (err instanceof ErreurAgendaGoogle || err instanceof ErreurTransport) return err.message;
  return t("La connexion à Google Agenda a échoué.");
}
