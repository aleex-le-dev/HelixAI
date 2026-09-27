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

/** Retire toutes les balises, jusqu'à ce qu'il n'en reste plus. */
export const sansBalises = (html: string): string => jusquaStabilite(html, (s) => s.replace(/<[^>]*>/g, ""));

/** Échappe tous les caractères spéciaux d'une expression régulière. */
export const echapperRegex = (texte: string): string => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
