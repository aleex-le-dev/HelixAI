/**
 * Fabrique les icônes de l'application à partir des deux logos du projet
 * (27/09/2026, demandé par Medhi : « le logo d'application » sur les trois
 * systèmes). Lancer : `npx electron scripts/icones/fabriquer-icones.cjs`.
 *
 *  - `build/logo-helice.png` : l'hélice détaillée, noire sur fond blanc comme le
 *    logo, dans un carré arrondi aux proportions des icônes de macOS (1024 px,
 *    100 px de marge) ; fond blanc choisi par Medhi (27/09/2026) ;
 *  - Windows et Linux (27/09/2026, « ancien logo pas beau » et « tout petit
 *    dans la barre en bas », vu sur un PC) : la même hélice, dans un carré
 *    arrondi qui remplit l'icône (sans la marge de macOS, qui la rendait
 *    minuscule dans la barre des tâches), et, aux petites tailles, un trait
 *    épaissi pour rester lisible. Plus de marque rouge et noire de l'ancien
 *    favicon, nulle part.
 *
 * Écrit : build/icon.png (1024, macOS), build/icons/NxN.png (Linux, fenêtre),
 * build/icon.ico (Windows, entrées PNG), build/tray.png et build/tray@2x.png.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..", "..");
const B = (...p) => path.join(RACINE, "build", ...p);

const page = `<!doctype html><html><body><script>
const ENCRE = "#16140F", LISERE = "#DDD9D0";
function charger(src) { return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; }); }
async function icone(taille, logo) {
  const c = document.createElement("canvas"); c.width = c.height = taille; const g = c.getContext("2d");
  const k = taille / 1024, marge = 100 * k, cote = 824 * k, r = 185 * k;
  g.beginPath(); g.roundRect(marge, marge, cote, cote, r);
  const dg = g.createLinearGradient(0, marge, 0, marge + cote); dg.addColorStop(0, "#FFFFFF"); dg.addColorStop(1, "#F3F2EE");
  g.fillStyle = dg; g.fill();
  g.lineWidth = Math.max(1, 3 * k); g.strokeStyle = LISERE; g.stroke();
  // L'hélice : noir sur blanc devient encre sur transparent, recadrée sur son dessin.
  const s = document.createElement("canvas"); s.width = logo.width; s.height = logo.height; const sg = s.getContext("2d");
  sg.drawImage(logo, 0, 0); const d = sg.getImageData(0, 0, s.width, s.height); const px = d.data;
  let x0 = s.width, y0 = s.height, x1 = 0, y1 = 0;
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const i = (y * s.width + x) * 4, a = 255 - Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = 0x16; px[i + 1] = 0x14; px[i + 2] = 0x0F; px[i + 3] = a;
    if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  sg.putImageData(d, 0, 0);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, hauteur = cote * 0.74, echelle = hauteur / h;
  g.imageSmoothingQuality = "high";
  g.drawImage(s, x0, y0, w, h, taille / 2 - (w * echelle) / 2, taille / 2 - hauteur / 2, w * echelle, hauteur);
  return c.toDataURL("image/png");
}
/** L'hélice en encre sur transparent, recadrée sur son dessin. */
function encre(logo) {
  const s = document.createElement("canvas"); s.width = logo.width; s.height = logo.height; const sg = s.getContext("2d");
  sg.drawImage(logo, 0, 0); const d = sg.getImageData(0, 0, s.width, s.height); const px = d.data;
  let x0 = s.width, y0 = s.height, x1 = 0, y1 = 0;
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const i = (y * s.width + x) * 4, brut = 255 - Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    // Le blanc presque pur du fond compte pour rien : redessiné cent fois pour épaissir, il devenait un rectangle gris.
    const a = brut < 48 ? 0 : brut;
    px[i] = 0x16; px[i + 1] = 0x14; px[i + 2] = 0x0F; px[i + 3] = a;
    if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  sg.putImageData(d, 0, 0);
  return { s, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/**
 * Windows et Linux : carré arrondi qui remplit l'icône (2 % de marge), hélice
 * sur 84 % de la hauteur. Plus l'icône est petite, plus le trait est épaissi
 * (dilatation : l'hélice redessinée décalée tout autour d'elle), pour garder
 * au moins un pixel et demi de trait.
 */
function iconePleine(taille, logo) {
  const c = document.createElement("canvas"); c.width = c.height = taille; const g = c.getContext("2d");
  const marge = Math.max(0, Math.round(taille * 0.02)), cote = taille - 2 * marge, r = cote * 0.2;
  g.beginPath(); g.roundRect(marge, marge, cote, cote, r);
  const dg = g.createLinearGradient(0, marge, 0, marge + cote); dg.addColorStop(0, "#FFFFFF"); dg.addColorStop(1, "#F3F2EE");
  g.fillStyle = dg; g.fill();
  g.lineWidth = Math.max(1, taille / 256); g.strokeStyle = LISERE; g.stroke();
  const { s, x0, y0, w, h } = encre(logo);
  const hauteur = cote * 0.84, echelle = hauteur / h, trait = 8 * echelle;
  /*
   * Juste assez de trait pour rester visible, pas plus : un pixel à 16 et 24 px,
   * moins au-delà. Plus épais, l'hélice devenait une tache noire sur le bureau
   * de Windows (48 px ; vu par Medhi le 27/09/2026, « noir foncé bizarre »),
   * loin du trait fin de l'icône du Mac.
   */
  const voulu = taille <= 24 ? 1 : taille <= 32 ? 0.75 : taille <= 64 ? 0.55 : 0;
  const rayon = Math.max(0, (voulu - trait) / 2 / echelle);
  const e = document.createElement("canvas"); e.width = w + 2 * rayon + 4; e.height = h + 2 * rayon + 4; const eg = e.getContext("2d");
  const ox = rayon + 2 - x0, oy = rayon + 2 - y0;
  if (rayon > 0) {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      for (const f of [1, 0.66, 0.33]) eg.drawImage(s, ox + Math.cos(a) * rayon * f, oy + Math.sin(a) * rayon * f);
    }
  }
  eg.drawImage(s, ox, oy);
  const lw = e.width * echelle, lh = e.height * echelle;
  g.imageSmoothingQuality = "high";
  g.drawImage(e, taille / 2 - lw / 2, taille / 2 - lh / 2, lw, lh);
  return c.toDataURL("image/png");
}
window.fabriquer = async (logoUrl) => {
  const logo = await charger(logoUrl), r = {};
  for (const t of [1024]) r["icone-" + t] = await icone(t, logo);
  for (const t of [16, 20, 24, 32, 40, 48, 64, 128, 256, 512]) r["pleine-" + t] = iconePleine(t, logo);
  return r;
};
</script></body></html>`;

app.whenReady().then(async () => {
  const f = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await f.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page));
  const logo = "data:image/png;base64," + fs.readFileSync(B("logo-helice.png")).toString("base64");
  const r = await f.webContents.executeJavaScript(`fabriquer(${JSON.stringify(logo)})`);
  const png = (cle) => Buffer.from(r[cle].split(",")[1], "base64");
  fs.writeFileSync(B("icon.png"), png("icone-1024"));
  fs.mkdirSync(B("icons"), { recursive: true });
  for (const t of [16, 24, 32, 48, 64, 128, 256, 512]) fs.writeFileSync(B("icons", `${t}x${t}.png`), png(`pleine-${t}`));
  // Zone de notification : 16 px (32 sur les écrans denses), comme l'icône de la barre des tâches.
  fs.writeFileSync(B("tray.png"), png("pleine-16"));
  fs.writeFileSync(B("tray@2x.png"), png("pleine-32"));
  // ICO à entrées PNG (Windows Vista et suivants), toutes les tailles que Windows demande (bureau, barre des tâches à 100 à 200 %).
  const entrees = [16, 20, 24, 32, 40, 48, 64, 128, 256].map((t) => [t, png(`pleine-${t}`)]);
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
