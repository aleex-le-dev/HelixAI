/*
 * electron/miseAJour.cjs joué hors d'Electron, contre une fausse publication
 * GitHub (test d'intrusion du 27/09/2026). `electron` est une doublure,
 * `spawn` n'exécute rien : ni le script qui remplace l'application, ni
 * l'installateur Windows. Rend l'état final en JSON.
 */
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");
const [RACINE, AUX, scenario] = process.argv.slice(2);
const windows = scenario.startsWith("win");
Object.defineProperty(process, "platform", { value: windows ? "win32" : "darwin" });
Object.defineProperty(process, "arch", { value: windows ? "x64" : "arm64" });
const sig = require(path.join(RACINE, "electron", "signatureEditeur.cjs"));
const lances = [];
cp.spawn = (commande, args) => {
  lances.push([commande, ...(args ?? [])].join(" "));
  const e = new EventEmitter();
  e.unref = () => {};
  setImmediate(() => e.emit("spawn"));
  return e;
};
let dernier = null;
const fenetre = { isDestroyed: () => false, webContents: { send: (_c, etat) => (dernier = etat) } };
let routeur = async () => new Response("", { status: 404 });
const faux = {
  app: { getVersion: () => "9.0.0", isPackaged: true, getPath: () => path.join(AUX, "profil"), quit: () => {} },
  BrowserWindow: { getAllWindows: () => [fenetre] },
  ipcMain: { handle: (canal, fn) => (canaux[canal] = fn) },
  shell: { openExternal: async () => {} },
  net: { fetch: (url, o) => routeur(String(url), o) },
  safeStorage: { isEncryptionAvailable: () => false },
};
const canaux = {};
const charger = Module._load;
Module._load = function (demande, ...reste) {
  return demande === "electron" ? faux : charger.call(this, demande, ...reste);
};
const cle = crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
const b64 = (b) => crypto.createHash("sha512").update(b).digest("base64");
const DEPOT = "https://api.github.com/repos/";
const publication = (tag, assets) => new Response(JSON.stringify({ tag_name: tag, draft: false, prerelease: false, html_url: "https://github.com/o/d", assets }));
const actif = (name, taille) => ({ name, size: taille, browser_download_url: `https://github.com/o/d/releases/download/v9.0.1/${name}` });
const attendre = async (fini) => {
  for (let i = 0; i < 400 && !fini(); i++) await new Promise((r) => setTimeout(r, 50));
};
const plist = (version) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>fr.helix.plateforme</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`;
async function fausseApplication(dossier, version) {
  const app = path.join(dossier, "Helix.app");
  for (const d of ["Contents/Resources", "Contents/MacOS"]) fs.mkdirSync(path.join(app, d), { recursive: true });
  fs.writeFileSync(path.join(app, "Contents/Info.plist"), plist(version));
  fs.writeFileSync(path.join(app, "Contents/MacOS/Helix"), "binaire", { mode: 0o755 });
  fs.writeFileSync(path.join(app, "Contents/Resources/app.asar"), `application ${version}`);
  await sig.signerApplication(app, cle, { identifiant: "fr.helix.plateforme", version });
  return app;
}

(async () => {
  const miseAJour = () => require(path.join(RACINE, "electron", "miseAJour.cjs"));
  const resultat = { scenario };
  // Sans app-update.yml : ni serveur de l'agence, ni instance, donc GitHub.
  fs.mkdirSync(path.join(AUX, "ressources"), { recursive: true });
  process.resourcesPath = path.join(AUX, "ressources");
  if (windows) {
    fs.writeFileSync(path.join(AUX, "ressources", sig.FICHIER_CLE), crypto.createPublicKey(cle).export({ type: "spki", format: "pem" }));
    const exe = Buffer.from("installateur 9.0.1");
    const desc = { identifiant: "helix-plateforme", version: "9.0.1", fichier: "Helix-Setup-9.0.1-x64.exe", sha512: b64(exe), octets: exe.length };
    const manifeste = JSON.stringify({ version: "9.0.1", windows: { fichier: desc.fichier, sha512: desc.sha512, octets: desc.octets, signature: sig.signerInstallateur(cle, desc) } });
    let etape = "nouvelle";
    routeur = async (url) => {
      if (url.startsWith(DEPOT)) {
        if (etape === "coupure") throw new Error("net::ERR_INTERNET_DISCONNECTED");
        return etape === "retiree" ? publication("v9.0.0", []) : publication("v9.0.1", [actif("helix-mise-a-jour.json", manifeste.length), actif(desc.fichier, exe.length)]);
      }
      if (url.endsWith(".json")) return new Response(manifeste);
      return new Response("", { status: 503 });
    };
    const m = miseAJour();
    await m.demarrerMiseAJour(() => true);
    await canaux["helix:maj-verifier"]({});
    resultat.annonce = { phase: dernier.phase, unClic: dernier.unClic };
    if (scenario === "win-retiree") {
      etape = "retiree";
      await canaux["helix:maj-verifier"]({});
      resultat.apresRetrait = dernier.phase;
      etape = "coupure";
      await canaux["helix:maj-verifier"]({});
      resultat.apresCoupure = dernier.phase;
    }
    // « Installer » : la source répond 503, rien ne se lance ; sur une annonce valable, « Réessayer » doit rester possible.
    resultat.installer = await canaux["helix:maj-installer"]({});
    await attendre(() => dernier.phase === "erreur");
    resultat.installerEncore = await canaux["helix:maj-installer"]({});
    await attendre(() => dernier.phase === "erreur");
  } else {
    fs.mkdirSync(path.join(AUX, "tmp"), { recursive: true });
    const installee = await fausseApplication(path.join(AUX, "installee"), "9.0.0");
    process.execPath = path.join(installee, "Contents", "MacOS", "Helix");
    const source = path.join(AUX, "source");
    fs.mkdirSync(source, { recursive: true });
    let nouvelle = await fausseApplication(path.join(AUX, "construite"), "9.0.1");
    if (scenario === "mac-lien") {
      // L'archive ne contient qu'un lien vers l'application authentique, posée ailleurs.
      fs.symlinkSync(nouvelle, path.join(source, "Helix.app"));
    } else {
      fs.renameSync(nouvelle, path.join(source, "Helix.app"));
      nouvelle = path.join(source, "Helix.app");
    }
    if (scenario === "mac-droits") {
      // L'application authentique, rendue modifiable par tous : droits 0777 et ACL « everyone ».
      for (const d of ["", "Contents", "Contents/Resources"]) fs.chmodSync(path.join(nouvelle, d), 0o777);
      fs.chmodSync(path.join(nouvelle, "Contents/Resources/app.asar"), 0o666);
      cp.execFileSync("/bin/chmod", ["+a", "everyone allow write,append,delete,add_file,add_subdirectory", path.join(nouvelle, "Contents/Resources")]);
    }
    const zip = path.join(AUX, "Helix-9.0.1-arm64-mac.zip");
    cp.execFileSync("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", source, zip]);
    const octets = fs.readFileSync(zip);
    // Sans fin : l'archive annoncée, puis des octets en plus, bien au-delà de la taille du manifeste.
    const servi = scenario === "mac-taille" ? Buffer.concat([octets, Buffer.alloc(8 * 1024 * 1024)]) : octets;
    const manifeste = JSON.stringify({ version: "9.0.1", mac: { fichier: "Helix-9.0.1-arm64-mac.zip", sha512: b64(octets), octets: octets.length } });
    resultat.servi = 0;
    routeur = async (url) => {
      if (url.startsWith(DEPOT)) return publication("v9.0.1", [actif("helix-mise-a-jour.json", manifeste.length), actif("Helix-9.0.1-arm64-mac.zip", octets.length)]);
      if (url.endsWith(".json")) return new Response(manifeste);
      if (url.endsWith(".zip")) {
        let envoye = 0;
        return new Response(
          new ReadableStream({
            pull(c) {
              if (envoye >= servi.length) return c.close();
              const morceau = servi.subarray(envoye, envoye + 65536);
              envoye += morceau.length;
              resultat.servi = envoye;
              c.enqueue(new Uint8Array(morceau));
            },
          }),
        );
      }
      return new Response("", { status: 404 });
    };
    const m = miseAJour();
    await m.demarrerMiseAJour(() => true);
    await canaux["helix:maj-verifier"]({});
    resultat.annonce = { phase: dernier.phase, unClic: dernier.unClic };
    resultat.installer = await canaux["helix:maj-installer"]({});
    await attendre(() => dernier.phase === "prete" || dernier.phase === "erreur");
    // Ce que le script d'installation aurait déplacé dans /Applications.
    const tmp = path.join(AUX, "tmp");
    const restes = fs.readdirSync(tmp).filter((n) => n.startsWith("helix-maj-"));
    resultat.restes = restes.length;
    const extraite = restes.length ? path.join(tmp, restes[0], "extrait", "Helix.app") : null;
    if (extraite && fs.existsSync(extraite)) {
      resultat.lien = fs.lstatSync(extraite).isSymbolicLink();
      const listing = cp.execFileSync("/bin/ls", ["-leR", extraite], { encoding: "utf8" });
      resultat.acl = /^\s*\d+: /m.test(listing);
      resultat.inscriptible = cp.execFileSync("/usr/bin/find", [extraite, "(", "-perm", "-g+w", "-o", "-perm", "-o+w", ")"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).length;
    }
  }
  resultat.phase = dernier.phase;
  resultat.message = dernier.message;
  resultat.lances = lances;
  console.log(JSON.stringify(resultat));
  process.exit(0);
})().catch((err) => {
  console.log(JSON.stringify({ scenario, plantage: String(err && err.stack) }));
  process.exit(0);
});
