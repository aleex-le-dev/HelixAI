/**
 * Texte d'un fichier, quel que soit son encodage.
 *
 * Écrit le 27/09/2026, en relisant le chemin des pièces jointes pour un PC
 * Windows : le fichier était lu comme de l'UTF-8, toujours. Or sous Windows,
 * deux encodages courants ne le sont pas :
 *  - l'UTF-16 (« Unicode » du Bloc-notes, sortie d'un script PowerShell,
 *    exports de nombreux logiciels) : lu comme de l'UTF-8, chaque lettre
 *    arrivait suivie d'un caractère nul, et le modèle recevait un texte
 *    illisible, sans que rien ne le dise ;
 *  - le Windows-1252 (un CSV enregistré par Excel en français, un vieux .txt) :
 *    chaque accent devenait « � ».
 *
 * Aucune dépendance : ce module se lit tel quel par la batterie de contrôles
 * (scripts/securite.mjs), hors du navigateur.
 */

/** Sans marque d'ordre des octets, un texte en UTF-16 se reconnaît à ses octets nuls, une fois sur deux. */
function utf16SansMarque(octets: Uint8Array): "utf-16le" | "utf-16be" | null {
  const n = Math.min(octets.length, 4096) & ~1;
  if (n < 4) return null;
  let nulsPairs = 0;
  let nulsImpairs = 0;
  for (let i = 0; i < n; i += 2) {
    if (octets[i] === 0) nulsPairs++;
    if (octets[i + 1] === 0) nulsImpairs++;
  }
  const paires = n / 2;
  if (nulsImpairs > paires * 0.3 && nulsPairs < paires * 0.05) return "utf-16le";
  if (nulsPairs > paires * 0.3 && nulsImpairs < paires * 0.05) return "utf-16be";
  return null;
}

/**
 * Décode les octets d'un fichier texte. `coupe` : ce ne sont que les premiers
 * octets du fichier, et le dernier caractère peut être coupé en deux.
 */
export function decoderTexte(octets: Uint8Array, coupe = false): string {
  if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(octets.subarray(3), { stream: coupe });
  }
  const pair = (o: Uint8Array) => (o.length % 2 === 0 ? o : o.subarray(0, o.length - 1));
  if (octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder("utf-16le").decode(pair(octets.subarray(2)));
  if (octets[0] === 0xfe && octets[1] === 0xff) return new TextDecoder("utf-16be").decode(pair(octets.subarray(2)));
  const seize = utf16SansMarque(octets);
  if (seize) return new TextDecoder(seize).decode(pair(octets));
  try {
    // `stream` : une lettre accentuée coupée par la fin de la lecture n'est pas une faute d'encodage.
    return new TextDecoder("utf-8", { fatal: true }).decode(octets, { stream: coupe });
  } catch {
    return new TextDecoder("windows-1252").decode(octets);
  }
}

/**
 * Un fichier d'extension inconnue (.srt, .tex, .toml, .bat, .ps1, .lua…)
 * est-il du texte ? On regarde ses premiers octets : décodé, presque aucun
 * caractère de contrôle. Un binaire (image, archive, exécutable) en est plein.
 */
export function ressembleATexte(octets: Uint8Array): boolean {
  if (octets.length === 0) return false;
  const texte = decoderTexte(octets.subarray(0, 8192), true);
  if (!texte) return false;
  let controles = 0;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0c) || c === 0xfffd) controles++;
  }
  return controles <= texte.length * 0.01;
}
