import { apiFetch } from "./endpoint";
/**
 * Reprendre ses Chats et ses projets depuis ChatGPT ou Claude.
 *
 * Les deux services exportent les données d'un compte en une archive ZIP
 * (ChatGPT : Paramètres, Contrôle des données, Exporter ; Claude : Paramètres,
 * Confidentialité, Exporter les données). On la lit ici, sur le poste : rien
 * ne part ailleurs que dans l'instance de la personne.
 *
 * L'archive peut peser des gigaoctets (ChatGPT y met les images) : on n'en lit
 * que le répertoire, puis les seuls fichiers JSON utiles, par tranches du
 * fichier (`Blob.slice`), jamais l'archive entière en mémoire. Décompression
 * par `DecompressionStream`, sans bibliothèque.
 */

import { t, tf } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/* Lecture ZIP                                                          */
/* ------------------------------------------------------------------ */

interface EntreeZip {
  nom: string;
  methode: number;
  tailleCompressee: number;
  debutEnTete: number;
}

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

async function tranche(f: Blob, debut: number, fin: number): Promise<DataView> {
  return new DataView(await f.slice(debut, fin).arrayBuffer());
}

/** Le répertoire d'une archive ZIP (ZIP64 compris). */
async function repertoire(f: Blob): Promise<EntreeZip[]> {
  const queue = Math.min(f.size, 65_557);
  const fin = await tranche(f, f.size - queue, f.size);
  let eocd = -1;
  for (let i = fin.byteLength - 22; i >= 0; i--) {
    if (u32(fin, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("archive illisible");
  let nombre = u16(fin, eocd + 10);
  let tailleRep = u32(fin, eocd + 12);
  let debutRep = u32(fin, eocd + 16);
  // ZIP64 : le vrai répertoire est décrit juste avant.
  if (debutRep === 0xffffffff || nombre === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(fin, loc) === 0x07064b50) {
      const ou = u64(fin, loc + 8);
      const z = await tranche(f, ou, ou + 56);
      nombre = u64(z, 32);
      tailleRep = u64(z, 40);
      debutRep = u64(z, 48);
    }
  }
  const rep = await tranche(f, debutRep, debutRep + tailleRep);
  const entrees: EntreeZip[] = [];
  const decodeur = new TextDecoder();
  let o = 0;
  for (let n = 0; n < nombre && o + 46 <= rep.byteLength; n++) {
    if (u32(rep, o) !== 0x02014b50) break;
    const methode = u16(rep, o + 10);
    let tailleCompressee = u32(rep, o + 20);
    const tailleNormale = u32(rep, o + 24);
    const lNom = u16(rep, o + 28);
    const lExtra = u16(rep, o + 30);
    const lComm = u16(rep, o + 32);
    let debutEnTete = u32(rep, o + 42);
    const nom = decodeur.decode(new Uint8Array(rep.buffer, rep.byteOffset + o + 46, lNom));
    // Champ ZIP64 : les valeurs à 0xffffffff y sont données en 64 bits, dans l'ordre.
    let e = o + 46 + lNom;
    const finExtra = e + lExtra;
    while (e + 4 <= finExtra) {
      const id = u16(rep, e);
      const taille = u16(rep, e + 2);
      if (id === 0x0001) {
        let p = e + 4;
        if (tailleNormale === 0xffffffff) p += 8;
        if (tailleCompressee === 0xffffffff) {
          tailleCompressee = u64(rep, p);
          p += 8;
        }
        if (debutEnTete === 0xffffffff) debutEnTete = u64(rep, p);
      }
      e += 4 + taille;
    }
    entrees.push({ nom, methode, tailleCompressee, debutEnTete });
    o += 46 + lNom + lExtra + lComm;
  }
  return entrees;
}

async function lireEntree(f: Blob, e: EntreeZip): Promise<string> {
  const entete = await tranche(f, e.debutEnTete, e.debutEnTete + 30);
  const debut = e.debutEnTete + 30 + u16(entete, 26) + u16(entete, 28);
  const brut = f.slice(debut, debut + e.tailleCompressee);
  if (e.methode === 0) return brut.text();
  if (e.methode !== 8) throw new Error(`compression ${e.methode} non prise en charge`);
  const flux = brut.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(flux).text();
}

/* ------------------------------------------------------------------ */
/* Ce qu'on importe                                                     */
/* ------------------------------------------------------------------ */

export interface MessageImporte {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ChatImporte {
  cle: string;
  titre: string;
  creeLe: string;
  modifieLe: string;
  messages: MessageImporte[];
  /** Clé du projet d'origine, s'il y en a un. */
  projet?: string;
  /** Taille estimée une fois rangée, en caractères. */
  taille: number;
}

export interface ProjetImporte {
  cle: string;
  nom: string;
  description: string;
  /** Instructions du projet (Claude : « prompt_template »). */
  instructions: string;
  documents: { nom: string; contenu: string }[];
}

export interface Import {
  source: "chatgpt" | "claude" | "claude-code" | "codex";
  chats: ChatImporte[];
  projets: ProjetImporte[];
  /** Instructions générales reprises d'un logiciel du poste (CLAUDE.md, AGENTS.md). */
  instructions?: string;
}

/** Nom affiché d'une source d'import. */
export const NOM_SOURCE: Record<Import["source"], string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  "claude-code": "Claude Code",
  codex: "Codex",
};

/** Logiciel d'IA trouvé sur ce poste (gateway/src/importLocal.ts). */
export interface LogicielTrouve {
  id: "claude-code" | "codex" | "cursor" | "chatgpt" | "claude";
  nom: string;
  lisible: boolean;
  conversations: number;
  instructions: boolean;
  note: string;
}

export async function logicielsDuPoste(): Promise<LogicielTrouve[]> {
  try {
    const res = await apiFetch("/helix/import/logiciels");
    if (!res.ok) return [];
    return ((await res.json()) as { logiciels: LogicielTrouve[] }).logiciels;
  } catch {
    return [];
  }
}

export async function lireLogiciel(id: string): Promise<Import> {
  const res = await apiFetch(`/helix/import/logiciel/${id}`);
  const corps = (await res.json().catch(() => ({}))) as Import & { error?: { message?: string } };
  if (!res.ok) throw new Error(corps.error?.message ?? "L'instance n'a pas répondu.");
  return corps;
}

const iso = (v: unknown): string => {
  if (typeof v === "number") return new Date(v * 1000).toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return new Date().toISOString();
};

const taille = (c: Omit<ChatImporte, "taille">) =>
  c.titre.length + c.messages.reduce((s, m) => s + m.content.length + 80, 200);

/* --- ChatGPT ---------------------------------------------------------- */

interface NoeudChatGpt {
  parent?: string | null;
  message?: {
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[]; text?: string };
    create_time?: number | null;
    metadata?: { is_visually_hidden_from_conversation?: boolean };
  } | null;
}

/**
 * Une conversation ChatGPT est un arbre (chaque réponse régénérée ouvre une
 * branche). On suit la branche affichée : du dernier message (`current_node`)
 * jusqu'à la racine, puis on la remet dans l'ordre.
 */
function lireChatGpt(donnees: unknown): Import {
  const liste = Array.isArray(donnees) ? donnees : [];
  const chats: ChatImporte[] = [];
  const projets = new Map<string, ProjetImporte>();
  for (const c of liste as Record<string, unknown>[]) {
    const mapping = (c.mapping ?? {}) as Record<string, NoeudChatGpt>;
    let id = (c.current_node as string | undefined) ?? Object.keys(mapping).pop();
    const branche: NoeudChatGpt[] = [];
    const vus = new Set<string>();
    while (id && mapping[id] && !vus.has(id)) {
      vus.add(id);
      branche.push(mapping[id]);
      id = mapping[id].parent ?? undefined;
    }
    branche.reverse();
    const messages: MessageImporte[] = [];
    for (const n of branche) {
      const m = n.message;
      const role = m?.author?.role;
      if (!m || (role !== "user" && role !== "assistant") || m.metadata?.is_visually_hidden_from_conversation) continue;
      const parts = m.content?.parts ?? (m.content?.text ? [m.content.text] : []);
      const texte = parts
        .map((p) => (typeof p === "string" ? p : typeof p === "object" && p ? "[image]" : ""))
        .join("\n")
        .trim();
      if (!texte) continue;
      messages.push({ role, content: texte, createdAt: iso(m.create_time ?? c.create_time) });
    }
    if (messages.length === 0) continue;
    // Les projets ChatGPT (« g-p-… ») n'ont pas de nom dans l'export : on les numérote.
    const gizmo = typeof c.gizmo_id === "string" && c.gizmo_id.startsWith("g-p-") ? c.gizmo_id : undefined;
    if (gizmo && !projets.has(gizmo)) {
      projets.set(gizmo, { cle: gizmo, nom: tf("Projet ChatGPT {0}", projets.size + 1), description: "", instructions: "", documents: [] });
    }
    const base = {
      cle: String(c.id ?? c.conversation_id ?? chats.length),
      titre: String(c.title ?? "").trim() || t("Chat ChatGPT"),
      creeLe: iso(c.create_time),
      modifieLe: iso(c.update_time ?? c.create_time),
      messages,
      ...(gizmo ? { projet: gizmo } : {}),
    };
    chats.push({ ...base, taille: taille(base) });
  }
  return { source: "chatgpt", chats, projets: [...projets.values()] };
}

/* --- Claude ----------------------------------------------------------- */

function lireClaude(conversations: unknown, projetsBruts: unknown): Import {
  const chats: ChatImporte[] = [];
  for (const c of (Array.isArray(conversations) ? conversations : []) as Record<string, unknown>[]) {
    const messages: MessageImporte[] = [];
    for (const m of (Array.isArray(c.chat_messages) ? c.chat_messages : []) as Record<string, unknown>[]) {
      const role = m.sender === "human" ? "user" : m.sender === "assistant" ? "assistant" : null;
      if (!role) continue;
      const blocs = Array.isArray(m.content)
        ? (m.content as { type?: string; text?: string }[]).filter((b) => b.type === "text" && b.text).map((b) => b.text)
        : [];
      let texte = (blocs.length ? blocs.join("\n") : String(m.text ?? "")).trim();
      // Les pièces jointes lues par Claude : on garde leur texte, sinon la suite n'a plus de sens.
      for (const pj of (Array.isArray(m.attachments) ? m.attachments : []) as { file_name?: string; extracted_content?: string }[]) {
        if (pj.extracted_content) texte += `\n\n[${pj.file_name ?? t("pièce jointe")}]\n${pj.extracted_content}`;
      }
      if (texte) messages.push({ role, content: texte, createdAt: iso(m.created_at ?? c.created_at) });
    }
    if (messages.length === 0) continue;
    const projet = typeof c.project_uuid === "string" ? c.project_uuid : (c.project as { uuid?: string } | undefined)?.uuid;
    const base = {
      cle: String(c.uuid ?? chats.length),
      titre: String(c.name ?? "").trim() || t("Chat Claude"),
      creeLe: iso(c.created_at),
      modifieLe: iso(c.updated_at ?? c.created_at),
      messages,
      ...(projet ? { projet } : {}),
    };
    chats.push({ ...base, taille: taille(base) });
  }
  const projets: ProjetImporte[] = [];
  for (const p of (Array.isArray(projetsBruts) ? projetsBruts : []) as Record<string, unknown>[]) {
    projets.push({
      cle: String(p.uuid ?? projets.length),
      nom: String(p.name ?? "").trim() || t("Projet Claude"),
      description: String(p.description ?? "").trim(),
      instructions: String(p.prompt_template ?? "").trim(),
      documents: ((Array.isArray(p.docs) ? p.docs : []) as { filename?: string; content?: string }[])
        .filter((d) => d.content)
        .map((d) => ({ nom: d.filename || "document.md", contenu: String(d.content) })),
    });
  }
  return { source: "claude", chats, projets };
}

/* ------------------------------------------------------------------ */
/* Entrée                                                               */
/* ------------------------------------------------------------------ */

/**
 * Lit une archive d'export (ou un `conversations.json` seul) et reconnaît sa
 * source à sa forme : un arbre `mapping` pour ChatGPT, des `chat_messages`
 * pour Claude. Lève une erreur au message clair si rien n'est reconnu.
 */
export async function lireExport(fichier: File): Promise<Import> {
  let conversations: unknown = null;
  let projets: unknown = null;
  if (/\.json$/i.test(fichier.name)) {
    conversations = JSON.parse(await fichier.text());
  } else {
    let entrees: EntreeZip[];
    try {
      entrees = await repertoire(fichier);
    } catch {
      throw new Error(t("Ce fichier n'est pas une archive ZIP lisible. Choisissez l'archive telle que ChatGPT ou Claude l'a envoyée."));
    }
    const trouver = (nom: string) => entrees.find((e) => e.nom === nom || e.nom.endsWith(`/${nom}`));
    const conv = trouver("conversations.json");
    if (!conv) throw new Error(t("Aucun fichier conversations.json dans cette archive : ce n'est pas un export ChatGPT ou Claude."));
    conversations = JSON.parse(await lireEntree(fichier, conv));
    const proj = trouver("projects.json");
    if (proj) projets = JSON.parse(await lireEntree(fichier, proj));
  }
  const premier = Array.isArray(conversations) ? (conversations[0] as Record<string, unknown> | undefined) : undefined;
  if (premier && "mapping" in premier) return lireChatGpt(conversations);
  if (premier && "chat_messages" in premier) return lireClaude(conversations, projets);
  if (Array.isArray(conversations) && conversations.length === 0) return { source: "chatgpt", chats: [], projets: [] };
  throw new Error(t("Format non reconnu : ni ChatGPT, ni Claude."));
}
