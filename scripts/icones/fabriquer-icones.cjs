/**
 * Fabrique les icônes de l'application à partir des deux logos du projet
 * (27/09/2026, demandé par Medhi : « le logo d'application » sur les trois
 * systèmes). Lancer : `npx electron scripts/icones/fabriquer-icones.cjs`.
 *
 *  - `build/logo-helice.png` : l'hélice détaillée (noir sur blanc). Elle devient
 *    crème sur le fond sombre de la marque, dans un carré arrondi aux
 *    proportions des icônes de macOS (1024 px, 100 px de marge) ;
 *  - `public/brand/favicon.svg` : la marque simplifiée, lisible à 16 et 32 px
 *    (barre des tâches, zone de notification) où les traits fins de l'hélice
 *    disparaissaient.
 *
 * Écrit : build/icon.png (1024), build/icons/NxN.png (Linux), build/icon.ico
 * (Windows, entrées PNG), build/tray.png et build/tray@2x.png.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..", "..");
const B = (...p) => path.join(RACINE, "build", ...p);

const page = `<!doctype html><html><body><script>
const FOND = "#16140F", CREME = "#F2EEE3";
function charger(src) { return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; }); }
async function icone(taille, logo) {
  const c = document.createElement("canvas"); c.width = c.height = taille; const g = c.getContext("2d");
  const k = taille / 1024, marge = 100 * k, cote = 824 * k, r = 185 * k;
  g.beginPath(); g.roundRect(marge, marge, cote, cote, r);
  const dg = g.createLinearGradient(0, marge, 0, marge + cote); dg.addColorStop(0, "#221F18"); dg.addColorStop(1, FOND);
  g.fillStyle = dg; g.fill();
  // L'hélice : noir sur blanc devient crème sur transparent, recadrée sur son dessin.
  const s = document.createElement("canvas"); s.width = logo.width; s.height = logo.height; const sg = s.getContext("2d");
  sg.drawImage(logo, 0, 0); const d = sg.getImageData(0, 0, s.width, s.height); const px = d.data;
  let x0 = s.width, y0 = s.height, x1 = 0, y1 = 0;
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const i = (y * s.width + x) * 4, a = 255 - Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = 0xF2; px[i + 1] = 0xEE; px[i + 2] = 0xE3; px[i + 3] = a;
    if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  sg.putImageData(d, 0, 0);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, hauteur = cote * 0.74, echelle = hauteur / h;
  g.imageSmoothingQuality = "high";
  g.drawImage(s, x0, y0, w, h, taille / 2 - (w * echelle) / 2, taille / 2 - hauteur / 2, w * echelle, hauteur);
  return c.toDataURL("image/png");
}
async function marque(taille, svg) {
  const c = document.createElement("canvas"); c.width = c.height = taille; const g = c.getContext("2d");
  g.drawImage(svg, 0, 0, taille, taille); return c.toDataURL("image/png");
}
window.fabriquer = async (logoUrl, svgUrl) => {
  const logo = await charger(logoUrl), svg = await charger(svgUrl), r = {};
  for (const t of [1024, 512, 256, 128, 64]) r["icone-" + t] = await icone(t, logo);
  for (const t of [16, 24, 32, 48, 64]) r["marque-" + t] = await marque(t, svg);
  return r;
};
</script></body></html>`;

app.whenReady().then(async () => {
  const f = new BrowserWindow({ show: false, webPreferences: { offscreen: true, webSecurity: false } });
  await f.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page));
  const logo = "data:image/png;base64," + fs.readFileSync(B("logo-helice.png")).toString("base64");
  const svg = "data:image/svg+xml;base64," + fs.readFileSync(path.join(RACINE, "public", "brand", "favicon.svg")).toString("base64");
  const r = await f.webContents.executeJavaScript(`fabriquer(${JSON.stringify(logo)}, ${JSON.stringify(svg)})`);
  const png = (cle) => Buffer.from(r[cle].split(",")[1], "base64");
  fs.writeFileSync(B("icon.png"), png("icone-1024"));
  fs.mkdirSync(B("icons"), { recursive: true });
  for (const t of [16, 24, 32, 48]) fs.writeFileSync(B("icons", `${t}x${t}.png`), png(`marque-${t}`));
  for (const t of [64, 128, 256, 512]) fs.writeFileSync(B("icons", `${t}x${t}.png`), png(`icone-${t}`));
  fs.writeFileSync(B("tray.png"), png("marque-32"));
  fs.writeFileSync(B("tray@2x.png"), png("marque-64"));
  // ICO à entrées PNG (Windows Vista et suivants) : petites tailles en marque simplifiée, grandes en hélice.
  const entrees = [[16, png("marque-16")], [24, png("marque-24")], [32, png("marque-32")], [48, png("marque-48")], [64, png("icone-64")], [128, png("icone-128")], [256, png("icone-256")]];
  const tete = Buffer.alloc(6); tete.writeUInt16LE(0, 0); tete.writeUInt16LE(1, 2); tete.writeUInt16LE(entrees.length, 4);
  let decalage = 6 + 16 * entrees.length; const repertoire = [];
  for (const [t, donnees] of entrees) {
    const e = Buffer.alloc(16); e.writeUInt8(t === 256 ? 0 : t, 0); e.writeUInt8(t === 256 ? 0 : t, 1); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(donnees.length, 8); e.writeUInt32LE(decalage, 12); decalage += donnees.length; repertoire.push(e);
  }
  fs.writeFileSync(B("icon.ico"), Buffer.concat([tete, ...repertoire, ...entrees.map(([, d]) => d)]));
  console.log("icônes écrites");
  app.quit();
});
