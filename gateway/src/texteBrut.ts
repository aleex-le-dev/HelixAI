/**
 * Du HTML au texte, et des noms aux motifs d'expressions régulières.
 *
 * Relevé par l'analyse de code (CodeQL, 27/09/2026, dépôt public) : retirer les
 * balises en une passe laissait `<scr<script>ipt>` devenir `<script>`. Le
 * texte obtenu ne sert jamais de HTML (il va au modèle, ou s'affiche comme
 * texte), mais un nettoyage qui s'arrête à mi-chemin n'a pas sa place ici.
 */

/** Applique `nettoyer` jusqu'à ce que le texte ne change plus. */
export function jusquaStabilite(texte: string, nettoyer: (s: string) => string): string {
  let avant: string;
  let s = texte;
  do {
    avant = s;
    s = nettoyer(s);
  } while (s !== avant);
  return s;
}

/**
 * Retire toutes les balises (`parcourirBalises` : le texte rendu n'en contient
 * plus aucune, il n'y a rien à refaire).
 */
export const sansBalises = (html: string): string => parcourirBalises(html, () => "");

/** Minuscules ASCII seulement : la longueur ne change pas (`"İ".toLowerCase()` fait deux caractères), les positions restent vraies. */
const minusculesAscii = (s: string) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

/**
 * Parcourt un texte HTML ou XML balise par balise, **en temps linéaire**.
 *
 * Tournée finale de la 2026.928.6 (SECURITE.md § 53) : les balises se
 * retiraient par expressions régulières (`/<[^>]+>/g`,
 * `/<(script|…)[\s\S]*?<\/\1>/gi`, `/<w:t(?:\s[^>]*)?>…/g`). Sur un texte fait
 * de `<` sans `>`, chacune repart de chaque `<` jusqu'au bout : un temps qui
 * croît comme le carré de la taille. Mesuré sous Node 24 : 200 000 `<`, 16
 * secondes ; une page de 2 Mo (ce que la recherche sur le web du Chat accepte
 * de lire), une demi-heure, pendant laquelle la passerelle, qui n'a qu'un fil,
 * ne répondait plus à personne. Une page web, un message Teams, un document
 * Word d'un SharePoint partagé suffisaient.
 *
 * Ici, chaque caractère est lu un nombre borné de fois : une balise va du `<`
 * au premier `>` (s'il n'y en a plus, le reste est du texte et le parcours
 * s'arrête) ; un commentaire `<!-- … -->` et un bloc `ignores` (`script`,
 * `style`…) sont retirés en entier, et la recherche de leur fin est retenue
 * d'un bloc à l'autre (un bloc jamais refermé ne fait pas relire tout le
 * texte à chaque ouverture).
 *
 * `surBalise` reçoit le nom en minuscules ASCII (`p`, `/p`, `w:t`, `br`…, vide
 * pour `<>`) et l'intérieur de la balise tel qu'écrit ; elle rend ce qui la
 * remplace. `surTexte` reçoit chaque morceau de texte entre deux balises.
 * Le texte rendu ne contient aucune balise complète.
 */
export function parcourirBalises(
  html: string,
  surBalise: (nom: string, interieur: string) => string,
  options: { ignores?: ReadonlySet<string>; surTexte?: (texte: string) => string } = {},
): string {
  const bas = minusculesAscii(html);
  const surTexte = options.surTexte ?? ((t: string) => t);
  const ignores = options.ignores ?? new Set<string>();
  // Fin d'un bloc, par motif cherché : dernière position trouvée (-1 : absent jusqu'au bout).
  const fins = new Map<string, number>();
  const finApres = (motif: string, depuis: number): number => {
    const connue = fins.get(motif);
    if (connue !== undefined && (connue === -1 || connue >= depuis)) return connue;
    const trouvee = bas.indexOf(motif, depuis);
    fins.set(motif, trouvee);
    return trouvee;
  };
  const sortie: string[] = [];
  let i = 0;
  while (i < html.length) {
    const ouvre = html.indexOf("<", i);
    if (ouvre < 0) {
      sortie.push(surTexte(html.slice(i)));
      break;
    }
    if (ouvre > i) sortie.push(surTexte(html.slice(i, ouvre)));
    if (bas.startsWith("<!--", ouvre)) {
      const fin = finApres("-->", ouvre + 4);
      if (fin < 0) break;
      i = fin + 3;
      continue;
    }
    const ferme = html.indexOf(">", ouvre + 1);
    // Plus aucun `>` : aucune balise ne peut plus se refermer, le reste est du texte.
    if (ferme < 0) {
      sortie.push(surTexte(html.slice(ouvre)));
      break;
    }
    const interieur = html.slice(ouvre + 1, ferme);
    const nom = /^\/?[a-z0-9]+(?::[a-z0-9]+)?/.exec(bas.slice(ouvre + 1, Math.min(ferme, ouvre + 64)))?.[0] ?? "";
    if (ignores.has(nom)) {
      const fin = finApres(`</${nom}`, ferme + 1);
      if (fin < 0) break;
      const finBalise = html.indexOf(">", fin);
      if (finBalise < 0) break;
      sortie.push(surBalise(nom, interieur));
      i = finBalise + 1;
      continue;
    }
    sortie.push(surBalise(nom, interieur));
    i = ferme + 1;
  }
  return sortie.join("");
}

/** Échappe tous les caractères spéciaux d'une expression régulière. */
export const echapperRegex = (texte: string): string => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
