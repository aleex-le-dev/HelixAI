/**
 * Le réseau d'une page à l'essai (electron/rendu.cjs) : Internet oui, la
 * machine et le réseau local non.
 *
 * Pourquoi (seconde tournée du test d'intrusion, 28/09/2026). La page à
 * l'essai est écrite par un modèle, ou vient d'un dépôt cloné, et elle charge
 * ce qu'elle veut depuis un CDN. Servie depuis `http://127.0.0.1:<port>`, elle
 * pouvait joindre tous les services de la boucle locale et lire la réponse de
 * ceux qui ouvrent leur CORS : essayé sur Electron 44.4.5, un service local
 * répondant `Access-Control-Allow-Origin: *` (ce que font Ollama pour les
 * origines de boucle locale, LM Studio quand on active son CORS, beaucoup de
 * serveurs de développement) était lu par `127.0.0.1`, `localhost` et
 * `0.0.0.0`. La passerelle elle-même admet toute origine de boucle locale
 * (gateway/src/entetes.ts) : ses routes publiques étaient lisibles aussi.
 * L'en-tête `treat-as-public-address` ne change rien dans ce Chromium (même
 * essai).
 *
 * D'où un mandataire (proxy) à soi, que la session de la page est obligée
 * d'utiliser, boucle locale comprise (`<-loopback>`). C'est lui qui résout le
 * nom et ouvre la connexion, vers l'adresse qu'il a lui-même vérifiée : un nom
 * qui pointe vers 127.0.0.1, ou qui change de réponse entre deux résolutions
 * (« DNS rebinding »), ne passe pas non plus. Seule exception : le service
 * qui sert la page elle-même.
 */

const http = require("node:http");
const net = require("node:net");
const dns = require("node:dns");

/** IPv4 en quatre nombres, ou null. */
function octets(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}

/**
 * Une adresse de la machine, du réseau local ou non routable : boucle locale,
 * réseaux privés, lien local, CGNAT (où vivent aussi Tailscale et consorts),
 * « ce réseau », multidiffusion et réservées. Ce qu'on ne sait pas lire est
 * interdit aussi.
 */
function adresseInterdite(adresse) {
  let ip = String(adresse).trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (net.isIPv6(ip)) {
    // IPv4 écrite en IPv6 (::ffff:127.0.0.1, ::ffff:7f00:1), et NAT64 (64:ff9b::/96).
    const v4 = /^(?:::ffff:|64:ff9b::)(?:0:)?(.+)$/.exec(ip);
    if (v4) {
      const reste = v4[1];
      if (net.isIPv4(reste)) return adresseInterdite(reste);
      const h = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(reste);
      if (h) {
        const a = parseInt(h[1], 16);
        const b = parseInt(h[2], 16);
        return adresseInterdite(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
      }
      return true;
    }
    if (ip === "::" || ip === "::1") return true;
    const tete = parseInt(ip.split(":")[0] || "0", 16);
    if ((tete & 0xfe00) === 0xfc00) return true; // fc00::/7, adresses locales uniques
    if ((tete & 0xffc0) === 0xfe80) return true; // fe80::/10, lien local
    if ((tete & 0xff00) === 0xff00) return true; // multidiffusion
    // Ancienne forme ::a.b.c.d (IPv4 compatible) : non routable.
    if (/^::[0-9.]+$/.test(ip)) return true;
    return false;
  }
  const o = octets(ip);
  if (!o) return true;
  const [a, b] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && o[2] === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Un nom qui désigne la machine ou le réseau local sans même le résoudre. */
const nomLocal = (hote) => hote === "localhost" || hote.endsWith(".localhost") || hote.endsWith(".local") || hote.endsWith(".internal") || !hote.includes(".");

/**
 * Démarre le mandataire. `permis` : l'unique « hôte:port » de boucle locale
 * admis (le service de la page). `resoudre` : pour les essais (dns.lookup par
 * défaut). Rend { port, fermer, refus } ; `refus` liste ce qui a été bloqué,
 * pour le rapport.
 */
function demarrerFiltre({ permis, resoudre = (hote) => dns.promises.lookup(hote, { all: true, verbatim: true }) }) {
  const refus = [];
  const prises = new Set();

  /** L'adresse où se connecter, ou null si la destination est interdite. */
  async function destination(hote, port) {
    const h = String(hote).toLowerCase().replace(/^\[|\]$/g, "");
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
    if (`${h}:${port}` === permis) return h;
    if (net.isIP(h)) return adresseInterdite(h) ? null : h;
    if (nomLocal(h)) return null;
    let adresses;
    try {
      adresses = await resoudre(h);
    } catch {
      return null;
    }
    const liste = (Array.isArray(adresses) ? adresses : [adresses]).map((x) => (typeof x === "string" ? x : x?.address)).filter(Boolean);
    // Une seule adresse locale suffit à refuser : le navigateur n'aurait pas eu à choisir la même que nous.
    if (liste.length === 0 || liste.some(adresseInterdite)) return null;
    return liste[0];
  }

  const noter = (quoi) => {
    if (refus.length < 20 && !refus.includes(quoi)) refus.push(quoi);
  };

  const serveur = http.createServer(async (req, res) => {
    // Une requête HTTP en clair, adresse complète (`GET http://hote/chemin`), comme l'envoie un navigateur à son mandataire.
    let url;
    try {
      url = new URL(req.url ?? "");
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (url.protocol !== "http:") {
      res.writeHead(403);
      return res.end();
    }
    const port = Number(url.port || 80);
    const ip = await destination(url.hostname, port);
    if (!ip) {
      noter(`${url.hostname}:${port}`);
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end();
    }
    const entetes = { ...req.headers };
    delete entetes["proxy-connection"];
    delete entetes["proxy-authorization"];
    const amont = http.request({ host: ip, port, method: req.method, path: `${url.pathname}${url.search}`, headers: entetes, setHost: false }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    amont.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(amont);
  });

  // HTTPS et WebSocket : un tunnel, ouvert seulement vers une adresse vérifiée.
  serveur.on("connect", async (req, client, tete) => {
    prises.add(client);
    client.on("close", () => prises.delete(client));
    client.on("error", () => client.destroy());
    const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(String(req.url ?? ""));
    const port = m ? Number(m[2]) : 0;
    const ip = m ? await destination(m[1], port) : null;
    if (!ip) {
      noter(m ? `${m[1]}:${port}` : String(req.url ?? "").slice(0, 80));
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const amont = net.connect({ host: ip, port }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (tete?.length) amont.write(tete);
      amont.pipe(client);
      client.pipe(amont);
    });
    prises.add(amont);
    amont.on("close", () => prises.delete(amont));
    amont.on("error", () => client.destroy());
  });
  // Une mise à niveau hors tunnel (WebSocket en clair envoyé en adresse complète) : refusée.
  serveur.on("upgrade", (_req, socket) => socket.destroy());
  serveur.on("connection", (s) => {
    prises.add(s);
    s.on("close", () => prises.delete(s));
  });

  return new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, "127.0.0.1", () =>
      resolve({
        port: serveur.address().port,
        refus,
        fermer: () => {
          for (const s of prises) s.destroy();
          serveur.close();
        },
      }),
    );
  });
}

module.exports = { adresseInterdite, demarrerFiltre };
