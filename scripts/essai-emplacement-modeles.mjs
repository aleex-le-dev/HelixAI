/*
 * L'emplacement du moteur et des modèles (gateway/src/emplacementModeles.ts,
 * 28/09/2026), de bout en bout contre des passerelles jetables.
 *
 *   node scripts/essai-emplacement-modeles.mjs
 *
 * Tout vit dans un dossier temporaire : un dossier personnel neuf (HOME), des
 * données neuves, un « autre disque » (un dossier hors du dossier personnel),
 * un faux `lms` qui ne répond rien, un faux `security`. Aucun vrai LM Studio,
 * aucun `~/.lmstudio` ni `~/.lmstudio-home-pointer` réels, aucun réseau :
 * LM Studio est cherché à 127.0.0.1:9. Sur macOS, un second volume est monté
 * pour l'essai (image disque de 64 Mo, `hdiutil`, invisible dans le Finder)
 * afin d'essayer la copie entre deux disques ; il est démonté à la fin.
 *
 * A. LM Studio : lecture, refus (non-administrateur, espace des agents,
 *    dossier personnel, partage réseau, chemin relatif, zone protégée),
 *    pointeur écrit avant l'installation seulement, zone protégée ensuite,
 *    moteur posé ailleurs dit clairement, sans rien télécharger.
 * B. llama.cpp (macOS) : choix avant les modèles, déplacement sur le même
 *    disque (renommage), vers un autre disque (copie vérifiée), copie ratée
 *    sans rien perdre, ménage qui ne touche pas aux fichiers d'une personne.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const portLibre = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Chemin réel : sous macOS, le dossier temporaire est derrière un lien (/var → /private/var).
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "helix-essai-emplacement-")));
const MAISON = join(TMP, "maison");
const BIN = join(TMP, "bin");
const ESPACE = join(TMP, "espace-agents");
const DISQUE_D = join(TMP, "disque-d");
const DISQUE_E = join(TMP, "disque-e");
for (const d of [MAISON, BIN, ESPACE, DISQUE_D, DISQUE_E, join(TMP, "Applications")]) mkdirSync(d, { recursive: true });
writeFileSync(join(BIN, "security"), "#!/bin/sh\nexit 44\n");
// OpenCode et RTK « déjà là » : la passerelle ne télécharge rien en arrière-plan pendant l'essai.
writeFileSync(join(BIN, "opencode"), "#!/bin/sh\necho 1.18.32\n");
writeFileSync(join(BIN, "rtk"), "#!/bin/sh\necho rtk 0.50.0\n");
chmodSync(join(BIN, "opencode"), 0o755);
chmodSync(join(BIN, "rtk"), 0o755);
// Un `lms` qui ne répond rien : le vrai n'est jamais cherché (le PATH commence ici).
writeFileSync(join(BIN, "lms"), "#!/bin/sh\nexit 1\n");
for (const f of ["security", "lms"]) chmodSync(join(BIN, f), 0o755);
writeFileSync(join(TMP, "profil.json"), JSON.stringify({ chiffrement: "fichier" }));
const PATH = [BIN, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");
const POINTEUR = join(MAISON, ".lmstudio-home-pointer");

let reussis = 0;
const echecs = [];
const verifier = (nom, ok, obtenu) => {
  if (ok) {
    reussis++;
    console.log(`  ✓ ${nom}`);
  } else {
    echecs.push(nom);
    console.log(`  ✗ ${nom}  —  obtenu : ${String(obtenu).slice(0, 400)}`);
  }
};

/* ── Une passerelle jetable ─────────────────────────────────────────────── */

let passerelle = null;
let journal = "";
let G = "";
let JETON = "";
let DONNEES = "";
async function demarrer(moteur, donnees) {
  const port = await portLibre();
  G = `http://127.0.0.1:${port}`;
  DONNEES = donnees;
  mkdirSync(DONNEES, { recursive: true });
  journal = "";
  passerelle = spawn(process.execPath, [join(RACINE, "gateway", "src", "index.ts")], {
    env: {
      PATH,
      HOME: MAISON,
      USERPROFILE: MAISON,
      LANG: "C",
      HELIX_CONFIG: join(TMP, "profil.json"),
      HELIX_DATA_DIR: DONNEES,
      HELIX_GATEWAY_PORT: String(port),
      HELIX_WORKSPACE: ESPACE,
      HELIX_MOTEUR: moteur,
      HELIX_LLAMACPP_PORT: String(await portLibre()),
      HELIX_LMSTUDIO_URL: "http://127.0.0.1:9/v1",
      HELIX_EXO_URL: "http://127.0.0.1:9/v1",
      // Jamais l'application LM Studio de la machine (/Applications) : un dossier vide.
      HELIX_APPS_DIR: join(TMP, "Applications"),
      HELIX_OPENCODE_BIN: join(BIN, "opencode"),
      HELIX_RTK_BIN: join(BIN, "rtk"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  passerelle.stdout.on("data", (b) => (journal += b));
  passerelle.stderr.on("data", (b) => (journal += b));
  for (let i = 0; i < 160; i++) {
    try {
      await fetch(`${G}/health`);
      JETON = readFileSync(join(DONNEES, "instance-token"), "utf8").trim();
      return;
    } catch {
      await attendre(250);
    }
  }
  throw new Error(`passerelle muette :\n${journal.slice(-2000)}`);
}
async function arreter() {
  if (!passerelle || passerelle.exitCode !== null) return;
  const lui = passerelle;
  const fin = new Promise((r) => lui.once("exit", r));
  lui.kill("SIGTERM");
  await Promise.race([fin, attendre(10_000)]);
  if (lui.exitCode === null) lui.kill("SIGKILL");
}

// En français, quel que soit l'environnement qui lance l'essai : les messages attendus sont comparés en français.
const entetes = (seance) => ({ "Content-Type": "application/json", Authorization: `Bearer ${JETON}`, "X-Helix-Langue": "fr", ...(seance ? { "X-Helix-Session": seance } : {}) });
const appel = async (chemin, seance, corps) => {
  const r = await fetch(`${G}${chemin}`, corps === undefined ? { headers: entetes(seance) } : { method: "POST", headers: entetes(seance), body: JSON.stringify(corps) });
  return { statut: r.status, json: await r.json().catch(() => ({})) };
};
const choisir = (seance, dossier) => appel("/helix/emplacement-modeles", seance, { dossier });
const etat = async (seance) => (await appel("/helix/emplacement-modeles", seance)).json;

/** L'administrateur (premier compte) et une collègue (créée par lui, son mot de passe choisi ensuite). */
async function comptes() {
  const admin = await appel("/helix/auth/create", null, { fullName: "Admin Essai", email: "admin@example.test", password: "Admin2Essai!Solide42" });
  const seanceAdmin = admin.json.session?.token ?? "";
  const cree = await appel("/helix/auth/create", seanceAdmin, { fullName: "Collègue", email: "collegue@example.test", password: "Provisoire2Essai!11" });
  const id = cree.json.account?.id;
  const change = await appel("/helix/auth/mot-de-passe-provisoire", null, { accountId: id, password: "Provisoire2Essai!11", nouveau: "Collegue2Essai!Solide57" });
  return { admin: seanceAdmin, membre: change.json.session?.token ?? "" };
}

/** Ce que dit zonesProtegees.ts avec ce dossier personnel et ces données. */
function protege(chemin) {
  const code = `const z = await import(${JSON.stringify(join(RACINE, "gateway", "src", "zonesProtegees.ts"))}); console.log(z.estProtege(${JSON.stringify(chemin)}) ? "PROTEGE" : "LIBRE");`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { PATH, HOME: MAISON, HELIX_DATA_DIR: DONNEES, HELIX_CONFIG: join(TMP, "profil.json") },
    encoding: "utf8",
  });
  return (r.stdout + r.stderr).trim();
}
const auditDit = (action) => {
  try {
    return readdirSync(join(DONNEES, "audit")).some((n) => readFileSync(join(DONNEES, "audit", n), "utf8").includes(action));
  } catch {
    return false;
  }
};

let volume = null;
/** Les volumes d'essai montés, démontés à la fin quoi qu'il arrive. */
const volumes = [];
try {
  /* ── A. LM Studio ─────────────────────────────────────────────────────── */
  console.log("A. LM Studio : avant l'installation, le pointeur ; après, rien");
  await demarrer("lmstudio", join(TMP, "donnees-a"));
  const { admin, membre } = await comptes();
  verifier("les deux comptes s'ouvrent (administrateur, collègue)", Boolean(admin && membre), `${admin.length} ${membre.length}`);

  const sansSeance = await fetch(`${G}/helix/emplacement-modeles`, { headers: { Authorization: `Bearer ${JETON}` } });
  verifier("lire l'emplacement demande une séance (401)", sansSeance.status === 401, sansSeance.status);
  const e0 = await etat(admin);
  verifier("l'emplacement habituel est ~/.lmstudio, choix libre (rien d'installé)", e0.moteur === "lmstudio" && e0.dossier === join(MAISON, ".lmstudio") && e0.parDefaut === true && e0.changement === "libre", JSON.stringify(e0).slice(0, 300));
  verifier("place libre et place nécessaire (moteur et modèle conseillé) sont données", typeof e0.libre === "number" && e0.libre > 0 && e0.necessaire > 1e9 && e0.modele?.downloadGb > 0 && e0.admin === true, `${e0.libre} ${e0.necessaire} ${JSON.stringify(e0.modele)}`);
  const vuParMembre = await etat(membre);
  verifier("une collègue voit l'emplacement, sans le droit de le changer", vuParMembre.admin === false && vuParMembre.dossier === e0.dossier, JSON.stringify(vuParMembre).slice(0, 200));

  const parMembre = await choisir(membre, DISQUE_D);
  verifier("une collègue (non administratrice) ne choisit pas l'emplacement (403), rien n'est écrit", parMembre.statut === 403 && !existsSync(POINTEUR) && !existsSync(join(DISQUE_D, "LM Studio")), `${parMembre.statut} ${existsSync(POINTEUR)}`);
  const verifMembre = await appel("/helix/emplacement-modeles/verifier", membre, { dossier: DISQUE_D });
  verifier("une collègue ne sonde pas non plus les disques de la machine (403)", verifMembre.statut === 403, verifMembre.statut);

  const refus = async (nom, dossier, motif) => {
    const r = await choisir(admin, dossier);
    verifier(nom, r.statut === 400 && motif.test(r.json.error?.message ?? "") && !existsSync(POINTEUR), `${r.statut} ${r.json.error?.message}`);
  };
  await refus("dossier dans l'espace de travail des agents : refusé", join(ESPACE, "modeles"), /espace de travail des agents/);
  await refus("dossier qui contient l'espace des agents : refusé", TMP, /espace de travail des agents|dossier personnel|protégé/);
  await refus("dossier personnel : refusé", join(MAISON, "Modeles"), /dossier personnel/);
  await refus("partage réseau (\\\\serveur\\partage) : refusé", "\\\\serveur\\partage\\modeles", /partage réseau/);
  await refus("partage réseau (//serveur/partage) : refusé", "//serveur/partage/modeles", /partage réseau/);
  await refus("chemin relatif : refusé", "modeles", /chemin complet/);
  await refus("données de l'instance (zone protégée) : refusées", join(DONNEES, "modeles"), /protégé/);
  await refus("caractère de contrôle dans le chemin : refusé", `${DISQUE_D}/a\u0007b`, /pas valable/);
  const lien = join(DISQUE_E, "lien-vers-espace");
  (await import("node:fs")).symlinkSync(ESPACE, lien);
  await refus("lien symbolique vers l'espace des agents : jugé comme sa cible, refusé", lien, /espace de travail des agents/);
  rmSync(lien);

  const verif = await appel("/helix/emplacement-modeles/verifier", admin, { dossier: DISQUE_D });
  verifier("vérifier un dossier rend sa place libre sans rien créer", verif.statut === 200 && verif.json.libre > 0 && !existsSync(join(DISQUE_D, "LM Studio")), `${verif.statut} ${JSON.stringify(verif.json)}`);

  const ok = await choisir(admin, DISQUE_D);
  const attendu = join(DISQUE_D, "LM Studio");
  verifier("autre disque, avant l'installation : accepté (200)", ok.statut === 200 && ok.json.dossier === attendu, `${ok.statut} ${JSON.stringify(ok.json)}`);
  verifier("le pointeur de LM Studio désigne <dossier choisi>/LM Studio, qui existe", existsSync(POINTEUR) && readFileSync(POINTEUR, "utf8") === attendu && statSync(attendu).isDirectory(), existsSync(POINTEUR) ? readFileSync(POINTEUR, "utf8") : "pas de pointeur");
  verifier("le dossier créé n'est lisible que par ce compte (0700)", (statSync(attendu).mode & 0o777) === 0o700, (statSync(attendu).mode & 0o777).toString(8));
  const e1 = await etat(admin);
  verifier("la passerelle suit le nouveau dossier (moteur, téléchargements, modèles)", e1.dossier === attendu && e1.parDefaut === false && e1.changement === "libre" && e1.revenir === true, JSON.stringify(e1).slice(0, 300));
  verifier("choix inscrit au journal d'audit", auditDit("moteur.emplacement"), "journal");
  verifier("le nouveau dossier de LM Studio devient une zone protégée (son bin/lms)", protege(join(attendu, "bin", "lms")) === "PROTEGE", protege(join(attendu, "bin", "lms")));
  verifier("le reste de l'autre disque n'est pas fermé aux agents", protege(join(DISQUE_D, "Documents", "devis.txt")) === "LIBRE", protege(join(DISQUE_D, "Documents", "devis.txt")));

  const ok2 = await choisir(admin, DISQUE_E);
  const attendu2 = join(DISQUE_E, "LM Studio");
  verifier("changer d'avis avant l'installation : le pointeur suit, l'ancien dossier vide est retiré", ok2.statut === 200 && readFileSync(POINTEUR, "utf8") === attendu2 && !existsSync(attendu), `${ok2.statut} ${existsSync(attendu)}`);

  // Le moteur « installé » au nouvel endroit (un faux `lms`, jamais lancé) : le pointeur ne bouge plus.
  mkdirSync(join(attendu2, "bin"), { recursive: true });
  writeFileSync(join(attendu2, "bin", "lms"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const apres = await choisir(admin, DISQUE_D);
  verifier("LM Studio déjà installé : le pointeur n'est plus réécrit (409)", apres.statut === 409 && readFileSync(POINTEUR, "utf8") === attendu2 && !existsSync(attendu), `${apres.statut} ${readFileSync(POINTEUR, "utf8")}`);
  const retour = await choisir(admin, null);
  verifier("ni ramené à l'emplacement habituel (409) : l'installation resterait orpheline", retour.statut === 409 && readFileSync(POINTEUR, "utf8") === attendu2, `${retour.statut}`);
  const e2 = await etat(admin);
  verifier("l'écran reçoit la marche à suivre : dossier, pointeur, lms", e2.changement === "manuel" && e2.manuel?.pointeur === POINTEUR && e2.manuel?.lms === join(attendu2, "bin", "lms") && e2.manuel?.dossier === attendu2, JSON.stringify(e2.manuel));
  rmSync(join(attendu2, "bin"), { recursive: true });

  // llmster posé dans ~/.lmstudio au lieu du dossier choisi : dit, sans rien télécharger.
  mkdirSync(join(MAISON, ".lmstudio", "bin"), { recursive: true });
  writeFileSync(join(MAISON, ".lmstudio", "bin", "lms"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const e3 = await etat(admin);
  verifier("moteur posé ailleurs qu'à l'emplacement choisi : l'écran le dit, et propose de revenir", /et non à l'emplacement choisi/.test(e3.alerte ?? "") && e3.revenir === true, JSON.stringify(e3).slice(0, 400));
  const provision = (await appel("/helix/provision", admin)).json;
  verifier("l'écran de mise en route ne le compte pas comme installé", provision.moteurInstalle === false, provision.moteurInstalle);
  if (process.platform !== "darwin" || process.arch === "arm64") {
    const install = await appel("/helix/provision/moteur", admin, { conditionsAcceptees: true });
    let fin = {};
    for (let i = 0; i < 40; i++) {
      fin = (await appel("/helix/provision", admin)).json.state ?? {};
      if (fin.phase === "error") break;
      await attendre(250);
    }
    verifier(
      "l'installation s'arrête aussitôt, avec la raison, sans rien télécharger (pas de boucle de 600 Mo)",
      install.statut === 202 && fin.phase === "error" && /non à l'emplacement choisi/.test(fin.error ?? "") && ![...readdirSync(attendu2), ...readdirSync(DONNEES)].some((n) => n.startsWith(".moteur-")) && !/Téléchargement du moteur/.test(journal),
      `${install.statut} ${JSON.stringify(fin)}`,
    );
  }
  const retour2 = await choisir(admin, null);
  verifier("revenir à l'emplacement habituel : le pointeur est retiré, le moteur de ~/.lmstudio sert", retour2.statut === 200 && !existsSync(POINTEUR) && (await etat(admin)).parDefaut === true, `${retour2.statut} ${existsSync(POINTEUR)}`);

  // Pointeur écrit seulement à la première installation : ~/.lmstudio porte déjà le moteur.
  const premiere = await choisir(admin, DISQUE_D);
  verifier("moteur déjà dans ~/.lmstudio : aucun pointeur écrit (409)", premiere.statut === 409 && !existsSync(POINTEUR), `${premiere.statut} ${existsSync(POINTEUR)}`);
  rmSync(join(MAISON, ".lmstudio"), { recursive: true });
  // Des modèles seulement (téléchargés par LM Studio, moteur retiré) : pas plus.
  mkdirSync(join(MAISON, ".lmstudio", "models", "qwen"), { recursive: true });
  writeFileSync(join(MAISON, ".lmstudio", "models", "qwen", "modele.gguf"), "x");
  const avecModeles = await choisir(admin, DISQUE_D);
  verifier("des modèles déjà dans ~/.lmstudio : aucun pointeur écrit (409)", avecModeles.statut === 409 && !existsSync(POINTEUR), `${avecModeles.statut}`);
  verifier("et ils sont toujours là", existsSync(join(MAISON, ".lmstudio", "models", "qwen", "modele.gguf")), "effacé");
  rmSync(join(MAISON, ".lmstudio"), { recursive: true });

  // Un pointeur vers un disque débranché : dit, et rien ne s'installe ailleurs à sa place.
  writeFileSync(POINTEUR, join(TMP, "disque-absent", "LM Studio"));
  const e4 = await etat(admin);
  verifier("emplacement choisi introuvable (disque débranché) : l'écran le dit", e4.introuvable === true && /introuvable/.test(e4.alerte ?? ""), JSON.stringify(e4).slice(0, 300));
  rmSync(POINTEUR);
  await arreter();

  /* ── B. llama.cpp ─────────────────────────────────────────────────────── */
  if (process.platform === "darwin") {
    console.log("B. llama.cpp : choisir, déplacer, ne rien perdre");
    await demarrer("llamacpp", join(TMP, "donnees-b"));
    const s = (await comptes()).admin;
    const b0 = await etat(s);
    const habituel = join(DONNEES, "llamacpp", "modeles");
    verifier("llama.cpp : les modèles vont d'abord dans les données de l'instance", b0.moteur === "llamacpp" && b0.dossier === habituel && b0.changement === "libre", JSON.stringify(b0).slice(0, 300));
    const c1 = await choisir(s, DISQUE_D);
    const modelesD = join(DISQUE_D, "modeles-llamacpp");
    verifier("sans modèle posé : le choix est retenu aussitôt (sous-dossier modeles-llamacpp)", c1.statut === 200 && (await etat(s)).dossier === modelesD && existsSync(modelesD), `${c1.statut} ${JSON.stringify(c1.json)}`);
    verifier("le dossier des modèles devient une zone protégée", protege(join(modelesD, "Qwen3-4B-Q4_K_M.gguf")) === "PROTEGE", protege(join(modelesD, "x.gguf")));

    // Un téléchargement commencé (un `.partiel` de 3 Mo) et un fichier d'une personne à côté.
    const partiel = "Qwen3-4B-Q4_K_M.gguf.partiel";
    const contenu = randomBytes(3 * 1024 * 1024);
    const empreinte = createHash("sha256").update(contenu).digest("hex");
    writeFileSync(join(modelesD, partiel), contenu);
    writeFileSync(join(modelesD, "notes-perso.txt"), "à moi");
    const b1 = await etat(s);
    verifier("avec des modèles posés : l'écran propose un déplacement", b1.changement === "deplacement" && b1.occupe === contenu.length, JSON.stringify(b1).slice(0, 200));

    const suivre = async () => {
      let d = {};
      for (let i = 0; i < 240; i++) {
        d = (await etat(s)).deplacement ?? {};
        if (d.phase === "fini" || d.phase === "erreur") return d;
        await attendre(250);
      }
      return d;
    };
    const d1 = await choisir(s, DISQUE_E);
    const modelesE = join(DISQUE_E, "modeles-llamacpp");
    const fin1 = await suivre();
    verifier("même disque : déplacement accepté (202) et terminé", d1.statut === 202 && fin1.phase === "fini", `${d1.statut} ${JSON.stringify(fin1)}`);
    verifier(
      "le fichier est arrivé intact, l'original est parti, l'emplacement est retenu",
      existsSync(join(modelesE, partiel)) &&
        createHash("sha256").update(readFileSync(join(modelesE, partiel))).digest("hex") === empreinte &&
        !existsSync(join(modelesD, partiel)) &&
        (await etat(s)).dossier === modelesE,
      readdirSync(modelesE).join(","),
    );
    verifier("le fichier de la personne n'a pas bougé, ni son dossier", readFileSync(join(modelesD, "notes-perso.txt"), "utf8") === "à moi", readdirSync(modelesD).join(","));

    /*
     * Deux autres disques (images montées, invisibles dans le Finder) : un
     * petit, trop petit pour la marge d'un gigaoctet, et un grand, creux
     * (l'image ne prend sur le disque que ce qui y est écrit).
     */
    const monter = (nom, taille) => {
      try {
        const image = join(TMP, `${nom}.sparseimage`);
        execFileSync("/usr/bin/hdiutil", ["create", "-type", "SPARSE", "-size", taille, "-fs", "HFS+", "-volname", `${nom}${process.pid}`, image], { stdio: "ignore" });
        const sortie = execFileSync("/usr/bin/hdiutil", ["attach", "-nobrowse", "-noverify", "-noautoopen", image], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const point = sortie.trim().split("\n").pop().split("\t").pop().trim();
        volumes.push(point);
        return existsSync(point) ? point : null;
      } catch (err) {
        console.log(`  (pas de volume d'essai : ${err instanceof Error ? err.message.split("\n")[0] : err})`);
        return null;
      }
    };
    const petit = monter("HelixPetit", "64m");
    if (petit) {
      const dp = await choisir(s, petit);
      const finp = await suivre();
      verifier(
        "autre disque trop petit : « pas assez de place » dit, rien déplacé, rien laissé",
        dp.statut === 202 && finp.phase === "erreur" && /Pas assez de place/.test(finp.erreur ?? "") && existsSync(join(modelesE, partiel)) && !existsSync(join(petit, "modeles-llamacpp")) && (await etat(s)).dossier === modelesE,
        `${dp.statut} ${JSON.stringify(finp)}`,
      );
    }
    volume = monter("HelixEssai", "3g");
    if (volume) {
      const modelesV = join(volume, "modeles-llamacpp");
      const d2 = await choisir(s, volume);
      if (d2.statut !== 202) throw new Error(`second volume refusé : ${d2.statut} ${JSON.stringify(d2.json)}`);
      const fin2 = await suivre();
      if (fin2.phase !== "fini") throw new Error(`copie vers le second volume : ${JSON.stringify(fin2)}`);
      verifier(
        "autre disque : copie, taille vérifiée, puis l'original effacé",
        d2.statut === 202 &&
          fin2.phase === "fini" &&
          createHash("sha256").update(readFileSync(join(modelesV, partiel))).digest("hex") === empreinte &&
          !existsSync(join(modelesE, partiel)) &&
          !readdirSync(modelesV).some((n) => n.endsWith(".copie-helix")),
        `${d2.statut} ${JSON.stringify(fin2)} ${readdirSync(modelesV).join(",")}`,
      );

      // Un « modèle complet » à la mauvaise taille : la copie est refusée, rien n'est perdu.
      const faux = "Qwen3-1.7B-Q8_0.gguf";
      writeFileSync(join(modelesV, faux), randomBytes(1024 * 1024));
      // Un sous-dossier des modèles déjà occupé (le fichier de la personne, plus haut) : refusé avant tout.
      const occupe = await choisir(s, DISQUE_D);
      verifier("destination dont le sous-dossier des modèles n'est pas vide : refusée (400), rien ne bouge", occupe.statut === 400 && /pas vide/.test(occupe.json.error?.message ?? "") && existsSync(join(modelesV, faux)), `${occupe.statut} ${JSON.stringify(occupe.json)}`);
      const disqueF = join(TMP, "disque-f");
      mkdirSync(disqueF);
      const modelesF = join(disqueF, "modeles-llamacpp");
      const d3 = await choisir(s, disqueF);
      const fin3 = await suivre();
      const restes = existsSync(modelesF) ? readdirSync(modelesF) : [];
      verifier(
        "copie ratée (taille différente de celle publiée) : erreur dite, originaux intacts, aucune copie laissée, emplacement inchangé",
        d3.statut === 202 &&
          fin3.phase === "erreur" &&
          /rien n'a été effacé/.test(fin3.erreur ?? "") &&
          existsSync(join(modelesV, faux)) &&
          createHash("sha256").update(readFileSync(join(modelesV, partiel))).digest("hex") === empreinte &&
          restes.length === 0 &&
          (await etat(s)).dossier === modelesV,
        `${d3.statut} ${JSON.stringify(fin3)} ${restes.join(",")}`,
      );
      rmSync(join(modelesV, faux));
      // Retour à l'emplacement habituel : les modèles reviennent dans les données.
      const d4 = await choisir(s, null);
      const fin4 = await suivre();
      verifier(
        "revenir à l'emplacement habituel : les modèles reviennent avec",
        d4.statut === 202 && fin4.phase === "fini" && existsSync(join(habituel, partiel)) && (await etat(s)).parDefaut === true,
        `${d4.statut} ${JSON.stringify(fin4)}`,
      );
    }

    // Le ménage du démarrage n'efface que ses propres restes.
    const perso = join((await etat(s)).dossier, "a-garder.txt");
    mkdirSync(dirname(perso), { recursive: true });
    writeFileSync(perso, "à moi");
    writeFileSync(join(dirname(perso), "Ancien-Modele.gguf.partiel"), "reste");
    await arreter();
    await demarrer("llamacpp", DONNEES);
    await attendre(500);
    verifier("ménage au démarrage : un `.partiel` hors catalogue est effacé, un fichier d'une personne reste", existsSync(perso) && !existsSync(join(dirname(perso), "Ancien-Modele.gguf.partiel")), readdirSync(dirname(perso)).join(","));
    await arreter();
  }
} catch (err) {
  echecs.push(String(err));
  console.log(`  ✗ ${err instanceof Error ? err.stack : err}`);
} finally {
  await arreter();
  for (const v of volumes) {
    try {
      execFileSync("/usr/bin/hdiutil", ["detach", v, "-force"], { stdio: "ignore" });
    } catch {
      /* déjà démonté */
    }
  }
  if (echecs.length && process.env.HELIX_ESSAI_BAVARD) console.log(journal.slice(-4000));
  rmSync(TMP, { recursive: true, force: true });
}
console.log(`\n${reussis} vérification(s) réussie(s), ${echecs.length} échec(s).`);
process.exit(echecs.length ? 1 : 0);
