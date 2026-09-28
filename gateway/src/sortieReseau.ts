import { lookup } from "node:dns/promises";
import type { BackendConfig } from "./types.ts";
import { t, tf } from "./langue.ts";

/**
 * Ce que l'instance accepte de joindre pour le compte d'une séance : pas le
 * réseau interne de l'entreprise, ni les métadonnées d'hébergeur.
 *
 * Tiré de fournisseurs.ts le 26/09/2026 (revue de sécurité) : le contrôle ne
 * valait qu'à l'ajout d'un fournisseur « compatible », sur son `/models`.
 * Ensuite, les vraies requêtes suivaient les redirections et résolvaient le
 * nom à nouveau : un serveur qui répondait bien à l'essai puis renvoyait
 * `302 → http://192.168.1.10/…` faisait lire le réseau interne par
 * l'instance, et rendait la page lue dans la réponse (reproduit). Chaque
 * requête vers un modèle ajouté par clé repasse donc ici, et ne suit aucune
 * redirection (`redirectionPour`).
 *
 * Ce qui reste : entre ce contrôle et la connexion, un serveur de noms
 * complice peut encore changer de réponse (« DNS rebinding »). Le fermer
 * demanderait de choisir l'adresse nous-mêmes à la connexion, ce que `fetch`
 * de Node ne permet pas sans dépendance.
 */

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; statut: number; message: string };

/**
 * Une adresse IP appartient-elle au réseau interne de la machine ?
 *
 * Sert à refuser les cibles qu'une séance n'a rien à faire d'atteindre par
 * l'intermédiaire de l'instance : le réseau local de l'entreprise, les
 * métadonnées d'hébergeur (169.254.169.254), les adresses de service.
 */
export function interne(ip: string): boolean {
  /*
   * Une adresse IPv4 écrite en IPv6 « mappée », sous sa forme hexadécimale :
   * c'est ainsi que l'analyseur d'adresses (WHATWG, `new URL`) réécrit
   * `[::ffff:127.0.0.1]`, en `[::ffff:7f00:1]`. Elle échappait au contrôle
   * (tournée du 28/09/2026, SECURITE.md § 41) ; relue en IPv4.
   */
  const hexa = /^(?:(?:0{1,4}:){5}|::(?:0{1,4}:)?)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hexa) {
    const [h, l] = [parseInt(hexa[1]!, 16), parseInt(hexa[2]!, 16)];
    return interne(`${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`);
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.replace(/^::ffff:/i, ""));
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

const boucleLocale = (hote: string): boolean =>
  hote === "localhost" || hote === "127.0.0.1" || hote === "::1" || hote === "[::1]";

/**
 * Vérifie qu'une adresse d'API n'est pas une porte vers le réseau interne.
 *
 * Avec le fournisseur « compatible », c'est la personne qui choisit l'hôte, et
 * c'est l'instance qui se connecte : sans ce contrôle, toute séance faisait
 * balayer le réseau de l'entreprise par le serveur, et lisait le résultat dans
 * la réponse. La boucle locale reste admise, et seulement elle : c'est le cas
 * d'un moteur de modèles installé sur la machine (LM Studio, Ollama), qui est
 * la raison d'être du fournisseur « compatible ».
 */
export async function adresseSortanteSure(
  brute: string,
  /** Le web des employés (webGarde.ts) : la boucle locale non plus, où tournent la passerelle, LM Studio, OpenClaw. */
  options: { boucleLocale?: boolean } = {},
): Promise<Resultat<true>> {
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    return { ok: false, statut: 400, message: t("Adresse invalide.") };
  }
  const hote = url.hostname.toLowerCase();
  if (boucleLocale(hote)) {
    return options.boucleLocale === false
      ? { ok: false, statut: 400, message: t("Adresse de cette machine : refusée.") }
      : { ok: true, valeur: true };
  }

  let adresses: { address: string }[] = [];
  try {
    adresses = await lookup(hote, { all: true });
  } catch {
    return { ok: false, statut: 400, message: tf("Nom introuvable : {0}.", hote) };
  }
  if (adresses.some((a) => interne(a.address))) {
    return {
      ok: false,
      statut: 400,
      message: t("Cette adresse désigne une machine du réseau interne. Donnez l'adresse publique du fournisseur, ou celle d'un moteur installé sur cette machine (localhost)."),
    };
  }
  return { ok: true, valeur: true };
}

/** Un modèle ajouté par clé depuis l'interface (fournisseurs.ts) : lui seul désigne une adresse choisie par une personne. */
const choisieParUnePersonne = (b: BackendConfig) => b.origine === "cle";

/** Refus à dire, ou null : l'adresse du modèle est joignable sans risque. */
export async function refusSortie(b: BackendConfig): Promise<string | null> {
  if (!choisieParUnePersonne(b)) return null;
  const r = await adresseSortanteSure(b.baseUrl);
  return r.ok ? null : r.message;
}

/** Aucune redirection pour un modèle ajouté par clé ; les moteurs de l'instance gardent le comportement habituel. */
export const redirectionPour = (b: BackendConfig): "error" | "follow" => (choisieParUnePersonne(b) ? "error" : "follow");
