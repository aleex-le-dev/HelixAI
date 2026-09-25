import { actionOutil, type CodeEvent } from "@/lib/code";

/**
 * Où en est l'agent de code : ce que montre le panneau de suivi de l'écran
 * Code (src/components/code/SuiviCode.tsx).
 *
 * Demandé par Medhi le 25/09/2026, « comme dans Claude Code, la bande à droite
 * où l'on voit ce qui est en cours » : pendant une tâche de plusieurs minutes
 * sur un petit modèle, l'écran ne montrait que des lignes « ✓ task », et
 * l'annonce d'une panne pendant que le modèle lisait la demande. Tout ce qui
 * est ici vient du flux de la session, sans rien deviner : les statuts de
 * l'instance (lecture, attente, chargement), les signes de vie (réflexion,
 * écriture, outil en préparation), les outils appelés, ceux des sous-agents,
 * la liste de tâches tenue par l'agent (`todowrite`).
 */

export type PhaseCode =
  /** Session qui s'ouvre, demande qui part. */
  | "demarrage"
  | "lecture"
  | "attente"
  | "chargement"
  /** Premier morceau reçu, rien encore d'identifié. */
  | "reponse"
  | "reflexion"
  | "ecriture"
  /** L'agent écrit les arguments d'un outil (un fichier entier pour `write`). */
  | "preparation"
  | "outil"
  /** Un outil vient de finir : l'agent reprend avec son résultat. */
  | "suite"
  | "soustache"
  | "termine";

export interface ActionCode {
  callID: string;
  tool: string;
  libelle: string;
  cible?: string;
  etat: "encours" | "fini" | "echec";
  debut: number;
  fin?: number;
  /** Outils du sous-agent, pour une sous-tâche (`task`). */
  sous?: { callID: string; libelle: string; cible?: string; etat: "encours" | "fini" | "echec" }[];
}

export interface TacheCode {
  texte: string;
  etat: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface FichierCode {
  chemin: string;
  action: "lu" | "modifie" | "ecrit";
}

export interface SuiviCode {
  debut: number;
  fin?: number;
  issue?: "fini" | "arrete" | "echec";
  phase: {
    type: PhaseCode;
    depuis: number;
    progression?: number;
    jetons?: number;
    file?: number;
    /** Ce qui est en cours, en mots (« Écriture », « Sous-tâche : … »), et sur quoi. */
    libelle?: string;
    cible?: string;
    sousTache?: boolean;
  };
  taches: TacheCode[];
  fichiers: FichierCode[];
  actions: ActionCode[];
}

export const suiviNeuf = (maintenant = Date.now()): SuiviCode => ({
  debut: maintenant,
  phase: { type: "demarrage", depuis: maintenant },
  taches: [],
  fichiers: [],
  actions: [],
});

const ETATS_TACHE = new Set(["pending", "in_progress", "completed", "cancelled"]);

/** La liste tenue par l'agent (`todowrite` : `{ todos: [{ content, status }] }`), si elle est lisible. */
function tachesDe(input: Record<string, unknown>): TacheCode[] | undefined {
  if (!Array.isArray(input.todos)) return undefined;
  const liste: TacheCode[] = [];
  for (const brut of input.todos.slice(0, 50)) {
    const t = brut as { content?: unknown; status?: unknown };
    if (typeof t?.content !== "string" || !t.content.trim()) continue;
    liste.push({
      texte: t.content.trim().slice(0, 300),
      etat: typeof t.status === "string" && ETATS_TACHE.has(t.status) ? (t.status as TacheCode["etat"]) : "pending",
    });
  }
  return liste;
}

/** Un fichier touché : l'écriture ou la modification l'emportent sur la lecture. */
function toucher(fichiers: FichierCode[], chemin: string, action: FichierCode["action"]): FichierCode[] {
  const deja = fichiers.find((f) => f.chemin === chemin);
  if (!deja) return [...fichiers, { chemin, action }].slice(-200);
  if (deja.action === action || action === "lu") return fichiers;
  return fichiers.map((f) => (f.chemin === chemin ? { ...f, action } : f));
}

const ACTIONS_FICHIER: Record<string, FichierCode["action"]> = {
  read: "lu",
  edit: "modifie",
  multiedit: "modifie",
  patch: "modifie",
  apply_patch: "modifie",
  write: "ecrit",
};

/** Applique un évènement du tour en cours au suivi. Rend le même objet si rien ne change. */
export function appliquerSuivi(s: SuiviCode, e: CodeEvent, dossier?: string, maintenant = Date.now()): SuiviCode {
  if (s.fin !== undefined) return s;
  switch (e.kind) {
    case "attente":
      if (e.etat === "fin") return { ...s, phase: { type: "reponse", depuis: maintenant } };
      return {
        ...s,
        phase: {
          type: e.etat,
          depuis: e.depuis,
          progression: e.progression,
          jetons: e.jetons,
          file: e.file,
          sousTache: e.sousTache,
        },
      };
    case "activite": {
      if (e.sousTache) {
        return s.phase.type === "soustache" ? s : { ...s, phase: { ...s.phase, type: "soustache", depuis: maintenant, sousTache: true } };
      }
      const type: PhaseCode = e.phase === "reflexion" ? "reflexion" : e.phase === "outil" ? "preparation" : e.phase === "ecriture" ? "ecriture" : "reponse";
      const libelle = e.phase === "outil" && e.tool ? actionOutil(e.tool).libelle : undefined;
      if (s.phase.type === type && s.phase.libelle === libelle) return s;
      return { ...s, phase: { type, depuis: maintenant, libelle } };
    }
    case "tool_start": {
      const { libelle, cible } = actionOutil(e.tool, e.input, dossier);
      const action: ActionCode = { callID: e.callID, tool: e.tool, libelle, cible, etat: "encours", debut: maintenant };
      const fichier = typeof e.input.filePath === "string" ? e.input.filePath : undefined;
      const quoi = ACTIONS_FICHIER[e.tool];
      const taches = e.tool === "todowrite" ? tachesDe(e.input) : undefined;
      return {
        ...s,
        actions: [...s.actions, action].slice(-300),
        fichiers: fichier && quoi ? toucher(s.fichiers, fichier, quoi) : s.fichiers,
        taches: taches ?? s.taches,
        phase: { type: e.tool === "task" ? "soustache" : "outil", depuis: maintenant, libelle, cible },
      };
    }
    case "tool_end": {
      const i = s.actions.findIndex((a) => a.callID === e.callID);
      if (i < 0) return s;
      const actions = s.actions.map((a, j) => (j === i ? { ...a, etat: e.ok ? ("fini" as const) : ("echec" as const), fin: maintenant } : a));
      const encore = actions.find((a) => a.etat === "encours");
      return {
        ...s,
        actions,
        // Une autre action tourne encore (sous-tâches en parallèle) : c'est elle qu'on montre.
        phase: encore
          ? { type: encore.tool === "task" ? "soustache" : "outil", depuis: encore.debut, libelle: encore.libelle, cible: encore.cible }
          : { type: "suite", depuis: maintenant },
      };
    }
    case "sous_outil": {
      const parent =
        (e.parentCallID && s.actions.find((a) => a.callID === e.parentCallID && a.tool === "task")) ||
        [...s.actions].reverse().find((a) => a.tool === "task" && a.etat === "encours");
      if (!parent) return s;
      const { libelle, cible } = actionOutil(e.tool, e.input, dossier);
      const sous = parent.sous ?? [];
      const deja = sous.findIndex((x) => x.callID === e.callID);
      const suivant =
        deja >= 0 ? sous.map((x, j) => (j === deja ? { ...x, etat: e.etat } : x)) : [...sous, { callID: e.callID, libelle, cible, etat: e.etat }].slice(-50);
      const fichier = typeof e.input.filePath === "string" ? e.input.filePath : undefined;
      const quoi = ACTIONS_FICHIER[e.tool];
      return {
        ...s,
        actions: s.actions.map((a) => (a === parent ? { ...a, sous: suivant } : a)),
        fichiers: fichier && quoi && e.etat !== "echec" ? toucher(s.fichiers, fichier, quoi) : s.fichiers,
        phase:
          e.etat === "encours"
            ? { type: "soustache", depuis: maintenant, libelle: parent.libelle, cible: [libelle, cible].filter(Boolean).join(" · "), sousTache: true }
            : s.phase,
      };
    }
    default:
      return s;
  }
}

/** Le tour est fini, d'une façon ou d'une autre : le temps total se fige. */
export function terminerSuivi(s: SuiviCode, issue: NonNullable<SuiviCode["issue"]>, maintenant = Date.now()): SuiviCode {
  if (s.fin !== undefined) return s;
  return {
    ...s,
    fin: maintenant,
    issue,
    phase: { type: "termine", depuis: maintenant },
    actions: s.actions.map((a) => (a.etat === "encours" ? { ...a, etat: issue === "fini" ? "fini" : "echec", fin: maintenant } : a)),
  };
}
