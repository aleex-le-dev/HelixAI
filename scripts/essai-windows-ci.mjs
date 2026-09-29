/*
 * Essai Windows de bout en bout, sur une vraie machine Windows jetable
 * (GitHub Actions, .github/workflows/essai-windows.yml), 28/09/2026.
 *
 * ── Mode d'emploi ───────────────────────────────────────────────────────────
 *
 *   npm run build
 *   npx electron-builder --win dir --x64 --publish never   (HELIX_SANS_CLE_EDITEUR=1)
 *   set HELIX_ESSAI_MACHINE_JETABLE=1
 *   node scripts/essai-windows-ci.mjs [--app release\win-unpacked\Helix.exe]
 *                                     [--modele qwen3-1.7b] [--sortie essai-windows-sortie]
 *                                     [--delai-minutes 45]
 *
 * Code de sortie : 0 si tout est passé, 1 si une étape a échoué, 2 si l'essai
 * refuse de tourner (pas Windows, machine non déclarée jetable, application
 * introuvable).
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * La 2026.928.6 a cassé la mise en route des modèles locaux sous Windows chez
 * plusieurs personnes (PROJET.md § 3.21), et rien n'avait jamais été essayé
 * sur un vrai Windows. Cet essai fait le parcours d'une personne, avec
 * l'APPLICATION EMPAQUETÉE (`win-unpacked\Helix.exe`) : le défaut « Timed out
 * waiting for LM Studio daemon to start » n'existe que lorsque la passerelle
 * vit dans le `utilityProcess` d'Electron, jamais avec `node gateway/src`.
 *
 *  1. l'application démarre, sa passerelle répond (`/health`) ;
 *  2. le compte administrateur est créé (instance neuve), comme au premier
 *     lancement ;
 *  3. le moteur est installé comme par le bouton « Installer le moteur » de
 *     l'écran de mise en route (`POST /helix/provision/moteur`), conditions de
 *     LM Studio acceptées (accord de Medhi du 28/09/2026, pour cet usage
 *     interne de test), avec le plus léger des modèles (`model`, pour limiter
 *     le téléchargement), puis suivi jusqu'à « prêt » ;
 *  4. une question au Chat (`/v1/chat/completions`, modèle local, en flux) :
 *     une réponse non vide et lisible ;
 *  5. le lendemain : l'application quittée, le service de LM Studio arrêté
 *     (comme après un redémarrage de la machine), l'application rouverte, et
 *     la même question : c'est là que le service doit être relevé par
 *     l'application empaquetée ;
 *  6. la réflexion du modèle (29/09/2026) : le flux brut d'une question qui
 *     fait réfléchir, au moteur seul, par le relais et par le Chat de Helix,
 *     pour le modèle de l'essai et `--reflexion-modeles` (scripts/essai-reflexion-ci.mjs) ;
 *  7. réussi ou non, dans `--sortie` : le journal de cet essai, celui de
 *     l'application (sa sortie), `passerelle.log`, la liste de
 *     `%USERPROFILE%\.lmstudio` et le contenu des `*install-location.json`.
 *
 * ── Ce que l'essai touche ───────────────────────────────────────────────────
 *
 * Données et profil de l'application : jetables (`HELIX_DATA_DIR`,
 * `HELIX_PROFIL_ESSAI`, clé en fichier par `HELIX_CONFIG`), dans le dossier
 * temporaire. Mais le moteur de LM Studio s'installe là où il s'installe chez
 * tout le monde, dans `%USERPROFILE%\.lmstudio`, et ses conditions sont
 * acceptées : d'où `HELIX_ESSAI_MACHINE_JETABLE=1`, exigé pour ne jamais le
 * lancer par mégarde sur un vrai poste.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { essaiReflexion } from "./essai-reflexion-ci.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const option = (nom, defaut) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
};
const APP = resolve(option("app", join(RACINE, "release", "win-unpacked", "Helix.exe")));
const MODELE = option("modele", "qwen3-1.7b");
const SORTIE = resolve(option("sortie", join(RACINE, "essai-windows-sortie")));
const DELAI_MS = Number(option("delai-minutes", "45")) * 60_000;
// La réflexion est essayée sur le modèle de l'essai, puis sur ceux-ci (Qwen3.5 : gabarit qui ouvre lui-même `<think>`).
const MODELES_REFLEXION = [...new Set([MODELE, ...option("reflexion-modeles", "qwen/qwen3.5-2b").split(",").filter(Boolean)])];
const PORT = 8787;
const G = `http://127.0.0.1:${PORT}`;

if (process.platform !== "win32") {
  console.log("Essai prévu pour Windows seulement (application win-unpacked, moteur de LM Studio pour Windows).");
  process.exit(2);
}
if (process.env.HELIX_ESSAI_MACHINE_JETABLE !== "1") {
  console.log(
    "Cet essai installe le moteur de LM Studio dans %USERPROFILE%\\.lmstudio et en accepte les conditions : " +
      "il ne tourne que sur une machine jetable, déclarée par HELIX_ESSAI_MACHINE_JETABLE=1.",
  );
  process.exit(2);
}
if (!existsSync(APP)) {
  console.log(`Application introuvable : ${APP} (npx electron-builder --win dir --x64 d'abord).`);
  process.exit(2);
}

mkdirSync(SORTIE, { recursive: true });
const journalEssai = createWriteStream(join(SORTIE, "essai.log"), { flags: "w" });
const debut = Date.now();
const horodatage = () => `[${((Date.now() - debut) / 1000).toFixed(0).padStart(5)} s]`;
const dire = (texte) => {
  const ligne = `${horodatage()} ${texte}`;
  console.log(ligne);
  journalEssai.write(`${ligne}\n`);
};

let reussis = 0;
const echecs = [];
const verifier = (nom, ok, obtenu) => {
  if (ok) {
    reussis++;
    dire(`  ✓ ${nom}`);
  } else {
    echecs.push(nom);
    dire(`  ✗ ${nom}  —  obtenu : ${String(obtenu).slice(0, 1500)}`);
  }
  return ok;
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Le poste jetable ───────────────────────────────────────────────────── */

const TMP = join(process.env.RUNNER_TEMP || tmpdir(), `helix-essai-windows-${Date.now()}`);
const DONNEES = join(TMP, "donnees");
const PROFIL = join(TMP, "profil-application");
for (const d of [DONNEES, PROFIL]) mkdirSync(d, { recursive: true });
const CONFIG = join(TMP, "helix.config.json");
writeFileSync(CONFIG, JSON.stringify({ chiffrement: "fichier" }));
const LMSTUDIO = join(homedir(), ".lmstudio");

let application = null;
/** La sortie du lancement en cours de l'application. */
let sortieApplication = "";
const journalApplication = createWriteStream(join(SORTIE, "application.log"), { flags: "w" });

function lancerApplication() {
  dire(`Lancement de ${APP}`);
  application = spawn(APP, [], {
    cwd: dirname(APP),
    env: {
      ...process.env,
      HELIX_DATA_DIR: DONNEES,
      HELIX_CONFIG: CONFIG,
      HELIX_PROFIL_ESSAI: PROFIL,
      // L'application lit le jeton de l'instance ici (main.cjs) : le même que la passerelle écrit dans HELIX_DATA_DIR.
      HELIX_TOKEN_FILE: join(DONNEES, "instance-token"),
      // Aucune mise à jour cherchée ni posée pendant l'essai.
      HELIX_SANS_MISE_A_JOUR: "1",
      // La sortie de Chromium aussi, dans le journal de l'application.
      ELECTRON_ENABLE_LOGGING: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  sortieApplication = "";
  const garder = (b) => {
    journalApplication.write(b);
    sortieApplication += b;
  };
  application.stdout.on("data", garder);
  application.stderr.on("data", garder);
  application.on("exit", (code, signal) => dire(`L'application s'est arrêtée (code ${code ?? signal}).`));
}

function arreterApplication() {
  if (!application || application.exitCode !== null) return;
  // Par son chemin dans System32 : l'arbre entier (passerelle et ce qu'elle a lancé).
  const taskkill = join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
  spawnSync(taskkill, ["/pid", String(application.pid), "/T", "/F"], { stdio: "ignore" });
}

/* ── La passerelle, comme l'écran l'appelle ─────────────────────────────── */

let JETON = "";
let SEANCE = "";
const entetes = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${JETON}`,
  "X-Helix-Langue": "fr",
  ...(SEANCE ? { "X-Helix-Session": SEANCE } : {}),
});
async function appel(chemin, corps, delaiMs = 30_000) {
  const r = await fetch(`${G}${chemin}`, {
    method: corps === undefined ? "GET" : "POST",
    headers: entetes(),
    body: corps === undefined ? undefined : JSON.stringify(corps),
    signal: AbortSignal.timeout(delaiMs),
  });
  const texte = await r.text();
  let json = {};
  try {
    json = JSON.parse(texte);
  } catch {
    /* pas du JSON */
  }
  return { statut: r.status, json, texte };
}

async function etapes() {
  /* 1. L'application et sa passerelle */
  dire("1. L'application empaquetée démarre, sa passerelle répond");
  if (!(await demarrerEtAttendre())) return;
  const fichierJeton = join(DONNEES, "instance-token");
  for (let i = 0; i < 20 && !existsSync(fichierJeton); i++) await attendre(500);
  JETON = existsSync(fichierJeton) ? readFileSync(fichierJeton, "utf8").trim() : "";
  if (!verifier("le jeton de l'instance est écrit dans les données jetables", Boolean(JETON), fichierJeton)) return;

  /* 2. Le compte administrateur */
  dire("2. Le compte administrateur (instance neuve)");
  // Mot de passe tiré au hasard à chaque essai, jamais écrit nulle part : il ne sert qu'à cette instance jetable.
  const motDePasse = `Essai-${randomBytes(12).toString("base64url")}-9a`;
  const compte = await appel("/helix/auth/create", { fullName: "Administrateur essai", email: "admin@essai-windows.test", password: motDePasse });
  SEANCE = compte.json.session?.token ?? "";
  if (!verifier("le premier compte est créé, et sa séance ouverte", compte.statut === 200 && Boolean(SEANCE), `${compte.statut} ${compte.texte.slice(0, 300)}`)) return;

  /* 3. Le moteur, puis le modèle */
  dire("3. L'écran de mise en route : le moteur, puis le modèle");
  const avant = await appel("/helix/provision");
  dire(`   machine : ${JSON.stringify(avant.json.hardware)}`);
  dire(`   conseillé : ${avant.json.recommended?.key} ; moteur : ${avant.json.moteur} ; déjà installé : ${avant.json.moteurInstalle}`);
  dire(`   possibles : ${(avant.json.possibles ?? []).map((m) => m.key).join(", ")}`);
  verifier("l'écran de mise en route propose LM Studio, pas encore installé", avant.statut === 200 && avant.json.moteur === "lmstudio" && avant.json.moteurInstalle === false, avant.texte.slice(0, 400));
  verifier(`${MODELE} fait partie des modèles proposés pour cette machine`, (avant.json.possibles ?? []).some((m) => m.key === MODELE), (avant.json.possibles ?? []).map((m) => m.key).join(","));

  /*
   * Suivi comme l'écran (useProvision.ts) : le flux de la mise en route,
   * ouvert avant la demande, et rien d'autre tant qu'elle tourne. Relire
   * `/helix/provision` toutes les trois secondes, comme le faisait la première
   * version de cet essai, n'est pas neutre : chaque lecture cherche les
   * modèles (`discover`), ce qui relance le serveur de LM Studio s'il ne
   * répond pas ; l'essai réparait ainsi lui-même ce qu'il devait voir (essai
   * du 28/09/2026).
   */
  const arretFlux = new AbortController();
  const minuterie = setTimeout(() => arretFlux.abort(), DELAI_MS);
  const flux = await fetch(`${G}/helix/provision/stream`, { headers: entetes(), signal: arretFlux.signal });
  if (!verifier("le flux de la mise en route s'ouvre", flux.ok && Boolean(flux.body), flux.status)) return;
  const lance = await appel("/helix/provision/moteur", { conditionsAcceptees: true, model: MODELE });
  if (!verifier("installation du moteur acceptée (202)", lance.statut === 202, `${lance.statut} ${lance.texte.slice(0, 400)}`)) return;

  const declaration = join(LMSTUDIO, ".internal", "llmster-install-location.json");
  let dernier = "";
  let etat = null;
  let declareVu = false;
  let tampon = "";
  const lecteur = flux.body.getReader();
  const decodeur = new TextDecoder();
  try {
    lecture: for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += decodeur.decode(value, { stream: true });
      let fin;
      while ((fin = tampon.indexOf("\n\n")) >= 0) {
        const bloc = tampon.slice(0, fin);
        tampon = tampon.slice(fin + 2);
        const donnees = bloc
          .split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6))
          .join("\n");
        if (!donnees) continue;
        try {
          etat = JSON.parse(donnees);
        } catch {
          continue;
        }
        if (!declareVu && existsSync(declaration)) {
          declareVu = true;
          dire("   la déclaration du moteur est écrite (llmster-install-location.json)");
        }
        const pas = typeof etat.percent === "number" ? Math.floor(etat.percent / 10) * 10 : "";
        // Une ligne par dizaine de pour cent, pas une par pour cent.
        const message = pas === "" ? (etat.message ?? "") : `${String(etat.message ?? "").replace(/[\d.,]+\s*%/g, "").trim()} ${pas} %`;
        const resume = `${etat.phase} | ${etat.model ?? "-"} | ${message}${etat.error ? ` | ${etat.error}` : ""}`;
        if (resume !== dernier) {
          dernier = resume;
          dire(`   ${resume}`);
        }
        if (etat.phase === "ready" || etat.phase === "error") break lecture;
      }
    }
  } catch (err) {
    dire(`   flux interrompu : ${err?.name ?? err}`);
  } finally {
    clearTimeout(minuterie);
    arretFlux.abort();
  }
  declareVu ||= existsSync(declaration);
  verifier("le moteur de LM Studio est installé et déclaré (llmster-install-location.json)", declareVu, declaration);
  if (!verifier(`la mise en route arrive à « prêt » (en moins de ${DELAI_MS / 60_000} min)`, etat?.phase === "ready", JSON.stringify(etat))) return;
  verifier(`le modèle prêt est celui demandé (${MODELE})`, etat.model === MODELE, etat.model);
  // Puis l'écran relit l'état, une fois (useProvision.ts, `load`).
  const apres = await appel("/helix/provision");
  verifier("l'écran relu : moteur installé, un modèle de Chat présent", apres.json.moteurInstalle === true && apres.json.hasChatModel === true, apres.texte.slice(0, 400));

  /* 4. Une question au Chat */
  dire("4. Une question au Chat, modèle local, en flux");
  if (!(await questionAuChat("1"))) return;
  const lmsExe = join(LMSTUDIO, "bin", "lms.exe");
  // Ce que le moteur dit lui-même de ses modèles : les noms sous lesquels il les range et les sert.
  for (const [nom, args] of [["lms-ls.json", ["ls", "--json"]], ["lms-ps.json", ["ps", "--json"]]]) {
    const r = spawnSync(lmsExe, args, { encoding: "utf8", timeout: 60_000, windowsHide: true });
    writeFileSync(join(SORTIE, nom), `${r.stdout ?? ""}${r.stderr ? `\n-- stderr --\n${r.stderr}` : ""}`);
    /*
     * Une seule copie du modèle en mémoire après la mise en route et une
     * question (essai du 28/09/2026 : deux, l'une chargée par Helix, l'autre
     * par LM Studio à la question d'essai posée sous un autre nom).
     */
    if (nom === "lms-ps.json") {
      let charges = [];
      try {
        charges = JSON.parse(r.stdout).filter((m) => m.type !== "embedding");
      } catch {
        /* illisible : dit ci-dessous */
      }
      verifier(
        `une seule copie de ${MODELE} en mémoire (lms ps)`,
        charges.length === 1 && nomDuModele(charges[0].modelKey ?? "") === MODELE,
        charges.map((m) => `${m.identifier} (${m.path}, ${m.contextLength} jetons, TTL ${m.ttlMs} ms)`).join(" | ") || String(r.stdout).slice(0, 300),
      );
    }
  }

  /*
   * 5. Le lendemain : l'application quittée, la machine redémarrée (le
   * service de LM Studio ne tourne plus), l'application rouverte. C'est ici
   * que la passerelle, dans son `utilityProcess`, doit faire lever le service
   * par l'application (electron/moteurWindows.cjs) : le défaut « Timed out
   * waiting for LM Studio daemon to start » de la 2026.928.6.
   */
  dire("5. Quitter, arrêter le service de LM Studio (comme un redémarrage), rouvrir");
  arreterApplication();
  await attendre(3000);
  const bas = spawnSync(lmsExe, ["daemon", "down"], { encoding: "utf8", timeout: 60_000, windowsHide: true });
  dire(`   lms daemon down : code ${bas.status} ${String(bas.stdout ?? "").trim().slice(0, 200)} ${String(bas.stderr ?? "").trim().slice(0, 200)}`);
  const statut = spawnSync(lmsExe, ["daemon", "status", "--json"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  dire(`   lms daemon status : ${String(statut.stdout ?? "").trim().slice(0, 200)}`);
  const serveurEteint = await fetch("http://127.0.0.1:1234/v1/models", { signal: AbortSignal.timeout(3000) }).then(
    () => false,
    () => true,
  );
  verifier("le serveur de LM Studio ne répond plus (service arrêté)", serveurEteint, "il répond encore");
  const rouverte = Date.now();
  if (!(await demarrerEtAttendre())) return;
  /*
   * L'application n'ouvre sa fenêtre qu'une fois sa passerelle vue à
   * `/health`, chaque sonde attendant 1,2 s au plus (main.cjs, `ping`). La
   * sonde doit donc répondre vite pendant que le service de LM Studio se
   * relève : elle attendait sa levée (70 s mesurées le 28/09/2026), et la
   * fenêtre ne s'ouvrait qu'au bout d'une minute.
   */
  const t1 = Date.now();
  const sonde = await fetch(`${G}/health`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.ok, () => false);
  const dureeSonde = Date.now() - t1;
  verifier("pendant le réveil de LM Studio, /health répond sans l'attendre (moins de 3 s)", sonde && dureeSonde < 3000, `${sonde} en ${dureeSonde} ms`);
  // La séance survit à la fermeture de l'application, comme pour une personne qui rouvre Helix.
  const relu = await appel("/helix/provision");
  verifier("la séance ouverte hier sert encore", relu.statut === 200, `${relu.statut} ${relu.texte.slice(0, 200)}`);
  if (!(await questionAuChat("2", 3 * 60_000))) return;
  // Au-delà de ce que l'application attend (40 sondes), elle a soit vu sa passerelle, soit abandonné en le disant.
  await attendre(Math.max(0, 70_000 - (Date.now() - rouverte)));
  verifier("l'application a vu sa passerelle à temps pour ouvrir sa fenêtre", !/la passerelle n'a pas démarré à temps/.test(sortieApplication), "« la passerelle n'a pas démarré à temps » dans sa sortie");

  /*
   * 6. La réflexion du modèle (29/09/2026) : sous Windows, le Chat n'en
   * affichait ni le texte ni le temps. Le flux brut d'une question qui fait
   * réfléchir, au moteur seul puis à travers Helix, pour chaque modèle ; le
   * Chat de Helix doit la rendre séparée (scripts/essai-reflexion-ci.mjs).
   */
  dire("6. La réflexion du modèle : moteur seul, relais de Helix, Chat de Helix");
  await essaiReflexion({ G, entetes, dire, verifier, sortie: SORTIE, modeles: MODELES_REFLEXION });
}

/** Nom comparable d'un modèle, sans source ni éditeur (« lmstudio/qwen/qwen3-1.7b » → « qwen3-1.7b »), comme santeModeles.ts. */
const nomDuModele = (id) => (String(id).toLowerCase().split("/").pop() ?? "").replace(/:\d+$/, "");

/** Lance l'application et attend sa passerelle (/health). */
async function demarrerEtAttendre() {
  lancerApplication();
  const t0 = Date.now();
  let sante = null;
  for (let i = 0; i < 360 && !sante; i++) {
    if (application.exitCode !== null) break;
    try {
      const r = await fetch(`${G}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) sante = await r.json().catch(() => ({}));
    } catch {
      await attendre(500);
    }
  }
  if (!verifier("la passerelle de l'application répond sur 127.0.0.1:8787/health", Boolean(sante), "aucune réponse au bout du délai")) return false;
  dire(`   /health en ${((Date.now() - t0) / 1000).toFixed(1)} s après le lancement : ${JSON.stringify(sante).slice(0, 300)}`);
  return true;
}

/**
 * Une question au Chat, en flux, le sélecteur sur « Auto » (le défaut d'une
 * personne : aucun modèle nommé). `n` numérote ce qui est gardé ;
 * `attenteMs` : le temps laissé au modèle pour apparaître dans le sélecteur
 * (l'application rouverte relève d'abord le service de LM Studio).
 */
async function questionAuChat(n, attenteMs = 0) {
  const t00 = Date.now();
  let liste = [];
  for (;;) {
    const modeles = await appel("/helix/models").catch(() => ({ json: {} }));
    liste = modeles.json.models ?? [];
    if (liste.some((m) => nomDuModele(m.id) === MODELE) || Date.now() - t00 >= attenteMs) break;
    await attendre(5000);
  }
  writeFileSync(join(SORTIE, `modeles-${n}.json`), JSON.stringify(liste, null, 1));
  dire(`   sélecteur (${((Date.now() - t00) / 1000).toFixed(0)} s) : ${liste.map((m) => `${m.id}${m.loaded ? " [en mémoire]" : ""}`).join(", ")}`);
  if (!verifier(`le sélecteur du Chat propose ${MODELE}`, liste.some((m) => nomDuModele(m.id) === MODELE), liste.map((m) => m.id).join(","))) return false;
  const doublons = liste.filter((m) => nomDuModele(m.id) === MODELE);
  verifier(`${MODELE} n'apparaît qu'une fois dans le sélecteur`, doublons.length === 1, doublons.map((m) => `${m.id} (${m.uid ?? "-"})`).join(", "));
  const question = "Quelle est la capitale de la France ? Réponds en une courte phrase.";
  const t0 = Date.now();
  const r = await fetch(`${G}/v1/chat/completions`, {
    method: "POST",
    headers: entetes(),
    body: JSON.stringify({ stream: true, messages: [{ role: "user", content: question }] }),
    signal: AbortSignal.timeout(20 * 60_000),
  });
  const brut = await r.text();
  writeFileSync(join(SORTIE, `reponse-chat-${n}.sse.txt`), brut);
  let texte = "";
  let reflexion = "";
  const erreurs = [];
  const servi = new Set();
  for (const ligne of brut.split("\n")) {
    if (!ligne.startsWith("data: ") || ligne.startsWith("data: [DONE]")) continue;
    try {
      const evt = JSON.parse(ligne.slice(6));
      if (evt.error) erreurs.push(JSON.stringify(evt.error));
      if (typeof evt.model === "string") servi.add(evt.model);
      const delta = evt.choices?.[0]?.delta ?? {};
      if (typeof delta.content === "string") texte += delta.content;
      if (typeof delta.reasoning_content === "string") reflexion += delta.reasoning_content;
    } catch {
      /* ligne d'un autre format */
    }
  }
  dire(`   ${r.status}, ${((Date.now() - t0) / 1000).toFixed(1)} s ; réponse : ${JSON.stringify(texte.trim()).slice(0, 500)}`);
  if (reflexion) dire(`   réflexion : ${reflexion.length} lettres`);
  dire(`   modèle qui a répondu (« Auto ») : ${[...servi].join(", ") || "non dit"}`);
  if (servi.size) verifier(`en « Auto », c'est ${MODELE} qui répond`, [...servi].every((s) => nomDuModele(s) === MODELE), [...servi].join(", "));
  const acceptee = verifier("la requête du Chat est acceptée (200)", r.status === 200, `${r.status} ${brut.slice(0, 400)}`);
  const sansErreur = verifier("aucune erreur dans le flux", erreurs.length === 0, erreurs.join(" | "));
  const net = texte.trim();
  const lettres = (net.match(/\p{L}/gu) ?? []).length;
  const nonVide = verifier("une réponse non vide", net.length > 0, JSON.stringify(brut.slice(-600)));
  const lisible = verifier(
    "une réponse lisible (surtout des lettres, aucun caractère de remplacement ni de contrôle)",
    net.length > 0 && lettres / net.length > 0.5 && !/\uFFFD|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(net),
    JSON.stringify(net).slice(0, 300),
  );
  // Indicatif : un petit modèle peut tourner sa phrase autrement.
  dire(`   (la réponse ${/paris/i.test(net) ? "nomme" : "ne nomme pas"} Paris)`);
  return acceptee && sansErreur && nonVide && lisible;
}

/* ── Ce qu'on garde, réussi ou non ──────────────────────────────────────── */

function lister(dossier, profondeur, lignes, racine = dossier) {
  let entrees = [];
  try {
    entrees = readdirSync(dossier, { withFileTypes: true });
  } catch (err) {
    lignes.push(`${relative(racine, dossier) || "."} : illisible (${err.code ?? err.message})`);
    return;
  }
  for (const e of entrees) {
    const chemin = join(dossier, e.name);
    let taille = "";
    try {
      if (e.isFile()) taille = ` ${statSync(chemin).size} o`;
    } catch {
      /* disparu */
    }
    lignes.push(`${relative(racine, chemin)}${e.isDirectory() ? "\\" : ""}${taille}`);
    if (e.isDirectory() && profondeur > 0 && e.name !== "models" && e.name !== "node_modules") lister(chemin, profondeur - 1, lignes, racine);
  }
}

function trouver(dossier, filtre, profondeur, trouves = []) {
  let entrees = [];
  try {
    entrees = readdirSync(dossier, { withFileTypes: true });
  } catch {
    return trouves;
  }
  for (const e of entrees) {
    const chemin = join(dossier, e.name);
    if (e.isFile() && filtre(e.name, chemin)) trouves.push(chemin);
    else if (e.isDirectory() && profondeur > 0 && e.name !== "models" && e.name !== "node_modules") trouver(chemin, filtre, profondeur - 1, trouves);
  }
  return trouves;
}

function garderLesJournaux() {
  const copier = (source, nom) => {
    try {
      copyFileSync(source, join(SORTIE, nom));
      return true;
    } catch {
      return false;
    }
  };
  // passerelle.log : dans le dossier des journaux de l'application (`app.getPath("logs")`), cherché sous le profil et sous %APPDATA%.
  const journaux = [PROFIL, process.env.APPDATA ?? "", process.env.LOCALAPPDATA ?? ""]
    .filter(Boolean)
    .flatMap((d) => trouver(d, (n) => /^passerelle\.log(\.1)?$/.test(n), 4));
  const vus = new Set();
  journaux.forEach((j, i) => {
    if (vus.has(j)) return;
    vus.add(j);
    copier(j, i === 0 ? "passerelle.log" : `passerelle-${i}-${j.replace(/[\\/:]+/g, "_")}`);
  });
  writeFileSync(join(SORTIE, "emplacements-des-journaux.txt"), journaux.length ? journaux.join("\n") : "aucun passerelle.log trouvé\n");

  // Le dossier de LM Studio : la liste (hors modèles), les déclarations d'installation, ses journaux.
  const liste = [`${LMSTUDIO}`];
  lister(LMSTUDIO, 3, liste);
  writeFileSync(join(SORTIE, "lmstudio-liste.txt"), `${liste.join("\n")}\n`);
  const internes = [`${join(LMSTUDIO, ".internal")}`];
  lister(join(LMSTUDIO, ".internal"), 2, internes);
  writeFileSync(join(SORTIE, "lmstudio-internal-liste.txt"), `${internes.join("\n")}\n`);
  const declarations = trouver(LMSTUDIO, (n) => /install-location\.json$/i.test(n), 3);
  writeFileSync(
    join(SORTIE, "install-location.txt"),
    declarations.length
      ? declarations
          .map((f) => {
            let contenu = "";
            try {
              contenu = readFileSync(f, "utf8");
            } catch (err) {
              contenu = `illisible : ${err.message}`;
            }
            return `== ${f}\n${contenu}\n`;
          })
          .join("\n")
      : "aucun fichier *install-location.json\n",
  );
  const pointeur = join(homedir(), ".lmstudio-home-pointer");
  if (existsSync(pointeur)) copier(pointeur, "lmstudio-home-pointer.txt");
  const journauxLm = join(SORTIE, "lmstudio-journaux");
  const logsLm = trouver(LMSTUDIO, (n, c) => /\.log$/i.test(n) && statSync(c).size < 20 * 1024 * 1024, 4);
  if (logsLm.length) {
    mkdirSync(journauxLm, { recursive: true });
    for (const f of logsLm) copier(f, join("lmstudio-journaux", relative(LMSTUDIO, f).replace(/[\\/:]+/g, "_")));
  }
  // Le journal d'audit de l'instance jetable : l'acceptation des conditions y est inscrite.
  const audit = join(DONNEES, "audit");
  if (existsSync(audit)) {
    mkdirSync(join(SORTIE, "audit"), { recursive: true });
    for (const f of readdirSync(audit)) copier(join(audit, f), join("audit", f));
  }
}

try {
  await etapes();
} catch (err) {
  verifier("l'essai s'est déroulé sans exception", false, err?.stack ?? err);
} finally {
  dire(`Durée : ${((Date.now() - debut) / 60_000).toFixed(1)} min.`);
  arreterApplication();
  await attendre(3000);
  try {
    garderLesJournaux();
  } catch (err) {
    dire(`journaux non gardés : ${err?.stack ?? err}`);
  }
  dire(`${reussis} vérification(s) réussie(s), ${echecs.length} échec(s).`);
  for (const e of echecs) dire(`  - ${e}`);
  await new Promise((r) => journalEssai.end(r));
  journalApplication.end();
  process.exit(echecs.length ? 1 : 0);
}
