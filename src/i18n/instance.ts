import { t } from "@/lib/i18n";

/**
 * Phrases écrites par l'instance, déclarées ici pour être traduisibles.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 *
 * Certaines phrases affichées ne viennent pas de l'interface : la passerelle
 * les envoie avec ses données. Le nom d'un serveur d'outils, le libellé d'un
 * logiciel de l'atelier bureautique, sa description. L'écran les passe par
 * `t()`, qui les traduit **si** elles figurent au catalogue.
 *
 * Or le relevé (`npm run i18n`) ne lit que le code de l'interface : ces
 * phrases-là, il ne les voit nulle part, et les retire du catalogue au
 * ménage suivant comme des clés devenues inutiles. Elles disparaissaient donc
 * à chaque mise à jour du catalogue, sans que rien ne le signale.
 *
 * Les déclarer ici les rend visibles au relevé. Ce fichier n'est appelé par
 * personne : il ne sert qu'à dire « ces phrases existent, gardez-les ».
 *
 * ── Ce qu'il faut savoir en le modifiant ────────────────────────────────────
 *
 * La phrase doit être **exactement** celle que la passerelle envoie, à
 * l'espace près. Une clé qui diffère d'une virgule ne correspond à rien, et la
 * phrase s'affiche en français sans que rien ne le dise. La source fait foi :
 * `gateway/src/atelier.ts` et `gateway/src/mcp.ts`.
 */
export const PHRASES_DE_LINSTANCE = [
  // gateway/src/mcp.ts — serveurs d'outils
  t("Fichiers"),

  // gateway/src/atelier.ts — atelier bureautique
  t("Python 3"),
  t("LibreOffice"),
  t("Outils Poppler"),
  t(
    "Convertit un document d'un format à l'autre, par exemple un Word ou un classeur Excel en PDF fidèle à la mise en page.",
  ),
  t(
    "Transforme une page de PDF en image et en extrait le texte, y compris quand la mise en page est complexe.",
  ),
  t("Facultatif. À installer soi-même depuis le site de LibreOffice ou avec Homebrew."),
  t("Facultatif. À installer soi-même depuis le site de LibreOffice, ou par le gestionnaire de paquets du système."),
  t("Facultatif. À installer soi-même avec Homebrew (paquet poppler)."),
  t("Facultatif. À installer soi-même (Poppler pour Windows), puis à ajouter au PATH."),
  t("Facultatif. À installer soi-même par le gestionnaire de paquets (paquet poppler-utils)."),
];
