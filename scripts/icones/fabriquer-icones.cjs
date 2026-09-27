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
 *    minuscule dans la barre des tâches). Plus de marque rouge et noire de
 *    l'ancien favicon, nulle part ;
 *  - de 16 à 48 px (barre des tâches, zone de notification, petites icônes du
 *    bureau) : une hélice simplifiée redessinée en vectoriel, trait d'un pixel
 *    calé sur la grille, au lieu de l'image réduite puis épaissie, qui faisait
 *    une tache noire grasse (vu par Medhi sur un PC, 27/09/2026, « encore
 *    grasse »). L'hélice détaillée reste à partir de 64 px.
 *
 * Pour juger le résultat : regarder les tailles réelles et agrandies sans
 * lissage, sur fond clair et sur fond sombre (barre des tâches de Windows).
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
 * Windows et Linux, 64 px et plus : carré arrondi qui remplit l'icône (2 % de
 * marge), hélice détaillée sur 84 % de la hauteur. À 64 px, le trait est à peine
 * épaissi (dilatation : l'hélice redessinée décalée tout autour d'elle) ; en
 * dessous, c'est iconeTrait qui dessine.
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
   * Juste assez de trait pour rester visible, pas plus. Plus épais, l'hélice
   * devenait une tache noire sur le bureau de Windows (48 px ; vu par Medhi le
   * 27/09/2026, « noir foncé bizarre »), loin du trait fin de l'icône du Mac.
   */
  const voulu = taille <= 64 ? 0.55 : 0;
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
/*
 * Petites tailles (16 à 48 px) : l'hélice redessinée au trait, en vectoriel, au lieu
 * de l'image réduite. Réduite puis épaissie, elle faisait une tache noire grasse dans
 * la barre des tâches (vu par Medhi sur un PC, 27/09/2026, « encore grasse »).
 *
 * Même dessin que le logo : deux brins qui se croisent deux fois (trois boucles),
 * pointe du haut à droite, pointe du bas à gauche, barreaux horizontaux. Chaque brin
 * est une sinusoïde, x = cx + R cos(φ ∓ α) : le décalage de phase 2α penche les
 * boucles comme la vue en perspective du logo, et les croisements tombent en φ = π, 2π.
 *
 * Calé au pixel : colonnes extrêmes des brins et barreaux sur des centres de pixel,
 * tracé d'un pixel suréchantillonné 16 fois, puis la couverture resserrée (moins de
 * 40 % de pixel s'efface, plus de 80 % devient plein) : un trait net d'un pixel, sans
 * le halo gris qui empâte. Essayés et écartés (27/09/2026) : un seuil bas à 25 %
 * (les diagonales doublaient), un trait de 1,1 à 1,25 px à 48 px et des points aux
 * sommets (à 40 et 48 px, l'hélice redevenait lourde, les points se fondaient dans
 * le trait ou faisaient des bosses).
 *
 * Par taille : colonnes (largeur de l'hélice) et lignes (hauteur), en pixels, et
 * barreaux par boucle. L'hélice est un peu plus large que le logo à 16 et 20 px,
 * pour que chaque boucle garde un blanc au milieu. Pas de barreau jusqu'à 24 px :
 * une boucle n'y a que cinq ou six rangées, et un barreau la coupait en deux cases
 * d'un pixel, un quadrillage qui alourdissait la barre des tâches.
 */
const TRAIT = {
  16: { colonnes: 6, lignes: 12, barreaux: 0 },
  20: { colonnes: 6, lignes: 16, barreaux: 0 },
  24: { colonnes: 8, lignes: 19, barreaux: 0 },
  32: { colonnes: 10, lignes: 26, barreaux: 2 },
  40: { colonnes: 12, lignes: 32, barreaux: 2 },
  48: { colonnes: 14, lignes: 39, barreaux: 3 },
};
/*
 * Demi-décalage de phase des deux brins (rad). Sur le logo, la pointe du haut est aux
 * deux tiers de la demi-largeur (α ≈ 0,85), mais ses boucles sont plus rondes qu'une
 * vraie projection : à 0,85, elles devenaient des feuilles plates ; 1,1 les ouvre.
 */
const ALPHA = 1.1;
function iconeTrait(taille) {
  const p = TRAIT[taille], S = 16;
  const c = document.createElement("canvas"); c.width = c.height = taille; const g = c.getContext("2d");
  // Carré arrondi : même fond et même liseré qu'aux grandes tailles, liseré d'un pixel posé sur une rangée entière.
  const cote = taille - 1, r = taille * 0.2;
  g.beginPath(); g.roundRect(0.5, 0.5, cote, cote, r);
  const dg = g.createLinearGradient(0, 0, 0, taille); dg.addColorStop(0, "#FFFFFF"); dg.addColorStop(1, "#F3F2EE");
  g.fillStyle = dg; g.fill(); g.lineWidth = 1; g.strokeStyle = LISERE; g.stroke();
  // L'hélice, tracée seize fois plus grande.
  const h = document.createElement("canvas"); h.width = h.height = taille * S; const hg = h.getContext("2d");
  hg.scale(S, S); hg.strokeStyle = hg.fillStyle = "#000"; hg.lineWidth = 1; hg.lineCap = hg.lineJoin = "round";
  const cx = taille / 2, R = (p.colonnes - 1) / 2;
  const haut = Math.floor((taille - p.lignes) / 2) + 0.5, H = p.lignes - 1;
  const brin = (phi, s) => cx + R * Math.cos(phi - s * ALPHA);
  const yDe = (phi) => haut + (phi / (3 * Math.PI)) * H;
  for (const s of [1, -1]) {
    hg.beginPath();
    for (let k = 0; k <= 300; k++) { const phi = (k / 300) * 3 * Math.PI; k ? hg.lineTo(brin(phi, s), yDe(phi)) : hg.moveTo(brin(phi, s), yDe(phi)); }
    hg.stroke();
  }
  for (let boucle = 0; boucle < 3; boucle++) for (let j = 1; j <= p.barreaux; j++) {
    // Barreau sur la rangée de pixels la plus proche, extrémités recalculées sur les brins à cette hauteur.
    const y = Math.floor(yDe((boucle + j / (p.barreaux + 1)) * Math.PI)) + 0.5, phi = ((y - haut) / H) * 3 * Math.PI;
    hg.beginPath(); hg.moveTo(brin(phi, 1), y); hg.lineTo(brin(phi, -1), y); hg.stroke();
  }
  // Couverture par pixel, resserrée, puis posée en encre sur le carré.
  const src = hg.getImageData(0, 0, h.width, h.height).data, out = g.getImageData(0, 0, taille, taille), o = out.data;
  const E = [0x16, 0x14, 0x0F];
  for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) {
    let somme = 0;
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) somme += src[((y * S + v) * h.width + x * S + u) * 4 + 3];
    const cov = somme / (S * S * 255), a = Math.min(1, Math.max(0, (cov - 0.4) / 0.4));
    const i = (y * taille + x) * 4;
    for (let k = 0; k < 3; k++) o[i + k] = Math.round(o[i + k] * (1 - a) + E[k] * a);
  }
  g.putImageData(out, 0, 0);
  return c.toDataURL("image/png");
}
window.fabriquer = async (logoUrl) => {
  const logo = await charger(logoUrl), r = {};
  for (const t of [1024]) r["icone-" + t] = await icone(t, logo);
  for (const t of [16, 20, 24, 32, 40, 48]) r["pleine-" + t] = iconeTrait(t);
  for (const t of [64, 128, 256, 512]) r["pleine-" + t] = iconePleine(t, logo);
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
