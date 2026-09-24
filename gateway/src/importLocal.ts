import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, join } from "node:path";
import { t } from "./langue.ts";

/**
 * Import sans export : ce que les autres logiciels d'IA laissent sur ce poste.
 *
 * Demandé le 24/09/2026 : « sur Codex ou Claude, on importe automatiquement ».
 * Codex reprend, à son installation, la configuration de Claude Code ; Helix
 * fait de même, et plus : il trouve les logiciels d'IA installés, dit ce
 * qu'il peut en reprendre, et le reprend au clic.
 *
 * Ce qui se lit, mesuré sur le poste du client ce jour-là :
 *  - Claude Code : un fichier JSONL par conversation (~/.claude/projects),
 *    avec le dossier de travail et un titre ; instructions ~/.claude/CLAUDE.md ;
 *  - Codex : un JSONL par session (~/.codex/sessions), messages de la personne
 *    et de l'agent, dossier de travail ; instructions ~/.codex/AGENTS.md ;
 *  - Cursor : conversations dans sa base SQLite (state.vscdb), lue par
 *    l'outil `sqlite3` du système en lecture seule ; format relevé sur la
 *    version 14 de ses données, mais le poste du client n'avait que des
 *    brouillons vides : lecture pas encore éprouvée sur de vraies conversations ;
 * Ce qui ne se lit pas, et qu'on dit :
 *  - l'application ChatGPT : conversations chiffrées sur le disque ;
 *  - l'application Claude : conversations sur les serveurs d'Anthropic.
 *    Pour ces deux-là, l'export officiel (Paramètres > Importer) reste la voie.
 *
 * Rien n'est envoyé nulle part : la passerelle lit, l'écran choisit, le poste
 * range (même chemin que l'import d'une archive). Seulement sur un poste
 * autonome : sur une instance d'entreprise, ces fichiers seraient ceux du
 * serveur, pas ceux de la personne (index.ts le refuse).
 */

export interface MessageLu {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
export interface ChatLu {
  cle: string;
  titre: string;
  creeLe: string;
  modifieLe: string;
  messages: MessageLu[];
  projet?: string;
  taille: number;
}
export interface ProjetLu {
  cle: string;
  nom: string;
  description: string;
  instructions: string;
  documents: { nom: string; contenu: string }[];
}
export interface ImportLocal {
  source: "claude-code" | "codex" | "cursor";
  chats: ChatLu[];
  projets: ProjetLu[];
  /** Instructions générales de la personne pour ce logiciel (CLAUDE.md, AGENTS.md). */
  instructions: string;
}

export interface Logiciel {
  id: "claude-code" | "codex" | "cursor" | "chatgpt" | "claude";
  nom: string;
  present: boolean;
  /** Ce que Helix peut en reprendre. */
  lisible: boolean;
  conversations: number;
  instructions: boolean;
  /** Pourquoi ce qui manque manque, dans les mots de la personne. */
  note: string;
}

const MAISON = homedir();
const TEXTE_MAX = 20_000;
const CHATS_MAX = 500;

function lireTexte(f: string, max = 50_000): string {
  try {
    return readFileSync(f, "utf8").slice(0, max);
  } catch {
    return "";
  }
}

function fichiers(dossier: string, extension: string, profondeur: number): string[] {
  const sortie: string[] = [];
  const parcourir = (d: string, p: number) => {
    let entrees: import("node:fs").Dirent[] = [];
    try {
      entrees = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const chemin = join(d, e.name);
      if (e.isDirectory() && p > 0) parcourir(chemin, p - 1);
      else if (e.isFile() && e.name.endsWith(extension)) sortie.push(chemin);
    }
  };
  parcourir(dossier, profondeur);
  return sortie;
}

const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString());
const taille = (c: Omit<ChatLu, "taille">) => c.titre.length + c.messages.reduce((s, m) => s + m.content.length + 80, 200);
const couper = (s: string) => (s.length > TEXTE_MAX ? `${s.slice(0, TEXTE_MAX)}\n[…]` : s);
const titreDe = (premier: string) => premier.replace(/\s+/g, " ").trim().slice(0, 70) || "Conversation importée";

/** Les dossiers de travail deviennent des projets Helix, avec leurs instructions (CLAUDE.md, AGENTS.md). */
function projetDe(dossier: string | undefined, projets: Map<string, ProjetLu>): string | undefined {
  if (!dossier) return undefined;
  if (!projets.has(dossier)) {
    const instructions = ["CLAUDE.md", "AGENTS.md"].map((f) => lireTexte(join(dossier, f), 20_000)).filter(Boolean).join("\n\n");
    projets.set(dossier, { cle: dossier, nom: basename(dossier) || dossier, description: dossier, instructions, documents: [] });
  }
  return dossier;
}

/* ------------------------------------------------------------------ */
/* Claude Code                                                         */
/* ------------------------------------------------------------------ */

function texteClaude(contenu: unknown): string {
  if (typeof contenu === "string") return contenu;
  if (!Array.isArray(contenu)) return "";
  // Seul le texte : les appels d'outils et leurs résultats n'ont pas de sens hors de Claude Code.
  return contenu
    .filter((p) => (p as { type?: string }).type === "text")
    .map((p) => String((p as { text?: string }).text ?? ""))
    .join("\n");
}

function lireClaudeCode(): ImportLocal {
  const projets = new Map<string, ProjetLu>();
  const chats: ChatLu[] = [];
  for (const f of fichiers(join(MAISON, ".claude", "projects"), ".jsonl", 1).slice(-CHATS_MAX)) {
    const messages: MessageLu[] = [];
    let titre = "";
    let dossier: string | undefined;
    for (const ligne of lireTexte(f, 60_000_000).split("\n")) {
      if (!ligne.trim()) continue;
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(ligne) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (d.type === "custom-title" || d.type === "ai-title") {
        titre = String(d.customTitle ?? d.title ?? d.aiTitle ?? titre);
        continue;
      }
      if ((d.type !== "user" && d.type !== "assistant") || d.isSidechain || d.isCompactSummary || d.isMeta) continue;
      dossier ??= typeof d.cwd === "string" ? d.cwd : undefined;
      const texte = texteClaude((d.message as { content?: unknown } | undefined)?.content).trim();
      // Les messages système de Claude Code (commandes, rappels) ne sont pas la conversation.
      if (!texte || /^<(command|local-command|system-reminder)/.test(texte)) continue;
      messages.push({ role: d.type as "user" | "assistant", content: couper(texte), createdAt: iso(d.timestamp) });
    }
    if (messages.length === 0) continue;
    const c = {
      cle: `claude-code:${basename(f, ".jsonl")}`,
      titre: titre || titreDe(messages.find((m) => m.role === "user")?.content ?? ""),
      creeLe: messages[0]!.createdAt,
      modifieLe: messages[messages.length - 1]!.createdAt,
      messages,
      projet: projetDe(dossier, projets),
    };
    chats.push({ ...c, taille: taille(c) });
  }
  return { source: "claude-code", chats, projets: [...projets.values()], instructions: lireTexte(join(MAISON, ".claude", "CLAUDE.md")) };
}

/* ------------------------------------------------------------------ */
/* Codex                                                               */
/* ------------------------------------------------------------------ */

function lireCodex(): ImportLocal {
  const projets = new Map<string, ProjetLu>();
  const chats: ChatLu[] = [];
  const tous = [...fichiers(join(MAISON, ".codex", "sessions"), ".jsonl", 4), ...fichiers(join(MAISON, ".codex", "archived_sessions"), ".jsonl", 4)];
  for (const f of tous.slice(-CHATS_MAX)) {
    const messages: MessageLu[] = [];
    let dossier: string | undefined;
    for (const ligne of lireTexte(f, 60_000_000).split("\n")) {
      if (!ligne.trim()) continue;
      let d: { type?: string; timestamp?: string; payload?: Record<string, unknown> };
      try {
        d = JSON.parse(ligne);
      } catch {
        continue;
      }
      const p = d.payload ?? {};
      if (d.type === "session_meta") dossier ??= typeof p.cwd === "string" ? p.cwd : undefined;
      if (d.type !== "event_msg") continue;
      const role = p.type === "user_message" ? "user" : p.type === "agent_message" ? "assistant" : null;
      let texte = typeof p.message === "string" ? p.message.trim() : "";
      /*
       * Codex place devant la demande la liste des fichiers ouverts et le
       * contexte de l'éditeur, puis « ## My request for Codex: ». On ne garde
       * que la demande.
       */
      const demande = /##\s*My request for Codex:?\s*([\s\S]*)$/i.exec(texte);
      if (demande) texte = demande[1]!.trim();
      else if (/^(# Files mentioned by the user|<environment_context>)/.test(texte)) texte = "";
      if (role && texte) messages.push({ role, content: couper(texte), createdAt: iso(d.timestamp) });
    }
    if (messages.length === 0) continue;
    const c = {
      cle: `codex:${basename(f, ".jsonl")}`,
      titre: titreDe(messages.find((m) => m.role === "user")?.content ?? ""),
      creeLe: messages[0]!.createdAt,
      modifieLe: messages[messages.length - 1]!.createdAt,
      messages,
      projet: projetDe(dossier, projets),
    };
    chats.push({ ...c, taille: taille(c) });
  }
  return { source: "codex", chats, projets: [...projets.values()], instructions: lireTexte(join(MAISON, ".codex", "AGENTS.md")) };
}

/* ------------------------------------------------------------------ */
/* Cursor                                                              */
/* ------------------------------------------------------------------ */

/*
 * La base de Cursor, lue en lecture seule par l'outil `sqlite3` du système
 * (livré avec macOS et la plupart des Linux) : la passerelle tourne sur un
 * Node sans module SQLite. Sans l'outil (Windows), Cursor n'est pas lisible,
 * et on le dit.
 */
const baseCursor = () => join(appSupport("Cursor"), "User", "globalStorage", "state.vscdb");

function sqlite(base: string, requete: string): Record<string, unknown>[] {
  try {
    const sortie = execFileSync("sqlite3", ["-readonly", "-json", base, requete], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, timeout: 60_000 });
    return sortie.trim() ? (JSON.parse(sortie) as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

const sqliteDisponible = () => {
  try {
    execFileSync("sqlite3", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

/** Texte d'une bulle Cursor : `text`, sinon le texte brut de `richText` (éditeur Lexical). */
function texteBulle(b: Record<string, unknown>): string {
  if (typeof b.text === "string" && b.text.trim()) return b.text;
  if (typeof b.richText === "string" && b.richText.startsWith("{")) {
    try {
      const arbre = JSON.parse(b.richText) as { root?: unknown };
      const pile: unknown[] = [arbre.root ?? arbre];
      const morceaux: string[] = [];
      while (pile.length) {
        const n = pile.pop() as { text?: unknown; children?: unknown[] } | null;
        if (!n || typeof n !== "object") continue;
        if (typeof n.text === "string") morceaux.push(n.text);
        if (Array.isArray(n.children)) pile.push(...[...n.children].reverse());
      }
      return morceaux.join(" ");
    } catch {
      return "";
    }
  }
  return "";
}

function lireCursor(): ImportLocal {
  const base = baseCursor();
  const chats: ChatLu[] = [];
  const lignes = sqlite(base, "select key, value from cursorDiskKV where key like 'composerData:%'");
  for (const l of lignes.slice(-CHATS_MAX)) {
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(String(l.value)) as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = String(d.composerId ?? String(l.key).split(":")[1] ?? "");
    const date = (v: unknown) => (typeof v === "number" ? new Date(v).toISOString() : iso(v));
    let bulles: Record<string, unknown>[] = [];
    if (Array.isArray(d.conversation) && d.conversation.length > 0) {
      bulles = d.conversation as Record<string, unknown>[];
    } else if (Array.isArray(d.fullConversationHeadersOnly) && d.fullConversationHeadersOnly.length > 0 && /^[\w-]+$/.test(id)) {
      // Format récent : chaque bulle est rangée à part, sous « bubbleId:<conversation>:<bulle> ».
      const parId = new Map(
        sqlite(base, `select key, value from cursorDiskKV where key like 'bubbleId:${id}:%'`).map((b) => [String(b.key).split(":")[2], b.value]),
      );
      for (const h of d.fullConversationHeadersOnly as { bubbleId?: string }[]) {
        const brut = h.bubbleId ? parId.get(h.bubbleId) : undefined;
        if (typeof brut !== "string") continue;
        try {
          bulles.push(JSON.parse(brut) as Record<string, unknown>);
        } catch {
          /* bulle illisible */
        }
      }
    }
    const messages: MessageLu[] = [];
    for (const b of bulles) {
      // 1 : la personne, 2 : l'agent.
      const role = b.type === 1 ? "user" : b.type === 2 ? "assistant" : null;
      const texte = texteBulle(b).trim();
      if (role && texte) messages.push({ role, content: couper(texte), createdAt: date(b.createdAt ?? d.createdAt) });
    }
    if (messages.length === 0) continue;
    const c = {
      cle: `cursor:${id}`,
      titre: (typeof d.name === "string" && d.name.trim()) || titreDe(messages.find((m) => m.role === "user")?.content ?? ""),
      creeLe: date(d.createdAt),
      modifieLe: date(d.lastUpdatedAt ?? d.createdAt),
      messages,
    };
    chats.push({ ...c, taille: taille(c) });
  }
  const regles = lireTexte(join(MAISON, ".cursorrules"));
  return { source: "cursor", chats, projets: [], instructions: regles };
}

/** Nombre de conversations Cursor qui ont vraiment des messages. */
function compterCursor(): number {
  const lignes = sqlite(baseCursor(), "select value from cursorDiskKV where key like 'composerData:%'");
  let n = 0;
  for (const l of lignes) {
    try {
      const d = JSON.parse(String(l.value)) as { conversation?: unknown[]; fullConversationHeadersOnly?: unknown[] };
      if ((d.conversation?.length ?? 0) > 0 || (d.fullConversationHeadersOnly?.length ?? 0) > 0) n++;
    } catch {
      /* ligne illisible */
    }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Ce qui est installé                                                 */
/* ------------------------------------------------------------------ */

const appSupport = (nom: string) =>
  platform() === "darwin"
    ? join(MAISON, "Library", "Application Support", nom)
    : platform() === "win32"
      ? join(process.env.APPDATA ?? join(MAISON, "AppData", "Roaming"), nom)
      : join(MAISON, ".config", nom);

const compter = (dossier: string, profondeur: number) => fichiers(dossier, ".jsonl", profondeur).length;

export function logicielsTrouves(): Logiciel[] {
  const claudeCode = existsSync(join(MAISON, ".claude"));
  const codex = existsSync(join(MAISON, ".codex"));
  const cursor = existsSync(join(MAISON, ".cursor")) || existsSync(baseCursor());
  const cursorLisible = cursor && existsSync(baseCursor()) && sqliteDisponible();
  const chatgpt = existsSync(appSupport("com.openai.chat")) || existsSync(appSupport("ChatGPT"));
  const claude = existsSync(appSupport("Claude"));
  return [
    {
      id: "claude-code",
      nom: "Claude Code",
      present: claudeCode,
      lisible: claudeCode,
      conversations: claudeCode ? compter(join(MAISON, ".claude", "projects"), 1) : 0,
      instructions: existsSync(join(MAISON, ".claude", "CLAUDE.md")),
      note: t("Conversations, dossiers de projet et instructions."),
    },
    {
      id: "codex",
      nom: "Codex",
      present: codex,
      lisible: codex,
      conversations: codex ? compter(join(MAISON, ".codex", "sessions"), 4) + compter(join(MAISON, ".codex", "archived_sessions"), 4) : 0,
      instructions: existsSync(join(MAISON, ".codex", "AGENTS.md")),
      note: t("Conversations, dossiers de projet et instructions."),
    },
    {
      id: "cursor",
      nom: "Cursor",
      present: cursor,
      lisible: cursorLisible,
      conversations: cursorLisible ? compterCursor() : 0,
      instructions: existsSync(join(MAISON, ".cursorrules")),
      note: cursorLisible
        ? t("Conversations de l'agent et du Chat.")
        : t("Ses conversations sont dans sa propre base, que Helix ne peut pas lire sur cet ordinateur."),
    },
    {
      id: "chatgpt",
      nom: "ChatGPT",
      present: chatgpt,
      lisible: false,
      conversations: 0,
      instructions: false,
      note: t("L'application chiffre ses conversations sur le disque : passez par l'export de ChatGPT, ci-dessous."),
    },
    {
      id: "claude",
      nom: "Claude",
      present: claude,
      lisible: false,
      conversations: 0,
      instructions: false,
      note: t("Les conversations sont sur les serveurs d'Anthropic : passez par l'export de Claude, ci-dessous."),
    },
  ].filter((l) => l.present) as Logiciel[];
}

export function lireLogiciel(id: string): ImportLocal | null {
  if (id === "claude-code") return lireClaudeCode();
  if (id === "codex") return lireCodex();
  if (id === "cursor") return lireCursor();
  return null;
}
