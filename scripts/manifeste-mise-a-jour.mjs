/**
 * Écrit `release/helix-mise-a-jour.json`, le manifeste que lit la mise à jour
 * d'un poste installé seul (electron/sourceGithub.cjs), à publier avec la
 * version : l'archive macOS, son empreinte SHA-512 (base64, la forme
 * d'electron-updater) et sa taille. L'archive elle-même est la
 * `Helix-<version>-arm64-mac.zip` de `npm run package`.
 *
 *   node scripts/manifeste-mise-a-jour.mjs
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, pas `.pathname` : le chemin du projet a des espaces (« Claude Code »).
const racine = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(join(racine, "package.json"), "utf8"));
const fichier = `Helix-${version}-arm64-mac.zip`;
const chemin = join(racine, "release", fichier);
const hash = createHash("sha512");
await new Promise((resolve, reject) => createReadStream(chemin).on("data", (m) => hash.update(m)).on("end", resolve).on("error", reject));
const manifeste = { version, mac: { fichier, sha512: hash.digest("base64"), octets: statSync(chemin).size } };
writeFileSync(join(racine, "release", "helix-mise-a-jour.json"), `${JSON.stringify(manifeste, null, 2)}\n`);
console.log(`release/helix-mise-a-jour.json : ${version}, ${fichier} (${manifeste.mac.octets} octets)`);
