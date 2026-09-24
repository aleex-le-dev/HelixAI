import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.ts";
import { journaliser } from "./audit.ts";
import { deployment } from "./deployment.ts";
import { nouveauSecret, nouveauxCodesDeSecours, trouverSecours, verifierCode } from "./totp.ts";
import { revokeAll } from "./usersession.ts";
import { t } from "./langue.ts";

/**
 * Comptes, côté instance.
 *
 * Les empreintes de mots de passe ne quittent jamais le serveur : la
 * vérification se fait ici. Sans cela, chaque poste recevrait les empreintes de
 * tous ses collègues et pourrait les attaquer hors ligne.
 */

const ITERATIONS = 210_000;
const KEYLEN = 32;
const DIGEST = "sha256";

export interface StoredAccount {
  id: string;
  handle: string;
  fullName: string;
  email: string;
  initials: string;
  groupIds: string[];
  organisationId: string;
  createdAt: string;
  /**
   * Date à laquelle la personne a elle-même changé son adresse, si elle l'a
   * fait. Une adresse ainsi déclarée n'est vérifiée par rien (l'instance ne
   * sait pas envoyer de courrier) : elle ne rattache donc aucun partage adressé
   * par email. Voir `adresseDePartage`.
   */
  adresseDeclareeLe?: string;
  /**
   * Photo de profil, en image intégrée (`data:image/jpeg;base64,…`), réduite
   * sur le poste à 256 pixels. Visible des collègues, comme le nom.
   */
  photo?: string;
  /**
   * Adresses que ce compte a portées avant l'actuelle. Elles lui restent
   * réservées : voir `adresseReservee`. Ne sort jamais de l'instance, un
   * historique d'adresses n'a rien à faire sur les postes des collègues.
   */
  anciennesAdresses?: string[];
  /** Ne sort jamais de l'instance. */
  passwordHash?: string;
  salt?: string;
  /** Second facteur actif. Ne sort jamais de l'instance. Voir `gateway/src/totp.ts`. */
  deuxFacteurs?: DeuxFacteurs;
  /**
   * Secret tiré mais pas encore confirmé par un premier code juste. Tant qu'il
   * ne l'est pas, il ne protège rien et n'est pas demandé à la connexion :
   * quelqu'un qui abandonne à mi-chemin ne s'enferme pas dehors.
   */
  deuxFacteursEnAttente?: { secret: string; creeLe: string };
}

export interface DeuxFacteurs {
  /** Secret partagé avec l'application d'authentification, en base 32. */
  secret: string;
  activeLe: string;
  /** Dernier pas de trente secondes accepté : un code ne sert qu'une fois. */
  dernierPas?: number;
  /** Empreintes des codes de secours restants, et leur sel. */
  secours: string[];
  selSecours: string;
}

/** Compte tel qu'il est transmis aux postes : sans aucun secret. */
export interface PublicAccount
  extends Omit<
    StoredAccount,
    "passwordHash" | "salt" | "anciennesAdresses" | "deuxFacteurs" | "deuxFacteursEnAttente"
  > {
  /** Le poste a seulement besoin de savoir s'il faut demander un mot de passe. */
  hasPassword: boolean;
  /** Et s'il faudra un code après le mot de passe. */
  deuxFacteursActive: boolean;
}

/**
 * Longueur minimale d'un mot de passe.
 *
 * Dix caractères : c'est la règle de l'outil de récupération depuis le début,
 * elle vaut maintenant partout. Pas de règle de composition (majuscule,
 * chiffre, symbole) : elles poussent vers « Motdepasse1! » sans rien gagner,
 * alors que la longueur, elle, compte vraiment.
 */
export const MOT_DE_PASSE_MIN = 10;
/** Au-delà, ce n'est plus un mot de passe mais une charge envoyée à la passerelle. */
const MOT_DE_PASSE_MAX = 1024;

/** Raison du refus, ou `null` si le mot de passe convient. */
export function motDePasseRefuse(valeur: unknown): string | null {
  if (typeof valeur !== "string" || valeur.trim() === "") return "Un mot de passe est requis.";
  if (valeur.length < MOT_DE_PASSE_MIN) {
    return `Le mot de passe doit compter au moins ${MOT_DE_PASSE_MIN} caractères.`;
  }
  if (valeur.length > MOT_DE_PASSE_MAX) return "Ce mot de passe est trop long.";
  return null;
}

function derive(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString("hex");
}

async function load(): Promise<StoredAccount[]> {
  const value = await db().read("accounts");
  return Array.isArray(value) ? (value as StoredAccount[]) : [];
}

async function save(accounts: StoredAccount[]): Promise<void> {
  await db().write("accounts", accounts);
}

const normalise = (email: string) => email.trim().toLowerCase();

const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * File d'attente des écritures de comptes.
 *
 * Chaque mutation lit la collection, la modifie, puis la réécrit entière. Deux
 * requêtes simultanées pouvaient donc lire le même état : deux comptes
 * revendiquant la même adresse passaient chacun le contrôle d'unicité, et la
 * seconde écriture effaçait la première. En file, chacune relit ce que la
 * précédente a écrit.
 */
let file: Promise<unknown> = Promise.resolve();

function enFile<T>(travail: () => Promise<T>): Promise<T> {
  const suite = file.then(travail, travail);
  file = suite.catch(() => undefined);
  return suite;
}

/**
 * Cette adresse est-elle déjà tenue par un compte, ou l'a-t-elle été ?
 *
 * Une adresse abandonnée n'est pas rendue à la circulation. Les règles de
 * visibilité de l'instance (`gateway/src/authz.ts`) reconnaissent un membre de
 * projet ou un destinataire de partage à son identifiant **ou** à son adresse :
 * si Bruno quitte bruno@ pour une autre adresse, et qu'un nouveau compte prend
 * bruno@, ce nouveau compte verrait tous les projets où Bruno figure sous cette
 * adresse. Réserver l'ancienne adresse à son titulaire ferme cette porte, pour
 * les créations comme pour les changements.
 *
 * `sauf` exclut le compte qui demande : revenir à sa propre ancienne adresse
 * ne prend rien à personne.
 */
function adresseReservee(
  comptes: StoredAccount[],
  adresse: string,
  sauf?: string,
): "actuelle" | "ancienne" | null {
  for (const compte of comptes) {
    if (compte.id === sauf) continue;
    if (normalise(compte.email) === adresse) return "actuelle";
    if ((compte.anciennesAdresses ?? []).some((a) => normalise(a) === adresse)) {
      return "ancienne";
    }
  }
  return null;
}

/*
 * Valeur donnée à l'adresse de partage d'un compte qui a déclaré la sienne.
 * Elle ne peut correspondre à aucun destinataire réel : elle n'a pas d'arobase,
 * alors que les invitations ne portent que des adresses validées par
 * `FORME_EMAIL`. Le caractère nul de tête survit au `trim()` que la
 * comparaison applique (`memeEmail`, `gateway/src/authz.ts`) ; une chaîne vide,
 * elle, aurait correspondu à tout membre enregistré sans adresse.
 */
const AUCUNE_ADRESSE = "\u0000adresse-declaree";

/**
 * Adresse sous laquelle l'instance reconnaît ce compte dans les partages.
 *
 * Une invitation adressée par email (« partager avec claire@… ») est destinée à
 * celle ou celui qu'un collègue **inscrira** sous cette adresse : la création
 * d'un compte exige une séance, c'est-à-dire un collègue déjà connu qui se
 * porte garant. Un changement d'adresse, lui, est déclaré par la personne
 * seule, et rien ne le vérifie.
 *
 * Laisser une adresse déclarée rattacher les invitations reviendrait à rouvrir
 * la faille de prise de compte déjà fermée sur `/helix/auth/create` : il
 * suffirait de se déclarer à l'adresse d'une invitée en attente pour hériter
 * de ses projets et conversations. Un compte qui a changé son adresse n'est
 * donc plus reconnu que par son identifiant ; les partages qu'on lui adresse
 * ensuite le désignent d'ailleurs par identifiant, puisque l'interface
 * retrouve le compte à partir de l'adresse au moment d'inviter.
 */
export function adresseDePartage(compte: PublicAccount): string {
  return compte.adresseDeclareeLe ? AUCUNE_ADRESSE : compte.email;
}

/** Retire les secrets d'un compte avant de le transmettre. */
export function toPublic(account: StoredAccount): PublicAccount {
  const {
    passwordHash,
    salt: _salt,
    anciennesAdresses: _anciennes,
    deuxFacteurs,
    deuxFacteursEnAttente: _attente,
    ...rest
  } = account;
  return { ...rest, hasPassword: Boolean(passwordHash), deuxFacteursActive: Boolean(deuxFacteurs) };
}

export async function publicAccounts(): Promise<PublicAccount[]> {
  return (await load()).map(toPublic);
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function createAccount(input: {
  fullName: string;
  email: string;
  password?: string;
  organisationId?: string;
}): Promise<{ ok: true; account: PublicAccount } | { ok: false; reason: string }> {
  return enFile(() => creerCompte(input));
}

async function creerCompte(input: {
  fullName: string;
  email: string;
  password?: string;
  organisationId?: string;
}): Promise<{ ok: true; account: PublicAccount } | { ok: false; reason: string }> {
  const fullName = (input.fullName ?? "").trim();
  const email = normalise(input.email ?? "");

  if (!fullName || !email) return { ok: false, reason: "Nom et adresse email requis." };
  /*
   * Plus de compte sans mot de passe, pas même le premier. Un compte qu'on
   * ouvre par simple sélection est une porte ouverte dès que l'instance est
   * partagée : la liste des comptes est lisible avec le seul jeton d'instance,
   * donc ce jeton suffisait à prendre l'identité de n'importe qui.
   */
  const refus = motDePasseRefuse(input.password);
  if (refus) return { ok: false, reason: refus };
  if (!FORME_EMAIL.test(email)) {
    return { ok: false, reason: "Adresse email invalide." };
  }

  const accounts = await load();
  const reservee = adresseReservee(accounts, email);
  if (reservee === "actuelle") {
    return { ok: false, reason: "Un compte existe déjà avec cette adresse." };
  }
  if (reservee === "ancienne") {
    return { ok: false, reason: "Cette adresse a déjà servi à un compte de l'instance." };
  }

  const salt = randomBytes(16).toString("hex");
  const account: StoredAccount = {
    id: `u_${randomBytes(9).toString("base64url")}`,
    handle: email.split("@")[0] || fullName,
    fullName,
    email,
    initials: initialsOf(fullName),
    groupIds: [],
    organisationId: input.organisationId ?? "org_default",
    createdAt: new Date().toISOString(),
    salt,
    passwordHash: derive(input.password as string, salt),
  };

  await save([...accounts, account]);
  // La trace « compte.cree » est posée par la route, qui sait s'il s'agit de l'amorçage.
  return { ok: true, account: toPublic(account) };
}

/*
 * Limitation des tentatives.
 *
 * PBKDF2 à 210 000 itérations ralentit une attaque, il ne l'empêche pas : sans
 * ce frein, un poste du réseau peut essayer des milliers de mots de passe par
 * minute contre le compte d'un collègue. Après cinq échecs, le compte est
 * verrouillé une minute, et le délai double à chaque nouvelle série.
 */
const MAX_ECHECS = 5;
const BLOCAGE_BASE_MS = 60_000;
const BLOCAGE_MAX_MS = 15 * 60_000;

const echecs = new Map<string, { compte: number; jusqua: number }>();

/**
 * Redéfinit le mot de passe d'un compte, sans connaître l'ancien.
 *
 * Une empreinte PBKDF2 ne se relit pas : c'est voulu, et cela veut dire qu'un
 * mot de passe oublié verrouille l'instance pour de bon. Sur le poste d'une
 * PME, cela signifie perdre l'accès à ses propres dossiers. Il faut donc une
 * porte de service, et elle n'est ouverte qu'à qui tient déjà la machine :
 * cette fonction n'est appelée par aucune route HTTP, seulement par l'outil en
 * ligne de commande, qui exige un accès au poste et au trousseau. Quelqu'un
 * dans cette position pouvait de toute façon tout lire.
 *
 * Un nouveau sel est tiré à chaque fois : réutiliser l'ancien laisserait
 * deviner qu'un mot de passe a changé sans que l'empreinte bouge de forme.
 */
export async function definirMotDePasse(
  accountId: string,
  motDePasse: string,
): Promise<{ ok: boolean; raison?: string }> {
  const accounts = await load();
  const compte = accounts.find((a) => a.id === accountId);
  if (!compte) return { ok: false, raison: t("Compte introuvable.") };

  const salt = randomBytes(16).toString("hex");
  compte.salt = salt;
  compte.passwordHash = derive(motDePasse, salt);
  await save(accounts);

  /*
   * Et les séances tombent.
   *
   * C'est la raison même de cette porte de service : on redéfinit un mot de
   * passe parce qu'on l'a oublié, ou parce que quelqu'un d'autre le connaît.
   * Sans cette ligne, le jeton de séance de cet autre restait valable jusqu'à
   * douze heures, et jusqu'à trente jours tant qu'il s'en servait : changer le
   * mot de passe ne fermait rien.
   */
  const fermees = await revokeAll(accountId);

  journaliser("motdepasse.redefini", accountId, { par: "outil local", seancesFermees: fermees });
  return { ok: true };
}

/**
 * Premier mot de passe d'un compte créé sans.
 *
 * Ne vaut que pour un compte qui n'en a **aucun** : pour changer un mot de
 * passe existant, il faut connaître l'ancien, ou passer par l'outil local.
 *
 * Exposition, pesée : avant, quiconque tenait le jeton d'instance ouvrait une
 * séance sur un compte sans mot de passe par simple sélection. Désormais, la
 * même personne pourrait tout au plus poser le mot de passe à la place du
 * titulaire, une seule fois. La fenêtre n'est pas plus large qu'avant, et
 * elle se ferme définitivement au premier usage. En cas de litige, l'outil
 * local (`npm run motdepasse`) tranche, depuis le poste.
 */
export function definirPremierMotDePasse(
  accountId: string,
  motDePasse: unknown,
): Promise<{ ok: true; account: PublicAccount } | { ok: false; reason: string; statut: number }> {
  return enFile(async () => {
    const refus = motDePasseRefuse(motDePasse);
    if (refus) return { ok: false, reason: refus, statut: 400 };

    const accounts = await load();
    const compte = accounts.find((a) => a.id === accountId);
    if (!compte) return { ok: false, reason: "Compte introuvable.", statut: 404 };
    if (compte.passwordHash && compte.salt) {
      return { ok: false, reason: "Ce compte a déjà un mot de passe.", statut: 409 };
    }

    const salt = randomBytes(16).toString("hex");
    compte.salt = salt;
    compte.passwordHash = derive(motDePasse as string, salt);
    await save(accounts);
    journaliser("motdepasse.defini", accountId, {});
    return { ok: true, account: toPublic(compte) };
  });
}

/** Combien de temps ce compte reste-t-il bloqué ? 0 s'il ne l'est pas. */
function blocageRestant(accountId: string): number {
  const suivi = echecs.get(accountId);
  if (!suivi) return 0;
  const reste = suivi.jusqua - Date.now();
  if (reste <= 0) return 0;
  return reste;
}

function noterEchec(accountId: string): void {
  const suivi = echecs.get(accountId) ?? { compte: 0, jusqua: 0 };
  suivi.compte += 1;
  if (suivi.compte >= MAX_ECHECS) {
    const series = suivi.compte - MAX_ECHECS;
    suivi.jusqua = Date.now() + Math.min(BLOCAGE_BASE_MS * 2 ** series, BLOCAGE_MAX_MS);
  }
  echecs.set(accountId, suivi);
}

export async function verifyAccount(
  accountId: string,
  password?: string,
): Promise<
  | { ok: true; account: PublicAccount }
  | { ok: false; reason: string; aDefinir?: boolean; defi?: string; inscription?: string }
> {
  const attente = blocageRestant(accountId);
  if (attente > 0) {
    const secondes = Math.ceil(attente / 1000);
    journaliser("connexion.bloquee", accountId, { secondesRestantes: secondes });
    return {
      ok: false,
      reason: `Trop de tentatives. Réessayez dans ${secondes} seconde${secondes > 1 ? "s" : ""}.`,
    };
  }

  const account = (await load()).find((a) => a.id === accountId);
  if (!account) return { ok: false, reason: "Compte introuvable." };

  /*
   * Compte créé sans mot de passe, avant que la règle ne change : il ne
   * s'ouvre plus par simple sélection. La personne doit d'abord en définir un
   * (`definirPremierMotDePasse`) ; ensuite, le compte est protégé comme les
   * autres.
   */
  if (!account.passwordHash || !account.salt) {
    return { ok: false, reason: "Ce compte n'a pas encore de mot de passe : définissez-en un.", aDefinir: true };
  }
  if (!password) {
    noterEchec(accountId);
    return { ok: false, reason: "Mot de passe requis." };
  }

  const expected = Buffer.from(account.passwordHash, "hex");
  const given = Buffer.from(derive(password, account.salt), "hex");
  const valid = expected.length === given.length && timingSafeEqual(expected, given);

  if (!valid) {
    noterEchec(accountId);
    journaliser("connexion.refusee", accountId, { motif: "mot de passe incorrect" });
    return { ok: false, reason: "Mot de passe incorrect." };
  }

  /*
   * Mot de passe juste, second facteur actif : pas encore de séance. Les échecs
   * ne sont **pas** remis à zéro ici, sans quoi quelqu'un qui connaît le mot de
   * passe pourrait alterner mot de passe et codes au hasard sans jamais
   * atteindre le verrouillage. Ils ne le sont qu'une fois le code accepté.
   */
  if (account.deuxFacteurs) {
    journaliser("connexion.second_facteur_demande", accountId, {});
    return {
      ok: false,
      reason: "Saisissez le code affiché par votre application d'authentification.",
      defi: nouveauDefi(accountId),
    };
  }

  echecs.delete(accountId);

  /*
   * Instance qui impose le second facteur, compte qui n'en a pas : le mot de
   * passe est prouvé, mais la séance attendra que le second facteur soit
   * activé. Le défi d'inscription tient lieu de preuve du mot de passe pour
   * les deux pas suivants.
   */
  if (deuxFacteursObligatoire()) {
    journaliser("connexion.second_facteur_a_activer", accountId, {});
    return {
      ok: false,
      reason: "Votre instance exige la double authentification : activez-la pour vous connecter.",
      inscription: nouveauDefi(accountId, "inscription"),
    };
  }

  journaliser("connexion.reussie", accountId, {});
  return { ok: true, account: toPublic(account) };
}

/** L'instance impose-t-elle le second facteur à tous ? */
export const deuxFacteursObligatoire = (): boolean => deployment().deuxFacteursObligatoire === true;

/**
 * Un compte peut-il se servir d'une séance ? Non si l'instance impose le
 * second facteur et qu'il n'en a pas : une séance ouverte avant que la règle
 * ne soit posée ne doit pas la contourner.
 */
export function seanceAdmise(compte: PublicAccount): boolean {
  return !deuxFacteursObligatoire() || compte.deuxFacteursActive;
}

/* ------------------------------------------------------------------ */
/* Modification de son propre profil                                   */
/* ------------------------------------------------------------------ */

const NOM_MAX = 120;
const ADRESSE_MAX = 254;
// Caractères de contrôle : invisibles à l'écran, ils feraient d'un nom un piège.
const NON_AFFICHABLE = /[\u0000-\u001f\u007f]/;

export type ResultatProfil =
  | { ok: true; account: PublicAccount }
  /*
   * Jamais 401 pour un mot de passe refusé : l'interface lit tout 401 reçu
   * avec une séance comme une séance expirée, et ramène à l'écran de
   * connexion (`apiFetch`, src/lib/endpoint.ts). Une faute de frappe dans le
   * mot de passe déconnectait donc la personne. La séance est valide ; c'est
   * l'action qui est refusée, d'où 403.
   */
  | { ok: false; statut: 400 | 403 | 404 | 409 | 429; reason: string };

/**
 * Modifie le nom et, ou, l'adresse d'un compte.
 *
 * Cette fonction ne choisit pas le compte : c'est la route qui lui passe
 * l'identifiant tiré de la séance, jamais une valeur venue de la requête.
 *
 * Tout est validé avant que rien ne soit écrit : un nom accepté suivi d'une
 * adresse refusée laisserait la personne croire que rien n'a changé.
 *
 * L'adresse est un identifiant, d'où trois exigences :
 *  - le mot de passe actuel, si le compte en a un. Une séance se vole plus
 *    facilement qu'un mot de passe (poste resté ouvert) ; sans cette
 *    exigence, quelques secondes devant l'écran d'un collègue suffiraient à
 *    lui prendre son identifiant de connexion. Chaque échec compte dans le
 *    même blocage que la connexion, pour qu'on ne puisse pas deviner le mot
 *    de passe par cette route à la place de l'autre ;
 *  - une adresse libre, et qui n'a jamais servi à un autre compte
 *    (`adresseReservee`) ;
 *  - aucun héritage : l'adresse devient déclarée (`adresseDeclareeLe`), et une
 *    adresse déclarée ne rattache aucune invitation en attente
 *    (`adresseDePartage`).
 */
export function modifierProfil(
  accountId: string,
  changements: { fullName?: unknown; email?: unknown; password?: unknown; photo?: unknown },
): Promise<ResultatProfil> {
  return enFile(() => appliquerProfil(accountId, changements));
}

/** Taille maximale d'une photo, une fois décodée : largement de quoi faire 256 pixels. */
const PHOTO_MAX = 80 * 1024;

/**
 * Une photo n'est acceptée que si elle est bien une image : type déclaré ET
 * signature des premiers octets. Une « image » qui serait du SVG ou du HTML
 * n'est jamais stockée ; elle s'afficherait sur les postes des collègues.
 */
function photoValide(v: string): boolean {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) return false;
  const octets = Buffer.from(m[2] ?? "", "base64");
  if (octets.length === 0 || octets.length > PHOTO_MAX) return false;
  const debut = octets.subarray(0, 12);
  if (m[1] === "jpeg") return debut[0] === 0xff && debut[1] === 0xd8 && debut[2] === 0xff;
  if (m[1] === "png") return debut.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return debut.subarray(0, 4).toString("latin1") === "RIFF" && debut.subarray(8, 12).toString("latin1") === "WEBP";
}

async function appliquerProfil(
  accountId: string,
  changements: { fullName?: unknown; email?: unknown; password?: unknown; photo?: unknown },
): Promise<ResultatProfil> {
  const accounts = await load();
  const compte = accounts.find((a) => a.id === accountId);
  if (!compte) return { ok: false, statut: 404, reason: "Compte introuvable." };

  /* ---- Photo : une image valide, ou `null` pour la retirer ---- */
  if (changements.photo !== undefined) {
    if (changements.photo === null || changements.photo === "") {
      if (compte.photo) {
        delete compte.photo;
        await save(accounts);
        journaliser("compte.photo_modifiee", accountId, { retiree: true });
      }
      return { ok: true, account: toPublic(compte) };
    }
    if (typeof changements.photo !== "string" || !photoValide(changements.photo)) {
      return { ok: false, statut: 400, reason: "Photo refusée : une image JPEG, PNG ou WebP de 80 Ko au plus." };
    }
    compte.photo = changements.photo;
    await save(accounts);
    journaliser("compte.photo_modifiee", accountId, { octets: Math.round((changements.photo.length * 3) / 4) });
    return { ok: true, account: toPublic(compte) };
  }

  /*
   * Échec fermé : un champ présent mais qui n'est pas du texte n'est pas
   * « rien à changer », c'est une requête qu'on ne comprend pas.
   */
  for (const champ of ["fullName", "email", "password"] as const) {
    const valeur = changements[champ];
    if (valeur !== undefined && typeof valeur !== "string") {
      return { ok: false, statut: 400, reason: `Le champ « ${champ} » doit être du texte.` };
    }
  }
  const nomDemande = changements.fullName as string | undefined;
  const adresseDemandee = changements.email as string | undefined;
  const motDePasse = changements.password as string | undefined;

  /* ---- Nom ---- */
  let nouveauNom: string | null = null;
  if (nomDemande !== undefined) {
    if (NON_AFFICHABLE.test(nomDemande.replace(/[\t\n\r]/g, " "))) {
      return { ok: false, statut: 400, reason: "Le nom contient des caractères non affichables." };
    }
    const nom = nomDemande.trim().replace(/\s+/g, " ");
    if (!nom) return { ok: false, statut: 400, reason: "Le nom ne peut pas être vide." };
    if (nom.length > NOM_MAX) {
      return { ok: false, statut: 400, reason: `Le nom dépasse ${NOM_MAX} caractères.` };
    }
    if (nom !== compte.fullName) nouveauNom = nom;
  }

  /* ---- Adresse ---- */
  let nouvelleAdresse: string | null = null;
  if (adresseDemandee !== undefined) {
    const adresse = normalise(adresseDemandee);
    if (adresse !== normalise(compte.email)) {
      if (!FORME_EMAIL.test(adresse) || adresse.length > ADRESSE_MAX) {
        return { ok: false, statut: 400, reason: "Adresse email invalide." };
      }

      /*
       * Le mot de passe avant l'unicité : sans lui, une séance volée servirait
       * au moins à sonder quelles adresses ont déjà servi sur l'instance.
       */
      if (compte.passwordHash && compte.salt) {
        const attente = blocageRestant(accountId);
        if (attente > 0) {
          const secondes = Math.ceil(attente / 1000);
          journaliser("connexion.bloquee", accountId, { secondesRestantes: secondes });
          return {
            ok: false,
            statut: 429,
            reason: `Trop de tentatives. Réessayez dans ${secondes} seconde${secondes > 1 ? "s" : ""}.`,
          };
        }
        if (!motDePasse) {
          return {
            ok: false,
            statut: 400,
            reason: "Votre mot de passe actuel est requis pour changer d'adresse.",
          };
        }
        const attendu = Buffer.from(compte.passwordHash, "hex");
        const donne = Buffer.from(derive(motDePasse, compte.salt), "hex");
        if (!(attendu.length === donne.length && timingSafeEqual(attendu, donne))) {
          noterEchec(accountId);
          // Le mot de passe essayé ne figure évidemment pas dans la trace.
          journaliser("compte.adresse_refusee", accountId, { motif: "mot de passe incorrect" });
          return { ok: false, statut: 403, reason: "Mot de passe incorrect." };
        }
        echecs.delete(accountId);
      }

      const reservee = adresseReservee(accounts, adresse, accountId);
      if (reservee === "actuelle") {
        return { ok: false, statut: 409, reason: "Un compte existe déjà avec cette adresse." };
      }
      if (reservee === "ancienne") {
        return {
          ok: false,
          statut: 409,
          reason: "Cette adresse a déjà servi à un compte de l'instance.",
        };
      }
      nouvelleAdresse = adresse;
    }
  }

  if (nouveauNom === null && nouvelleAdresse === null) {
    return { ok: true, account: toPublic(compte) };
  }

  /* ---- Écriture, en une fois ---- */
  const nomAvant = compte.fullName;
  const adresseAvant = normalise(compte.email);

  if (nouveauNom !== null) {
    compte.fullName = nouveauNom;
    compte.initials = initialsOf(nouveauNom);
  }
  if (nouvelleAdresse !== null) {
    const adresse = nouvelleAdresse;
    compte.anciennesAdresses = [
      ...new Set([...(compte.anciennesAdresses ?? []), adresseAvant]),
    ].filter((a) => a !== adresse);
    compte.email = adresse;
    // L'identifiant affiché est tiré de l'adresse, comme à la création.
    compte.handle = adresse.split("@")[0] || compte.fullName;
    compte.adresseDeclareeLe = new Date().toISOString();
  }

  await save(accounts);

  if (nouveauNom !== null) {
    journaliser("compte.nom_modifie", accountId, { avant: nomAvant, apres: nouveauNom });
  }
  if (nouvelleAdresse !== null) {
    journaliser("compte.adresse_modifiee", accountId, {
      avant: adresseAvant,
      apres: nouvelleAdresse,
      motDePasseVerifie: Boolean(compte.passwordHash),
    });
  }
  return { ok: true, account: toPublic(compte) };
}

/* ------------------------------------------------------------------------ */
/*  Second facteur                                                           */
/* ------------------------------------------------------------------------ */

/*
 * Défi de connexion : ce que reçoit un poste dont le mot de passe était juste,
 * pour prouver au pas suivant qu'il l'a bien été. Il vit cinq minutes, sert
 * une fois, et tombe après cinq codes faux : il faut alors repasser par le mot
 * de passe. Gardé en mémoire seulement, un redémarrage de l'instance les
 * annule tous, ce qui ne coûte qu'une nouvelle saisie.
 */
const DUREE_DEFI_MS = 5 * 60_000;
const ESSAIS_PAR_DEFI = 5;
/** Un secret non confirmé au bout d'un quart d'heure est jeté. */
const DUREE_ATTENTE_MS = 15 * 60_000;

/**
 * Deux sortes de défis, qui ne s'échangent pas : `connexion` (le code est
 * attendu) et `inscription` (le second facteur est à activer, instance qui
 * l'impose). Un défi d'inscription vit un quart d'heure : il faut le temps de
 * sortir son téléphone et d'installer une application.
 */
type SorteDefi = "connexion" | "inscription";

const defis = new Map<
  string,
  { accountId: string; expire: number; essais: number; sorte: SorteDefi; secret?: string }
>();

function nouveauDefi(accountId: string, sorte: SorteDefi = "connexion"): string {
  const maintenant = Date.now();
  for (const [cle, d] of defis) if (d.expire <= maintenant) defis.delete(cle);
  const cle = randomBytes(24).toString("base64url");
  const duree = sorte === "inscription" ? DUREE_ATTENTE_MS : DUREE_DEFI_MS;
  defis.set(cle, { accountId, expire: maintenant + duree, essais: 0, sorte });
  return cle;
}

/** Défi valide de la sorte attendue, ou rien : un défi d'une autre sorte ne sert pas. */
function defiValide(defi: unknown, sorte: SorteDefi) {
  const d = typeof defi === "string" ? defis.get(defi) : undefined;
  if (!d || d.expire <= Date.now() || d.sorte !== sorte) {
    if (typeof defi === "string" && d && d.expire <= Date.now()) defis.delete(defi);
    return null;
  }
  return d;
}

type Refus = { ok: false; reason: string; statut: number };

function refusBlocage(accountId: string): Refus | null {
  const attente = blocageRestant(accountId);
  if (attente <= 0) return null;
  const secondes = Math.ceil(attente / 1000);
  journaliser("connexion.bloquee", accountId, { secondesRestantes: secondes });
  return {
    ok: false,
    statut: 429,
    reason: `Trop de tentatives. Réessayez dans ${secondes} seconde${secondes > 1 ? "s" : ""}.`,
  };
}

/**
 * Le mot de passe du compte, redemandé avant toute modification du second
 * facteur : une séance laissée ouverte sur un poste ne doit suffire ni à
 * l'activer avec le téléphone d'un autre, ni à le retirer.
 */
function controlerMotDePasse(compte: StoredAccount, motDePasse: unknown): Refus | null {
  const blocage = refusBlocage(compte.id);
  if (blocage) return blocage;
  if (!compte.passwordHash || !compte.salt) {
    return { ok: false, statut: 409, reason: "Définissez d'abord un mot de passe." };
  }
  if (typeof motDePasse !== "string" || !motDePasse) {
    return { ok: false, statut: 400, reason: "Votre mot de passe est requis." };
  }
  const attendu = Buffer.from(compte.passwordHash, "hex");
  const donne = Buffer.from(derive(motDePasse, compte.salt), "hex");
  if (!(attendu.length === donne.length && timingSafeEqual(attendu, donne))) {
    noterEchec(compte.id);
    journaliser("connexion.refusee", compte.id, { motif: "mot de passe incorrect", pour: "second facteur" });
    return { ok: false, statut: 403, reason: "Mot de passe incorrect." };
  }
  return null;
}

/**
 * Consomme un code : celui de l'application, ou l'un des codes de secours.
 * Modifie le compte en mémoire (pas consommé, code de secours retiré) ; à
 * l'appelant d'enregistrer.
 */
function consommerCode(
  df: DeuxFacteurs,
  code: unknown,
): { facteur: "application" | "code de secours" } | null {
  if (typeof code !== "string" || !code.trim() || code.length > 64) return null;
  const pas = verifierCode(df.secret, code, df.dernierPas);
  if (pas !== null) {
    df.dernierPas = pas;
    return { facteur: "application" };
  }
  const indice = trouverSecours(code, df.selSecours, df.secours);
  if (indice >= 0) {
    df.secours.splice(indice, 1);
    return { facteur: "code de secours" };
  }
  return null;
}

/** Second pas de la connexion. En cas de succès, l'appelant ouvre la séance. */
export function validerSecondFacteur(
  defi: unknown,
  code: unknown,
): Promise<{ ok: true; account: PublicAccount } | (Refus & { expire?: boolean })> {
  return enFile(async () => {
    const d = defiValide(defi, "connexion");
    if (!d) {
      return {
        ok: false,
        statut: 401,
        expire: true,
        reason: "Délai dépassé : saisissez de nouveau votre mot de passe.",
      };
    }

    const blocage = refusBlocage(d.accountId);
    if (blocage) return blocage;

    const accounts = await load();
    const compte = accounts.find((a) => a.id === d.accountId);
    if (!compte?.deuxFacteurs) {
      defis.delete(defi as string);
      return { ok: false, statut: 401, expire: true, reason: "Saisissez de nouveau votre mot de passe." };
    }

    const reconnu = consommerCode(compte.deuxFacteurs, code);
    if (!reconnu) {
      noterEchec(compte.id);
      d.essais += 1;
      journaliser("connexion.refusee", compte.id, { motif: "code de vérification incorrect" });
      if (d.essais >= ESSAIS_PAR_DEFI) {
        defis.delete(defi as string);
        return {
          ok: false,
          statut: 401,
          expire: true,
          reason: "Trop de codes erronés : saisissez de nouveau votre mot de passe.",
        };
      }
      return {
        ok: false,
        statut: 401,
        reason: "Code incorrect. Vérifiez aussi que l'heure du téléphone est juste.",
      };
    }

    await save(accounts);
    defis.delete(defi as string);
    echecs.delete(compte.id);
    journaliser("connexion.reussie", compte.id, {
      facteur: reconnu.facteur,
      ...(reconnu.facteur === "code de secours"
        ? { codesDeSecoursRestants: compte.deuxFacteurs.secours.length }
        : {}),
    });
    return { ok: true, account: toPublic(compte) };
  });
}

export interface EtatDeuxFacteurs {
  active: boolean;
  /** Imposée par l'instance : l'interface ne propose alors pas de la retirer. */
  obligatoire: boolean;
  activeLe?: string;
  codesDeSecoursRestants?: number;
}

export async function etatDeuxFacteurs(accountId: string): Promise<EtatDeuxFacteurs | null> {
  const compte = (await load()).find((a) => a.id === accountId);
  if (!compte) return null;
  const obligatoire = deuxFacteursObligatoire();
  if (!compte.deuxFacteurs) return { active: false, obligatoire };
  return {
    active: true,
    obligatoire,
    activeLe: compte.deuxFacteurs.activeLe,
    codesDeSecoursRestants: compte.deuxFacteurs.secours.length,
  };
}

/**
 * Premier temps de l'activation : tire le secret que la personne va scanner.
 * Rien n'est encore exigé à la connexion.
 */
export function preparerDeuxFacteurs(
  accountId: string,
  motDePasse: unknown,
): Promise<{ ok: true; secret: string } | Refus> {
  return enFile(async () => {
    const accounts = await load();
    const compte = accounts.find((a) => a.id === accountId);
    if (!compte) return { ok: false, statut: 404, reason: "Compte introuvable." };
    if (compte.deuxFacteurs) {
      return { ok: false, statut: 409, reason: "La vérification en deux étapes est déjà active." };
    }
    const refus = controlerMotDePasse(compte, motDePasse);
    if (refus) return refus;

    const secret = nouveauSecret();
    compte.deuxFacteursEnAttente = { secret, creeLe: new Date().toISOString() };
    await save(accounts);
    return { ok: true, secret };
  });
}

/**
 * Second temps : un premier code juste prouve que l'application a bien
 * enregistré le secret. Alors seulement le second facteur devient exigé, et
 * les codes de secours sont remis, une seule fois.
 */
export function activerDeuxFacteurs(
  accountId: string,
  code: unknown,
): Promise<{ ok: true; codesDeSecours: string[] } | Refus> {
  return enFile(async () => {
    const accounts = await load();
    const compte = accounts.find((a) => a.id === accountId);
    if (!compte) return { ok: false, statut: 404, reason: "Compte introuvable." };
    if (compte.deuxFacteurs) {
      return { ok: false, statut: 409, reason: "La vérification en deux étapes est déjà active." };
    }
    const attente = compte.deuxFacteursEnAttente;
    if (!attente || Date.now() - Date.parse(attente.creeLe) > DUREE_ATTENTE_MS) {
      return {
        ok: false,
        statut: 409,
        reason: "Le code à scanner a expiré. Recommencez l'activation.",
      };
    }
    const pas = typeof code === "string" ? verifierCode(attente.secret, code, undefined) : null;
    if (pas === null) {
      return {
        ok: false,
        statut: 400,
        reason: "Code incorrect. Vérifiez que l'heure du téléphone est juste, puis saisissez le code affiché.",
      };
    }

    const secours = nouveauxCodesDeSecours();
    compte.deuxFacteurs = {
      secret: attente.secret,
      activeLe: new Date().toISOString(),
      dernierPas: pas,
      secours: secours.empreintes,
      selSecours: secours.sel,
    };
    delete compte.deuxFacteursEnAttente;
    await save(accounts);
    journaliser("deuxfacteurs.active", accountId, {});
    return { ok: true, codesDeSecours: secours.codes };
  });
}

/**
 * Activation imposée, à la connexion : premier temps, le secret à scanner.
 * Le défi d'inscription prouve le mot de passe, saisi juste avant.
 */
export function preparerInscription(
  defi: unknown,
): Promise<{ ok: true; secret: string } | (Refus & { expire?: boolean })> {
  return enFile(async () => {
    const d = defiValide(defi, "inscription");
    if (!d) {
      return {
        ok: false,
        statut: 401,
        expire: true,
        reason: "Délai dépassé : saisissez de nouveau votre mot de passe.",
      };
    }
    // Un même défi garde son secret : recharger l'écran ne change pas le QR code.
    d.secret ??= nouveauSecret();
    return { ok: true, secret: d.secret };
  });
}

/** Activation imposée, second temps : premier code juste, séance ouverte par l'appelant. */
export function activerInscription(
  defi: unknown,
  code: unknown,
): Promise<
  | { ok: true; account: PublicAccount; codesDeSecours: string[] }
  | (Refus & { expire?: boolean })
> {
  return enFile(async () => {
    const d = defiValide(defi, "inscription");
    if (!d?.secret) {
      return {
        ok: false,
        statut: 401,
        expire: true,
        reason: "Délai dépassé : saisissez de nouveau votre mot de passe.",
      };
    }
    const pas = typeof code === "string" ? verifierCode(d.secret, code, undefined) : null;
    if (pas === null) {
      d.essais += 1;
      if (d.essais >= ESSAIS_PAR_DEFI) {
        defis.delete(defi as string);
        return {
          ok: false,
          statut: 401,
          expire: true,
          reason: "Trop de codes erronés : saisissez de nouveau votre mot de passe.",
        };
      }
      return {
        ok: false,
        statut: 400,
        reason: "Code incorrect. Vérifiez que l'heure du téléphone est juste, puis saisissez le code affiché.",
      };
    }

    const accounts = await load();
    const compte = accounts.find((a) => a.id === d.accountId);
    if (!compte) return { ok: false, statut: 404, reason: "Compte introuvable." };
    const secours = nouveauxCodesDeSecours();
    compte.deuxFacteurs = {
      secret: d.secret,
      activeLe: new Date().toISOString(),
      dernierPas: pas,
      secours: secours.empreintes,
      selSecours: secours.sel,
    };
    delete compte.deuxFacteursEnAttente;
    await save(accounts);
    defis.delete(defi as string);
    journaliser("deuxfacteurs.active", compte.id, { imposee: true });
    journaliser("connexion.reussie", compte.id, { facteur: "application", inscription: true });
    return { ok: true, account: toPublic(compte), codesDeSecours: secours.codes };
  });
}

/**
 * Défi d'inscription pour un compte qui vient de prouver son mot de passe par
 * une autre voie (création à l'amorçage, premier mot de passe).
 */
export function defiInscription(accountId: string): string {
  return nouveauDefi(accountId, "inscription");
}

/** Retrait par la personne elle-même : mot de passe et code exigés. */
export function desactiverDeuxFacteurs(
  accountId: string,
  motDePasse: unknown,
  code: unknown,
): Promise<{ ok: true; account: PublicAccount } | Refus> {
  return enFile(async () => {
    const accounts = await load();
    const compte = accounts.find((a) => a.id === accountId);
    if (!compte) return { ok: false, statut: 404, reason: "Compte introuvable." };
    if (!compte.deuxFacteurs) {
      return { ok: false, statut: 409, reason: "La vérification en deux étapes n'est pas active." };
    }
    if (deuxFacteursObligatoire()) {
      return {
        ok: false,
        statut: 403,
        reason: "Votre instance impose la double authentification : elle ne peut pas être retirée.",
      };
    }
    const refus = controlerMotDePasse(compte, motDePasse);
    if (refus) return refus;
    if (!consommerCode(compte.deuxFacteurs, code)) {
      noterEchec(accountId);
      return { ok: false, statut: 403, reason: "Code incorrect." };
    }
    delete compte.deuxFacteurs;
    await save(accounts);
    echecs.delete(accountId);
    journaliser("deuxfacteurs.desactive", accountId, { par: "titulaire" });
    return { ok: true, account: toPublic(compte) };
  });
}

/** Nouvelle série de codes de secours ; l'ancienne cesse aussitôt de valoir. */
export function regenererCodesDeSecours(
  accountId: string,
  motDePasse: unknown,
  code: unknown,
): Promise<{ ok: true; codesDeSecours: string[] } | Refus> {
  return enFile(async () => {
    const accounts = await load();
    const compte = accounts.find((a) => a.id === accountId);
    if (!compte) return { ok: false, statut: 404, reason: "Compte introuvable." };
    if (!compte.deuxFacteurs) {
      return { ok: false, statut: 409, reason: "La vérification en deux étapes n'est pas active." };
    }
    const refus = controlerMotDePasse(compte, motDePasse);
    if (refus) return refus;
    if (!consommerCode(compte.deuxFacteurs, code)) {
      noterEchec(accountId);
      return { ok: false, statut: 403, reason: "Code incorrect." };
    }
    const secours = nouveauxCodesDeSecours();
    compte.deuxFacteurs.secours = secours.empreintes;
    compte.deuxFacteurs.selSecours = secours.sel;
    await save(accounts);
    echecs.delete(accountId);
    journaliser("deuxfacteurs.codes_regeneres", accountId, {});
    return { ok: true, codesDeSecours: secours.codes };
  });
}

/**
 * Retrait sans code, pour qui a perdu téléphone **et** codes de secours.
 * Comme `definirMotDePasse`, aucune route HTTP n'y mène : seul l'outil local,
 * lancé sur le poste qui détient le trousseau, l'appelle.
 */
export async function retirerDeuxFacteurs(accountId: string): Promise<{ ok: boolean; raison?: string }> {
  const accounts = await load();
  const compte = accounts.find((a) => a.id === accountId);
  if (!compte) return { ok: false, raison: t("Compte introuvable.") };
  if (!compte.deuxFacteurs) return { ok: false, raison: t("Ce compte n'a pas de second facteur.") };
  delete compte.deuxFacteurs;
  delete compte.deuxFacteursEnAttente;
  await save(accounts);
  // Même raison que pour le mot de passe : cet outil sert quand on a perdu la
  // main, et une séance ouverte avant garderait ce que l'on vient de retirer.
  const fermees = await revokeAll(accountId);
  journaliser("deuxfacteurs.desactive", accountId, { par: "outil local", seancesFermees: fermees });
  return { ok: true };
}

/*
 * ------------------------------------------------------------------------
 *  Effacement (voir gateway/src/effacement.ts, qui orchestre l'ensemble)
 * ------------------------------------------------------------------------
 */

/**
 * La personne confirme qu'elle est bien elle : mot de passe, et code (ou code
 * de secours) si son second facteur est actif. Pour les gestes sans retour,
 * comme supprimer son compte.
 */
export function confirmerIdentite(
  accountId: string,
  motDePasse: unknown,
  code: unknown,
): Promise<Refus | null> {
  return enFile(async () => {
    const accounts = await load();
    const compte = accounts.find((a) => a.id === accountId);
    if (!compte) return { ok: false, statut: 404, reason: "Compte introuvable." };
    const refus = controlerMotDePasse(compte, motDePasse);
    if (refus) return refus;
    if (compte.deuxFacteurs) {
      if (!consommerCode(compte.deuxFacteurs, code)) {
        noterEchec(accountId);
        return {
          ok: false,
          statut: 403,
          reason: "Code de vérification incorrect (celui de l'application, ou un code de secours).",
        };
      }
      await save(accounts);
    }
    return null;
  });
}

/** Retire le compte lui-même. Le reste de ses données est traité par `effacement.ts`. */
export function retirerCompte(accountId: string): Promise<boolean> {
  return enFile(async () => {
    const accounts = await load();
    const reste = accounts.filter((a) => a.id !== accountId);
    if (reste.length === accounts.length) return false;
    await save(reste);
    echecs.delete(accountId);
    for (const [cle, d] of defis) if (d.accountId === accountId) defis.delete(cle);
    return true;
  });
}
