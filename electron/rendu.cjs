/**
 * Banc d'essai des pages écrites par Helix Code : la page est vraiment ouverte,
 * dans une fenêtre cachée, et on relève ce qu'un humain verrait en premier.
 *
 * Demandé par Medhi le 26/09/2026, après l'ERP d'essai : « le petit modèle doit
 * produire un bon niveau de logiciel ». L'agent avait annoncé une application
 * « fonctionnelle » dont le script ne compilait pas ; corrigée, elle s'ouvrait
 * sur une page blanche (aucun onglet actif), avec des onglets blanc sur gris,
 * et ses listes ne se mettaient pas à jour. Le contrôle statique
 * (gateway/src/controleWeb.ts) voit la syntaxe et les liens ; seul un vrai
 * navigateur voit le reste. La passerelle n'en a pas (elle tourne en Node) :
 * l'application lui prête le sien, par un petit serveur sur la boucle locale,
 * fermé par une clé tirée au sort et passée à la passerelle seule.
 *
 * Ce qui est relevé, sans rien juger à la place de l'agent :
 *  - les erreurs de la console et les ressources qui ne se chargent pas ;
 *  - une page qui s'ouvre (presque) vide ;
 *  - un texte illisible (contraste inférieur à 3 sur son fond) ;
 *  - les boutons et formulaires essayés un par un avec des valeurs d'exemple :
 *    une erreur qu'ils déclenchent, ou un formulaire envoyé sans que rien ne
 *    change à l'écran.
 * La fenêtre est isolée (session en mémoire, bac à sable, sans Node), les
 * boîtes de dialogue sont neutralisées, et elle est détruite après l'essai.
 */

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, session } = require("electron");

const ATTENTE_CHARGEMENT_MS = 2500;
const DUREE_MAX_MS = 25_000;

/** Le script d'analyse, exécuté dans la page après son chargement. */
const ANALYSE = String.raw`(async () => {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.alert = () => {}; window.confirm = () => true; window.prompt = () => "Exemple";
  const erreurs = [];
  window.addEventListener("error", (e) => erreurs.push(String(e.message || e.error || "erreur")));
  window.addEventListener("unhandledrejection", (e) => erreurs.push("Promesse rejetée : " + String(e.reason)));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };
  const texteVisible = () => {
    let t = "";
    const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (marche.nextNode()) {
      const n = marche.currentNode;
      if (n.parentElement && visible(n.parentElement) && n.textContent.trim()) t += n.textContent.trim() + " ";
    }
    return t.trim();
  };
  const rvb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim()); return { r: +r, g: +g, b: +b, a: +a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fond = (el) => { for (let e = el; e; e = e.parentElement) { const c = rvb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255 }; };
  const illisibles = [];
  for (const el of document.querySelectorAll("body *")) {
    if (illisibles.length >= 6) break;
    const propre = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!propre || !visible(el)) continue;
    const c = rvb(getComputedStyle(el).color); if (!c) continue;
    const a = lum(c), b = lum(fond(el));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 3) illisibles.push({ texte: el.textContent.trim().slice(0, 40), balise: el.tagName.toLowerCase(), contraste: Math.round(ratio * 10) / 10 });
  }
  const auChargement = texteVisible();
  const essais = [];
  // Boutons hors formulaire (onglets, actions) : un clic chacun.
  const boutons = [...document.querySelectorAll("button, [onclick], [role=tab]")].filter((b) => !b.closest("form") && visible(b)).slice(0, 12);
  for (const b of boutons) {
    const avant = erreurs.length;
    try { b.click(); } catch (e) { erreurs.push(String(e && e.message)); }
    await pause(150);
    if (erreurs.length > avant) essais.push({ quoi: "bouton « " + (b.textContent || "").trim().slice(0, 30) + " »", probleme: erreurs.slice(avant).join(" ; ").slice(0, 200) });
  }
  // Formulaires : remplis avec des valeurs d'exemple, puis envoyés ; l'écran doit changer.
  const exemple = (i) => { const t = (i.type || "text").toLowerCase(); if (t === "email") return "exemple@exemple.fr"; if (t === "number") return "42"; if (t === "date") return "2026-09-26"; if (t === "tel") return "0600000000"; if (t === "url") return "https://exemple.fr"; return "Exemple " + (i.name || i.id || "texte"); };
  for (const f of [...document.forms].slice(0, 8)) {
    // Le formulaire doit être visible : on ouvre d'abord la section qui le contient, par ses propres boutons s'il le faut.
    if (!visible(f)) { for (const b of boutons) { b.click(); await pause(120); if (visible(f)) break; } }
    if (!visible(f)) continue;
    for (const i of f.querySelectorAll("input, textarea")) {
      if (["submit", "button", "hidden", "checkbox", "radio", "file"].includes((i.type || "").toLowerCase())) continue;
      i.value = exemple(i); i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const vides = [...f.querySelectorAll("select")].filter((s) => s.options.length === 0 && visible(s));
    const avant = texteVisible(); const nbErr = erreurs.length;
    try { f.requestSubmit ? f.requestSubmit() : f.submit(); } catch (e) { erreurs.push(String(e && e.message)); }
    await pause(300);
    const nom = (f.querySelector("button, [type=submit]")?.textContent || f.id || "formulaire").trim().slice(0, 30);
    if (erreurs.length > nbErr) essais.push({ quoi: "formulaire « " + nom + " »", probleme: erreurs.slice(nbErr).join(" ; ").slice(0, 200) });
    else if (texteVisible() === avant) essais.push({ quoi: "formulaire « " + nom + " »", probleme: vides.length ? "une liste déroulante est vide : impossible de choisir, et rien ne change à l'envoi" : "rempli et envoyé, rien ne change à l'écran" });
  }
  return { texteAuChargement: auChargement.length, extrait: auChargement.slice(0, 120), illisibles, essais, erreurs };
})()`;

/** Ouvre la page, attend, analyse. Rend le rapport, jamais d'exception. */
async function rendre(fichier) {
  const partition = `rendu-${crypto.randomBytes(6).toString("hex")}`;
  const ses = session.fromPartition(partition, { cache: false });
  const fenetre = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true },
  });
  const console_ = [];
  const echecs = [];
  fenetre.webContents.on("console-message", (_e, niveau, message) => {
    if (niveau >= 3 || /error|uncaught/i.test(String(message))) console_.push(String(message).slice(0, 300));
  });
  ses.webRequest.onErrorOccurred((d) => {
    /*
     * Seulement ce que l'agent peut corriger : un fichier du projet absent, ou
     * une adresse qui répond en erreur. Pas les annulations, ni les échecs de
     * cache d'une session sans cache (mesuré le 26/09/2026 : les polices de
     * Google Fonts sortaient toutes « introuvables », net::ERR_CACHE_MISS).
     */
    if (/ERR_ABORTED|ERR_CACHE_MISS|ERR_BLOCKED_BY_CLIENT/.test(d.error)) return;
    if (!d.url.startsWith("file:") && /fonts\.(googleapis|gstatic)\.com/.test(d.url)) return;
    echecs.push(`${d.url.replace(/^file:\/\/[^?#]*\//, "")} (${d.error})`);
  });
  // Un bouton « Exporter » ne doit pas ouvrir de fenêtre d'enregistrement pendant l'essai.
  ses.on("will-download", (_e, item) => item.cancel());
  // Aucune fenêtre ni navigation hors de la page essayée.
  fenetre.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  fenetre.webContents.on("will-navigate", (e) => e.preventDefault());
  const minuterie = setTimeout(() => fenetre.destroy(), DUREE_MAX_MS);
  try {
    await fenetre.loadFile(fichier).catch((err) => echecs.push(String(err?.message ?? err).slice(0, 200)));
    await new Promise((r) => setTimeout(r, ATTENTE_CHARGEMENT_MS));
    const analyse = await fenetre.webContents.executeJavaScript(ANALYSE, true).catch((err) => ({ erreurAnalyse: String(err?.message ?? err) }));
    return { ok: true, console: [...new Set(console_)].slice(0, 12), ressources: [...new Set(echecs)].slice(0, 12), ...analyse };
  } catch (err) {
    return { ok: false, message: String(err?.message ?? err) };
  } finally {
    clearTimeout(minuterie);
    if (!fenetre.isDestroyed()) fenetre.destroy();
    void ses.clearStorageData().catch(() => {});
  }
}

/**
 * Démarre le service sur la boucle locale et rend { url, cle } pour la
 * passerelle. Une demande à la fois : un modèle local occupe déjà la machine.
 */
function demarrerRendu() {
  const cle = crypto.randomBytes(24).toString("base64url");
  let occupe = Promise.resolve();
  const serveur = http.createServer((req, res) => {
    const refuser = (code) => { res.writeHead(code); res.end(); };
    if (req.method !== "POST" || req.url !== "/rendre") return refuser(404);
    const recu = String(req.headers["x-helix-cle"] ?? "");
    if (recu.length !== cle.length || !crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(cle))) return refuser(403);
    let corps = "";
    req.on("data", (c) => { corps += c; if (corps.length > 10_000) req.destroy(); });
    req.on("end", () => {
      let fichier = "";
      try { fichier = String(JSON.parse(corps).fichier ?? ""); } catch { return refuser(400); }
      // Seulement une page HTML qui existe, par un chemin absolu. La passerelle a déjà vérifié le dossier.
      if (!path.isAbsolute(fichier) || !/\.html?$/i.test(fichier) || !fs.existsSync(fichier)) return refuser(400);
      occupe = occupe.then(async () => {
        const rapport = await rendre(fichier);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(rapport));
      });
    });
  });
  return new Promise((resolve) => {
    serveur.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${serveur.address().port}`, cle }));
    serveur.on("error", () => resolve(null));
  });
}

module.exports = { demarrerRendu };
