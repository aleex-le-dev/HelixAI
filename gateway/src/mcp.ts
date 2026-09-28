import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { deployment } from "./deployment.ts";
import { t, tf } from "./langue.ts";
import { cheminProtegeDans, filtrerResultat } from "./zonesProtegees.ts";
import { assurerNodePrive, DEPENDANCES_NPM_AVANT, nodePriveInstallable, npxPrive } from "./installationOpenClaw.ts";
import { retenirOutils } from "./natifs/projetsRegles.ts";

/**
 * Gestionnaire de serveurs MCP auto-hébergés (ARCHITECTURE.md, ADR-004).
 *
 * Les serveurs tournent en local, lancés par la passerelle, et communiquent en
 * JSON-RPC sur stdio. Aucune donnée ne transite par un service tiers.
 */

export interface McpServerConfig {
  id: string;
  label: string;
  description: string;
  /**
   * Commande à exécuter, pour un serveur qui tourne sur cette machine.
   * Absente pour un serveur distant, qui a une `url` à la place.
   */
  command?: string;
  args?: string[];
  /**
   * Adresse d'un serveur MCP **distant**, en HTTP (transport « streamable »).
   *
   * C'est ce que publient les services qui offrent un branchement en un clic :
   * rien à installer sur la machine du client, et l'autorisation se fait dans
   * le navigateur de la personne (voir oauthMcp.ts). HTTPS exigé, sauf sur la
   * boucle locale pour les essais : un jeton d'accès part à chaque appel.
   */
  url?: string;
  /** Fournisseur d'autorisation OAuth, pour un serveur distant qui en demande. */
  auth?: unknown;
  /**
   * Variables d'environnement du processus serveur.
   *
   * C'est par ici, et uniquement par ici, que passe un jeton d'accès. Le mettre
   * en argument de ligne de commande le rendrait lisible par n'importe quel
   * compte de la machine dans la table des processus (`ps`), et il finirait
   * dans l'historique du shell d'un intégrateur qui reproduit la commande.
   */
  env?: Record<string, string>;
  /** Serveur démarré automatiquement au lancement. */
  autoStart: boolean;
  /**
   * Commande libre, hors catalogue (instance qui l'autorise, connecteurs.ts) :
   * ses dépendances ne sont pas tenues à la date du catalogue, qui refuserait
   * un paquet publié après elle.
   */
  libre?: boolean;
}

export interface McpTool {
  /** Nom qualifié exposé au modèle : "<serveur>__<outil>". */
  name: string;
  serverId: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerStatus {
  id: string;
  label: string;
  description: string;
  running: boolean;
  toolCount: number;
  error?: string;
  tools: { name: string; description: string }[];
}

/**
 * Espace de travail auquel l'agent a accès.
 * Priorité : variable d'environnement, puis profil de déploiement client,
 * puis dossier par défaut.
 */
/**
 * Espace de travail de Cowork : le seul endroit où l'agent peut lire et écrire.
 *
 * Il n'est plus figé à l'installation. Une PME range ses dossiers là où elle
 * veut, et un agent cantonné à un seul répertoire imposé ne sert qu'à moitié.
 * Le changer relance le serveur de fichiers avec le nouveau périmètre — c'est
 * un argument de lancement, pas un réglage à chaud.
 */
/**
 * Emplacements de travail, et leur persistance.
 *
 * Le choix était gardé **en mémoire seulement** : changer de dossier depuis
 * l'écran marchait, jusqu'au redémarrage de l'application, qui revenait
 * silencieusement au dossier par défaut. Personne ne fait le lien, et on
 * conclut que le réglage « n'a pas tenu ». Il est maintenant écrit à côté des
 * données de l'instance.
 *
 * L'ordre de priorité ne change pas : la variable d'environnement d'abord (un
 * essai, un conteneur), puis le profil de déploiement (le choix de
 * l'intégrateur, qui n'a pas à être écrasé par un écran), puis le choix
 * enregistré, puis le dossier par défaut.
 */
function fichierEspace(): string {
  const base = process.env.HELIX_DATA_DIR ?? join(homedir(), ".helix", "data");
  return join(base, "espace.json");
}

function lireEspace(): string[] | null {
  try {
    const brut = JSON.parse(readFileSync(fichierEspace(), "utf8")) as { chemins?: unknown };
    const liste = Array.isArray(brut?.chemins)
      ? brut.chemins.filter((c): c is string => typeof c === "string" && c.length > 0)
      : [];
    return liste.length > 0 ? liste : null;
  } catch {
    return null;
  }
}

function ecrireEspace(chemins: string[]): void {
  try {
    const chemin = fichierEspace();
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, JSON.stringify({ chemins }, null, 2), "utf8");
  } catch (err) {
    // Le choix vaut pour cette session : on le dit plutôt que de le taire.
    console.error("[mcp] espace de travail non enregistré :", err);
  }
}

const espaceInitial: string[] = process.env.HELIX_WORKSPACE
  ? [process.env.HELIX_WORKSPACE]
  : deployment().workspace
    ? [deployment().workspace as string]
    : (lireEspace() ?? [join(homedir(), "Helix")]);

let espaceCourant = espaceInitial[0];
let espacesCourants = espaceInitial;

export const workspace = (): string => espaceCourant;

/**
 * **Tous** les emplacements ouverts à l'agent, le principal en tête.
 *
 * Il y en a plusieurs depuis que Cowork peut travailler sur l'ensemble du
 * poste : le dossier personnel **et** les disques montés, qui ne sont pas
 * dedans (`/Volumes` sur macOS, `/media` et `/mnt` sur Linux). Une clé USB ou
 * un partage réseau doit pouvoir être traité sans que l'utilisateur ait à
 * comprendre pourquoi son dossier personnel ne le couvre pas.
 */
export const workspaces = (): string[] => espacesCourants;

/** Conservé pour les appels existants ; préférez `workspace()`. */
export const WORKSPACE = espaceCourant;

/*
 * Au tout premier lancement, le dossier de travail n'existe pas encore et le
 * serveur de fichiers refuserait de démarrer. On le crée : l'utilisateur ne
 * doit rien avoir à préparer.
 */
try {
  if (!existsSync(espaceCourant)) {
    mkdirSync(espaceCourant, { recursive: true });
    console.log(`[mcp] espace de travail créé : ${espaceCourant}`);
  }
} catch (err) {
  console.error(
    `[mcp] impossible de créer l'espace de travail ${espaceCourant} :`,
    err instanceof Error ? err.message : err,
  );
}

/**
 * Serveurs par défaut. Volontairement minimal et sûr : accès fichiers limité à
 * un dossier de travail explicite. Les connecteurs SaaS (Composio) viendront
 * s'ajouter ici comme fournisseur alternatif.
 */
export const DEFAULT_SERVERS: McpServerConfig[] = [
  {
    id: "fichiers",
    label: "Fichiers",
    description: `Lecture et écriture dans ${espaceCourant}`,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem@2026.8.31", ...espaceInitial],
    autoStart: true,
  },
];

interface Live {
  config: McpServerConfig;
  client?: Client;
  tools: McpTool[];
  error?: string;
}

const servers = new Map<string, Live>();

for (const config of DEFAULT_SERVERS) {
  servers.set(config.id, { config, tools: [] });
}

/** Nom qualifié : évite les collisions entre serveurs. */
const qualify = (serverId: string, tool: string) => `${serverId}__${tool}`;

/**
 * Retire d'un texte les secrets qu'il pourrait avoir emportés.
 *
 * Un serveur qui refuse un jeton recopie parfois ce jeton dans son message
 * d'erreur, et ce message part vers l'interface **et** vers la console. Un
 * secret n'a rien à faire ni dans l'une ni dans l'autre : c'est justement au
 * moment où quelque chose échoue qu'on colle une trace dans un ticket.
 */
function masquer(texte: string, env?: Record<string, string>): string {
  let sortie = texte;
  for (const valeur of Object.values(env ?? {})) {
    // Un secret court ou vide produirait un remplacement absurde sur tout le
    // texte : en dessous de huit caractères, ce n'en est pas un.
    if (valeur.length < 8) continue;
    sortie = sortie.split(valeur).join("[secret masqué]");
  }
  return sortie;
}

/**
 * Démarre un serveur MCP **distant**, en HTTP.
 *
 * Rien n'est lancé sur la machine : on se connecte, avec le jeton obtenu par
 * l'autorisation OAuth s'il en faut un. Un serveur qui refuse faute
 * d'autorisation le dit clairement, plutôt que d'échouer sans motif — c'est
 * l'interface qui proposera alors « Se connecter ».
 */
async function demarrerDistant(
  id: string,
  entry: { config: McpServerConfig; client?: Client; tools: McpTool[]; error?: string },
): Promise<{ ok: boolean; error?: string }> {
  const adresse = new URL(entry.config.url!);
  const locale = adresse.hostname === "127.0.0.1" || adresse.hostname === "localhost";
  if (adresse.protocol !== "https:" && !locale) {
    entry.error = "Adresse de serveur distant refusée : https est exigé.";
    return { ok: false, error: entry.error };
  }

  const autorisation = entry.config.auth ? { authProvider: entry.config.auth as never } : {};
  const nouveauClient = () => new Client({ name: "helix-gateway", version: "1.0.0" }, { capabilities: {} });
  let client = nouveauClient();
  try {
    await client.connect(new StreamableHTTPClientTransport(adresse, autorisation));
  } catch (err) {
    /*
     * Revérification des connecteurs du 28/09/2026 : Webflow ne documente que
     * son adresse `/sse`, c'est-à-dire l'ancien transport « HTTP + SSE » du
     * protocole (2024-11-05). Helix ne parlait que le transport « streamable » :
     * un POST sur `/sse` y est refusé (4xx), et le connecteur ne pouvait pas
     * démarrer, quoi que dise l'autorisation. La spécification prévoit le
     * repli : sur un 4xx autre qu'un refus d'autorisation (401, 403), rouvrir
     * en SSE à la même adresse. Un refus d'autorisation, lui, reste un refus :
     * c'est « Se connecter » qu'il faut, pas un autre transport.
     */
    const code = err instanceof StreamableHTTPError ? (err.code ?? 0) : 0;
    if (err instanceof UnauthorizedError || code < 400 || code >= 500 || code === 401 || code === 403) throw err;
    await client.close().catch(() => undefined);
    client = nouveauClient();
    await client.connect(new SSEClientTransport(adresse, autorisation));
  }

  const listed = await client.listTools();
  entry.client = client;
  entry.error = undefined;
  /*
   * Trello, Monday, ClickUp, Todoist, Calendly, Zoom (SECURITE.md § 48) : les
   * lectures sont relevées, les écritures retirées si l'administrateur ne les
   * a pas cochées. Un autre serveur passe tel quel.
   */
  entry.tools = retenirOutils(id, listed.tools, (nom) => qualify(id, nom)).map((t) => ({
    name: qualify(id, t.name),
    serverId: id,
    toolName: t.name,
    description: t.description ?? "",
    inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
  }));
  console.log(`[mcp] ${entry.config.label} branché à distance (${entry.tools.length} outils)`);
  return { ok: true };
}

/*
 * `npx`, là où il n'est pas directement lançable (27/09/2026, essai sous
 * Ubuntu et audit Windows) : une machine sans Node n'en a pas, et sous Windows
 * c'est un `.cmd`, que Node refuse de lancer sans interpréteur de commandes.
 * Dans l'ordre : `npx` du système (macOS et Linux, comme avant) ; le Node du
 * système sous Windows, avec le script de `npx` ; le Node que Helix pose
 * (installationOpenClaw.ts, empreinte vérifiée), installé au besoin. Son
 * dossier passe en tête du PATH : les paquets lancés par `npx` y trouvent
 * `node`.
 */
async function resoudreNpx(): Promise<{ command: string; prefixe: string[]; path?: string } | null> {
  const dansLePath = (nom: string) =>
    (process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((d) => join(d, nom))
      .find((c) => existsSync(c));
  /*
   * Le Node du système, seulement s'il est assez récent (revue Linux du
   * 27/09/2026 : `apt install nodejs` donne Node 12 sur Ubuntu 22.04, où les
   * serveurs d'outils ne démarrent pas).
   */
  const assezRecent = (node: string) => {
    try {
      const v = /v(\d+)/.exec(execFileSync(node, ["--version"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }))?.[1];
      return Number(v) >= 18;
    } catch {
      return false;
    }
  };
  if (process.platform !== "win32") {
    /*
     * Par son chemin complet, son dossier en tête du PATH (revue du
     * 27/09/2026) : une application ouverte depuis le Finder n'a pas celui de
     * Homebrew, et `npx` y échouait (« env: node »).
     */
    const npx = dansLePath("npx") ?? ["/opt/homebrew/bin/npx", "/usr/local/bin/npx"].find((c) => existsSync(c));
    if (npx && assezRecent(join(dirname(npx), "node"))) return { command: npx, prefixe: [], path: dirname(npx) };
  } else {
    const node = dansLePath("node.exe");
    const script = node ? join(dirname(node), "node_modules", "npm", "bin", "npx-cli.js") : null;
    if (node && script && existsSync(script) && assezRecent(node)) return { command: node, prefixe: [script], path: dirname(node) };
  }
  let prive = npxPrive();
  if (!prive && nodePriveInstallable() === null) {
    console.log("[mcp] npx absent de cette machine : installation du Node de Helix (nodejs.org, empreinte vérifiée)...");
    await assurerNodePrive().catch((err) => console.error(`[mcp] Node non installé : ${(err as Error).message}`));
    prive = npxPrive();
  }
  return prive ? { command: prive.node, prefixe: [prive.script], path: prive.dossier } : null;
}

export async function startServer(id: string): Promise<{ ok: boolean; error?: string }> {
  const entry = servers.get(id);
  if (!entry) return { ok: false, error: `Serveur inconnu : ${id}` };
  if (entry.client) return { ok: true };

  try {
    if (entry.config.url) return await demarrerDistant(id, entry);
    const npx = entry.config.command === "npx" ? await resoudreNpx() : null;
    if (entry.config.command === "npx" && !npx) throw new Error(t("npx est absent de cette machine, et Node n'a pas pu être installé."));
    const defaut = getDefaultEnvironment();
    const transport = new StdioClientTransport({
      command: npx ? npx.command : entry.config.command!,
      args: [...(npx?.prefixe ?? []), ...(entry.config.args ?? [])],
      /*
       * `getDefaultEnvironment()` d'abord : sans PATH ni HOME, `npx` ne trouve
       * ni Node ni son cache et le serveur ne démarre jamais. Les secrets du
       * connecteur viennent ensuite, et priment.
       */
      env: {
        ...defaut,
        ...(npx?.path ? { PATH: [npx.path, defaut.PATH ?? process.env.PATH ?? ""].filter(Boolean).join(delimiter) } : {}),
        ...(entry.config.env ?? {}),
        /*
         * Aucun script d'installation : `npx` télécharge le paquet épinglé et ses
         * dépendances, et un script `postinstall` d'une dépendance compromise
         * s'exécuterait sans que personne l'ait voulu (ajouté le 26/09/2026,
         * revue des connecteurs). Les serveurs du catalogue n'en ont pas besoin.
         */
        ...(entry.config.command === "npx" ? { npm_config_ignore_scripts: "true", npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false" } : {}),
        /*
         * Et ses dépendances publiées avant la date du catalogue
         * (DEPENDANCES_NPM_AVANT, installationOpenClaw.ts) : le paquet est
         * épinglé, pas ses dépendances, et aucun de ces paquets ne publie de
         * fichier de verrouillage. Essayé le 28/09/2026 avec npx 11.19 : la
         * variable est honorée (une date antérieure au paquet le fait refuser,
         * `ETARGET`), le serveur de mémoire répond à `initialize`.
         */
        ...(entry.config.command === "npx" && !entry.config.libre ? { npm_config_before: DEPENDANCES_NPM_AVANT } : {}),
      },
      /*
       * Par défaut, le SDK laisse le serveur écrire sur la sortie d'erreur de
       * la passerelle. C'est une fuite mesurée, pas une hypothèse : un serveur
       * qui recopie sa configuration au démarrage — ce que font plusieurs, pour
       * aider au diagnostic — dépose alors son jeton en clair dans le journal
       * de l'instance, hors de tout chiffrement. On l'intercepte pour le
       * relayer masqué : le diagnostic reste lisible, le secret ne sort pas.
       */
      stderr: "pipe",
    });

    // Avant `connect()`, qui démarre le processus : sinon les premières lignes,
    // justement celles qui disent pourquoi un démarrage échoue, sont perdues.
    transport.stderr?.on("data", (morceau: Buffer) => {
      const texte = masquer(morceau.toString("utf8"), entry.config.env).trimEnd();
      if (texte) console.error(`[mcp:${id}] ${texte}`);
    });

    const client = new Client(
      { name: "helix-gateway", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);

    const listed = await client.listTools();
    entry.client = client;
    entry.error = undefined;
    entry.tools = listed.tools.map((t) => ({
      name: qualify(id, t.name),
      serverId: id,
      toolName: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<
        string,
        unknown
      >,
    }));
    console.log(`[mcp] ${entry.config.label} démarré (${entry.tools.length} outils)`);
    return { ok: true };
  } catch (err) {
    entry.error = masquer(err instanceof Error ? err.message : String(err), entry.config.env);
    entry.tools = [];
    console.error(`[mcp] échec du démarrage de ${id} :`, entry.error);
    return { ok: false, error: entry.error };
  }
}

export async function stopServer(id: string): Promise<void> {
  const entry = servers.get(id);
  if (!entry?.client) return;
  try {
    await entry.client.close();
  } catch {
    /* déjà fermé */
  }
  entry.client = undefined;
  entry.tools = [];
}

/**
 * Déclare un serveur, sans le démarrer.
 *
 * La liste des serveurs n'est plus figée à la compilation : `connecteurs.ts` y
 * ajoute ce que l'utilisateur a branché. Ce module reste volontairement bête —
 * il exécute la commande qu'on lui donne. **C'est l'appelant qui répond de sa
 * provenance**, et le seul appelant est le catalogue, jamais une requête HTTP.
 */
export function declarer(config: McpServerConfig): void {
  const existant = servers.get(config.id);
  if (existant) {
    existant.config = config;
    return;
  }
  servers.set(config.id, { config, tools: [] });
}

/** Un serveur porte-t-il déjà cet identifiant ? Évite d'en écraser un autre. */
export const estDeclare = (id: string): boolean => servers.has(id);

/**
 * Arrête un serveur et le retire complètement.
 *
 * `stopServer` seul laisserait l'entrée en place : le connecteur retiré
 * réapparaîtrait dans la liste, éteint, comme s'il attendait d'être rallumé.
 * Retirer veut dire disparaître.
 */
export async function retirerServeur(id: string): Promise<void> {
  await stopServer(id);
  servers.delete(id);
}

/** Démarre les serveurs marqués `autoStart`. */
export async function startAutoServers(): Promise<void> {
  await Promise.all(
    [...servers.values()]
      .filter((s) => s.config.autoStart)
      .map((s) => startServer(s.config.id)),
  );
}

export function status(): McpServerStatus[] {
  return [...servers.values()].map((s) => ({
    id: s.config.id,
    label: t(s.config.label),
    /*
     * Le serveur de fichiers se décrit par le dossier qu'il ouvre : la
     * description est donc écrite au moment de la lire, dans la langue de
     * qui la lit et avec le dossier du moment — pas figée au démarrage.
     */
    description:
      s.config.id === "fichiers"
        ? tf("Lecture et écriture dans {0}", espacesCourants.join(", "))
        : t(s.config.description),
    running: Boolean(s.client),
    toolCount: s.tools.length,
    error: s.error,
    tools: s.tools.map((t) => ({ name: t.toolName, description: t.description })),
  }));
}

/** Tous les outils disponibles, au format « fonction » attendu par le modèle. */
export function toolsForModel(): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}[] {
  return [...servers.values()]
    .flatMap((s) => s.tools)
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
}

export function hasTools(): boolean {
  return [...servers.values()].some((s) => s.tools.length > 0);
}

/** Exécute un outil qualifié et renvoie son résultat en texte. */
export async function callTool(
  qualifiedName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; content: string }> {
  const tool = [...servers.values()].flatMap((s) => s.tools).find((t) => t.name === qualifiedName);
  if (!tool) return { ok: false, content: `Outil inconnu : ${qualifiedName}` };

  const entry = servers.get(tool.serverId);
  if (!entry?.client) return { ok: false, content: `Serveur ${tool.serverId} arrêté.` };

  /*
   * Serveur de fichiers : les zones protégées d'abord (zonesProtegees.ts). Le
   * serveur ne sait borner que par ses dossiers de lancement ; avec « Tout mon
   * poste », c'est le dossier personnel entier, données de l'instance, clés
   * SSH et conversations des autres assistants comprises. Mesuré le
   * 25/09/2026 avant cette barrière : `read_text_file` rendait
   * `~/.helix/data/instance-token`.
   */
  const fichiers = tool.serverId === "fichiers";
  if (fichiers) {
    const fautif = cheminProtegeDans(args, espaceCourant);
    if (fautif) {
      return {
        ok: false,
        content:
          `Accès refusé : « ${fautif} » est dans un emplacement protégé (données de l'instance, clés, ` +
          `réglages et historiques d'autres logiciels). Ni l'agent ni l'équipe n'y ont accès, quel que ` +
          `soit le dossier ouvert. Ne réessaie pas par un autre chemin.`,
      };
    }
  }

  try {
    const result = await entry.client.callTool({ name: tool.toolName, arguments: args });
    const parts = (result.content ?? []) as { type: string; text?: string }[];
    const brut = parts
      .map((p) => (p.type === "text" ? (p.text ?? "") : `[${p.type}]`))
      .join("\n")
      .trim();
    const text = fichiers ? filtrerResultat(tool.toolName, args, brut, espaceCourant) : brut;
    return { ok: !result.isError, content: expliquer(text) || "(résultat vide)" };
  } catch (err) {
    return {
      ok: false,
      content: expliquer(err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * Traduit les refus du serveur de fichiers en quelque chose d'actionnable.
 *
 * Le serveur MCP de fichiers ne voit que le dossier de travail, et refuse tout
 * le reste par « Access denied - path outside allowed directories ». Le modèle
 * relaie cette phrase telle quelle, en anglais, sans dire quel est ce dossier
 * ni comment en changer : l'utilisateur en conclut que l'agent « est
 * restreint » et n'a aucune piste. Signalé par le client le 20/09/2026.
 *
 * On ne lève pas la limite — c'est elle qui empêche un agent de se promener
 * dans tout le disque. On explique où elle est et comment la déplacer.
 */
function expliquer(texte: string): string {
  if (!/access denied|outside allowed directories|not allowed/i.test(texte)) return texte;
  return (
    `${texte}\n\n` +
    `Ce chemin est hors des emplacements ouverts à l'agent, qui sont ` +
    `${workspaces().map((c) => `« ${c} »`).join(", ")}. L'agent ne voit que ` +
    `cela. Pour travailler ailleurs, changez le dossier depuis l'écran Cowork ` +
    `(panneau de droite, « Dossier ») — « Tout mon poste » ouvre le dossier ` +
    `personnel et les disques montés d'un coup.`
  );
}


/**
 * Change l'espace de travail de Cowork et relance le serveur de fichiers.
 *
 * Le périmètre est un argument de lancement du serveur : il faut donc l'arrêter
 * et le relancer. L'opération est brève, et c'est le prix d'une garantie forte —
 * l'agent ne peut rien atteindre en dehors de ce qui lui a été désigné.
 */
export async function setWorkspace(
  chemins: string | string[],
): Promise<{ ok: boolean; error?: string }> {
  const liste = (Array.isArray(chemins) ? chemins : [chemins]).filter(Boolean);
  if (liste.length === 0) return { ok: false, error: "Aucun dossier fourni." };

  espaceCourant = liste[0];
  espacesCourants = liste;

  const entree = servers.get("fichiers");
  if (!entree) return { ok: false, error: "Serveur de fichiers introuvable." };

  entree.config = {
    ...entree.config,
    description:
      liste.length === 1
        ? `Lecture et écriture dans ${liste[0]}`
        : `Lecture et écriture dans ${liste.length} emplacements, à partir de ${liste[0]}`,
    args: ["-y", "@modelcontextprotocol/server-filesystem@2026.8.31", ...liste],
  };

  await stopServer("fichiers");
  const resultat = await startServer("fichiers");
  if (resultat.ok) ecrireEspace(liste);
  return resultat;
}
