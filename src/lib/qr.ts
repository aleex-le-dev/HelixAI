import { t } from "@/lib/i18n";
/**
 * Encodeur de QR code (ISO/IEC 18004), écrit ici plutôt qu'importé.
 *
 * Il ne sert qu'à une chose : montrer le secret du second facteur à
 * l'application d'authentification du téléphone. Ce secret est la dernière
 * chose à confier à une bibliothèque tierce ou, pire, à un service en ligne de
 * génération d'images. Le calcul tient en deux cents lignes sans dépendance.
 *
 * Périmètre volontairement réduit : mode octet, correction d'erreur de niveau
 * M (15 %), versions 1 à 40. Suit la construction de référence de Nayuki
 * (licence MIT), vérifiée ici par décodage réel (voir SECURITE.md, §1.9).
 */

/* Tables du niveau M, indexées par version (l'indice 0 ne sert pas). */
const ECC_PAR_BLOC = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const NOMBRE_DE_BLOCS = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
  26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];
/** Bits de format du niveau M. */
const FORMAT_M = 0;

function modulesBruts(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignements = Math.floor(version / 7) + 2;
    n -= (25 * alignements - 10) * alignements - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

function octetsDeDonnees(version: number): number {
  return Math.floor(modulesBruts(version) / 8) - ECC_PAR_BLOC[version]! * NOMBRE_DE_BLOCS[version]!;
}

/* ---- Reed-Solomon sur GF(256), polynôme 0x11D ---- */

function multiplier(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function diviseur(degre: number): number[] {
  const resultat = new Array<number>(degre).fill(0);
  resultat[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < resultat.length; j++) {
      resultat[j] = multiplier(resultat[j]!, racine);
      if (j + 1 < resultat.length) resultat[j]! ^= resultat[j + 1]!;
    }
    racine = multiplier(racine, 0x02);
  }
  return resultat;
}

function reste(donnees: number[], div: number[]): number[] {
  const resultat = new Array<number>(div.length).fill(0);
  for (const octet of donnees) {
    const facteur = octet ^ resultat.shift()!;
    resultat.push(0);
    div.forEach((coef, i) => (resultat[i]! ^= multiplier(coef, facteur)));
  }
  return resultat;
}

/* ---- Construction ---- */

export type Matrice = boolean[][];

export function encoderQr(texte: string): Matrice {
  const octets = Array.from(new TextEncoder().encode(texte));

  // Plus petite version qui contient le texte.
  let version = 1;
  const bitsNecessaires = (v: number) => 4 + (v <= 9 ? 8 : 16) + octets.length * 8;
  while (bitsNecessaires(version) > octetsDeDonnees(version) * 8) {
    version++;
    if (version > 40) throw new Error(t("Texte trop long pour un QR code."));
  }

  // Flux de bits : mode octet, longueur, contenu, terminaison, remplissage.
  const bits: number[] = [];
  const ajouter = (valeur: number, longueur: number) => {
    for (let i = longueur - 1; i >= 0; i--) bits.push((valeur >>> i) & 1);
  };
  ajouter(0b0100, 4);
  ajouter(octets.length, version <= 9 ? 8 : 16);
  for (const o of octets) ajouter(o, 8);
  const capacite = octetsDeDonnees(version) * 8;
  ajouter(0, Math.min(4, capacite - bits.length));
  ajouter(0, (8 - (bits.length % 8)) % 8);
  for (let bourrage = 0xec; bits.length < capacite; bourrage ^= 0xec ^ 0x11) ajouter(bourrage, 8);

  const donnees: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let o = 0;
    for (let j = 0; j < 8; j++) o = (o << 1) | bits[i + j]!;
    donnees.push(o);
  }

  // Blocs, correction d'erreur, entrelacement.
  const nbBlocs = NOMBRE_DE_BLOCS[version]!;
  const eccParBloc = ECC_PAR_BLOC[version]!;
  const totalOctets = Math.floor(modulesBruts(version) / 8);
  const nbCourts = nbBlocs - (totalOctets % nbBlocs);
  const longueurCourte = Math.floor(totalOctets / nbBlocs);
  const div = diviseur(eccParBloc);
  const blocs: number[][] = [];
  for (let i = 0, k = 0; i < nbBlocs; i++) {
    const morceau = donnees.slice(k, k + longueurCourte - eccParBloc + (i < nbCourts ? 0 : 1));
    k += morceau.length;
    const ecc = reste(morceau, div);
    if (i < nbCourts) morceau.push(0);
    blocs.push(morceau.concat(ecc));
  }
  const flux: number[] = [];
  for (let i = 0; i < blocs[0]!.length; i++) {
    blocs.forEach((bloc, j) => {
      if (i !== longueurCourte - eccParBloc || j >= nbCourts) flux.push(bloc[i]!);
    });
  }

  // Motifs fixes.
  const taille = version * 4 + 17;
  const modules: Matrice = Array.from({ length: taille }, () => new Array<boolean>(taille).fill(false));
  const fixe: Matrice = Array.from({ length: taille }, () => new Array<boolean>(taille).fill(false));
  const poser = (x: number, y: number, sombre: boolean) => {
    modules[y]![x] = sombre;
    fixe[y]![x] = true;
  };

  for (let i = 0; i < taille; i++) {
    poser(6, i, i % 2 === 0);
    poser(i, 6, i % 2 === 0);
  }
  const reperes = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < taille && y >= 0 && y < taille) poser(x, y, d !== 2 && d !== 4);
      }
    }
  };
  reperes(3, 3);
  reperes(taille - 4, 3);
  reperes(3, taille - 4);

  const positions: number[] = [];
  if (version > 1) {
    const n = Math.floor(version / 7) + 2;
    const pasAlign = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
    positions.push(6);
    for (let p = taille - 7; positions.length < n; p -= pasAlign) positions.splice(1, 0, p);
  }
  const dernier = positions.length - 1;
  positions.forEach((py, i) =>
    positions.forEach((px, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === dernier) || (i === dernier && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) poser(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }),
  );

  const poserFormat = (masque: number) => {
    const donnee = (FORMAT_M << 3) | masque;
    let r = donnee;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const f = ((donnee << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) poser(8, i, bit(i));
    poser(8, 7, bit(6));
    poser(8, 8, bit(7));
    poser(7, 8, bit(8));
    for (let i = 9; i < 15; i++) poser(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) poser(taille - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) poser(8, taille - 15 + i, bit(i));
    poser(8, taille - 8, true);
  };
  poserFormat(0);

  if (version >= 7) {
    let r = version;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const v = (version << 12) | r;
    for (let i = 0; i < 18; i++) {
      const sombre = ((v >>> i) & 1) !== 0;
      const a = taille - 11 + (i % 3);
      const b = Math.floor(i / 3);
      poser(a, b, sombre);
      poser(b, a, sombre);
    }
  }

  // Placement en zigzag, par colonnes de deux, de bas en haut puis de haut en bas.
  let i = 0;
  for (let droite = taille - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let vert = 0; vert < taille; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = droite - j;
        const montant = ((droite + 1) & 2) === 0;
        const y = montant ? taille - 1 - vert : vert;
        if (!fixe[y]![x] && i < flux.length * 8) {
          modules[y]![x] = ((flux[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  // Masque : on garde celui qui produit le moins de motifs gênants pour la lecture.
  const inverse = (m: number, x: number, y: number): boolean => {
    switch (m) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  };
  const appliquer = (m: number) => {
    for (let y = 0; y < taille; y++) {
      for (let x = 0; x < taille; x++) if (!fixe[y]![x] && inverse(m, x, y)) modules[y]![x] = !modules[y]![x];
    }
  };

  let meilleur = 0;
  let meilleurScore = Infinity;
  for (let m = 0; m < 8; m++) {
    appliquer(m);
    poserFormat(m);
    const score = penalite(modules);
    if (score < meilleurScore) {
      meilleurScore = score;
      meilleur = m;
    }
    appliquer(m);
  }
  appliquer(meilleur);
  poserFormat(meilleur);
  return modules;
}

/** Pénalités de la norme (§7.8.3), sous leur forme usuelle. */
function penalite(m: Matrice): number {
  const n = m.length;
  let score = 0;
  const lignes: boolean[][] = [];
  for (let y = 0; y < n; y++) lignes.push(m[y]!);
  for (let x = 0; x < n; x++) lignes.push(m.map((ligne) => ligne[x]!));

  for (const ligne of lignes) {
    // Suites de cinq modules ou plus de même couleur.
    let suite = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && ligne[i] === ligne[i - 1]) suite++;
      else {
        if (suite >= 5) score += 3 + (suite - 5);
        suite = 1;
      }
    }
    // Motifs qui imitent un repère de position.
    const texte = ligne.map((b) => (b ? "1" : "0")).join("");
    for (const motif of ["10111010000", "00001011101"]) {
      for (let k = texte.indexOf(motif); k >= 0; k = texte.indexOf(motif, k + 1)) score += 40;
    }
  }
  // Carrés de deux sur deux de même couleur.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = m[y]![x];
      if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) score += 3;
    }
  }
  // Équilibre entre sombre et clair.
  let sombres = 0;
  for (const ligne of m) for (const b of ligne) if (b) sombres++;
  const total = n * n;
  score += (Math.ceil(Math.abs(sombres * 20 - total * 10) / total) - 1) * 10;
  return score;
}
