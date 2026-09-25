import type http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { toolsForModel as outilsMcp } from "./mcp.ts";
import * as courrier from "./courrier.ts";
import * as agenda from "./agenda.ts";
import * as drive from "./drive.ts";
import * as slack from "./slack.ts";
import * as bibliotheque from "./bibliotheque.ts";
import * as reunions from "./reunions.ts";
import { groupesDe } from "./groupes.ts";
import { executerOutil, cibleDe, type DefinitionOutil } from "./outils.ts";
import { verifierOutil } from "./approbation.ts";
import { journaliser } from "./audit.ts";
import { api, cleOutils, portEnCours } from "./opencode.ts";

/**
 * Les connecteurs de l'instance, servis par MCP à l'agent de code (OpenCode).
 *
 * Jusqu'ici, Helix Code n'avait que les outils d'OpenCode : lire, écrire,
 * chercher, lancer une commande dans le dossier du projet. Les connecteurs
 * branchés dans Paramètres (Google Drive, Slack, courrier, agenda, serveurs
 * MCP du catalogue) n'existaient que pour le Chat et Cowork, parce que c'est
 * la boucle de `chat.ts` qui les exécute, et qu'OpenCode tient sa propre
 * boucle. Demandé le 25/09/2026 : « les différents MCP » doivent marcher aussi
 * depuis le terminal, c'est-à-dire dans Helix Code.
 *
 * OpenCode sait parler à un serveur MCP distant (`mcp` de sa configuration,
 * type « remote », en-têtes fixes). Vérifié le 25/09/2026 sur OpenCode
 * 1.18.32 : il s'y connecte en HTTP « streamable », avec les en-têtes écrits
 * dans sa configuration. On ne lui donne pas les serveurs eux-mêmes, on lui
 * donne **cette route**, et c'est ce qui rend la chose sûre :
 *
 *  - chaque appel passe par la barrière d'approbation (`verifierOutil`), au
 *    niveau choisi pour l'instance, comme dans le Chat. Donner à OpenCode la
 *    commande des serveurs MCP l'aurait laissé les appeler sans jamais
 *    demander, c'est-à-dire contourner la barrière ;
 *  - chaque appel est scellé au journal, au nom de la personne ;
 *  - les secrets des connecteurs restent dans la passerelle : OpenCode ne voit
 *    que des noms d'outils.
 *
 * **Le serveur de fichiers de Cowork n'y est pas**, ni le contrôle du code
 * web, ni l'écran, ni la bureautique. Ils agissent sur le dossier de travail de
 * Cowork, pas sur celui du projet : les donner à l'agent de code l'aurait fait
 * sortir du dossier du projet, que sa configuration lui interdit de quitter
 * (`external_directory: deny`, opencode.ts). Pour les fichiers du projet, il a
 * déjà les siens.
 *
 * **Pourquoi Helix Code passe par l'ancienne API d'OpenCode.** Les sessions de
 * sa nouvelle API (`/api/session`) ne proposent au modèle que les outils
 * livrés avec OpenCode : son registre d'outils « v2 » n'a aucune place pour
 * ceux des serveurs MCP (lu dans le code d'OpenCode 1.18.32, voir
 * fluxCode.ts), et le modèle répondait que l'outil n'existait pas. Les
 * sessions de l'ancienne API (`/session`), elles, reçoivent les outils MCP.
 * Depuis le 25/09/2026, Helix Code ouvre donc ses sessions par l'ancienne API,
 * et la passerelle traduit son flux pour les clients (fluxCode.ts). Vérifié le
 * même jour avec Qwen3 8B, un serveur MCP d'essai (scripts/mcp-essai.mjs) et
 * `helix code` comme la route de l'écran : l'outil est proposé et appelé, la
 * carte d'accord arrive chez la personne qui a envoyé la demande, le refus
 * empêche l'appel, l'accord le laisse partir, le journal le note
 * (`surface: "code"`), et deux personnes au travail en même temps font
 * refuser sans carte.
 *
 * **Pour qui l'agent travaille.** OpenCode ne dit pas, dans un appel d'outil,
 * de quelle session il vient : un seul client MCP sert toutes ses sessions
 * (vérifié : aucun en-tête ni champ ne la porte). La passerelle, elle, sait qui
 * a envoyé chaque demande à Helix Code (`noterDemande`), et OpenCode dit
 * quelles sessions travaillent en ce moment (voir `titulaire`). Un appel
 * d'outil vient forcément d'une session au travail : si toutes celles qui
 * travaillent appartiennent à la même personne, c'est elle. Sinon — deux
 * personnes au même instant, ou personne de connu — l'outil est **refusé**,
 * sans carte : une carte envoyée à la mauvaise personne lui ferait approuver
 * l'action d'un autre. Un contrôle qui ne sait pas refuse.
 */

/** Demandes envoyées à Helix Code : session OpenCode → personne et dossier. */
const demandes = new Map<string, { userId: string; dossier: string; depuis: number }>();

/** Une demande part : la session appartient, pour ce tour, à cette personne. */
export function noterDemande(sessionID: string, userId: string, dossier: string): void {
  demandes.set(sessionID, { userId, dossier, depuis: Date.now() });
  // Borne de mémoire : les plus anciennes s'oublient d'abord.
  if (demandes.size > 500) {
    const plusAncienne = [...demandes.entries()].sort((a, b) => a[1].depuis - b[1].depuis)[0];
    if (plusAncienne) demandes.delete(plusAncienne[0]);
  }
}

/**
 * La personne pour qui l'agent de code travaille en ce moment, ou `null` si on
 * ne peut pas le dire sans ambiguïté.
 */
async function titulaire(): Promise<string | null> {
  const dossiers = new Set([...demandes.values()].map((d) => d.dossier));
  const auTravail = new Set<string>();
  /*
   * Deux listes, parce qu'OpenCode tient deux familles de sessions : celles de
   * l'ancienne API (`/session`, celles de Helix Code depuis le 25/09/2026),
   * actives dans `/session/status` (mesuré : `{"ses_…":{"type":"busy"}}`
   * pendant un tour), et celles de la nouvelle, dans `/api/session/active`
   * (`{"data":{"ses_…":{"type":"running"}}}`), que la première ne voit pas.
   * Helix n'ouvre plus de session de la nouvelle API : une session active qui
   * n'est pas dans `demandes`, de l'une ou l'autre famille, n'a pas été
   * ouverte par Helix, compte comme inconnue, donc fait refuser.
   */
  for (const dossier of dossiers) {
    const d = encodeURIComponent(dossier);
    for (const [chemin, lire] of [
      [`/api/session/active?directory=${d}`, (c: unknown) => (c as { data?: unknown })?.data],
      [`/session/status?directory=${d}`, (c: unknown) => c],
    ] as const) {
      try {
        const r = await api(chemin, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) continue;
        const etat = lire(await r.json()) as Record<string, { type?: string } | undefined> | undefined;
        for (const [id, s] of Object.entries(etat ?? {})) {
          // « idle » ne travaille pas ; « running », « busy » et « retry », si.
          if (s && s.type !== "idle") auTravail.add(id);
        }
      } catch {
        /* illisible : ce dossier ne compte pour personne, ce qui fait refuser plutôt qu'attribuer */
      }
    }
  }
  const personnes = new Set<string>();
  for (const id of auTravail) {
    const d = demandes.get(id);
    // Une session au travail que Helix n'a pas lancée (ouverte hors de la passerelle) : inconnue, donc ambiguë.
    personnes.add(d ? d.userId : "?");
  }
  if (personnes.size !== 1) return null;
  const [seule] = [...personnes];
  return seule === "?" ? null : seule;
}

/** Outils offerts à l'agent de code : les connecteurs, sans ce qui agit hors du projet. */
export function outilsPourCode(): DefinitionOutil[] {
  return [
    ...outilsMcp().filter((o) => !o.function.name.startsWith("fichiers__")),
    ...courrier.toolsForModel(),
    ...agenda.toolsForModel(),
    ...drive.toolsForModel(),
    ...slack.toolsForModel(),
    ...bibliotheque.toolsForModel(),
    ...reunions.toolsForModel(),
  ];
}

/**
 * Liste d'outils vue par OpenCode, par serveur OpenCode et par dossier.
 *
 * OpenCode lit la liste des outils d'un serveur MCP **une fois**, quand il s'y
 * connecte, et la garde (lu dans son code, 1.18.32 : `defs`, remplis à la
 * connexion). Cette route est sans état : elle ne peut pas lui annoncer un
 * changement. Mesuré le 25/09/2026 : un connecteur ajouté pendant qu'OpenCode
 * tournait n'existait pas pour l'agent de code (« Aucun outil disponible pour
 * ajouter des notes »), jusqu'au redémarrage d'OpenCode. Avant chaque demande,
 * si la liste a changé depuis la dernière connexion, on demande à OpenCode de
 * se reconnecter (`POST /mcp/helix/connect`), ce qui la lui fait relire.
 */
const listesVues = new Map<string, string>();

export async function rafraichirOutilsCode(dossier: string): Promise<void> {
  const serveur = portEnCours();
  if (!serveur) return;
  const cle = `${serveur}|${dossier}`;
  const signature = outilsPourCode()
    .map((o) => o.function.name)
    .sort()
    .join(",");
  if (listesVues.get(cle) === signature) return;
  try {
    const r = await api(`/mcp/helix/connect?directory=${encodeURIComponent(dossier)}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    await r.text().catch(() => "");
    if (r.ok) listesVues.set(cle, signature);
  } catch {
    /* OpenCode n'a pas répondu : on réessaiera à la demande suivante */
  }
}

/** La clé présentée est-elle celle que la passerelle a écrite pour OpenCode ? */
function cleValide(valeur: string | undefined): boolean {
  if (!valeur) return false;
  const a = Buffer.from(valeur);
  const b = Buffer.from(cleOutils);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sert une requête MCP d'OpenCode. Rend `false` si la clé manque ou ne va pas :
 * l'appelant répond alors 403. Sans état, comme `serveurOutils.ts` : un
 * transport par requête, réponses JSON.
 */
export async function servirOutilsCode(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  corps: unknown,
): Promise<boolean> {
  const cle = req.headers["x-helix-cle"];
  if (!cleValide(typeof cle === "string" ? cle : undefined)) return false;

  const serveur = new Server({ name: "helix-code-outils", version: "1.0.0" }, { capabilities: { tools: {} } });

  serveur.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: outilsPourCode().map((o) => ({
      name: o.function.name,
      description: o.function.description,
      inputSchema: o.function.parameters as { type: "object"; [k: string]: unknown },
    })),
  }));

  /*
   * OpenCode abandonne l'appel (arrêt demandé, délai dépassé) : la requête se
   * ferme. Une approbation accordée **après** ne doit pas faire partir une
   * action que l'agent tient déjà pour échouée.
   */
  let ferme = false;
  res.on("close", () => {
    ferme = true;
  });

  serveur.setRequestHandler(CallToolRequestSchema, async (demande) => {
    const nom = demande.params.name;
    const args = (demande.params.arguments ?? {}) as Record<string, unknown>;
    const texte = (t: string, erreur = false) => ({ content: [{ type: "text" as const, text: t }], isError: erreur });

    // Relu à chaque appel : un connecteur débranché entre-temps ne part plus.
    if (!outilsPourCode().some((o) => o.function.name === nom)) {
      return texte(`L'outil ${nom} n'est pas disponible pour l'agent de code.`, true);
    }

    const qui = await titulaire();
    if (!qui) {
      journaliser("outil.refuse", "systeme", { outil: nom, surface: "code", cause: "titulaire-inconnu" });
      return texte(
        "Outil refusé par l'instance : elle ne peut pas dire avec certitude pour qui tu travailles " +
          "(plusieurs personnes utilisent l'agent de code en même temps). Réessaie plus tard ou fais sans cet outil, et dis-le.",
        true,
      );
    }

    const verdict = await verifierOutil(null, nom, args, qui);
    if (!verdict.autorise) return texte(verdict.message, true);
    if (ferme) {
      journaliser("outil.refuse", qui, { outil: nom, surface: "code", cause: "appel-abandonne" });
      return texte("Appel abandonné avant l'accord : l'action n'a pas été faite.", true);
    }

    const pour = { userId: qui, groupes: await groupesDe(qui) };
    const r = nom.startsWith("reunions__") ? await reunions.callTool(nom, args, pour) : await executerOutil(nom, args, pour);
    journaliser("outil.appele", qui, { outil: nom, cible: cibleDe(args), ok: r.ok, surface: "code" });
    return texte(r.content, !r.ok);
  });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void serveur.close();
  });
  await serveur.connect(transport);
  await transport.handleRequest(req, res, corps);
  return true;
}
