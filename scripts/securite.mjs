/*
 * Batterie de sécurité : attaque une instance jetable de l'extérieur.
 *
 *   npm run securite
 *
 * Elle démarre une passerelle neuve sur un port libre, avec un dossier de
 * données temporaire et aucun moteur de modèles, puis se comporte comme
 * quelqu'un sur le réseau : sans jeton, avec le jeton d'un poste mais sans
 * séance, avec un billet déjà servi, depuis une origine étrangère, avec des
 * chemins détournés, en devinant des mots de passe. Chaque vérification dit
 * ce qu'elle attend et ce qu'elle a obtenu.
 *
 * Pourquoi une batterie plutôt qu'une relecture : les défauts de sécurité
 * trouvés jusqu'ici (voir PROJET.md § 4) étaient tous des oublis — une route
 * ajoutée sans barrière, un en-tête absent d'une liste. Une relecture les
 * rate précisément parce qu'ils sont absents. Une batterie qui frappe à
 * chaque porte ne les rate pas, et se rejoue à chaque version.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

const portLibre = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

const PORT = await portLibre();
const DONNEES = mkdtempSync(join(tmpdir(), "helix-securite-"));
const G = `http://127.0.0.1:${PORT}`;

/*
 * Doublures pour la section 6 ter (employés et bases de connaissances,
 * ajoutée le 25/09/2026), hors du dossier de données :
 *  - un faux modèle d'embeddings, servi ici même : un vecteur par sac de mots
 *    haché, assez pour qu'une question retrouve le passage qui partage ses
 *    mots. Aucun vrai modèle, aucun LM Studio : la batterie reste sans moteur ;
 *  - un faux OpenClaw : `gateway run` ouvre son port et attend, toute autre
 *    commande répond « {} ». Il n'appelle jamais le modèle ; la batterie
 *    joue elle-même le rôle d'OpenClaw auprès du serveur d'outils.
 * Le profil éteint LM Studio et exo : ces essais ne touchent à aucun moteur
 * de la machine.
 */
const AUX = mkdtempSync(join(tmpdir(), "helix-securite-aux-"));
const PORT_EMBED = await portLibre();
const PORT_OPENCLAW = await portLibre();
const { createServer: serveurHttp } = await import("node:http");
const vecteur = (texte) => {
  const v = new Array(64).fill(0.01);
  for (const mot of texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)) {
    if (mot.length < 3) continue;
    let h = 0;
    for (const c of mot) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % 64] += 1;
  }
  return v;
};
const fauxModele = serveurHttp((req, res) => {
  let corps = "";
  req.on("data", (b) => (corps += b));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "essai-embed-texte" }, { id: "essai-chat" }] }));
    if (req.url === "/v1/embeddings") {
      const entree = JSON.parse(corps || "{}").input ?? [];
      return res.end(JSON.stringify({ data: (Array.isArray(entree) ? entree : [entree]).map((t, index) => ({ index, embedding: vecteur(String(t)) })) }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
});
await new Promise((ok) => fauxModele.listen(PORT_EMBED, "127.0.0.1", ok));
{
  const { mkdirSync, writeFileSync, chmodSync, symlinkSync } = await import("node:fs");
  mkdirSync(join(AUX, "openclaw", "bin"), { recursive: true });
  writeFileSync(join(AUX, "openclaw", "package.json"), JSON.stringify({ name: "openclaw", version: "2026.9.4" }));
  writeFileSync(
    join(AUX, "openclaw", "bin", "openclaw"),
    [
      "#!/usr/bin/env node",
      'const a = process.argv.slice(2);',
      'if (a[0] === "gateway" && a[1] === "run") {',
      '  const port = Number(a[a.indexOf("--port") + 1]);',
      '  require("node:http").createServer((q, r) => r.end("ok")).listen(port, "127.0.0.1");',
      "  const parent = process.ppid;",
      "  setInterval(() => { try { process.kill(parent, 0); } catch { process.exit(0); } }, 1000);",
      '  process.on("SIGTERM", () => process.exit(0));',
      "} else {",
      '  process.stdout.write(a[0] === "automations" || a[0] === "sessions" ? "[]" : "{}");',
      "}",
    ].join("\n"),
  );
  chmodSync(join(AUX, "openclaw", "bin", "openclaw"), 0o755);
  // Le Node de cet OpenClaw : celui qui fait tourner la batterie.
  symlinkSync(process.execPath, join(AUX, "openclaw", "bin", "node"));
  writeFileSync(
    join(AUX, "profil.json"),
    JSON.stringify({
      openclaw: { chemin: join(AUX, "openclaw", "bin", "openclaw"), port: PORT_OPENCLAW },
      backends: [
        { id: "lmstudio", enabled: false },
        { id: "exo", enabled: false },
        { id: "essai", label: "Essai", baseUrl: `http://127.0.0.1:${PORT_EMBED}/v1` },
      ],
    }),
  );
}

const passerelle = spawn(process.execPath, [join(RACINE, "gateway", "src", "index.ts")], {
  env: {
    ...process.env,
    HELIX_CONFIG: join(AUX, "profil.json"),
    HELIX_GATEWAY_PORT: String(PORT),
    HELIX_DATA_DIR: DONNEES,
    // Aucun moteur : la sécurité ne dépend pas des modèles.
    HELIX_LMSTUDIO_URL: "http://127.0.0.1:9/v1",
    HELIX_EXO_URL: "http://127.0.0.1:9/v1",
    // Vide exprès : une variable vide doit valoir « boucle locale », pas « partout ».
    HELIX_GATEWAY_HOST: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let journal = "";
passerelle.stdout.on("data", (b) => (journal += b));
passerelle.stderr.on("data", (b) => (journal += b));

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try {
    await fetch(`${G}/health`);
    break;
  } catch {
    await attendre(250);
  }
}

let reussis = 0;
const echecs = [];
function verifier(nom, condition, obtenu) {
  if (condition) {
    reussis++;
    console.log(`  ✓ ${nom}`);
  } else {
    echecs.push(nom);
    console.log(`  ✗ ${nom}  —  obtenu : ${obtenu}`);
  }
}

const JETON = readFileSync(join(DONNEES, "instance-token"), "utf8").trim();
const avecJeton = { "Content-Type": "application/json", Authorization: `Bearer ${JETON}` };
const appel = (chemin, options = {}) => fetch(`${G}${chemin}`, { redirect: "manual", ...options });

/* ------------------------------------------------------------------------- */
console.log("\n1. Sans jeton d'instance, rien ne s'ouvre");
const ROUTES = [
  ["GET", "/helix/models"], ["GET", "/v1/models"], ["POST", "/v1/chat/completions"],
  ["GET", "/helix/data/sessions"], ["GET", "/helix/export"], ["GET", "/helix/audit"],
  ["GET", "/helix/espace/fichier?chemin=README.md"], ["GET", "/helix/courrier"],
  ["GET", "/helix/connecteurs"], ["GET", "/helix/telecharger"], ["GET", "/helix/telecharger/macos"],
  ["GET", "/helix/employes"], ["GET", "/helix/auth/sessions"], ["POST", "/helix/auth/create"],
  ["POST", "/helix/computer/action"], ["GET", "/helix/code/session"], ["POST", "/helix/flux/ticket"],
  ["GET", "/helix/bibliotheque"], ["GET", "/helix/reunions"], ["GET", "/helix/fournisseurs"],
  ["POST", "/helix/openclaw/installer"], ["GET", "/helix/reseau"], ["POST", "/helix/invitations/inviter"],
  ["GET", "/helix/connaissances"], ["POST", "/helix/connaissances/chercher"],
  ["GET", "/helix/entrainement"], ["POST", "/helix/entrainement/lancer"],
];
for (const [methode, chemin] of ROUTES) {
  const r = await appel(chemin, { method: methode, headers: { "Content-Type": "application/json" }, body: methode === "POST" ? "{}" : undefined });
  verifier(`${methode} ${chemin} → 401`, r.status === 401, r.status);
}
{
  const r = await appel("/helix/models", { headers: { Authorization: "Bearer faux-jeton-de-la-bonne-longueur-xx" } });
  verifier("un jeton faux est refusé", r.status === 401, r.status);
}

/* ------------------------------------------------------------------------- */
console.log("\n2. Le jeton d'un poste ne suffit pas pour les données d'une personne");
const SEANCE_REQUISE = [
  ["GET", "/helix/data/sessions"], ["GET", "/helix/export"], ["GET", "/helix/audit"],
  ["GET", "/helix/espace/fichier?chemin=README.md"], ["GET", "/helix/telecharger"],
  ["GET", "/helix/telecharger/macos"], ["GET", "/helix/employes"], ["GET", "/helix/bibliotheque"],
  ["GET", "/helix/reunions"], ["GET", "/helix/fournisseurs"], ["POST", "/helix/flux/ticket"],
  ["GET", "/helix/usage"], ["POST", "/helix/openclaw/installer"],
  // Ajoutés le 24/09/2026 : images, import depuis les logiciels du poste, machine de l'agent.
  ["GET", "/helix/images"], ["POST", "/helix/images/installer"], ["POST", "/helix/images/creer"],
  ["POST", "/helix/images/choisir"], ["POST", "/helix/images/desinstaller"],
  ["GET", "/helix/images/fichier/0123456789abcdef0123456789abcdef"], ["GET", "/helix/images/travail/abc"],
  ["GET", "/helix/import/logiciels"], ["GET", "/helix/import/logiciel/claude-code"],
  ["GET", "/helix/machine"], ["POST", "/helix/machine/effacer"],
  // Ajoutés le 25/09/2026 : bases de connaissances (connaissances.ts).
  ["GET", "/helix/connaissances"], ["POST", "/helix/connaissances"], ["GET", "/helix/connaissances/documents"],
  ["POST", "/helix/connaissances/chercher"], ["GET", "/helix/connaissances/kb_inexistante"],
  ["POST", "/helix/connaissances/kb_inexistante/documents"], ["POST", "/helix/connaissances/kb_inexistante/supprimer"],
  // Ajoutés le 25/09/2026 : entraîner un modèle (installer, projets, calculs, LM Studio).
  ["GET", "/helix/entrainement"], ["POST", "/helix/entrainement/installer"], ["POST", "/helix/entrainement/desinstaller"],
  ["POST", "/helix/entrainement/projets"], ["GET", "/helix/entrainement/projet?id=0123456789abcdef01234567"],
  ["POST", "/helix/entrainement/lancer"], ["POST", "/helix/entrainement/publier"], ["POST", "/helix/entrainement/supprimer"],
];
for (const [methode, chemin] of SEANCE_REQUISE) {
  const r = await appel(chemin, { method: methode, headers: avecJeton, body: methode === "POST" ? "{}" : undefined });
  verifier(`${methode} ${chemin} sans séance → 401`, r.status === 401, r.status);
}
{
  const r = await appel("/v1/chat/completions", {
    method: "POST", headers: avecJeton,
    body: JSON.stringify({ tools: true, messages: [{ role: "user", content: "liste mes fichiers" }] }),
  });
  verifier("faire agir l'agent (tools: true) sans séance → 401", r.status === 401, r.status);
}

/* ------------------------------------------------------------------------- */
console.log("\n3. Comptes et mots de passe");
{
  const court = await appel("/helix/auth/create", {
    method: "POST", headers: avecJeton,
    body: JSON.stringify({ fullName: "Court", email: "court@example.test", password: "court" }),
  });
  verifier("un mot de passe trop court est refusé", court.status >= 400 && court.status < 500, court.status);
}
const premier = await appel("/helix/auth/create", {
  method: "POST", headers: avecJeton,
  body: JSON.stringify({ fullName: "Première", email: "premiere@example.test", password: "Mot2PasseSolide!42" }),
});
const compte = await premier.json();
verifier("le premier compte s'ouvre (amorçage)", premier.status === 200 && compte.session?.token, premier.status);
const SEANCE = compte.session?.token;
const avecSeance = { ...avecJeton, "X-Helix-Session": SEANCE };
/*
 * Une collègue, inscrite par la première comme le fait l'écran « Équipe », et
 * connectée avant les essais de force brute (qui freinent toute
 * authentification depuis cette adresse). Elle sert aux images d'un Chat
 * partagé (section 7).
 */
const MDP_B = "Autre2PasseSolide!57";
const creeB = await appel("/helix/auth/create", {
  method: "POST", headers: avecSeance,
  body: JSON.stringify({ fullName: "Collègue", email: "collegue@example.test", password: MDP_B }),
});
const compteB = (await creeB.json()).account;
const connexionB = await (await appel("/helix/auth/verify", {
  method: "POST", headers: avecJeton, body: JSON.stringify({ accountId: compteB?.id, password: MDP_B }),
})).json();
const SEANCE_B = connexionB.session?.token;
const avecSeanceB = { ...avecJeton, "X-Helix-Session": SEANCE_B };
verifier("un collègue inscrit par un compte connecté peut se connecter", Boolean(compteB?.id && SEANCE_B), `${creeB.status} ${JSON.stringify(connexionB).slice(0, 80)}`);
{
  const r = await appel("/helix/auth/create", {
    method: "POST", headers: avecJeton,
    body: JSON.stringify({ fullName: "Intrus", email: "intrus@example.test", password: "Mot2PasseSolide!42" }),
  });
  verifier("un second compte ne s'ouvre pas sans invitation", r.status === 401 || r.status === 403, r.status);
}
{
  const mauvais = await appel("/helix/auth/verify", {
    method: "POST", headers: avecJeton, body: JSON.stringify({ accountId: compte.account.id, password: "pas-le-bon-mot-de-passe" }),
  });
  const inconnu = await appel("/helix/auth/verify", {
    method: "POST", headers: avecJeton, body: JSON.stringify({ accountId: "u_inexistant", password: "pas-le-bon-mot-de-passe" }),
  });
  verifier("mauvais mot de passe refusé", mauvais.status === 401, mauvais.status);
  verifier(
    "compte inconnu et mauvais mot de passe répondent pareil (pas d'énumération)",
    mauvais.status === inconnu.status,
    `${mauvais.status} contre ${inconnu.status}`,
  );
}
{
  let bloque = false;
  for (let i = 0; i < 40 && !bloque; i++) {
    const r = await appel("/helix/auth/verify", {
      method: "POST", headers: avecJeton, body: JSON.stringify({ accountId: compte.account.id, password: `essai-${i}` }),
    });
    if (r.status === 429) bloque = true;
  }
  verifier("deviner un mot de passe est freiné (429)", bloque, "jamais freiné en 40 essais");
}
{
  const brut = readFileSync(join(DONNEES, "accounts.json"), "utf8");
  verifier("aucun mot de passe en clair sur le disque", !brut.includes("Mot2PasseSolide!42"), "mot de passe trouvé en clair");
  const fichiers = readdirSync(DONNEES).filter((f) => f.endsWith(".json"));
  const fuite = fichiers.find((f) => readFileSync(join(DONNEES, f), "utf8").includes(SEANCE));
  verifier("le jeton de séance n'est stocké nulle part en clair", !fuite, fuite);
}

/* ------------------------------------------------------------------------- */
console.log("\n4. Billets d'une minute");
{
  const b = await (await appel("/helix/flux/ticket", { method: "POST", headers: avecSeance })).json();
  const un = await appel(`/helix/telecharger?flux=${b.billet}`);
  const deux = await appel(`/helix/telecharger?flux=${b.billet}`);
  verifier("un billet ouvre une fois", un.status === 200, un.status);
  verifier("le même billet ne rouvre pas", deux.status === 401, deux.status);
  const faux = await appel(`/helix/telecharger?flux=billet-invente`);
  verifier("un billet inventé ne vaut rien", faux.status === 401, faux.status);
}

/* ------------------------------------------------------------------------- */
console.log("\n5. Navigateur et origine");
{
  const r = await appel("/helix/models", { headers: { ...avecJeton, Origin: "https://site-malveillant.example" } });
  verifier("une origine étrangère ne reçoit pas d'autorisation CORS", !r.headers.get("access-control-allow-origin"), r.headers.get("access-control-allow-origin"));
  const pre = await appel("/helix/models", { method: "OPTIONS", headers: { Origin: "https://site-malveillant.example", "Access-Control-Request-Method": "GET" } });
  verifier("ni en préparation (OPTIONS)", !pre.headers.get("access-control-allow-origin"), pre.headers.get("access-control-allow-origin"));
  const h = await appel("/helix/models", { headers: avecJeton });
  verifier("X-Content-Type-Options: nosniff", h.headers.get("x-content-type-options") === "nosniff", h.headers.get("x-content-type-options"));
  verifier("Cache-Control: no-store", (h.headers.get("cache-control") ?? "").includes("no-store"), h.headers.get("cache-control"));
  verifier("Content-Security-Policy restrictive", (h.headers.get("content-security-policy") ?? "").includes("default-src 'none'"), h.headers.get("content-security-policy"));
  verifier("Referrer-Policy: no-referrer", h.headers.get("referrer-policy") === "no-referrer", h.headers.get("referrer-policy"));
}

/* ------------------------------------------------------------------------- */
console.log("\n6. Chemins détournés");
for (const chemin of ["../../../../etc/passwd", "/etc/passwd", "..%2F..%2Fetc%2Fpasswd", "~/.ssh/id_rsa"]) {
  const r = await appel(`/helix/espace/fichier?chemin=${encodeURIComponent(chemin)}`, { headers: avecSeance });
  const corps = await r.text();
  verifier(`lire « ${chemin} » hors du dossier de travail est refusé`, r.status >= 400 && !corps.includes("root:"), `${r.status} ${corps.slice(0, 60)}`);
}
{
  const r = await appel("/helix/telecharger/..%2F..%2Fetc", { headers: avecSeance });
  verifier("télécharger un chemin arbitraire est impossible", r.status === 404, r.status);
}
{
  const r = await appel("/helix/data/..%2Faccounts", { headers: avecSeance });
  const corps = await r.text();
  verifier("lire une collection par un chemin détourné est refusé", !corps.includes("passwordHash") && !corps.includes("hash"), `${r.status} ${corps.slice(0, 60)}`);
}

/*
 * Serveur d'outils de l'agent de code (outilsCode.ts, ajouté le 25/09/2026) :
 * il fait agir les connecteurs sans séance, sur la seule preuve de la clé
 * écrite dans la configuration d'OpenCode. Ni le jeton d'un poste, ni une
 * séance, ni une clé devinée ne doivent l'ouvrir.
 */
{
  const initialiser = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list", params: {} });
  const mcp = { Accept: "application/json, text/event-stream" };
  const sansJeton = await appel("/helix/code/outils", { method: "POST", headers: { "Content-Type": "application/json", ...mcp }, body: initialiser });
  verifier("outils de l'agent de code sans jeton → 401", sansJeton.status === 401, sansJeton.status);
  const auJeton = await appel("/helix/code/outils", { method: "POST", headers: { ...avecSeance, ...mcp }, body: initialiser });
  verifier("outils de l'agent de code au jeton et à la séance, sans la clé → 403", auJeton.status === 403, auJeton.status);
  const fausseCle = await appel("/helix/code/outils", { method: "POST", headers: { ...avecSeance, ...mcp, "X-Helix-Cle": "cle-devinee-de-la-bonne-longueur-00000" }, body: initialiser });
  verifier("outils de l'agent de code avec une clé devinée → 403", fausseCle.status === 403, fausseCle.status);
}

/* ------------------------------------------------------------------------- */
console.log("\n6 bis. Bases de connaissances");
{
  const nom = "Base-Secrete-Essai-9431";
  const c = await appel("/helix/connaissances", { method: "POST", headers: avecSeance, body: JSON.stringify({ nom, visibilite: "prive" }) });
  const base = (await c.json()).base;
  verifier("créer une base avec une séance", c.status === 200 && base?.id?.startsWith("kb_"), c.status);
  const brut = readdirSync(DONNEES).filter((f) => f.endsWith(".json")).some((f) => readFileSync(join(DONNEES, f), "utf8").includes(nom));
  verifier("le nom d'une base n'est pas en clair sur le disque", !brut, "trouvé en clair");
  const inconnue = await appel("/helix/connaissances/kb_inexistante", { headers: avecSeance });
  verifier("une base inconnue répond 404", inconnue.status === 404, inconnue.status);
  const detour = await appel("/helix/connaissances/..%2F..%2Faccounts", { headers: avecSeance });
  const corpsDetour = await detour.text();
  verifier("un identifiant détourné ne lit rien", detour.status === 404 && !corpsDetour.includes("hash"), `${detour.status} ${corpsDetour.slice(0, 60)}`);
  const doc = await appel(`/helix/connaissances/${base?.id}/documents`, { method: "POST", headers: avecSeance, body: JSON.stringify({ documents: ["bib_inexistant"] }) });
  verifier("ajouter un document qu'on ne voit pas est refusé", doc.status === 404, doc.status);
  const r = await appel("/helix/connaissances/chercher", {
    method: "POST", headers: avecSeance, body: JSON.stringify({ bases: ["kb_dun_autre"], question: "salaire du directeur" }),
  });
  const rj = await r.json();
  verifier("chercher dans une base qu'on ne voit pas ne rend rien", r.status === 200 && rj.passages.length === 0 && rj.ignorees === 1, JSON.stringify(rj).slice(0, 80));
}

/* ------------------------------------------------------------------------- */
console.log("\n7. Images d'un Chat partagé : qui voit le Chat, et personne d'autre");
{
  /*
   * Créer une vraie image demande 6 Go de modèles : on pose à la main ce que
   * la création laisse (images.ts) — le fichier et sa ligne au registre — puis
   * les Chats, par la collection `sessions` comme le fait l'écran.
   */
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { randomBytes } = await import("node:crypto");
  const A = compte.account.id;
  const B = compteB.id;
  const idImage = randomBytes(16).toString("hex");
  const idAncienne = randomBytes(16).toString("hex");
  const idAutreChat = randomBytes(16).toString("hex");
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a3d40000000049454e44ae426082", "hex");
  mkdirSync(join(DONNEES, "images"), { recursive: true });
  for (const id of [idImage, idAncienne, idAutreChat]) writeFileSync(join(DONNEES, "images", `${id}.png`), PNG);
  const quand = new Date().toISOString();
  writeFileSync(join(DONNEES, "images", "index.json"), JSON.stringify({
    [idImage]: { pour: A, chat: "chat-partage", description: "essai", invite: "test", date: quand, largeur: 1, hauteur: 1 },
    // Créée avant que le Chat soit retenu avec l'image : la règle de repli (Chat de l'auteur qui la contient).
    [idAncienne]: { pour: A, description: "ancienne", invite: "test", date: quand, largeur: 1, hauteur: 1 },
    // Créée dans un Chat privé de A, qu'elle ne partage pas.
    [idAutreChat]: { pour: A, chat: "chat-prive", description: "privée", invite: "test", date: quand, largeur: 1, hauteur: 1 },
  }));
  const message = (id) => ({ id: `m-${id.slice(0, 6)}`, role: "assistant", content: "Image créée", image: { id, largeur: 1, hauteur: 1, description: "essai" }, createdAt: quand });
  const chat = (id, messages, partage = []) => ({
    id, title: id, ownerId: A, visibility: "prive", sharedGroupIds: [], sharedWith: partage, organisationId: "org",
    origin: "local", messages, createdAt: quand, updatedAt: quand,
  });
  const ecrireChats = (entete, valeur) => appel("/helix/data/sessions", { method: "PUT", headers: entete, body: JSON.stringify({ value: valeur }) });
  const voir = async (id, entete) => (await appel(`/helix/images/fichier/${id}`, { headers: entete })).status;

  await ecrireChats(avecSeance, [chat("chat-partage", [message(idImage), message(idAncienne)]), chat("chat-prive", [message(idAutreChat)])]);
  verifier("l'auteur voit son image", (await voir(idImage, avecSeance)) === 200, await voir(idImage, avecSeance));
  verifier("une collègue ne voit pas l'image d'un Chat qui ne lui est pas partagé (404)", (await voir(idImage, avecSeanceB)) === 404, await voir(idImage, avecSeanceB));
  verifier("ni l'ancienne image de ce Chat (404)", (await voir(idAncienne, avecSeanceB)) === 404, await voir(idAncienne, avecSeanceB));

  const partage = [{ email: "collegue@example.test", userId: B, status: "actif", sharedAt: quand }];
  await ecrireChats(avecSeance, [chat("chat-partage", [message(idImage), message(idAncienne)], partage), chat("chat-prive", [message(idAutreChat)])]);
  const vueB = await appel(`/helix/images/fichier/${idImage}`, { headers: avecSeanceB });
  verifier("Chat partagé : la collègue voit l'image", vueB.status === 200 && (await vueB.arrayBuffer()).byteLength === PNG.length, vueB.status);
  verifier("sans la garder en cache (Cache-Control: no-store)", (vueB.headers.get("cache-control") ?? "").includes("no-store"), vueB.headers.get("cache-control"));
  verifier("Chat partagé : l'ancienne image aussi (Chat de son auteur qui la contient)", (await voir(idAncienne, avecSeanceB)) === 200, await voir(idAncienne, avecSeanceB));
  verifier("une image d'un autre Chat de l'auteur reste fermée (404)", (await voir(idAutreChat, avecSeanceB)) === 404, await voir(idAutreChat, avecSeanceB));

  // L'identifiant recopié dans un Chat de la collègue : il n'ouvre rien.
  const lusB = (await (await appel("/helix/data/sessions", { headers: avecSeanceB })).json()).value;
  const chatDeB = { ...chat("chat-de-b", [message(idAutreChat)]), ownerId: B };
  await ecrireChats(avecSeanceB, [...lusB, chatDeB]);
  verifier("un identifiant recopié dans son propre Chat n'ouvre pas l'image (404)", (await voir(idAutreChat, avecSeanceB)) === 404, await voir(idAutreChat, avecSeanceB));
  verifier("l'auteur voit toujours son image", (await voir(idAutreChat, avecSeance)) === 200, await voir(idAutreChat, avecSeance));

  // Partage retiré : la porte se referme aussitôt.
  const lusA = (await (await appel("/helix/data/sessions", { headers: avecSeance })).json()).value;
  await ecrireChats(avecSeance, lusA.map((s) => (s.id === "chat-partage" ? { ...s, sharedWith: [] } : s)));
  verifier("partage retiré : la collègue ne voit plus l'image (404)", (await voir(idImage, avecSeanceB)) === 404, await voir(idImage, avecSeanceB));

  // Chat ouvert à l'organisation : tout le monde le voit, donc son image.
  const lusA2 = (await (await appel("/helix/data/sessions", { headers: avecSeance })).json()).value;
  await ecrireChats(avecSeance, lusA2.map((s) => (s.id === "chat-partage" ? { ...s, visibility: "organisation" } : s)));
  verifier("Chat ouvert à l'organisation : la collègue voit l'image", (await voir(idImage, avecSeanceB)) === 200, await voir(idImage, avecSeanceB));

  const inventee = randomBytes(16).toString("hex");
  verifier("une image inventée répond 404", (await voir(inventee, avecSeance)) === 404, await voir(inventee, avecSeance));
  verifier("un identifiant mal formé répond 404", (await voir("..%2Findex.json", avecSeance)) === 404, await voir("..%2Findex.json", avecSeance));
}

/* ------------------------------------------------------------------------- */
console.log("\n7 bis. Entraînement : un projet ne se désigne que par son identifiant");
{
  for (const id of ["../../accounts", "..%2F..%2Faccounts", "0123456789abcdef01234567"]) {
    const r = await appel(`/helix/entrainement/projet?id=${encodeURIComponent(id)}`, { headers: avecSeance });
    const corps = await r.text();
    verifier(`projet « ${id} » introuvable, rien de lu`, r.status === 404 && !corps.includes("passwordHash"), `${r.status} ${corps.slice(0, 60)}`);
  }
  const cree = await appel("/helix/entrainement/projets", { method: "POST", headers: avecSeance, body: JSON.stringify({ nom: "Essai ../../ ; rm -rf /" }) });
  const projet = await cree.json();
  verifier("un projet se crée sous un identifiant tiré au sort", cree.status === 200 && /^[0-9a-f]{24}$/.test(projet.id ?? ""), `${cree.status} ${projet.id}`);
  const brut = readdirSync(join(DONNEES, "entrainement")).map((n) => readFileSync(join(DONNEES, "entrainement", n, "projet.hlx")).subarray(0, 5).toString("latin1"));
  verifier("le projet est chiffré sur le disque", brut.length > 0 && brut.every((b) => b === "HLXF1"), brut.join(","));
  const suppr = await appel("/helix/entrainement/supprimer", { method: "POST", headers: avecSeance, body: JSON.stringify({ projet: projet.id }) });
  verifier("son auteur peut le supprimer", suppr.status === 200, suppr.status);
}

/* ------------------------------------------------------------------------- */
console.log("\n6 ter. Employés OpenClaw et bases de connaissances : seulement ce qui est ouvert à toute l'équipe");
{
  /*
   * Un employé cherche dans les bases de son agent par l'outil
   * `connaissances__chercher` de son serveur d'outils (serveurOutils.ts). La
   * batterie tient le rôle d'OpenClaw : elle appelle ce serveur comme lui,
   * avec le jeton d'instance et la clé écrite dans le dossier de données.
   * Mots de contrôle : LOTUS-2468 (document ouvert à l'équipe, dans une base
   * ouverte : doit sortir), ZEBRE-7731 (document privé du propriétaire de
   * l'agent), MANGUE-5519 (document privé d'une collègue, dans sa base privée
   * et dans une base qu'elle a ouverte à l'équipe) : ne doivent jamais sortir.
   */
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 24 || (maj === 24 && min < 16)) {
    console.log(`  · Node ${process.versions.node} : il faut 24.16 pour le faux OpenClaw, section sautée`);
  } else {
    const document = async (entete, nom, texte, visibilite) => {
      const r = await appel("/helix/bibliotheque/documents", {
        method: "POST", headers: entete,
        body: JSON.stringify({ nom, contenu: Buffer.from(texte).toString("base64"), texte, visibilite }),
      });
      return (await r.json()).element?.id;
    };
    const base = async (entete, nom, visibilite, documents) => {
      const b = (await (await appel("/helix/connaissances", { method: "POST", headers: entete, body: JSON.stringify({ nom, visibilite }) })).json()).base;
      await appel(`/helix/connaissances/${b.id}/documents`, { method: "POST", headers: entete, body: JSON.stringify({ documents }) });
      return b.id;
    };
    const equipe = await document(avecSeance, "Reglement-equipe.txt", "Règlement de l'équipe. Le code de la salle de réunion est LOTUS-2468.", "organisation");
    const priveA = await document(avecSeance, "Notes-personnelles-A.txt", "Notes personnelles. Le code du coffre personnel est ZEBRE-7731.", "prive");
    const priveB = await document(avecSeanceB, "Dossier-Bernard.txt", "Confidentiel. Le salaire confidentiel de Bernard est MANGUE-5519.", "prive");
    const kbEquipe = await base(avecSeance, "Base-Equipe-Essai", "organisation", [equipe, priveA]);
    const kbPriveeA = await base(avecSeance, "Base-Privee-A-Essai-7302", "prive", [equipe]);
    const kbPriveeB = await base(avecSeanceB, "Base-Privee-B-Essai-8841", "prive", [priveB]);
    const kbOuverteB = await base(avecSeanceB, "Base-Ouverte-B-Essai", "organisation", [priveB]);

    // L'indexation est en file : on attend que les quatre bases soient prêtes.
    const pretes = async () => {
      for (const [id, entete] of [[kbEquipe, avecSeance], [kbPriveeA, avecSeance], [kbPriveeB, avecSeanceB], [kbOuverteB, avecSeanceB]]) {
        const b = (await (await appel(`/helix/connaissances/${id}`, { headers: entete })).json()).base;
        if (!b || b.documents.length === 0 || b.documents.some((d) => d.etat !== "pret")) return false;
      }
      return true;
    };
    let indexees = false;
    for (let i = 0; i < 60 && !(indexees = await pretes()); i++) await attendre(500);
    verifier("documents indexés par le faux modèle d'embeddings", indexees, "pas prêts en 30 s");

    const deploiement = await appel("/helix/employes", {
      method: "POST", headers: avecSeance,
      body: JSON.stringify({
        nom: "Essai bases", poste: "Tu réponds aux questions de l'équipe.", outils: [], missions: [],
        visibilite: "organisation", connaissances: [kbEquipe, kbPriveeA, kbPriveeB, kbOuverteB, "../../accounts"],
      }),
    });
    const employe = (await deploiement.json()).employe;
    verifier("un employé se déploie avec les bases de son agent", deploiement.status === 200 && employe?.connaissances?.length === 4, `${deploiement.status} ${JSON.stringify(employe?.connaissances)}`);
    const sansBases = (await (await appel("/helix/employes", {
      method: "POST", headers: avecSeance,
      body: JSON.stringify({ nom: "Essai sans bases", poste: "Tu aides.", outils: [], missions: [], visibilite: "organisation" }),
    })).json()).employe;

    const CLE = readFileSync(join(DONNEES, "openclaw", ".cle"), "utf8").trim();
    const mcp = (id, methode, params, cle = CLE) =>
      appel(`/helix/employes/${id}/outils`, {
        method: "POST",
        headers: { ...avecJeton, Accept: "application/json, text/event-stream", ...(cle ? { "X-Helix-Cle": cle } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: methode, params }),
      });
    const chercher = async (question, id = employe?.id, cle = CLE) => {
      const r = await mcp(id, "tools/call", { name: "connaissances__chercher", arguments: { question } }, cle);
      return { status: r.status, texte: await r.text() };
    };

    const liste = await (await mcp(employe?.id, "tools/list", {})).text();
    verifier("l'outil connaissances__chercher est proposé à l'employé qui a des bases", liste.includes("connaissances__chercher"), liste.slice(0, 80));
    const listeSans = await (await mcp(sansBases?.id, "tools/list", {})).text();
    verifier("il n'est pas proposé à un employé sans bases", !listeSans.includes("connaissances__chercher"), listeSans.slice(0, 80));
    const horsDesSiens = await chercher("code de la salle de réunion", sansBases?.id);
    verifier("un employé sans bases ne peut pas l'appeler", !horsDesSiens.texte.includes("LOTUS") && horsDesSiens.texte.includes("ne fait pas partie des tiens"), horsDesSiens.texte.slice(0, 100));

    const trouve = await chercher("Quel est le code de la salle de réunion ?");
    verifier("l'employé trouve le passage d'un document ouvert à l'équipe, avec sa source", trouve.status === 200 && trouve.texte.includes("LOTUS-2468") && trouve.texte.includes("Reglement-equipe.txt"), trouve.texte.slice(0, 120));
    const coffre = await chercher("Quel est le code du coffre personnel ?");
    verifier("il ne lit pas un document privé du propriétaire de l'agent, même dans une base ouverte", !coffre.texte.includes("ZEBRE-7731") && !coffre.texte.includes("Notes-personnelles"), coffre.texte.slice(0, 120));
    const salaire = await chercher("Quel est le salaire confidentiel de Bernard ?");
    verifier("ni un document privé d'une collègue (base privée, ou base qu'elle a ouverte)", !salaire.texte.includes("MANGUE-5519") && !salaire.texte.includes("Dossier-Bernard"), salaire.texte.slice(0, 120));
    // Une question qui vise les trois documents : rien de privé, quel que soit le classement.
    const tout = await chercher("code salle réunion coffre personnel salaire confidentiel Bernard");
    verifier("une question qui vise tout ne rend rien de privé", tout.status === 200 && !tout.texte.includes("ZEBRE") && !tout.texte.includes("MANGUE"), tout.texte.slice(0, 120));
    verifier("ni le nom d'une base privée", !tout.texte.includes("Base-Privee-A") && !tout.texte.includes("Base-Privee-B"), "nom de base privée trouvé");

    // Base privée seule : l'employé le dit, sans rien rendre.
    await appel(`/helix/employes/${employe?.id}`, { method: "POST", headers: avecSeance, body: JSON.stringify({ connaissances: [kbPriveeA, kbPriveeB] }) });
    const fermees = await chercher("Quel est le code de la salle de réunion ?");
    verifier("bases privées seulement : aucun passage, même d'un document ouvert", !fermees.texte.includes("LOTUS") && fermees.texte.includes("accessible"), fermees.texte.slice(0, 120));

    const sansCle = await chercher("code de la salle de réunion", employe?.id, "");
    verifier("le serveur d'outils sans la clé → 403", sansCle.status === 403, sansCle.status);
    const fausseCle = await chercher("code de la salle de réunion", employe?.id, "cle-devinee-de-la-bonne-longueur-000000000000000");
    verifier("avec une clé devinée → 403", fausseCle.status === 403, fausseCle.status);
    const seanceSeule = await appel(`/helix/employes/${employe?.id}/outils`, {
      method: "POST", headers: { ...avecSeanceB, Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "connaissances__chercher", arguments: { question: "code" } } }),
    });
    verifier("une séance de collègue sans la clé → 403", seanceSeule.status === 403, seanceSeule.status);

    const { readFileSync: lire } = await import("node:fs");
    const fiche = lire(join(DONNEES, "openclaw", "employes", employe?.id ?? "x", "SOUL.md"), "utf8");
    verifier("sa fiche de poste nomme l'outil, pas les bases", fiche.includes("connaissances__chercher") && !fiche.includes("Base-Privee"), fiche.slice(0, 80));
  }
}

/* ------------------------------------------------------------------------- */
console.log("\n8. Fin de séance");
{
  const r1 = await appel("/helix/auth/revoke", { method: "POST", headers: avecSeance, body: JSON.stringify({ toutes: true }) });
  const r2 = await appel("/helix/export", { headers: avecSeance });
  verifier("fermer toutes ses séances les rend inutilisables", r1.status === 200 && r2.status === 401, `${r1.status} puis ${r2.status}`);
}

/* ------------------------------------------------------------------------- */
console.log("\n9. Rien de secret dans le journal du serveur");
verifier("le jeton d'instance n'apparaît pas dans le journal", !journal.includes(JETON), "trouvé");
verifier("le jeton de séance n'apparaît pas dans le journal", !SEANCE || !journal.includes(SEANCE), "trouvé");
verifier("le mot de passe n'apparaît pas dans le journal", !journal.includes("Mot2PasseSolide!42") && !journal.includes(MDP_B), "trouvé");
{
  /*
   * Joindre la passerelle par l'adresse réseau de la machine : elle ne doit
   * pas répondre. C'est la seule façon de le prouver — lire la configuration
   * dirait ce qu'elle croit faire, pas ce qu'elle fait.
   */
  const { networkInterfaces } = await import("node:os");
  const adresses = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
  if (adresses.length === 0) {
    console.log("  · aucune interface réseau : vérification d'écoute sautée");
  }
  for (const ip of adresses) {
    let joignable = false;
    try {
      await fetch(`http://${ip}:${PORT}/health`, { signal: AbortSignal.timeout(1500) });
      joignable = true;
    } catch {
      joignable = false;
    }
    verifier(`injoignable depuis le réseau (${ip})`, !joignable, "la passerelle répond sur l'interface réseau");
  }
}

passerelle.kill();
fauxModele.close();
await attendre(500);
rmSync(DONNEES, { recursive: true, force: true });
rmSync(AUX, { recursive: true, force: true });

console.log(`\n${reussis} vérification(s) réussie(s), ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log("Échecs :");
  for (const e of echecs) console.log(`  - ${e}`);
  process.exit(1);
}
