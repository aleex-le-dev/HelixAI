import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Billets d'ouverture de flux d'évènements.
 *
 * ── Le problème ──────────────────────────────────────────────────────────────
 *
 * `EventSource` ne permet pas de poser d'en-tête. Le jeton d'instance et le
 * jeton de séance voyageaient donc **dans l'adresse** des flux — c'est-à-dire
 * dans les journaux d'accès de tout intermédiaire, dans l'historique du rendu,
 * et dans la ligne de commande d'un `curl` recopié dans un ticket. Un jeton de
 * séance vaut douze heures glissantes et trente jours au plus : ce n'est pas
 * une chose à laisser traîner dans une URL.
 *
 * ── Ce que fait ce module ────────────────────────────────────────────────────
 *
 * Un billet est demandé par une requête normale (en-têtes, donc), puis posé
 * une fois dans l'adresse du flux. Il vaut **soixante secondes** et **une seule
 * ouverture**. Ce qui fuit par l'adresse n'ouvre donc plus rien une minute plus
 * tard, ni une seconde fois.
 *
 * Il remplace les **deux** jetons : présenter un billet valide prouve qu'une
 * séance existait, donc qu'un jeton d'instance a servi pour l'obtenir.
 *
 * Conséquence côté poste : la reconnexion automatique d'`EventSource` ne peut
 * plus rejouer la même adresse. C'est l'interface qui rouvre, avec un billet
 * neuf (`flux.ts` côté front).
 */

/** Un billet ne sert qu'une fois, dans la minute. */
const DUREE_MS = 60_000;
/** Au-delà, on purge : un billet oublié ne doit pas devenir une fuite de mémoire. */
const MAX = 500;

interface Billet {
  /** Empreinte du billet : on ne garde pas le billet lui-même. */
  empreinte: string;
  accountId: string;
  expire: number;
}

let billets: Billet[] = [];

const empreinteDe = (billet: string): string =>
  createHash("sha256").update(billet).digest("hex");

function purger(maintenant: number): void {
  billets = billets.filter((b) => b.expire > maintenant);
  if (billets.length > MAX) billets = billets.slice(-MAX);
}

/** Crée un billet pour ce compte. Rendu une fois, jamais relisible. */
export function creer(accountId: string): { billet: string; expireDansMs: number } {
  const maintenant = Date.now();
  purger(maintenant);
  const billet = randomBytes(24).toString("base64url");
  billets.push({ empreinte: empreinteDe(billet), accountId, expire: maintenant + DUREE_MS });
  return { billet, expireDansMs: DUREE_MS };
}

/**
 * Le billet est-il valide ? Ne le consomme pas.
 *
 * Sert au contrôle du jeton d'instance, qui passe avant l'identification :
 * les deux regardent la même valeur, et une seule des deux doit la consommer.
 */
export function valide(billet: string | null | undefined): boolean {
  if (!billet) return false;
  const maintenant = Date.now();
  purger(maintenant);
  return billets.some((b) => egal(b.empreinte, empreinteDe(billet)) && b.expire > maintenant);
}

/** Consomme le billet et rend le compte, ou null. Un billet ne sert qu'une fois. */
export function consommer(billet: string | null | undefined): string | null {
  if (!billet) return null;
  const maintenant = Date.now();
  purger(maintenant);
  const cible = empreinteDe(billet);
  const i = billets.findIndex((b) => egal(b.empreinte, cible) && b.expire > maintenant);
  if (i < 0) return null;
  const [pris] = billets.splice(i, 1);
  return pris!.accountId;
}

/** Comparaison à durée constante : deux empreintes hexadécimales de même longueur. */
function egal(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Pour les essais. */
export function oublierTout(): void {
  billets = [];
}
