import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import {
  writeFileSync,
  readFileSync,
  unlinkSync,
  chmodSync,
  existsSync,
  mkdirSync,
  realpathSync,
  statSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { PORT, NIVEAUX_EFFORT } from "./config.ts";
import { instanceToken } from "./auth.ts";
import { models } from "./router.ts";
import { deployment } from "./deployment.ts";
import { t, tf } from "./langue.ts";

/**
 * Moteur de l'écran Code : OpenCode en mode serveur (ARCHITECTURE.md, ADR-003).
 *
 * OpenCode n'appelle jamais un fournisseur directement : il est configuré pour
 * passer par la passerelle Helix. Il hérite donc du routage par rôle, du profil
 * de déploiement client et des clés d'API — locale aujourd'hui, cloud européen
 * demain, sans rien changer ici.
 */

/*
 * `HELIX_OPENCODE_BIN` d'abord : un intégrateur peut ainsi fixer la version
 * d'OpenCode qu'il a éprouvée, indépendamment de celle que la personne a
 * installée pour son propre usage. C'est aussi ce qui permet d'essayer une
 * nouvelle version avant de l'adopter.
 */
const CANDIDATES = [
  ...(process.env.HELIX_OPENCODE_BIN ? [process.env.HELIX_OPENCODE_BIN] : []),
  `${homedir()}/.opencode/bin/opencode`,
  "opencode",
];

/**
 * Mot de passe du serveur OpenCode, tiré à chaque démarrage de la passerelle.
 *
 * Sans lui, OpenCode écoute sur la boucle locale **sans aucune
 * authentification** — il l'annonce lui-même au démarrage : « server is
 * unsecured ». Vérifié au banc : un simple `curl -X POST
 * http://127.0.0.1:<port>/api/session` sans le moindre jeton ouvre une session
 * d'agent, donc l'accès aux outils de lecture, d'écriture et de commande
 * d'OpenCode dans le dossier de projet. Toute l'authentification de la
 * passerelle — jeton d'instance et séance — était contournable par n'importe
 * quel processus du poste, sans rien connaître de Helix.
 *
 * Le mot de passe ne vit qu'en mémoire, le temps de l'exécution : il n'est
 * écrit nulle part sur le disque. OpenCode l'attend en HTTP Basic, avec
 * l'utilisateur littéral « opencode » (mesuré : tout autre nom est refusé).
 */
const motDePasseServeur = randomBytes(24).toString("base64url");

const enteteServeur = (): string =>
  "Basic " + Buffer.from(`opencode:${motDePasseServeur}`).toString("base64");

/**
 * Clé que présente OpenCode au serveur d'outils de la passerelle
 * (`/helix/code/outils`, outilsCode.ts). Le jeton d'instance ne suffit pas :
 * il est sur chaque poste du parc, et cette route fait agir les connecteurs
 * sans séance. Tirée à chaque démarrage, gardée en mémoire, écrite seulement
 * dans la configuration d'OpenCode (fichier 0600, qui porte déjà le jeton).
 */
export const cleOutils = randomBytes(24).toString("base64url");

let child: ChildProcess | null = null;
let port: number | null = null;
let starting: Promise<number | null> | null = null;
let lastError: string | undefined;
/** Les modèles écrits dans la configuration que le serveur en cours a lue. */
let modelesEcrits = new Set<string>();

export interface CodeStatus {
  available: boolean;
  running: boolean;
  port: number | null;
  projectDir: string;
  error?: string;
}

/** Dossier de travail de l'écran Code. */
export function projectDir(): string {
  return (
    dossierChoisi ??
    process.env.HELIX_CODE_DIR ??
    deployment().workspace ??
    join(homedir(), "Helix")
  );
}

async function chercherBinaire(): Promise<string | null> {
  for (const candidate of CANDIDATES) {
    try {
      const probe = spawn(candidate, ["--version"], { stdio: "ignore" });
      const ok = await new Promise<boolean>((resolve) => {
        probe.on("close", (code) => resolve(code === 0));
        probe.on("error", () => resolve(false));
      });
      if (ok) return candidate;
    } catch {
      /* candidat suivant */
    }
  }
  return null;
}

/**
 * Localisation d'OpenCode, mémorisée.
 *
 * `status()` appelle `locate()` à chaque `GET /helix/code`, et la recherche
 * lançait un `opencode --version` par appel. Mesuré au banc : 40 requêtes
 * simultanées ouvrent 40 processus enfants. Or cette route ne demande que le
 * jeton d'instance — présent sur chaque poste du parc — et sa réponse tient en
 * quatre champs : n'importe qui pouvait saturer la machine avec des requêtes
 * d'apparence anodine.
 *
 * Un binaire trouvé ne se déplace pas en cours d'exécution : la réponse est
 * gardée définitivement. Une absence, elle, peut être corrigée par une
 * installation pendant que Helix tourne — on la revérifie donc, mais pas plus
 * d'une fois par demi-minute. C'est la même mémorisation que `findLms` dans
 * backends.ts.
 */
const LOCALISATION_TTL = 30_000;
let binaireConnu: string | null = null;
let rechercheEnCours: Promise<string | null> | null = null;
let dernierEchec = 0;

function locate(): Promise<string | null> {
  if (binaireConnu) return Promise.resolve(binaireConnu);
  // Une recherche déjà lancée sert tous les appelants : c'est elle qui évite la
  // rafale de processus quand plusieurs requêtes arrivent ensemble.
  if (rechercheEnCours) return rechercheEnCours;
  if (dernierEchec && Date.now() - dernierEchec < LOCALISATION_TTL) {
    return Promise.resolve(null);
  }

  rechercheEnCours = chercherBinaire()
    .catch(() => null)
    .then((trouve) => {
      if (trouve) binaireConnu = trouve;
      else dernierEchec = Date.now();
      rechercheEnCours = null;
      return trouve;
    });
  return rechercheEnCours;
}

/**
 * Écrit la configuration OpenCode du projet : un fournisseur unique, la
 * passerelle Helix. Les modèles proposés sont ceux qu'elle expose réellement.
 */
/**
 * Où vit la configuration d'OpenCode, et pourquoi plus dans le dossier de
 * travail.
 *
 * Elle y était, et deux choses clochaient.
 *
 * **Elle n'était plus lue.** OpenCode 1.18 range les projets par dépôt : un
 * dossier qui n'est pas un dépôt Git devient le projet « global », et sa
 * configuration locale est ignorée. Mesuré le 20/09/2026 : le journal
 * d'OpenCode ne charge que les trois chemins globaux, jamais celui du dossier.
 * Le fournisseur « helix » n'existait donc pas pour lui, et chaque prompt
 * finissait en « Provider request failed with HTTP 401 : missing_api_key »
 * chez un fournisseur distant, puis en « Model unavailable » une fois le
 * modèle nommé.
 *
 * **Elle portait le jeton d'instance en clair dans le dossier de
 * l'utilisateur**, c'est-à-dire souvent un dépôt Git ou un partage réseau. Le
 * commentaire d'origine s'en remettait à un `.gitignore` posé par
 * l'intégrateur, ce qui revient à confier une clé à la vigilance d'un tiers.
 *
 * Le fichier vit désormais à côté des données de l'instance, et son chemin est
 * transmis au serveur par `OPENCODE_CONFIG` : lu à coup sûr, quel que soit le
 * dossier de travail, et hors de portée d'un `git add .`.
 */
function dossierConfig(): string {
  const base = process.env.HELIX_DATA_DIR ?? join(homedir(), ".helix", "data");
  const dossier = join(base, "opencode");
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
  return dossier;
}

/**
 * Un **dossier**, et pas un fichier : `OPENCODE_CONFIG` ne produit aucun effet
 * mesurable en 1.18.3 (le fournisseur reste inconnu), là où
 * `OPENCODE_CONFIG_DIR` fonctionne. Vérifié en interrogeant le serveur
 * lui-même : `GET /api/provider` ne rend « helix » que dans le second cas.
 */
const cheminConfig = (): string => join(dossierConfig(), "opencode.json");

async function writeConfig(dir: string): Promise<void> {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  /*
   * Ménage de l'ancien emplacement : un `opencode.json` écrit par une version
   * précédente porte le jeton d'instance en clair dans le dossier de travail.
   * On ne l'efface que si c'est bien le nôtre — reconnaissable à son
   * fournisseur « helix » — pour ne jamais toucher à celui d'un utilisateur
   * qui aurait le sien.
   */
  const ancien = join(dir, "opencode.json");
  try {
    if (existsSync(ancien)) {
      const contenu = JSON.parse(readFileSync(ancien, "utf8")) as {
        provider?: Record<string, unknown>;
      };
      if (contenu?.provider && Object.keys(contenu.provider).length === 1 && contenu.provider.helix) {
        unlinkSync(ancien);
        console.log(`[opencode] ancienne configuration retirée du dossier de travail : ${ancien}`);
      }
    }
  } catch {
    /* illisible ou non supprimable : on n'insiste pas, la nouvelle prime */
  }

  const available = await models();
  const usable = available.filter(
    (m) => m.roles.includes("code") || m.roles.includes("chat"),
  );

  /*
   * Une variante par niveau de raisonnement de l'écran (« faible », « eleve »…).
   * OpenCode recopie les options d'une variante dans le corps de chaque appel
   * au modèle : `effort` arrive donc à la passerelle, qui l'applique comme pour
   * le Chat (`basePayload`, chat.ts). Mesuré le 23/09/2026 contre un faux
   * fournisseur : la variante « faible » fait partir `"effort":"faible"`, sans
   * variante rien ne part. Sans cela, le sélecteur de niveau de l'écran Code
   * était décoratif.
   *
   * Toutes les variantes existent pour tous les modèles, et c'est nécessaire :
   * une session ouverte sur une variante inconnue d'OpenCode accepte la demande
   * puis se tait pour toujours (vérifié, même banc).
   */
  const variantes = Object.fromEntries(
    Object.keys(NIVEAUX_EFFORT).map((niveau) => [niveau, { effort: niveau }]),
  );
  const modelEntries: Record<string, { name: string; variants: Record<string, { effort: string }> }> = {};
  for (const m of usable) modelEntries[m.id] = { name: `${m.id} (${m.backendLabel})`, variants: variantes };
  if (Object.keys(modelEntries).length === 0) {
    modelEntries["auto"] = { name: "Automatique", variants: variantes };
  }
  modelesEcrits = new Set(Object.keys(modelEntries));

  const pinned = deployment().models?.code;
  const preferred = pinned?.includes("/") ? pinned.split("/").pop()! : pinned;
  const defaultModel = preferred ?? usable[0]?.id ?? "auto";

  const fichierConfig = cheminConfig();
  writeFileSync(
    fichierConfig,
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        provider: {
          helix: {
            npm: "@ai-sdk/openai-compatible",
            // Nom affiché dans OpenCode : celui de la marque, pas celui du code.
            name: process.env.HELIX_NOM_PRODUIT?.trim() || "Instance",
            /*
             * La clé est le jeton d'instance : depuis que la passerelle exige
             * une authentification, un fournisseur sans clé se heurte à un 401
             * au premier prompt — et l'échec est silencieux côté interface.
             */
            options: {
              baseURL: `http://localhost:${PORT}/v1`,
              apiKey: instanceToken(),
            },
            models: modelEntries,
          },
        },
        model: `helix/${defaultModel}`,
        /*
         * Le « petit modèle » sert aux travaux annexes : titre de session,
         * résumés. Sans cette ligne, OpenCode les confie à son propre
         * fournisseur hébergé, c'est-à-dire qu'un morceau du code du client
         * part chez un tiers pour écrire un titre.
         */
        small_model: `helix/${defaultModel}`,
        /*
         * Aucun repli sur le fournisseur distant d'OpenCode : sur une
         * plateforme vendue comme locale, un basculement silencieux vers un
         * service tiers enverrait le code du client hors de sa machine.
         *
         * ⚠ Mesuré le 20/09/2026 sur OpenCode 1.18.3 : cette liste **n'est
         * pas respectée**. `GET /api/provider` rend encore « opencode », avec
         * trente et un modèles hébergés. C'est la raison du 401 d'origine : la
         * session sans modèle tombait sur l'un d'eux. La vraie protection est
         * ailleurs, et elle tient en deux points : la passerelle nomme
         * toujours le modèle (`handleCodeSession`), et `small_model` ci-dessus
         * couvre les travaux annexes. La liste reste, pour le jour où elle
         * refonctionnera.
         */
        /*
         * Jamais de question en attente. OpenCode demande une autorisation
         * avant de sortir du dossier de travail (« external_directory »), ou
         * devant une boucle (« doom_loop »), et son outil « question » attend
         * une réponse de la personne. Aucune de ces demandes ne passe par le
         * flux que l'écran écoute : vérifié le 23/09/2026, une lecture de
         * /etc/hosts laissait la session bloquée pour toujours, l'outil
         * tournant à l'écran sans que personne puisse répondre. Refusées
         * d'office, elles deviennent un échec d'outil que le modèle lit et
         * explique (vérifié, même banc). C'est aussi la règle de Helix : une
         * fois le dossier choisi, l'agent n'en sort pas.
         */
        permission: { external_directory: "deny", doom_loop: "deny", question: "deny" },
        /*
         * Les connecteurs de l'instance (Drive, Slack, courrier, agenda,
         * serveurs MCP du catalogue), servis par la passerelle elle-même et non
         * par leurs serveurs : chaque appel repasse ainsi par la barrière
         * d'approbation et le journal (voir outilsCode.ts).
         *
         * `timeout` : OpenCode coupe un appel d'outil MCP au bout de ce délai
         * (5 secondes par défaut, d'après son schéma de configuration). Une
         * carte d'accord attend jusqu'à deux minutes (`DELAI`, approbation.ts) :
         * coupé avant, l'agent aurait tenu pour échouée une action que la
         * personne était en train d'approuver. `oauth: false` : un refus de la
         * passerelle ne doit pas lancer chez OpenCode une autorisation OAuth.
         */
        mcp: {
          helix: {
            type: "remote",
            url: `http://localhost:${PORT}/helix/code/outils`,
            headers: { Authorization: `Bearer ${instanceToken()}`, "X-Helix-Cle": cleOutils },
            enabled: true,
            oauth: false,
            timeout: 130_000,
          },
        },
        autoupdate: false,
        disabled_providers: ["opencode", "anthropic", "openai", "google", "openrouter"],
      },
      null,
      2,
    ),
    "utf8",
  );

  /*
   * Ce fichier porte le jeton d'instance en clair, et il est déposé dans le
   * dossier de travail choisi par l'utilisateur — pas dans le dossier de
   * données de Helix. Écrit avec les permissions par défaut, il était lisible
   * par tout autre compte de la machine : le jeton donne accès à l'ensemble de
   * la passerelle. On le resserre au seul propriétaire.
   *
   * Ce qui reste à la charge de l'intégrateur : ce dossier est souvent un dépôt
   * Git ou un partage réseau. `opencode.json` n'a rien à y faire — à écarter
   * par un `.gitignore` ou une exclusion de synchronisation.
   */
  try {
    chmodSync(fichierConfig, 0o600);
  } catch {
    /* système de fichiers sans permissions (partage réseau) : on continue */
  }
}

/**
 * La session de chauffe, lancée une fois à chaque démarrage d'OpenCode.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * OpenCode (1.18.3, et encore 1.18.32) rate au hasard la **première** session
 * qu'il exécute après son démarrage : « Model unavailable », alors que le
 * modèle est bien là, et la session se tait pour toujours. Mesuré : 2 à 3
 * démarrages sur 10. Jamais les sessions suivantes : 21 sur 21 réussies sur un
 * serveur déjà chaud.
 *
 * On donne donc cette première exécution à une session jetable. Elle vise un
 * modèle qui n'existe pas : elle échoue tout de suite, **sans appeler aucun
 * modèle** ni rien coûter, et absorbe le démarrage à froid. Mesuré ensuite :
 * 30 démarrages sur 30 réussis, contre un raté sur dix pour le témoin au même
 * moment. Elle est supprimée aussitôt, pour ne pas encombrer la liste des
 * sessions de la personne si elle se sert aussi d'OpenCode directement.
 *
 * Le guet de l'écran Code (useCode.ts) reste en place derrière : si une
 * demande ne démarre pas en 12 secondes, il la relance dans une session neuve.
 * La chauffe évite l'attente ; le guet couvre ce qu'elle n'aurait pas prévu.
 *
 * Depuis le 25/09/2026, Helix Code passe par l'ancienne API d'OpenCode (voir
 * fluxCode.ts) : la chauffe aussi, pour chauffer le moteur qui servira.
 * Mesuré le même jour : sur un modèle inconnu, la session échoue en quelques
 * millisecondes (« Model not found »), sans appeler de modèle.
 */
async function chauffer(sur: number, dossier: string): Promise<void> {
  const base = `http://127.0.0.1:${sur}`;
  const entetes = { Authorization: enteteServeur(), "Content-Type": "application/json" };
  const d = `?directory=${encodeURIComponent(dossier)}`;
  try {
    const creation = await fetch(`${base}/session${d}`, {
      method: "POST",
      headers: entetes,
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    const corps = (await creation.json().catch(() => ({}))) as { id?: string };
    const id = corps.id;
    if (!id) return;
    await fetch(`${base}/session/${encodeURIComponent(id)}/prompt_async${d}`, {
      method: "POST",
      headers: entetes,
      body: JSON.stringify({
        model: { providerID: "helix", modelID: "chauffe-helix-sans-modele" },
        parts: [{ type: "text", text: "chauffe" }],
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
    // Le temps que l'exécution échoue, comme prévu.
    await new Promise((r) => setTimeout(r, 1000));
    await fetch(`${base}/session/${encodeURIComponent(id)}?directory=${encodeURIComponent(dossier)}`, {
      method: "DELETE",
      headers: entetes,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch {
    /* une chauffe ratée ne doit jamais empêcher de travailler */
  }
}

/** Démarre le serveur OpenCode s'il ne tourne pas déjà. */
export async function ensureServer(): Promise<number | null> {
  if (port && child && !child.killed) return port;
  if (starting) return starting;

  starting = (async () => {
    const binary = await locate();
    if (!binary) {
      lastError = "OpenCode n'est pas installé sur cette machine.";
      return null;
    }

    const dir = projectDir();
    await writeConfig(dir);

    /*
     * Un port que le système garantit libre, plutôt qu'un tirage au hasard
     * entre 4096 et 4596. Le tirage pouvait tomber sur un port occupé — 4096
     * est justement celui qu'OpenCode prend par défaut quand la personne s'en
     * sert elle-même : notre serveur échouait alors à démarrer, et la sonde
     * ci-dessous pouvait obtenir sa réponse de **l'autre** serveur, sans mot de
     * passe s'il n'en a pas, et y adosser l'écran Code.
     */
    const chosen = await portLibre();
    const proc = spawn(binary, ["serve", "--port", String(chosen), "--hostname", "127.0.0.1"], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Le mot de passe ferme le serveur d'agent aux autres processus du poste.
        OPENCODE_SERVER_PASSWORD: motDePasseServeur,
        // La configuration ne dépend plus du dossier de travail (voir dossierConfig).
        OPENCODE_CONFIG_DIR: dossierConfig(),
        /*
         * Rien vers l'extérieur, et rien d'autre que la configuration de Helix.
         *
         * OpenCode télécharge à chaque démarrage la liste des modèles de
         * models.dev — vérifié : il a appelé un faux serveur mis à sa place.
         * C'est un service tiers contacté sans que personne l'ait décidé, sur
         * un produit qui promet le contraire. Il sait aussi se mettre à jour
         * seul, publier une conversation en lien public, télécharger des
         * serveurs de langage, et lire la configuration personnelle de Claude
         * Code et d'autres outils présents sur le poste : autant de choses
         * qu'un agent de code d'entreprise n'a pas à faire dans le dos de la
         * personne. Vérifié : avec ces réglages, il répond normalement et
         * n'appelle plus rien.
         */
        OPENCODE_DISABLE_MODELS_FETCH: "true",
        OPENCODE_DISABLE_AUTOUPDATE: "true",
        OPENCODE_DISABLE_SHARE: "true",
        OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
        OPENCODE_DISABLE_CLAUDE_CODE: "true",
        OPENCODE_DISABLE_EXTERNAL_SKILLS: "true",
      },
    });

    proc.stdout?.on("data", (b: Buffer) => console.log("[opencode]", b.toString().trim()));
    proc.stderr?.on("data", (b: Buffer) => {
      const text = b.toString().trim();
      if (text) console.error("[opencode]", text);
    });
    let sorti = false;
    proc.on("exit", (code) => {
      sorti = true;
      console.log(`[opencode] serveur arrêté (code ${code})`);
      // Seulement si c'est bien lui qui tournait : un ancien serveur arrêté
      // après un redémarrage ne doit pas faire oublier le nouveau.
      if (child === proc) {
        child = null;
        port = null;
      }
    });

    // Attend que le serveur réponde.
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((r) => setTimeout(r, 500));
      // Notre serveur est mort (port pris entre-temps, binaire cassé) : ce qui
      // répondrait sur ce port n'est pas lui.
      if (sorti) break;
      try {
        const res = await fetch(`http://127.0.0.1:${chosen}/api/session`, {
          // Depuis que le serveur exige un mot de passe, une sonde sans en-tête
          // reçoit 401 : le serveur serait déclaré « jamais prêt ».
          headers: { Authorization: enteteServeur() },
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) {
          await chauffer(chosen, dir);
          child = proc;
          port = chosen;
          lastError = undefined;
          console.log(`[opencode] prêt sur le port ${chosen} (projet : ${dir})`);
          return chosen;
        }
      } catch {
        /* pas encore prêt */
      }
    }

    proc.kill();
    lastError = "Le serveur OpenCode n'a pas démarré à temps.";
    return null;
  })();

  const result = await starting;
  starting = null;
  return result;
}

/**
 * Le serveur tourne-t-il **déjà** ?
 *
 * Constat pur : aucune recherche de binaire, aucun démarrage. C'est ce qui
 * permet à une route de lecture — le relais du flux d'évènements — de se
 * contenter de relayer. `status()` ne convient pas pour cela : elle appelle
 * `locate()`, qui peut lancer un processus de sonde.
 */
export function enMarche(): boolean {
  return Boolean(port && child && !child.killed);
}

/** Port du serveur en cours, ou `null` : distingue un OpenCode redémarré du précédent. */
export const portEnCours = (): number | null => (enMarche() ? port : null);

export async function status(): Promise<CodeStatus> {
  const binary = await locate();
  return {
    available: Boolean(binary),
    running: Boolean(port && child && !child.killed),
    port,
    projectDir: projectDir(),
    error: lastError,
  };
}

export function stopServer(): void {
  child?.kill();
  child = null;
  port = null;
}

/**
 * S'assure que le serveur OpenCode connaît ce modèle, et le redémarre sinon.
 *
 * OpenCode ne lit sa configuration qu'à son démarrage. Helix l'écrit à ce
 * moment-là avec les modèles que la machine sert — et si LM Studio n'était pas
 * encore prêt, ou si un modèle a été téléchargé depuis, la liste est courte.
 * Le serveur refusait alors tout prompt : « Model unavailable: helix/qwen3-8b »
 * dans son journal, et rien du tout à l'écran. Observé sur le poste du client
 * le 22/09/2026, cinq fois depuis le 20. On réécrit donc la configuration et
 * on relance le serveur avant d'ouvrir une session sur un modèle qu'il ignore.
 */
export async function assurerModele(id: string): Promise<boolean> {
  if (port && child && !child.killed && !modelesEcrits.has(id)) {
    console.log(`[opencode] modèle « ${id} » absent de la configuration lue : redémarrage du serveur.`);
    stopServer();
  }
  if (!(await ensureServer())) return false;

  /*
   * Puis on le lui demande. Ouvrir une session sur un modèle qu'OpenCode ne
   * connaît pas ne produit **aucune** erreur visible : le prompt est accepté,
   * son flux annonce « admis », puis se tait pour toujours — l'échec ne part
   * que dans le journal d'OpenCode. Reproduit le 23/09/2026. C'était le
   * « je demande mais rien ne se passe » de l'écran Code. Mieux vaut refuser
   * la session avec une raison que l'ouvrir sur un silence.
   */
  try {
    const reponse = await api("/config/providers");
    if (!reponse.ok) return true; // on ne sait pas vérifier : on ne bloque pas
    const corps = (await reponse.json()) as {
      providers?: { id: string; models?: Record<string, unknown> }[];
    };
    const helix = corps.providers?.find((p) => p.id === "helix");
    return Boolean(helix?.models && id in helix.models);
  } catch {
    return true;
  }
}

/** Anciens noms de niveaux, encore dans les préférences de certains postes. */
const ANCIENS_NIVEAUX: Record<string, string> = { rapide: "faible", auto: "moyen", approfondi: "eleve" };

/**
 * La variante OpenCode d'un niveau de raisonnement (voir `writeConfig`) : le
 * niveau lui-même s'il est connu, aucune sinon. Jamais un nom inventé : une
 * variante inconnue fait taire la session.
 */
export function varianteDe(effort?: string): string | undefined {
  const niveau = effort ? (ANCIENS_NIVEAUX[effort] ?? effort) : undefined;
  return niveau && niveau in NIVEAUX_EFFORT ? niveau : undefined;
}

/**
 * Modèle et variante d'une demande, au format de l'ancienne API d'OpenCode :
 * toujours le fournisseur de l'instance. Ils partent avec chaque demande
 * (`prompt_async`) ; la nouvelle API les fixait sur la session.
 */
export function refModele(
  id: string,
  variante?: string,
): { model: { providerID: string; modelID: string }; variant?: string } {
  return { model: { providerID: "helix", modelID: id }, ...(variante ? { variant: variante } : {}) };
}

/** Un port TCP libre sur la boucle locale, attribué par le système. */
function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const serveur = createServer();
    serveur.unref();
    serveur.on("error", reject);
    serveur.listen(0, "127.0.0.1", () => {
      const adresse = serveur.address();
      const numero = typeof adresse === "object" && adresse ? adresse.port : 0;
      serveur.close(() => (numero ? resolve(numero) : reject(new Error("aucun port libre"))));
    });
  });
}

/**
 * Ouvre le flux d'événements de l'ancienne API pour un dossier (`/event`),
 * **sans délai d'inactivité**. C'est fluxCode.ts qui le lit et le traduit.
 *
 * `fetch` (undici) coupe une réponse qui ne reçoit rien pendant cinq minutes :
 * mesuré le 23/09/2026 sur le flux d'une session, fermé à 301 s pile, et
 * l'écran perdait son abonnement sans le savoir. `http.request` n'a pas ce
 * délai.
 */
export async function fluxEvenements(dossier: string): Promise<http.IncomingMessage> {
  const actif = await ensureServer();
  if (!actif) throw new Error(lastError ?? "OpenCode indisponible.");
  return new Promise((resolve, reject) => {
    const requete = http.request(
      {
        host: "127.0.0.1",
        port: actif,
        path: `/event?directory=${encodeURIComponent(dossier)}`,
        headers: { Authorization: enteteServeur(), Accept: "text/event-stream" },
      },
      resolve,
    );
    requete.on("error", reject);
    requete.end();
  });
}

/*
 * Identifiant de message au format d'OpenCode (`msg_` + 12 chiffres
 * hexadécimaux de temps + 14 caractères au hasard), croissant comme les
 * siens : OpenCode range les messages d'une session par identifiant, un nom
 * pris au hasard pouvait donc passer avant les messages précédents. Recopié de
 * packages/opencode/src/id/id.ts à la révision v1.18.32. La passerelle le
 * choisit elle-même pour le rendre aux clients à l'envoi : ils reconnaissent
 * ainsi dans le flux les évènements de LEUR demande (`session.next.prompted`).
 */
let dernierInstant = 0;
let compteur = 0;
export function idMessage(): string {
  const maintenant = Date.now();
  if (maintenant !== dernierInstant) {
    dernierInstant = maintenant;
    compteur = 0;
  }
  compteur++;
  const valeur = BigInt(maintenant) * 0x1000n + BigInt(compteur);
  const temps = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) temps[i] = Number((valeur >> BigInt(40 - 8 * i)) & 0xffn);
  const signes = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const hasard = [...randomBytes(14)].map((o) => signes[o % 62]).join("");
  return `msg_${temps.toString("hex")}${hasard}`;
}

/** Appelle l'API OpenCode, en démarrant le serveur au besoin. */
export async function api(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const active = await ensureServer();
  if (!active) throw new Error(lastError ?? "OpenCode indisponible.");
  // On complète les en-têtes de l'appelant plutôt que de les remplacer : le
  // « Content-Type » des routes POST doit survivre.
  const entetes = new Headers(init?.headers);
  entetes.set("Authorization", enteteServeur());
  return fetch(`http://127.0.0.1:${active}${path}`, { ...init, headers: entetes });
}

/* ------------------------- choix du dossier de travail ------------------------ */

/**
 * Dossier de travail retenu pour l'écran Code, quand l'utilisateur en a choisi
 * un. Il remplace le dossier par défaut le temps de la session.
 */
let dossierChoisi: string | null = null;

/**
 * Emplacements qu'un dossier de travail ne peut jamais désigner.
 *
 * Ce ne sont pas des endroits où une entreprise range ses documents : ce sont
 * les organes du système. Y lâcher un agent ne rendrait service à personne et
 * suffirait à rendre la machine inutilisable. Tout le reste est permis, y
 * compris hors du dossier personnel.
 */
/**
 * Tout le poste, sauf ce qui appartient au système.
 *
 * Cowork doit pouvoir travailler là où sont les documents de la personne, et
 * pas seulement dans un dossier désigné : c'est la demande, et elle est juste.
 * Un assistant qui ne peut pas ouvrir le fichier qu'on lui montre ne sert à
 * rien.
 *
 * On rend donc le dossier personnel **et** les points de montage — une clé
 * USB, un disque externe, un partage réseau ne sont pas dans le dossier
 * personnel, et personne n'a à comprendre pourquoi.
 *
 * Ce qui reste fermé, et ne s'ouvrira pas par un réglage : les organes du
 * système (`INTERDITS`). Un agent n'a aucune raison d'écrire dans `/System` ou
 * `/usr`, et une erreur y est irréparable. La barrière qui compte vraiment
 * n'est pas celle-ci de toute façon : c'est la barrière d'approbation
 * (approbation.ts), qui demande avant chaque modification.
 */
export function toutLePoste(): string[] {
  const lieux = [homedir()];
  // Points de montage, selon le système. Seuls ceux qui existent sont ouverts :
  // un chemin inexistant fait refuser le serveur de fichiers au démarrage.
  for (const montage of ["/Volumes", "/media", "/mnt"]) {
    try {
      if (statSync(montage).isDirectory()) lieux.push(montage);
    } catch {
      /* absent sur ce système */
    }
  }
  return lieux;
}

const INTERDITS = [
  "/System",
  "/usr",
  "/bin",
  "/sbin",
  "/private/etc",
  "/private/var/db",
  "/Library/Security",
  "/Applications",
];

/**
 * Forme repliée d'un chemin, pour comparer à la liste des interdits.
 *
 * `realpath` résout les liens symboliques mais ne corrige pas la casse : sur un
 * système de fichiers insensible à la casse — celui de macOS par défaut, et
 * celui de Windows —, `realpath("/system")` rend « /system », qui ne
 * correspondait à aucune entrée de la liste alors qu'il désigne bien `/System`.
 * « /private/ETC » et « /USR » passaient de la même façon. La comparaison se
 * fait donc sur une forme repliée, jamais sur la chaîne telle qu'elle a été
 * saisie.
 *
 * `toLowerCase` et non `toLocaleLowerCase` : le repli ne doit pas dépendre de
 * la langue du poste.
 */
const replier = (chemin: string) => chemin.normalize("NFC").toLowerCase();

/**
 * Valide un dossier proposé par l'interface.
 *
 * Le périmètre était borné au dossier personnel. C'était trop serré : les
 * documents d'une PME vivent souvent sur un disque externe ou un partage
 * réseau, et refuser ces emplacements revenait à refuser le cas d'usage. La
 * personne désigne son dossier elle-même, par le sélecteur du système ; c'est
 * elle qui décide, pas nous.
 *
 * Ce qui reste interdit tient en deux points : les organes du système, et les
 * chemins atteints par un lien symbolique qui les contourne. On résout donc
 * les liens avant de comparer, sinon un lien suffirait à désigner `/etc`.
 *
 * Cette barrière borne le CHOIX de la personne. Une fois le dossier fixé,
 * l'agent, lui, ne sort plus de ce dossier : c'est le serveur de fichiers qui
 * l'y tient.
 */
export function validerDossier(chemin: string): { ok: true; chemin: string } | { ok: false; raison: string } {
  let resolu: string;
  try {
    resolu = realpathSync(chemin);
  } catch {
    return { ok: false, raison: t("Ce dossier n'existe pas.") };
  }

  try {
    if (!statSync(resolu).isDirectory()) {
      return { ok: false, raison: t("Ce chemin n'est pas un dossier.") };
    }
  } catch {
    return { ok: false, raison: t("Ce dossier n'est pas lisible.") };
  }

  // La racine du disque contient tout : la désigner reviendrait à ne rien borner.
  if (resolu === "/") {
    return {
      ok: false,
      raison: t("Choisissez un dossier précis plutôt que la racine du disque."),
    };
  }

  const cible = replier(resolu);
  for (const interdit of INTERDITS) {
    const organe = replier(interdit);

    // Le dossier EST un organe du système, ou se trouve à l'intérieur.
    if (cible === organe || cible.startsWith(organe + "/")) {
      return {
        ok: false,
        raison: t(
          "Ce dossier appartient au système. Choisissez un dossier de documents, de projets ou de travail.",
        ),
      };
    }

    /*
     * Le dossier CONTIENT un organe du système. Refuser « /private/etc » sans
     * refuser « /private » ne protégeait rien : l'agent lâché sur le parent y
     * descend au premier appel. Même raisonnement que pour la racine du disque,
     * appliqué à chaque interdit.
     */
    if (organe.startsWith(cible + "/")) {
      return {
        ok: false,
        raison: tf(
          "Ce dossier est trop large : il contient {0}, qui appartient au système. Choisissez un dossier de documents, de projets ou de travail.",
          interdit,
        ),
      };
    }
  }

  return { ok: true, chemin: resolu };
}

/** Fixe le dossier de travail. `null` revient au dossier par défaut. */
export function setProjectDir(chemin: string | null): void {
  dossierChoisi = chemin;
}

/**
 * Sous-dossiers d'un chemin, pour que l'interface puisse le parcourir.
 * Les dossiers cachés sont écartés : ils n'intéressent personne ici et
 * encombrent la liste.
 */
export interface Raccourci {
  nom: string;
  chemin: string;
}

/** Emplacements usuels, filtrés sur ce qui existe réellement sur ce poste. */
function raccourcis(): Raccourci[] {
  const maison = homedir();
  const candidats: Raccourci[] = [
    { nom: "Dossier personnel", chemin: maison },
    { nom: "Bureau", chemin: join(maison, "Desktop") },
    { nom: "Documents", chemin: join(maison, "Documents") },
    { nom: "Téléchargements", chemin: join(maison, "Downloads") },
    { nom: "Disques externes", chemin: "/Volumes" },
  ];
  return candidats.filter((c) => {
    try {
      return statSync(c.chemin).isDirectory();
    } catch {
      return false;
    }
  });
}

export function listerDossiers(chemin: string): {
  chemin: string;
  parent: string | null;
  dossiers: string[];
  raccourcis: Raccourci[];
} {
  const verdict = validerDossier(chemin);
  const base = verdict.ok ? verdict.chemin : realpathSync(homedir());

  let dossiers: string[] = [];
  try {
    dossiers = readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "fr"))
      .slice(0, 500);
  } catch {
    /* dossier illisible : on renvoie une liste vide plutôt qu'une erreur */
  }

  return {
    chemin: base,
    // On remonte jusqu'à la racine : s'arrêter au dossier personnel empêchait
    // d'atteindre un disque externe monté sous « /Volumes ».
    parent: base === "/" ? null : dirname(base),
    dossiers,
    // Raccourcis vers les endroits où l'on range vraiment ses documents, pour
    // éviter d'avoir à remonter le chemin dossier par dossier.
    raccourcis: raccourcis(),
  };
}
