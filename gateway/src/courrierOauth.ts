import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { t, tf } from "./langue.ts";

/**
 * Brancher une boîte Google ou Microsoft en cliquant, plutôt qu'en remplissant
 * six champs et un mot de passe d'application.
 *
 * ── Pourquoi ce n'était pas déjà le cas ─────────────────────────────────────
 *
 * Les trente-trois autres services se branchent en un clic parce qu'ils
 * distribuent eux-mêmes un identifiant d'application, automatiquement
 * (enregistrement dynamique, RFC 7591). Google et Microsoft ne le font pas :
 * chez eux, un humain examine l'application, et pour l'accès à une boîte mail
 * c'est leur catégorie la plus surveillée — audit annuel par un cabinet agréé,
 * plusieurs milliers d'euros par an. Surtout, ils délivrent l'autorisation à
 * **une** application identifiée par un secret ; or celle-ci est installée
 * chez chaque client, sur sa machine, où un secret n'en est plus un.
 *
 * ── Ce que ce module fait, et pour qui ──────────────────────────────────────
 *
 * Il sert le cas de **l'entreprise**, qui est celui qui marche sans rien
 * demander à personne : une organisation sous Google Workspace ou Microsoft 365
 * déclare cette application comme **interne à son propre domaine**. Cinq
 * minutes pour son administrateur, et surtout : une application interne
 * **saute la vérification de l'éditeur**, parce qu'elle ne sort pas de la
 * maison. Chaque salarié voit alors un vrai bouton « Se connecter », et n'a
 * plus un seul champ à remplir.
 *
 * L'identifiant obtenu par l'administrateur est saisi une fois, dans l'écran
 * des connecteurs. Il n'a rien de secret au sens fort — il ne vaut que pour le
 * domaine de l'organisation, et le secret qui l'accompagne ne sert qu'à
 * l'échange de jetons, depuis l'instance.
 *
 * Pour un Gmail **personnel**, non : une application interne suppose un
 * Workspace. Le mot de passe d'application reste le chemin, et l'écran le dit
 * au lieu de le cacher.
 *
 * ── Ce qui protège l'échange ────────────────────────────────────────────────
 *
 * PKCE (RFC 7636) : l'autorisation part avec l'empreinte d'un secret tiré au
 * hasard, et l'échange du code exige ce secret. Un code intercepté dans le
 * navigateur ne vaut donc rien sans lui. Et un `state` tiré au hasard, comparé
 * à durée constante, ferme la porte au rejeu depuis une autre page.
 */

export type FournisseurCourrier = "google" | "microsoft";

interface Definition {
  nom: string;
  /** Adresse où la personne autorise, chez son fournisseur. */
  autorisation: (tenant: string) => string;
  /** Adresse où l'instance échange le code contre des jetons. */
  jetons: (tenant: string) => string;
  /** Droits demandés : le minimum pour lire et envoyer. */
  portee: string;
  /** Paramètres propres au fournisseur sur la demande d'autorisation. */
  extras?: Record<string, string>;
}

const DEFINITIONS: Record<FournisseurCourrier, Definition> = {
  google: {
    nom: "Google",
    autorisation: () => "https://accounts.google.com/o/oauth2/v2/auth",
    jetons: () => "https://oauth2.googleapis.com/token",
    // `https://mail.google.com/` est la portée qu'exige IMAP/SMTP chez Google.
    portee: "https://mail.google.com/",
    /*
     * `access_type=offline` et `prompt=consent` : sans eux, Google ne rend un
     * jeton de rafraîchissement qu'à la toute première autorisation, jamais
     * aux suivantes. L'instance se retrouverait alors sans moyen de renouveler
     * l'accès après une heure, et la boîte se débrancherait toute seule.
     */
    extras: { access_type: "offline", prompt: "consent" },
  },
  microsoft: {
    nom: "Microsoft",
    autorisation: (tenant) =>
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    jetons: (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    /*
     * `offline_access` est ce qui donne le jeton de rafraîchissement chez
     * Microsoft. Les deux autres portées sont celles d'IMAP et de SMTP, et
     * elles seules : pas de lecture de calendrier ni de fichiers.
     */
    portee:
      "offline_access https://outlook.office.com/IMAP.AccessAsUser.All " +
      "https://outlook.office.com/SMTP.Send",
  },
};

export interface ReglageOauthCourrier {
  fournisseur: FournisseurCourrier;
  clientId: string;
  /** Vide pour une application « publique » (PKCE seul). */
  clientSecret?: string;
  /**
   * Microsoft : le domaine ou l'identifiant du locataire. « organizations »
   * accepte tout compte professionnel, « common » y ajoute les comptes
   * personnels. On garde le domaine quand il est donné : c'est ce qui rend
   * l'application réellement interne.
   */
  tenant?: string;
}

export interface JetonsCourrier extends ReglageOauthCourrier {
  refreshToken: string;
  accessToken?: string;
  /** Horodatage de péremption du jeton d'accès, en millisecondes. */
  expire?: number;
}

/** Préfixe du `state` : le retour d'autorisation sait ainsi à qui il est. */
const PREFIXE = "courriel.";

export const estEtatCourrier = (etat: string): boolean => etat.startsWith(PREFIXE);

interface EnAttente {
  reglage: ReglageOauthCourrier;
  verificateur: string;
  adresse: string;
  redirection: string;
  expire: number;
}

/**
 * Autorisations commencées et pas encore revenues.
 *
 * En mémoire, et c'est voulu : une autorisation interrompue par un
 * redémarrage n'a aucune raison de survivre, et le vérificateur PKCE qu'elle
 * porte ne doit jamais toucher le disque.
 */
const enAttente = new Map<string, EnAttente>();
const DUREE_MS = 10 * 60 * 1000;

function menage(): void {
  const maintenant = Date.now();
  for (const [cle, valeur] of enAttente) if (valeur.expire < maintenant) enAttente.delete(cle);
}

const base64url = (b: Buffer): string =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const tenantDe = (r: ReglageOauthCourrier): string =>
  r.fournisseur === "microsoft" ? (r.tenant?.trim() || "organizations") : "common";

export function valider(
  brut: unknown,
): { ok: true; reglage: ReglageOauthCourrier } | { ok: false; message: string } {
  const r = (brut ?? {}) as Record<string, unknown>;
  const fournisseur = r.fournisseur;
  if (fournisseur !== "google" && fournisseur !== "microsoft") {
    return { ok: false, message: t("Fournisseur inconnu : attendu « google » ou « microsoft ».") };
  }
  const clientId = typeof r.clientId === "string" ? r.clientId.trim() : "";
  if (!clientId) {
    return {
      ok: false,
      message:
        "Indiquez l'identifiant d'application fourni par votre administrateur " +
        "(« client ID »). Sans lui, votre fournisseur ne sait pas qui demande l'accès.",
    };
  }
  const clientSecret = typeof r.clientSecret === "string" ? r.clientSecret.trim() : "";
  const tenant = typeof r.tenant === "string" ? r.tenant.trim() : "";
  if (tenant && !/^[A-Za-z0-9.\-]{1,120}$/.test(tenant)) {
    return { ok: false, message: t("Le locataire ne peut contenir que des lettres, chiffres, points et tirets.") };
  }
  return {
    ok: true,
    reglage: { fournisseur, clientId, ...(clientSecret ? { clientSecret } : {}), ...(tenant ? { tenant } : {}) },
  };
}

/** Adresse à ouvrir dans le navigateur, et le `state` qui l'accompagne. */
export function demarrer(
  reglage: ReglageOauthCourrier,
  adresse: string,
  redirection: string,
): { url: string; etat: string } {
  menage();
  const etat = PREFIXE + base64url(randomBytes(24));
  const verificateur = base64url(randomBytes(32));
  const defi = base64url(createHash("sha256").update(verificateur).digest());

  const def = DEFINITIONS[reglage.fournisseur];
  const champs = new URLSearchParams({
    client_id: reglage.clientId,
    response_type: "code",
    redirect_uri: redirection,
    scope: def.portee,
    state: etat,
    code_challenge: defi,
    code_challenge_method: "S256",
    /*
     * L'adresse est proposée d'emblée : la personne n'a plus qu'à confirmer,
     * et ne risque pas d'autoriser la mauvaise boîte parmi celles où elle est
     * déjà connectée.
     */
    login_hint: adresse,
    ...(def.extras ?? {}),
  });

  enAttente.set(etat, {
    reglage,
    verificateur,
    adresse,
    redirection,
    expire: Date.now() + DUREE_MS,
  });

  return { url: `${def.autorisation(tenantDe(reglage))}?${champs.toString()}`, etat };
}

/** Comparaison à durée constante de deux `state`. */
function memeEtat(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type Resultat =
  | { ok: true; jetons: JetonsCourrier; adresse: string }
  | { ok: false; message: string };

/** Échange le code contre des jetons. Consomme l'attente, quoi qu'il arrive. */
export async function achever(code: string, etat: string): Promise<Resultat> {
  menage();
  const cle = [...enAttente.keys()].find((k) => memeEtat(k, etat));
  const attente = cle ? enAttente.get(cle) : undefined;
  if (!cle || !attente) {
    return {
      ok: false,
      message: t("Cette autorisation n'est plus valable. Relancez-la depuis l'écran des connecteurs."),
    };
  }
  enAttente.delete(cle);

  const def = DEFINITIONS[attente.reglage.fournisseur];
  const corps = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: attente.redirection,
    client_id: attente.reglage.clientId,
    code_verifier: attente.verificateur,
    ...(attente.reglage.clientSecret ? { client_secret: attente.reglage.clientSecret } : {}),
  });

  try {
    const reponse = await fetch(def.jetons(tenantDe(attente.reglage)), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corps.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const texte = await reponse.text();
    if (!reponse.ok) {
      return { ok: false, message: tf("{0} a refusé l'échange : {1}", def.nom, lisible(texte)) };
    }
    const json = JSON.parse(texte) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.refresh_token) {
      return {
        ok: false,
        message:
          `${def.nom} n'a pas fourni de jeton de renouvellement. L'accès expirerait au bout ` +
          `d'une heure sans que rien ne puisse le prolonger. Retirez l'autorisation ` +
          `donnée à cette application dans votre compte ${def.nom}, puis recommencez.`,
      };
    }
    return {
      ok: true,
      adresse: attente.adresse,
      jetons: {
        ...attente.reglage,
        refreshToken: json.refresh_token,
        accessToken: json.access_token,
        expire: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
      },
    };
  } catch {
    return { ok: false, message: tf("{0} n'a pas répondu à la demande de jetons.", def.nom) };
  }
}

/**
 * Jeton d'accès valide, renouvelé si besoin.
 *
 * On renouvelle **une minute avant** la péremption annoncée : une connexion
 * IMAP ouverte avec un jeton qui expire pendant l'échange est un échec sans
 * explication, et l'horloge du poste n'est pas celle du fournisseur.
 */
export async function accesValide(
  jetons: JetonsCourrier,
): Promise<{ ok: true; acces: string; jetons: JetonsCourrier } | { ok: false; message: string }> {
  if (jetons.accessToken && jetons.expire && jetons.expire - 60_000 > Date.now()) {
    return { ok: true, acces: jetons.accessToken, jetons };
  }

  const def = DEFINITIONS[jetons.fournisseur];
  const corps = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: jetons.refreshToken,
    client_id: jetons.clientId,
    ...(jetons.clientSecret ? { client_secret: jetons.clientSecret } : {}),
  });

  try {
    const reponse = await fetch(def.jetons(tenantDe(jetons)), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corps.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const texte = await reponse.text();
    if (!reponse.ok) {
      return {
        ok: false,
        message:
          `${def.nom} a refusé de renouveler l'accès à la boîte : ${lisible(texte)}. ` +
          `Il faut rebrancher la boîte depuis l'écran des connecteurs.`,
      };
    }
    const json = JSON.parse(texte) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) {
      return { ok: false, message: tf("{0} n'a pas rendu de jeton d'accès.", def.nom) };
    }
    return {
      ok: true,
      acces: json.access_token,
      jetons: {
        ...jetons,
        accessToken: json.access_token,
        // Certains fournisseurs font tourner le jeton de renouvellement.
        refreshToken: json.refresh_token ?? jetons.refreshToken,
        expire: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
      },
    };
  } catch {
    return { ok: false, message: tf("{0} n'a pas répondu au renouvellement.", def.nom) };
  }
}

/**
 * La chaîne d'authentification XOAUTH2, telle que Google et Microsoft
 * l'attendent : `user=<adresse>^Aauth=Bearer <jeton>^A^A`, en base64, où `^A`
 * est l'octet 0x01. Ce format est le leur, pas un standard IETF.
 */
export const chaineXoauth2 = (adresse: string, acces: string): string =>
  Buffer.from(`user=${adresse}auth=Bearer ${acces}`, "utf8").toString("base64");

/** Le nom lisible d'un fournisseur, pour un message d'écran. */
export const nomFournisseur = (f: FournisseurCourrier): string => DEFINITIONS[f].nom;

/**
 * Extrait de la réponse d'erreur ce qui aide, sans recopier une page entière
 * dans un message d'interface.
 */
function lisible(texte: string): string {
  try {
    const json = JSON.parse(texte) as { error_description?: string; error?: string };
    return (json.error_description ?? json.error ?? texte).slice(0, 200);
  } catch {
    return texte.slice(0, 200);
  }
}
