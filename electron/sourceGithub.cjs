/**
 * Les publications GitHub du dépôt, source des mises à jour d'un poste installé
 * seul (ni serveur de l'agence inscrit dans le paquet, ni instance à laquelle
 * il est rattaché).
 *
 * Décidé par Medhi le 27/09/2026 : « les autres PC » (qui téléchargent Helix
 * depuis GitHub) doivent voir la fenêtre « Nouvelle version », et le dépôt
 * devient public. Ce qui revient sur la décision du 26/09 (« aucun GitHub »)
 * pour ces postes seulement ; les postes rattachés suivent toujours leur
 * instance.
 *
 * Pourquoi ce n'est pas un risque de plus : l'archive d'une mise à jour macOS
 * n'est installée qu'après vérification de la signature de l'éditeur, avec la
 * clé de l'application déjà installée (signatureEditeur.cjs) ; une publication
 * remplacée par un tiers ne passerait pas. Sous Windows et Linux, rien ne
 * s'installe : la fenêtre propose le paquet, que la personne installe.
 *
 * Ce module ne fait aucun appel réseau : il lit ce que l'API de GitHub rend, et
 * se vérifie sans Electron (scripts/essai-source-github.mjs).
 */

/** « 0.27.1 » est-elle plus récente que « 0.27.0 » ? Numéros seulement ; une préversion (« -beta ») n'est jamais proposée. */
function plusRecente(proposee, installee) {
  const lire = (v) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
    return m ? m.slice(1).map(Number) : null;
  };
  const a = lire(proposee);
  const b = lire(installee);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * Le paquet qui convient à ce poste, parmi les fichiers de la publication :
 * macOS l'image disque (lien de secours), Windows l'installateur, Linux
 * l'AppImage si c'est ainsi que Helix tourne, sinon le paquet Debian.
 */
function choisirPaquet(fichiers, { plateforme, arch, appImage }) {
  const noms = (fichiers ?? []).filter((f) => f && typeof f.name === "string" && typeof f.browser_download_url === "string");
  const trouver = (motif) => noms.find((f) => motif.test(f.name)) ?? null;
  if (plateforme === "darwin") return trouver(arch === "arm64" ? /-arm64\.dmg$/i : /-x64\.dmg$/i);
  if (plateforme === "win32") return trouver(arch === "arm64" ? /Setup-.*-arm64\.exe$/i : /Setup-.*-x64\.exe$/i);
  if (plateforme === "linux") {
    if (appImage) return trouver(arch === "arm64" ? /-arm64\.AppImage$/i : /\d\.AppImage$/i);
    return trouver(arch === "arm64" ? /_arm64\.deb$/i : /_amd64\.deb$/i);
  }
  return null;
}

/**
 * Le manifeste de la mise à jour macOS (`helix-mise-a-jour.json`, écrit à la
 * publication par scripts/manifeste-mise-a-jour.mjs), vérifié champ par champ :
 * version, archive .zip, empreinte SHA-512 (base64), taille.
 */
function lireManifeste(brut, versionAttendue) {
  let m;
  try {
    m = typeof brut === "string" ? JSON.parse(brut) : brut;
  } catch {
    return null;
  }
  const mac = m && m.mac;
  if (!m || m.version !== versionAttendue || !mac) return null;
  if (typeof mac.fichier !== "string" || !/^[\w.-]+\.zip$/.test(mac.fichier)) return null;
  if (typeof mac.sha512 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(mac.sha512)) return null;
  if (!Number.isInteger(mac.octets) || mac.octets <= 0) return null;
  // La forme qu'attend installerSansSignature (celle d'electron-updater).
  return { version: m.version, files: [{ url: mac.fichier, sha512: mac.sha512, size: mac.octets }] };
}

/** Le dépôt `propriétaire/nom`, s'il a la bonne forme. */
function depotValide(depot) {
  return typeof depot === "string" && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(depot) ? depot : null;
}

module.exports = { plusRecente, choisirPaquet, lireManifeste, depotValide };
