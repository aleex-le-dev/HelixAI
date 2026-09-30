/*
 * Rend transparent le fond d'un logo livré en tracé noir sur blanc opaque
 * (30/09/2026). Le blanc était effacé à l'écran par un mélange de calques
 * (`mix-blend-mode`), qui laisse un carré gris autour du logo dès que le blanc
 * de l'image n'est pas un blanc pur ou que le navigateur isole le calque
 * (animation) : vu sous Windows, thème sombre. Ici le blanc devient de la
 * vraie transparence : chaque point devient noir, d'autant plus opaque qu'il
 * était sombre.
 *
 *   node scripts/icones/marque-transparente.mjs src/assets/helix-mark.png
 *
 * Sans dépendance : PNG 8 bits RVB ou RVBA, non entrelacé, lu et réécrit avec zlib.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync, crc32 } from "node:zlib";

const fichier = process.argv[2];
if (!fichier) throw new Error("Usage : node scripts/icones/marque-transparente.mjs <image.png>");
const png = readFileSync(fichier);
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("Ce n'est pas un PNG.");

let largeur = 0;
let hauteur = 0;
let canaux = 0;
const morceaux = [];
for (let i = 8; i < png.length; ) {
  const taille = png.readUInt32BE(i);
  const type = png.toString("latin1", i + 4, i + 8);
  const donnees = png.subarray(i + 8, i + 8 + taille);
  if (type === "IHDR") {
    largeur = donnees.readUInt32BE(0);
    hauteur = donnees.readUInt32BE(4);
    const [profondeur, couleur, , , entrelace] = donnees.subarray(8);
    if (profondeur !== 8 || (couleur !== 2 && couleur !== 6) || entrelace !== 0) throw new Error("PNG attendu : 8 bits, RVB ou RVBA, non entrelacé.");
    canaux = couleur === 2 ? 3 : 4;
  }
  if (type === "IDAT") morceaux.push(donnees);
  i += 12 + taille;
}

/* Défaire les filtres de ligne du PNG. */
const brut = inflateSync(Buffer.concat(morceaux));
const pas = largeur * canaux;
const points = Buffer.alloc(hauteur * pas);
for (let y = 0; y < hauteur; y++) {
  const filtre = brut[y * (pas + 1)];
  for (let x = 0; x < pas; x++) {
    const v = brut[y * (pas + 1) + 1 + x];
    const a = x >= canaux ? points[y * pas + x - canaux] : 0;
    const b = y > 0 ? points[(y - 1) * pas + x] : 0;
    const c = x >= canaux && y > 0 ? points[(y - 1) * pas + x - canaux] : 0;
    let p = 0;
    if (filtre === 1) p = a;
    else if (filtre === 2) p = b;
    else if (filtre === 3) p = (a + b) >> 1;
    else if (filtre === 4) {
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    points[y * pas + x] = (v + p) & 0xff;
  }
}

/*
 * Noir, d'autant plus opaque que le point était sombre. Au-dessus de 244 de
 * luminance, c'est le fond : transparent, même s'il n'est pas d'un blanc pur.
 */
const SEUIL_FOND = 244;
const sortie = Buffer.alloc(hauteur * (1 + largeur * 4));
for (let y = 0; y < hauteur; y++) {
  sortie[y * (1 + largeur * 4)] = 0;
  for (let x = 0; x < largeur; x++) {
    const i = y * pas + x * canaux;
    const luminance = 0.2126 * points[i] + 0.7152 * points[i + 1] + 0.0722 * points[i + 2];
    const dejaTransparent = canaux === 4 ? points[i + 3] / 255 : 1;
    const opacite = luminance >= SEUIL_FOND ? 0 : Math.round((1 - luminance / SEUIL_FOND) * 255 * dejaTransparent);
    sortie[y * (1 + largeur * 4) + 1 + x * 4 + 3] = opacite;
  }
}

const morceau = (type, donnees) => {
  const tete = Buffer.alloc(8);
  tete.writeUInt32BE(donnees.length, 0);
  tete.write(type, 4, "latin1");
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(Buffer.concat([tete.subarray(4), donnees])) >>> 0, 0);
  return Buffer.concat([tete, donnees, somme]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(largeur, 0);
ihdr.writeUInt32BE(hauteur, 4);
ihdr.set([8, 6, 0, 0, 0], 8);
writeFileSync(fichier, Buffer.concat([png.subarray(0, 8), morceau("IHDR", ihdr), morceau("IDAT", deflateSync(sortie, { level: 9 })), morceau("IEND", Buffer.alloc(0))]));
console.log(`${fichier} : ${largeur} × ${hauteur}, fond transparent.`);
