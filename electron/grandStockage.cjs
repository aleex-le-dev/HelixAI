/**
 * Grand stockage du poste : les collections trop grosses pour le stockage
 * local du navigateur.
 *
 * Les Chats vivaient dans `localStorage`, limité par Chromium à quelques Mo
 * par origine ; une écriture qui dépassait était ignorée sans erreur, et un
 * import ChatGPT ou Claude s'y heurtait vite. Ici, un fichier par collection,
 * chiffré comme le coffre (`safeStorage`, clé du trousseau du compte), en 0600,
 * écrit de façon atomique (fichier temporaire puis renommage).
 *
 * Seules les clés listées passent par ici. Sans chiffrement disponible, on le
 * dit à l'interface, qui garde son stockage habituel.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { safeStorage } = require("electron");

const CLES = new Set(["sessions"]);
/** Copies gardées quand une collection rétrécit brutalement (voir `poser`). */
const COPIES_MAX = 3;

const dossier = () => path.join(process.env.HELIX_DATA_DIR ?? path.join(os.homedir(), ".helix"), "poste");
const chemin = (cle) => path.join(dossier(), `${cle}.enc`);

function disponible() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/*
 * Clés dont le fichier existe mais n'a pas pu être lu au démarrage (trousseau
 * refusé ou verrouillé, clé du trousseau changée, fichier abîmé). Ce cas était
 * confondu avec « pas encore écrite » : l'interface partait d'une liste vide,
 * et la première écriture (un Chat neuf) remplaçait le fichier illisible, donc
 * les Chats, sans copie, puis les effaçait de l'instance.
 */
const illisibles = new Set();
/** Clés dont le fichier illisible a déjà été mis de côté pendant cette séance (voir `garderSiReduction`). */
const copieIllisibleFaite = new Set();

/** Toutes les valeurs rangées, déchiffrées. Illisible : absente (l'instance la rendra), et notée. */
function lire() {
  const valeurs = {};
  const chiffrement = disponible();
  for (const cle of CLES) {
    let brut;
    try {
      brut = fs.readFileSync(chemin(cle));
    } catch (err) {
      if (err && err.code !== "ENOENT") illisibles.add(cle);
      continue;
    }
    if (!chiffrement) {
      illisibles.add(cle);
      continue;
    }
    try {
      valeurs[cle] = safeStorage.decryptString(brut);
      illisibles.delete(cle);
    } catch {
      illisibles.add(cle);
    }
  }
  return valeurs;
}

/** Les clés présentes sur le disque mais illisibles à la dernière lecture. */
const clesIllisibles = () => [...illisibles];

function poser(cle, valeur) {
  if (!CLES.has(cle) || !disponible()) return false;
  fs.mkdirSync(dossier(), { recursive: true, mode: 0o700 });
  if (valeur === null) {
    // Effacer une liste pleine, ou illisible, en garde d'abord une copie.
    garderSiReduction(cle, "");
    fs.rmSync(chemin(cle), { force: true });
    return true;
  }
  const texte = String(valeur);
  garderSiReduction(cle, texte);
  const tmp = `${chemin(cle)}.tmp`;
  fs.writeFileSync(tmp, safeStorage.encryptString(texte), { mode: 0o600 });
  fs.renameSync(tmp, chemin(cle));
  return true;
}

/**
 * Une liste de Chats qui fond d'un coup (moins de la moitié de la précédente,
 * ou vide) peut être une suppression voulue, ou une perte. Le 24/09/2026, au
 * passage à ce stockage, une liste pleine a été remplacée par « [] » sur le
 * poste du client, dans un démarrage perturbé (application reconstruite
 * pendant qu'elle tournait) ; seul le journal du navigateur gardait l'ancienne.
 * On garde donc l'ancienne version à côté, chiffrée pareil, trois au plus.
 */
function garderSiReduction(cle, texte) {
  let ancien;
  try {
    ancien = fs.readFileSync(chemin(cle));
  } catch {
    return;
  }
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  let avant;
  try {
    avant = safeStorage.decryptString(ancien);
  } catch {
    /*
     * Illisible aujourd'hui ne veut pas dire perdu : le trousseau peut
     * revenir. On ne l'écrase jamais sans en garder une copie, hors de la
     * rotation des trois copies (elle ne doit pas en chasser une lisible).
     * Une fois par séance : ensuite, le fichier est celui que cette séance a
     * écrit, et un déchiffrement durablement en panne ferait une copie à
     * chaque message.
     */
    if (copieIllisibleFaite.has(cle)) return;
    copieIllisibleFaite.add(cle);
    fs.writeFileSync(path.join(dossier(), `${cle}.${date}.illisible.enc`), ancien, { mode: 0o600 });
    return;
  }
  if (avant.length < 200 || texte.length * 2 >= avant.length) return;
  fs.writeFileSync(path.join(dossier(), `${cle}.${date}.copie.enc`), ancien, { mode: 0o600 });
  const copies = fs
    .readdirSync(dossier())
    .filter((f) => f.startsWith(`${cle}.`) && f.endsWith(".copie.enc"))
    .sort();
  for (const f of copies.slice(0, Math.max(0, copies.length - COPIES_MAX))) fs.rmSync(path.join(dossier(), f), { force: true });
}

module.exports = { CLES, disponible, lire, poser, clesIllisibles };
