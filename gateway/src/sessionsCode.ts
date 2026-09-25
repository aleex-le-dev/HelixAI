import { db } from "./db.ts";

/**
 * Les sessions de Helix Code, séparées des Chats.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Demandé par Medhi le 25/09/2026, « comme dans Claude Code » : en ouvrant
 * Code, on retombait sur la dernière conversation, et rien ne permettait d'en
 * rouvrir une autre. Les sessions n'existaient que chez OpenCode (qui garde
 * leurs messages sur le disque) et dans la mémoire de la passerelle
 * (`modeleDeSession`, index.ts, perdu à chaque redémarrage) : on ne savait
 * même plus à qui elles étaient.
 *
 * Ce registre retient, pour chaque session ouverte par Helix Code, sa
 * propriétaire, son dossier, son titre (le début de la première demande, comme
 * le fait Claude Code) et ses dates. Le **contenu** reste chez OpenCode, relu à
 * l'ouverture (`GET /session/<id>/message`) : rien n'est recopié, rien ne peut
 * donc diverger ni se perdre ici. Collection interne (db.ts) : jamais
 * distribuée aux postes, chacun ne voit que les siennes, par la route.
 *
 * Les sessions ouvertes avant ce registre ne sont pas listées : on ne sait pas
 * à qui elles sont. Elles restent intactes chez OpenCode.
 */

export interface SessionCode {
  id: string;
  userId: string;
  dossier: string;
  titre: string;
  modele: string;
  variante?: string;
  creee: string;
  maj: string;
}

const COLLECTION = "sessionsCode";
/** Au-delà, les plus anciennes sortent de la liste (elles restent chez OpenCode). */
const PAR_PERSONNE_MAX = 300;
const TITRE_MAX = 80;

/**
 * Lecture du registre. Une valeur illisible **lève** : sans cela, la première
 * écriture remplacerait par une liste presque vide des sessions qu'on n'a pas
 * pu lire (règle du projet, pertes du 20/09 et du 24/09).
 */
async function charger(): Promise<SessionCode[]> {
  const v = await db().read(COLLECTION);
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("Registre des sessions de Code illisible.");
  return v as SessionCode[];
}

let file: Promise<unknown> = Promise.resolve();
function enFile<T>(travail: () => Promise<T>): Promise<T> {
  const suite = file.then(travail, travail);
  file = suite.catch(() => undefined);
  return suite;
}

/** Première ligne utile d'une demande, pour titre. */
export function titreDe(demande: string): string {
  const ligne = demande.replace(/\s+/g, " ").trim();
  return ligne.length > TITRE_MAX ? `${ligne.slice(0, TITRE_MAX - 1)}…` : ligne;
}

/** Une session vient d'être ouverte par Helix Code pour cette personne. */
export function noterSession(s: Omit<SessionCode, "creee" | "maj" | "titre"> & { titre?: string }): Promise<void> {
  return enFile(async () => {
    const liste = await charger();
    if (liste.some((x) => x.id === s.id)) return;
    const maintenant = new Date().toISOString();
    liste.push({ ...s, titre: s.titre ?? "", creee: maintenant, maj: maintenant });
    // Borne par personne : les plus anciennes s'effacent du registre, pas de chez OpenCode.
    const siennes = liste.filter((x) => x.userId === s.userId).sort((a, b) => a.maj.localeCompare(b.maj));
    const trop = new Set(siennes.slice(0, Math.max(0, siennes.length - PAR_PERSONNE_MAX)).map((x) => x.id));
    await db().write(COLLECTION, liste.filter((x) => !trop.has(x.id)));
  });
}

/** Une demande part dans cette session : date, et titre si elle n'en a pas encore. */
export function toucherSession(id: string, demande: string, reglage?: { modele: string; variante?: string }): Promise<void> {
  return enFile(async () => {
    const liste = await charger();
    const s = liste.find((x) => x.id === id);
    if (!s) return;
    s.maj = new Date().toISOString();
    if (!s.titre && demande.trim()) s.titre = titreDe(demande);
    if (reglage) {
      s.modele = reglage.modele;
      s.variante = reglage.variante;
    }
    await db().write(COLLECTION, liste);
  });
}

export async function sessionCode(id: string): Promise<SessionCode | undefined> {
  return (await charger()).find((x) => x.id === id);
}

/** Les sessions de cette personne, la plus récente d'abord. */
export async function sessionsDe(userId: string): Promise<SessionCode[]> {
  return (await charger()).filter((x) => x.userId === userId).sort((a, b) => b.maj.localeCompare(a.maj));
}

/** Retire une session de la liste de sa propriétaire. Sa conversation reste chez OpenCode. */
export function retirerSession(id: string, userId: string): Promise<boolean> {
  return enFile(async () => {
    const liste = await charger();
    if (!liste.some((x) => x.id === id && x.userId === userId)) return false;
    await db().write(
      COLLECTION,
      liste.filter((x) => x.id !== id),
    );
    return true;
  });
}

/** Effacement d'un compte : ses sessions sortent du registre ; rend lesquelles, pour les effacer chez OpenCode (effacement.ts). */
export function oublierSessionsCode(userId: string): Promise<SessionCode[]> {
  return enFile(async () => {
    const liste = await charger();
    const reste = liste.filter((x) => x.userId !== userId);
    if (reste.length !== liste.length) await db().write(COLLECTION, reste);
    return liste.filter((x) => x.userId === userId);
  });
}

/* ------------------------ historique, depuis OpenCode ------------------------ */

export interface MessageHistorique {
  role: "user" | "assistant";
  texte: string;
  raisonnement?: string;
  outils: { callID: string; tool: string; input: Record<string, unknown>; etat: "encours" | "fini" | "echec"; apercu?: string }[];
}

const ARRET = /^\[La demande précédente a été arrêtée par la personne[^\]]*\]\s*/;
const DESIGN = "\n\n---\nDesign : ce projet a un design";

/** Ce que la personne a écrit, sans ce que Helix y a ajouté pour le modèle (index.ts, useCode.ts). */
function demandeAffichee(texte: string): string {
  const i = texte.indexOf(DESIGN);
  return (i >= 0 ? texte.slice(0, i) : texte).replace(ARRET, "");
}

/** Ce qu'un outil a reçu, sans le contenu d'un fichier entier : de quoi le libeller. */
function entreeCourte(entree: unknown): Record<string, unknown> {
  const e = (entree ?? {}) as Record<string, unknown>;
  const garde: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(e)) {
    if (typeof v === "string") garde[cle] = v.length > 300 ? `${v.slice(0, 300)}…` : v;
    else if (cle === "todos" && Array.isArray(v)) garde[cle] = v.slice(0, 50);
  }
  return garde;
}

interface MessageOpenCode {
  info?: { role?: string };
  parts?: {
    type?: string;
    text?: string;
    synthetic?: boolean;
    tool?: string;
    callID?: string;
    state?: { status?: string; input?: unknown; output?: unknown; error?: unknown };
  }[];
}

/**
 * Les messages d'OpenCode (ancienne API) mis dans la forme que l'écran
 * affiche. Un tour de l'agent fait plusieurs messages « assistant » (un par
 * étape) : ils sont regroupés en une seule réponse, comme à l'écran pendant le
 * travail.
 */
export function historiqueDe(messages: MessageOpenCode[]): MessageHistorique[] {
  const rendu: MessageHistorique[] = [];
  for (const m of messages) {
    const role = m.info?.role === "user" ? "user" : m.info?.role === "assistant" ? "assistant" : undefined;
    if (!role) continue;
    const textes: string[] = [];
    const raisonnements: string[] = [];
    const outils: MessageHistorique["outils"] = [];
    for (const p of m.parts ?? []) {
      if (p.type === "text" && typeof p.text === "string" && !p.synthetic && p.text.trim()) textes.push(p.text);
      else if (p.type === "reasoning" && typeof p.text === "string" && p.text.trim()) raisonnements.push(p.text);
      else if (p.type === "tool" && typeof p.tool === "string") {
        /*
         * Un outil dont l'agent écrit encore les arguments n'est pas montré :
         * s'il travaille toujours, il arrivera par le flux, complet.
         */
        const statut = p.state?.status;
        if (statut !== "completed" && statut !== "error" && statut !== "running") continue;
        const sortie = typeof p.state?.output === "string" ? p.state.output : typeof p.state?.error === "string" ? p.state.error : "";
        outils.push({
          callID: typeof p.callID === "string" ? p.callID : "",
          tool: p.tool,
          input: entreeCourte(p.state?.input),
          etat: statut === "completed" ? "fini" : statut === "error" ? "echec" : "encours",
          ...(sortie ? { apercu: sortie.slice(0, 2000) } : {}),
        });
      }
    }
    if (role === "user") {
      const texte = demandeAffichee(textes.join("\n\n"));
      if (texte.trim()) rendu.push({ role, texte, outils: [] });
      continue;
    }
    const precedent = rendu[rendu.length - 1];
    const cible = precedent?.role === "assistant" ? precedent : undefined;
    if (cible) {
      if (textes.length) cible.texte = [cible.texte, ...textes].filter(Boolean).join("\n\n");
      if (raisonnements.length) cible.raisonnement = [cible.raisonnement, ...raisonnements].filter(Boolean).join("\n\n");
      cible.outils.push(...outils);
    } else {
      rendu.push({
        role,
        texte: textes.join("\n\n"),
        ...(raisonnements.length ? { raisonnement: raisonnements.join("\n\n") } : {}),
        outils,
      });
    }
  }
  return rendu;
}
