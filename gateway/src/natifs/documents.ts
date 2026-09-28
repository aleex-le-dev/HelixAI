import { basename, extname } from "node:path";
import { borner, critereSur, minuitLocal } from "../clientHttps.ts";
import { tf } from "../langue.ts";
import { aChoisi, appelerApi, connecte, envoyer, ErreurNatif, type Definition, type ReponseApi } from "../oauthNatif.ts";
import { assembler, DONNEES, erreurApi, fichierDuDossier, fn, quand, refus, sousGarde, texte, type Genre, type Outil, type Resultat } from "../outilsNatifs.ts";

/**
 * Google Docs, Google Forms et Dropbox, branchés nativement (28/09/2026).
 *
 * Demandés par Medhi avec les autres familles de connecteurs, « comme les
 * connecteurs natifs existants » : même connexion (oauthNatif.ts), mêmes
 * garde-fous (outilsNatifs.ts, dont `sousGarde` et `fichierDuDossier`), mêmes
 * règles (SECURITE.md §§ 40 à 43, et § 45 pour ce qui est propre à ces trois).
 * Le code vit ici pour ne pas mêler trois services de plus aux registres
 * communs, que d'autres branches touchent le même jour.
 *
 * ── Ce que ce module apporte ────────────────────────────────────────────────
 *
 *  - les trois définitions (portées, hôtes, adresses), lues par oauthNatif.ts
 *    au chargement : c'est une **fonction** (`definitionsDocuments`), hissée
 *    par JavaScript, parce qu'oauthNatif.ts et ce module s'importent l'un
 *    l'autre ; une constante serait lue avant d'exister selon l'ordre de
 *    chargement (celui de Node comme celui du paquet d'esbuild) ;
 *  - ce qui est propre à Dropbox dans la connexion : lire le compte (l'essai
 *    qui précède l'enregistrement) et révoquer ;
 *  - les outils de l'agent, lectures libres, écritures sur carte d'accord.
 *
 * ── Règles, les mêmes qu'ailleurs ───────────────────────────────────────────
 *
 * Lecture par défaut ; écrire se coche à la connexion. Les trois écritures
 * (`docs__creer`, `docs__ajouter_texte`, `dropbox__envoyer`) sont dans
 * `ECRITURES_NATIVES` (approbation.ts) : une carte à chaque appel, à tout
 * niveau, même « Tout approuver », avec les arguments entiers ; réservées à
 * l'administrateur, vérifié par `callTool` au moment d'agir ; dix par heure et
 * par service, doublon refusé, place gardée après une réponse incertaine
 * (`sousGarde`). Aucune adresse ne vient du modèle : les hôtes sont ceux des
 * définitions, un document ou un formulaire est désigné par son identifiant,
 * dont la forme est vérifiée, un fichier Dropbox par son chemin dans le
 * Dropbox. Un fichier envoyé vient du dossier de travail, par
 * `fichierDuDossier` (chemin réel, zones protégées, lien, lien dur, tube
 * nommé, taille).
 *
 * ⚠ Rien de ceci n'a été essayé contre les vrais services (28/09/2026) : ni
 * compte Google Workspace, ni application Dropbox. Tout est vérifié contre de
 * faux serveurs écrits d'après la documentation citée à chaque définition
 * (scripts/essai-documents.mjs ; scripts/securite.mjs, section 16 ter).
 */

type GoogleCommun = Pick<Definition, "google" | "consentement" | "jetons" | "implicites" | "separateur" | "pkce" | "retour" | "cheminBoucle" | "cleClient" | "formeIdentifiant" | "extras">;

/* ------------------------------------------------------------------ */
/* Définitions                                                          */
/* ------------------------------------------------------------------ */

/**
 * Les trois définitions. Fonction hissée, sans rien lire du module au
 * chargement (voir l'en-tête) : tout est écrit dans son corps.
 */
export function definitionsDocuments(google: GoogleCommun): Record<"docs" | "forms" | "dropbox", Definition> {
  return {
    /*
     * Google Docs (https://developers.google.com/workspace/docs/api/auth, lu le
     * 28/09/2026) : `documents.readonly` (« See all your Google Docs
     * documents ») pour lire, `documents` (« See, edit, create, and delete all
     * your Google Docs documents ») pour créer un document et y ajouter du
     * texte. Toutes deux « sensibles », pas « restreintes » : aucune
     * vérification pour une application interne à un Workspace, écran « non
     * vérifiée » et 100 comptes au plus pour une application externe en test.
     * `drive.file` (non sensible) ne suffit pas : il ne voit que les fichiers
     * créés ou ouverts par l'application, pas un document qu'on nomme au
     * modèle. Méthodes : `documents.get`, `documents.create` (« Other fields in
     * the request, including any provided content, are ignored » : le texte
     * part donc par `batchUpdate`, `insertText` avec `endOfSegmentLocation`).
     * Quotas (https://developers.google.com/workspace/docs/api/limits) :
     * lectures 3000 par minute par projet, 300 par personne ; écritures 600 par
     * minute par projet, 60 par personne ; 429 au-delà.
     */
    docs: {
      ...google,
      id: "docs",
      nom: "Google Docs",
      lecture: ["https://www.googleapis.com/auth/documents.readonly"],
      choix: [{ id: "ecriture", portees: ["https://www.googleapis.com/auth/documents"], revue: false }],
      hotes: ["docs.googleapis.com", "oauth2.googleapis.com"],
      documentation: [
        "https://developers.google.com/workspace/docs/api/auth",
        "https://developers.google.com/workspace/docs/api/limits",
        "https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate",
      ],
    },
    /*
     * Google Forms, en lecture seule
     * (https://developers.google.com/workspace/forms/api/guides/retrieve-forms-responses,
     * lu le 28/09/2026) : `forms.body.readonly` pour le formulaire,
     * `forms.responses.readonly` pour ses réponses, les deux portées que les
     * méthodes `forms.get` et `forms.responses.list` acceptent sans ouvrir le
     * Drive (`drive`, `drive.readonly`, restreintes). Rien n'écrit un
     * formulaire : ce n'était pas demandé. Quotas
     * (https://developers.google.com/workspace/forms/api/limits) : lectures 975
     * par minute par projet, 390 par personne ; lister les réponses est une
     * lecture « coûteuse » : 450 par minute par projet, 180 par personne.
     */
    forms: {
      ...google,
      id: "forms",
      nom: "Google Forms",
      lecture: ["https://www.googleapis.com/auth/forms.body.readonly", "https://www.googleapis.com/auth/forms.responses.readonly"],
      choix: [],
      hotes: ["forms.googleapis.com", "oauth2.googleapis.com"],
      documentation: [
        "https://developers.google.com/workspace/forms/api/guides/retrieve-forms-responses",
        "https://developers.google.com/workspace/forms/api/reference/rest/v1/forms.responses/list",
        "https://developers.google.com/workspace/forms/api/limits",
      ],
    },
    /*
     * Dropbox, OAuth 2 avec PKCE (https://docs.dropboxapi.com/dropbox-api/docs/oauth
     * et https://dropbox.tech/developers/pkce--what-and-why-, lus le 28/09/2026) :
     *  - consentement sur `https://www.dropbox.com/oauth2/authorize`, jetons sur
     *    `https://api.dropboxapi.com/oauth2/token` ;
     *  - PKCE S256 ; l'échange se fait sans secret (« client_secret » absent de
     *    l'exemple PKCE) : l'application peut donc être saisie sans secret, qui,
     *    s'il est donné, part dans le corps comme dans l'exemple de
     *    renouvellement de https://dropbox.tech/developers/using-oauth-2-0-with-offline-access ;
     *  - `token_access_type=offline` pour un jeton d'actualisation ; jeton
     *    d'accès « short lived », sa durée est rendue par l'échange ;
     *  - `scope` : « a sub-set of scopes to request for that authorization »,
     *    rendu dans la réponse de jetons (https://dropbox.tech/developers/customizing-scopes-in-oauth-flow),
     *    donc relu comme ailleurs ;
     *  - adresse de retour : « This must be the exact URI registered in the App
     *    Console; even localhost must be listed » (SDK .NET de Dropbox) : aucun
     *    joker de port, d'où le retour par la route publique de l'instance ;
     *  - révocation : `POST /2/auth/token/revoke`, qui « disables that refresh
     *    token, as well as any other access tokens for that refresh token »
     *    (https://github.com/dropbox/dropbox-api-spec, auth.stone).
     *
     * Portées (onglet « Permissions » de l'application) : `account_info.read`
     * (lire le nom du compte, l'essai de la connexion), `files.metadata.read`
     * (lister, chercher), `files.content.read` (lire un fichier) ;
     * `files.content.write` pour envoyer, si on le coche. Rien qui efface,
     * déplace, partage (`sharing.*`) ou touche l'équipe (`team_*`).
     *
     * Sans examen : une application « en développement » se relie au compte de
     * sa créatrice, puis à 500 comptes au plus sur « Enable additional users » ;
     * au 50e, deux semaines pour obtenir le statut « production »
     * (https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide).
     * Limites : aucun chiffre publié ; 429 `too_many_requests` avec
     * `Retry-After`, ou `too_many_write_operations`
     * (https://docs.dropboxapi.com/dropbox-api/docs/performance). Envoi : 150 Mio
     * au plus par appel (`files/upload`, files.stone) ; on s'en tient à 50 Mo.
     */
    dropbox: {
      id: "dropbox",
      nom: "Dropbox",
      google: false,
      consentement: "https://www.dropbox.com/oauth2/authorize",
      jetons: { hote: "api.dropboxapi.com", chemin: "/oauth2/token", methode: "POST" },
      lecture: ["account_info.read", "files.metadata.read", "files.content.read"],
      choix: [{ id: "ecriture", portees: ["files.content.write"], revue: false }],
      implicites: [],
      separateur: " ",
      pkce: "S256",
      retour: "instance",
      cheminBoucle: "",
      cleClient: "client_id",
      // La « App key » de la console : quinze lettres minuscules et chiffres sur les applications relevées.
      formeIdentifiant: /^[a-z0-9]{10,20}$/,
      secretFacultatif: true,
      extras: { token_access_type: "offline" },
      hotes: ["api.dropboxapi.com", "content.dropboxapi.com"],
      documentation: [
        "https://docs.dropboxapi.com/dropbox-api/docs/oauth",
        "https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide",
        "https://docs.dropboxapi.com/dropbox-api/docs/performance",
      ],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Connexion Dropbox : l'essai et la révocation                         */
/* ------------------------------------------------------------------ */

const texteCourt = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").trim().slice(0, max) : "");

/** Lit le compte Dropbox avec le jeton obtenu (`users/get_current_account`, `account_info.read`) : rien n'est gardé s'il échoue. */
export async function identiteDropbox(acces: string): Promise<{ compte: string; ids: Record<string, string> }> {
  // RPC sans argument : ni corps ni type, comme l'exemple de la documentation.
  const r = await envoyer("dropbox", { methode: "POST", hote: "api.dropboxapi.com", chemin: "/2/users/get_current_account", entetes: { Authorization: `Bearer ${acces}` } });
  const id = r.json.account_id;
  if (r.statut !== 200 || typeof id !== "string" || !/^dbid:[A-Za-z0-9_-]{10,100}$/.test(id)) {
    throw new ErreurNatif(r.statut === 401 || r.statut === 403 ? "acces" : "api", tf("{0} n'a pas laissé lire le compte avec l'accès accordé (code {1}). Rien n'a été enregistré.", "Dropbox", r.statut));
  }
  const nom = texteCourt((r.json.name as { display_name?: unknown } | undefined)?.display_name);
  return { compte: nom || texteCourt(r.json.email) || "Dropbox", ids: { compte: id } };
}

/**
 * Révoque chez Dropbox. Le jeton d'accès ne vit que quelques heures : s'il est
 * refusé (expiré), on en demande un neuf avec le jeton d'actualisation, puis
 * c'est lui qui est révoqué, et le jeton d'actualisation avec lui.
 */
export async function revoquerDropbox(acces: string, renouveler: () => Promise<string | null>): Promise<boolean> {
  const revoquer = (jeton: string) => envoyer("dropbox", { methode: "POST", hote: "api.dropboxapi.com", chemin: "/2/auth/token/revoke", entetes: { Authorization: `Bearer ${jeton}` } });
  const r = await revoquer(acces);
  if (r.statut === 200) return true;
  if (r.statut !== 401) return false;
  const neuf = await renouveler().catch(() => null);
  return neuf ? (await revoquer(neuf)).statut === 200 : false;
}

/* ------------------------------------------------------------------ */
/* Outils proposés                                                      */
/* ------------------------------------------------------------------ */

const LIMITES = {
  // Ce qui est rendu au modèle d'un coup ; la suite se demande avec `a_partir_de`.
  fenetre: 15_000,
  texteEcrit: 50_000,
  titre: 200,
  reponses: 100,
  pagesReponses: 3,
  lectureDropbox: 1024 * 1024,
  envoiDropbox: 50 * 1024 * 1024,
  document: 8 * 1024 * 1024,
};

const P = {
  document: { type: "string", description: "L'adresse du document Google Docs (https://docs.google.com/document/d/…) ou son identifiant." },
  formulaire: { type: "string", description: "L'adresse de modification du formulaire (https://docs.google.com/forms/d/…/edit) ou son identifiant. Pas l'adresse publique en /forms/d/e/…, que l'API ne connaît pas." },
  aPartirDe: { type: "number", description: "Pour lire la suite d'un long texte : le numéro du caractère où reprendre, donné à la fin de la lecture précédente." },
  dossierDropbox: { type: "string", description: "Un dossier du Dropbox, par exemple « /Clients/2026 ». À omettre pour la racine." },
};

/** Synchrone, comme les autres connecteurs natifs : seulement les outils des services branchés, et de ce qu'ils ont accordé. */
export function outilsDocuments(): Outil[] {
  const outils: Outil[] = [];
  if (connecte("docs")) {
    outils.push(fn("docs__lire", "Lit le texte d'un document Google Docs (tous ses onglets, paragraphes et tableaux), par morceaux de 15 000 caractères.", { document: P.document, a_partir_de: P.aPartirDe }, ["document"]));
    if (aChoisi("docs", "ecriture")) {
      outils.push(fn("docs__creer", "Crée un document Google Docs dans le compte connecté, avec un titre et, si on le donne, un texte. La personne voit le titre et le texte entiers et doit l'accepter avant. N'appelle cet outil qu'une fois par document.", { titre: { type: "string", description: "Le titre du document, 200 caractères au plus." }, texte: { type: "string", description: "Le texte du document, 50 000 caractères au plus. Facultatif." } }, ["titre"]));
      outils.push(fn("docs__ajouter_texte", "Ajoute du texte à la fin d'un document Google Docs, dans un nouveau paragraphe, sans rien effacer. La personne voit le texte entier et doit l'accepter avant.", { document: P.document, texte: { type: "string", description: "Le texte à ajouter, 50 000 caractères au plus." } }, ["document", "texte"]));
    }
  }
  if (connecte("forms")) {
    outils.push(fn("forms__lire", "Lit un formulaire Google Forms : titre, description, questions et choix proposés.", { formulaire: P.formulaire }, ["formulaire"]));
    outils.push(fn("forms__reponses", "Lit les réponses d'un formulaire Google Forms, les plus récentes d'abord, chaque réponse avec ses questions.", { formulaire: P.formulaire, nombre: { type: "number", description: "Nombre de réponses, 20 par défaut, 100 au plus." }, depuis: { type: "string", description: "Seulement les réponses envoyées depuis ce jour, au format AAAA-MM-JJ. Facultatif." } }, ["formulaire"]));
  }
  if (connecte("dropbox")) {
    outils.push(fn("dropbox__lister", "Liste le contenu d'un dossier du Dropbox connecté : sous-dossiers et fichiers, avec leur taille et leur date.", { dossier: P.dossierDropbox, nombre: { type: "number", description: "Nombre d'éléments, 50 par défaut, 200 au plus." } }));
    outils.push(fn("dropbox__chercher", "Cherche des fichiers et dossiers dans le Dropbox connecté, par leur nom ou leur contenu.", { requete: { type: "string", description: "Les mots à chercher." }, dossier: { ...P.dossierDropbox, description: "Pour chercher dans un dossier seulement. Facultatif." }, nombre: { type: "number", description: "Nombre de résultats, 20 par défaut, 100 au plus." } }, ["requete"]));
    outils.push(fn("dropbox__lire", "Lit un fichier texte du Dropbox connecté (TXT, Markdown, CSV, JSON, XML, HTML…, 1 Mo au plus), par morceaux de 15 000 caractères.", { chemin: { type: "string", description: "Le chemin du fichier dans le Dropbox, par exemple « /Clients/notes.txt », tel que rendu par dropbox__lister ou dropbox__chercher." }, a_partir_de: P.aPartirDe }, ["chemin"]));
    if (aChoisi("dropbox", "ecriture")) {
      outils.push(fn("dropbox__envoyer", "Envoie un fichier du dossier de travail vers le Dropbox connecté (50 Mo au plus). Un fichier du même nom déjà présent n'est jamais remplacé. La personne voit le fichier et le dossier de destination et doit l'accepter avant.", { fichier: { type: "string", description: "Le chemin du fichier dans le dossier de travail." }, dossier: { ...P.dossierDropbox, description: "Le dossier du Dropbox où le déposer, par exemple « /Clients/2026 ». À omettre pour la racine." } }, ["fichier"]));
    }
  }
  return outils;
}

/** Rend `null` pour un outil qui n'est pas de ces trois services : outilsNatifs.ts le refuse alors lui-même. */
export async function executerDocuments(nom: string, args: Record<string, unknown>): Promise<Resultat | null> {
  switch (nom) {
    case "docs__lire":
      return docsLire(args);
    case "docs__creer":
      return docsCreer(args);
    case "docs__ajouter_texte":
      return docsAjouter(args);
    case "forms__lire":
      return formsLire(args);
    case "forms__reponses":
      return formsReponses(args);
    case "dropbox__lister":
      return dropboxLister(args);
    case "dropbox__chercher":
      return dropboxChercher(args);
    case "dropbox__lire":
      return dropboxLire(args);
    case "dropbox__envoyer":
      return dropboxEnvoyer(args);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Communs                                                              */
/* ------------------------------------------------------------------ */

const bearer = (acces: string) => ({ Authorization: `Bearer ${acces}` });

/** Un morceau d'un long texte, et de quoi demander la suite : le modèle n'a rien à recompter. */
function fenetre(entete: string, tout: string, brut: unknown, outil: string): string {
  const depart = Math.min(Math.max(0, Math.trunc(Number(brut)) || 0), tout.length);
  const fin = Math.min(tout.length, depart + LIMITES.fenetre);
  const suite = fin < tout.length ? `\n… (suite : rappelle ${outil} avec a_partir_de=${fin})` : "";
  return `${entete} ${tout.length.toLocaleString("fr-FR")} caractère(s) en tout ; voici les caractères ${depart} à ${fin} :\n${DONNEES}\n${tout.slice(depart, fin)}${suite}`;
}

/**
 * Le texte qui partira dans un document : les caractères de commande que Google
 * retire de toute façon, et ceux qui renversent l'ordre d'affichage. La carte
 * d'accord retire ces derniers de ce qu'elle montre (approbation.ts,
 * `nettoyer`) : les envoyer ferait lire au document autre chose que ce que la
 * carte a montré (le même écart est relevé pour les posts, SECURITE.md § 41.3).
 */
const texteDocument = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "");

/* ------------------------------ Google Docs ------------------------------- */

function idGoogle(brut: unknown, genre: "document" | "forms"): string | null {
  const v = critereSur(brut, 500);
  if (!v) return null;
  const m = new RegExp(`/${genre}/d/([A-Za-z0-9_-]+)`).exec(v);
  const id = m ? m[1]! : v;
  return /^[A-Za-z0-9_-]{20,100}$/.test(id) && id !== "e" ? id : null;
}

type Element = Record<string, unknown>;
const tableau = (v: unknown): Element[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Element[]) : []);

/** Le texte d'un contenu de Google Docs : paragraphes, tableaux (une ligne par rangée), table des matières. */
function texteContenu(contenu: unknown, profondeur = 0): string[] {
  if (profondeur > 6) return [];
  const lignes: string[] = [];
  for (const el of tableau(contenu)) {
    const paragraphe = el.paragraph as { elements?: unknown } | undefined;
    if (paragraphe) {
      lignes.push(tableau(paragraphe.elements).map((e) => ((e.textRun as { content?: unknown } | undefined)?.content as string | undefined) ?? "").filter((x) => typeof x === "string").join("").replace(/\n$/, ""));
    }
    const table = el.table as { tableRows?: unknown } | undefined;
    for (const rangee of tableau(table?.tableRows)) {
      lignes.push(tableau(rangee.tableCells).map((c) => texteContenu(c.content, profondeur + 1).join(" ").trim()).join(" | "));
    }
    const sommaire = el.tableOfContents as { content?: unknown } | undefined;
    if (sommaire) lignes.push(...texteContenu(sommaire.content, profondeur + 1));
  }
  return lignes;
}

/** Les onglets d'un document, et leurs sous-onglets, dans l'ordre (`includeTabsContent=true`). */
function texteOnglets(onglets: unknown, profondeur = 0): string[] {
  if (profondeur > 4) return [];
  const sortie: string[] = [];
  for (const o of tableau(onglets)) {
    const titre = texte((o.tabProperties as { title?: unknown } | undefined)?.title, 200);
    const corps = texteContenu(((o.documentTab as { body?: { content?: unknown } } | undefined)?.body)?.content);
    sortie.push(`## Onglet « ${titre || "sans titre"} »`, ...corps);
    sortie.push(...texteOnglets(o.childTabs, profondeur + 1));
  }
  return sortie;
}

async function docsLire(args: Record<string, unknown>): Promise<Resultat> {
  const id = idGoogle(args.document, "document");
  if (!id) return refus("Donne « document » : l'adresse du document Google Docs, ou son identifiant.");
  const r = await appelerApi("docs", (a) => ({ methode: "GET", hote: "docs.googleapis.com", chemin: `/v1/documents/${id}?includeTabsContent=true`, entetes: bearer(a), octets: LIMITES.document }));
  if (r.statut !== 200) throw erreurApi("Google Docs", r);
  const onglets = tableau(r.json.tabs);
  const lignes = onglets.length > 1 || tableau(onglets[0]?.childTabs).length > 0 ? texteOnglets(onglets) : texteContenu(((onglets[0]?.documentTab as { body?: { content?: unknown } } | undefined)?.body ?? (r.json.body as { content?: unknown } | undefined))?.content);
  const tout = lignes.map((l) => texte(l, 100_000)).join("\n").trim();
  if (!tout) return { ok: true, content: `Document « ${texte(r.json.title, 200)} » : il est vide.` };
  return { ok: true, content: fenetre(`Document « ${texte(r.json.title, 200)} » (https://docs.google.com/document/d/${id}/edit) :`, tout, args.a_partir_de, "docs__lire") };
}

/** Le texte à écrire, vérifié : présent si exigé, borné, nettoyé comme la carte le montre. */
function texteAEcrire(brut: unknown, exige: boolean): { ok: true; texte: string } | { ok: false; message: string } {
  const v = typeof brut === "string" ? texteDocument(brut).trim() : "";
  if (!v && exige) return { ok: false, message: "Donne « texte », le texte à écrire." };
  if (v.length > LIMITES.texteEcrit) return { ok: false, message: `Texte trop long : ${LIMITES.texteEcrit.toLocaleString("fr-FR")} caractères au plus à la fois. Découpe-le ; rien n'a été écrit.` };
  return { ok: true, texte: v };
}

/** `insertText` à la fin du corps (segment vide) : rien de ce qui est déjà écrit n'est touché. */
const insertion = (acces: string, id: string, texteInsere: string) => ({
  methode: "POST" as const,
  hote: "docs.googleapis.com",
  chemin: `/v1/documents/${id}:batchUpdate`,
  entetes: { ...bearer(acces), "Content-Type": "application/json" },
  corps: JSON.stringify({ requests: [{ insertText: { text: texteInsere, endOfSegmentLocation: { segmentId: "" } } }] }),
});

async function docsCreer(args: Record<string, unknown>): Promise<Resultat> {
  const titre = typeof args.titre === "string" ? texteDocument(args.titre).replace(/\s+/g, " ").trim() : "";
  if (!titre) return refus("Donne « titre », le titre du document.");
  if (titre.length > LIMITES.titre) return refus(`Titre trop long : ${LIMITES.titre} caractères au plus.`);
  const t = texteAEcrire(args.texte, false);
  if (!t.ok) return refus(t.message);
  return sousGarde("docs", `creer|${titre}|${t.texte}`, async () => {
    const r = await appelerApi("docs", (a) => ({ methode: "POST", hote: "docs.googleapis.com", chemin: "/v1/documents", entetes: { ...bearer(a), "Content-Type": "application/json" }, corps: JSON.stringify({ title: titre }) }));
    const id = texte(r.json.documentId, 120);
    if (r.statut !== 200 || !/^[A-Za-z0-9_-]{20,100}$/.test(id)) throw erreurApi("Google Docs", r);
    const lien = `https://docs.google.com/document/d/${id}/edit`;
    if (!t.texte) return { ok: true, content: `Document « ${titre} » créé, vide (${lien}). C'est fait : ne le recrée pas.` };
    /*
     * Le document existe désormais : un échec du texte ne rend pas la place
     * (le modèle recréerait un second document). On le dit, avec le lien.
     */
    const ecrit = await appelerApi("docs", (a) => insertion(a, id, t.texte)).catch(() => null);
    if (!ecrit || ecrit.statut !== 200) {
      return { ok: true, content: `Document « ${titre} » créé (${lien}), mais le texte n'a pas pu y être écrit${ecrit ? ` (code ${ecrit.statut})` : ""}. Ne le recrée pas : dis-le à l'utilisateur ; docs__ajouter_texte peut y ajouter le texte.` };
    }
    return { ok: true, content: `Document « ${titre} » créé avec son texte (${t.texte.length.toLocaleString("fr-FR")} caractères) : ${lien}. C'est fait : ne le recrée pas.` };
  });
}

async function docsAjouter(args: Record<string, unknown>): Promise<Resultat> {
  const id = idGoogle(args.document, "document");
  if (!id) return refus("Donne « document » : l'adresse du document Google Docs, ou son identifiant.");
  const t = texteAEcrire(args.texte, true);
  if (!t.ok) return refus(t.message);
  return sousGarde("docs", `ajouter|${id}|${t.texte}`, async () => {
    // Un saut de ligne d'abord : le texte commence un nouveau paragraphe au lieu de prolonger le dernier.
    const r = await appelerApi("docs", (a) => insertion(a, id, `\n${t.texte}`));
    if (r.statut !== 200) throw erreurApi("Google Docs", r);
    return { ok: true, content: `Texte ajouté à la fin du document (${t.texte.length.toLocaleString("fr-FR")} caractères) : https://docs.google.com/document/d/${id}/edit. C'est fait : ne le refais pas.` };
  });
}

/* ------------------------------ Google Forms ------------------------------ */

function idFormulaire(brut: unknown): { id: string } | { erreur: string } {
  const v = critereSur(brut, 500) ?? "";
  // L'adresse publique (/forms/d/e/…/viewform) porte un autre identifiant, que l'API ne connaît pas.
  if (/\/forms\/d\/e\//.test(v)) return { erreur: "Cette adresse est celle que remplissent les répondants (/forms/d/e/…) : l'API ne la connaît pas. Demande à l'utilisateur l'adresse de modification du formulaire (https://docs.google.com/forms/d/…/edit)." };
  const id = idGoogle(v, "forms");
  return id ? { id } : { erreur: "Donne « formulaire » : l'adresse de modification du formulaire Google Forms (https://docs.google.com/forms/d/…/edit), ou son identifiant." };
}

interface Question {
  id: string;
  titre: string;
  genre: string;
  choix: string[];
}

/** Les questions d'un formulaire, groupes (grilles) compris : la clé des réponses est l'identifiant de question. */
function questionsDe(form: Record<string, unknown>): { titre: string; description: string; lignes: string[]; questions: Map<string, Question> } {
  const questions = new Map<string, Question>();
  const lignes: string[] = [];
  const genreDe = (q: Record<string, unknown>): { genre: string; choix: string[] } => {
    const choix = q.choiceQuestion as { type?: unknown; options?: unknown } | undefined;
    if (choix) return { genre: choix.type === "CHECKBOX" ? "cases à cocher" : choix.type === "DROP_DOWN" ? "liste déroulante" : "choix unique", choix: tableau(choix.options).map((o) => (o.isOther ? "Autre" : texte(o.value, 200))).filter(Boolean) };
    if (q.textQuestion) return { genre: (q.textQuestion as { paragraph?: unknown }).paragraph ? "texte long" : "texte court", choix: [] };
    if (q.scaleQuestion) {
      const s = q.scaleQuestion as { low?: unknown; high?: unknown };
      return { genre: `échelle de ${Number(s.low) || 0} à ${Number(s.high) || 0}`, choix: [] };
    }
    if (q.dateQuestion) return { genre: "date", choix: [] };
    if (q.timeQuestion) return { genre: "heure", choix: [] };
    if (q.fileUploadQuestion) return { genre: "fichier envoyé", choix: [] };
    if (q.ratingQuestion) return { genre: "note", choix: [] };
    return { genre: "question", choix: [] };
  };
  let n = 0;
  for (const item of tableau(form.items)) {
    const titre = texte(item.title, 500) || "(sans titre)";
    const question = (item.questionItem as { question?: Element } | undefined)?.question;
    if (question) {
      const g = genreDe(question);
      const id = texte(question.questionId, 40);
      if (id) questions.set(id, { id, titre, ...g });
      lignes.push(`${++n}. ${titre} (${g.genre}${question.required ? ", obligatoire" : ""})${g.choix.length ? ` : ${g.choix.join(" / ")}` : ""}`);
      continue;
    }
    const groupe = item.questionGroupItem as { questions?: unknown; grid?: { columns?: { options?: unknown } } } | undefined;
    if (groupe) {
      const colonnes = tableau(groupe.grid?.columns?.options).map((o) => texte(o.value, 200)).filter(Boolean);
      lignes.push(`${++n}. ${titre} (grille${colonnes.length ? ` : ${colonnes.join(" / ")}` : ""})`);
      for (const q of tableau(groupe.questions)) {
        const ligne = texte((q.rowQuestion as { title?: unknown } | undefined)?.title, 300);
        const id = texte(q.questionId, 40);
        if (id) questions.set(id, { id, titre: `${titre} / ${ligne}`, genre: "grille", choix: colonnes });
        lignes.push(`   - ${ligne}`);
      }
      continue;
    }
    if (item.pageBreakItem) lignes.push(`— Section : ${titre}`);
    else if (item.textItem) lignes.push(`(Texte : ${titre}${item.description ? ` : ${texte(item.description, 500)}` : ""})`);
  }
  const info = (form.info ?? {}) as { title?: unknown; description?: unknown; documentTitle?: unknown };
  return { titre: texte(info.title, 300) || texte(info.documentTitle, 300) || "(sans titre)", description: texte(info.description, 2000), lignes, questions };
}

async function lireFormulaire(id: string): Promise<Record<string, unknown>> {
  const r = await appelerApi("forms", (a) => ({ methode: "GET", hote: "forms.googleapis.com", chemin: `/v1/forms/${id}`, entetes: bearer(a) }));
  if (r.statut !== 200) throw erreurApi("Google Forms", r);
  return r.json;
}

async function formsLire(args: Record<string, unknown>): Promise<Resultat> {
  const f = idFormulaire(args.formulaire);
  if ("erreur" in f) return refus(f.erreur);
  const form = await lireFormulaire(f.id);
  const q = questionsDe(form);
  const repondre = texte(form.responderUri, 300);
  return {
    ok: true,
    content: assembler(`Formulaire « ${q.titre} »${repondre.startsWith("https://docs.google.com/forms/") ? ` (à remplir : ${repondre})` : ""}${q.description ? `. Description : ${q.description}` : ""}. ${q.questions.size} question(s) :`, q.lignes.length ? q.lignes : ["(aucune question)"]),
  };
}

async function formsReponses(args: Record<string, unknown>): Promise<Resultat> {
  const f = idFormulaire(args.formulaire);
  if ("erreur" in f) return refus(f.erreur);
  const n = borner(args.nombre, 20, LIMITES.reponses);
  let filtre = "";
  if (args.depuis !== undefined && args.depuis !== "") {
    // La date n'est jamais recopiée : trois nombres, un instant reconstruit (clientHttps.ts, `minuitLocal`).
    const ms = typeof args.depuis === "string" ? minuitLocal(args.depuis) : null;
    if (ms === null) return refus("« depuis » s'écrit AAAA-MM-JJ, par exemple 2026-09-01.");
    filtre = `&filter=${encodeURIComponent(`timestamp >= ${new Date(ms).toISOString()}`)}`;
  }
  const form = await lireFormulaire(f.id);
  const q = questionsDe(form);
  // L'API ne promet aucun ordre : quelques pages sont lues, puis triées, les plus récentes d'abord.
  const toutes: Element[] = [];
  let jeton = "";
  let incomplet = false;
  for (let page = 0; page < LIMITES.pagesReponses; page++) {
    const suite = jeton ? `&pageToken=${encodeURIComponent(jeton)}` : "";
    const r = await appelerApi("forms", (a) => ({ methode: "GET", hote: "forms.googleapis.com", chemin: `/v1/forms/${f.id}/responses?pageSize=1000${filtre}${suite}`, entetes: bearer(a) }));
    if (r.statut !== 200) throw erreurApi("Google Forms", r);
    toutes.push(...tableau(r.json.responses));
    jeton = texte(r.json.nextPageToken, 500);
    if (!jeton) break;
    if (page === LIMITES.pagesReponses - 1) incomplet = true;
  }
  const moment = (x: Element) => Date.parse(String(x.lastSubmittedTime ?? x.createTime ?? "")) || 0;
  toutes.sort((a, b) => moment(b) - moment(a));
  const lignes = toutes.slice(0, n).map((x) => {
    const reponses = Object.entries((x.answers ?? {}) as Record<string, Element>).map(([cle, rep]) => {
      const valeurs = [
        ...tableau((rep.textAnswers as { answers?: unknown } | undefined)?.answers).map((v) => texte(v.value, 1000)),
        ...tableau((rep.fileUploadAnswers as { answers?: unknown } | undefined)?.answers).map((v) => `fichier ${texte(v.fileName, 200)}`),
      ].filter(Boolean);
      const note = rep.grade && typeof (rep.grade as { score?: unknown }).score === "number" ? ` [note ${(rep.grade as { score: number }).score}]` : "";
      return `${q.questions.get(cle)?.titre ?? `question ${texte(cle, 40)}`} : ${valeurs.join(", ") || "(vide)"}${note}`;
    });
    const qui = texte(x.respondentEmail, 200);
    return `- Réponse du ${quand(x.lastSubmittedTime ?? x.createTime)}${qui ? ` (${qui})` : ""}${typeof x.totalScore === "number" ? `, score ${x.totalScore}` : ""} : ${reponses.join(" ; ") || "(aucune réponse)"}`;
  });
  if (lignes.length === 0) return { ok: true, content: `Formulaire « ${q.titre} » : aucune réponse${filtre ? " depuis cette date" : ""}.` };
  const total = `${toutes.length.toLocaleString("fr-FR")}${incomplet ? " (au moins ; les plus anciennes n'ont pas été lues)" : ""}`;
  return { ok: true, content: assembler(`Formulaire « ${q.titre} » : ${total} réponse(s)${filtre ? " depuis cette date" : ""} ; voici les ${lignes.length} plus récente(s) :`, lignes) };
}

/* -------------------------------- Dropbox --------------------------------- */

/**
 * `Dropbox-API-Arg` est un en-tête HTTP : Dropbox demande d'y échapper tout ce
 * qui n'est pas ASCII (« HTTP header safe JSON »). Un nom accentué y part
 * donc en `é`, jamais tel quel.
 */
export const argEntete = (v: unknown): string => JSON.stringify(v).replace(/[\u007F-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/**
 * Un chemin du Dropbox, donné par le modèle : dans le Dropbox connecté, jamais
 * une adresse. Sans commande ni retour à la ligne (critereSur), ramené à la
 * forme « /dossier/fichier » ; « id:… » (identifiant rendu par Dropbox) accepté.
 */
function cheminDropbox(brut: unknown, racinePermise: boolean): string | null {
  if (brut === undefined || brut === null || brut === "") return racinePermise ? "" : null;
  const v = critereSur(brut, 1000);
  if (!v) return null;
  if (/^id:[A-Za-z0-9_-]{1,100}$/.test(v)) return v;
  const chemin = `/${v.replace(/\\/g, "/").replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (!chemin) return racinePermise ? "" : null;
  // `..` ne remonte rien chez Dropbox ; refusé quand même, pour que la carte et le chemin disent la même chose.
  if (chemin.split("/").some((p) => p === "." || p === "..")) return null;
  return chemin;
}

/** Une erreur de Dropbox dite simplement. 409 : erreur propre à la route, dont le résumé est un code court (`path/not_found/..`). */
function erreurDropbox(r: ReponseApi): ErreurNatif {
  if (r.statut === 409) {
    const code = texte(r.json.error_summary, 200);
    if (/not_found/.test(code)) return new ErreurNatif("api", "Dropbox ne trouve pas ce chemin, ou le compte connecté n'y a pas accès (code 409). Vérifie avec dropbox__lister ou dropbox__chercher.");
    if (/conflict/.test(code)) return new ErreurNatif("api", "Un fichier ou un dossier du même nom existe déjà à cet endroit du Dropbox : rien n'a été remplacé. Dis-le à l'utilisateur ; propose un autre dossier, ou de renommer le fichier dans le dossier de travail.");
    if (/insufficient_space/.test(code)) return new ErreurNatif("quota", "Le Dropbox connecté est plein : rien n'a été envoyé. Dis-le à l'utilisateur.");
    if (/malformed_path|disallowed_name/.test(code)) return new ErreurNatif("api", "Dropbox refuse ce chemin ou ce nom de fichier (code 409).");
    if (/restricted_content|not_file|not_folder/.test(code)) return new ErreurNatif("api", "Dropbox refuse cette action sur cet élément (dossier au lieu d'un fichier, ou contenu restreint).");
    return new ErreurNatif("api", "Dropbox a refusé la requête (code 409).");
  }
  if (r.statut === 400) return new ErreurNatif("api", "Dropbox a refusé la requête (code 400) : chemin ou paramètre mal formé.");
  return erreurApi("Dropbox", r);
}

const rpc = (chemin: string, corps: unknown) => appelerApi("dropbox", (a) => ({ methode: "POST", hote: "api.dropboxapi.com", chemin, entetes: { ...bearer(a), "Content-Type": "application/json" }, corps: JSON.stringify(corps) }));

const taille = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "?";
  return n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
};

/** Une entrée de Dropbox, en une ligne : genre, chemin, taille et date pour un fichier. */
function ligneDropbox(m: Element): string {
  const chemin = texte(m.path_display, 1000) || texte(m.name, 300);
  if (m[".tag"] === "folder") return `- [dossier] ${chemin}`;
  if (m[".tag"] === "file") return `- ${chemin} (${taille(m.size)}, modifié le ${quand(m.server_modified)})`;
  return `- [${texte(m[".tag"], 20) || "élément"}] ${chemin}`;
}

async function dropboxLister(args: Record<string, unknown>): Promise<Resultat> {
  const chemin = cheminDropbox(args.dossier, true);
  if (chemin === null) return refus("Chemin de dossier illisible : écris-le comme « /Clients/2026 », ou omets-le pour la racine.");
  const n = borner(args.nombre, 50, 200);
  const r = await rpc("/2/files/list_folder", { path: chemin, limit: n });
  if (r.statut !== 200) throw erreurDropbox(r);
  const entrees = tableau(r.json.entries).slice(0, n);
  if (entrees.length === 0) return { ok: true, content: `Le dossier ${chemin || "/"} du Dropbox est vide.` };
  const lignes = entrees.map(ligneDropbox);
  if (r.json.has_more === true) lignes.push("… (le dossier contient d'autres éléments : demande-en plus, ou un sous-dossier)");
  return { ok: true, content: assembler(`Dossier ${chemin || "/"} du Dropbox, ${entrees.length} élément(s) :`, lignes) };
}

async function dropboxChercher(args: Record<string, unknown>): Promise<Resultat> {
  const requete = critereSur(args.requete, 1000);
  if (!requete) return refus("Donne « requete », les mots à chercher.");
  const chemin = cheminDropbox(args.dossier, true);
  if (chemin === null) return refus("Chemin de dossier illisible : écris-le comme « /Clients/2026 », ou omets-le.");
  const n = borner(args.nombre, 20, 100);
  const r = await rpc("/2/files/search_v2", { query: requete, options: { ...(chemin ? { path: chemin } : {}), max_results: n, file_status: "active" } });
  if (r.statut !== 200) throw erreurDropbox(r);
  // `matches[].metadata` est un « MetadataV2 », qui porte la métadonnée elle-même dans `metadata`.
  const trouves = tableau(r.json.matches).map((m) => {
    const v2 = (m.metadata ?? {}) as Element;
    return (v2.metadata && typeof v2.metadata === "object" ? v2.metadata : v2) as Element;
  });
  if (trouves.length === 0) return { ok: true, content: `Rien trouvé dans le Dropbox pour « ${requete} ».` };
  return { ok: true, content: assembler(`${trouves.length} résultat(s) dans le Dropbox pour « ${requete} » :`, trouves.slice(0, n).map(ligneDropbox)) };
}

/** Ce qui se lit comme du texte. Un PDF ou un document bureautique n'est pas proposé ici : il se télécharge et se relit ailleurs. */
const EXTENSIONS_TEXTE = new Set([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".xml", ".html", ".htm", ".yaml", ".yml", ".log", ".ini", ".toml", ".srt", ".vtt", ".tex", ".sql", ".css", ".js", ".ts", ".py", ".sh", ".rtf"]);

async function dropboxLire(args: Record<string, unknown>): Promise<Resultat> {
  const chemin = cheminDropbox(args.chemin, false);
  if (!chemin) return refus("Donne « chemin » : le chemin du fichier dans le Dropbox, par exemple « /Clients/notes.txt ».");
  // La métadonnée d'abord : un dossier, un fichier trop gros ou qui n'est pas du texte n'est pas téléchargé.
  const m = await rpc("/2/files/get_metadata", { path: chemin });
  if (m.statut !== 200) throw erreurDropbox(m);
  if (m.json[".tag"] !== "file") return refus("Ce chemin désigne un dossier : utilise dropbox__lister.");
  const nom = texte(m.json.name, 300);
  if (!EXTENSIONS_TEXTE.has(extname(nom).toLowerCase())) return refus(`« ${nom} » n'est pas un fichier texte (TXT, Markdown, CSV, JSON, XML, HTML…) : cet outil ne lit que ceux-là.`);
  const octets = Number(m.json.size);
  if (!Number.isFinite(octets) || octets > LIMITES.lectureDropbox) return refus(`« ${nom} » fait ${taille(m.json.size)} : cet outil lit 1 Mo au plus.`);
  const id = texte(m.json.id, 120);
  // Par son identifiant : c'est le fichier vérifié ci-dessus qui est lu, même s'il a été remplacé entre-temps sous le même nom.
  const cible = /^id:[A-Za-z0-9_-]{1,100}$/.test(id) ? id : chemin;
  const r = await appelerApi("dropbox", (a) => ({ methode: "POST", hote: "content.dropboxapi.com", chemin: "/2/files/download", entetes: { ...bearer(a), "Dropbox-API-Arg": argEntete({ path: cible }) }, octets: LIMITES.lectureDropbox + 1024 }));
  if (r.statut !== 200) throw erreurDropbox(r);
  if (r.brut.includes(0)) return refus(`« ${nom} » contient des octets nuls : ce n'est pas un texte.`);
  let contenu: string;
  try {
    contenu = new TextDecoder("utf-8", { fatal: true }).decode(r.brut);
  } catch {
    return refus(`« ${nom} » n'est pas un texte en UTF-8 : il ne se lit pas ici.`);
  }
  contenu = contenu.replace(/^﻿/, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (!contenu.trim()) return { ok: true, content: `Le fichier ${texte(m.json.path_display, 1000) || nom} est vide.` };
  return { ok: true, content: fenetre(`Fichier ${texte(m.json.path_display, 1000) || nom} du Dropbox (${taille(octets)}, modifié le ${quand(m.json.server_modified)}) :`, contenu, args.a_partir_de, "dropbox__lire") };
}

/**
 * Ce qu'on envoie du dossier de travail vers Dropbox : des documents de
 * travail, par leur extension sur le chemin réel (`fichierDuDossier`). Ni
 * exécutable, ni script, ni fichier caché de configuration : rien qui ne
 * serve qu'à la machine.
 */
const FICHIER_DROPBOX: Genre = {
  cle: "fichier",
  service: "Dropbox",
  quoi: "le fichier",
  forme: "un document (PDF, texte, Word, Excel, PowerPoint, OpenDocument, CSV, Markdown), une image, un son, une vidéo ou une archive ZIP",
  types: {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".json": "application/json",
    ".xml": "application/xml",
    ".html": "text/html",
    ".rtf": "application/rtf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".zip": "application/zip",
  },
  max: LIMITES.envoiDropbox,
};

async function dropboxEnvoyer(args: Record<string, unknown>): Promise<Resultat> {
  const dossier = cheminDropbox(args.dossier, true);
  if (dossier === null || dossier.startsWith("id:")) return refus("Dossier de destination illisible : écris-le comme « /Clients/2026 », ou omets-le pour la racine.");
  const fichier = await fichierDuDossier(args.fichier, FICHIER_DROPBOX);
  if ("erreur" in fichier) return refus(fichier.erreur);
  /*
   * Le nom déposé est celui que la carte a montré (le dernier morceau du chemin
   * donné), pas celui du fichier réel : un lien du dossier vers un autre
   * fichier du dossier garde le nom que l'administrateur a lu.
   */
  const nom = basename(String(args.fichier).trim().replace(/\\/g, "/"));
  if (!nom || nom === "." || nom === ".." || /[\u0000-\u001F]/.test(nom)) return refus("Nom de fichier illisible.");
  const destination = `${dossier}/${nom}`;
  return sousGarde("dropbox", `${fichier.chemin}|${fichier.taille}|${destination}`, async () => {
    /*
     * `mode: add` et `autorename: false` : un fichier du même nom n'est jamais
     * remplacé ni doublé d'un « (1) ». `strict_conflict` : même un fichier aux
     * octets identiques compte comme un conflit (files.stone). Les octets sont
     * ceux lus par `fichierDuDossier`, sur le fichier ouvert.
     */
    const r = await appelerApi("dropbox", (a) => ({
      methode: "POST",
      hote: "content.dropboxapi.com",
      chemin: "/2/files/upload",
      entetes: { ...bearer(a), "Content-Type": "application/octet-stream", "Dropbox-API-Arg": argEntete({ path: destination, mode: "add", autorename: false, mute: false, strict_conflict: true }) },
      corps: fichier.octets,
      delaiTotalMs: 10 * 60_000,
    }));
    if (r.statut !== 200) throw erreurDropbox(r);
    return { ok: true, content: `Fichier envoyé vers le Dropbox : ${texte(r.json.path_display, 1000) || destination} (${taille(r.json.size ?? fichier.taille)}). C'est fait : ne le renvoie pas.` };
  });
}
