/**
 * Découpage d'un texte en morceaux pour les bases de connaissances
 * (connaissances.ts).
 *
 * Portage du `RecursiveCharacterTextSplitter` de LangChain.js
 * (langchain-ai/langchainjs, libs/langchain-textsplitters/src/text_splitter.ts,
 * révision e4a3d1bd0c6753d4e1739a7f10064f48e6bc49ec, licence MIT, notice
 * reprise dans gateway/rag/LICENCE-langchainjs.txt). C'est ce découpeur
 * qu'AnythingLLM emploie (server/utils/TextSplitter, MIT) : on reprend le
 * même algorithme plutôt que d'en inventer un, et on le réécrit sans
 * dépendance parce que la passerelle n'en a pas (le paquet npm tire
 * `@langchain/core` et `js-tiktoken`).
 *
 * Ce qui change par rapport à l'original, et pourquoi :
 *  - synchrone : la longueur se mesure en caractères, il n'y a rien à
 *    attendre, et une promesse par morceau coûtait pour rien ;
 *  - chaque morceau garde sa **position** dans le texte d'origine (`debut`,
 *    `fin`) : la citation sous la réponse peut dire où lire la suite, et
 *    `bibliotheque__lire` y aller directement (paramètre `depuis`) ;
 *  - des séparateurs de phrase (« . », « ? », « ! ») entre la ligne et le
 *    mot : un morceau coupé en pleine phrase se comprend mal une fois sorti
 *    de son contexte. LangChain n'en a que pour certains langages.
 */

export interface Morceau {
  texte: string;
  /** Position du premier caractère dans le texte d'origine. */
  debut: number;
  /** Position qui suit le dernier caractère. */
  fin: number;
}

export interface OptionsDecoupage {
  /** Longueur visée d'un morceau, en caractères (1 000 : défaut d'AnythingLLM). */
  taille: number;
  /** Recouvrement entre deux morceaux voisins, en caractères. */
  recouvrement: number;
  separateurs?: string[];
}

const SEPARATEURS = ["\n\n", "\n", ". ", "? ", "! ", "; ", " ", ""];

/** Coupe en gardant le séparateur en tête du morceau suivant (`keepSeparator` de LangChain). */
function couper(texte: string, separateur: string): string[] {
  if (!separateur) return [...texte];
  const morceaux: string[] = [];
  let depart = 0;
  for (let i = texte.indexOf(separateur, 1); i !== -1; i = texte.indexOf(separateur, i + separateur.length)) {
    morceaux.push(texte.slice(depart, i));
    depart = i;
  }
  morceaux.push(texte.slice(depart));
  return morceaux.filter((m) => m !== "");
}

/** `mergeSplits` : recolle les petits bouts jusqu'à la taille visée, avec recouvrement. */
function fusionner(bouts: string[], o: OptionsDecoupage): string[] {
  const sortie: string[] = [];
  const courant: string[] = [];
  let total = 0;
  for (const b of bouts) {
    if (total + b.length > o.taille && courant.length > 0) {
      const joint = courant.join("").trim();
      if (joint) sortie.push(joint);
      // On garde la fin du morceau précédent, dans la limite du recouvrement.
      while (total > o.recouvrement || (total + b.length > o.taille && total > 0)) {
        total -= courant[0]!.length;
        courant.shift();
      }
    }
    courant.push(b);
    total += b.length;
  }
  const joint = courant.join("").trim();
  if (joint) sortie.push(joint);
  return sortie;
}

/** `_splitText` : le premier séparateur présent, puis récursion sur ce qui reste trop long. */
function recursif(texte: string, separateurs: string[], o: OptionsDecoupage): string[] {
  let separateur = separateurs[separateurs.length - 1] ?? "";
  let suivants: string[] | undefined;
  for (let i = 0; i < separateurs.length; i++) {
    const s = separateurs[i]!;
    if (s === "") {
      separateur = s;
      break;
    }
    if (texte.includes(s)) {
      separateur = s;
      suivants = separateurs.slice(i + 1);
      break;
    }
  }
  const final: string[] = [];
  let bons: string[] = [];
  for (const s of couper(texte, separateur)) {
    if (s.length < o.taille) {
      bons.push(s);
      continue;
    }
    if (bons.length) {
      final.push(...fusionner(bons, o));
      bons = [];
    }
    if (!suivants) final.push(s);
    else final.push(...recursif(s, suivants, o));
  }
  if (bons.length) final.push(...fusionner(bons, o));
  return final;
}

export function decouper(texte: string, o: OptionsDecoupage): Morceau[] {
  if (o.recouvrement >= o.taille) throw new Error("Le recouvrement doit être plus court que le morceau.");
  const morceaux: Morceau[] = [];
  /*
   * Position de chaque morceau : cherchée à partir du début du précédent,
   * comme `createDocuments` de LangChain le fait pour ses numéros de ligne.
   * Les morceaux se recouvrent, on ne peut donc pas partir de la fin du
   * précédent. Un morceau introuvable (espaces écrasés par `trim`) reprend la
   * position suivante plutôt que d'en inventer une.
   */
  let repere = 0;
  for (const t of recursif(texte, o.separateurs ?? SEPARATEURS, o)) {
    const i = texte.indexOf(t, repere);
    const debut = i >= 0 ? i : repere;
    morceaux.push({ texte: t, debut, fin: debut + t.length });
    repere = debut + 1;
  }
  return morceaux;
}
