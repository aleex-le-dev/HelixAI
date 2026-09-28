/*
 * Google Sheets, Slides, YouTube, LinkedIn, Facebook, Instagram et TikTok :
 * de bout en bout, contre de faux fournisseurs.
 *
 *   node scripts/essai-natifs.mjs      (lancé aussi par npm run securite, section 15 bis)
 *
 * Écrit le 28/09/2026 avec les connexions natives (gateway/src/oauthNatif.ts,
 * outilsNatifs.ts). Aucun vrai compte, aucune sortie : une passerelle neuve
 * (dossier de données temporaire, clé de chiffrement en fichier, aucun moteur)
 * est lancée avec un module préalable (`--import`) qui remplace le client
 * HTTPS des connexions natives par un aller vers un faux serveur local, et qui
 * refuse toute autre sortie. Le faux serveur imite ce que la documentation de
 * chaque fournisseur dit de ses points d'accès (citée dans oauthNatif.ts) :
 * échange du code, portées rendues, jeton court de Meta échangé contre un jeton
 * de 60 jours, `appsecret_proof`, PKCE en hexadécimal chez TikTok, publication
 * en deux temps chez Instagram, envoi de la vidéo chez TikTok. Ce sont des
 * imitations : rien n'a été essayé contre les vrais services.
 *
 * Deux temps : les routes de l'instance (brancher, `state` refusé, portées,
 * rien de secret dans les réponses ni sur le disque ni au journal), puis, la
 * passerelle arrêtée, les outils de l'agent dans un second processus qui relit
 * les mêmes données chiffrées (lire, publier seulement pour l'administrateur,
 * carte d'accord même au niveau « Tout approuver », doublon refusé, jeton
 * renouvelé, adresse d'envoi étrangère refusée, révocation au débranchement).
 */
import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as serveurHttp } from "node:http";
import { createServer as serveurTcp } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

let reussis = 0;
const echecs = [];
/** Ce qui ressemble à un jeton ou un secret de l'essai ne se recopie pas dans la sortie. */
const masquer = (s) => String(s).replace(/(ACCES|ACTU|COURT|JETON-PAGE|SECRET|GOCSPX)-[A-Za-z0-9-]*/g, "[masqué]");
function verifier(nom, condition, obtenu) {
  if (condition) {
    reussis++;
    console.log(`  ✓ ${nom}`);
  } else {
    echecs.push(nom);
    console.log(`  ✗ ${nom}  —  obtenu : ${masquer(obtenu).slice(0, 400)}`);
  }
}
const portLibre = () =>
  new Promise((ok) => {
    const s = serveurTcp();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------------- */
/* Identifiants d'essai et faux fournisseurs                                  */
/* ------------------------------------------------------------------------- */

const APPS = {
  google: { id: "123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com", secret: "GOCSPX-SECRET-NATIF-DE-TEST" },
  linkedin: { id: "86linkedinessai", secret: "SECRET-LINKEDIN-DE-TEST" },
  facebook: { id: "1234567890123", secret: "SECRET-FACEBOOK-DE-TEST" },
  instagram: { id: "9876543210987", secret: "SECRET-INSTAGRAM-DE-TEST" },
  tiktok: { id: "awtiktokessai01", secret: "SECRET-TIKTOK-DE-TEST" },
};
/** Tout ce qui ne doit jamais apparaître en clair : secrets et jetons. */
const SECRETS = /(ACCES|ACTU|COURT|JETON-PAGE)-[A-Za-z0-9-]+|SECRET-[A-Z]+-DE-TEST|GOCSPX-SECRET-NATIF-DE-TEST/;
const G_SCOPES = {
  sheets: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/spreadsheets",
  slides: "https://www.googleapis.com/auth/presentations.readonly",
  youtube: "https://www.googleapis.com/auth/youtube.readonly",
  TROP: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
};
const IG = "17841400000000000";

const recues = [];
const controle = { tiktok401: false, uploadAilleurs: false };

function reponse(res, statut, json, entetes = {}) {
  res.writeHead(statut, { "Content-Type": "application/json", ...entetes });
  res.end(JSON.stringify(json));
}

const faux = serveurHttp(async (req, res) => {
  const morceaux = [];
  for await (const m of req) morceaux.push(m);
  const brut = Buffer.concat(morceaux);
  const url = new URL(req.url ?? "/", "http://faux");
  if (url.pathname === "/__controle") {
    for (const [k, v] of url.searchParams) controle[k] = v === "1";
    return reponse(res, 200, {});
  }
  const hote = String(req.headers["x-hote"] ?? "");
  const corps = hote === "open-upload.tiktokapis.com" ? "" : brut.toString("utf8");
  recues.push({ hote, methode: req.method, chemin: req.url, entetes: req.headers, corps, octets: brut.length });
  const f = new URLSearchParams(corps);
  const q = url.searchParams;
  const auth = String(req.headers.authorization ?? "");
  const p = url.pathname;

  // ---- Google ----
  if (hote === "oauth2.googleapis.com") {
    if (p === "/token") {
      if (f.get("client_id") !== APPS.google.id || f.get("client_secret") !== APPS.google.secret) return reponse(res, 401, { error: "invalid_client" });
      if (f.get("grant_type") === "refresh_token") {
        const svc = (f.get("refresh_token") ?? "").replace("ACTU-", "");
        return reponse(res, 200, { access_token: `ACCES-${svc}-2`, expires_in: 3600, scope: G_SCOPES[svc] });
      }
      const code = f.get("code") ?? "";
      const svc = code.replace("CODE-", "");
      if (!f.get("code_verifier")) return reponse(res, 400, { error: "invalid_grant" });
      if (!G_SCOPES[svc]) return reponse(res, 400, { error: "invalid_grant" });
      const nom = svc === "TROP" ? "sheets" : svc;
      return reponse(res, 200, { access_token: `ACCES-${nom}-1`, refresh_token: `ACTU-${nom}`, expires_in: 3600, scope: G_SCOPES[svc], token_type: "Bearer" });
    }
    if (p === "/tokeninfo") return reponse(res, 200, { aud: APPS.google.id, scope: "…", expires_in: 3000 });
    if (p === "/revoke") return reponse(res, 200, {});
  }
  if (hote === "sheets.googleapis.com" && auth.startsWith("Bearer ACCES-sheets")) {
    if (req.method === "GET" && /^\/v4\/spreadsheets\/[A-Za-z0-9_-]+$/.test(p)) return reponse(res, 200, { properties: { title: "Budget essai" }, sheets: [{ properties: { title: "Ventes" } }] });
    if (req.method === "GET" && p.includes("/values/")) return reponse(res, 200, { range: "Ventes!A1:Z500", values: [["Mois", "CA"], ["Janvier", "1200"]] });
    if (req.method === "PUT" && p.includes("/values/")) return reponse(res, 200, { updatedCells: 4, updatedRange: "Ventes!A5:B6" });
    if (req.method === "POST" && p.endsWith(":append")) return reponse(res, 200, { updates: { updatedCells: 2, updatedRange: "Ventes!A7:B7" } });
  }
  if (hote === "slides.googleapis.com" && auth.startsWith("Bearer ACCES-slides")) {
    return reponse(res, 200, { title: "Plan essai", slides: [{ pageElements: [{ shape: { text: { textElements: [{ textRun: { content: "Bonjour diapositive" } }] } } }] }] });
  }
  if (hote === "www.googleapis.com" && auth.startsWith("Bearer ACCES-youtube")) {
    if (p === "/youtube/v3/channels") return reponse(res, 200, { items: [{ id: "UCabcdefghijklmnopqrstuv", snippet: { title: "Chaîne essai", publishedAt: "2024-01-01T00:00:00Z" }, statistics: { subscriberCount: "12", viewCount: "340", videoCount: "2" }, contentDetails: { relatedPlaylists: { uploads: "UUabcdefghijklmnopqrstuv" } } }] });
    if (p === "/youtube/v3/playlistItems") return reponse(res, 200, { items: [{ contentDetails: { videoId: "abcdefghijk" } }] });
    if (p === "/youtube/v3/videos") return reponse(res, 200, { items: [{ id: "abcdefghijk", snippet: { title: "Vidéo essai", publishedAt: "2026-09-01T00:00:00Z" }, statistics: { viewCount: "100", likeCount: "5", commentCount: "1" } }] });
  }

  // ---- LinkedIn ----
  if (hote === "www.linkedin.com" && p === "/oauth/v2/accessToken") {
    if (f.get("client_id") !== APPS.linkedin.id || f.get("client_secret") !== APPS.linkedin.secret) return reponse(res, 401, { error: "invalid_client" });
    const code = f.get("code");
    if (code === "CODE-MOINS") return reponse(res, 200, { access_token: "ACCES-linkedin-moins", expires_in: 5184000, scope: "openid,profile" });
    if (code !== "CODE-linkedin") return reponse(res, 400, { error: "invalid_request" });
    return reponse(res, 200, { access_token: "ACCES-linkedin-1", expires_in: 5184000, scope: "openid,profile,w_member_social,r_organization_social,w_organization_social,r_organization_admin" });
  }
  if (hote === "api.linkedin.com") {
    if (!auth.startsWith("Bearer ACCES-linkedin")) return reponse(res, 401, {});
    if (p === "/v2/userinfo") return reponse(res, 200, { sub: "abc123", name: "Marie Essai" });
    if (p === "/rest/organizationAcls") return reponse(res, 200, { elements: [{ organization: "urn:li:organization:777", role: "ADMINISTRATOR", state: "APPROVED" }] });
    if (p === "/rest/organizations/777") return reponse(res, 200, { localizedName: "Entreprise Essai" });
    if (p === "/rest/posts" && req.method === "GET") return reponse(res, 200, { elements: [{ id: "urn:li:share:1", commentary: "Post ancien", publishedAt: 1_780_000_000_000 }] });
    if (p === "/rest/organizationalEntityShareStatistics") return reponse(res, 200, { elements: [{ totalShareStatistics: { impressionCount: 1000, uniqueImpressionsCount: 800, clickCount: 30, likeCount: 12, commentCount: 3, shareCount: 2, engagement: 0.047 } }] });
    if (p === "/rest/posts" && req.method === "POST") return reponse(res, 201, {}, { "x-restli-id": "urn:li:share:999" });
  }

  // ---- Facebook ----
  if (hote === "graph.facebook.com") {
    const jeton = q.get("access_token") ?? f.get("access_token") ?? "";
    const preuve = q.get("appsecret_proof") ?? f.get("appsecret_proof") ?? "";
    if (p === "/v25.0/oauth/access_token") {
      if (q.get("client_id") !== APPS.facebook.id || q.get("client_secret") !== APPS.facebook.secret) return reponse(res, 400, { error: { message: "bad", code: 1 } });
      if (q.get("grant_type") === "fb_exchange_token" && q.get("fb_exchange_token") === "COURT-facebook") return reponse(res, 200, { access_token: "ACCES-facebook-long", token_type: "bearer", expires_in: 5184000 });
      if (q.get("code") === "CODE-facebook") return reponse(res, 200, { access_token: "COURT-facebook", token_type: "bearer", expires_in: 3600 });
      return reponse(res, 400, { error: { message: "bad", code: 100 } });
    }
    // Chaque appel porte la preuve du secret : sans elle, ou fausse, Meta refuse (« Require App Secret »).
    const attendue = createHmac("sha256", APPS.facebook.secret).update(jeton).digest("hex");
    if (!jeton || preuve !== attendue) return reponse(res, 400, { error: { message: "Invalid appsecret_proof", code: 100 } });
    if (p === "/v25.0/me/permissions" && req.method === "GET") return reponse(res, 200, { data: ["public_profile", "pages_show_list", "pages_read_engagement", "pages_manage_posts"].map((permission) => ({ permission, status: "granted" })) });
    if (p === "/v25.0/me/permissions" && req.method === "DELETE") return reponse(res, 200, { success: true });
    if (p === "/v25.0/me") return reponse(res, 200, { id: "555", name: "Jean Essai" });
    if (p === "/v25.0/me/accounts") return reponse(res, 200, { data: [{ id: "111", name: "Page Essai", followers_count: 42, access_token: "JETON-PAGE-111" }] });
    if (p === "/v25.0/111/published_posts" && jeton === "JETON-PAGE-111") return reponse(res, 200, { data: [{ id: "111_1", message: "Bonjour la page", created_time: "2026-09-20T10:00:00+0000", permalink_url: "https://www.facebook.com/111/posts/1", reactions: { summary: { total_count: 3 } }, comments: { summary: { total_count: 1 } }, shares: { count: 2 } }] });
    if (p === "/v25.0/111/feed" && req.method === "POST" && jeton === "JETON-PAGE-111") return reponse(res, 200, { id: "111_2" });
  }

  // ---- Instagram ----
  if (hote === "api.instagram.com" && p === "/oauth/access_token") {
    if (f.get("client_id") !== APPS.instagram.id || f.get("client_secret") !== APPS.instagram.secret || f.get("code") !== "CODE-instagram") return reponse(res, 400, { error_type: "OAuthException", code: 400, error_message: "bad" });
    return reponse(res, 200, { data: [{ access_token: "COURT-instagram", user_id: IG, permissions: "instagram_business_basic,instagram_business_manage_insights,instagram_business_content_publish" }] });
  }
  if (hote === "graph.instagram.com") {
    const jeton = q.get("access_token") ?? f.get("access_token") ?? "";
    if (p === "/access_token" && q.get("grant_type") === "ig_exchange_token" && q.get("client_secret") === APPS.instagram.secret && jeton === "COURT-instagram") return reponse(res, 200, { access_token: "ACCES-instagram-long", token_type: "bearer", expires_in: 5184000 });
    if (jeton !== "ACCES-instagram-long") return reponse(res, 401, { error: { message: "bad token", code: 190 } });
    if (p === "/v25.0/me") return reponse(res, 200, { user_id: IG, username: "essai.pro", account_type: "BUSINESS", followers_count: 90, follows_count: 10, media_count: 4 });
    if (p === `/v25.0/${IG}/media` && req.method === "GET") return reponse(res, 200, { data: [{ id: "800", caption: "Photo essai", media_type: "IMAGE", permalink: "https://www.instagram.com/p/x", timestamp: "2026-09-10T08:00:00+0000", like_count: 7, comments_count: 2 }] });
    if (p === "/v25.0/800/insights") return reponse(res, 200, { data: [{ name: "views", values: [{ value: 55 }] }, { name: "reach", values: [{ value: 40 }] }] });
    if (p === `/v25.0/${IG}/media` && req.method === "POST") return reponse(res, 200, { id: "900" });
    if (p === "/v25.0/900") return reponse(res, 200, { status_code: "FINISHED" });
    if (p === `/v25.0/${IG}/media_publish`) return reponse(res, 200, { id: "901" });
  }

  // ---- TikTok ----
  if (hote === "open.tiktokapis.com") {
    if (p === "/v2/oauth/token/") {
      if (f.get("client_key") !== APPS.tiktok.id || f.get("client_secret") !== APPS.tiktok.secret) return reponse(res, 400, { error: "invalid_client" });
      if (f.get("grant_type") === "refresh_token" && f.get("refresh_token") === "ACTU-tiktok") return reponse(res, 200, { access_token: "ACCES-tiktok-2", expires_in: 86400, refresh_token: "ACTU-tiktok", refresh_expires_in: 31536000, open_id: "oid-1", scope: "user.info.basic,user.info.stats,video.list,video.publish" });
      if (f.get("code") !== "CODE-tiktok" || !f.get("code_verifier")) return reponse(res, 400, { error: "invalid_grant" });
      return reponse(res, 200, { access_token: "ACCES-tiktok-1", expires_in: 86400, open_id: "oid-1", refresh_token: "ACTU-tiktok", refresh_expires_in: 31536000, scope: "user.info.basic,user.info.stats,video.list,video.publish", token_type: "Bearer" });
    }
    if (p === "/v2/oauth/revoke/") return reponse(res, 200, {});
    if (!auth.startsWith("Bearer ACCES-tiktok")) return reponse(res, 401, { error: { code: "access_token_invalid" } });
    if (controle.tiktok401 && auth === "Bearer ACCES-tiktok-1") return reponse(res, 401, { error: { code: "access_token_invalid" } });
    if (p === "/v2/user/info/") return reponse(res, 200, { data: { user: { open_id: "oid-1", display_name: "Créatrice essai", follower_count: 300, following_count: 20, likes_count: 1500, video_count: 8 } }, error: { code: "ok" } });
    if (p === "/v2/video/list/") return reponse(res, 200, { data: { videos: [{ id: "v1", title: "Vidéo TikTok essai", create_time: 1_780_000_000, share_url: "https://www.tiktok.com/@x/video/1", view_count: 1000, like_count: 50, comment_count: 4, share_count: 3 }] }, error: { code: "ok" } });
    if (p === "/v2/post/publish/creator_info/query/") return reponse(res, 200, { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } });
    if (p === "/v2/post/publish/video/init/") {
      const ailleurs = controle.uploadAilleurs ? "https://upload.exemple-malveillant.test/video/?id=1" : "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=t";
      return reponse(res, 200, { data: { publish_id: "p1", upload_url: ailleurs }, error: { code: "ok" } });
    }
    if (p === "/v2/post/publish/status/fetch/") return reponse(res, 200, { data: { status: "PROCESSING_UPLOAD" }, error: { code: "ok" } });
  }
  if (hote === "open-upload.tiktokapis.com" && req.method === "PUT") return reponse(res, 201, {});

  return reponse(res, 404, { error: "faux : point inconnu", hote, chemin: p });
});

const PORT_FAUX = await portLibre();
await new Promise((ok) => faux.listen(PORT_FAUX, "127.0.0.1", ok));

/* ------------------------------------------------------------------------- */
/* Passerelle jetable, transport remplacé par le module préalable            */
/* ------------------------------------------------------------------------- */

const AUX = mkdtempSync(join(tmpdir(), "helix-natifs-aux-"));
const DONNEES = mkdtempSync(join(tmpdir(), "helix-natifs-donnees-"));
const ESPACE = mkdtempSync(join(tmpdir(), "helix-natifs-espace-"));
const PREALABLE = join(AUX, "prealable.mjs");
writeFileSync(
  PREALABLE,
  `import { remplacerTransportPourEssais } from ${JSON.stringify(pathToFileURL(join(RACINE, "gateway", "src", "oauthNatif.ts")).href)};
const fetchOrigine = globalThis.fetch;
remplacerTransportPourEssais(async (d) => {
  const r = await fetchOrigine("http://127.0.0.1:${PORT_FAUX}" + d.chemin, { method: d.methode, headers: { ...(d.entetes ?? {}), "x-hote": d.hote }, body: d.corps, redirect: "manual" });
  return { statut: r.status, entetes: Object.fromEntries(r.headers), corps: Buffer.from(await r.arrayBuffer()), tronque: false };
});
// Aucune autre sortie : seule la boucle locale reste joignable.
globalThis.fetch = (entree, options) => {
  const a = new URL(typeof entree === "string" || entree instanceof URL ? String(entree) : entree.url);
  if (["127.0.0.1", "localhost", "[::1]"].includes(a.hostname)) return fetchOrigine(entree, options);
  return Promise.reject(new TypeError("fetch failed (essai : aucune sortie)"));
};
`,
);
writeFileSync(join(AUX, "profil.json"), JSON.stringify({ chiffrement: "fichier", backends: [{ id: "lmstudio", enabled: false }, { id: "exo", enabled: false }] }));
const FAUX_OPENCODE = join(AUX, "opencode");
writeFileSync(FAUX_OPENCODE, `#!/bin/sh\nexec "${process.execPath}" "${join(RACINE, "scripts", "faux-opencode.mjs")}" "$@"\n`);
chmodSync(FAUX_OPENCODE, 0o755);
// Une petite « vidéo » dans le dossier de travail, pour TikTok.
writeFileSync(join(ESPACE, "clip.mp4"), Buffer.alloc(2048, 7));

const PORT = await portLibre();
const G = `http://127.0.0.1:${PORT}`;
const ENV = {
  ...process.env,
  HELIX_CONFIG: join(AUX, "profil.json"),
  HELIX_GATEWAY_PORT: String(PORT),
  HELIX_DATA_DIR: DONNEES,
  HELIX_WORKSPACE: ESPACE,
  HELIX_OPENCODE_BIN: FAUX_OPENCODE,
  HELIX_CODE_DIR: ESPACE,
  HELIX_LMSTUDIO_URL: "http://127.0.0.1:9/v1",
  HELIX_EXO_URL: "http://127.0.0.1:9/v1",
  HELIX_GATEWAY_HOST: "127.0.0.1",
};
const passerelle = spawn(process.execPath, ["--import", PREALABLE, join(RACINE, "gateway", "src", "index.ts")], { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
let journal = "";
passerelle.stdout.on("data", (b) => (journal += b));
passerelle.stderr.on("data", (b) => (journal += b));
let demarree = false;
for (let i = 0; i < 120 && !demarree; i++) {
  try {
    await fetch(`${G}/health`);
    demarree = true;
  } catch {
    await attendre(250);
  }
}
if (!demarree) {
  console.log(`  ✗ la passerelle d'essai démarre  —  obtenu : ${journal.slice(-1500)}`);
  passerelle.kill();
  faux.close();
  process.exit(1);
}

const JETON = readFileSync(join(DONNEES, "instance-token"), "utf8").trim();
const avecJeton = { "Content-Type": "application/json", Authorization: `Bearer ${JETON}`, "X-Helix-Langue": "fr" };
const appel = (chemin, options = {}) => fetch(`${G}${chemin}`, { redirect: "manual", ...options });
const poster = (chemin, entetes, corps) => appel(chemin, { method: "POST", headers: entetes, body: JSON.stringify(corps ?? {}) });
const premier = await (await poster("/helix/auth/create", avecJeton, { fullName: "Alice Essai", email: "alice@example.test", password: "Mot2PasseSolide!42" })).json();
const A = { ...avecJeton, "X-Helix-Session": premier.session?.token };
const idA = premier.account?.id;
const creeB = await (await poster("/helix/auth/create", A, { fullName: "Bruno Essai", email: "bruno@example.test", password: "Provisoire2Passe!11" })).json();
const connB = await (await poster("/helix/auth/mot-de-passe-provisoire", avecJeton, { accountId: creeB.account?.id, password: "Provisoire2Passe!11", nouveau: "Bruno2PasseSolide!57" })).json();
const B = { ...avecJeton, "X-Helix-Session": connB.session?.token };
const idB = creeB.account?.id;
const etatDe = async (entetes = A) => (await (await appel("/helix/natifs", { headers: entetes })).json()).services ?? [];
const service = async (id) => (await etatDe()).find((s) => s.id === id);

/* ------------------------------------------------------------------------- */
console.log("\nA. Qui a le droit");
{
  const sans = await appel("/helix/natifs", { headers: avecJeton });
  verifier("état des connexions : sans séance → 401", sans.status === 401, sans.status);
  const vueB = await (await appel("/helix/natifs", { headers: B })).json();
  verifier("un collègue voit l'état, et l'écran sait qu'il n'administre pas", Array.isArray(vueB.services) && vueB.services.length === 7 && vueB.administrateur === false, JSON.stringify(vueB).slice(0, 200));
  for (const [suite, corps] of [["/application", { service: "linkedin", clientId: APPS.linkedin.id, clientSecret: APPS.linkedin.secret }], ["/connecter", { service: "sheets" }], ["/oublier", { service: "facebook" }]]) {
    const r = await poster(`/helix/natifs${suite}`, B, corps);
    verifier(`un collègue qui n'administre pas : ${suite} refusé (403)`, r.status === 403, r.status);
  }
  const mal = await poster("/helix/natifs/application", A, { service: "linkedin", clientId: "pas un identifiant !", clientSecret: "x" });
  verifier("un identifiant d'application mal formé est refusé (400)", mal.status === 400, mal.status);
  const inconnu = await poster("/helix/natifs/connecter", A, { service: "myspace" });
  verifier("un service hors de la liste est refusé (400)", inconnu.status === 400, inconnu.status);
  const mcp = await poster("/helix/connecteurs/ajouter", A, { id: "linkedin", command: "/bin/sh" });
  const jMcp = await mcp.json().catch(() => ({}));
  verifier("un connecteur MCP ne peut pas prendre le préfixe « linkedin » (réservé)", mcp.status === 400 && /intégré/.test(jMcp.message ?? ""), JSON.stringify(jMcp).slice(0, 160));
}

console.log("\nB. Applications des fournisseurs : le secret n'en ressort jamais");
{
  const g = await poster("/helix/google/client", A, { clientId: APPS.google.id, clientSecret: APPS.google.secret });
  verifier("application Google enregistrée (partagée avec Sheets, Slides, YouTube)", g.status === 200, g.status);
  for (const id of ["linkedin", "facebook", "instagram", "tiktok"]) {
    const r = await poster("/helix/natifs/application", A, { service: id, clientId: APPS[id].id, clientSecret: APPS[id].secret });
    const texte = await r.text();
    verifier(`${id} : application enregistrée, et la réponse ne contient pas le secret`, r.status === 200 && !texte.includes(APPS[id].secret), `${r.status} ${texte.slice(0, 160)}`);
  }
  const etats = JSON.stringify(await etatDe());
  verifier("l'état des connexions ne contient aucun secret d'application", !SECRETS.test(etats), etats.match(SECRETS)?.[0]);
}

/** L'adresse d'autorisation, décortiquée. */
async function depart(id, choix = []) {
  const r = await poster("/helix/natifs/connecter", A, { service: id, choix });
  const j = await r.json().catch(() => ({}));
  const u = typeof j.url === "string" ? new URL(j.url) : null;
  return { statut: r.status, j, u, p: u?.searchParams ?? new URLSearchParams() };
}

console.log("\nC. Autorisation : portées minimales, PKCE, `state`");
{
  const s = await depart("sheets");
  verifier("Sheets, lecture : chez Google, portée spreadsheets.readonly seule, PKCE S256, retour sur la boucle locale", s.u?.hostname === "accounts.google.com" && s.p.get("scope") === "https://www.googleapis.com/auth/spreadsheets.readonly" && s.p.get("code_challenge_method") === "S256" && /^[A-Za-z0-9_-]{43}$/.test(s.p.get("code_challenge") ?? "") && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(s.p.get("redirect_uri") ?? ""), s.j.url ?? JSON.stringify(s.j));
  verifier("le secret ne voyage jamais dans l'adresse d'autorisation", !SECRETS.test(s.j.url ?? "") && !s.p.has("client_secret"), s.j.url);
  const sl = await depart("slides");
  verifier("Slides : presentations.readonly seule", sl.p.get("scope") === "https://www.googleapis.com/auth/presentations.readonly", sl.p.get("scope"));
  const yt = await depart("youtube", ["ecriture"]);
  verifier("YouTube : youtube.readonly seule, même si on demande l'écriture (aucune n'est proposée)", yt.p.get("scope") === "https://www.googleapis.com/auth/youtube.readonly", yt.p.get("scope"));
  const li = await depart("linkedin");
  verifier("LinkedIn, lecture : openid profile, sans rien d'autre, retour sur l'instance, `state` tiré au sort", li.u?.hostname === "www.linkedin.com" && li.p.get("scope") === "openid profile" && li.p.get("redirect_uri") === `${G}/helix/oauth/retour` && /^natif\.[A-Za-z0-9_-]{43}$/.test(li.p.get("state") ?? ""), li.j.url);
  const liPage = await depart("linkedin", ["page"]);
  verifier("LinkedIn, page sans publication : r_organization_social et r_organization_admin, pas w_organization_social", liPage.p.get("scope") === "openid profile r_organization_social r_organization_admin", liPage.p.get("scope"));
  const fb = await depart("facebook");
  verifier("Facebook, lecture : pages_show_list,pages_read_engagement, dialogue v25.0 de Meta", fb.u?.hostname === "www.facebook.com" && fb.u?.pathname === "/v25.0/dialog/oauth" && fb.p.get("scope") === "pages_show_list,pages_read_engagement", fb.j.url);
  const fbE = await depart("facebook", ["ecriture"]);
  verifier("Facebook, publier : pages_manage_posts en plus, et rien d'autre", fbE.p.get("scope") === "pages_show_list,pages_read_engagement,pages_manage_posts", fbE.p.get("scope"));
  const ig = await depart("instagram");
  verifier("Instagram, lecture : instagram_business_basic et _manage_insights, chez instagram.com", ig.u?.hostname === "www.instagram.com" && ig.p.get("scope") === "instagram_business_basic,instagram_business_manage_insights", ig.j.url);
  const tk = await depart("tiktok");
  verifier("TikTok : client_key, lecture seule, PKCE S256 en hexadécimal, retour sur la boucle locale", tk.u?.hostname === "www.tiktok.com" && tk.p.get("client_key") === APPS.tiktok.id && tk.p.get("scope") === "user.info.basic,user.info.stats,video.list" && /^[0-9a-f]{64}$/.test(tk.p.get("code_challenge") ?? "") && /^http:\/\/127\.0\.0\.1:\d+\/callback\/$/.test(tk.p.get("redirect_uri") ?? ""), tk.j.url);

  // Un `state` faux : ignoré, et la demande en cours reste en attente.
  const faux1 = await appel(`/helix/oauth/retour?state=natif.faux&code=CODE-linkedin`);
  const faux2 = await appel(`/helix/oauth/retour?state=natif.faux&error=access_denied`);
  const li2 = await service("linkedin");
  verifier("retour public : un `state` faux est refusé (400), avec ou sans erreur, et n'annule pas la demande en cours", faux1.status === 400 && faux2.status === 400 && li2?.attente === true && li2?.configure === false, `${faux1.status} ${faux2.status} ${JSON.stringify(li2).slice(0, 120)}`);
  const direct = await fetch(`${tk.p.get("redirect_uri")}?state=natif.faux&code=CODE-tiktok`).catch(() => null);
  const tk2 = await service("tiktok");
  verifier("boucle locale de TikTok : un `state` faux est refusé, rien n'est enregistré", (direct?.status ?? 400) === 400 && tk2?.configure === false && tk2?.attente === true, `${direct?.status} ${JSON.stringify(tk2).slice(0, 120)}`);
  const colle = await poster("/helix/natifs/code", A, { service: "tiktok", adresse: `${tk.p.get("redirect_uri")}?state=natif.autre&code=CODE-tiktok` });
  verifier("adresse recopiée à l'écran avec un `state` faux : refusée", colle.status === 400, colle.status);
}

/** Un fournisseur qui renvoie la personne, comme le ferait son navigateur. */
async function retour(d, code) {
  const adresse = `${d.p.get("redirect_uri")}?state=${encodeURIComponent(d.p.get("state") ?? "")}&code=${encodeURIComponent(code)}`;
  const r = await fetch(adresse, { redirect: "manual" });
  return { statut: r.status, page: await r.text() };
}

console.log("\nD. Retour vérifié : portée relue, compte lu, puis seulement enregistré");
{
  const trop = await depart("sheets", ["ecriture"]);
  const rTrop = await retour(trop, "CODE-TROP");
  const apresTrop = await service("sheets");
  const revoque = recues.some((x) => x.hote === "oauth2.googleapis.com" && x.chemin === "/revoke");
  verifier("Google accorde plus que demandé : rien n'est gardé, et l'accès est révoqué chez Google", rTrop.statut === 400 && apresTrop?.configure === false && revoque, `${rTrop.statut} ${revoque} ${JSON.stringify(apresTrop).slice(0, 120)}`);
  const s = await depart("sheets", ["ecriture"]);
  const rS = await retour(s, "CODE-sheets");
  const echange = recues.filter((x) => x.hote === "oauth2.googleapis.com" && x.chemin === "/token").at(-1);
  const verif = new URLSearchParams(echange?.corps ?? "").get("code_verifier") ?? "";
  const defi = createHash("sha256").update(verif).digest("base64url");
  verifier("Sheets branché, et le vérificateur PKCE envoyé correspond au défi de l'autorisation", rS.statut === 200 && defi === s.p.get("code_challenge"), `${rS.statut} ${rS.page.slice(0, 120)}`);
  for (const id of ["slides", "youtube"]) {
    const d = await depart(id);
    const r = await retour(d, `CODE-${id}`);
    verifier(`${id} branché par la boucle locale`, r.statut === 200, `${r.statut} ${r.page.slice(0, 160)}`);
  }

  const moins = await depart("linkedin", ["ecriture", "page"]);
  const rMoins = await retour(moins, "CODE-MOINS");
  verifier("LinkedIn accorde moins que demandé : refusé, rien n'est gardé", rMoins.statut === 400 && (await service("linkedin"))?.configure === false, rMoins.statut);
  const li = await depart("linkedin", ["ecriture", "page"]);
  const rLi = await retour(li, "CODE-linkedin");
  verifier("LinkedIn branché par le retour public de l'instance", rLi.statut === 200 && (await service("linkedin"))?.configure === true, `${rLi.statut} ${rLi.page.slice(0, 200)}`);

  const fb = await depart("facebook", ["ecriture"]);
  const rFb = await retour(fb, "CODE-facebook");
  const fbEchange = recues.some((x) => x.hote === "graph.facebook.com" && x.chemin.includes("grant_type=fb_exchange_token"));
  const preuves = recues.filter((x) => x.hote === "graph.facebook.com" && !x.chemin.startsWith("/v25.0/oauth/")).every((x) => /appsecret_proof=[0-9a-f]{64}/.test(x.chemin + x.corps));
  verifier("Facebook branché : jeton court échangé contre celui de 60 jours, `appsecret_proof` sur chaque appel", rFb.statut === 200 && fbEchange && preuves, `${rFb.statut} ${fbEchange} ${preuves} ${rFb.page.slice(0, 160)}`);
  const fbEtat = await service("facebook");
  verifier("Facebook : l'écran dit quand l'accès expirera (pas de renouvellement chez Meta)", typeof fbEtat?.expireLe === "string" && Date.parse(fbEtat.expireLe) > Date.now() + 50 * 86_400_000, fbEtat?.expireLe);

  const ig = await depart("instagram", ["ecriture"]);
  const rIg = await retour(ig, "CODE-instagram");
  verifier("Instagram branché : jeton court échangé contre celui de 60 jours", rIg.statut === 200 && recues.some((x) => x.hote === "graph.instagram.com" && x.chemin.startsWith("/access_token?grant_type=ig_exchange_token")), `${rIg.statut} ${rIg.page.slice(0, 160)}`);

  const tk = await depart("tiktok", ["ecriture"]);
  const rTk = await retour(tk, "CODE-tiktok");
  const tkEchange = recues.filter((x) => x.hote === "open.tiktokapis.com" && x.chemin === "/v2/oauth/token/").at(-1);
  const tkVerif = new URLSearchParams(tkEchange?.corps ?? "").get("code_verifier") ?? "";
  verifier("TikTok branché, vérificateur PKCE conforme au défi hexadécimal", rTk.statut === 200 && createHash("sha256").update(tkVerif).digest("hex") === tk.p.get("code_challenge"), `${rTk.statut} ${rTk.page.slice(0, 160)}`);

  // Le même code rejoué après coup : la demande est close, il ne mène à rien.
  const rejoue = await appel(`/helix/oauth/retour?state=${encodeURIComponent(li.p.get("state") ?? "")}&code=CODE-linkedin`);
  verifier("un retour rejoué (même `state`, même code) ne vaut plus rien", rejoue.status === 400, rejoue.status);
}

console.log("\nE. Jetons : jamais à l'écran, jamais en clair sur le disque, jamais au journal");
{
  for (const [nom, entetes] of [["administrateur", A], ["collègue", B]]) {
    const brut = await (await appel("/helix/natifs", { headers: entetes })).text();
    const tous = JSON.parse(brut).services ?? [];
    verifier(`état (${nom}) : les sept services, branchés, sans aucun jeton ni secret`, tous.length === 7 && tous.every((s) => s.configure) && !SECRETS.test(brut), `${tous.filter((s) => !s.configure).map((s) => s.id)} ${brut.match(SECRETS)?.[0] ?? ""}`);
  }
  const outils = await (await appel("/helix/outils", { headers: A })).text();
  verifier("la puce « Outils » nomme les services branchés, sans rien de secret", /LinkedIn/.test(outils) && /TikTok/.test(outils) && !SECRETS.test(outils), outils.slice(0, 200));
  const fichiers = [];
  const parcourir = (d) => {
    for (const n of readdirSync(d)) {
      const c = join(d, n);
      if (statSync(c).isDirectory()) parcourir(c);
      else fichiers.push(c);
    }
  };
  parcourir(DONNEES);
  const enClair = fichiers.filter((c) => SECRETS.test(readFileSync(c, "latin1")));
  verifier("aucun jeton ni secret en clair dans le dossier de données (magasin, journal d'audit)", fichiers.length > 3 && enClair.length === 0, enClair.join(", "));
  verifier("aucun jeton ni secret dans la sortie de la passerelle", !SECRETS.test(journal), journal.match(SECRETS)?.[0]);
  const hotes = new Set(recues.map((x) => x.hote));
  const permis = new Set(["oauth2.googleapis.com", "sheets.googleapis.com", "slides.googleapis.com", "www.googleapis.com", "www.linkedin.com", "api.linkedin.com", "graph.facebook.com", "api.instagram.com", "graph.instagram.com", "open.tiktokapis.com", "open-upload.tiktokapis.com"]);
  verifier("la passerelle n'a joint que les hôtes écrits dans oauthNatif.ts", [...hotes].every((h) => permis.has(h)), [...hotes].join(", "));
}

passerelle.kill();
await attendre(600);

/* ------------------------------------------------------------------------- */
console.log("\nF. Outils de l'agent, dans un second processus qui relit les mêmes données chiffrées");
{
  const ENFANT = join(AUX, "outils.mjs");
  const src = (f) => JSON.stringify(pathToFileURL(join(RACINE, "gateway", "src", f)).href);
  writeFileSync(
    ENFANT,
    `const o = await import(${src("outilsNatifs.ts")});
const n = await import(${src("oauthNatif.ts")});
const ap = await import(${src("approbation.ts")});
const { chargerClientGoogle } = await import(${src("clientGoogle.ts")});
await chargerClientGoogle();
await n.charger();
const A = { userId: ${JSON.stringify(idA)}, groupes: [] };
const B = { userId: ${JSON.stringify(idB)}, groupes: [] };
const sortie = {};
const appeler = (nom, args, pour = A) => o.callTool(nom, args, pour);
const controle = (q) => fetch("http://127.0.0.1:${PORT_FAUX}/__controle?" + q);
sortie.outils = o.toolsForModel().map((x) => x.function.name);
for (const [nom, args] of [
  ["sheets__lire", { feuille: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit" }],
  ["slides__lire", { presentation: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" }],
  ["youtube__chaine", {}],
  ["youtube__videos", { chaine: "@chaineessai" }],
  ["linkedin__profil", {}],
  ["linkedin__pages", {}],
  ["linkedin__publications", { page: "Entreprise Essai" }],
  ["linkedin__statistiques", { page: "777" }],
  ["facebook__pages", {}],
  ["facebook__publications", { page: "Page Essai" }],
  ["instagram__compte", {}],
  ["instagram__publications", {}],
  ["instagram__statistiques", { publication: "800" }],
  ["tiktok__profil", {}],
  ["tiktok__videos", {}],
]) sortie[nom] = await appeler(nom, args);
sortie.parB = await appeler("linkedin__publier", { texte: "Publié par un collègue" }, B);
sortie.sansPersonne = await o.callTool("facebook__publier", { page: "Page Essai", message: "Sans personne" });
sortie.linkedin = await appeler("linkedin__publier", { texte: "Bonjour @[Pierre](urn:li:person:1) *gras* #essai" });
sortie.linkedinPage = await appeler("linkedin__publier", { texte: "Au nom de la page", page: "Entreprise Essai" });
sortie.linkedinDoublon = await appeler("linkedin__publier", { texte: "Bonjour @[Pierre](urn:li:person:1) *gras* #essai" });
sortie.facebook = await appeler("facebook__publier", { page: "Page Essai", message: "Nouveau post", lien: "https://exemple.fr/article" });
sortie.facebookLienInterne = await appeler("facebook__publier", { page: "Page Essai", message: "Lien interne", lien: "https://192.168.1.10/" });
sortie.facebookPageInconnue = await appeler("facebook__publier", { page: "Page d'un autre", message: "Ailleurs" });
sortie.instagram = await appeler("instagram__publier", { image: "https://exemple.fr/photo.jpg", legende: "Légende essai" });
sortie.instagramLocal = await appeler("instagram__publier", { image: "http://exemple.fr/photo.jpg" });
sortie.sheetsEcrire = await appeler("sheets__ecrire", { feuille: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", plage: "Ventes!A5", valeurs: [["=IMPORTXML(\\"https://exemple.test\\")", 1], ["Mars", 3]] });
sortie.sheetsAjout = await appeler("sheets__ajouter_lignes", { feuille: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", plage: "Ventes", valeurs: [["Avril", 4]] });
sortie.tiktokHors = await appeler("tiktok__publier_video", { fichier: "/etc/hosts" });
sortie.tiktok = await appeler("tiktok__publier_video", { fichier: "clip.mp4", titre: "Clip essai" });
await controle("uploadAilleurs=1");
sortie.tiktokAilleurs = await appeler("tiktok__publier_video", { fichier: "clip.mp4", titre: "Clip essai 2" });
await controle("uploadAilleurs=0&tiktok401=1");
sortie.tiktokRenouvele = await appeler("tiktok__profil", {});
try { await n.envoyer("linkedin", { methode: "GET", hote: "exemple-malveillant.test", chemin: "/" }); sortie.hoteRefuse = false; } catch { sortie.hoteRefuse = true; }
// La carte d'accord : même au niveau « Tout approuver », publier la pose, et le texte entier y est.
ap.definirNiveau("tout", "essai");
const long = "Un post assez long pour vérifier que la carte montre tout. ".repeat(6) + "FIN-DU-TEXTE";
let tranche = false;
const verdict = ap.verifierOutil(null, "linkedin__publier", { texte: long }, A.userId).then((v) => { tranche = true; return v; });
await new Promise((r) => setTimeout(r, 150));
const cartes = ap.enAttente("outil", A.userId);
sortie.carte = { tranche, nombre: cartes.length, montreTout: JSON.stringify(cartes[0]?.detail ?? {}).includes("FIN-DU-TEXTE"), unique: cartes[0]?.detail?.unique === true, resume: cartes[0]?.resume ?? "" };
if (cartes[0]) ap.repondre(cartes[0].id, false, "outil", A.userId);
sortie.carte.refuse = (await verdict).autorise === false;
const lecture = await Promise.race([ap.verifierOutil(null, "linkedin__profil", {}, A.userId), new Promise((r) => setTimeout(() => r("attente"), 300))]);
sortie.lectureLibre = lecture !== "attente" && lecture.autorise === true;
// Hors requête, la passerelle parle anglais (langue.ts) : les messages de l'écran sont lus ici en français, comme par une personne qui l'a choisi.
const { avecLangueDe } = await import(${src("langue.ts")});
await avecLangueDe({ "x-helix-langue": "fr" }, new URL("http://essai/"), async () => {
  for (const id of ["sheets", "facebook", "tiktok", "linkedin", "instagram"]) sortie["oubli_" + id] = await n.oublier(id, A.userId);
});
sortie.apres = (await n.etat("http://127.0.0.1")).filter((s) => s.configure).map((s) => s.id);
sortie.outilsApres = o.toolsForModel().map((x) => x.function.name);
console.log("RESULTAT " + JSON.stringify(sortie));
process.exit(0);
`,
  );
  const avant = recues.length;
  // Asynchrone : le faux serveur vit dans ce processus, et doit pouvoir répondre pendant que l'autre tourne.
  const essai = await new Promise((fin) => {
    const e = spawn(process.execPath, ["--import", PREALABLE, ENFANT], { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    e.stdout.on("data", (b) => (stdout += b));
    e.stderr.on("data", (b) => (stderr += b));
    const minuterie = setTimeout(() => e.kill(), 120_000);
    e.on("close", (status, signal) => {
      clearTimeout(minuterie);
      fin({ status, signal, stdout, stderr });
    });
  });
  const sortieBrute = `${essai.stdout ?? ""}${essai.stderr ?? ""}`;
  const ligne = (essai.stdout ?? "").split("\n").find((l) => l.startsWith("RESULTAT "));
  let r = {};
  try {
    r = JSON.parse(ligne?.slice("RESULTAT ".length) ?? "{}");
  } catch {
    /* rendu illisible : les contrôles le diront */
  }
  verifier("le second processus s'est déroulé jusqu'au bout", Boolean(ligne), `${essai.status} ${essai.signal} ${essai.error?.message ?? ""} ${sortieBrute.slice(-800)}`);
  const apres = recues.slice(avant);
  const lu = (nom, motif) => verifier(`${nom} : lu`, r[nom]?.ok === true && motif.test(r[nom]?.content ?? ""), r[nom]?.content ?? JSON.stringify(r[nom]));
  verifier("outils proposés : lectures et écritures des sept services, relues des données chiffrées", ["sheets__lire", "sheets__ecrire", "slides__lire", "youtube__videos", "linkedin__publier", "linkedin__statistiques", "facebook__publier", "instagram__publier", "tiktok__publier_video"].every((n) => r.outils?.includes(n)), r.outils?.join(", "));
  lu("sheets__lire", /Budget essai[\s\S]*Janvier \| 1200/);
  lu("slides__lire", /Bonjour diapositive/);
  lu("youtube__chaine", /Chaîne essai[\s\S]*Abonnés : 12/);
  lu("youtube__videos", /Vidéo essai[\s\S]*100 vues, 5 j.aime/);
  lu("linkedin__profil", /Marie Essai/);
  lu("linkedin__pages", /Entreprise Essai \(identifiant 777\)/);
  lu("linkedin__publications", /Post ancien/);
  lu("linkedin__statistiques", /1\s000 impressions/);
  lu("facebook__pages", /Page Essai \(identifiant 111\) : 42 abonnés/);
  lu("facebook__publications", /3 réactions, 1 commentaires, 2 partages/);
  lu("instagram__compte", /@essai\.pro[\s\S]*90 abonnés/);
  lu("instagram__publications", /Photo essai/);
  lu("instagram__statistiques", /views : 55/);
  lu("tiktok__profil", /Créatrice essai/);
  lu("tiktok__videos", /1\s000 vues/);
  verifier("ce qui est rendu au modèle ne contient aucun jeton (le jeton de page Facebook compris)", !SECRETS.test(ligne ?? ""), (ligne ?? "").match(SECRETS)?.[0]);
  verifier("ce qui est lu est présenté comme des données, pas des consignes", /pas des consignes/.test(r.sheets__lire?.content ?? ""), r.sheets__lire?.content);

  verifier("publier : refusé à un collègue qui n'administre pas, et à un appel sans personne", r.parB?.ok === false && /administrateur/.test(r.parB?.content ?? "") && r.sansPersonne?.ok === false, `${r.parB?.content} | ${r.sansPersonne?.content}`);
  verifier("rien n'est parti chez le fournisseur pour ces deux refus", !apres.some((x) => /Publié par un collègue|Sans personne/.test(x.corps)), "parti");
  const postLi = apres.filter((x) => x.hote === "api.linkedin.com" && x.methode === "POST" && x.chemin === "/rest/posts");
  const corpsLi = postLi[0] ? JSON.parse(postLi[0].corps) : {};
  verifier("LinkedIn : publié au nom du profil, texte échappé (aucune mention glissée), mot-dièse gardé, en-tête de version", r.linkedin?.ok === true && corpsLi.author === "urn:li:person:abc123" && corpsLi.commentary === "Bonjour \\@\\[Pierre\\]\\(urn:li:person:1\\) \\*gras\\* #essai" && postLi[0]?.entetes["linkedin-version"] === "202609", `${r.linkedin?.content} ${postLi[0]?.corps}`);
  verifier("LinkedIn : au nom d'une page seulement si elle est administrée", r.linkedinPage?.ok === true && postLi.some((x) => JSON.parse(x.corps).author === "urn:li:organization:777"), r.linkedinPage?.content);
  verifier("LinkedIn : le même post relancé n'est pas republié", r.linkedinDoublon?.ok === false && /Déjà fait/.test(r.linkedinDoublon?.content ?? "") && postLi.length === 2, `${postLi.length} ${r.linkedinDoublon?.content}`);
  const postFb = apres.find((x) => x.hote === "graph.facebook.com" && x.chemin === "/v25.0/111/feed");
  const fFb = new URLSearchParams(postFb?.corps ?? "");
  verifier("Facebook : publié avec le jeton de la page et sa preuve, jamais celui de la personne", r.facebook?.ok === true && fFb.get("access_token") === "JETON-PAGE-111" && fFb.get("appsecret_proof") === createHmac("sha256", APPS.facebook.secret).update("JETON-PAGE-111").digest("hex") && fFb.get("link") === "https://exemple.fr/article", r.facebook?.content);
  verifier("Facebook : un lien vers le réseau interne, une page qu'on ne gère pas : refusés", r.facebookLienInterne?.ok === false && r.facebookPageInconnue?.ok === false && !apres.some((x) => /Lien interne|Ailleurs/.test(x.corps)), `${r.facebookLienInterne?.content} | ${r.facebookPageInconnue?.content}`);
  const igConteneur = apres.find((x) => x.hote === "graph.instagram.com" && x.methode === "POST" && x.chemin === `/v25.0/${IG}/media`);
  verifier("Instagram : conteneur puis publication, l'image est confiée à Instagram (jamais téléchargée par l'instance)", r.instagram?.ok === true && new URLSearchParams(igConteneur?.corps ?? "").get("image_url") === "https://exemple.fr/photo.jpg" && apres.some((x) => x.chemin === `/v25.0/${IG}/media_publish`) && !apres.some((x) => x.hote === "exemple.fr"), r.instagram?.content);
  verifier("Instagram : une image en http est refusée", r.instagramLocal?.ok === false, r.instagramLocal?.content);
  const putSheets = apres.find((x) => x.hote === "sheets.googleapis.com" && x.methode === "PUT");
  verifier("Sheets : écrit en RAW (une formule reste du texte, jamais calculée)", r.sheetsEcrire?.ok === true && /valueInputOption=RAW/.test(putSheets?.chemin ?? "") && !/USER_ENTERED/.test(putSheets?.chemin ?? "") && JSON.parse(putSheets?.corps ?? "{}").values?.[0]?.[0] === '=IMPORTXML("https://exemple.test")', `${putSheets?.chemin} ${r.sheetsEcrire?.content}`);
  verifier("Sheets : ajout de lignes en RAW, sans rien effacer", r.sheetsAjout?.ok === true && apres.some((x) => x.hote === "sheets.googleapis.com" && x.methode === "POST" && /:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS/.test(x.chemin)), r.sheetsAjout?.content);
  const puts = apres.filter((x) => x.methode === "PUT" && x.hote === "open-upload.tiktokapis.com");
  verifier("TikTok : un fichier hors du dossier de travail est refusé", r.tiktokHors?.ok === false && /hors du dossier|MP4/.test(r.tiktokHors?.content ?? ""), r.tiktokHors?.content);
  verifier("TikTok : vidéo du dossier envoyée en une fois, visibilité « moi seul » lue chez TikTok", r.tiktok?.ok === true && puts.length === 1 && puts[0].octets === 2048 && puts[0].entetes["content-range"] === "bytes 0-2047/2048" && /SELF_ONLY/.test(r.tiktok?.content ?? ""), `${r.tiktok?.content} ${puts.length}`);
  verifier("TikTok : une adresse d'envoi qui n'est pas celle de TikTok est refusée, rien n'y part", r.tiktokAilleurs?.ok === false && puts.length === 1, r.tiktokAilleurs?.content);
  verifier("TikTok : jeton refusé (401), renouvelé une fois, l'appel reprend", r.tiktokRenouvele?.ok === true && apres.some((x) => x.chemin === "/v2/oauth/token/" && /grant_type=refresh_token/.test(x.corps)), r.tiktokRenouvele?.content);
  verifier("un hôte hors de la liste du service est refusé avant toute connexion", r.hoteRefuse === true, r.hoteRefuse);
  verifier("carte d'accord pour publier, même au niveau « Tout approuver » : posée, unique, texte entier, et un refus n'envoie rien", r.carte?.tranche === false && r.carte?.nombre === 1 && r.carte?.montreTout === true && r.carte?.unique === true && r.carte?.refuse === true && /LinkedIn/.test(r.carte?.resume ?? ""), JSON.stringify(r.carte));
  verifier("lire ne pose pas de carte", r.lectureLibre === true, r.lectureLibre);
  verifier("débrancher : révoqué chez Google, Meta et TikTok", ["oubli_sheets", "oubli_facebook", "oubli_tiktok"].every((k) => r[k]?.ok && /révoqué/.test(r[k]?.message ?? "")) && apres.some((x) => x.methode === "DELETE" && x.chemin.startsWith("/v25.0/me/permissions")) && apres.some((x) => x.chemin === "/v2/oauth/revoke/"), ["oubli_sheets", "oubli_facebook", "oubli_tiktok"].map((k) => r[k]?.message).join(" | "));
  verifier("débrancher LinkedIn, Instagram : sans révocation documentée, l'écran dit où retirer l'accès", /réglages de votre compte/.test(r.oubli_linkedin?.message ?? "") && /réglages de votre compte/.test(r.oubli_instagram?.message ?? ""), r.oubli_linkedin?.message);
  verifier("après débranchement : plus de service ni d'outil de ces services", r.apres?.join(",") === "slides,youtube" && !r.outilsApres?.some((x) => /^(sheets|linkedin|facebook|instagram|tiktok)__/.test(x)), `${r.apres} ${r.outilsApres}`);
  verifier("aucun jeton ni secret dans la sortie du second processus (hors du rendu contrôlé plus haut)", !SECRETS.test(sortieBrute.replace(ligne ?? "", "")), sortieBrute.match(SECRETS)?.[0]);
}

faux.close();
for (const d of [DONNEES, AUX, ESPACE]) rmSync(d, { recursive: true, force: true });

console.log(`\n${reussis} vérification(s) réussie(s), ${echecs.length} échec(s).`);
if (echecs.length) {
  console.log("Échecs :");
  for (const e of echecs) console.log(`  - ${e}`);
  process.exit(1);
}
