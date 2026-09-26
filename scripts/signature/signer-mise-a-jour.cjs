/**
 * Étape `afterSign` d'electron-builder : la clé de l'éditeur signe
 * l'application juste fabriquée (electron/signatureEditeur.cjs), avant que
 * l'image disque et l'archive ne soient faites.
 *
 * La clé privée n'est jamais dans le dépôt : ~/.helix-editeur/
 * cle-privee-mises-a-jour.pem par défaut (`npm run cle:editeur` la crée une
 * fois), ou le chemin donné par HELIX_CLE_EDITEUR. Sans elle, la fabrication
 * s'arrête, sauf si HELIX_SANS_CLE_EDITEUR=1 : l'application n'aura alors pas
 * de clé, et ses postes refuseront toute mise à jour d'un clic (elle s'installe
 * à la main).
 *
 * Une application signée par Apple (Developer ID) n'en a pas besoin : macOS
 * vérifie alors que la mise à jour porte la même signature, et ajouter des
 * fichiers après la signature d'Apple la casserait. Elle est laissée telle quelle.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { signerApplication, verifierApplication, cleDeLApplication } = require("../../electron/signatureEditeur.cjs");

exports.default = async function signerMiseAJour(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  let signeeParApple = false;
  try {
    const sortie = execFileSync("/usr/bin/codesign", ["-dv", "--verbose=2", app], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    signeeParApple = /Authority=Developer ID Application/.test(sortie);
  } catch (err) {
    signeeParApple = /Authority=Developer ID Application/.test(String(err?.stderr ?? ""));
  }
  if (signeeParApple) {
    console.log("  • signature de l'éditeur : inutile, l'application est signée par Apple (Developer ID)");
    return;
  }
  const chemin = process.env.HELIX_CLE_EDITEUR || path.join(os.homedir(), ".helix-editeur", "cle-privee-mises-a-jour.pem");
  if (!fs.existsSync(chemin)) {
    if (process.env.HELIX_SANS_CLE_EDITEUR === "1") {
      console.log("  • signature de l'éditeur : aucune (HELIX_SANS_CLE_EDITEUR=1) ; les postes de cette application refuseront les mises à jour d'un clic");
      return;
    }
    throw new Error(
      `Clé d'éditeur introuvable (${chemin}). Créez-la une fois avec « npm run cle:editeur », ` +
        "ou fabriquez sans mises à jour d'un clic avec HELIX_SANS_CLE_EDITEUR=1.",
    );
  }
  const identite = { identifiant: context.packager.appInfo.id, version: context.packager.appInfo.version };
  const signe = await signerApplication(app, fs.readFileSync(chemin, "utf8"), identite);
  // Revérifiée aussitôt, comme le fera un poste : une signature qu'on ne sait pas relire ne part pas.
  const relue = await verifierApplication(app, cleDeLApplication(app), identite);
  if (!relue.ok) throw new Error(`signature de l'éditeur non vérifiable : ${relue.raison}`);
  console.log(`  • signature de l'éditeur : ${signe.fichiers} éléments, clé ${signe.cle}`);
};
