import { randomBytes } from "node:crypto";
import { chiffrer, dechiffrer } from "./secret.ts";
import { db, type StoredCollection } from "./db.ts";
import { journaliser } from "./audit.ts";
import { nomProduit } from "./marque.ts";

/**
 * Autorisation OAuth des services distants, pour le bouton « Se connecter ».
 *
 * ── Pourquoi ce module existe ────────────────────────────────────────────────
 *
 * Brancher un outil demandait jusqu'ici d'aller chercher un jeton chez le
 * fournisseur, de comprendre où il se cache, et de le recopier. C'est le geste
 * d'un informaticien, pas celui d'une personne qui veut simplement que son
 * agent lise ses tickets. Tous les services font autrement depuis quinze ans :
 * on clique « Se connecter », on dit oui dans son navigateur, c'est fini.
 *
 * ── Comment on le fait sans rien céder ───────────────────────────────────────
 *
 * Les plateformes qui vendent « mille outils en un clic » tiennent, elles, les
 * jetons de leurs clients sur leurs serveurs : tout passe chez elles. Ce n'est
 * pas une option ici. Le protocole MCP décrit une autre voie, et c'est celle
 * que suit ce module :
 *
 *  1. le service publie son serveur MCP à une adresse HTTPS ;
 *  2. l'instance découvre toute seule où demander l'autorisation
 *     (`/.well-known/oauth-protected-resource`, puis les métadonnées du serveur
 *     d'autorisation) ;
 *  3. elle **s'enregistre elle-même** comme application auprès du service
 *     (enregistrement dynamique, RFC 7591) : aucun identifiant d'application à
 *     créer à la main, ni chez nous, ni chez le client ;
 *  4. la personne autorise dans son navigateur, avec PKCE ;
 *  5. le jeton revient à l'instance, y est chiffré, et n'en sort plus.
 *
 * Aucun tiers n'est en travers. Le secret reste sur la machine du client, et
 * le service ne connaît que l'instance, pas nous.
 *
 * Quand un service ne sait pas s'enregistrer tout seul, il reste la voie
 * ancienne : coller un jeton (voir connecteurs.ts). On ne prétend pas que
 * tout est automatique alors que ce n'est pas vrai.
 */

/**
 * Collection **interne** : absente de la synchronisation, comme les
 * connecteurs. Des jetons d'accès recopiés vers chaque poste du parc ne
 * seraient plus des secrets. Chiffrés ici, avant le magasin, parce que
 * l'implémentation PostgreSQL de db.ts, elle, ne chiffre pas.
 */
const COLLECTION: StoredCollection = "oauth";

/** Ce qu'on garde pour un service, une fois l'autorisation obtenue. */
interface Autorisation {
  /** Identifiant du connecteur dans le catalogue. */
  id: string;
  /** Adresse du serveur MCP distant. */
  url: string;
  /** Enregistrement de l'instance auprès du service (RFC 7591), chiffré. */
  client?: unknown;
  /** Jetons d'accès et de rafraîchissement, chiffrés. */
  jetons?: unknown;
  /** Vérificateur PKCE de l'autorisation en cours, chiffré. Effacé après. */
  verificateur?: unknown;
  /** `state` de l'autorisation en cours : il lie le retour à la demande. */
  etat?: string;
  /** Compte qui a lancé l'autorisation : c'est à lui que le retour appartient. */
  pour?: string;
  /** Adresse de retour telle qu'elle a été enregistrée auprès du service. */
  retour?: string;
  depuis?: string;
}

let enMemoire: Autorisation[] | null = null;

async function lire(): Promise<Autorisation[]> {
  if (enMemoire) return enMemoire;
  const valeur = await db().read(COLLECTION);
  enMemoire = Array.isArray(valeur) ? (valeur as Autorisation[]).filter((a) => a && typeof a.id === "string") : [];
  return enMemoire;
}

async function ecrire(liste: Autorisation[]): Promise<void> {
  enMemoire = liste;
  await db().write(COLLECTION, liste);
}

async function majeur(id: string, changements: Partial<Autorisation>): Promise<void> {
  const liste = await lire();
  const i = liste.findIndex((a) => a.id === id);
  if (i < 0) liste.push({ id, url: "", ...changements });
  else liste[i] = { ...liste[i]!, ...changements };
  await ecrire(liste);
}

const place = (id: string, quoi: string) => `oauth#${id}#${quoi}`;

/** L'instance est-elle déjà autorisée sur ce service ? */
export async function autorise(id: string): Promise<boolean> {
  const a = (await lire()).find((x) => x.id === id);
  return Boolean(a?.jetons);
}

/** Depuis quand, pour l'afficher. */
export async function depuis(id: string): Promise<string | undefined> {
  return (await lire()).find((x) => x.id === id)?.depuis;
}

/** Oublie l'autorisation d'un service : jetons, enregistrement, tout. */
export async function oublier(id: string, qui: string): Promise<void> {
  const liste = await lire();
  const reste = liste.filter((a) => a.id !== id);
  if (reste.length !== liste.length) {
    await ecrire(reste);
    journaliser("donnees.ecrites", qui, { collection: "oauth", connecteur: id, action: "oublie" });
  }
}

/* ------------------------------------------------------------------ */
/* Le fournisseur d'autorisation attendu par le SDK MCP                */
/* ------------------------------------------------------------------ */

/**
 * Le SDK MCP sait faire la découverte, l'enregistrement dynamique, PKCE,
 * l'échange et le rafraîchissement. Il lui manque un endroit où ranger ce
 * qu'il obtient, et une façon d'envoyer la personne autoriser. C'est tout ce
 * que cet objet fournit — le protocole reste celui du SDK, pas une réécriture
 * maison de la cryptographie d'OAuth.
 */
export class FournisseurAutorisation {
  /** Adresse d'autorisation retenue quand le SDK demande la redirection. */
  adresseAutorisation: string | null = null;

  /*
   * Champs posés à la main, et non par propriétés de paramètre : la passerelle
   * tourne sous le mode « strip-only » de Node, qui ne les accepte pas.
   */
  private readonly id: string;
  private readonly url: string;
  private readonly retour: string;

  constructor(id: string, url: string, retour: string) {
    this.id = id;
    this.url = url;
    this.retour = retour;
  }

  get redirectUrl(): string {
    return this.retour;
  }

  get clientMetadata() {
    return {
      client_name: `${nomProduit()} (instance)`,
      redirect_uris: [this.retour],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    };
  }

  async state(): Promise<string> {
    const etat = randomBytes(24).toString("base64url");
    await majeur(this.id, { url: this.url, etat, retour: this.retour });
    return etat;
  }

  async clientInformation(): Promise<Record<string, unknown> | undefined> {
    const a = (await lire()).find((x) => x.id === this.id);
    if (!a?.client) return undefined;
    const clair = dechiffrer(a.client, place(this.id, "client"));
    return clair as Record<string, unknown>;
  }

  async saveClientInformation(info: unknown): Promise<void> {
    await majeur(this.id, { url: this.url, client: chiffrer(info, place(this.id, "client")) });
  }

  async tokens(): Promise<Record<string, unknown> | undefined> {
    const a = (await lire()).find((x) => x.id === this.id);
    if (!a?.jetons) return undefined;
    return dechiffrer(a.jetons, place(this.id, "jetons")) as Record<string, unknown>;
  }

  async saveTokens(jetons: unknown): Promise<void> {
    await majeur(this.id, {
      url: this.url,
      jetons: chiffrer(jetons, place(this.id, "jetons")),
      depuis: new Date().toISOString(),
      // L'autorisation est finie : le vérificateur et le `state` n'ont plus
      // d'objet, et ce qui n'a plus d'objet ne doit plus être conservé.
      verificateur: undefined,
      etat: undefined,
    });
  }

  async saveCodeVerifier(verificateur: string): Promise<void> {
    await majeur(this.id, {
      url: this.url,
      verificateur: chiffrer(verificateur, place(this.id, "verificateur")),
    });
  }

  async codeVerifier(): Promise<string> {
    const a = (await lire()).find((x) => x.id === this.id);
    if (!a?.verificateur) throw new Error("Aucune autorisation en cours pour ce connecteur.");
    return dechiffrer(a.verificateur, place(this.id, "verificateur")) as string;
  }

  /**
   * Le SDK appelle ceci quand il faut envoyer la personne autoriser. La
   * passerelle n'a pas de navigateur : on retient l'adresse, et c'est
   * l'interface qui l'ouvre sur le poste de la personne.
   */
  redirectToAuthorization(adresse: URL): void {
    this.adresseAutorisation = adresse.toString();
  }

  async invalidateCredentials(portee: "all" | "client" | "tokens" | "verifier" | "discovery"): Promise<void> {
    if (portee === "all") return void (await oublier(this.id, "systeme"));
    if (portee === "tokens") return majeur(this.id, { jetons: undefined });
    if (portee === "client") return majeur(this.id, { client: undefined });
    if (portee === "verifier") return majeur(this.id, { verificateur: undefined });
  }
}

/** Retrouve le connecteur dont l'autorisation attend ce `state`. */
export async function connecteurDuRetour(etat: string): Promise<{ id: string; url: string; retour: string; pour?: string } | null> {
  const a = (await lire()).find((x) => x.etat && x.etat === etat);
  return a ? { id: a.id, url: a.url, retour: a.retour ?? "", pour: a.pour } : null;
}

/**
 * Adresses de retour enregistrées, par connecteur.
 *
 * Relues au démarrage : le rafraîchissement d'un jeton doit présenter la même
 * adresse de retour que l'autorisation d'origine, et elle a été choisie au
 * moment du clic, à partir de l'adresse par laquelle le navigateur atteignait
 * l'instance. Sans cette relecture, un redémarrage de la passerelle rendait
 * les jetons irrafraîchissables.
 */
export async function retoursEnregistres(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const a of await lire()) if (a.retour) m.set(a.id, a.retour);
  return m;
}

/** Note qui a lancé l'autorisation, pour que le journal puisse le dire. */
export async function noterDemandeur(id: string, url: string, qui: string): Promise<void> {
  await majeur(id, { url, pour: qui });
}
