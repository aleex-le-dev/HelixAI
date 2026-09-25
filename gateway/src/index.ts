import http from "node:http";
import { once } from "node:events";
import { estEnvoiEnFlux, lireEnvoi, LIBELLE_DOCUMENT_MAX } from "./televersement.ts";
import { ENTETES_SECURITE, entetesOrigine, entetesFlux } from "./entetes.ts";
import { nomProduit } from "./marque.ts";
import { avecLangueDe, t, tf } from "./langue.ts";
import * as telechargement from "./telechargement.ts";
import https from "node:https";
import { tlsMaterial } from "./tls.ts";
import { createHash, randomBytes } from "node:crypto";
import * as debit from "./debit.ts";
import * as flux from "./flux.ts";
import * as invitations from "./invitations.ts";
import {
  adressePourLesCollegues,
  adressesPourLesCollegues,
  etatReseau,
  propositions,
  reglerReseau,
} from "./reseau.ts";
import { origineDuRole } from "./roles.ts";
import { PORT, HOST, surLeReseau } from "./config.ts";
import {
  discover,
  loadModel,
  stopLmStudioIfStarted,
  findLms,
  oublierLms,
  ensureLmStudioServer,
} from "./backends.ts";
import { models, invalidate, resolve } from "./router.ts";
import { agentAAppele, handleChatRequest } from "./chat.ts";
import {
  startAutoServers,
  startServer,
  stopServer,
  status as mcpStatus,
  workspace,
  setWorkspace,
  workspaces,
} from "./mcp.ts";
import {
  detectHardware,
  recommend,
  recommendVision,
  adaptesALaMachine,
  CATALOG,
  VISION_CATALOG,
  ensureLocalModel,
  getProvisionState,
  setProvisionState,
  onProvisionChange,
} from "./provision.ts";
import { deployment, autoProvisionEnabled } from "./deployment.ts";
import { db, isCollection, COLLECTIONS, migrerChiffrement, type Collection } from "./db.ts";
import { exporterDonnees } from "./export.ts";
import { chargerReglagesEcran, configEcran, definirModeEcran, modeModifiable } from "./reglagesEcran.ts";
import { readFileSync } from "node:fs";
import * as images from "./images.ts";
import { contenuLogiciel, logicielsTrouves, pageLogiciel } from "./importLocal.ts";
import * as entrainement from "./entrainement.ts";
import { corrigerPages, estDemandeDeSite, preparerDesign } from "./design.ts";
import { arreterMachine, arreterMachineEnPartant, choisirSysteme, demarrerMachine, diagnosticMachine, effacerMachine, preparationMachineEnCours, progressionMachine, systemeMachine } from "./machine.ts";
import { apercuEffacement, effacerCompte, sansComptesDisparus } from "./effacement.ts";
import { authorise, cheminDuJeton, hasValidToken, instanceToken } from "./auth.ts";
import * as employes from "./employes.ts";
import * as fournisseurs from "./fournisseurs.ts";
import * as groupes from "./groupes.ts";
import * as bibliotheque from "./bibliotheque.ts";
import * as connaissances from "./connaissances.ts";
import * as reunions from "./reunions.ts";
import { etat as etatAgenda } from "./agenda.ts";
import { installerOpenClaw, etatInstallation } from "./installationOpenClaw.ts";
import { listerEspace, lireFichierEspace } from "./espace.ts";
import { consommationDe } from "./usage.ts";
import { servirOutils, auteurEmploye } from "./serveurOutils.ts";
import { servirOutilsCode, noterDemande as noterDemandeCode, rafraichirOutilsCode } from "./outilsCode.ts";
import { FAMILLES, outilsDeFamille } from "./outils.ts";
import {
  publicAccounts,
  createAccount,
  verifyAccount,
  modifierProfil,
  definirPremierMotDePasse,
  validerSecondFacteur,
  etatDeuxFacteurs,
  preparerDeuxFacteurs,
  activerDeuxFacteurs,
  desactiverDeuxFacteurs,
  regenererCodesDeSecours,
  preparerInscription,
  activerInscription,
  defiInscription,
  deuxFacteursObligatoire,
  seanceAdmise,
  confirmerIdentite,
  adresseDePartage,
} from "./accounts.ts";
import {
  openSession,
  resolveSession,
  listSessions,
  revokeSession,
  revokeAll,
} from "./usersession.ts";
import { filtrer, fusionner, type Demandeur } from "./authz.ts";
import { installerMoteur } from "./engine.ts";
import {
  diagnostic as atelierDiagnostic,
  preparer as preparerAtelier,
  verifier as verifierAtelier,
  diagnosticDictee,
  preparerDictee,
} from "./atelier.ts";
import { oublierAtelier } from "./bureau.ts";
import { lireAudio, transcrire, ErreurDictee } from "./dictee.ts";
import {
  etat as courrierEtat,
  configurer as configurerCourrier,
  oublier as oublierCourrier,
  reglerEnvoi as reglerEnvoiCourrier,
  reglerConfirmation as reglerConfirmationCourrier,
  fournisseursConnus,
  reglagesConnus,
  charger as chargerCourrier,
  brancherParOauth,
} from "./courrier.ts";
import {
  achever as acheverCourrier,
  demarrer as demarrerCourrier,
  estEtatCourrier,
  valider as validerOauthCourrier,
} from "./courrierOauth.ts";
import {
  etat as agendaEtat,
  configurer as configurerAgenda,
  oublier as oublierAgenda,
  serveursConnus,
  reglagesConnus as reglagesAgendaConnus,
  charger as chargerAgenda,
} from "./agenda.ts";
import * as connecteurs from "./connecteurs.ts";
import * as drive from "./drive.ts";
import * as slack from "./slack.ts";
import { conservationJours, journaliser, lire as lireAudit, verifier as verifierAudit, jours as joursAudit } from "./audit.ts";
import * as computer from "./computer.ts";
import * as approbation from "./approbation.ts";
import * as usage from "./usage.ts";
import {
  status as codeStatus,
  api as codeApi,
  enMarche as codeEnMarche,
  projectDir,
  validerDossier,
  setProjectDir,
  listerDossiers,
  stopServer as stopCodeServer,
  assurerModele as assurerModeleCode,
  toutLePoste,
  varianteDe,
  refModele,
  idMessage as idMessageCode,
} from "./opencode.ts";
import {
  suivreSession as suivreSessionCode,
  sessionSuivie as sessionCodeSuivie,
  ecouterDossier as ecouterDossierCode,
  abonner as abonnerCode,
  dernierNumero as dernierNumeroCode,
  type EvenementCode,
} from "./fluxCode.ts";
import {
  noterSession as noterSessionCode,
  toucherSession as toucherSessionCode,
  sessionCode,
  sessionsDe,
  retirerSession as retirerSessionCode,
  historiqueDe as historiqueCode,
} from "./sessionsCode.ts";
import type { ChatRequest } from "./types.ts";

/* --------------------------------- utilitaires --------------------------------- */








function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    // `res.req` est la requête qui a produit cette réponse : cela évite de
    // faire passer la requête en paramètre dans les quelque soixante appels de
    // `send`, alors qu'elle est déjà là.
    ...entetesOrigine(res.req),
    ...ENTETES_SECURITE,
  });
  res.end(payload);
}

/**
 * Taille maximale d'un corps de requête.
 *
 * Le corps était accumulé sans aucune borne. Mesuré sur le banc : une seule
 * requête de 400 Mo fait passer la passerelle de 108 à 1196 Mo de mémoire
 * résidente — le tampon, puis la chaîne, puis l'arbre JSON. Quelques requêtes
 * simultanées suffisent donc à tuer le processus, et un plantage de la
 * passerelle arrête le logiciel entier pour l'utilisateur.
 *
 * 32 Mo laisse de la marge au plus gros corps légitime : une conversation qui
 * rejoue plusieurs captures d'écran en base64 (quelques centaines de
 * kilo-octets chacune), tout en gardant la mémoire d'une requête bornée.
 */
const CORPS_MAX = 32 * 1024 * 1024;
/**
 * Ancien envoi d'un document (base64 dans un JSON), gardé pour un poste d'une
 * version antérieure : 25 Mo de fichier font 33,4 Mo en base64, plus le texte
 * extrait. Les envois actuels passent en flux (televersement.ts), sans cette
 * limite.
 */
const CORPS_DOCUMENT_MAX = 42 * 1024 * 1024;

/**
 * Envoie un flux en réponse, au rythme où le client le lit (sans remplir la
 * mémoire si le réseau est lent). Une erreur en cours de route coupe la
 * connexion : le client voit un téléchargement échoué, jamais un fichier
 * tronqué présenté comme complet (la longueur annoncée ne sera pas atteinte).
 */
async function envoyerFlux(res: http.ServerResponse, flux: AsyncIterable<Buffer>): Promise<void> {
  try {
    for await (const morceau of flux) {
      if (res.destroyed) return;
      if (!res.write(morceau)) await once(res, "drain");
    }
    res.end();
  } catch (err) {
    console.error("[flux] envoi interrompu :", err instanceof Error ? err.message : err);
    res.destroy();
  }
}

async function readJson(req: http.IncomingMessage, max = CORPS_MAX): Promise<unknown> {
  const chunks: Buffer[] = [];
  let taille = 0;
  for await (const chunk of req) {
    taille += (chunk as Buffer).length;
    /*
     * On s'arrête dès le dépassement, sans lire la suite : continuer à
     * accumuler un corps qu'on a déjà décidé de refuser serait précisément
     * l'épuisement mémoire qu'on cherche à empêcher. Sortir de la boucle par
     * une exception referme le flux entrant.
     */
    if (taille > max) {
      throw new Error(`Corps de requête trop volumineux (limite : ${Math.round(max / (1024 * 1024))} Mo).`);
    }
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/* ---------------------------------- routes ------------------------------------ */

/**
 * Contrôle de présence. Cette route reste accessible sans jeton pour qu'un
 * poste puisse vérifier l'adresse saisie : elle ne révèle donc que le strict
 * nécessaire tant que l'appelant n'est pas authentifié.
 */
async function handleHealth(res: http.ServerResponse, authorised: boolean): Promise<void> {
  const { backends, models: found } = await discover();
  const online = backends.some((b) => b.online);

  if (!authorised) {
    return send(res, 200, {
      ok: online,
      helix: true,
      modelCount: found.length,
      requiresToken: true,
    });
  }

  const profile = deployment();
  send(res, 200, {
    ok: online,
    backends,
    modelCount: found.length,
    deployment: {
      client: profile.client ?? null,
      pinnedModels: profile.models ?? {},
      autoProvision: profile.autoProvision !== false,
      computerUse: configEcran().mode,
    },
  });
}

async function handleModels(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  openaiShape: boolean,
): Promise<void> {
  // Un modèle branché par une clé personnelle ne se montre qu'à son titulaire.
  const qui = await demandeur(req, url);
  const list = (await models(true)).filter((m) => !m.proprietaire || m.proprietaire === qui?.userId);
  if (openaiShape) {
    send(res, 200, {
      object: "list",
      data: list.map((m) => ({
        id: m.uid,
        object: "model",
        owned_by: m.backendLabel,
        helix: {
          name: m.id,
          backend: m.backendId,
          roles: m.roles,
          loaded: m.loaded,
          params: m.params,
          arch: m.arch,
          sizeBytes: m.sizeBytes,
          reasoning: m.reasoning,
          origine: m.origine,
          pays: m.pays,
          fournisseur: m.fournisseur,
          personnel: Boolean(m.proprietaire),
        },
      })),
    });
    return;
  }
  send(res, 200, { models: list });
}

/**
 * /v1/chat/completions — routage par rôle + boucle d'outils MCP.
 * Le canal `reasoning_content` (modèles à raisonnement) est préservé, et
 * l'activité des outils est relayée par des événements `helix`.
 */
async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  let body: ChatRequest;
  try {
    body = (await readJson(req)) as ChatRequest;
  } catch (err) {
    // Un message trop gros (pièces jointes) était annoncé comme « JSON invalide » : faux, et sans issue.
    const tropGros = err instanceof Error && err.message.startsWith("Corps de requête trop volumineux");
    return send(res, tropGros ? 413 : 400, {
      error: {
        message: tropGros
          ? tf("Message trop volumineux pour l'instance (limite : {0} Mo). Retirez une pièce jointe ou raccourcissez le texte.", CORPS_MAX / (1024 * 1024))
          : t("Corps JSON invalide."),
      },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return send(res, 400, { error: { message: t("`messages` est requis.") } });
  }

  /*
   * Deux usages derrière la même route. Converser avec un modèle ne demande que
   * le jeton : c'est le point d'entrée compatible OpenAI, celui qu'utilisent
   * OpenCode et tout client tiers, qui exécutent leurs propres outils chez eux.
   *
   * Mais `tools: true` demande à *l'instance* d'agir — lire et écrire des
   * fichiers, piloter l'écran. Cela engage une personne, donc exige une séance.
   */
  const qui = await demandeur(req, url);
  if (body.tools === true && !qui) {
    return send(res, 401, {
      error: {
        message:
          "Faire agir l'agent sur vos fichiers ou votre écran demande une " +
          "séance ouverte. Reconnectez-vous.",
      },
    });
  }

  /*
   * Un employé OpenClaw converse avec le modèle par cette même route, sans
   * séance : sa consommation est comptée à son nom. L'en-tête seul ne suffit
   * pas (n'importe quel poste pourrait l'écrire) : il faut aussi la clé que
   * seule l'instance OpenClaw lancée par la passerelle connaît.
   */
  const employe = req.headers["x-helix-employe"];
  const cle = req.headers["x-helix-cle"];
  const parEmploye =
    !qui && typeof employe === "string" && employes.cleValide(typeof cle === "string" ? cle : undefined)
      ? auteurEmploye(employe)
      : undefined;

  // Un employé a accès aux modèles branchés par la clé personnelle de son propriétaire.
  const titulaire =
    qui?.userId ?? (parEmploye && typeof employe === "string" ? (await employes.employe(employe))?.ownerId : undefined);

  // Le journal doit pouvoir dire au nom de qui l'agent a touché ces fichiers.
  await handleChatRequest(body, res, req, qui?.userId ?? parEmploye, titulaire);
}

/* --------------------------- routes provisionnement --------------------------- */

async function handleProvisionStatus(res: http.ServerResponse): Promise<void> {
  const hardware = detectHardware();
  const { models: available } = await discover();
  const chatModels = available.filter((m) => m.roles.includes("chat"));
  send(res, 200, {
    hardware,
    recommended: recommend(hardware),
    catalog: CATALOG,
    hasChatModel: chatModels.length > 0,
    /*
     * Helix a besoin d'un moteur pour faire tourner les modèles. Sans lui, il
     * n'y a rien à télécharger ni à charger : l'écran de mise en route doit le
     * dire et guider, au lieu de proposer une installation qui échouera.
     */
    moteurInstalle: (await findLms()) !== null,
    // Installation pilotée par l'intégrateur : l'écran de mise en route ne
    // propose rien, les modèles sont ceux du profil client.
    managed: !autoProvisionEnabled(),
    client: deployment().client ?? null,
    state: getProvisionState(),
    /*
     * Ce qu'on peut encore ajouter, adapté à la machine. « Déjà là » se juge
     * sur le nom sans le préfixe d'éditeur : LM Studio range Qwen3-VL 4B sous
     * « qwen/qwen3-vl-4b », le catalogue l'appelle « qwen3-vl-4b ».
     */
    installables: (() => {
      const nom = (id: string) => id.toLowerCase().split("/").pop() ?? id;
      const presents = new Set(available.map((m) => nom(m.id)));
      return adaptesALaMachine(hardware).filter((e) => !presents.has(nom(e.key)));
    })(),
  });
}

/**
 * Installe le moteur d'exécution des modèles, sans intervention.
 * La progression suit le même flux que le téléchargement des modèles, pour que
 * l'écran de mise en route n'ait qu'une seule barre à afficher.
 */
/**
 * Conditions d'utilisation de LM Studio, que l'entreprise accepte en
 * l'installant. LM Studio est un logiciel fermé d'Element Labs, Inc. : ses
 * conditions (version du 23/08/2026) le réservent à un usage « personnel et / ou
 * interne à l'entreprise » et interdisent l'usage « as an application service
 * provider, or a software-as-a-service ». Helix l'installait sans le nommer ;
 * c'est désormais l'entreprise, qui en est le licencié, qui dit oui.
 */
const CONDITIONS_MOTEUR = {
  editeur: "Element Labs, Inc.",
  adresse: "https://lmstudio.ai/app-terms",
  version: "2026-08-23",
};

async function handleEngineInstall(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const body = (await readJson(req).catch(() => ({}))) as { conditionsAcceptees?: unknown };
  // Même règle que partout : seul un `true` explicite vaut accord.
  if (body.conditionsAcceptees !== true) {
    return send(res, 400, {
      error: {
        message: t("Installation non confirmée : les conditions d'utilisation de LM Studio doivent être acceptées."),
        conditions: CONDITIONS_MOTEUR,
      },
    });
  }
  journaliser("moteur.conditions_acceptees", qui.userId, CONDITIONS_MOTEUR);

  void installerMoteur((p) =>
    setProvisionState({
      phase:
        p.phase === "pret" ? "ready" : p.phase === "erreur" ? "error" : "downloading",
      message: p.message,
      percent: p.percent,
    }),
  )
    .then(async () => {
      /*
       * Au démarrage, `findLms` avait mémorisé « absent » : sans cet oubli, la
       * suite croirait que le moteur n'est pas là, juste après l'avoir posé.
       */
      oublierLms();

      // Puis on l'allume : `lms load` a besoin du service, pas seulement du binaire.
      setProvisionState({ phase: "checking", message: t("Démarrage du moteur...") });
      await ensureLmStudioServer();
      invalidate();

      /*
       * On enchaîne sur le modèle sans rendre la main : du point de vue de
       * l'utilisateur, « installer Helix » est une seule opération, pas deux
       * étapes techniques dont il devrait comprendre l'ordre.
       */
      setProvisionState({ phase: "checking", message: t("Choix du modèle adapté à votre machine...") });
      await ensureLocalModel();
      invalidate();
      dicteeEnFond();
    })
    .catch((err: unknown) =>
      setProvisionState({
        phase: "error",
        message: t("L'installation du moteur a échoué."),
        error: err instanceof Error ? err.message : String(err),
      }),
    );

  send(res, 202, { started: true, state: getProvisionState() });
}

/**
 * La dictée (Whisper) s'installe d'elle-même, juste après le modèle.
 *
 * Demandé par le client : installer Helix, c'est avoir le modèle adapté à la
 * machine ET le micro qui marche, sans aller chercher une installation de
 * plus au premier clic sur le micro. En arrière-plan et en silence : un échec
 * (Python absent, pas de réseau) ne bloque rien, le micro proposera alors
 * l'installation lui-même, avec la raison.
 */
function dicteeEnFond(): void {
  void diagnosticDictee()
    .then((etat) => {
      if (etat.installee || etat.installationEnCours || !etat.installable) return;
      console.log("[helix] Installation de la dictée en arrière-plan.");
      return preparerDictee(() => {}).then((bilan) =>
        console.log(`[helix] Dictée : ${bilan.ok ? "installée" : "non installée"}.`),
      );
    })
    .catch((err: unknown) => console.error("[helix] dictée en arrière-plan", err));
}

function handleProvisionStart(req: http.IncomingMessage, res: http.ServerResponse): void {
  readJson(req)
    .catch(() => ({}))
    .then((body) => {
      const { model, role } = body as { model?: string; role?: "chat" | "gui" };
      // Le catalogue d'écran est distinct : un modèle de conversation ne voit
      // pas les images, il ne peut donc pas remplacer un modèle de vision.
      const catalogue = role === "gui" ? VISION_CATALOG : CATALOG;
      // Non bloquant : la progression se suit sur /helix/provision/stream.
      void ensureLocalModel(model, catalogue)
        .then(() => {
          invalidate();
          if (role !== "gui") dicteeEnFond();
        })
        /*
         * Sans ce filet, un provisionnement qui rejette devient un rejet non
         * capturé — et Node arrête alors le processus (vérifié : sortie en
         * code 1, serveur HTTP compris). Une installation qui échoue doit se
         * dire dans l'état de mise en route, pas emporter toute la passerelle
         * et, avec elle, le logiciel de l'utilisateur.
         */
        .catch((err: unknown) =>
          setProvisionState({
            phase: "error",
            message: t("L'installation du modèle a échoué."),
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      send(res, 202, { started: true, state: getProvisionState() });
    })
    // Même raison : ce que fait le `then` ci-dessus ne doit pas non plus
    // pouvoir remonter jusqu'au processus.
    .catch((err: unknown) => {
      console.error("[gateway] provision/start", err);
      if (!res.headersSent) {
        send(res, 500, { error: { message: t("Le provisionnement n'a pas pu démarrer.") } });
      }
    });
}

/** Flux SSE de la progression d'installation. */
function handleProvisionStream(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, entetesFlux(req));
  const write = (s: unknown) => res.write(`data: ${JSON.stringify(s)}\n\n`);
  write(getProvisionState());
  const off = onProvisionChange(write);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    off();
    clearInterval(keepAlive);
    res.end();
  });
}

/* ---------------------------- routes atelier Cowork --------------------------- */

/**
 * Inventaire de l'atelier bureautique. Route de lecture seule : elle regarde
 * la machine, elle n'y touche pas.
 */
async function handleAtelierDiagnostic(res: http.ServerResponse): Promise<void> {
  send(res, 200, await atelierDiagnostic());
}

/**
 * Préparation de l'atelier, en flux d'événements.
 *
 * `/helix/provision/moteur` répond 202 et publie sa progression sur un flux
 * séparé, parce que plusieurs écrans suivent la même installation. Ici, une
 * seule fenêtre demande et une seule attend : la réponse elle-même porte le
 * flux, ce qui évite une route de plus et une corrélation à tenir.
 */
function handleAtelierPreparer(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, entetesFlux(req));

  /*
   * Si le navigateur se ferme, on cesse d'écrire mais on n'interrompt pas
   * l'installation : couper pip au milieu laisserait un environnement à
   * moitié posé, plus difficile à réparer qu'à refaire.
   */
  let ouvert = true;
  req.on("close", () => {
    ouvert = false;
  });
  const write = (event: unknown) => {
    if (ouvert) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  void preparerAtelier((p) => write({ type: "progres", ...p }))
    .then((bilan) => write({ type: "bilan", bilan }))
    .catch((err: unknown) =>
      write({
        type: "erreur",
        message: err instanceof Error ? err.message : String(err),
      }),
    )
    .finally(() => {
      // L'atelier vient peut-être d'apparaître : les outils bureautiques se
      // fient à un cache, qui doit repartir d'une constatation fraîche.
      oublierAtelier();
      if (ouvert) res.end();
    })
    /*
     * `finally` laisse repasser un rejet. Sans ce dernier filet, une écriture
     * sur une réponse déjà fermée — la fenêtre se referme pendant que
     * l'installation écrit — deviendrait un rejet non capturé, donc l'arrêt du
     * processus Node (vérifié : sortie en code 1).
     */
    .catch((err: unknown) => console.error("[gateway] atelier/preparer", err));
}

/** Épreuves fonctionnelles : produire puis relire un document de chaque format. */
async function handleAtelierVerifier(res: http.ServerResponse): Promise<void> {
  send(res, 200, await verifierAtelier());
}

/* -------------------------------- routes dictée ------------------------------- */

/**
 * État de la dictée : installée ou non, et ce qu'il faudrait télécharger.
 * Lecture seule, comme `GET /helix/atelier` : le composeur la lit à l'ouverture
 * pour savoir si le bouton micro enregistre ou propose l'installation.
 */
async function handleDicteeEtat(res: http.ServerResponse): Promise<void> {
  send(res, 200, await diagnosticDictee());
}

/**
 * Installation de la dictée, en flux d'événements, sur le modèle de l'atelier.
 *
 * Le corps doit porter `{"accord": true}`, et rien d'autre ne vaut accord : un
 * appel égaré, ou un champ mal nommé, ne télécharge pas 500 Mo sur le poste de
 * quelqu'un. C'est le principe du bouton « refuser » corrigé : un contrôle qui
 * ne comprend pas ce qu'on lui demande refuse.
 */
async function handleDicteeInstaller(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as { accord?: unknown };
  if (body.accord !== true) {
    return send(res, 400, {
      error: { message: t("Installation non confirmée : `accord` doit valoir true.") },
    });
  }

  res.writeHead(200, entetesFlux(req));
  /*
   * `res` et non `req` : le corps de la requête a déjà été lu, et sa fin
   * déclenche la fermeture de `req` alors que la fenêtre écoute toujours.
   */
  let ouvert = true;
  res.on("close", () => {
    ouvert = false;
  });
  const write = (event: unknown) => {
    if (ouvert) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const debut = Date.now();
  void preparerDictee((p) => write({ type: "progres", ...p }))
    .then((bilan) => {
      journaliser("dictee.installee", qui.userId, { ok: bilan.ok, dureeMs: bilan.duree });
      write({ type: "bilan", bilan });
    })
    .catch((err: unknown) => {
      journaliser("dictee.installee", qui.userId, { ok: false, dureeMs: Date.now() - debut });
      write({ type: "erreur", message: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      if (ouvert) res.end();
    })
    // Même filet que pour l'atelier : une écriture tardive ne doit pas tuer le processus.
    .catch((err: unknown) => console.error("[gateway] dictee/installer", err));
}

/**
 * Transcription d'un enregistrement. Le corps est le son brut (WebM, Ogg, MP4,
 * WAV ou AIFF), borné en taille. Le texte revient à l'interface et n'est
 * consigné nulle part : le journal ne retient que la taille et la durée.
 */
async function handleDictee(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  let octets = 0;
  try {
    const son = await lireAudio(req);
    octets = son.length;
    const resultat = await transcrire(son, url.searchParams.get("langue") ?? "fr");
    journaliser("dictee.transcrite", qui.userId, {
      ok: true,
      octets,
      dureeAudio: resultat.dureeAudio,
      dureeMs: resultat.dureeMs,
    });
    send(res, 200, resultat);
  } catch (err) {
    const connue = err instanceof ErreurDictee;
    const statut = connue ? err.statut : 500;
    // Une erreur inattendue ne part pas au poste : son message est interne.
    if (!connue) console.error("[gateway] dictee", err);
    if (statut !== 413) journaliser("dictee.transcrite", qui.userId, { ok: false, octets, statut });
    send(res, statut, { error: { message: connue ? err.message : "La dictée a échoué." } });
    // Corps refusé en cours de lecture : on coupe plutôt que de le recevoir jusqu'au bout.
    if (statut === 413) res.once("finish", () => req.destroy());
  }
}

/* ---------------------------- routes courrier IMAP ---------------------------- */

/**
 * État du connecteur courrier, et de quoi remplir le formulaire.
 *
 * La table des fournisseurs voyage avec l'état plutôt que d'être recopiée dans
 * l'interface : les serveurs et les ports changent, et une valeur figée dans le
 * paquet du poste ne se corrige qu'en repackageant l'application. Ce que
 * l'instance sait est ce que le formulaire montre.
 *
 * Route de lecture : elle ne dit rien du mot de passe, qui ne sort jamais du
 * module (voir courrier.ts).
 */
async function handleCourrierEtat(res: http.ServerResponse, url: URL): Promise<void> {
  const adresse = url.searchParams.get("adresse") ?? "";
  send(res, 200, {
    ...(await courrierEtat()),
    fournisseurs: fournisseursConnus(),
    // Réglages devinés depuis le domaine, quand l'interface en demande.
    suggestion: adresse ? reglagesConnus(adresse) : null,
  });
}

/**
 * Enregistre un compte de courrier.
 *
 * Le module refuse tout seul d'écrire quoi que ce soit tant que la connexion
 * n'a pas été essayée pour de bon ; on se contente ici d'identifier qui demande
 * et de le consigner. Le corps contient un mot de passe : il n'est ni journalisé
 * ni renvoyé, et le journal ne retient que l'adresse de la boîte.
 */
/**
 * Lance l'autorisation « Se connecter avec Google / Microsoft ».
 *
 * L'instance ne va nulle part elle-même : elle rend l'adresse, et c'est
 * l'écran qui l'ouvre dans le navigateur de la personne. C'est chez son
 * fournisseur, et là seulement, qu'elle s'authentifie — Helix ne voit jamais
 * son mot de passe, ce qui est tout l'intérêt de la manoeuvre.
 */
async function handleCourrierOauth(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as {
    adresse?: unknown;
    reglage?: unknown;
  };
  const adresse = typeof body.adresse === "string" ? body.adresse.trim() : "";
  if (!adresse.includes("@")) {
    return send(res, 400, {
      error: { message: t("Indiquez l'adresse de la boîte, par exemple vous@entreprise.fr.") },
    });
  }
  const verdict = validerOauthCourrier(body.reglage);
  if (!verdict.ok) return send(res, 400, { error: { message: verdict.message } });

  /*
   * L'adresse de retour est celle par laquelle **ce navigateur** atteint
   * l'instance : il revient là d'où il est parti. Elle doit être inscrite à
   * l'identique dans l'application déclarée par l'administrateur, sinon le
   * fournisseur refuse — et l'écran le dit, plutôt que de laisser chercher.
   */
  const base = adresseVue(req);
  if (!base) {
    return send(res, 400, {
      error: { message: t("L'adresse de cette instance n'a pas pu être déterminée.") },
    });
  }
  const redirection = `${base}/helix/oauth/retour`;
  const { url: destination } = demarrerCourrier(verdict.reglage, adresse, redirection);
  journaliser("donnees.ecrites", qui.userId, {
    collection: "courrier.oauth",
    fournisseur: verdict.reglage.fournisseur,
  });
  send(res, 200, { url: destination, redirection });
}

async function handleCourrierConfigurer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = await readJson(req).catch(() => ({}));
  const resultat = await configurerCourrier(body);
  if (resultat.ok) {
    journaliser("donnees.ecrites", qui.userId, {
      collection: "courrier.compte",
      adresse: (body as { adresse?: string }).adresse,
    });
  }
  send(res, resultat.ok ? 200 : 400, resultat);
}

/**
 * Active ou coupe l'envoi de mails par les agents. Ouvrir l'envoi engage
 * l'entreprise : séance exigée, et le journal nomme qui l'a fait.
 */
async function handleCourrierEnvoi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = await readJson(req).catch(() => ({}));
  const resultat = await reglerEnvoiCourrier(body);
  if (resultat.ok) {
    journaliser("donnees.ecrites", qui.userId, { collection: "courrier.envoi", active: resultat.active });
  }
  send(res, resultat.ok ? 200 : 400, { ...resultat, etat: await courrierEtat() });
}

/** Envoyer sans confirmation, ou revenir à une carte par mail. Séance exigée, journalisé. */
async function handleCourrierConfirmation(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const body = await readJson(req).catch(() => ({}));
  const resultat = await reglerConfirmationCourrier(body);
  if (resultat.ok) {
    journaliser("donnees.ecrites", qui.userId, { collection: "courrier.confirmation", sansAccord: resultat.sansAccord });
  }
  send(res, resultat.ok ? 200 : 400, { ...resultat, etat: await courrierEtat() });
}

/** Retire le compte de l'instance. Les outils disparaissent de la conversation suivante. */
async function handleCourrierOublier(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const resultat = await oublierCourrier();
  journaliser("donnees.ecrites", qui.userId, { collection: "courrier.compte", adresse: null });
  send(res, 200, { ...resultat, etat: await courrierEtat() });
}

/* ---------------------------- routes agenda CalDAV ---------------------------- */

/**
 * État du connecteur agenda, et de quoi remplir le formulaire.
 *
 * Comme pour le courrier, la table des serveurs voyage avec l'état plutôt que
 * d'être recopiée dans l'interface : les adresses CalDAV changent, et une valeur
 * figée dans le paquet du poste ne se corrigerait qu'en repackageant
 * l'application. Ce que l'instance sait est ce que le formulaire montre.
 *
 * Route de lecture : elle ne dit rien du mot de passe, qui ne sort jamais du
 * module (voir agenda.ts).
 */
async function handleAgendaEtat(res: http.ServerResponse, url: URL): Promise<void> {
  const adresse = url.searchParams.get("adresse") ?? "";
  send(res, 200, {
    ...(await agendaEtat()),
    serveurs: serveursConnus(),
    // Réglages devinés depuis le domaine, quand l'interface en demande.
    suggestion: adresse ? reglagesAgendaConnus(adresse) : null,
  });
}

/**
 * Enregistre un agenda.
 *
 * Le module refuse tout seul d'écrire quoi que ce soit tant que la connexion
 * n'a pas été essayée pour de bon ; on se contente ici d'identifier qui demande
 * et de le consigner. Le corps contient un mot de passe : il n'est ni journalisé
 * ni renvoyé, et le journal ne retient rien d'autre que le fait de l'écriture.
 * Aucun titre de réunion ne transite par cette route.
 */
async function handleAgendaConfigurer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = await readJson(req).catch(() => ({}));
  const resultat = await configurerAgenda(body);
  if (resultat.ok) {
    journaliser("donnees.ecrites", qui.userId, { collection: "agenda.compte" });
  }
  send(res, resultat.ok ? 200 : 400, resultat);
}

/** Retire l'agenda de l'instance. Les outils disparaissent de la conversation suivante. */
async function handleAgendaOublier(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const resultat = await oublierAgenda();
  journaliser("donnees.ecrites", qui.userId, { collection: "agenda.compte" });
  send(res, 200, { ...resultat, etat: await agendaEtat() });
}

/* ------------------------ routes Google Drive et Slack ------------------------ */

/*
 * Les modules tiennent eux-mêmes le journal (drive.ts, slack.ts) : l'accord
 * Google arrive par la boucle locale, hors de toute requête, et c'est le
 * module qui sait qui l'avait demandé. Ici, on n'identifie que le demandeur.
 * Les routes d'état, au jeton seul, disent si un compte est branché et lequel,
 * jamais un jeton ni un contenu.
 */
async function handleDriveEtat(res: http.ServerResponse): Promise<void> {
  send(res, 200, await drive.etat());
}

/** Lance l'autorisation Google. L'adresse rendue porte le `state` : séance exigée. */
async function handleDriveConnecter(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const resultat = await drive.demarrer(qui.userId);
  send(res, resultat.ok ? 200 : 400, resultat);
}

/** Adresse de retour recopiée depuis le navigateur, quand l'instance est sur une autre machine. */
async function handleDriveCode(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const body = (await readJson(req).catch(() => ({}))) as { adresse?: unknown };
  const resultat = await drive.collerAdresse(body.adresse, qui.userId);
  send(res, resultat.ok ? 200 : 400, { ...resultat, etat: await drive.etat() });
}

async function handleDriveOublier(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const resultat = await drive.oublier(qui.userId);
  send(res, 200, { ...resultat, etat: await drive.etat() });
}

async function handleSlackEtat(res: http.ServerResponse): Promise<void> {
  send(res, 200, await slack.etat());
}

/** Le corps porte le jeton : il n'est ni journalisé ni renvoyé. */
async function handleSlackConfigurer(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const body = await readJson(req).catch(() => ({}));
  const resultat = await slack.configurer(body, qui.userId);
  send(res, resultat.ok ? 200 : 400, resultat);
}

async function handleSlackOublier(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const resultat = await slack.oublier(qui.userId);
  send(res, 200, { ...resultat, etat: await slack.etat() });
}

/* ------------------------- routes données partagées --------------------------- */

/**
 * Collections de l'instance. C'est par ici que plusieurs postes partagent
 * comptes, projets, conversations, tâches et agents.
 */
/**
 * Identifie la personne derrière la requête, à partir de son jeton de séance.
 *
 * Le jeton d'instance dit seulement que la machine a le droit de parler ; sans
 * séance, on ne sait pas qui parle et on ne peut donc rien cloisonner.
 */
/**
 * Exécute `suite` avec l'identité de la séance, ou répond 401.
 *
 * `exigeSeance` a déjà refusé les requêtes sans séance sur ces routes ; ce
 * passage sert à obtenir *qui*, pour ne montrer à chacun que ce qui le
 * concerne. Les deux vont ensemble : sans identité, on ne cloisonne rien.
 */
async function avecSeance(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  suite: (qui: Demandeur) => void | Promise<void>,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  await suite(qui);
}

/**
 * Identité déjà résolue pour cette requête.
 *
 * `demandeur()` est appelée deux fois sur une même requête : une fois par la
 * barrière `exigeSeance`, une fois par la route elle-même. Avec un jeton de
 * séance, relire deux fois ne coûtait rien. Avec un **billet de flux**, qui ne
 * sert qu'une fois, la seconde lecture échouait : le flux répondait 401 alors
 * que le billet était bon. On retient donc la réponse le temps de la requête.
 */
const identites = new WeakMap<http.IncomingMessage, Demandeur | null>();

async function demandeur(req: http.IncomingMessage, url: URL): Promise<Demandeur | null> {
  if (identites.has(req)) return identites.get(req) ?? null;
  const resolu = await resoudreDemandeur(req, url);
  identites.set(req, resolu);
  return resolu;
}

async function resoudreDemandeur(req: http.IncomingMessage, url: URL): Promise<Demandeur | null> {
  /*
   * Billet de flux : c'est ici qu'il se consomme, une seule fois. Il vaut pour
   * l'ouverture d'un flux d'évènements, où `EventSource` ne sait pas poser
   * d'en-tête, et remplace le jeton de séance dans l'adresse (flux.ts).
   */
  const billet = url.searchParams.get("flux");
  if (billet) {
    const compteDuBillet = flux.consommer(billet);
    return compteDuBillet ? await profilDe(compteDuBillet) : null;
  }

  const entete = req.headers["x-helix-session"];
  const token =
    (typeof entete === "string" ? entete : entete?.[0]) ?? url.searchParams.get("session") ?? undefined;

  const seance = await resolveSession(token);
  if (!seance) return null;

  return profilDe(seance.accountId);
}

/** Identité cloisonnable d'un compte, ou null s'il n'a plus le droit d'entrer. */
async function profilDe(accountId: string): Promise<Demandeur | null> {
  const compte = (await publicAccounts()).find((a) => a.id === accountId);
  if (!compte) return null;
  // Séance ouverte avant que l'instance n'impose le second facteur : elle ne vaut plus.
  if (!seanceAdmise(compte)) return null;
  /*
   * L'adresse transmise au cloisonnement n'est pas forcément celle du compte :
   * une adresse que la personne a déclarée elle-même ne rattache aucune
   * invitation en attente (voir `adresseDePartage`, gateway/src/accounts.ts).
   */
  return { userId: compte.id, email: adresseDePartage(compte), groupes: await groupes.groupesDe(compte.id) };
}

/**
 * Routes qui exigent une séance : celles qui **font agir** l'instance, et
 * celles qui **donnent à voir** ce qu'une personne fait faire à l'agent.
 *
 * Le jeton d'instance dit qu'une machine a le droit de parler ; il ne dit pas
 * qui. Or exécuter des outils sur les fichiers, piloter l'écran, lancer l'agent
 * de code, installer un logiciel ou charger un modèle engage quelqu'un. Sans
 * séance, ces actions n'avaient ni auteur identifiable ni trace exploitable :
 * le jeton, présent sur chaque poste du parc, valait exécution complète.
 *
 * Deux flux d'évènements y figurent aussi, bien qu'ils ne fassent qu'observer :
 * ce qu'ils laissent voir engage une personne autant qu'une exécution. Le
 * détail est en regard de chacun.
 */
const EXECUTION: { methode: string; chemin: string }[] = [
  { methode: "POST", chemin: "/helix/models/load" },
  { methode: "POST", chemin: "/helix/provision/moteur" },
  { methode: "POST", chemin: "/helix/provision/start" },
  { methode: "POST", chemin: "/helix/mcp/toggle" },
  { methode: "POST", chemin: "/helix/mcp/workspace" },
  { methode: "POST", chemin: "/helix/code/session" },
  { methode: "POST", chemin: "/helix/code/prompt" },
  { methode: "POST", chemin: "/helix/code/interrupt" },
  /*
   * Le flux des demandes d'approbation d'écran porte l'action **entière**,
   * texte à saisir compris. Mesuré au banc, au jeton seul et sans séance :
   * `{"type":"approbation_demandee","action":{"action":"saisir",
   * "texte":"MonMotDePasseBancaire-4242"}}`. Le journal d'audit, lui, ne
   * consigne que `{"action":"saisir"}` — il tient sa promesse de ne jamais
   * enregistrer ce qui est tapé, et c'était cette route qui la contredisait.
   * N'importe quel poste du parc pouvait écouter ce qu'un collègue fait taper
   * à l'agent. Il faut donc savoir *qui* écoute, pas seulement que la machine
   * a le droit de parler.
   */
  { methode: "GET", chemin: "/helix/computer/events" },
  /*
   * Et l'état lui-même, pour la même raison : il rend `enAttente`, c'est-à-dire
   * les mêmes actions entières que le flux. Seul le flux avait été fermé ; la
   * route d'état donnait la même chose à qui la demandait au jeton seul.
   */
  { methode: "GET", chemin: "/helix/computer" },
  /*
   * Approbation des outils : l'état et le flux portent le **détail** des
   * demandes, et ce détail est le mail tel qu'il partira — destinataires,
   * objet, corps entier — ou le chemin du fichier visé. Au jeton seul,
   * n'importe quel poste du parc lisait en direct la correspondance qu'un
   * agent préparait pour un collègue. Les deux routes exigent une séance, et
   * ne montrent à chacun que ses propres demandes (`Demande.pour`).
   */
  { methode: "GET", chemin: "/helix/approbation" },
  { methode: "GET", chemin: "/helix/approbation/evenements" },
  /*
   * Le flux de la session de code laisse voir le travail en cours d'un
   * collègue — prompts, sorties d'outils, contenu de fichiers. Et il ne se
   * contente pas de lire : jusqu'ici il **démarrait** le serveur OpenCode,
   * processus persistant enraciné sur le dossier de projet (mesuré : PID vivant
   * après un simple GET au jeton seul). Le démarrage est redevenu le rôle de
   * `POST /helix/code/session`, qui exige déjà une séance ; voir
   * `handleCodeEvents`.
   */
  { methode: "GET", chemin: "/helix/code/events" },
  // Préparer l'atelier installe des logiciels ; le vérifier écrit des fichiers
  // d'essai. Le jeton d'instance seul ne suffit donc pas.
  { methode: "POST", chemin: "/helix/atelier/preparer" },
  { methode: "POST", chemin: "/helix/atelier/verifier" },
  /*
   * Installer la dictée télécharge un logiciel et un modèle de 464 Mo ;
   * transcrire fait tourner un interpréteur sur la voix de quelqu'un. Les deux
   * engagent une personne, que le journal doit pouvoir nommer.
   */
  { methode: "POST", chemin: "/helix/dictee/installer" },
  /*
   * Créer une image fait tourner un modèle de plusieurs Go sur la machine ;
   * l'installer en télécharge autant. Une personne, nommée au journal.
   */
  { methode: "POST", chemin: "/helix/images/installer" },
  { methode: "POST", chemin: "/helix/images/desinstaller" },
  { methode: "POST", chemin: "/helix/images/choisir" },
  { methode: "POST", chemin: "/helix/images/creer" },
  { methode: "POST", chemin: "/helix/dictee" },
  /*
   * Approuver une action, ou desserrer le niveau d'approbation, engage une
   * personne autant qu'exécuter l'outil lui-même. Sans séance, le jeton
   * d'instance aurait suffi à s'auto-approuver, et le journal n'aurait eu
   * personne à nommer.
   */
  { methode: "POST", chemin: "/helix/approbation/niveau" },
  { methode: "POST", chemin: "/helix/approbation/repondre" },
  // Donner à l'agent la souris et le clavier de la machine engage quelqu'un.
  { methode: "POST", chemin: "/helix/computer/mode" },
  { methode: "POST", chemin: "/helix/machine/demarrer" },
  { methode: "POST", chemin: "/helix/machine/arreter" },
  { methode: "POST", chemin: "/helix/machine/effacer" },
  // Voir l'écran de la machine montre ce que l'agent y fait : réservé à une séance, comme le reste.
  { methode: "GET", chemin: "/helix/machine/ecran" },
  /*
   * Brancher ou débrancher une boîte aux lettres modifie l'instance, et ouvre
   * aux agents la correspondance de l'entreprise. Le jeton d'instance, présent
   * sur chaque poste du parc, ne suffit donc pas : il faut une séance, pour que
   * le journal puisse nommer qui a connecté quelle boîte.
   */
  { methode: "POST", chemin: "/helix/courrier/configurer" },
  // Même famille : brancher une boîte par autorisation engage l'instance.
  { methode: "POST", chemin: "/helix/courrier/oauth" },
  { methode: "POST", chemin: "/helix/courrier/envoi" },
  { methode: "POST", chemin: "/helix/courrier/confirmation" },
  { methode: "POST", chemin: "/helix/courrier/oublier" },
  /*
   * Même raisonnement pour l'agenda : le brancher ouvre aux agents l'emploi du
   * temps de l'entreprise, c'est-à-dire qui rencontre qui et quand. Il faut une
   * séance, pour que le journal puisse nommer qui a connecté quel agenda.
   */
  { methode: "POST", chemin: "/helix/agenda/configurer" },
  { methode: "POST", chemin: "/helix/agenda/oublier" },
  /*
   * Google Drive et Slack : les brancher ouvre aux agents les documents ou les
   * conversations de l'entreprise, les débrancher coupe cet accès à tous.
   * `drive/connecter` rend l'adresse d'autorisation, qui porte le `state` de la
   * demande ; `drive/code` achève une autorisation recopiée depuis le
   * navigateur. Il faut une séance, pour que le journal nomme qui l'a fait.
   */
  { methode: "POST", chemin: "/helix/drive/connecter" },
  { methode: "POST", chemin: "/helix/drive/code" },
  { methode: "POST", chemin: "/helix/drive/oublier" },
  { methode: "POST", chemin: "/helix/slack/configurer" },
  { methode: "POST", chemin: "/helix/slack/oublier" },
  /*
   * Ajouter un connecteur lance un programme de plus sur la machine, et lui
   * confie un jeton d'accès à un service de l'entreprise ; le retirer coupe cet
   * accès à tous les agents d'un coup. Ces deux routes modifient la machine :
   * le jeton d'instance, présent sur chaque poste du parc, ne peut pas suffire.
   */
  /*
   * Un billet de flux ouvre un flux d'évènements au nom de son titulaire : il
   * ne s'obtient qu'avec une séance, sinon il n'y aurait personne à y inscrire.
   */
  { methode: "POST", chemin: "/helix/flux/ticket" },
  /*
   * Inviter engage l'instance : cela ouvre à quelqu'un le droit de rattacher un
   * poste et d'y ouvrir un compte, et cela fait partir un mail en son nom. Le
   * journal doit pouvoir dire qui a invité qui. (La route que l'invité appelle,
   * elle, est publique par nécessité : voir `handleRejoindre`.)
   */
  /*
   * Ouvrir l'instance au réseau change la surface de la machine : cela engage
   * la personne qui l'administre, et le journal doit pouvoir la nommer.
   */
  { methode: "GET", chemin: "/helix/reseau" },
  { methode: "POST", chemin: "/helix/reseau" },
  { methode: "POST", chemin: "/helix/invitations/inviter" },
  { methode: "GET", chemin: "/helix/invitations" },
  { methode: "POST", chemin: "/helix/invitations" },
  { methode: "POST", chemin: "/helix/connecteurs/ajouter" },
  { methode: "POST", chemin: "/helix/connecteurs/connecter" },
  { methode: "POST", chemin: "/helix/connecteurs/retirer" },
  /*
   * La consommation d'une personne dit quand elle travaille et combien : elle
   * ne se lit qu'avec une séance, et la route ne rend que celle du demandeur.
   * Le tarif d'un modèle distant change tous les coûts affichés, pour tout le
   * monde : le modifier engage quelqu'un, que le journal doit pouvoir nommer.
   */
  { methode: "GET", chemin: "/helix/usage" },
  { methode: "POST", chemin: "/helix/usage/tarif" },
  /*
   * Modifier son nom ou son adresse change une identité : l'adresse est à la
   * fois un identifiant de connexion et une clé de partage. Le jeton
   * d'instance ne dit pas qui parle ; la séance, si, et c'est son compte, et
   * lui seul, que la route modifie (`handleAuthProfil`).
   */
  { methode: "POST", chemin: "/helix/auth/profil" },
  // Installer OpenClaw télécharge et installe un logiciel sur la machine de l'instance.
  { methode: "POST", chemin: "/helix/openclaw/installer" },
];

/*
 * `/helix/data` (les révisions) reste au jeton seul, volontairement : c'est ce
 * que la synchronisation interroge **avant la connexion** pour rapatrier la
 * liste des comptes et peupler l'écran de connexion. L'y soumettre à une séance
 * rendait tout poste neuf incapable d'afficher ses comptes.
 *
 * Ce qu'elle expose se limite à des horodatages d'écriture par collection : de
 * l'activité, jamais du contenu. Le contenu, lui, exige une séance
 * (`/helix/data/<collection>`), à la seule exception des comptes expurgés.
 */

/*
 * Employés OpenClaw : toutes leurs routes engagent quelqu'un (déployer, faire
 * travailler, lire ses propres échanges), sauf le serveur d'outils, que
 * l'instance OpenClaw appelle sans séance et qui vérifie sa propre clé
 * (serveurOutils.ts).
 */
const routeEmploye = (chemin: string) =>
  (chemin === "/helix/employes" || chemin.startsWith("/helix/employes/")) && !/\/outils$/.test(chemin);

/*
 * Clés de modèles cloud : les lister, les essayer, les brancher engagent le
 * moyen de paiement de quelqu'un, et une clé personnelle ne se montre qu'à son
 * titulaire. Tout le préfixe exige une séance.
 */
const routeFournisseur = (chemin: string) =>
  chemin === "/helix/fournisseurs" || chemin.startsWith("/helix/fournisseurs/");

/*
 * Dossier de travail de l'équipe (« Depuis Helix ») : parcourir et relire ce
 * que les agents voient déjà. Une séance, pour savoir qui l'a fait.
 */
const routeEspace = (chemin: string) => chemin === "/helix/espace" || chemin === "/helix/espace/fichier";

/*
 * Groupes de l'équipe : qui en est membre décide de ce que chacun voit ; les
 * créer, les changer, les quitter engagent quelqu'un.
 */
const routeGroupe = (chemin: string) => chemin === "/helix/groupes" || chemin.startsWith("/helix/groupes/");

// Bibliothèque : chaque lecture est filtrée pour qui la demande, chaque écriture a un auteur.
const routeBibliotheque = (chemin: string) => chemin === "/helix/bibliotheque" || chemin.startsWith("/helix/bibliotheque/");

// Bases de connaissances : comme la Bibliothèque dont elles lisent les documents.
const routeConnaissances = (chemin: string) => chemin === "/helix/connaissances" || chemin.startsWith("/helix/connaissances/");

// Réunions : enregistrer, transcrire, envoyer le bot engagent quelqu'un ; lire est filtré pour lui.
const routeReunion = (chemin: string) => chemin === "/helix/reunions" || chemin.startsWith("/helix/reunions/");

/*
 * Entraîner un modèle : installer le moteur télécharge plusieurs Go, entraîner
 * occupe la machine, et les exemples sont ceux de quelqu'un. Tout le préfixe
 * exige une séance ; chaque projet n'est rendu qu'à son auteur.
 */
const routeEntrainement = (chemin: string) => chemin === "/helix/entrainement" || chemin.startsWith("/helix/entrainement/");

const exigeSeance = (methode: string, chemin: string) =>
  EXECUTION.some((r) => r.methode === methode && r.chemin === chemin) ||
  routeEntrainement(chemin) ||
  routeEmploye(chemin) ||
  routeFournisseur(chemin) ||
  routeEspace(chemin) ||
  routeGroupe(chemin) ||
  routeBibliotheque(chemin) ||
  routeConnaissances(chemin) ||
  routeReunion(chemin);

/*
 * Une fonction et non une constante : une constante est calculée une fois, au
 * chargement de la passerelle, hors de toute requête — donc en français pour
 * tout le monde. Appelée au moment de répondre, elle parle la langue de celui
 * qui lit (langue.ts).
 */
const sansSeance = () => ({
  error: {
    message: t("Séance expirée ou absente. Reconnectez-vous pour accéder à vos données."),
  },
});

async function handleDataRead(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  name: string,
): Promise<void> {
  if (!isCollection(name)) {
    return send(res, 404, { error: { message: tf("Collection inconnue : {0}", name) } });
  }
  const revision = await revisionVue(name);

  /*
   * Les comptes sortent expurgés : une empreinte de mot de passe distribuée à
   * tous les postes pourrait être attaquée hors ligne par n'importe quel
   * collaborateur. Cette liste reste lisible sans séance : c'est l'écran de
   * connexion qui la demande, avant qu'une séance existe.
   *
   * `hasPassword` en disparaît aussi. Il disait quels comptes n'ont pas encore
   * de mot de passe — c'est-à-dire ceux dont `/helix/auth/premier-mot-de-passe`
   * ouvre une séance à qui le pose. Publier la liste des comptes à prendre
   * revenait à la servir. L'écran de connexion l'apprend autrement : il essaie,
   * et la réponse lui dit « mot de passe à définir » pour le compte visé,
   * celui-là seulement.
   */
  if (name === "accounts") {
    const comptes = (await publicAccounts()).map(({ hasPassword: _p, ...reste }) => reste);
    return send(res, 200, { collection: name, value: comptes, revision });
  }

  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const valeur = filtrer(name, await db().read(name), qui);
  send(res, 200, { collection: name, value: valeur, revision });
}

async function handleDataWrite(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  name: string,
): Promise<void> {
  if (!isCollection(name)) {
    return send(res, 404, { error: { message: tf("Collection inconnue : {0}", name) } });
  }
  // Les comptes ne s'écrivent que par les routes d'authentification : un poste
  // ne doit pas pouvoir remplacer la liste, ni effacer les empreintes.
  if (name === "accounts") {
    return send(res, 403, {
      error: {
        message:
          t("Les comptes se créent via /helix/auth/create : leur écriture directe est refusée."),
      },
    });
  }

  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  let body: { value?: unknown };
  try {
    body = (await readJson(req)) as { value?: unknown };
  } catch {
    return send(res, 400, { error: { message: t("Corps JSON invalide.") } });
  }

  /*
   * Le poste envoie la collection entière. On n'en retient que ce qu'il a le
   * droit de toucher : sans cette fusion, pousser une liste vide effacerait le
   * travail de toute l'entreprise.
   */
  const fusion = fusionner(name, await db().read(name), body.value ?? null, qui);
  // Un collègue peut renvoyer une copie où figure encore un compte supprimé.
  await db().write(name, await sansComptesDisparus(name, fusion.valeur));
  // Deux écritures dans la même milliseconde ont la même révision : le relevé des images ne s'y fie pas seul.
  if (name === "sessions") images.oublierChatsDesImages();

  journaliser("donnees.ecrites", qui.userId, {
    collection: name,
    refuses: fusion.refuses,
  });

  send(res, 200, {
    collection: name,
    revision: await db().revision(name),
    refuses: fusion.refuses,
  });
}

/* --------------------------- routes authentification -------------------------- */

/**
 * Création d'un compte.
 *
 * Le point sensible est l'adresse email : elle sert de clé de partage
 * (« invitez votre collègue par son mail »), et rien ne la vérifie. Ouverte au
 * seul jeton d'instance, cette route permettait à n'importe quel poste du parc
 * de créer un compte à l'adresse d'un invité en attente et d'hériter de ses
 * projets et conversations.
 *
 * D'où la règle : le **premier** compte s'ouvre librement — il faut bien
 * amorcer l'instance — puis toute création exige une séance. Sur une instance
 * d'entreprise, c'est un collègue déjà connu qui inscrit le suivant, comme dans
 * un ERP. Personne ne s'auto-déclare avec l'adresse d'un autre.
 */
async function handleAuthCreate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as {
    fullName?: string;
    email?: string;
    password?: string;
    poste?: string;
    /** Code reçu par mail : il tient lieu de séance (invitations.ts). */
    invitation?: unknown;
  };

  const dejaLa = await publicAccounts();
  const amorcage = dejaLa.length === 0;

  /*
   * Trois façons d'ouvrir un compte, et pas une de plus.
   *
   *  1. **l'amorçage** : l'instance n'a aucun compte, il faut bien commencer ;
   *  2. **un collègue connecté** inscrit quelqu'un — il choisit alors le mot
   *     de passe, ce qui n'est pas idéal, mais c'était la seule voie ;
   *  3. **un code d'invitation**, depuis la 0.23.0 : la personne invitée ouvre
   *     son compte **elle-même** et choisit son propre mot de passe, que
   *     personne d'autre ne connaîtra. C'est la bonne voie.
   *
   * Dans le cas 3, l'adresse du compte est **celle de l'invitation**, jamais
   * celle que le corps de la requête propose : sans quoi un code destiné à une
   * personne servirait à en inscrire une autre.
   */
  let emailImpose: string | null = null;
  if (!amorcage) {
    if (body.invitation !== undefined) {
      const verdict = await invitations.consommer(body.invitation);
      if (!verdict.ok) {
        return send(res, verdict.statut, { error: { message: verdict.message } });
      }
      emailImpose = verdict.valeur.email;
    } else {
      const qui = await demandeur(req, url);
      if (!qui) {
        return send(res, 401, {
          error: {
            message:
              "Cette instance a déjà des comptes. Faites-vous inviter par un collègue : " +
              "vous recevrez un code, et vous choisirez vous-même votre mot de passe.",
          },
        });
      }
    }
  }

  const result = await createAccount({
    fullName: body.fullName ?? "",
    email: emailImpose ?? body.email ?? "",
    password: body.password,
  });
  if (!result.ok) return send(res, 400, { error: { message: result.reason } });

  journaliser("compte.cree", result.account.id, {
    email: result.account.email,
    amorcage,
    ...(emailImpose ? { surInvitation: true } : {}),
  });

  /*
   * Amorçage : on ouvre la séance dans la foulée.
   *
   * Sans cela, la personne qui vient de créer le premier compte est connectée
   * dans l'interface et parfaitement inconnue de l'instance : chaque route qui
   * exige une séance lui répondait « Session expirée, reconnectez-vous », y
   * compris le choix du dossier de travail et l'usage des outils. Une
   * application neuve s'ouvrait donc sur un message d'erreur.
   *
   * Hors amorçage, surtout pas : c'est un collègue déjà connecté qui inscrit
   * quelqu'un d'autre. Lui rendre une séance au nom du nouveau compte le
   * ferait basculer dans une identité qui n'est pas la sienne.
   */
  /*
   * Instance qui impose le second facteur : même le premier compte n'a pas de
   * séance avant de l'avoir activé. Le défi d'inscription prend sa place, et
   * l'écran enchaîne sur le QR code.
   */
  if ((amorcage || emailImpose) && deuxFacteursObligatoire()) {
    return send(res, 200, { account: result.account, defi: defiInscription(result.account.id) });
  }

  /*
   * Séance ouverte dans la foulée pour l'amorçage **et** pour une création sur
   * invitation : dans les deux cas, c'est la personne elle-même qui vient
   * d'ouvrir son compte, et la laisser devant un écran de connexion juste
   * après serait absurde. Quand c'est un collègue qui inscrit quelqu'un
   * d'autre, surtout pas : cela le ferait basculer dans une identité qui n'est
   * pas la sienne.
   */
  const seance =
    amorcage || emailImpose
      ? await openSession(result.account.id, body.poste ?? "Poste", resterConnecte(body as Record<string, unknown>))
      : undefined;

  send(res, 200, { account: result.account, session: seance });
}

/**
 * « Rester connecté sur ce poste », coché à la connexion.
 *
 * Le choix voyage jusqu'au bout du parcours (mot de passe, puis code si la
 * double authentification est active) : c'est la même personne qui le termine,
 * et la séance n'est ouverte qu'à la dernière étape. Ce n'est pas un droit de
 * plus, seulement une durée — et la séance longue se voit et se révoque dans
 * la liste des postes.
 */
const resterConnecte = (body: Record<string, unknown>): boolean => body.rester === true;

async function handleAuthVerify(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as {
    accountId?: string;
    password?: string;
    poste?: string;
  };
  if (!body.accountId) {
    return send(res, 400, { error: { message: t("`accountId` est requis.") } });
  }
  const result = await verifyAccount(body.accountId, body.password);
  if (!result.ok) {
    // 409 plutôt que 401 : ce n'est pas un mauvais mot de passe, c'est un
    // compte à qui il en manque un. L'interface bascule sur la saisie du premier.
    if (result.aDefinir) {
      return send(res, 409, { error: { message: result.reason, code: "mot-de-passe-a-definir" } });
    }
    // Instance qui impose le second facteur, compte qui n'en a pas encore.
    if (result.inscription) {
      return send(res, 401, {
        error: { message: result.reason, code: "deux-facteurs-a-activer" },
        defi: result.inscription,
      });
    }
    // Mot de passe juste, code attendu : le défi remplace la séance.
    if (result.defi) {
      return send(res, 401, {
        error: { message: result.reason, code: "deux-facteurs-requis" },
        defi: result.defi,
      });
    }
    return send(res, 401, { error: { message: result.reason } });
  }

  /*
   * La connexion ouvre une séance : c'est elle qui portera l'identité sur
   * chaque requête suivante, et c'est elle qu'on révoque si le poste est perdu.
   */
  const seance = await openSession(
    result.account.id,
    body.poste ?? "Poste",
    resterConnecte(body as Record<string, unknown>),
  );
  send(res, 200, { account: result.account, session: seance });
}

/**
 * Premier mot de passe d'un compte créé sans, avant que la règle ne change.
 *
 * Accessible au jeton seul, comme la connexion : la personne n'a pas encore de
 * séance, puisque c'est précisément ce mot de passe qui lui en ouvrira une.
 * Voir `definirPremierMotDePasse` pour la pesée de l'exposition.
 */
async function handlePremierMotDePasse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as {
    accountId?: unknown;
    password?: unknown;
    poste?: unknown;
  };
  if (typeof body.accountId !== "string" || !body.accountId) {
    return send(res, 400, { error: { message: t("`accountId` est requis.") } });
  }
  const result = await definirPremierMotDePasse(body.accountId, body.password);
  if (!result.ok) {
    const code = result.statut === 409 ? "mot-de-passe-deja-defini" : undefined;
    return send(res, result.statut, { error: { message: result.reason, code } });
  }
  // Instance qui impose le second facteur : pas de séance avant son activation.
  if (deuxFacteursObligatoire()) {
    return send(res, 401, {
      error: {
        message: t("Votre instance exige la double authentification : activez-la pour vous connecter."),
        code: "deux-facteurs-a-activer",
      },
      defi: defiInscription(result.account.id),
    });
  }

  const seance = await openSession(
    result.account.id,
    typeof body.poste === "string" ? body.poste : "Poste",
    resterConnecte(body as Record<string, unknown>),
  );
  send(res, 200, { account: result.account, session: seance });
}

/**
 * Second pas de la connexion : le code de l'application d'authentification, ou
 * un code de secours. Accessible au jeton seul, comme `verify` dont il est la
 * suite ; c'est le défi remis par `verify` qui prouve le mot de passe.
 */
async function handleDeuxFacteurs(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as {
    defi?: unknown;
    code?: unknown;
    poste?: unknown;
  };
  const result = await validerSecondFacteur(body.defi, body.code);
  if (!result.ok) {
    return send(res, result.statut, {
      error: { message: result.reason, code: result.expire ? "defi-expire" : undefined },
    });
  }
  const seance = await openSession(
    result.account.id,
    typeof body.poste === "string" ? body.poste : "Poste",
    resterConnecte(body as Record<string, unknown>),
  );
  send(res, 200, { account: result.account, session: seance });
}

/**
 * Activation imposée du second facteur, à la connexion (instance qui l'exige,
 * compte qui n'en a pas). Au jeton seul, comme `verify` : c'est le défi
 * d'inscription, remis après le mot de passe, qui tient lieu de preuve.
 */
async function handleInscriptionDeuxFacteurs(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  etape: "preparer" | "activer",
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as {
    defi?: unknown;
    code?: unknown;
    poste?: unknown;
  };
  if (etape === "preparer") {
    const r = await preparerInscription(body.defi);
    if (!r.ok) {
      return send(res, r.statut, {
        error: { message: r.reason, code: r.expire ? "defi-expire" : undefined },
      });
    }
    return send(res, 200, { secret: r.secret });
  }
  const r = await activerInscription(body.defi, body.code);
  if (!r.ok) {
    return send(res, r.statut, {
      error: { message: r.reason, code: r.expire ? "defi-expire" : undefined },
    });
  }
  const seance = await openSession(
    r.account.id,
    typeof body.poste === "string" ? body.poste : "Poste",
    resterConnecte(body as Record<string, unknown>),
  );
  send(res, 200, { account: r.account, session: seance, codesDeSecours: r.codesDeSecours });
}

/**
 * Réglage du second facteur, par la personne connectée et pour elle seule :
 * le compte est toujours celui de la séance, jamais un identifiant envoyé.
 * Toute modification redemande le mot de passe (voir `controlerMotDePasse`).
 */
async function handleReglageDeuxFacteurs(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  action: "etat" | "preparer" | "activer" | "desactiver" | "codes",
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  if (action === "etat") {
    const etat = await etatDeuxFacteurs(qui.userId);
    return etat
      ? send(res, 200, etat)
      : send(res, 404, { error: { message: t("Compte introuvable.") } });
  }

  const body = (await readJson(req).catch(() => ({}))) as {
    password?: unknown;
    code?: unknown;
  };
  const result =
    action === "preparer"
      ? await preparerDeuxFacteurs(qui.userId, body.password)
      : action === "activer"
        ? await activerDeuxFacteurs(qui.userId, body.code)
        : action === "desactiver"
          ? await desactiverDeuxFacteurs(qui.userId, body.password, body.code)
          : await regenererCodesDeSecours(qui.userId, body.password, body.code);
  if (!result.ok) return send(res, result.statut, { error: { message: result.reason } });
  const { ok: _ok, ...reponse } = result;
  send(res, 200, reponse);
}

/**
 * Export RGPD des données de la personne connectée (voir `export.ts`). Le
 * compte est celui de la séance : il n'existe aucun moyen, par cette route,
 * d'exporter les données d'un collègue.
 */
async function handleExport(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  send(res, 200, await exporterDonnees(qui));
}

/**
 * Suppression de son propre compte (RGPD, article 17). Le compte est celui de
 * la séance ; l'identité est confirmée par le mot de passe, et par un code si
 * le second facteur est actif. Voir `effacement.ts` pour ce qui disparaît et
 * ce qui reste.
 */
async function handleEffacement(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  etape: "apercu" | "effacer",
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const compte = (await publicAccounts()).find((a) => a.id === qui.userId);
  if (!compte) return send(res, 404, { error: { message: t("Compte introuvable.") } });

  if (etape === "apercu") {
    return send(res, 200, {
      ...(await apercuEffacement(compte.id, compte.email)),
      deuxFacteurs: compte.deuxFacteursActive,
    });
  }
  const body = (await readJson(req).catch(() => ({}))) as { password?: unknown; code?: unknown };
  const refus = await confirmerIdentite(compte.id, body.password, body.code);
  if (refus) return send(res, refus.statut, { error: { message: refus.reason } });
  // Côté OpenClaw d'abord : ses conversations avec les employés, et les employés qu'il a déployés.
  const sesEmployes = (await employes.employesDe(compte.id)).map((e) => e.nom);
  await employes.oublierPersonne(compte.id);
  const bilan = { ...(await effacerCompte(compte.id, compte.email, "titulaire")), employes: sesEmployes };
  send(res, 200, { ok: true, bilan });
}

/**
 * Modification de son propre profil : nom complet et adresse.
 *
 * Le compte modifié est **toujours** celui de la séance. La requête ne désigne
 * personne : si elle tente de le faire (`accountId`, `userId` ou `id` qui ne
 * sont pas les siens), elle est refusée en 403 plutôt qu'ignorée, pour qu'un
 * appelant qui croirait modifier un collègue ne reparte pas avec un 200 qui
 * aurait en fait touché son propre compte.
 *
 * Toutes les règles de fond (mot de passe exigé pour l'adresse, unicité,
 * absence d'héritage d'invitations, trace) sont dans `modifierProfil`
 * (gateway/src/accounts.ts), à côté des empreintes qu'elles manipulent.
 */
async function handleAuthProfil(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: { message: t("Corps JSON invalide.") } });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return send(res, 400, { error: { message: t("Corps JSON invalide.") } });
  }
  const champs = body as Record<string, unknown>;

  for (const cle of ["accountId", "userId", "id"]) {
    if (cle in champs && champs[cle] !== qui.userId) {
      return send(res, 403, {
        error: { message: t("On ne modifie que son propre compte.") },
      });
    }
  }

  const resultat = await modifierProfil(qui.userId, {
    fullName: champs.fullName,
    email: champs.email,
    password: champs.password,
    photo: champs.photo,
  });
  if (!resultat.ok) {
    return send(res, resultat.statut, { error: { message: resultat.reason } });
  }
  send(res, 200, { account: resultat.account });
}

/**
 * Journal d'audit : entrées récentes et vérification de la chaîne.
 *
 * Réservé aux personnes connectées, et **à ce qui les concerne**. Le journal
 * dit qui s'est connecté et quand, quels fichiers chaque agent a touchés,
 * quels documents ont été ouverts, quelles boîtes sont branchées. Rendu en
 * entier à toute séance, il donnait à chaque salarié la carte complète de
 * l'activité de ses collègues. Chacun y voit donc les siennes, plus celles
 * que l'instance s'attribue à elle-même (« systeme ») : ce sont les
 * démarrages, les migrations, les purges — l'état de la machine, que tout le
 * monde peut légitimement constater, et qui ne nomme personne.
 *
 * La vérification d'intégrité, elle, reste globale : elle porte sur la chaîne
 * d'empreintes, pas sur le contenu, et ne rend que des compteurs. Une chaîne
 * rompue doit être visible de tous, c'est tout l'intérêt de la sceller.
 *
 * **L'administrateur de l'instance, lui, voit tout** (roles.ts) : quelqu'un
 * doit pouvoir constater ce qui s'y passe, sans quoi sceller le journal ne
 * sert à rien. Il est désigné par le profil de déploiement, à défaut c'est le
 * premier compte créé. L'écran dit à chacun ce qu'il regarde.
 */
async function handleAudit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const jour = url.searchParams.get("jour") ?? undefined;
  /*
   * `Number("abc")` vaut NaN, et `slice(-NaN)` rend le tableau entier : la
   * borne de 1000 ne tenait qu'aux appelants bien élevés. On retombe donc sur
   * la valeur par défaut dès que le paramètre n'est pas un nombre.
   */
  const demandee = Number(url.searchParams.get("limite") ?? 200);
  const limite = Number.isFinite(demandee)
    ? Math.min(Math.max(Math.trunc(demandee), 1), 1000)
    : 200;
  /*
   * On lit large puis on filtre : les entrées sont mêlées dans le fichier, et
   * ne garder que les `limite` dernières avant de filtrer rendrait une liste
   * presque vide à quelqu'un dont les collègues ont beaucoup travaillé.
   */
  const role = await origineDuRole(qui.userId);
  const toutes = lireAudit(role ? limite : 5000, jour);
  const visibles = role
    ? toutes
    : toutes.filter((e) => e.qui === qui.userId || e.qui === "systeme").slice(-limite);
  send(res, 200, {
    jours: joursAudit(),
    entrees: visibles,
    integrite: verifierAudit(jour),
    conservationJours: conservationJours(),
    // L'écran doit pouvoir dire si l'on regarde tout, ou seulement les siennes.
    administrateur: role,
  });
}

/** Séances ouvertes du compte connecté, et fermeture de l'une d'elles. */
async function handleSessionsList(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const entete = req.headers["x-helix-session"];
  const token = typeof entete === "string" ? entete : entete?.[0];
  const courante = await resolveSession(token);
  send(res, 200, { sessions: await listSessions(qui.userId, courante?.hash) });
}

async function handleSessionRevoke(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as { id?: string; toutes?: boolean };

  if (body.toutes) {
    const fermees = await revokeAll(qui.userId);
    return send(res, 200, { ok: true, fermees });
  }
  if (!body.id) return send(res, 400, { error: { message: t("`id` est requis.") } });

  const fait = await revokeSession(qui.userId, body.id);
  send(res, fait ? 200 : 404, {
    ok: fait,
    message: fait ? "Séance fermée." : "Séance introuvable.",
  });
}

/** Révisions de toutes les collections : permet à un poste de savoir quoi retirer. */
/**
 * Révision d'une collection telle que les postes la suivent. Qui voit quelle
 * conversation dépend aussi des groupes : un changement de membres doit faire
 * re-tirer les conversations, sans quoi celles partagées au groupe
 * n'apparaîtraient (ou ne disparaîtraient) qu'à la prochaine écriture.
 */
async function revisionVue(c: Collection): Promise<number> {
  const r = await db().revision(c);
  return c === "sessions" ? Math.max(r, await db().revision("groupes")) : r;
}

async function handleDataRevisions(res: http.ServerResponse): Promise<void> {
  const entries = await Promise.all(COLLECTIONS.map(async (c) => [c, await revisionVue(c)] as const));
  send(res, 200, { revisions: Object.fromEntries(entries), shared: true });
}

/* ------------------------------- routes Code ---------------------------------- */

async function handleCodeStatus(res: http.ServerResponse): Promise<void> {
  send(res, 200, await codeStatus());
}

/** Ouvre une session OpenCode dans le dossier de projet. */
/** Parcours des dossiers, pour choisir où un agent travaille. */
async function handleDossiers(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  send(res, 200, {
    ...listerDossiers(url.searchParams.get("chemin") ?? projectDir()),
    courant: projectDir(),
  });
}

async function handleCodeSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as {
    model?: string;
    dossier?: string;
    /** Niveau de raisonnement choisi à l'écran : devient la variante OpenCode. */
    effort?: string;
  };

  /*
   * Le dossier vient de l'interface : il est validé ici, jamais pris tel quel.
   * Sans cela, un chemin fabriqué donnerait à l'agent de code accès à
   * n'importe quel endroit du disque.
   */
  if (body.dossier) {
    const verdict = validerDossier(body.dossier);
    if (!verdict.ok) return send(res, 400, { error: { message: verdict.raison } });
    setProjectDir(verdict.chemin);
    journaliser("donnees.ecrites", "systeme", {
      collection: "code.dossier",
      dossier: verdict.chemin,
    });
  }

  /*
   * Le modèle est **toujours** nommé, même quand l'interface n'en demande
   * aucun en particulier.
   *
   * Sans cette ligne, la session partait sans modèle et OpenCode choisissait
   * lui-même. Mesuré le 20/09/2026 sur le poste du client : chaque prompt de
   * l'écran Code rendait « Provider request failed with HTTP 401 :
   * missing_api_key ». OpenCode n'avait pas retenu le fournisseur « helix »
   * écrit dans `opencode.json` et tombait sur un fournisseur distant, sans clé.
   *
   * Deux raisons de nommer le modèle plutôt que de réparer la configuration :
   * c'est la passerelle qui décide du moteur (ADR-001), et un client qui
   * choisit seul peut choisir un service tiers — c'est-à-dire envoyer le code
   * du client hors de sa machine. On ne laisse pas cette porte ouverte, même
   * refermée par une liste de fournisseurs désactivés.
   */
  /*
   * Le modèle choisi à l'écran arrive sous son identifiant d'interface
   * (« lmstudio/qwen3-8b ») : OpenCode, lui, connaît le nom du modèle
   * (`writeConfig`). Le passer tel quel faisait redémarrer OpenCode sur un
   * modèle « absent », puis refuser la session. D'où la résolution ici.
   */
  const reglage = await reglageCode(body.model, body.effort);
  if ("erreur" in reglage) return send(res, 503, { error: { message: reglage.erreur } });
  const modele = reglage.modele;

  // Un modèle apparu depuis le démarrage d'OpenCode : il faut le lui faire relire.
  if (!(await assurerModeleCode(modele))) {
    return send(res, 503, {
      error: {
        message: tf(
          "L'agent de code ne dispose pas du modèle « {0} ». Choisissez-en un autre, ou vérifiez que LM Studio le sert.",
          modele,
        ),
      },
    });
  }

  /*
   * Session de l'**ancienne** API d'OpenCode : c'est la seule qui propose au
   * modèle les outils MCP, donc les connecteurs de l'instance (outilsCode.ts).
   * La passerelle traduit son flux dans celui qu'attendent les clients
   * (fluxCode.ts). Le modèle part avec chaque demande (`refModele`).
   */
  const dossier = projectDir();
  const creation = await creerSessionCode(dossier, modele, reglage.variante);
  if ("erreur" in creation) return send(res, creation.statut, { error: { message: creation.erreur } });
  // La session entre dans la liste de sa propriétaire (sessionsCode.ts), séparée des Chats.
  const qui = await demandeur(req, new URL(req.url ?? "/", "http://localhost"));
  if (qui) {
    await noterSessionCode({ id: creation.id, userId: qui.userId, dossier, modele, variante: reglage.variante }).catch((err) =>
      console.error("[code] session non notée au registre :", err instanceof Error ? err.message : err),
    );
  }
  // Même forme de réponse qu'avant (`data.id`) : l'écran, la ligne de commande et l'extension la lisent.
  send(res, 200, { data: { id: creation.id } });
}

/**
 * La session appartient-elle à une autre personne ? Une session du registre
 * (sessionsCode.ts) ne s'utilise que par sa propriétaire : sans cela, qui
 * connaissait son identifiant pouvait y envoyer des demandes ou lire son flux.
 * Une session absente du registre (ouverte avant lui) reste ouverte à toute
 * séance, comme avant.
 */
async function sessionCodeDAutrui(sessionID: string, userId: string | undefined): Promise<boolean> {
  const s = await sessionCode(sessionID).catch(() => undefined);
  return Boolean(s && s.userId !== userId);
}

/** `GET /helix/code/sessions` : les sessions de Code de la personne, la plus récente d'abord. */
async function handleCodeSessions(res: http.ServerResponse, userId: string): Promise<void> {
  try {
    const liste = await sessionsDe(userId);
    send(res, 200, {
      sessions: liste.map((s) => ({ id: s.id, titre: s.titre, dossier: s.dossier, creee: s.creee, maj: s.maj })),
    });
  } catch (err) {
    send(res, 500, { error: { message: err instanceof Error ? err.message : String(err) } });
  }
}

/**
 * `GET /helix/code/sessions/<id>` : l'historique d'une session, relu chez
 * OpenCode, pour la rouvrir. `enCours` : l'agent y travaille encore ;
 * `dernier` : le dernier numéro d'évènement vu par la passerelle, pour suivre
 * la suite sans rien rejouer.
 */
async function handleCodeSessionHistorique(res: http.ServerResponse, userId: string, id: string): Promise<void> {
  const s = await sessionCode(id).catch(() => undefined);
  if (!s || s.userId !== userId) return send(res, 404, { error: { message: t("Session de code inconnue.") } });
  try {
    const d = encodeURIComponent(s.dossier);
    const [messages, etat] = await Promise.all([
      codeApi(`/session/${id}/message?directory=${d}`),
      codeApi(`/session/status?directory=${d}`).catch(() => undefined),
    ]);
    if (!messages.ok) {
      await messages.text().catch(() => "");
      return send(res, messages.status === 404 ? 404 : 502, { error: { message: t("L'agent de code n'a pas rendu cette session.") } });
    }
    const brut = (await messages.json().catch(() => [])) as unknown;
    const statuts = etat?.ok ? ((await etat.json().catch(() => ({}))) as Record<string, { type?: string } | undefined>) : {};
    // La passerelle retrouve le dossier et le modèle de la session après un redémarrage.
    if (!modeleDeSession.has(id)) modeleDeSession.set(id, { modele: s.modele, variante: s.variante, dossier: s.dossier });
    if (!sessionCodeSuivie(id)) suivreSessionCode(id, s.dossier);
    await ecouterDossierCode(s.dossier).catch(() => {});
    send(res, 200, {
      session: { id: s.id, titre: s.titre, dossier: s.dossier, creee: s.creee, maj: s.maj },
      messages: historiqueCode(Array.isArray(brut) ? brut : []),
      enCours: Boolean(statuts[id] && statuts[id]!.type !== "idle"),
      dernier: dernierNumeroCode(id),
    });
  } catch (err) {
    send(res, 502, { error: { message: err instanceof Error ? err.message : String(err) } });
  }
}

/**
 * Ouvre une session de Helix Code et la fait suivre par la passerelle, avant
 * toute demande : `/event` ne rejoue rien, un évènement émis avant l'écoute
 * serait perdu.
 */
async function creerSessionCode(
  dossier: string,
  modele: string,
  variante: string | undefined,
): Promise<{ id: string } | { erreur: string; statut: number }> {
  const upstream = await codeApi(`/session?directory=${encodeURIComponent(dossier)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const corps = (await upstream.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof corps.id === "string" && SESSION_CODE.test(corps.id) ? corps.id : undefined;
  if (!upstream.ok || !id) {
    return { erreur: t("L'agent de code n'a pas ouvert de session."), statut: upstream.ok ? 502 : upstream.status };
  }
  modeleDeSession.set(id, { modele, variante, dossier });
  suivreSessionCode(id, dossier);
  try {
    await ecouterDossierCode(dossier);
  } catch {
    return { erreur: t("Flux d'événements indisponible."), statut: 502 };
  }
  return { id };
}

/**
 * Modèle, niveau et dossier de chaque session de l'écran Code : de quoi en
 * rouvrir une identique (relance), et savoir si le réglage a changé depuis.
 */
const modeleDeSession = new Map<string, { modele: string; variante?: string; dossier: string }>();

/**
 * Le modèle et la variante qu'une demande de l'écran Code doit utiliser.
 * `model` absent : celui que l'instance choisit pour le code.
 */
async function reglageCode(
  model: string | undefined,
  effort: string | undefined,
): Promise<{ modele: string; variante?: string } | { erreur: string }> {
  const choix = await resolve(model ? { model } : { role: "code" });
  if ("error" in choix) {
    return { erreur: model ? choix.error : "Aucun modèle disponible pour l'écran Code. " + choix.error };
  }
  return { modele: choix.model.id, variante: varianteDe(effort) };
}

/*
 * Délai au-delà duquel une demande qui n'a pas atteint le modèle est tenue pour
 * perdue. Mesuré le 23/09/2026 sur le poste du client : une demande saine
 * atteint le modèle en 0,1 à 0,2 seconde, même quand la réponse met ensuite
 * vingt secondes à commencer. Huit secondes laissent quarante fois la marge.
 */
const APPEL_MAX_MS = 8000;

async function attendreAppel(texte: string, depuis: number): Promise<boolean> {
  while (Date.now() - depuis < APPEL_MAX_MS) {
    if (agentAAppele(texte, depuis)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return agentAAppele(texte, depuis);
}

/**
 * Forme d'un identifiant de session OpenCode.
 *
 * Il est interpolé dans un chemin d'URL, et `fetch` normalise les segments
 * `..` : sans ce contrôle, `x/../../api/…?` faisait appeler à la passerelle
 * un tout autre point d'entrée de l'API OpenCode, **avec l'en-tête
 * d'autorisation du serveur**, et — sur la route des évènements — renvoyait la
 * réponse telle quelle à l'appelant. C'est-à-dire une lecture libre d'une API
 * qui sait lire des fichiers et lancer des commandes, en contournant la
 * barrière d'approbation.
 */
const SESSION_CODE = /^[A-Za-z0-9_-]{1,64}$/;

async function handleCodePrompt(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as {
    sessionID?: string;
    text?: string;
    /** Réglages de l'écran au moment de l'envoi ; absents : ceux de la session. */
    model?: string;
    effort?: string;
  };
  if (!body.sessionID || !body.text) {
    return send(res, 400, { error: { message: t("`sessionID` et `text` sont requis.") } });
  }
  if (!SESSION_CODE.test(body.sessionID)) {
    return send(res, 400, { error: { message: t("`sessionID` invalide.") } });
  }
  /*
   * La personne a changé de modèle ou de niveau depuis l'ouverture de la
   * session : la demande part avec le nouveau réglage. Sans cela, le
   * sélecteur changeait d'affichage et la demande partait sur l'ancien réglage.
   * L'ancienne API d'OpenCode prend le modèle à chaque demande : il suffit de
   * le retenir.
   */
  const envoyeur = await demandeur(req, new URL(req.url ?? "/", "http://localhost"));
  if (await sessionCodeDAutrui(body.sessionID, envoyeur?.userId)) {
    return send(res, 403, { error: { message: t("Cette session de code appartient à une autre personne.") } });
  }
  /*
   * Session inconnue de la mémoire (ouverte avant un redémarrage de la
   * passerelle) : son dossier et son modèle viennent du registre s'il la
   * connaît (sessionsCode.ts), sinon réglage de l'instance et dossier courant.
   */
  if (!modeleDeSession.has(body.sessionID)) {
    const notee = await sessionCode(body.sessionID).catch(() => undefined);
    if (notee) modeleDeSession.set(body.sessionID, { modele: notee.modele, variante: notee.variante, dossier: notee.dossier });
  }
  let connue = modeleDeSession.get(body.sessionID);
  if (!connue || body.model !== undefined || body.effort !== undefined) {
    const voulu = await reglageCode(body.model, body.effort);
    if ("erreur" in voulu) return send(res, 503, { error: { message: voulu.erreur } });
    if (!connue || voulu.modele !== connue.modele || voulu.variante !== connue.variante) {
      if (!(await assurerModeleCode(voulu.modele))) {
        return send(res, 503, {
          error: {
            message: tf(
              "L'agent de code ne dispose pas du modèle « {0} ». Choisissez-en un autre, ou vérifiez que LM Studio le sert.",
              voulu.modele,
            ),
          },
        });
      }
      connue = { dossier: connue?.dossier ?? projectDir(), modele: voulu.modele, variante: voulu.variante };
      modeleDeSession.set(body.sessionID, connue);
    }
  }
  const reglageEnvoi = connue;
  /*
   * La passerelle écoute le dossier avant d'envoyer (`/event` ne rejoue rien) ;
   * `assurerModele` a pu redémarrer OpenCode, et l'écoute avec lui.
   */
  if (!sessionCodeSuivie(body.sessionID)) suivreSessionCode(body.sessionID, reglageEnvoi.dossier);
  try {
    await ecouterDossierCode(reglageEnvoi.dossier);
  } catch {
    return send(res, 502, { error: { message: t("Flux d'événements indisponible.") } });
  }
  /*
   * Un connecteur branché ou retiré depuis, ou une bibliothèque qui a reçu
   * son premier document : OpenCode relit la liste des outils (outilsCode.ts),
   * établie pour la personne qui envoie.
   */
  await rafraichirOutilsCode(reglageEnvoi.dossier, envoyeur?.userId);
  // Titre (première demande) et date de la session dans la liste de Code.
  void toucherSessionCode(body.sessionID, body.text, { modele: reglageEnvoi.modele, variante: reglageEnvoi.variante }).catch(() => {});

  /*
   * Une demande de site : Helix pose d'abord un design professionnel dans le
   * projet (design.ts), et la demande part avec la consigne de s'en servir.
   * Un petit modèle ne sait pas dessiner ; il sait suivre un guide.
   */
  let texteEnvoye = body.text;
  if (estDemandeDeSite(body.text)) {
    try {
      const qui = await demandeur(req, new URL(req.url ?? "/", "http://localhost"));
      const prepare = await preparerDesign(modeleDeSession.get(body.sessionID)?.dossier ?? projectDir(), body.text, qui?.userId ?? "code");
      texteEnvoye = body.text + prepare.consigne;
      if (prepare.design) console.log(`[code] design préparé : ${prepare.design.produit}, ${prepare.design.style}, ${prepare.design.polices.nom}.`);
    } catch (err) {
      console.log(`[code] design non préparé : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /*
   * Qui envoie cette demande : les connecteurs que l'agent de code appellera
   * pendant ce tour travailleront pour cette personne, et c'est à elle que
   * les cartes d'accord iront (outilsCode.ts). Noté avant l'envoi : le premier
   * appel d'outil peut arriver avant la réponse d'OpenCode.
   */
  const auteur = await demandeur(req, new URL(req.url ?? "/", "http://localhost"));
  const dossierDemande = reglageEnvoi.dossier;
  if (auteur) noterDemandeCode(body.sessionID, auteur.userId, dossierDemande);

  /*
   * `prompt_async` rend la main tout de suite (204), comme le faisait la
   * nouvelle API. L'identifiant du message est choisi ici, au format
   * d'OpenCode, et rendu aux clients (`data.id`) : c'est par lui qu'ils
   * reconnaissent leur demande dans le flux (`session.next.prompted`).
   */
  const envoyer = async (session: string, reglage: { modele: string; variante?: string; dossier: string }) => {
    const messageID = idMessageCode();
    const reponse = await codeApi(
      `/session/${session}/prompt_async?directory=${encodeURIComponent(reglage.dossier)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageID,
          ...refModele(reglage.modele, reglage.variante),
          parts: [{ type: "text", text: texteEnvoye }],
        }),
      },
    );
    await reponse.text().catch(() => "");
    return { ok: reponse.ok, statut: reponse.status, messageID };
  };

  let envoi = Date.now();
  const upstream = await envoyer(body.sessionID, reglageEnvoi);

  /*
   * La demande a-t-elle atteint le modèle ?
   *
   * OpenCode rate parfois la première session après son démarrage : il
   * accepte la demande, puis ne l'exécute jamais, sans rien émettre (voir
   * `chauffer`, opencode.ts). La passerelle le voit, puisque c'est elle qui
   * relaie l'appel au modèle : sans cet appel au bout de huit secondes, la
   * session est perdue. On en ouvre une identique et on y renvoie la demande,
   * une fois. L'écran apprend le nouvel identifiant par `helixRelance` et s'y
   * abonne.
   *
   * Un premier guet, posé côté écran, attendait « la première étape » et la
   * croyait immédiate. Elle ne l'est pas : elle vient après la lecture des
   * instructions d'OpenCode par le modèle, jusqu'à vingt secondes plus tard.
   * Ce guet-là aurait relancé des demandes simplement lentes, en double.
   */
  if (upstream.ok && !(await attendreAppel(body.text, envoi))) {
    /*
     * Le modèle de la session perdue ; à défaut — session ouverte avant un
     * redémarrage de la passerelle —, celui qu'elle choisirait pour le code.
     */
    const perdue = modeleDeSession.get(body.sessionID);
    let modele = perdue?.modele;
    if (!modele) {
      const choix = await resolve({ role: "code" });
      if (!("error" in choix)) modele = choix.model.id;
    }
    // Même dossier que la session perdue : le dossier courant a pu changer depuis.
    const dossier = perdue?.dossier ?? projectDir();
    console.log(`[code] demande jamais arrivée au modèle : nouvelle session (${modele ?? "aucun modèle"}).`);
    if (modele) {
      const creation = await creerSessionCode(dossier, modele, perdue?.variante);
      if ("id" in creation) {
        const nouvelle = creation.id;
        if (auteur) noterDemandeCode(nouvelle, auteur.userId, dossier);
        // La session relancée remplace la perdue dans la liste de Code, avec la même demande pour titre.
        if (auteur) {
          await noterSessionCode({ id: nouvelle, userId: auteur.userId, dossier, modele, variante: perdue?.variante, titre: "" }).catch(() => {});
          void toucherSessionCode(nouvelle, body.text).catch(() => {});
          void retirerSessionCode(body.sessionID, auteur.userId).catch(() => {});
        }
        envoi = Date.now();
        const second = await envoyer(nouvelle, { modele, variante: perdue?.variante, dossier });
        if (second.ok && (await attendreAppel(body.text, envoi))) {
          return send(res, 200, { data: { id: second.messageID }, helixRelance: { sessionID: nouvelle } });
        }
      }
    }
    return send(res, 502, {
      error: {
        message: t(
          "L'agent de code n'a pas démarré, même après une nouvelle tentative. Réessayez dans un instant ; si cela recommence, fermez puis rouvrez l'application.",
        ),
      },
    });
  }
  if (!upstream.ok) {
    return send(res, upstream.statut >= 400 && upstream.statut < 600 ? upstream.statut : 502, {
      error: { message: t("La demande n'a pas été acceptée par l'agent de code.") },
    });
  }
  // Même forme de réponse qu'avec la nouvelle API : `data.id`, l'identifiant du message.
  send(res, 200, { data: { id: upstream.messageID } });
}

async function handleCodeInterrupt(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as { sessionID?: string };
  if (!body.sessionID) return send(res, 400, { error: { message: t("`sessionID` requis.") } });
  if (!SESSION_CODE.test(body.sessionID)) {
    return send(res, 400, { error: { message: t("`sessionID` invalide.") } });
  }
  const qui = await demandeur(req, new URL(req.url ?? "/", "http://localhost"));
  if (await sessionCodeDAutrui(body.sessionID, qui?.userId)) {
    return send(res, 403, { error: { message: t("Cette session de code appartient à une autre personne.") } });
  }
  const dossier = modeleDeSession.get(body.sessionID)?.dossier ?? (await sessionCode(body.sessionID).catch(() => undefined))?.dossier ?? projectDir();
  const upstream = await codeApi(`/session/${body.sessionID}/abort?directory=${encodeURIComponent(dossier)}`, {
    method: "POST",
  });
  send(res, upstream.status, { ok: upstream.ok });
}

/**
 * Relaie le flux d'événements d'une session OpenCode vers l'interface.
 *
 * **Relayer, et rien d'autre.** `codeApi` démarre le serveur OpenCode s'il ne
 * tourne pas : cette route de lecture lançait donc un processus persistant,
 * enraciné sur le dossier de projet, à qui présentait le seul jeton d'instance.
 * Une route qui lit ne doit pas allumer un moteur. Le démarrage reste le rôle
 * de `POST /helix/code/session`, qui exige une séance et valide le dossier.
 *
 * Serveur éteint : on le dit (503) plutôt que de le démarrer. L'interface
 * n'ouvre ce flux qu'après avoir créé une session, donc après le démarrage :
 * le cas ne se présente que pour un appelant qui court-circuite ce chemin.
 */
async function handleCodeEvents(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionID: string,
  url: URL,
): Promise<void> {
  if (!SESSION_CODE.test(sessionID)) {
    return send(res, 400, { error: { message: t("`sessionID` invalide.") } });
  }
  if (!codeEnMarche()) {
    return send(res, 503, {
      error: {
        message:
          "Le moteur de code n'est pas démarré. Ouvrez une session de code " +
          "(POST /helix/code/session) avant d'écouter son flux d'évènements.",
      },
    });
  }

  /*
   * `after` : l'écran qui se réabonne donne le dernier événement reçu, pour
   * ne pas se voir rejouer toute la session.
   */
  const apresBrut = url.searchParams.get("after");
  const apres = apresBrut && /^\d{1,12}$/.test(apresBrut) ? Number(apresBrut) : undefined;

  /*
   * Le flux est celui que la passerelle fabrique (fluxCode.ts) à partir de
   * `/event` d'OpenCode. Une session qu'elle ne suit pas (ouverte avant un
   * redémarrage) n'est suivie que si OpenCode la connaît : un identifiant
   * inventé n'occupe rien.
   */
  const qui = await demandeur(req, url);
  if (await sessionCodeDAutrui(sessionID, qui?.userId)) {
    return send(res, 403, { error: { message: t("Cette session de code appartient à une autre personne.") } });
  }
  const dossier = modeleDeSession.get(sessionID)?.dossier ?? (await sessionCode(sessionID).catch(() => undefined))?.dossier ?? projectDir();
  try {
    if (!sessionCodeSuivie(sessionID)) {
      const existe = await codeApi(`/session/${sessionID}?directory=${encodeURIComponent(dossier)}`);
      await existe.text().catch(() => "");
      if (!existe.ok) return send(res, 404, { error: { message: t("Session de code inconnue.") } });
      suivreSessionCode(sessionID, dossier);
    }
    await ecouterDossierCode(dossier);
  } catch {
    return send(res, 502, { error: { message: t("Flux d'événements indisponible.") } });
  }
  res.writeHead(200, entetesFlux(req));
  /*
   * Un commentaire SSE toutes les vingt secondes : invisible pour l'écran,
   * mais une connexion morte se révèle à l'écriture au lieu de passer pour
   * un agent silencieux, et aucun intermédiaire ne ferme un flux muet.
   */
  const veille = setInterval(() => res.write(": veille\n\n"), 20_000);
  /*
   * Fin d'un tour de Code (« step.ended » avec « stop ») : Helix repasse sur
   * les pages du projet, si un design y a été posé (design.ts). Seulement
   * pour un évènement qui arrive, pas pour l'historique rejoué à l'ouverture.
   */
  let enDirect = false;
  const desabonner = abonnerCode(sessionID, apres, (evenement: EvenementCode) => {
    res.write(`data: ${JSON.stringify(evenement)}\n\n`);
    if (enDirect && evenement.type === "session.next.step.ended" && evenement.data.finish === "stop") {
      const dossierTour = modeleDeSession.get(sessionID)?.dossier ?? projectDir();
      setTimeout(() => {
        const n = corrigerPages(dossierTour);
        if (n > 0) console.log(`[code] design : ${n} page(s) remise(s) sur la feuille du projet.`);
      }, 1500);
    }
  });
  enDirect = true;
  const finir = () => {
    clearInterval(veille);
    desabonner();
    res.end();
  };
  req.on("close", finir);
}

/* ------------------------------- routes MCP ----------------------------------- */

async function handleMcpStatus(res: http.ServerResponse): Promise<void> {
  const espaces = workspaces();
  send(res, 200, {
    workspace: workspace(),
    espaces,
    // L'écran doit pouvoir dire « tout votre poste » plutôt que d'aligner des
    // chemins : la portée se reconnaît au dossier personnel en tête.
    toutLePoste: espaces.length > 1 && espaces[0] === homedirDeLHote(),
    servers: mcpStatus(),
  });
}

/** Dossier personnel du compte qui fait tourner l'instance. */
const homedirDeLHote = (): string => toutLePoste()[0];

/**
 * Change l'espace de travail de Cowork.
 *
 * Le chemin est validé côté instance, avec les mêmes bornes que pour Code :
 * l'agent reste dans le dossier personnel de l'utilisateur.
 */
/**
 * L'instance sert-elle plusieurs personnes ?
 *
 * Deux signes : le profil de déploiement le dit (`share`), ou la passerelle
 * écoute sur le réseau. Sur un poste personnel, aucun des deux, et les gestes
 * qui n'engagent que soi restent sans friction.
 */
const instancePartagee = (): boolean => deployment().share === true || surLeReseau();

async function handleWorkspace(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as {
    dossier?: string;
    /** « poste » ouvre le dossier personnel et les disques montés d'un coup. */
    portee?: string;
    motDePasse?: unknown;
    code?: unknown;
  };
  const toutLeposte = body.portee === "poste";
  if (!body.dossier && !toutLeposte) {
    return send(res, 400, { error: { message: t("`dossier` ou `portee` est requis.") } });
  }

  /*
   * Le dossier de travail est **commun à toute l'instance** : le changer
   * déplace le bac à sable de tous les agents, de tout le monde, d'un coup.
   * Sur un poste personnel, c'est un geste ordinaire — on choisit son dossier,
   * et il n'y a personne d'autre. Sur une instance partagée, c'est le geste
   * qui ouvre à l'équipe entière n'importe quel dossier de la machine hôte :
   * on redemande donc le mot de passe, comme pour le contrôle de l'écran.
   */
  if (instancePartagee()) {
    const refus = await confirmerIdentite(qui.userId, body.motDePasse, body.code);
    if (refus) {
      // Le code permet à l'écran de demander le mot de passe, plutôt que
      // d'afficher un refus sans suite à quelqu'un qui a le droit de le faire.
      return send(res, refus.statut, {
        error: { message: refus.reason, code: "identite-a-confirmer" },
      });
    }
  }

  /*
   * « Tout mon poste » demande le mot de passe, toujours, même sur une machine
   * personnelle où le changement de dossier n'en demande pas.
   *
   * La raison n'est pas la même que pour une instance partagée. Ici, ce qui
   * change, c'est **l'étendue** : l'agent passe d'un dossier à l'ensemble des
   * documents de la personne, disques branchés compris. C'est un geste rare et
   * lourd de conséquences, et un clic de trop vaut mieux qu'une découverte
   * après coup.
   */
  if (toutLeposte && !instancePartagee()) {
    const refus = await confirmerIdentite(qui.userId, body.motDePasse, body.code);
    if (refus) {
      return send(res, refus.statut, {
        error: { message: refus.reason, code: "identite-a-confirmer" },
      });
    }
  }

  let chemins: string[];
  if (toutLeposte) {
    chemins = toutLePoste();
  } else {
    const verdict = validerDossier(body.dossier as string);
    if (!verdict.ok) return send(res, 400, { error: { message: verdict.raison } });
    chemins = [verdict.chemin];
  }

  const resultat = await setWorkspace(chemins);
  if (!resultat.ok) {
    return send(res, 500, {
      error: { message: resultat.error ?? "Le serveur de fichiers n'a pas redémarré." },
    });
  }

  journaliser("donnees.ecrites", qui.userId, {
    collection: "cowork.espace",
    dossier: chemins[0],
    ...(toutLeposte ? { portee: "poste", emplacements: chemins.length } : {}),
  });
  send(res, 200, {
    workspace: workspace(),
    espaces: workspaces(),
    toutLePoste: toutLeposte,
    servers: mcpStatus(),
  });
}

async function handleMcpToggle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as { id?: string; start?: boolean };
  if (!body.id) return send(res, 400, { error: { message: t("`id` est requis.") } });
  if (body.start === false) {
    await stopServer(body.id);
    return send(res, 200, { ok: true, servers: mcpStatus() });
  }
  const result = await startServer(body.id);
  send(res, result.ok ? 200 : 500, { ...result, servers: mcpStatus() });
}

/* --------------------------- routes connecteurs ------------------------------- */

/** Catalogue, connecteurs branchés, et régime de l'instance. Aucun secret. */
async function handleConnecteursEtat(res: http.ServerResponse): Promise<void> {
  send(res, 200, await connecteurs.etat());
}

/** Groupes d'outils réellement proposés au modèle : ce que le composeur affiche. */
async function handleOutils(res: http.ServerResponse): Promise<void> {
  send(res, 200, { groupes: await connecteurs.groupes() });
}

/**
 * Branche un connecteur.
 *
 * La séance est exigée deux fois plutôt qu'une : par le tableau `EXECUTION` en
 * amont, et ici. Cette route fait tourner un programme de plus sur la machine
 * de l'entreprise ; elle doit pouvoir nommer qui l'a demandé, sans quoi le
 * journal d'audit n'a personne à inscrire.
 */
async function handleConnecteurAjouter(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = await readJson(req).catch(() => null);
  const resultat = await connecteurs.ajouter(body, qui.userId);
  send(res, resultat.ok ? 200 : 400, { ...resultat, etat: await connecteurs.etat() });
}

/**
 * Adresse par laquelle le navigateur de la personne atteint cette instance.
 *
 * C'est elle, et pas une adresse configurée quelque part, qui doit servir de
 * retour d'autorisation : le service renverra la personne là où elle était.
 * L'en-tête `Host` vient du client, donc d'un contenu non maîtrisé : on
 * n'accepte qu'un nom d'hôte de forme correcte, pour ne pas construire une
 * adresse de retour arbitraire à partir d'une requête forgée.
 */
function adresseVue(req: http.IncomingMessage): string | null {
  const brut = req.headers.host;
  const hote = typeof brut === "string" ? brut.trim() : "";
  if (!/^[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(hote) && !/^\[[0-9a-fA-F:]+\](:\d{1,5})?$/.test(hote)) {
    return null;
  }
  const schema = tls ? "https" : "http";
  return `${schema}://${hote}`;
}

/**
 * Adresse à laquelle un **autre poste** peut joindre cette instance.
 *
 * Ce n'est pas la même question que `adresseVue`. Celle-là rend l'adresse par
 * laquelle le navigateur courant atteint l'instance, ce qu'il faut pour un
 * retour d'autorisation — le navigateur revient là d'où il est parti. Mais
 * pour une invitation, l'adresse voyage vers **une autre machine** : sur un
 * poste autonome, `Host` vaut « localhost:8787 », et le mail aurait donné à un
 * collègue une adresse qui ne mène qu'à son propre ordinateur.
 *
 * Trois cas, dans cet ordre :
 *  1. l'appelant atteint déjà l'instance par une adresse nommée : c'est la
 *     bonne, il la connaît mieux que nous ;
 *  2. l'instance est ouverte au réseau mais l'appelant passe par la boucle
 *     locale (l'administrateur travaille sur la machine hôte) : on donne le
 *     nom de la machine, celui-là même que porte le certificat ;
 *  3. l'instance n'est pas ouverte au réseau : il n'existe aucune adresse à
 *     donner, et le dire vaut mieux qu'envoyer un mail inutilisable.
 */
function adresseJoignable(req: http.IncomingMessage): string | null {
  const vue = adresseVue(req);
  const hoteVu = vue ? new URL(vue).hostname.toLowerCase() : "";
  const boucle = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hoteVu);
  if (vue && !boucle) return vue;
  if (!instancePartagee()) return null;
  /*
   * Surtout pas `hostname()` : sur ce Mac il rend « Mini-de-Clabaut » quand le
   * réseau annonce « Mac-mini-de-Clabaut.local ». Le mail aurait porté une
   * adresse qui ne résout nulle part. `adressePourLesCollegues` ne rend que
   * des noms réellement annoncés, et le certificat les couvre tous.
   */
  return adressePourLesCollegues(PORT, Boolean(tls));
}

/* --------------------------- ouverture au réseau --------------------------- */

/**
 * État de l'ouverture, et l'adresse à donner à un collègue.
 *
 * L'écran doit pouvoir dire trois choses : si l'instance est ouverte, si elle
 * l'est par le profil de déploiement (auquel cas l'interrupteur n'y peut rien),
 * et l'adresse exacte à transmettre.
 */
async function handleReseauEtat(res: http.ServerResponse, qui: Demandeur): Promise<void> {
  const etat = etatReseau();
  const parLeProfil = deployment().share === true || process.env.HELIX_GATEWAY_HOST !== undefined;
  send(res, 200, {
    ouverte: surLeReseau(),
    parLeProfil,
    depuis: etat.depuis ?? null,
    adresse: surLeReseau() ? adressePourLesCollegues(PORT, Boolean(tls)) : null,
    /*
     * Plusieurs adresses, la meilleure d'abord. Une seule ne suffit pas : le
     * nom mDNS ne traverse pas tous les réseaux, et une adresse IP change au
     * gré des baux. La personne essaie, et l'écran le dit.
     */
    adresses: surLeReseau() ? adressesPourLesCollegues(PORT, Boolean(tls)) : [],
    /*
     * Les mêmes, mais nommées : « local » se joint depuis le même Wi-Fi,
     * « prive » depuis n'importe où sur le même réseau privé. L'écran s'en
     * sert pour dire à qui donner quoi, au lieu d'aligner des adresses nues.
     */
    propositions: surLeReseau() ? propositions(PORT, Boolean(tls)) : [],
    chiffre: Boolean(tls),
    administrateur: Boolean(await origineDuRole(qui.userId)),
  });
}

/**
 * Ouvre ou referme l'instance.
 *
 * Ce réglage change la surface de la machine : on redemande le mot de passe,
 * comme pour le contrôle de l'écran ou le palier « libre » d'un agent. Il ne
 * prend effet qu'au redémarrage de la passerelle — l'adresse d'écoute se
 * choisit à l'ouverture du serveur — et c'est l'application qui la relance.
 */
async function handleReseauRegler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as {
    ouverte?: unknown;
    motDePasse?: unknown;
    code?: unknown;
  };
  if (typeof body.ouverte !== "boolean") {
    return send(res, 400, { error: { message: t("« ouverte » doit valoir true ou false.") } });
  }
  if (deployment().share === true || process.env.HELIX_GATEWAY_HOST !== undefined) {
    return send(res, 409, {
      error: {
        message:
          "L'ouverture de cette instance est fixée par son profil de déploiement : " +
          "elle ne se règle pas depuis cet écran.",
      },
    });
  }
  /*
   * Seul l'administrateur de l'instance ouvre la porte. Sur un poste
   * personnel, c'est l'unique compte, et la question ne se pose pas.
   */
  if (!(await origineDuRole(qui.userId))) {
    return send(res, 403, {
      error: { message: t("Seule la personne qui administre cette instance peut l'ouvrir.") },
    });
  }
  const refus = await confirmerIdentite(qui.userId, body.motDePasse, body.code);
  if (refus) {
    return send(res, refus.statut, {
      error: { message: refus.reason, code: "identite-a-confirmer" },
    });
  }

  reglerReseau(body.ouverte, qui.userId);
  journaliser("donnees.ecrites", qui.userId, {
    collection: "reseau",
    ouverte: body.ouverte,
  });
  send(res, 200, {
    ouverte: body.ouverte,
    /*
     * L'adresse annoncée est celle qui vaudra **après** le redémarrage :
     * l'instance chiffre dès qu'elle écoute sur le réseau (tls.ts).
     */
    adresse: body.ouverte ? adressePourLesCollegues(PORT, true) : null,
    redemarrageNecessaire: true,
  });
}

/* ------------------------------ invitations ------------------------------ */

/**
 * Invite un collègue : crée un code, et envoie le mail si une boîte est
 * branchée sur l'instance (invitations.ts).
 */
async function handleInviter(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as { email?: unknown };
  const base = adresseJoignable(req);
  if (!base) {
    return send(res, 409, {
      error: {
        message:
          "Cette instance n'est joignable que depuis cette machine : un collègue ne " +
          "pourrait pas s'y connecter, et l'invitation ne servirait à rien. Ouvrez-la " +
          "à vos collègues dans Réglages, Profil, avant d'inviter.",
      },
    });
  }

  const moi = (await publicAccounts()).find((c) => c.id === qui.userId);
  /*
   * Le mail porte l'adresse principale, et les autres en second recours : le
   * collègue essaie, il n'a rien à comprendre au réseau. Une adresse de moins
   * dans le mail, c'est un échec de plus au moment de se connecter.
   */
  const autres = surLeReseau()
    ? adressesPourLesCollegues(PORT, Boolean(tls)).filter((a) => a !== base)
    : [];
  const resultat = await invitations.inviter(
    body.email,
    qui.userId,
    moi?.fullName?.trim() || "Un collègue",
    base,
    autres,
  );
  if (!resultat.ok) return send(res, resultat.statut, { error: { message: resultat.message } });
  send(res, 200, { ...resultat.valeur, adresse: base });
}

/** Invitations en attente, et annulation. Les codes n'en sortent jamais. */
async function handleInvitations(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  if (req.method === "GET") return send(res, 200, { invitations: await invitations.enAttente() });

  const body = (await readJson(req).catch(() => ({}))) as { email?: unknown };
  const r = await invitations.annuler(body.email, qui.userId);
  if (!r.ok) return send(res, r.statut, { error: { message: r.message } });
  send(res, 200, { ok: true, invitations: await invitations.enAttente() });
}

/**
 * Rattache un poste à l'instance avec un code d'invitation.
 *
 * **Route publique, et elle doit l'être** : c'est un poste tout neuf qui
 * appelle, et il n'a précisément rien — ni jeton d'instance, ni séance. C'est
 * le code qui l'autorise, et le code seul : court, lié à une adresse, valable
 * sept jours, bon une fois. Il est aussi le seul endroit du produit qui remet
 * le jeton d'instance, et c'est pour éviter qu'on le dicte au téléphone.
 *
 * Le code n'est pas consommé ici : il l'est à la création du compte, qui est
 * son vrai usage. Un poste rattaché sans compte n'a accès à rien de plus
 * qu'un écran de connexion.
 */
async function handleRejoindre(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as { code?: unknown };
  const verdict = await invitations.verifier(body.code);
  if (!verdict.ok) return send(res, verdict.statut, { error: { message: verdict.message } });

  journaliser("compte.invite", "anonyme", { email: verdict.valeur.email, etape: "poste rattaché" });
  send(res, 200, {
    jeton: instanceToken(),
    email: verdict.valeur.email,
    produit: nomProduit(),
  });
}

/** Lance l'autorisation d'un service distant, ou le branche s'il l'est déjà. */
async function handleConnecteurConnecter(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as {
    id?: string;
    clientId?: unknown;
    clientSecret?: unknown;
  };
  if (typeof body.id !== "string" || !body.id) {
    return send(res, 400, { error: { message: t("`id` est requis.") } });
  }
  const base = adresseVue(req);
  if (!base) return send(res, 400, { error: { message: t("Adresse d'instance illisible.") } });

  const resultat = await connecteurs.connecter(body.id, qui.userId, base, {
    clientId: body.clientId,
    clientSecret: body.clientSecret,
  });
  send(res, resultat.ok ? 200 : 400, { ...resultat, etat: await connecteurs.etat() });
}

/** Page rendue au navigateur au retour d'une autorisation. */
function pageRetour(titre: string, message: string, reussi: boolean): string {
  const echapper = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         background:#F9F6EF; color:#161413; }
  @media (prefers-color-scheme: dark) { body { background:#161413; color:#F9F6EF; } }
  main { max-width: 34rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: 0; opacity: .8; }
  .marque { font-size: .75rem; letter-spacing:.08em; text-transform: uppercase; opacity:.5; margin-bottom:1.25rem; }
</style></head>
<body><main>
  <p class="marque">${echapper(nomProduit())}</p>
  <h1>${echapper(reussi ? titre : "Autorisation interrompue")}</h1>
  <p>${echapper(message)}</p>
</main></body></html>`;
}

/**
 * Retour d'autorisation OAuth.
 *
 * **Route publique**, et elle doit l'être : c'est un navigateur qui arrive
 * depuis le service, sans jeton d'instance ni séance. Ce qui la protège est le
 * `state` — tiré au hasard, retenu au départ de la demande, et sans lequel un
 * code ne mène à rien — plus le vérificateur PKCE, qui n'a jamais quitté
 * l'instance. Elle ne rend aucune donnée : une page à lire, et rien d'autre.
 */
async function handleOauthRetour(
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const repondre = (titre: string, message: string, reussi: boolean, statut = 200) => {
    res.writeHead(statut, {
      "Content-Type": "text/html; charset=utf-8",
      ...ENTETES_SECURITE,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    });
    res.end(pageRetour(titre, message, reussi));
  };

  const erreur = url.searchParams.get("error");
  if (erreur) {
    return repondre(
      "Autorisation refusée",
      url.searchParams.get("error_description") ?? "Le service a refusé la demande.",
      false,
      400,
    );
  }

  const code = url.searchParams.get("code");
  const etat = url.searchParams.get("state");
  if (!code || !etat) {
    return repondre("Autorisation interrompue", "La réponse du service est incomplète.", false, 400);
  }

  /*
   * Deux familles d'autorisations reviennent par cette même adresse : les
   * connecteurs d'outils (MCP) et le courrier. Le `state` porte son origine,
   * et c'est lui qui aiguille — l'alternative aurait été une seconde route
   * publique, c'est-à-dire une seconde surface à protéger.
   */
  if (estEtatCourrier(etat)) {
    const r = await acheverCourrier(code, etat);
    if (!r.ok) return repondre("Autorisation interrompue", r.message, false, 400);
    const branchement = await brancherParOauth(r.jetons, r.adresse);
    return repondre(
      branchement.ok ? "Votre boîte est branchée" : "Autorisation interrompue",
      branchement.ok
        ? `${branchement.message} Vous pouvez fermer cette fenêtre et revenir à ${nomProduit()}.`
        : branchement.message,
      branchement.ok,
      branchement.ok ? 200 : 400,
    );
  }

  const resultat = await connecteurs.acheverAutorisation(code, etat);
  repondre(
    resultat.ok ? `${resultat.label ?? "Service"} est branché` : "Autorisation interrompue",
    resultat.ok
      ? `${resultat.message} Vous pouvez fermer cette fenêtre et revenir à ${nomProduit()}.`
      : resultat.message,
    resultat.ok,
    resultat.ok ? 200 : 400,
  );
}

async function handleConnecteurRetirer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as { id?: string };
  if (!body.id) return send(res, 400, { error: { message: t("`id` est requis.") } });

  const resultat = await connecteurs.retirer(body.id, qui.userId);
  send(res, resultat.ok ? 200 : 400, { ...resultat, etat: await connecteurs.etat() });
}

/* ------------------------------ routes usage ---------------------------------- */

/**
 * Consommation du demandeur sur une période.
 *
 * Le compte vient de la séance, jamais de l'URL : aucun paramètre ne permet de
 * demander la consommation d'un autre. Une période inconnue est refusée
 * plutôt que remplacée en silence : l'écran afficherait sinon, sous le titre
 * « aujourd'hui », les chiffres d'un autre intervalle.
 */
async function handleUsage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const periode = url.searchParams.get("periode") ?? "mois";
  if (!usage.estPeriode(periode)) {
    return send(res, 400, {
      error: { message: tf("« periode » doit valoir {0}.", usage.PERIODES.join(", ")) },
    });
  }
  send(res, 200, await usage.rapport(qui.userId, periode));
}

/** Renseigne ou retire le tarif d'un modèle distant. Tracé au journal d'audit. */
async function handleUsageTarif(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = await readJson(req).catch(() => null);
  const resultat = await usage.definirTarif(body, qui.userId);
  if (!resultat.ok) return send(res, 400, { error: { message: resultat.raison } });
  send(res, 200, { ok: true });
}

/* ------------------------- routes contrôle de l'écran ------------------------- */

/**
 * État du contrôle de l'écran : mode, autorisations macOS obtenues, et ce qu'il
 * reste à faire. L'interface s'en sert pour guider l'utilisateur plutôt que
 * d'échouer silencieusement au premier clic.
 */
async function handleComputerStatus(res: http.ServerResponse, qui: Demandeur): Promise<void> {
  send(res, 200, {
    ...(await computer.capability()),
    // Les siennes seulement : l'action porte le texte que l'agent va frapper.
    enAttente: computer.pendingApprovals(qui.userId),
    // Ce que l'installation proposerait si aucun modèle de vision n'est là.
    modeleConseille: autoProvisionEnabled() ? recommendVision(detectHardware()) : null,
  });
}

/** Exécution directe d'une action, pour l'essai depuis les réglages. */
async function handleComputerAction(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  /*
   * Une action sur l'écran doit être rattachée à quelqu'un. Sans séance, sur
   * une instance partagée, n'importe quel poste détenant le jeton pourrait
   * demander une action et se l'approuver lui-même, sans que le journal puisse
   * dire qui.
   */
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as computer.Action;
  if (!body?.action) return send(res, 400, { error: { message: t("`action` est requise.") } });
  const result = await computer.request(body, qui.userId);
  send(res, result.ok ? 200 : 400, result);
}

/**
 * Activer ou désactiver le contrôle de l'écran depuis l'interface (voir
 * `reglagesEcran.ts` pour qui le peut, et quand). Activer redemande le mot de
 * passe, et le code si le second facteur est actif : c'est donner à l'agent la
 * souris et le clavier de la machine. Désactiver ne demande rien, resserrer
 * est toujours permis.
 */
async function handleComputerMode(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const body = (await readJson(req).catch(() => ({}))) as {
    mode?: unknown;
    password?: unknown;
    code?: unknown;
    systeme?: unknown;
  };
  if (body.mode !== "hote" && body.mode !== "sandbox" && body.mode !== "desactive") {
    return send(res, 400, { error: { message: t("`mode` doit valoir « hote », « sandbox » ou « desactive ».") } });
  }
  const possible = modeModifiable(body.mode);
  if (!possible.ok) return send(res, 403, { error: { message: possible.raison } });
  if (body.mode !== "desactive") {
    const refus = await confirmerIdentite(qui.userId, body.password, body.code);
    if (refus) return send(res, refus.statut, { error: { message: refus.reason } });
  }
  const avant = configEcran().mode;
  /*
   * Le système de la machine (Linux ou macOS) se choisit avec le mode. En
   * changer quand la machine tourne : l'ancienne s'arrête d'abord.
   */
  if (body.mode === "sandbox" && (body.systeme === "linux" || body.systeme === "macos") && body.systeme !== systemeMachine()) {
    /*
     * Pas pendant une préparation : `demarrerMachine` rendait la préparation
     * en cours, celle de l'ancien système. On choisissait macOS, le bureau
     * Linux finissait de démarrer, et la machine macOS ne démarrait jamais,
     * alors que le système retenu disait macOS.
     */
    if (preparationMachineEnCours()) {
      return send(res, 409, { error: { message: t("La machine est en cours de préparation : attendez qu'elle ait fini.") } });
    }
    if (body.systeme === "macos" && !(await diagnosticMachine()).macos.possible) {
      return send(res, 400, { error: { message: t("Cet ordinateur ne peut pas faire tourner la machine macOS.") } });
    }
    if (avant === "sandbox") await arreterMachine(qui.userId);
    choisirSysteme(body.systeme);
  }
  await definirModeEcran(body.mode, qui.userId);
  /*
   * La machine suit le mode : choisie, elle démarre (en arrière-plan, la
   * progression se lit sur /helix/machine) ; quittée, elle s'arrête et rend
   * ses 3 Go de mémoire.
   */
  if (body.mode === "sandbox") void demarrerMachine(qui.userId).catch(() => undefined);
  else if (avant === "sandbox") void arreterMachine(qui.userId);
  computer.oublierCapacite();
  send(res, 200, await computer.capability());
}

/* ------------------------------- images -------------------------------- */

/** Ce que la machine peut faire en images, et l'installation en cours. */
async function handleImagesEtat(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  send(res, 200, await images.etatImages());
}

/** Installer, retirer ou choisir un modèle d'images (`modele` : z-image, flux2-klein, qwen-image). */
async function handleImagesInstaller(req: http.IncomingMessage, res: http.ServerResponse, url: URL, action: "installer" | "retirer" | "choisir"): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const body = (await readJson(req).catch(() => ({}))) as { modele?: unknown };
  const id = typeof body.modele === "string" ? body.modele : undefined;
  if (action === "retirer") {
    try {
      await images.desinstallerImages(qui.userId, id);
    } catch (err) {
      return send(res, 409, { error: { message: err instanceof Error ? err.message : String(err) } });
    }
    return send(res, 200, await images.etatImages());
  }
  if (!id) return send(res, 400, { error: { message: t("`modele` est requis.") } });
  if (action === "choisir") {
    if (!images.choisirModele(id)) return send(res, 409, { error: { message: t("Ce modèle n'est pas installé.") } });
    return send(res, 200, await images.etatImages());
  }
  void images.installerImages(qui.userId, id).catch(() => undefined);
  send(res, 202, await images.etatImages());
}

/* ---------------------------- entraînement ----------------------------- */

/**
 * Entraîner un modèle sur ses exemples (entrainement.ts). Une seule entrée :
 * `GET /helix/entrainement` rend l'état de la machine, le travail en cours et
 * les projets de la personne ; le reste suit `/helix/entrainement/<action>`.
 */
async function handleEntrainement(req: http.IncomingMessage, res: http.ServerResponse, url: URL, action: string): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const u = qui.userId;
  const corps = (req.method === "POST" ? await readJson(req).catch(() => ({})) : {}) as Record<string, unknown>;
  try {
    switch (`${req.method} ${action}`) {
      case "GET ":
        return send(res, 200, await entrainement.etat(u));
      case "GET projet":
        return send(res, 200, entrainement.detailProjet(u, url.searchParams.get("id")));
      case "POST installer":
        void entrainement.installer(u).catch(() => undefined);
        return send(res, 202, await entrainement.etat(u));
      case "POST desinstaller":
        entrainement.desinstaller(u);
        return send(res, 200, await entrainement.etat(u));
      case "POST projets":
        return send(res, 200, entrainement.creerProjet(u, corps.nom));
      case "POST renommer":
        return send(res, 200, entrainement.renommer(u, corps.projet, corps.nom));
      case "POST exemples":
        return send(res, 200, entrainement.enregistrerExemples(u, corps.projet, corps.exemples, corps.propositions));
      case "POST importer":
        return send(res, 200, entrainement.importer(u, corps.projet, corps.contenu, corps.nom));
      case "POST generer":
        return send(res, 202, entrainement.generer(u, corps.projet, corps.texte, corps.source));
      case "POST lancer":
        return send(res, 202, entrainement.entrainer(u, corps.projet));
      case "POST arreter":
        return send(res, 200, { arrete: entrainement.arreter(u) });
      case "POST comparer":
        return send(res, 202, entrainement.comparer(u, corps.projet, corps.questions));
      case "POST publier":
        return send(res, 202, entrainement.publier(u, corps.projet));
      case "POST retirer":
        return send(res, 200, await entrainement.retirer(u, corps.projet));
      case "POST supprimer":
        await entrainement.supprimer(u, corps.projet);
        return send(res, 200, { ok: true });
      default:
        return send(res, 404, { error: { message: tf("Route inconnue : {0} {1}", req.method, url.pathname) } });
    }
  } catch (err) {
    const statut = err instanceof entrainement.ErreurEntrainement ? err.statut : 500;
    if (statut === 500) console.error("[gateway] entrainement", err);
    return send(res, statut, { error: { message: err instanceof Error ? err.message : String(err) } });
  }
}

/** Lance une création ; l'écran suit son avancement sur /helix/images/travail/<id>. */
async function handleImagesCreer(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const body = (await readJson(req).catch(() => ({}))) as { description?: unknown; format?: unknown; chat?: unknown };
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
  if (!description) return send(res, 400, { error: { message: t("Décrivez l'image à créer.") } });
  const format = body.format === "portrait" || body.format === "paysage" ? body.format : "carre";
  // Le Chat de la demande : ceux qui le voient verront l'image (images.ts, `imageVisible`).
  const chat = typeof body.chat === "string" && /^[\w-]{1,100}$/.test(body.chat) ? body.chat : undefined;
  try {
    const tr = await images.lancerCreation(description, format, qui.userId, chat);
    send(res, 202, tr);
  } catch (err) {
    send(res, 409, { error: { message: err instanceof Error ? err.message : String(err) } });
  }
}

async function handleImagesTravail(req: http.IncomingMessage, res: http.ServerResponse, url: URL, id: string): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const tr = images.travail(id, qui.userId);
  if (!tr) return send(res, 404, { error: { message: t("Création introuvable.") } });
  send(res, 200, tr);
}

/**
 * Une image créée, pour son auteur et pour qui voit le Chat où elle a été
 * créée (images.ts, `imageVisible`). Tout autre : 404, qu'elle existe ou non.
 */
async function handleImagesFichier(req: http.IncomingMessage, res: http.ServerResponse, url: URL, id: string): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const vue = await images.imageVisible(id, qui);
  if (!vue) return send(res, 404, { error: { message: t("Image introuvable.") } });
  const octets = readFileSync(vue.chemin);
  /*
   * Un collègue ne garde pas l'image en cache : le partage du Chat peut lui
   * être retiré, et l'instance doit alors cesser de la lui servir.
   */
  res.writeHead(200, { "Content-Type": "image/png", "Content-Length": octets.length, ...entetesOrigine(req), ...ENTETES_SECURITE, "Cache-Control": vue.auteur ? "private, max-age=86400" : "no-store" });
  res.end(octets);
}

/* -------------------- import depuis les logiciels du poste -------------------- */

/*
 * Lire les historiques des autres logiciels d'IA du poste (importLocal.ts).
 * Seulement depuis le poste lui-même : ces fichiers sont ceux de la machine
 * qui fait tourner la passerelle, qui n'est la machine de la personne que
 * sur un poste autonome. Une demande venue du réseau est refusée.
 */
const depuisCePoste = (req: http.IncomingMessage) => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress ?? "");

async function handleImportLogiciels(req: http.IncomingMessage, res: http.ServerResponse, url: URL, id?: string): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  if (!depuisCePoste(req)) {
    return send(res, 403, { error: { message: t("L'import depuis les logiciels se fait sur le poste où ils sont installés, pas depuis une instance distante.") } });
  }
  if (!id) return send(res, 200, { logiciels: await logicielsTrouves() });
  /*
   * Par morceaux (importLocal.ts) : GET donne une page de la liste
   * (`?depuis=`), POST le contenu des Chats choisis (`{ cles }`).
   */
  if (req.method === "POST") {
    const body = (await readJson(req).catch(() => ({}))) as { cles?: unknown };
    const cles = Array.isArray(body.cles) ? body.cles.filter((c): c is string => typeof c === "string").slice(0, 500) : [];
    const contenu = await contenuLogiciel(id, cles);
    if (!contenu) return send(res, 404, { error: { message: t("Rien à reprendre de ce logiciel.") } });
    journaliser("import.logiciel", qui.userId, { logiciel: id, chats: contenu.chats.length });
    return send(res, 200, contenu);
  }
  const depuis = Number(url.searchParams.get("depuis") ?? 0);
  const page = await pageLogiciel(id, Number.isFinite(depuis) && depuis >= 0 ? depuis : 0);
  if (!page) return send(res, 404, { error: { message: t("Rien à reprendre de ce logiciel.") } });
  send(res, 200, page);
}

/* ------------------------- machine de l'agent ------------------------- */

/** Ce que l'ordinateur peut porter, l'état de la machine, et la préparation en cours. */
async function handleMachineEtat(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  send(res, 200, { ...(await diagnosticMachine()), progression: progressionMachine() });
}

async function handleMachineAction(req: http.IncomingMessage, res: http.ServerResponse, url: URL, action: "demarrer" | "arreter" | "effacer"): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  /*
   * Effacer rend la place sur le disque (8 Go pour Linux, bien plus pour
   * macOS). Seulement machine non choisie : en service, on la désactive
   * d'abord, pour que l'agent ne perde pas son écran en pleine demande.
   */
  if (action === "effacer") {
    if (configEcran().mode === "sandbox") {
      return send(res, 409, { error: { message: t("Désactivez d'abord la machine de l'agent, puis effacez-la.") } });
    }
    try {
      await effacerMachine(qui.userId);
    } catch (err) {
      return send(res, 409, { error: { message: err instanceof Error ? err.message : String(err) } });
    }
    return send(res, 200, await diagnosticMachine());
  }
  if (action === "arreter") {
    await arreterMachine(qui.userId);
    return send(res, 200, await diagnosticMachine());
  }
  void demarrerMachine(qui.userId).catch(() => undefined);
  send(res, 202, { demarrage: true, progression: progressionMachine() });
}

/**
 * L'écran de la machine, en image, pour le suivre en direct dans Cowork. Ne
 * passe pas par l'approbation : regarder la machine de l'agent n'agit sur rien.
 */
async function handleMachineEcran(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const image = await computer.captureMachine();
  if (!image) return send(res, 503, { error: { message: t("La machine de l'agent ne répond pas.") } });
  res.writeHead(200, { "Content-Type": "image/png", ...entetesOrigine(req), ...ENTETES_SECURITE, "Cache-Control": "no-store" });
  res.end(image);
}

/** Accord ou refus d'une action en attente. */
async function handleComputerApprove(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  // Approuver engage une personne : le journal doit pouvoir la nommer.
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as { id?: string; accord?: boolean };
  if (!body.id) return send(res, 400, { error: { message: t("`id` est requis.") } });
  // Même règle que pour les outils : seul un `true` explicite autorise.
  if (typeof body.accord !== "boolean") {
    return send(res, 400, {
      error: { message: t("`accord` doit valoir true ou false, sans ambiguïté.") },
    });
  }
  const known = computer.resolveApproval(body.id, body.accord, qui.userId);
  send(res, known ? 200 : 404, {
    ok: known,
    message: known ? "Réponse enregistrée." : "Cette demande n'est plus en attente.",
  });
}

/** Flux des demandes d'approbation et des actions exécutées. */
function handleComputerStream(req: http.IncomingMessage, res: http.ServerResponse, qui: Demandeur): void {
  res.writeHead(200, entetesFlux(req));
  const write = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Un poste qui se connecte en cours de route doit voir les demandes déjà
  // posées, sinon l'agent reste bloqué sans que personne ne le sache.
  for (const attente of computer.pendingApprovals(qui.userId)) {
    write({ type: "approbation_demandee", id: attente.id, action: attente.action });
  }

  const off = computer.onApprovalEvent(qui.userId, write);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    off();
    clearInterval(keepAlive);
    res.end();
  });
}

/* ------------------ routes approbation des actions de l'agent ----------------- */

/**
 * Niveau en vigueur et demandes en attente.
 *
 * Le niveau est tenu par la passerelle, pas par le poste : l'interface le lit
 * ici et n'en garde aucune copie qui ferait autorité.
 */
function handleApprobationEtat(res: http.ServerResponse, qui: Demandeur): void {
  send(res, 200, {
    niveau: approbation.niveau(),
    delaiMs: approbation.DELAI,
    // Les siennes seulement : le détail porte le mail entier, destinataires
    // compris, et les chemins des fichiers que l'agent veut toucher.
    enAttente: approbation.enAttente("outil", qui.userId),
  });
}

async function handleApprobationNiveau(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as { niveau?: unknown };
  if (!approbation.estNiveau(body.niveau)) {
    return send(res, 400, {
      error: { message: tf("« niveau » doit valoir {0}.", approbation.NIVEAUX.join(", ")) },
    });
  }

  approbation.definirNiveau(body.niveau, qui.userId);
  send(res, 200, { niveau: approbation.niveau() });
}

/** Accord ou refus d'une action d'outil en attente. */
async function handleApprobationRepondre(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());

  const body = (await readJson(req).catch(() => ({}))) as { id?: string; accord?: unknown };
  if (!body.id) return send(res, 400, { error: { message: t("`id` est requis.") } });

  /*
   * Seul un `true` explicite autorise. Le code lisait `accord !== false`, ce
   * qui approuvait tout ce qui n'était pas exactement `false` : un champ mal
   * nommé, un corps tronqué, une valeur nulle. Un contrôle de sécurité doit
   * échouer en refusant. Mesuré avant correction : un refus envoyé sous un
   * autre nom de champ a laissé l'agent écrire le fichier, et le journal a
   * enregistré une approbation.
   */
  if (typeof body.accord !== "boolean") {
    return send(res, 400, {
      error: { message: t("`accord` doit valoir true ou false, sans ambiguïté.") },
    });
  }

  const connue = approbation.repondre(body.id, body.accord, "outil", qui.userId);
  send(res, connue ? 200 : 404, {
    ok: connue,
    message: connue ? "Réponse enregistrée." : "Cette demande n'est plus en attente.",
  });
}

/** Flux des demandes d'approbation d'outils. */
function handleApprobationFlux(req: http.IncomingMessage, res: http.ServerResponse, qui: Demandeur): void {
  res.writeHead(200, entetesFlux(req));
  const write = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Un poste qui arrive en cours de route doit voir ce qui attend déjà, sinon
  // l'agent reste suspendu sans que personne ne le sache.
  for (const attente of approbation.enAttente("outil", qui.userId)) {
    write({ type: "approbation_demandee", ...attente });
  }

  const off = approbation.surEvenement((event) => {
    if (event.nature !== "outil") return;
    // Le flux portait le mail entier à toute séance qui l'écoutait.
    if (typeof event.pour === "string" && event.pour !== qui.userId) return;
    write(event);
  });
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    off();
    clearInterval(keepAlive);
    res.end();
  });
}

async function handleLoad(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = (await readJson(req).catch(() => ({}))) as { model?: string };
  if (!body.model) return send(res, 400, { error: { message: t("`model` est requis.") } });
  const result = await loadModel(body.model);
  invalidate();
  send(res, result.ok ? 200 : 500, result);
}

/* ----------------------------- modèles cloud par clé ---------------------------- */

/**
 * Clés de fournisseurs de modèles cloud (fournisseurs.ts). La clé entre une
 * fois, à l'essai puis à l'ajout, et ne ressort jamais.
 */
async function handleFournisseurs(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  path: string,
): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const [id, action] = path.split("/").slice(3);
  const corps = async () => {
    const b = await readJson(req).catch(() => ({}));
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  };
  const repondre = <T,>(r: fournisseurs.Resultat<T>, succes: (v: T) => unknown) =>
    r.ok ? send(res, 200, succes(r.valeur)) : send(res, r.statut, { error: { message: r.message } });

  if (!id && req.method === "GET") {
    return send(res, 200, {
      catalogue: fournisseurs.CATALOGUE.map(({ entetes: _e, ...f }) => f),
      cles: await fournisseurs.listerCles(qui.userId),
    });
  }
  if (id === "essayer" && !action && req.method === "POST") {
    const b = await corps();
    return repondre(await fournisseurs.essayerCle(String(b.fournisseur ?? ""), b.adresse, b.cle), (modeles) => ({ modeles }));
  }
  if (!id && req.method === "POST") {
    const r = await fournisseurs.ajouterCle(await corps(), qui.userId);
    invalidate();
    return repondre(r, (cle) => ({ cle }));
  }
  if (id && !action && req.method === "POST") {
    return repondre(await fournisseurs.modifierCle(id, await corps(), qui.userId), (cle) => ({ cle }));
  }
  if (id && action === "supprimer" && req.method === "POST") {
    return repondre(await fournisseurs.retirerCle(id, qui.userId), () => ({ ok: true }));
  }
  send(res, 404, { error: { message: tf("Route inconnue : {0} {1}", req.method, path) } });
}

/* ------------------------------------ groupes ---------------------------------- */

/**
 * Groupes : la liste est l'annuaire de l'équipe, lisible de tous ; chaque
 * membre y est nommé (nom, initiales). Les photos restent dans la liste des
 * comptes, que chaque poste a déjà : les recopier ici alourdirait chaque
 * réponse de dizaines de Ko par personne. Les droits sont vérifiés par groupes.ts.
 */
async function handleGroupes(req: http.IncomingMessage, res: http.ServerResponse, url: URL, path: string): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const [id, action] = path.split("/").slice(3);
  const corps = async () => {
    const b = await readJson(req).catch(() => ({}));
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  };
  const comptes = await publicAccounts();
  const vue = (g: groupes.Groupe) => ({
    ...g,
    membres: g.membres.flatMap((m) => {
      const c = comptes.find((x) => x.id === m);
      return c ? [{ id: c.id, nom: c.fullName, email: c.email, initiales: c.initials }] : [];
    }),
    estMembre: g.membres.includes(qui.userId),
    estResponsable: g.responsables.includes(qui.userId),
  });
  const repondre = <T,>(r: { ok: true; valeur: T } | { ok: false; statut: number; message: string }, succes: (v: T) => unknown) =>
    r.ok ? send(res, 200, succes(r.valeur)) : send(res, r.statut, { error: { message: r.message } });

  if (!id && req.method === "GET") {
    const liste = await groupes.listerGroupes();
    return send(res, 200, {
      groupes: liste.map(vue).sort((a, b) => Number(b.estMembre) - Number(a.estMembre) || a.nom.localeCompare(b.nom, "fr")),
      // L'annuaire, pour choisir des membres : qui existe, sans rien d'autre que ce que l'écran de connexion montre déjà.
      annuaire: comptes.map((c) => ({ id: c.id, nom: c.fullName, email: c.email, initiales: c.initials })),
    });
  }
  if (!id && req.method === "POST") return repondre(await groupes.creerGroupe(await corps(), qui.userId), (g) => ({ groupe: vue(g) }));
  if (id && !action && req.method === "POST") {
    return repondre(await groupes.modifierGroupe(id, await corps(), qui.userId), (g) => ({ groupe: vue(g) }));
  }
  if (id && action === "quitter" && req.method === "POST") return repondre(await groupes.quitterGroupe(id, qui.userId), () => ({ ok: true }));
  if (id && action === "supprimer" && req.method === "POST") {
    return repondre(await groupes.supprimerGroupe(id, qui.userId), () => ({ ok: true }));
  }
  send(res, 404, { error: { message: tf("Route inconnue : {0} {1}", req.method, path) } });
}

/* --------------------------------- bibliothèque -------------------------------- */

async function handleBibliotheque(req: http.IncomingMessage, res: http.ServerResponse, url: URL, path: string): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const moi = { userId: qui.userId, groupes: qui.groupes ?? [] };
  const [id, action] = path.split("/").slice(3);
  const corps = async (max?: number) => {
    const b = await readJson(req, max).catch(() => ({}));
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  };
  const repondre = <T,>(r: { ok: true; valeur: T } | { ok: false; statut: number; message: string }, succes: (v: T) => unknown) =>
    r.ok ? send(res, 200, succes(r.valeur)) : send(res, r.statut, { error: { message: r.message } });

  if (!id && req.method === "GET") {
    return repondre(
      await bibliotheque.lister(moi, {
        vue: url.searchParams.get("vue") ?? undefined,
        dossier: url.searchParams.get("dossier"),
        q: url.searchParams.get("q") ?? undefined,
      }),
      (v) => v,
    );
  }
  if (id === "dossiers" && !action && req.method === "POST") {
    return repondre(await bibliotheque.creerDossier(await corps(), moi), (element) => ({ element }));
  }
  if (id === "documents" && !action && req.method === "POST") {
    if (estEnvoiEnFlux(req)) {
      const envoi = await lireEnvoi(req);
      if (!envoi.ok) return send(res, 400, { error: { message: envoi.message } });
      return repondre(await bibliotheque.importerDocumentEnFlux(envoi.entete, envoi.fichier, moi), (element) => ({ element }));
    }
    const b = await readJson(req, CORPS_DOCUMENT_MAX).catch((err: unknown) => err as Error);
    if (b instanceof Error) {
      return send(res, 413, { error: { message: tf("Document trop lourd pour cet envoi : mettez l'application à jour (jusqu'à {0}).", LIBELLE_DOCUMENT_MAX) } });
    }
    const doc = b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
    return repondre(await bibliotheque.importerDocument(doc, moi), (element) => ({ element }));
  }
  if (id && action === "contenu" && req.method === "GET") {
    const r = await bibliotheque.lireContenu(id, moi);
    if (!r.ok) return send(res, r.statut, { error: { message: r.message } });
    res.writeHead(200, {
      ...entetesOrigine(req),
      ...ENTETES_SECURITE,
      // Jamais interprété par le navigateur : un document partagé ne s'exécute pas dans la page.
      "Content-Type": "application/octet-stream",
      "Content-Length": r.valeur.taille,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.valeur.nom)}`,
      "X-Helix-Type": r.valeur.type,
      "Access-Control-Expose-Headers": "X-Helix-Type",
    });
    return envoyerFlux(res, r.valeur.flux);
  }
  if (id && action === "favori" && req.method === "POST") {
    const b = await corps();
    return repondre(await bibliotheque.marquerFavori(id, b.favori === true, moi), () => ({ ok: true }));
  }
  if (id && action === "supprimer" && req.method === "POST") {
    return repondre(await bibliotheque.supprimerElement(id, moi), (v) => v);
  }
  if (id && !action && req.method === "POST") {
    return repondre(await bibliotheque.modifierElement(id, await corps(), moi), (element) => ({ element }));
  }
  send(res, 404, { error: { message: tf("Route inconnue : {0} {1}", req.method, path) } });
}

/* ---------------------------- bases de connaissances --------------------------- */

async function handleConnaissances(req: http.IncomingMessage, res: http.ServerResponse, url: URL, path: string): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const moi = { userId: qui.userId, groupes: qui.groupes ?? [] };
  const [id, action] = path.split("/").slice(3);
  const corps = async () => {
    const b = await readJson(req).catch(() => ({}));
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  };
  const repondre = <T,>(r: { ok: true; valeur: T } | { ok: false; statut: number; message: string }, succes: (v: T) => unknown) =>
    r.ok ? send(res, 200, succes(r.valeur)) : send(res, r.statut, { error: { message: r.message } });

  if (!id && req.method === "GET") return send(res, 200, { bases: await connaissances.listerBases(moi) });
  if (!id && req.method === "POST") return repondre(await connaissances.creerBase(await corps(), moi), (base) => ({ base }));
  if (id === "documents" && !action && req.method === "GET") {
    return send(res, 200, { documents: await connaissances.documentsDisponibles(moi) });
  }
  // Essayer une question sans passer par le Chat : l'écran de la base, et les vérifications.
  if (id === "chercher" && !action && req.method === "POST") {
    const b = await corps();
    const r = await connaissances.chercher(b.bases, typeof b.question === "string" ? b.question : "", moi, Number(b.nombre) || undefined);
    return send(res, 200, r);
  }
  if (id && !action && req.method === "GET") return repondre(await connaissances.lireBase(id, moi), (base) => ({ base }));
  if (id && !action && req.method === "POST") return repondre(await connaissances.modifierBase(id, await corps(), moi), (base) => ({ base }));
  if (id && action === "supprimer" && req.method === "POST") return repondre(await connaissances.supprimerBase(id, moi), (v) => v);
  if (id && action === "documents" && req.method === "POST") {
    return repondre(await connaissances.ajouterDocuments(id, await corps(), moi), (base) => ({ base }));
  }
  if (id && action === "retirer" && req.method === "POST") return repondre(await connaissances.retirerDocument(id, await corps(), moi), (base) => ({ base }));
  if (id && action === "reindexer" && req.method === "POST") return repondre(await connaissances.reindexer(id, await corps(), moi), (base) => ({ base }));
  send(res, 404, { error: { message: tf("Route inconnue : {0} {1}", req.method, path) } });
}

/* ----------------------------------- réunions ---------------------------------- */

async function handleReunions(req: http.IncomingMessage, res: http.ServerResponse, url: URL, path: string): Promise<void> {
  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  const moi = { userId: qui.userId, groupes: qui.groupes ?? [] };
  const [id, action] = path.split("/").slice(3);
  const corps = async () => {
    const b = await readJson(req).catch(() => ({}));
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  };
  const repondre = <T,>(r: { ok: true; valeur: T } | { ok: false; statut: number; message: string }, succes: (v: T) => unknown) =>
    r.ok ? send(res, 200, succes(r.valeur)) : send(res, r.statut, { error: { message: r.message } });

  if (!id && req.method === "GET") {
    const [liste, reglages, dictee, agenda] = await Promise.all([
      reunions.lister(moi),
      reunions.reglagesDe(qui.userId),
      diagnosticDictee(),
      etatAgenda(),
    ]);
    return send(res, 200, {
      reunions: liste.map((r) => ({ ...r, estProprietaire: r.ownerId === qui.userId })),
      reglages,
      transcription: { installee: dictee.installee, modele: dictee.modele },
      agenda: Boolean(agenda.configure),
    });
  }
  if (!id && req.method === "POST") return repondre(await reunions.creer(await corps(), moi), (reunion) => ({ reunion }));
  if (id === "reglages" && !action) {
    if (req.method === "GET") return send(res, 200, { reglages: await reunions.reglagesDe(qui.userId) });
    if (req.method === "POST") return send(res, 200, { reglages: await reunions.modifierReglages(qui.userId, await corps()) });
  }
  if (id === "a-rejoindre" && !action && req.method === "GET") return send(res, 200, { reunions: await reunions.aRejoindre(moi) });
  if (id && !action && req.method === "GET") return repondre(await reunions.detail(id, moi), (v) => v);
  if (id && !action && req.method === "POST") return repondre(await reunions.modifier(id, await corps(), moi), (reunion) => ({ reunion }));
  if (id && action === "audio" && req.method === "POST") return repondre(await reunions.ajouterAudio(id, req, moi), (v) => v);
  if (id && action === "audio" && req.method === "GET") {
    const r = await reunions.audio(id, moi);
    if (!r.ok) return send(res, r.statut, { error: { message: r.message } });
    res.writeHead(200, { ...entetesOrigine(req), ...ENTETES_SECURITE, "Content-Type": "application/octet-stream", "Content-Length": r.valeur.taille });
    return envoyerFlux(res, r.valeur.flux);
  }
  if (id && action === "etat" && req.method === "POST") return repondre(await reunions.etatBot(id, await corps(), moi), (reunion) => ({ reunion }));
  if (id && action === "terminer" && req.method === "POST") return repondre(await reunions.terminer(id, moi), (reunion) => ({ reunion }));
  if (id && action === "resumer" && req.method === "POST") return repondre(await reunions.resumer(id, moi), (reunion) => ({ reunion }));
  if (id && action === "relancer" && req.method === "POST") return repondre(await reunions.relancer(id, moi), (reunion) => ({ reunion }));
  if (id && action === "supprimer" && req.method === "POST") return repondre(await reunions.supprimer(id, moi), () => ({ ok: true }));
  send(res, 404, { error: { message: tf("Route inconnue : {0} {1}", req.method, path) } });
}

/* ------------------------------ employés OpenClaw ------------------------------ */

/**
 * Employés : visibles de toute l'instance (ce sont des membres de l'équipe),
 * chacun leur parle dans sa propre conversation, seule la personne qui en a
 * déployé un peut le modifier, le mettre en pause ou le retirer. Voir
 * employes.ts pour le déploiement, serveurOutils.ts pour les outils.
 */
async function handleEmployes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  path: string,
): Promise<void> {
  const segments = path.split("/").slice(3); // ["<id>", "message", ...]
  const [id, action, sous, sousAction, quatrieme] = segments;

  // Serveur d'outils : appelé par OpenClaw, sans séance, sur preuve de la clé.
  if (id && action === "outils" && segments.length === 2) {
    const corps = req.method === "POST" ? await readJson(req).catch(() => undefined) : undefined;
    if (!(await servirOutils(req, res, id, corps))) {
      send(res, 403, { error: { message: t("Accès réservé à l'instance des employés.") } });
    }
    return;
  }

  const qui = await demandeur(req, url);
  if (!qui) return send(res, 401, sansSeance());
  // Un agent personnel n'existe que pour son propriétaire : pour les autres, il est introuvable.
  if (id) {
    const cible = await employes.employe(id);
    if (cible && !employes.visiblePar(cible, qui.userId)) {
      return send(res, 404, { error: { message: t("Agent introuvable.") } });
    }
  }
  const corps = async () => {
    const b = await readJson(req).catch(() => ({}));
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  };
  const repondre = <T,>(r: employes.Resultat<T>, succes: (v: T) => unknown) =>
    r.ok
      ? send(res, 200, { ...(succes(r.valeur) as object), ...(r.avertissement ? { avertissement: r.avertissement } : {}) })
      : send(res, r.statut, { error: { message: r.message } });

  // GET /helix/employes : l'équipe, ce qu'on peut leur donner, et l'état du moteur.
  if (!id && req.method === "GET") {
    const comptes = await publicAccounts();
    const liste = (await employes.listerEmployes()).filter((e) => employes.visiblePar(e, qui.userId));
    // Les modèles que cette personne peut donner à un employé : les siens, ceux de l'équipe et de la machine.
    const modeles = (await models(true)).filter(
      (m) => m.roles.includes("chat") && (!m.proprietaire || m.proprietaire === qui.userId),
    );
    const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    // Une mission « à chaque mail » est en place quand une boîte est branchée et qu'il y a accès.
    const boite = outilsDeFamille("courrier").length > 0;
    const vues = await Promise.all(
      liste.map(async (e) => {
        const conso = await consommationDe(auteurEmploye(e.id));
        let jetons = 0;
        for (const [jour, parModele] of Object.entries(conso.jours)) {
          if (jour < depuis) continue;
          for (const l of Object.values(parModele)) jetons += l.entree + l.sortie;
        }
        const estProprietaire = e.ownerId === qui.userId;
        return {
          ...e,
          // Qui est autorisé sur un canal (numéros, identifiants) ne regarde que son propriétaire.
          canaux: (e.canaux ?? []).map((c) =>
            estProprietaire ? { ...c, nom: employes.CANAUX[c.type].nom } : { type: c.type, nom: employes.CANAUX[c.type].nom },
          ),
          missions: e.missions.map(({ tache, ...m }) => ({
            ...m,
            planifiee:
              m.rythme === "a-chaque-mail"
                ? boite && employes.famillesEffectives(e).includes("courrier")
                : Boolean(tache),
          })),
          proprietaire: comptes.find((c) => c.id === e.ownerId)?.fullName ?? "Un ancien membre",
          estProprietaire: e.ownerId === qui.userId,
          jetons30Jours: jetons,
        };
      }),
    );
    return send(res, 200, {
      catalogueCanaux: Object.fromEntries(
        employes.TYPES_CANAUX.map((t) => [t, { nom: employes.CANAUX[t].nom, champs: employes.CANAUX[t].champs, qr: Boolean(employes.CANAUX[t].qr) }]),
      ),
      moteur: await employes.etatMoteur(),
      employes: vues,
      familles: FAMILLES.map((f) => ({ id: f, disponible: outilsDeFamille(f).length > 0 })),
      modeles: modeles.map((m) => ({
        uid: m.uid,
        nom: m.id,
        charge: Boolean(m.loaded),
        origine: m.origine ?? "local",
        pays: m.pays,
        fournisseur: m.fournisseur ?? m.backendLabel,
      })),
    });
  }

  /*
   * Deux réglages désarment une barrière, et tous deux se reconfirment.
   *
   * Le palier « libre » donne à l'employé les commandes de la machine. Et
   * « autonome » lui permet d'agir sans jamais demander : c'est la porte
   * d'approbation elle-même qu'on retire. Seul « libre » était protégé ;
   * rendre un agent autonome ne demandait rien. Comme pour le contrôle de
   * l'écran, on redemande le mot de passe (et le code si la double
   * authentification est active) au moment de l'ouvrir.
   */
  const confirmerReglageSensible = async (
    b: Record<string, unknown>,
    avant?: { liberte?: string; autonome?: boolean },
  ) => {
    const ouvreLibre = b.liberte === "libre" && avant?.liberte !== "libre";
    const ouvreAutonome = b.autonome === true && avant?.autonome !== true;
    if (!ouvreLibre && !ouvreAutonome) return null;
    return confirmerIdentite(qui.userId, b.motDePasse, b.code);
  };

  // POST /helix/employes : déployer.
  if (!id && req.method === "POST") {
    const b = await corps();
    const refus = await confirmerReglageSensible(b);
    if (refus) return send(res, refus.statut, { error: { message: refus.reason } });
    const chat = (await models(true)).filter(
      (m) => m.roles.includes("chat") && (!m.proprietaire || m.proprietaire === qui.userId),
    );
    // Un modèle cloud branché par clé seulement s'il est demandé : il coûte à quelqu'un.
    const gratuits = chat.filter((m) => m.origine !== "cle");
    const choisi =
      chat.find((m) => m.uid === b.modele) ?? gratuits.find((m) => m.loaded) ?? gratuits[0];
    if (!choisi) {
      return send(res, 409, {
        error: { message: t("Aucun modèle de conversation n'est disponible : installez-en un avant de mettre un agent en service.") },
      });
    }
    return repondre(await employes.deployer(b, qui.userId, choisi.uid), (e) => ({ employe: e }));
  }

  if (!id) return send(res, 405, { error: { message: t("Méthode non prise en charge.") } });

  if (!action && req.method === "POST") {
    const b = await corps();
    const actuel = await employes.employe(id);
    if (actuel && actuel.ownerId === qui.userId) {
      const refus = await confirmerReglageSensible(b, actuel);
      if (refus) return send(res, refus.statut, { error: { message: refus.reason } });
    }
    if (typeof b.modele === "string") {
      const m = (await models(true)).find(
        (x) => x.uid === b.modele && x.roles.includes("chat") && (!x.proprietaire || x.proprietaire === qui.userId),
      );
      if (!m) return send(res, 400, { error: { message: t("Ce modèle n'est pas disponible pour vous.") } });
    }
    return repondre(await employes.modifier(id, b, qui.userId), (e) => ({ employe: e }));
  }
  if (action === "supprimer" && req.method === "POST") {
    return repondre(await employes.supprimer(id, qui.userId), () => ({ ok: true }));
  }
  if (action === "message" && !sous && req.method === "POST") {
    const b = await corps();
    return repondre(await employes.parler(id, typeof b.texte === "string" ? b.texte : "", qui.userId), (v) => v);
  }
  if (action === "message" && sous && req.method === "GET") {
    const travail = employes.suivreTravail(sous, qui.userId);
    if (!travail || travail.employe !== id)
      return send(res, 404, { error: { message: t("Message introuvable.") } });
    return send(res, 200, { etat: travail.etat, reponse: travail.reponse ?? null });
  }
  /*
   * Ce que l'agent a fait, et ce qu'on lui a confié, ne regardent que son
   * propriétaire.
   *
   * `visiblePar` ne cache que les agents personnels : un agent d'organisation
   * est visible de tous, ce qui est voulu — chacun peut lui parler. Mais son
   * activité porte le résultat de ses missions, et ses documents portent les
   * noms des fichiers de son propriétaire. Toutes les autres routes de la
   * famille vérifiaient le propriétaire ; ces deux-là avaient été oubliées.
   */
  const sienOuRefus = async (): Promise<boolean> => {
    const cible = await employes.employe(id!);
    if (cible && cible.ownerId !== qui.userId) {
      send(res, 403, { error: { message: t("Cet agent ne vous appartient pas.") } });
      return false;
    }
    return true;
  };

  // Documents de référence de l'agent (voir employes.ts).
  if (action === "documents" && !sous && req.method === "GET") {
    if (!(await sienOuRefus())) return;
    return send(res, 200, { documents: employes.listerDocuments(id) });
  }
  if (action === "documents" && !sous && req.method === "POST") {
    if (estEnvoiEnFlux(req)) {
      const envoi = await lireEnvoi(req);
      if (!envoi.ok) return send(res, 400, { error: { message: envoi.message } });
      return repondre(await employes.ajouterDocumentEnFlux(id, envoi.entete, envoi.fichier, qui.userId), (documents) => ({ documents }));
    }
    const b = await readJson(req, CORPS_DOCUMENT_MAX).catch((err: unknown) => err as Error);
    if (b instanceof Error) {
      return send(res, 413, { error: { message: tf("Document trop lourd pour cet envoi : mettez l'application à jour (jusqu'à {0}).", LIBELLE_DOCUMENT_MAX) } });
    }
    const doc = b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
    return repondre(await employes.ajouterDocument(id, doc, qui.userId), (documents) => ({ documents }));
  }
  if (action === "documents" && sous && sousAction === "supprimer" && req.method === "POST") {
    return repondre(await employes.retirerDocument(id, decodeURIComponent(sous), qui.userId), (documents) => ({ documents }));
  }
  if (action === "echanges" && req.method === "GET") {
    return send(res, 200, {
      echanges: await employes.echanges(qui.userId, id),
      enCours: employes.travailEnCours(id, qui.userId),
    });
  }
  if (action === "activite" && req.method === "GET") {
    if (!(await sienOuRefus())) return;
    return send(res, 200, await employes.activite(id));
  }
  /*
   * POST /helix/employes/<id>/connaissances : ce que l'employé lira
   * réellement dans ces bases (celles qu'on est en train de choisir, à défaut
   * les siennes), et pourquoi pas dans les autres. Même calcul que son outil
   * `connaissances__chercher` (serveurOutils.ts), rien n'est lu ni cherché.
   * Réservé à son propriétaire, comme le reste de sa fiche.
   */
  if (action === "connaissances" && !sous && req.method === "POST") {
    if (!(await sienOuRefus())) return;
    const e = await employes.employe(id);
    if (!e) return send(res, 404, { error: { message: t("Agent introuvable.") } });
    const b = await corps();
    const lecture = employes.lectureDesBases(e);
    const groupesLus = lecture.groupes ? await groupes.groupesDe(e.ownerId) : null;
    const bases = await connaissances.lecturePourEmploye(
      Array.isArray(b.bases) ? b.bases : (e.connaissances ?? []),
      auteurEmploye(e.id),
      groupesLus,
      { userId: qui.userId, groupes: qui.groupes ?? [] },
    );
    return send(res, 200, { ...lecture, bases });
  }
  // Canaux : les brancher, les retirer, lier WhatsApp, accepter les personnes qui écrivent.
  if (action === "canaux" && !sous && req.method === "GET") {
    return send(res, 200, { etat: await employes.etatCanaux(id) });
  }
  if (action === "canaux" && !sous && req.method === "POST") {
    return repondre(await employes.brancherCanal(id, await corps(), qui.userId), (e) => ({ employe: e }));
  }
  if (action === "canaux" && sous && sousAction === "retirer" && req.method === "POST") {
    return repondre(await employes.retirerCanal(id, sous, qui.userId), (e) => ({ employe: e }));
  }
  if (action === "canaux" && sous === "whatsapp" && sousAction === "qr" && req.method === "POST") {
    const b = await corps();
    return repondre(await employes.liaisonWhatsApp(id, qui.userId, b.attendre === true), (v) => v);
  }
  if (action === "demandes" && !sous && req.method === "GET") {
    return repondre(await employes.demandesAcces(id, qui.userId), (demandes) => ({ demandes }));
  }
  if (action === "demandes" && sous && sousAction && quatrieme === "accepter" && req.method === "POST") {
    return repondre(await employes.accepterDemande(id, sous, sousAction, qui.userId), () => ({ ok: true }));
  }
  if (action === "missions" && sous && sousAction === "lancer" && req.method === "POST") {
    const e = await employes.employe(id);
    if (e && e.ownerId !== qui.userId) {
      return send(res, 403, { error: { message: t("Seule la personne qui l'a créé peut lancer ses missions.") } });
    }
    return repondre(await employes.lancerMission(id, sous, qui.userId), () => ({ ok: true }));
  }
  send(res, 404, { error: { message: tf("Route inconnue : {0} {1}", req.method, path) } });
}

/* ---------------------------------- serveur ----------------------------------- */

/*
 * Chiffrement du transport : décidé au démarrage. Une instance ouverte au
 * réseau ne sert jamais en clair (voir tls.ts).
 */
const tls = tlsMaterial();

const handler: http.RequestListener = (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  // La langue de l'auteur de la requête, lisible partout en dessous (langue.ts).
  return avecLangueDe(req.headers, url, () => traiter(req, res, url, path));
};

const traiter = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  path: string,
): unknown => {

  if (req.method === "OPTIONS") {
    /*
     * Préparation CORS. Une origine non reconnue reçoit une réponse sans
     * `Access-Control-Allow-Origin` : le navigateur en conclut que la requête
     * n'est pas permise et ne l'envoie jamais. C'est un refus, pas une erreur —
     * la préparation elle-même reste un 204, comme le veut la spécification.
     */
    res.writeHead(204, {
      ...entetesOrigine(req),
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      /*
       * Tout en-tête que l'écran pose doit figurer ici : sans lui, le
       * navigateur refuse la requête avant même de l'envoyer. X-Helix-Session
       * porte l'identité, X-Helix-Langue la langue de lecture — oublier le
       * second avait coupé toutes les requêtes d'un poste rattaché, y compris
       * celles qui n'avaient rien à voir avec la langue.
       */
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Helix-Session, X-Helix-Langue",
      "Access-Control-Max-Age": "600",
    });
    return res.end();
  }

  // Toute route autre que le contrôle de présence exige le jeton d'instance :
  // la passerelle donne accès aux données, aux fichiers et à l'exécution
  // d'outils, elle ne peut pas être ouverte sur le réseau.
  const authorised = authorise(req, url, path);
  if (!authorised) {
    return send(res, 401, {
      error: {
        message:
          t("Jeton d'instance manquant ou invalide. L'administrateur le fournit avec l'adresse de l'instance."),
      },
    });
  }

  /*
   * Limitation de débit : quelques routes relisent des fichiers entiers ou
   * font tourner un interpréteur, et l'authentification se répète à volonté.
   * On identifie l'appelant par son jeton de séance, à défaut par son adresse
   * (voir debit.ts).
   */
  const entete = req.headers["x-helix-session"];
  const jeton = (typeof entete === "string" ? entete : entete?.[0]) ?? url.searchParams.get("session");
  const appelant = jeton
    ? `s:${createHash("sha256").update(jeton).digest("hex").slice(0, 32)}`
    : `a:${req.socket.remoteAddress ?? "inconnue"}`;
  const debitVerdict = debit.verifier(req.method ?? "", path, appelant);
  if (!debitVerdict.ok) {
    res.setHeader("Retry-After", String(debitVerdict.retenteDans ?? 60));
    return send(res, 429, {
      error: {
        message: tf("Trop de requêtes sur cette route. Réessayez dans {0} seconde{1}.", debitVerdict.retenteDans, (debitVerdict.retenteDans ?? 0) > 1 ? "s" : ""),
      },
    });
  }

  const run = async () => {
    if (req.method === "GET" && (path === "/health" || path === "/")) {
      return handleHealth(res, hasValidToken(req, url));
    }
    /*
     * Barrière commune aux routes d'exécution. Elle est posée avant le routage
     * pour qu'une route ajoutée plus tard ne puisse pas l'oublier par omission.
     */
    if (exigeSeance(req.method ?? "", path) && !(await demandeur(req, url))) {
      return send(res, 401, sansSeance());
    }

    if (req.method === "GET" && path === "/v1/models") return handleModels(req, res, url, true);
    if (req.method === "GET" && path === "/helix/models") return handleModels(req, res, url, false);
    if (req.method === "POST" && path === "/v1/chat/completions")
      return handleChat(req, res, url);
    if (req.method === "POST" && path === "/helix/models/load") return handleLoad(req, res);
    if (req.method === "GET" && path === "/helix/provision") return handleProvisionStatus(res);
    if (req.method === "POST" && path === "/helix/provision/moteur")
      return handleEngineInstall(req, res, url);
    if (req.method === "POST" && path === "/helix/provision/start")
      return handleProvisionStart(req, res);
    if (req.method === "GET" && path === "/helix/provision/stream")
      return handleProvisionStream(req, res);
    if (req.method === "POST" && path === "/helix/auth/create")
      return handleAuthCreate(req, res, url);
    if (req.method === "POST" && path === "/helix/auth/premier-mot-de-passe")
      return handlePremierMotDePasse(req, res);
    if (req.method === "POST" && path === "/helix/auth/verify")
      return handleAuthVerify(req, res);
    if (req.method === "GET" && path === "/helix/export") return handleExport(req, res, url);
    if (req.method === "GET" && path === "/helix/compte/effacement")
      return handleEffacement(req, res, url, "apercu");
    if (req.method === "POST" && path === "/helix/compte/effacer")
      return handleEffacement(req, res, url, "effacer");
    if (req.method === "POST" && path === "/helix/auth/deux-facteurs")
      return handleDeuxFacteurs(req, res);
    if (req.method === "POST" && path === "/helix/auth/deux-facteurs/inscription")
      return handleInscriptionDeuxFacteurs(req, res, "preparer");
    if (req.method === "POST" && path === "/helix/auth/deux-facteurs/inscription/activer")
      return handleInscriptionDeuxFacteurs(req, res, "activer");
    if (req.method === "GET" && path === "/helix/auth/deux-facteurs/etat")
      return handleReglageDeuxFacteurs(req, res, url, "etat");
    if (req.method === "POST" && path === "/helix/auth/deux-facteurs/preparer")
      return handleReglageDeuxFacteurs(req, res, url, "preparer");
    if (req.method === "POST" && path === "/helix/auth/deux-facteurs/activer")
      return handleReglageDeuxFacteurs(req, res, url, "activer");
    if (req.method === "POST" && path === "/helix/auth/deux-facteurs/desactiver")
      return handleReglageDeuxFacteurs(req, res, url, "desactiver");
    if (req.method === "POST" && path === "/helix/auth/deux-facteurs/codes")
      return handleReglageDeuxFacteurs(req, res, url, "codes");
    if (req.method === "POST" && path === "/helix/auth/profil")
      return handleAuthProfil(req, res, url);
    if (req.method === "GET" && path === "/helix/data") return handleDataRevisions(res);
    if (req.method === "GET" && path === "/helix/audit") return handleAudit(req, res, url);
    if (req.method === "GET" && path === "/helix/auth/sessions")
      return handleSessionsList(req, res, url);
    if (req.method === "POST" && path === "/helix/auth/revoke")
      return handleSessionRevoke(req, res, url);
    if (path.startsWith("/helix/data/")) {
      const name = path.slice("/helix/data/".length);
      if (req.method === "GET") return handleDataRead(req, res, url, name);
      if (req.method === "PUT") return handleDataWrite(req, res, url, name);
    }
    if (req.method === "GET" && path === "/helix/code") return handleCodeStatus(res);
    if (req.method === "GET" && path === "/helix/dossiers")
      return handleDossiers(req, res, url);
    if (req.method === "POST" && path === "/helix/code/session")
      return handleCodeSession(req, res);
    if (req.method === "POST" && path === "/helix/code/prompt")
      return handleCodePrompt(req, res);
    if (req.method === "POST" && path === "/helix/code/interrupt")
      return handleCodeInterrupt(req, res);
    /*
     * Sessions de Code de la personne (sessionsCode.ts) : la liste, l'historique
     * d'une session pour la rouvrir, et « retirer de la liste » (la conversation
     * reste chez OpenCode). Séance requise : on ne liste que les siennes.
     */
    if (req.method === "GET" && path === "/helix/code/sessions")
      return avecSeance(req, res, url, (qui) => handleCodeSessions(res, qui.userId));
    if (path.startsWith("/helix/code/sessions/")) {
      const id = path.slice("/helix/code/sessions/".length);
      if (!SESSION_CODE.test(id)) return send(res, 400, { error: { message: t("`sessionID` invalide.") } });
      if (req.method === "GET") return avecSeance(req, res, url, (qui) => handleCodeSessionHistorique(res, qui.userId, id));
      if (req.method === "DELETE") {
        return avecSeance(req, res, url, async (qui) => {
          const ok = await retirerSessionCode(id, qui.userId).catch(() => false);
          send(res, ok ? 200 : 404, ok ? { ok: true } : { error: { message: t("Session de code inconnue.") } });
        });
      }
    }
    /*
     * Serveur d'outils de l'agent de code : appelé par OpenCode, sans séance,
     * sur preuve de la clé écrite dans sa configuration (outilsCode.ts). La
     * personne pour qui il travaille est retrouvée par la passerelle, jamais
     * lue dans la requête.
     */
    if (path === "/helix/code/outils") {
      const corps = req.method === "POST" ? await readJson(req).catch(() => undefined) : undefined;
      if (!(await servirOutilsCode(req, res, corps))) {
        send(res, 403, { error: { message: t("Accès réservé à l'agent de code de l'instance.") } });
      }
      return;
    }
    if (req.method === "GET" && path === "/helix/code/events") {
      /*
       * `sessionID` et non plus `session` : depuis que ce flux exige une séance,
       * les deux se disputaient le même nom dans l'URL. `EventSource` ne pose
       * pas d'en-tête, le jeton de séance voyage donc en `?session=` comme le
       * jeton d'instance en `?token=` — et `searchParams.get("session")` rendait
       * le premier des deux, c'est-à-dire l'identifiant OpenCode. Résultat : la
       * séance n'était jamais résolue et le flux répondait 401 à un poste
       * pourtant connecté. Deux choses différentes, deux noms différents.
       */
      const sessionID = url.searchParams.get("sessionID");
      if (!sessionID) return send(res, 400, { error: { message: t("`sessionID` requis.") } });
      return handleCodeEvents(req, res, sessionID, url);
    }
    if (req.method === "GET" && path === "/helix/computer") return avecSeance(req, res, url, (qui) => handleComputerStatus(res, qui));
    if (req.method === "POST" && path === "/helix/computer/action")
      return handleComputerAction(req, res, url);
    if (req.method === "POST" && path === "/helix/computer/approve")
      return handleComputerApprove(req, res, url);
    if (req.method === "POST" && path === "/helix/computer/mode")
      return handleComputerMode(req, res, url);
    if (req.method === "GET" && path === "/helix/machine") return handleMachineEtat(req, res, url);
    if (req.method === "POST" && path === "/helix/machine/demarrer") return handleMachineAction(req, res, url, "demarrer");
    if (req.method === "POST" && path === "/helix/machine/arreter") return handleMachineAction(req, res, url, "arreter");
    if (req.method === "POST" && path === "/helix/machine/effacer") return handleMachineAction(req, res, url, "effacer");
    if (req.method === "GET" && path === "/helix/machine/ecran") return handleMachineEcran(req, res, url);
    if (req.method === "GET" && path === "/helix/images") return handleImagesEtat(req, res, url);
    if (routeEntrainement(path)) return handleEntrainement(req, res, url, path === "/helix/entrainement" ? "" : path.slice("/helix/entrainement/".length));
    if (req.method === "GET" && path === "/helix/import/logiciels") return handleImportLogiciels(req, res, url);
    if ((req.method === "GET" || req.method === "POST") && path.startsWith("/helix/import/logiciel/")) return handleImportLogiciels(req, res, url, path.slice("/helix/import/logiciel/".length));
    if (req.method === "POST" && path === "/helix/images/installer") return handleImagesInstaller(req, res, url, "installer");
    if (req.method === "POST" && path === "/helix/images/desinstaller") return handleImagesInstaller(req, res, url, "retirer");
    if (req.method === "POST" && path === "/helix/images/choisir") return handleImagesInstaller(req, res, url, "choisir");
    if (req.method === "POST" && path === "/helix/images/creer") return handleImagesCreer(req, res, url);
    if (req.method === "GET" && path.startsWith("/helix/images/travail/")) return handleImagesTravail(req, res, url, path.slice("/helix/images/travail/".length));
    if (req.method === "GET" && path.startsWith("/helix/images/fichier/")) return handleImagesFichier(req, res, url, path.slice("/helix/images/fichier/".length));
    if (req.method === "GET" && path === "/helix/computer/events")
      return avecSeance(req, res, url, (qui) => handleComputerStream(req, res, qui));

    if (req.method === "GET" && path === "/helix/approbation")
      return avecSeance(req, res, url, (qui) => handleApprobationEtat(res, qui));
    if (req.method === "POST" && path === "/helix/approbation/niveau")
      return handleApprobationNiveau(req, res, url);
    if (req.method === "POST" && path === "/helix/approbation/repondre")
      return handleApprobationRepondre(req, res, url);
    if (req.method === "GET" && path === "/helix/approbation/evenements")
      return avecSeance(req, res, url, (qui) => handleApprobationFlux(req, res, qui));

    if (req.method === "GET" && path === "/helix/atelier")
      return handleAtelierDiagnostic(res);
    if (req.method === "POST" && path === "/helix/atelier/preparer")
      return handleAtelierPreparer(req, res);
    if (req.method === "POST" && path === "/helix/atelier/verifier")
      return handleAtelierVerifier(res);

    if (req.method === "GET" && path === "/helix/dictee") return handleDicteeEtat(res);
    if (req.method === "POST" && path === "/helix/dictee/installer")
      return handleDicteeInstaller(req, res, url);
    if (req.method === "POST" && path === "/helix/dictee") return handleDictee(req, res, url);

    if (req.method === "GET" && path === "/helix/courrier")
      return handleCourrierEtat(res, url);
    if (req.method === "POST" && path === "/helix/courrier/configurer")
      return handleCourrierConfigurer(req, res, url);
    if (req.method === "POST" && path === "/helix/courrier/oauth")
      return handleCourrierOauth(req, res, url);
    if (req.method === "POST" && path === "/helix/courrier/envoi")
      return handleCourrierEnvoi(req, res, url);
    if (req.method === "POST" && path === "/helix/courrier/confirmation")
      return handleCourrierConfirmation(req, res, url);
    if (req.method === "POST" && path === "/helix/courrier/oublier")
      return handleCourrierOublier(req, res, url);

    if (req.method === "GET" && path === "/helix/agenda") return handleAgendaEtat(res, url);
    if (req.method === "POST" && path === "/helix/agenda/configurer")
      return handleAgendaConfigurer(req, res, url);
    if (req.method === "POST" && path === "/helix/agenda/oublier")
      return handleAgendaOublier(req, res, url);

    if (req.method === "GET" && path === "/helix/drive") return handleDriveEtat(res);
    if (req.method === "POST" && path === "/helix/drive/connecter")
      return handleDriveConnecter(req, res, url);
    if (req.method === "POST" && path === "/helix/drive/code") return handleDriveCode(req, res, url);
    if (req.method === "POST" && path === "/helix/drive/oublier")
      return handleDriveOublier(req, res, url);
    if (req.method === "GET" && path === "/helix/slack") return handleSlackEtat(res);
    if (req.method === "POST" && path === "/helix/slack/configurer")
      return handleSlackConfigurer(req, res, url);
    if (req.method === "POST" && path === "/helix/slack/oublier")
      return handleSlackOublier(req, res, url);

    /*
     * Billet d'ouverture de flux : une requête normale, avec ses en-têtes, qui
     * rend une valeur à usage unique et d'une minute. Elle remplace les deux
     * jetons dans l'adresse des flux d'évènements (flux.ts).
     */
    /*
     * Téléchargement direct de l'application (telechargement.ts).
     *
     * L'état et la préparation passent par une séance, comme le reste. Le
     * fichier lui-même s'ouvre dans le navigateur, qui ne sait pas poser
     * d'en-tête sur un lien : il se présente donc avec un billet d'une minute
     * et d'un seul usage (`?flux=`), exactement comme les flux d'évènements.
     */
    if (req.method === "GET" && path === "/helix/telecharger") {
      return avecSeance(req, res, url, () => {
        send(res, 200, {
          paquets: (["macos", "windows", "linux"] as const).map((p) => telechargement.etat(p)),
        });
      });
    }
    if (req.method === "POST" && path === "/helix/telecharger/macos/preparer") {
      return avecSeance(req, res, url, async () => {
        const r = await telechargement.preparer();
        send(res, r.ok ? 200 : 503, r.ok ? { ok: true, etat: telechargement.etat("macos") } : { error: { message: r.message } });
      });
    }
    {
      const telecharger = /^\/helix\/telecharger\/(macos|windows|linux)$/.exec(path);
      if (req.method === "GET" && telecharger) {
        return avecSeance(req, res, url, () =>
          telechargement.servir(res, telecharger[1] as telechargement.Plateforme),
        );
      }
    }

    if (req.method === "POST" && path === "/helix/flux/ticket") {
      return avecSeance(req, res, url, (qui) => {
        const { billet, expireDansMs } = flux.creer(qui.userId);
        send(res, 200, { billet, expireDansMs });
      });
    }

    if (req.method === "GET" && path === "/helix/mcp") return handleMcpStatus(res);
    if (req.method === "POST" && path === "/helix/mcp/toggle") return handleMcpToggle(req, res);
    if (req.method === "POST" && path === "/helix/mcp/workspace")
      return handleWorkspace(req, res, url);

    if (req.method === "GET" && path === "/helix/connecteurs")
      return handleConnecteursEtat(res);
    if (req.method === "POST" && path === "/helix/connecteurs/ajouter")
      return handleConnecteurAjouter(req, res, url);
    if (req.method === "GET" && path === "/helix/reseau")
      return avecSeance(req, res, url, (qui) => handleReseauEtat(res, qui));
    if (req.method === "POST" && path === "/helix/reseau")
      return handleReseauRegler(req, res, url);

    if (req.method === "POST" && path === "/helix/invitations/inviter")
      return handleInviter(req, res, url);
    if (path === "/helix/invitations" && (req.method === "GET" || req.method === "POST"))
      return handleInvitations(req, res, url);
    if (req.method === "POST" && path === "/helix/invitations/rejoindre")
      return handleRejoindre(req, res);

    if (req.method === "POST" && path === "/helix/connecteurs/connecter")
      return handleConnecteurConnecter(req, res, url);
    if (req.method === "POST" && path === "/helix/connecteurs/retirer")
      return handleConnecteurRetirer(req, res, url);
    if (req.method === "GET" && path === "/helix/oauth/retour")
      return handleOauthRetour(res, url);
    if (req.method === "GET" && path === "/helix/outils") return handleOutils(res);

    if (path === "/helix/employes" || path.startsWith("/helix/employes/")) {
      return handleEmployes(req, res, url, path);
    }
    if (routeFournisseur(path)) return handleFournisseurs(req, res, url, path);
    if (routeGroupe(path)) return handleGroupes(req, res, url, path);
    if (routeBibliotheque(path)) return handleBibliotheque(req, res, url, path);
    if (routeConnaissances(path)) return handleConnaissances(req, res, url, path);
    if (routeReunion(path)) return handleReunions(req, res, url, path);
    if (req.method === "GET" && path === "/helix/espace") {
      const r = listerEspace(url.searchParams.get("chemin") ?? "");
      return r.ok ? send(res, 200, r.valeur) : send(res, r.statut, { error: { message: r.message } });
    }
    if (req.method === "GET" && path === "/helix/espace/fichier") {
      const r = lireFichierEspace(url.searchParams.get("chemin") ?? "");
      if (!r.ok) return send(res, r.statut, { error: { message: r.message } });
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": r.valeur.taille,
        ...entetesOrigine(req),
        ...ENTETES_SECURITE,
      });
      return envoyerFlux(res, r.valeur.flux);
    }
    if (req.method === "POST" && path === "/helix/openclaw/installer") {
      const qui = await demandeur(req, url);
      if (!qui) return send(res, 401, sansSeance());
      /*
       * Déjà installé : c'est une mise à jour, vers la version éprouvée, et
       * seulement vers une version plus récente (OpenClaw fait migrer sa base :
       * une version plus ancienne ne pourrait plus l'ouvrir).
       */
      const avant = await employes.etatMoteur();
      if (avant.installe && !avant.miseAJour) {
        return send(res, 409, { error: { message: tf("OpenClaw {0} est déjà à jour.", avant.version) } });
      }
      if (avant.installe) installerOpenClaw(qui.userId, employes.crochetsMiseAJour, avant.version);
      else installerOpenClaw(qui.userId, employes.crochetsInstallation);
      return send(res, 202, { installation: etatInstallation() });
    }

    if (req.method === "GET" && path === "/helix/usage") return handleUsage(req, res, url);
    if (req.method === "POST" && path === "/helix/usage/tarif")
      return handleUsageTarif(req, res, url);
    send(res, 404, { error: { message: tf("Route inconnue : {0} {1}", req.method, path) } });
  };

  run().catch((err) => {
    /*
     * Une exception imprévue ne se raconte pas au client.
     *
     * Son message porte des chemins absolus de la machine hôte, des erreurs
     * d'OpenSSL, des messages de la base — de quoi dresser la carte du serveur
     * en provoquant des erreurs. Le détail va au journal de l'instance, que
     * son administrateur lit ; le client reçoit un numéro pour qu'on puisse
     * retrouver la ligne correspondante.
     */
    const reference = randomBytes(4).toString("hex");
    console.error(`[gateway] ${reference}`, err);
    if (!res.headersSent) {
      send(res, 500, {
        error: {
          message: tf("Erreur interne de l'instance (référence {0}). Le détail est dans le journal du serveur.", reference),
        },
      });
    } else {
      res.end();
    }
  });
};

const server = tls
  ? https.createServer({ cert: tls.cert, key: tls.key }, handler)
  : http.createServer(handler);
/*
 * Node coupe par défaut toute requête dont le corps n'est pas arrivé en cinq
 * minutes : un document d'un gigaoctet envoyé à une instance distante, sur une
 * connexion ordinaire, échouait donc à coup sûr. Deux heures laissent passer
 * un gros envoi lent ; les en-têtes, eux, restent bornés à une minute.
 */
server.requestTimeout = 2 * 60 * 60 * 1000;
server.headersTimeout = 60_000;

/*
 * Arrêt propre. Fermer Helix doit tout refermer : le serveur OpenCode, et le
 * moteur de modèles si c'est nous qui l'avions démarré. Sans cela, un modèle de
 * plusieurs gigaoctets resterait en mémoire après la fermeture de la fenêtre.
 */
let arretEnCours = false;
function arreterProprement(): void {
  if (arretEnCours) return;
  arretEnCours = true;
  stopCodeServer();
  // Un entraînement orphelin garderait plusieurs Go de mémoire graphique.
  entrainement.arreterEnPartant();
  stopLmStudioIfStarted();
  employes.arreterEmployes();
  // La machine de l'agent garderait 3 Go de mémoire après la fermeture.
  if (configEcran().mode === "sandbox") arreterMachineEnPartant();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    arreterProprement();
    process.exit(0);
  });
}
process.on("exit", arreterProprement);

/*
 * Le magasin est remis sous sa forme chiffrée actuelle **avant** la première
 * requête : une réécriture qui croiserait l'écriture d'un poste pourrait
 * remettre l'ancienne valeur par-dessus la nouvelle. Une base injoignable ne
 * doit pas pour autant empêcher l'instance de démarrer et de le dire : au-delà
 * du délai, on écoute quand même, et les routes rendront l'erreur de la base.
 */
const DELAI_MIGRATION_MS = 15_000;

async function preparerMagasin(): Promise<void> {
  let delai: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      migrerChiffrement().then(({ reecrites }) => {
        if (reecrites.length > 0) {
          console.log(`[helix] chiffrement appliqué à : ${reecrites.join(", ")}.`);
        }
      }),
      new Promise<void>((resolve) => {
        delai = setTimeout(() => {
          console.warn("[helix] la base tarde à répondre : démarrage sans attendre la migration du chiffrement.");
          resolve();
        }, DELAI_MIGRATION_MS);
      }),
    ]);
  } catch (err) {
    console.warn(
      `[helix] migration du chiffrement interrompue : ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(delai);
  }
  // Le mode d'écran choisi dans l'interface doit être connu avant la première
  // requête, même si la migration a échoué : il ne lève jamais d'erreur.
  await chargerReglagesEcran();
  // Mode « machine de l'agent » choisi : elle démarre avec l'instance, sans attendre la première demande.
  if (configEcran().mode === "sandbox") void demarrerMachine().catch(() => undefined);
  // Les clés de modèles cloud doivent être des backends dès la première requête.
  await fournisseurs.chargerFournisseurs().catch(() => undefined);
}

void preparerMagasin().then(() => server.listen(PORT, HOST, () => {
  const schema = tls ? "https" : "http";
  console.log(`[helix-gateway] écoute sur ${schema}://${HOST}:${PORT}`);
  if (HOST === "127.0.0.1") {
    console.log("  (boucle locale uniquement — « share »: true pour ouvrir au réseau)");
  }
  if (tls?.autoSigne) {
    console.log(
      "  TLS auto-signé : le trafic est chiffré, mais les postes devront " +
        "accepter ce certificat. Pour une instance exposée durablement, " +
        "fournissez le vôtre via « tls » dans helix.config.json.",
    );
  } else if (tls) {
    console.log(`  TLS : certificat fourni (${tls.chemin}).`);
  }
  /*
   * Le jeton n'est plus imprimé.
   *
   * Il donne accès à l'instance. Sur la sortie standard, il finit dans le
   * journal de `launchd` ou de `systemd` — un fichier lisible bien plus
   * largement que celui, en 0600, prévu pour lui. On dit donc où il est, pas
   * ce qu'il est. Le fichier est de toute façon le seul endroit où le lire.
   */
  instanceToken(); // le crée au premier démarrage
  console.log(`  jeton d'instance : ${cheminDuJeton()}`);
  discover()
    .then(({ backends, models }) => {
      for (const b of backends) {
        console.log(
          `  ${b.online ? "✓" : "✗"} ${b.label.padEnd(14)} ${b.baseUrl}` +
            (b.online ? `  (${b.modelCount} modèles, ${b.latencyMs} ms)` : `  ${b.error ?? ""}`),
        );
      }
      console.log(`  → ${models.length} modèle(s) exposé(s).`);
    })
    .catch(() => {});

  /*
   * Le connecteur courrier construit sa liste d'outils sans attendre, parce que
   * chat.ts la demande au montage de chaque conversation. Sans cette lecture au
   * démarrage, la première conversation ouverte après un redémarrage se verrait
   * proposer une liste vide alors qu'une boîte est bel et bien connectée.
   *
   * Le connecteur agenda a exactement la même contrainte, pour la même raison.
   */
  void chargerCourrier().catch(() => {});
  // Indexation des bases de connaissances interrompue par un arrêt : elle reprend.
  connaissances.demarrer();
  void chargerAgenda().catch(() => {});
  // Google Drive et Slack : même contrainte, même raison (drive.ts, slack.ts).
  void drive.charger().catch(() => {});
  void slack.charger().catch(() => {});

  /*
   * Les connecteurs branchés se redéclarent **avant** le démarrage automatique :
   * sinon la passerelle ne relancerait que le serveur de fichiers, et Notion,
   * branché la veille, aurait silencieusement disparu de la liste d'outils.
   */
  connecteurs
    .charger()
    .catch(() => {})
    .then(() => startAutoServers())
    .then(() => {
      const servers = mcpStatus();
      const tools = servers.reduce((n, s) => n + s.toolCount, 0);
      console.log(`  → MCP : ${servers.filter((s) => s.running).length} serveur(s), ${tools} outil(s). Espace de travail : ${workspace()}`);
    })
    .catch(() => {})
    // Les employés en dernier : leur fiche de poste nomme les outils, qui doivent être là.
    .then(() => demarrerEmployes())
    .catch((err: unknown) => {
      console.warn(`[helix] employés non démarrés : ${err instanceof Error ? err.message : String(err)}`);
    });
}));

/**
 * L'instance OpenClaw des employés parle à la passerelle par la boucle locale.
 *
 * Quand la passerelle sert en TLS, un certificat fourni ne couvre en général
 * que le nom public de l'instance, pas 127.0.0.1 : OpenClaw le refuserait. Une
 * seconde écoute, en clair et sur la boucle locale seulement, sur un port tiré
 * au hasard, lui est donc réservée. Rien n'y passe qui ne passe déjà en clair
 * sur une instance non partagée (même machine), et le jeton y reste exigé.
 */
async function demarrerEmployes(): Promise<void> {
  let url = `http://127.0.0.1:${PORT}`;
  if (tls) {
    const interne = http.createServer(handler);
    await new Promise<void>((resolve) => interne.listen(0, "127.0.0.1", resolve));
    const adresse = interne.address();
    if (adresse && typeof adresse === "object") url = `http://127.0.0.1:${adresse.port}`;
  }
  employes.connaitrePasserelle({ url, jeton: instanceToken() });
  // Missions « à chaque mail reçu » : la boîte est relevée même si aucune n'existe encore (le tour ne lit rien alors).
  employes.demarrerDeclencheurCourrier();
  // Réunions dont la transcription a été interrompue par un arrêt : elles reprennent.
  void reunions.reprendreAuDemarrage().catch(() => undefined);
  await employes.assurerMarche();
  const etat = await employes.etatMoteur();
  if (etat.enMarche) console.log(`  → employés : OpenClaw ${etat.version} en marche.`);
}
