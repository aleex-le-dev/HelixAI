/**
 * Palmier Pro : ce que ses outils font, lu dans son code (29/09/2026).
 *
 * Module sans dépendance, pour que la barrière d'approbation (approbation.ts)
 * se charge seule, comme l'exige la batterie de sécurité. La reconnaissance
 * de l'application et le branchement sont dans palmier.ts.
 *
 * D'où vient la liste : `Sources/PalmierPro/Agent/Tools/ToolDefinitions.swift`
 * et `ToolExecutor*.swift` de la branche `last-gpl-source` du dépôt
 * https://github.com/palmier-io/palmier-pro (dernière source publiée, sous
 * GPLv3, version 0.7.6), lus le 29/09/2026 ; le serveur MCP sert
 * `ToolDefinitions.all + [manage_project]` (MCPService.swift). Les versions
 * suivantes sont propriétaires et leur source n'est pas publiée : un outil
 * qu'elles ajoutent, ou renomment, n'est pas dans ces listes, et il est donc
 * traité comme une écriture (carte d'accord à chaque appel). Rien n'est lu ni
 * copié de ce code : seuls les noms des outils le sont, pour les classer.
 */

/** Identifiant du connecteur, et préfixe de ses outils (`palmier__get_timeline`). */
export const ID_PALMIER = "palmier";

/**
 * Lectures pures : elles ne changent ni le projet, ni la timeline, ni la
 * bibliothèque, et rien ne sort de la machine. Relevé du 29/09/2026 :
 *  - `get_timeline`, `get_media`, `get_multicam` : l'état du projet ;
 *  - `inspect_timeline`, `inspect_color` : une image rendue et ses mesures ;
 *  - `inspect_media` : images, EXIF et transcription **locale**
 *    (`TranscriptCache` → `Transcription.transcribe`, sans le service de
 *    transcription de Palmier dans la version 0.7.6) ;
 *  - `detect_beats` : « Runs locally » ;
 *  - `list_models` : le catalogue des modèles, déjà chargé par l'application ;
 *  - `read_skill` : les consignes d'une compétence de l'application.
 *
 * Écartés, bien qu'ils lisent surtout : `search_media` (« installe de lui-même
 * un modèle manquant », un téléchargement), `get_transcript` (transcription
 * par le service de Palmier quand le compte a des crédits, `canUseCloudTranscription`),
 * `manage_exports` (liste, mais annule aussi), `manage_project` (liste, mais
 * ouvre, crée et ferme aussi). Ils passent par la carte.
 */
export const LECTURES_PALMIER = new Set([
  "get_timeline",
  "inspect_timeline",
  "get_media",
  "inspect_media",
  "get_multicam",
  "detect_beats",
  "inspect_color",
  "list_models",
  "read_skill",
]);

/**
 * Générations par l'IA : elles partent vers les services de Palmier (Seedance,
 * Kling, Nano Banana Pro… : hors de la machine), sont payées avec les crédits
 * du compte Palmier de la personne, et ne se reprennent pas (« Costs real
 * money and is not undoable », ToolDefinitions.swift).
 */
export const GENERATIONS_PALMIER = new Set(["generate_video", "generate_image", "generate_audio", "upscale_media"]);

/**
 * Ce qui peut faire sortir quelque chose de la machine sans être une
 * génération : une transcription par le service de Palmier (sur les crédits
 * du compte), un message à l'équipe de Palmier (« sends directly, there is no
 * user confirmation step »).
 */
const TRANSCRIPTIONS_PALMIER = new Set(["get_transcript", "add_captions"]);
const RETOUR_PALMIER = "send_feedback";

/** Le nom court (`get_timeline`) d'un outil de Palmier Pro, ou `null` pour un autre outil. */
function court(outil: string): string | null {
  return outil.startsWith(`${ID_PALMIER}__`) ? outil.slice(ID_PALMIER.length + 2) : null;
}

/** Un outil de Palmier Pro qui ne fait que lire. */
export const estLecturePalmier = (outil: string): boolean => {
  const nom = court(outil);
  return nom !== null && LECTURES_PALMIER.has(nom);
};

/**
 * Un outil de Palmier Pro qui n'est pas une lecture reconnue : il modifie le
 * projet, génère, ou fait autre chose qu'on ne connaît pas. Échoue fermé.
 */
export const estEcriturePalmier = (outil: string): boolean => court(outil) !== null && !estLecturePalmier(outil);

/**
 * Ce qui sort de la machine, pour que la carte le dise dans toutes les
 * langues (ToolApproval.tsx) : une génération, une transcription par le
 * service de Palmier, un message à son équipe. `null` sinon.
 */
export function horsMachinePalmier(outil: string): "generation" | "transcription" | "retour" | null {
  const nom = court(outil);
  if (nom === null) return null;
  if (GENERATIONS_PALMIER.has(nom)) return "generation";
  if (TRANSCRIPTIONS_PALMIER.has(nom)) return "transcription";
  if (nom === RETOUR_PALMIER) return "retour";
  return null;
}

/** La phrase de la carte d'accord (en français, comme les autres : approbation.ts). */
export function resumePalmier(outil: string, args: Record<string, unknown>): string | null {
  const nom = court(outil);
  if (nom === null) return null;
  const invite = typeof args.prompt === "string" && args.prompt.trim() ? ` : « ${args.prompt.trim().replace(/\s+/g, " ").slice(0, 160)}${args.prompt.trim().length > 160 ? " …" : ""} »` : "";
  const dehors = "; la demande part vers les services de Palmier, hors de cette machine, et se paie avec les crédits de votre compte Palmier (elle ne se reprend pas)";
  switch (nom) {
    case "generate_video":
      return `générer une vidéo avec Palmier Pro${invite} ${dehors}`;
    case "generate_image":
      return `générer une image avec Palmier Pro${invite} ${dehors}`;
    case "generate_audio":
      return `générer un son, une musique ou une voix avec Palmier Pro${invite} ${dehors}`;
    case "upscale_media":
      return `améliorer une vidéo ou une image par l'IA dans Palmier Pro ${dehors}`;
    case "get_transcript":
      return "lire la transcription de la timeline dans Palmier Pro (Palmier Pro peut envoyer le son à ses services pour la transcrire, hors de cette machine, sur les crédits de votre compte Palmier)";
    case "add_captions":
      return "ajouter des sous-titres à la timeline dans Palmier Pro (Palmier Pro peut envoyer le son à ses services pour le transcrire, hors de cette machine, sur les crédits de votre compte Palmier)";
    case "send_feedback":
      return "envoyer un message à l'équipe de Palmier, hors de cette machine";
  }
  if (LECTURES_PALMIER.has(nom)) return `lire le projet ouvert dans Palmier Pro (outil « ${nom} »)`;
  return `modifier le projet ouvert dans Palmier Pro (outil « ${nom} »)`;
}
