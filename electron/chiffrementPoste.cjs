/**
 * Le système sait-il chiffrer pour ce compte, pour de vrai ?
 *
 * Audit Linux du 27/09/2026 : sur un bureau sans trousseau reconnu (i3, sway,
 * une session sans GNOME ni KDE), Chromium chiffre avec une clé écrite dans son
 * propre code (`basic_text`), la même partout, et `isEncryptionAvailable()`
 * répond quand même oui. Un fichier « chiffré » ainsi s'ouvre sur n'importe
 * quelle machine : on le tient pour non chiffré, et on le dit.
 */

const { safeStorage } = require("electron");

function chiffrementSur() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // Seulement les vrais trousseaux ; « basic_text » et « unknown » ne protègent rien (revue du 27/09/2026).
    if (process.platform === "linux" && typeof safeStorage.getSelectedStorageBackend === "function") {
      return ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(safeStorage.getSelectedStorageBackend());
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = { chiffrementSur };
