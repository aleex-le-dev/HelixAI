import { statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { toolsForModel as outilsMcp, callTool as appelerMcp, workspace } from "./mcp.ts";
import * as bureau from "./bureau.ts";
import * as courrier from "./courrier.ts";
import * as agenda from "./agenda.ts";
import * as tachesProgrammees from "./tachesProgrammees.ts";
import * as drive from "./drive.ts";
import * as slack from "./slack.ts";
import * as bibliotheque from "./bibliotheque.ts";
import * as controleWeb from "./controleWeb.ts";
import { definirEspaceDeTravail } from "./approbation.ts";

// La barrière juge un déplacement « vers un dossier » comme `adapterFichiers` l'exécute, depuis le même dossier de travail.
definirEspaceDeTravail(workspace);

/**
 * Les outils de l'instance, rangés par famille, et le seul endroit qui les
 * exécute.
 *
 * Deux surfaces s'en servent : la boucle du Chat (`chat.ts`) et le serveur
 * d'outils des employés OpenClaw (`serveurOutils.ts`). Les deux appellent
 * `executerOutil` : un outil ajouté demain l'est pour les deux, et personne ne
 * peut en exécuter un par un chemin qui aurait oublié une vérification.
 *
 * Le contrôle de l'écran n'en fait pas partie : il a sa propre barrière,
 * sa capture et sa conversion de coordonnées (`computer.ts`).
 */

export interface DefinitionOutil {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type Famille = "fichiers" | "bibliotheque" | "courrier" | "agenda" | "drive" | "slack" | "bureau";

export const FAMILLES: Famille[] = ["fichiers", "bibliotheque", "courrier", "agenda", "drive", "slack", "bureau"];

/** Ce que chaque famille permet, dit en une ligne : pour la fiche de poste d'un employé. */
export const DESCRIPTION_FAMILLE: Record<Famille, string> = {
  fichiers: "les fichiers du dossier de travail de l'équipe : lister, lire, chercher, écrire, déplacer",
  bibliotheque: "la bibliothèque de l'équipe, en lecture : chercher et lire les documents ouverts à toute l'équipe",
  courrier: "la boîte mail de l'entreprise : derniers messages, recherche, lecture, brouillons, et envoi quand il est activé (chaque mail attend l'accord d'une personne)",
  agenda: "l'agenda de l'entreprise : événements à venir, journée, recherche ; avec Google Agenda branché en écriture, créer, modifier ou supprimer un événement (chaque écriture attend l'accord d'une personne, sauf niveau « Tout approuver »)",
  drive: "le Google Drive de l'entreprise, en lecture seule : recherche, fichiers récents, lecture",
  slack: "le Slack de l'entreprise, en lecture seule : salons, messages, fils, recherche",
  bureau: "la création de documents Word, Excel, PowerPoint et PDF dans le dossier de travail",
};

/** Outils disponibles en ce moment dans une famille : vide si le service n'est pas branché. */
export function outilsDeFamille(famille: Famille): DefinitionOutil[] {
  switch (famille) {
    case "courrier":
      return courrier.toolsForModel();
    case "agenda":
      return agenda.toolsForModel();
    case "drive":
      return drive.toolsForModel();
    case "slack":
      return slack.toolsForModel();
    case "bureau":
      return bureau.toolsForModel();
    case "bibliotheque":
      return bibliotheque.toolsForModel();
    case "fichiers": {
      // Les serveurs MCP de l'instance : le serveur de fichiers, et ceux du catalogue ; plus le contrôle du code web.
      const mcp = outilsMcp();
      return mcp.length > 0 ? [...mcp, ...controleWeb.toolsForModel()] : mcp;
    }
  }
}

/** Famille d'un outil, d'après son préfixe. Tout outil MCP relève des « fichiers et connecteurs ». */
export function familleDe(nom: string): Famille {
  for (const f of ["bibliotheque", "courrier", "agenda", "drive", "slack", "bureau"] as const) {
    if (nom.startsWith(`${f}__`)) return f;
  }
  return "fichiers";
}

/**
 * Exécute un outil de l'instance. Ne vérifie ni l'approbation ni le journal :
 * c'est à l'appelant, qui sait pour qui il travaille, de le faire avant et
 * après (voir `chat.ts` et `serveurOutils.ts`).
 */
export async function executerOutil(
  nom: string,
  args: Record<string, unknown>,
  /**
   * Pour qui l'outil travaille, quand ce qu'il voit en dépend (la
   * bibliothèque). Absent : il ne voit que ce qui est ouvert à toute l'équipe.
   */
  pour?: { userId: string; groupes: string[] },
): Promise<{ ok: boolean; content: string }> {
  // Les tâches programmées (tachesProgrammees.ts) : au nom de la personne, hors des familles des employés.
  if (nom.startsWith("taches__")) return tachesProgrammees.callTool(nom, args, pour?.userId);
  switch (familleDe(nom)) {
    case "bibliotheque":
      return bibliotheque.callTool(nom, args, pour ?? { userId: "", groupes: [] });
    case "bureau":
      return bureau.callTool(nom, args);
    case "courrier":
      return courrier.callTool(nom, args, pour?.userId);
    case "agenda":
      return agenda.callTool(nom, args);
    case "drive":
      return drive.callTool(nom, args);
    case "slack":
      return slack.callTool(nom, args);
    case "fichiers":
      // Le contrôle du code web est de l'instance, pas d'un serveur MCP.
      if (nom.startsWith("controle__")) return controleWeb.callTool(nom, args);
      return appelerMcp(nom, adapterFichiers(nom, args));
  }
}

/**
 * Déplacer un fichier « vers un dossier » le range dedans, comme `mv`.
 *
 * Un petit modèle écrit volontiers `destination: "Clients/Martin"` pour
 * ranger une facture dans le dossier Martin ; le serveur de fichiers, lui,
 * comprend « renommer la facture en Clients/Martin » et refuse, le dossier
 * existant déjà. Mesuré sur qwen3-8b : les quatre factures d'un rangement
 * sont restées en place, huit essais, huit refus. Le périmètre n'y perd rien :
 * le serveur vérifie toujours le chemin final contre le dossier de travail.
 */
function adapterFichiers(nom: string, args: Record<string, unknown>): Record<string, unknown> {
  /*
   * « Créer le fichier » sans contenu : un petit modèle prévoit volontiers une
   * étape pour créer un fichier vide, puis une autre pour l'écrire, et oublie
   * alors `content`, que le serveur exige. Mesuré sur qwen3-8b : l'étape
   * entière refusée. Un contenu absent vaut un fichier vide, ce qui est bien
   * ce qu'il demandait.
   */
  if (nom.endsWith("write_file") && typeof args.path === "string" && args.content === undefined) return { ...args, content: "" };
  if (!nom.endsWith("move_file")) return args;
  const source = typeof args.source === "string" ? args.source : "";
  const destination = typeof args.destination === "string" ? args.destination : "";
  if (!source || !destination) return args;
  try {
    const cible = isAbsolute(destination) ? destination : resolve(workspace(), destination);
    if (statSync(cible).isDirectory()) return { ...args, destination: join(destination, basename(source)) };
  } catch {
    /* destination absente : un vrai renommage, laissé tel quel */
  }
  return args;
}

/** Ce que le journal retient d'un appel : ce qui a été touché, jamais le contenu. */
export function cibleDe(args: Record<string, unknown>): unknown {
  return ["path", "chemin", "source", "destination", "paths"]
    .map((k) => args[k])
    .find((v) => typeof v === "string" || Array.isArray(v));
}
