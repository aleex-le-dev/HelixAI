/**
 * Garde-fou contre une réponse du modèle partie en boucle.
 *
 * Vu par Medhi le 27/09/2026 sur un PC Windows sans carte graphique (16 Go,
 * moteur llmster posé par Helix, Qwen3.5 4B) : à « Bonjour, tu vas bien ? »,
 * la réflexion affichait « 不 », puis « 時//////… » sans fin. Le moteur ne
 * s'arrête pas de lui-même dans ce cas : il génère jusqu'au bout du contexte,
 * et au-delà si LM Studio fait glisser la conversation. La personne regardait
 * une bulle se remplir de barres obliques, et rien ne lui disait que c'était
 * cassé.
 *
 * La passerelle lit donc ce qui arrive, texte et réflexion, et coupe le flux
 * quand il ne peut plus s'agir d'une réponse :
 *  - un même court motif (1 à 200 caractères) répété à la suite sur au moins
 *    600 caractères et au moins 25 fois. « //// » ou « 時時時 » y tombent vite ;
 *    une ligne de tableau Markdown (« |---|---| »), une règle « ===== » ou une
 *    liste de nombres qui changent, non ;
 *  - une réflexion plus longue que 160 000 caractères, soit plus de 40 000
 *    jetons : davantage que le contexte que Helix donne au modèle sur une
 *    machine de 36 Go ou moins (32 768 jetons, backends.ts). Passé ce cap, le
 *    moteur a forcément perdu le début de la conversation.
 *
 * Ce n'est pas le remède (voir les options de chargement, backends.ts, et
 * l'échantillonnage, chat.ts) : c'est le filet qui empêche l'écran de laisser
 * croire que la réponse avance.
 */

export type Degenerescence = "motif" | "sans-fin";

/** Période la plus longue cherchée : une phrase entière recopiée en boucle. */
const PERIODE_MAX = 200;
/** Étendue répétée minimale, et nombre minimal de répétitions. */
const ETENDUE_MIN = 600;
const REPETITIONS_MIN = 25;
/** Ce qu'on garde de la fin du texte pour chercher un motif. */
const FENETRE = PERIODE_MAX * REPETITIONS_MIN + 64;
/** Relecture tous les 32 caractères reçus : le calcul reste négligeable, la coupure rapide. */
const PAS = 32;
/** Réflexion au-delà de laquelle elle ne peut plus être utile (voir plus haut). */
export const REFLEXION_MAX = 160_000;

/**
 * La fin de `texte` est-elle faite d'un même motif répété ?
 *
 * Pour chaque période p, on compte depuis la fin combien de caractères sont
 * égaux à celui placé p rangs avant : c'est l'étendue répétée. Un texte
 * ordinaire casse la suite en quelques caractères, pour chaque p.
 */
export function motifRepete(texte: string): boolean {
  const n = texte.length;
  for (let p = 1; p <= PERIODE_MAX; p++) {
    const seuil = Math.max(ETENDUE_MIN, p * REPETITIONS_MIN);
    if (n < seuil) break;
    let k = 0;
    while (k + p < n && texte.charCodeAt(n - 1 - k) === texte.charCodeAt(n - 1 - k - p)) k++;
    if (k + p >= seuil) return true;
  }
  return false;
}

/** Suit un flux (le texte, ou la réflexion) et dit s'il a dégénéré. */
export class GardeBoucle {
  private fin = "";
  private total = 0;
  private depuis = 0;
  private readonly plafond: number;

  // Sans propriété de paramètre : Node lit la passerelle en retirant seulement les types.
  constructor(plafond = Infinity) {
    this.plafond = plafond;
  }

  /** Ajoute un fragment ; rend la cause dès que le flux n'est plus une réponse. */
  ajouter(fragment: string): Degenerescence | null {
    if (!fragment) return null;
    this.total += fragment.length;
    if (this.total > this.plafond) return "sans-fin";
    this.fin = (this.fin + fragment).slice(-FENETRE);
    this.depuis += fragment.length;
    if (this.depuis < PAS) return null;
    this.depuis = 0;
    return motifRepete(this.fin) ? "motif" : null;
  }
}

/** Un garde pour le texte (sans plafond) et un pour la réflexion. */
export function gardesDeFlux(): { texte: GardeBoucle; reflexion: GardeBoucle } {
  return { texte: new GardeBoucle(), reflexion: new GardeBoucle(REFLEXION_MAX) };
}
