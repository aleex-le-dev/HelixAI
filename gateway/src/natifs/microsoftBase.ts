import { t, tf } from "../langue.ts";
import type { Choix, Definition } from "../oauthNatif.ts";

/**
 * Microsoft 365 par Microsoft Graph : Outlook (mails et agenda), OneDrive,
 * SharePoint, Excel, Word et Teams. Demandé par Medhi le 28/09/2026.
 *
 * Ce fichier ne porte que ce qui se décrit sans rien appeler : la définition
 * de la connexion (portées, adresses, hôtes, messages), les noms des outils et
 * les phrases des cartes d'accord. Il n'importe de valeur que de langue.ts :
 * oauthNatif.ts et approbation.ts le chargent sans boucle d'import, et la
 * barrière reste chargeable seule (batterie de sécurité). Les outils, qui
 * appellent Graph, sont dans microsoft.ts.
 *
 * ── Une seule application, une seule connexion ─────────────────────────────
 *
 * L'administrateur crée une application dans le portail Entra, une fois
 * (identifiant, secret facultatif, annuaire ou « common »). On aurait pu
 * brancher les six services un par un, comme Sheets, Slides et YouTube
 * partagent l'application Google. Ce serait une illusion : chez Microsoft, le
 * consentement s'accumule par application et par personne, et un jeton porte
 * ce qui a été consenti, pas seulement ce qu'on vient de demander (« Refresh
 * tokens are valid for all permissions that your client has already received
 * consent for », https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow ;
 * « All Microsoft Graph delegated permissions that have been granted for that
 * user will be included in the access token », pour `.default`,
 * https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc).
 * Brancher Outlook « seul » après Excel donnerait un jeton qui écrit aussi dans
 * les classeurs. Il y a donc une connexion, `microsoft`, où l'on coche les
 * services et l'écriture ; la portée rendue est relue, et ce qui déborde de ce
 * qui a été coché est refusé (règle du § 40 de SECURITE.md) : l'écran ne dit
 * jamais « lecture seule » d'un jeton qui écrit.
 *
 * ── Portées, lues le 28/09/2026 ──────────────────────────────────────────────
 *
 * https://learn.microsoft.com/en-us/graph/permissions-reference, permissions
 * déléguées (au nom de la personne connectée), colonne « AdminConsentRequired » :
 *  - toujours : `User.Read` (lire le compte, l'essai qui précède
 *    l'enregistrement) et `offline_access` (jeton d'actualisation) ; non ;
 *  - Outlook : `Mail.Read`, `Calendars.Read` ; écrire : `Mail.ReadWrite`
 *    (brouillon), `Mail.Send` (envoyer), `Calendars.ReadWrite` (créer un
 *    événement) ; aucune ne demande l'administrateur ;
 *  - OneDrive, Word : `Files.Read` (les fichiers de la personne) ; non.
 *    `Files.Read.All` (tout ce que la personne peut lire) demande
 *    l'administrateur : pas demandé ;
 *  - Excel : `Files.Read`, écrire `Files.ReadWrite` (« Update range » n'accepte
 *    rien de plus étroit, https://learn.microsoft.com/en-us/graph/api/range-update) ;
 *    non. `Files.ReadWrite` permet aussi, techniquement, de modifier ou
 *    supprimer tout fichier du OneDrive : Microsoft n'a pas de portée
 *    « écrire un classeur » ; les outils, eux, n'écrivent qu'une plage ;
 *  - SharePoint : `Sites.Read.All` ; **oui, consentement de l'administrateur** ;
 *  - Teams : `Team.ReadBasic.All`, `Channel.ReadBasic.All` (non) et
 *    `ChannelMessage.Read.All` (**oui**) ; poster : `ChannelMessage.Send` (non).
 * Écrire se coche une fois pour les services cochés qui savent écrire
 * (Outlook, Excel, Teams) ; OneDrive, SharePoint et Word restent en lecture.
 * Le consentement de l'administrateur se donne dans le portail (« Autorisations
 * de l'API », « Accorder un consentement d'administrateur pour … ») ; beaucoup
 * d'organisations interdisent aussi aux personnes de consentir elles-mêmes, et
 * c'est alors l'administrateur qui consent pour tout
 * (https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview).
 *
 * ── Autorisation ─────────────────────────────────────────────────────────────
 *
 * https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow :
 * `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` et
 * `/token`, `{tenant}` : identifiant de l'annuaire, un domaine, `common` ou
 * `organizations` (`consumers`, les comptes personnels, n'a ni SharePoint ni
 * Teams : pas proposé). PKCE S256 « recommandé pour tous les types
 * d'application ». Le secret n'est exigé que d'une application « Web » ; une
 * application « Mobile et bureau » (client public) ne doit pas en envoyer. Les
 * deux sont acceptées, comme pour X. Le code ne vaut qu'environ une minute.
 * Le jeton d'accès dure environ une heure, le jeton d'actualisation environ
 * 90 jours, et Microsoft peut le remplacer à chaque renouvellement (c'est le
 * nouveau qui est gardé, oauthNatif.ts, `rafraichir`). `scope`, dans la
 * réponse, est « facultatif » d'après la page ; son absence est refusée comme
 * pour les autres services (à vérifier sur le vrai service, PROJET.md).
 *
 * Adresse de retour (https://learn.microsoft.com/en-us/entra/identity-platform/reply-url) :
 * http n'est admis que pour la boucle locale ; « the port component is
 * ignored for the purposes of matching a localhost redirect URI ». Microsoft
 * conseille 127.0.0.1, mais le portail refuse d'y saisir `http://127.0.0.1` (il
 * faut éditer le manifeste) : l'adresse est donc `http://localhost/microsoft`,
 * saisissable telle quelle, et la passerelle ouvre le port sur 127.0.0.1 et,
 * si elle le peut, sur ::1, où macOS résout d'abord « localhost ». « [::1]
 * isn't currently supported » dans l'adresse déclarée : on ne l'y écrit pas.
 *
 * Révocation : la plateforme d'identité n'a pas de point de révocation d'un
 * jeton pour une application. `revokeSignInSessions` déconnecterait la
 * personne de tout, partout ; retirer l'accord (`oAuth2PermissionGrants`)
 * demande une permission d'administration de l'annuaire. Débrancher efface
 * donc les jetons de l'instance et dit où couper l'accès chez Microsoft
 * (https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-application-permissions :
 * « Applications d'entreprise », l'application, « Autorisations »).
 *
 * Limites de débit (https://learn.microsoft.com/en-us/graph/throttling-limits) :
 * Outlook, 10 000 requêtes par 10 minutes, quatre à la fois, 150 Mo envoyés
 * par 5 minutes, par application et par boîte ; Excel, 1 500 requêtes par
 * 10 secondes et par annuaire ; Teams, poster un message 50 par seconde pour
 * l'annuaire et une par seconde et par équipe, lire 20 par seconde, quatre
 * requêtes par seconde au plus sur une même équipe. Un 429 dit de patienter.
 */

export type ServiceMicrosoft = "outlook" | "onedrive" | "sharepoint" | "excel" | "word" | "teams";
export const SERVICES_MICROSOFT: ServiceMicrosoft[] = ["outlook", "onedrive", "sharepoint", "excel", "word", "teams"];

/** Les noms que l'écran et les messages donnent à chaque service. */
export const NOMS_MICROSOFT: Record<ServiceMicrosoft, string> = {
  outlook: "Outlook",
  onedrive: "OneDrive",
  sharepoint: "SharePoint",
  excel: "Excel",
  word: "Word",
  teams: "Microsoft Teams",
};

const GRAPH = "graph.microsoft.com";
const CONNEXION = "login.microsoftonline.com";

/**
 * L'annuaire tel que l'administrateur le colle : l'« ID de l'annuaire
 * (locataire) » de la page de l'application, un domaine vérifié, ou `common` /
 * `organizations`. Écrit dans un chemin : rien d'autre que ces formes.
 */
export function annuaireSur(brut: unknown): string | null {
  const v = typeof brut === "string" ? brut.trim().toLowerCase() : "";
  if (v === "common" || v === "organizations") return v;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) return v;
  if (v.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)) return v;
  return null;
}

/** Une portée telle que Graph la rend (`https://graph.microsoft.com/Mail.Read`, `mail.read`), ramenée à une forme comparable. */
export function porteeMicrosoft(p: string): string {
  return p
    .trim()
    .replace(/^https:\/\/graph\.microsoft\.com\//i, "")
    .replace(/^00000003-0000-0000-c000-000000000000\//i, "")
    .toLowerCase();
}

/**
 * Les portées rendues par l'échange. La page d'exemple les écrit encodées
 * comme dans une adresse (« https%3A%2F%2Fgraph.microsoft.com%2Fmail.read ») :
 * décodées d'abord, puis séparées.
 */
export function porteesRendues(brut: unknown): string[] {
  if (typeof brut !== "string") return [];
  let texte = brut;
  try {
    texte = decodeURIComponent(brut.replace(/\+/g, " "));
  } catch {
    /* gardé tel quel */
  }
  return texte.split(/[\s,]+/).filter(Boolean);
}

/** Les SharePoint de l'organisation : là où Graph envoie télécharger un fichier (`@microsoft.graph.downloadUrl`). */
export const hoteTelechargement = (hote: string): boolean => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sharepoint\.com$/.test(hote);

const CHOIX: Choix[] = [
  { id: "outlook", portees: ["Mail.Read", "Calendars.Read"], ecriture: ["Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"], revue: false },
  { id: "onedrive", portees: ["Files.Read"], revue: false },
  { id: "sharepoint", portees: ["Sites.Read.All"], revue: false, admin: true },
  { id: "excel", portees: ["Files.Read"], ecriture: ["Files.ReadWrite"], revue: false },
  { id: "word", portees: ["Files.Read"], revue: false },
  { id: "teams", portees: ["Team.ReadBasic.All", "Channel.ReadBasic.All", "ChannelMessage.Read.All"], ecriture: ["ChannelMessage.Send"], revue: false, admin: true },
  // Les portées d'écriture viennent des services cochés (`ecriture` de chacun) : ce choix n'en porte aucune lui-même.
  { id: "ecriture", portees: [], revue: false },
];

/** Ce que disent les codes AADSTS d'un refus au retour du consentement ; rien n'est recopié de la réponse. */
function refusMicrosoft(erreur: string, description: string): string | null {
  const d = `${erreur} ${description}`;
  // AADSTS65004, la personne a refusé : c'est le message ordinaire du refus, pas celui-ci.
  if (/AADSTS(65001|90094|90008)|admin_consent|consent_required/i.test(d)) {
    return t("Microsoft 365 demande le consentement d'un administrateur de l'annuaire pour certaines permissions (SharePoint et Teams en particulier, ou toutes si votre organisation interdit aux personnes de consentir). Un administrateur l'accorde dans le portail Entra (« Autorisations de l'API », « Accorder un consentement d'administrateur »), puis reconnectez-vous. Rien n'a été enregistré.");
  }
  if (/AADSTS50011/.test(d)) return t("Microsoft 365 refuse l'adresse de retour : déclarez http://localhost/microsoft à l'identique dans l'application, plateforme « Client public/natif (mobile et bureau) » ou « Web ». Rien n'a été enregistré.");
  if (/AADSTS700016/.test(d)) return t("Microsoft 365 ne trouve pas cette application dans l'annuaire indiqué : vérifiez l'identifiant de l'application et celui de l'annuaire. Rien n'a été enregistré.");
  if (/AADSTS50194/.test(d)) return t("L'application n'accepte que les comptes de son annuaire : indiquez l'identifiant de l'annuaire (tenant) plutôt que « common ». Rien n'a été enregistré.");
  return null;
}

export const DEFINITION_MICROSOFT: Definition = {
  id: "microsoft",
  nom: "Microsoft 365",
  google: false,
  // Remplacés par `adresses`, qui y met l'annuaire enregistré ; ceux-ci ne servent que s'il manquait.
  consentement: `https://${CONNEXION}/organizations/oauth2/v2.0/authorize`,
  jetons: { hote: CONNEXION, chemin: "/organizations/oauth2/v2.0/token", methode: "POST" },
  lecture: ["User.Read", "offline_access"],
  choix: CHOIX,
  // Les portées d'OpenID que Microsoft ajoute parfois à la réponse ; `offline_access` n'y figure pas toujours.
  implicites: ["openid", "profile", "email", "offline_access"],
  separateur: " ",
  pkce: "S256",
  retour: "boucle",
  cheminBoucle: "/microsoft",
  cleClient: "client_id",
  // « Application (client) ID » : un GUID.
  formeIdentifiant: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  secretFacultatif: true,
  boucleLocalhost: true,
  choixRequis: true,
  // `select_account` : l'administrateur choisit le compte à brancher, au lieu de celui déjà ouvert dans le navigateur.
  extras: { response_mode: "query", prompt: "select_account" },
  hotes: [CONNEXION, GRAPH],
  hoteAdmis: hoteTelechargement,
  annuaire: {
    lire: (brut) => {
      const a = annuaireSur(brut);
      return a ? { ok: true, valeur: a } : { ok: false, message: t("Collez l'identifiant de l'annuaire (« ID de l'annuaire (locataire) » sur la page de l'application), un domaine de l'organisation, ou « common ».") };
    },
    adresses: (annuaire) => ({
      consentement: `https://${CONNEXION}/${annuaire}/oauth2/v2.0/authorize`,
      jetons: { hote: CONNEXION, chemin: `/${annuaire}/oauth2/v2.0/token`, methode: "POST" },
    }),
  },
  relecture: { accordees: porteesRendues, normaliser: porteeMicrosoft },
  messages: {
    manquantes: (p) => tf("Microsoft 365 n'a pas accordé : {0}. Rien n'a été enregistré. Ajoutez ces permissions déléguées à l'application dans le portail Entra (« Autorisations de l'API »), faites accorder le consentement de l'administrateur si le tableau le demande, puis reconnectez-vous.", p.join(", ")),
    enTrop: (p) => tf("Microsoft 365 a accordé plus que les services cochés : {0}. Par prudence, rien n'a été enregistré. Retirez ces permissions de l'application dans le portail Entra (« Autorisations de l'API », et le consentement de l'administrateur qui les couvre), ou cochez les services qui s'en servent, puis reconnectez-vous.", p.join(", ")),
    debranche: () => t("Microsoft 365 a été débranché de cette instance, et l'accès enregistré effacé. Microsoft ne permet pas à une application de révoquer elle-même son accès : pour le couper aussi chez Microsoft, ouvrez dans le portail Entra « Applications d'entreprise », l'application, puis « Autorisations », et révoquez-les (ou supprimez le secret de l'application). Un jeton déjà délivré reste valable environ une heure."),
    refus: refusMicrosoft,
  },
  documentation: [
    "https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow",
    "https://learn.microsoft.com/en-us/entra/identity-platform/reply-url",
    "https://learn.microsoft.com/en-us/graph/permissions-reference",
    "https://learn.microsoft.com/en-us/graph/throttling-limits",
    "https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-application-permissions",
  ],
};

/* ------------------------------------------------------------------ */
/* Outils : noms, et phrases des cartes                                */
/* ------------------------------------------------------------------ */

/** Les lectures, par leur nom exact (approbation.ts, `LECTURES_NATIVES`). */
export const LECTURES_MICROSOFT = [
  "outlook__mails",
  "outlook__chercher",
  "outlook__lire",
  "outlook__agenda",
  "onedrive__lister",
  "onedrive__chercher",
  "onedrive__lire",
  "sharepoint__sites",
  "sharepoint__lister",
  "sharepoint__chercher",
  "sharepoint__lire",
  "excel__lire",
  "word__lire",
  "teams__equipes",
  "teams__messages",
];

/** Ce qui écrit, envoie ou poste : une carte à chaque appel, à tout niveau (approbation.ts, `ECRITURES_NATIVES`). */
export const ECRITURES_MICROSOFT = ["outlook__brouillon", "outlook__envoyer", "outlook__creer_evenement", "excel__ecrire", "teams__poster"];

/** Le service d'un outil, par son préfixe. */
export function serviceMicrosoft(nom: string): ServiceMicrosoft | null {
  const p = nom.slice(0, Math.max(0, nom.indexOf("__")));
  return (SERVICES_MICROSOFT as string[]).includes(p) ? (p as ServiceMicrosoft) : null;
}

/**
 * La phrase de la carte. La carte montre aussi les arguments entiers
 * (approbation.ts, `arguments`) : la phrase n'a que le début du texte, et dit
 * ce qui ne se reprend pas.
 */
export function resumeMicrosoft(outil: string, args: Record<string, unknown>): string | null {
  const extrait = (v: unknown, n = 120) => {
    const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
    return s ? ` « ${s.slice(0, n)}${s.length > n ? " …" : ""} »` : "";
  };
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20).join(", ") : typeof v === "string" ? v.slice(0, 400) : "");
  const pieces = Array.isArray(args.pieces) && args.pieces.length ? `, avec ${args.pieces.length} pièce(s) jointe(s) du dossier de travail (${liste(args.pieces)})` : "";
  switch (outil) {
    case "outlook__mails":
    case "outlook__chercher":
    case "outlook__lire":
      return "lire des mails de la boîte Outlook connectée";
    case "outlook__agenda":
      return "consulter l'agenda Outlook connecté";
    case "outlook__brouillon":
      return `préparer dans Outlook un brouillon pour ${liste(args.a) || "?"}${args.cc ? `, copie à ${liste(args.cc)}` : ""}, objet${extrait(args.objet)}${pieces} (il ne sera pas envoyé)`;
    case "outlook__envoyer":
      return `envoyer depuis Outlook, au nom du compte connecté, un mail à ${liste(args.a) || "?"}${args.cc ? `, copie à ${liste(args.cc)}` : ""}, objet${extrait(args.objet)}${pieces} (un mail envoyé ne se reprend pas)`;
    case "outlook__creer_evenement":
      return `créer dans l'agenda Outlook l'événement${extrait(args.titre)}, du ${typeof args.debut === "string" ? args.debut.slice(0, 40) : "?"} au ${typeof args.fin === "string" ? args.fin.slice(0, 40) : "?"}${args.invites ? `, en invitant ${liste(args.invites)} (les invitations partent aussitôt)` : ""}`;
    case "onedrive__lister":
    case "onedrive__chercher":
    case "onedrive__lire":
      return "consulter des fichiers OneDrive";
    case "sharepoint__sites":
    case "sharepoint__lister":
    case "sharepoint__chercher":
    case "sharepoint__lire":
      return "consulter des fichiers SharePoint";
    case "excel__lire":
      return "lire un classeur Excel";
    case "excel__ecrire": {
      const n = Array.isArray(args.valeurs) ? args.valeurs.length : 0;
      return `écrire ${n} ligne(s) dans le classeur Excel, onglet ${typeof args.onglet === "string" ? args.onglet.slice(0, 40) : "?"}, à partir de ${typeof args.cellule === "string" ? args.cellule.slice(0, 12) : "?"}, en remplaçant ce qui s'y trouve (valeurs seulement, jamais de formule)`;
    }
    case "word__lire":
      return "lire un document Word";
    case "teams__equipes":
    case "teams__messages":
      return "lire Microsoft Teams";
    case "teams__poster":
      return `poster dans Microsoft Teams, équipe « ${typeof args.equipe === "string" ? args.equipe.slice(0, 80) : "?"} », canal « ${typeof args.canal === "string" ? args.canal.slice(0, 80) : "?"} », au nom du compte connecté, le message${extrait(args.texte)} (un message posté ne se reprend pas)`;
  }
  return null;
}
