/**
 * Coffre des secrets du poste.
 *
 * Le jeton de séance et le jeton d'instance vivaient dans le stockage local du
 * rendu, en clair. Ce n'est pas une faille réseau : c'est le risque « poste
 * volé, ou sauvegarde exfiltrée ». Sur macOS, `safeStorage` chiffre avec une
 * clé du trousseau du compte, protégée par le système : le fichier recopié
 * ailleurs ne s'ouvre plus.
 *
 * Ce module ne connaît pas le sens de ce qu'il garde. Il range des chaînes par
 * nom, dans un seul fichier chiffré, en 0600. Rien n'est conservé en clair.
 *
 * Si le système ne sait pas chiffrer (trousseau verrouillé, plateforme sans
 * équivalent), on le dit à l'interface, qui retombe sur son stockage habituel.
 * Mieux vaut un repli annoncé qu'un fichier « chiffré » qui ne l'est pas.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { safeStorage } = require("electron");

function fichier() {
  return path.join(process.env.HELIX_DATA_DIR ?? path.join(os.homedir(), ".helix"), "secrets.enc");
}

/** Le système sait-il chiffrer pour ce compte ? */
function disponible() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function lire() {
  if (!disponible()) return {};
  try {
    const brut = fs.readFileSync(fichier());
    const clair = safeStorage.decryptString(brut);
    const valeurs = JSON.parse(clair);
    return valeurs && typeof valeurs === "object" && !Array.isArray(valeurs) ? valeurs : {};
  } catch {
    // Absent, illisible, ou chiffré par un autre compte : on repart de zéro.
    return {};
  }
}

function ecrire(valeurs) {
  if (!disponible()) return false;
  try {
    const chemin = fichier();
    fs.mkdirSync(path.dirname(chemin), { recursive: true });
    fs.writeFileSync(chemin, safeStorage.encryptString(JSON.stringify(valeurs)));
    fs.chmodSync(chemin, 0o600);
    return true;
  } catch (err) {
    console.error("[helix] coffre non écrit :", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Range une valeur, ou l'efface (`valeur` nulle). */
function poser(cle, valeur) {
  if (typeof cle !== "string" || !cle) return false;
  const valeurs = lire();
  if (valeur === null || valeur === undefined) delete valeurs[cle];
  else if (typeof valeur === "string") valeurs[cle] = valeur;
  else return false;
  return ecrire(valeurs);
}

/** Vide le coffre : déconnexion complète, ou effacement des données du poste. */
function vider() {
  try {
    fs.rmSync(fichier(), { force: true });
    return true;
  } catch {
    return false;
  }
}

module.exports = { disponible, lire, poser, vider };
