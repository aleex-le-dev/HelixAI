/**
 * La signature de l'éditeur sur une application Helix, pour les mises à jour
 * d'un clic sans signature Apple.
 *
 * Pourquoi (revue de sécurité du 26/09/2026, SECURITE.md § 28, décidé par
 * Medhi le 27/09) : un poste se met à jour depuis l'instance à laquelle il est
 * rattaché, qui lui donne l'annonce, l'archive ET son empreinte. Une instance
 * piratée pouvait donc faire installer n'importe quelle application sous le
 * nom de Helix, avec l'empreinte qui va avec, et elle aurait hérité des
 * autorisations de macOS accordées à Helix (écran, accessibilité, micro).
 *
 * Désormais :
 *  - à la fabrication (`npm run package`, scripts/signature/signer-mise-a-jour.cjs),
 *    la clé privée de l'éditeur, gardée hors du dépôt, signe le relevé complet
 *    de l'application : chaque fichier, son empreinte SHA-256 et son droit
 *    d'exécution, chaque lien symbolique et sa cible, plus l'identifiant et la
 *    version. La signature et la clé publique sont posées dans l'application
 *    (Contents/Resources) ;
 *  - l'instance sert l'application qu'elle fait tourner, telle quelle ;
 *  - le poste, après téléchargement, refait le relevé de la nouvelle
 *    application et vérifie la signature avec la clé publique de l'application
 *    **qu'il fait déjà tourner**, jamais avec celle qu'apporte la nouvelle.
 *    Sans clé, ou signature fausse : pas d'installation.
 *
 * Ed25519, par `node:crypto`, sans dépendance. Le relevé porte sur le contenu,
 * pas sur l'archive : l'instance refait son archive elle-même (`ditto`), et ses
 * octets changent d'une fois à l'autre ; le contenu, non.
 */

const crypto = require("node:crypto");
/*
 * `original-fs` dans Electron : son `fs` ouvre les archives `.asar` comme des
 * dossiers, et le relevé ne lisait pas les octets signés (hors d'Electron) ;
 * toute mise à jour était refusée, « son contenu a changé depuis sa
 * signature » (premier essai réel, 27/09/2026).
 */
const fs = process.versions.electron ? require("original-fs") : require("node:fs");
const path = require("node:path");

const FICHIER_SIGNATURE = "helix-signature.json";
const FICHIER_CLE = "cle-editeur.pem";
const ENTETE = "helix-mise-a-jour-v1";

const ressources = (app) => path.join(app, "Contents", "Resources");

/** SHA-256 d'un fichier, lu par morceaux : l'application pèse plusieurs centaines de mégaoctets. */
function empreinteFichier(chemin) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(chemin)
      .on("data", (m) => h.update(m))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

/*
 * La signature de code de macOS ne compte pas dans le relevé (27/09/2026) :
 * l'application doit être signée (au moins « ad hoc ») après que la signature
 * de l'éditeur y a été posée, sinon macOS la dit « endommagée » une fois
 * téléchargée. Les dossiers `_CodeSignature` sont écartés, et chaque programme
 * (Mach-O) est relevé sans sa signature de code (copie, `codesign
 * --remove-signature`) : le relevé porte sur le code lui-même, identique avant
 * et après la signature de macOS.
 */
const MACH_O = new Set(["feedfacf", "cffaedfe", "cafebabe", "bebafeca", "feedface", "cefaedfe"]);

function estMachO(chemin) {
  try {
    const fd = fs.openSync(chemin, "r");
    const tete = Buffer.alloc(4);
    fs.readSync(fd, tete, 0, 4, 0);
    fs.closeSync(fd);
    return MACH_O.has(tete.toString("hex"));
  } catch {
    return false;
  }
}

async function empreinteSansSignatureDeCode(chemin) {
  if (process.platform !== "darwin" || !estMachO(chemin)) return empreinteFichier(chemin);
  const dossier = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "helix-releve-"));
  const copie = path.join(dossier, "programme");
  try {
    fs.copyFileSync(chemin, copie);
    try {
      require("node:child_process").execFileSync("/usr/bin/codesign", ["--remove-signature", copie], { stdio: "ignore" });
    } catch {
      /* pas de signature à retirer */
    }
    return await empreinteFichier(copie);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}

/**
 * Le relevé de l'application, dans un ordre fixe. Seul le fichier de signature
 * en est exclu (il ne peut pas se contenir lui-même), avec la signature de code
 * de macOS (voir plus haut) ; la clé publique, elle, en fait partie.
 */
async function releve(app) {
  const exclu = path.join("Contents", "Resources", FICHIER_SIGNATURE);
  const lignes = [];
  const parcourir = async (rel) => {
    const noms = fs.readdirSync(path.join(app, rel)).sort();
    for (const nom of noms) {
      const r = rel ? path.join(rel, nom) : nom;
      if (r === exclu || nom === "_CodeSignature") continue;
      const abs = path.join(app, r);
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) lignes.push(`l ${JSON.stringify(r)} ${JSON.stringify(fs.readlinkSync(abs))}`);
      else if (st.isDirectory()) {
        lignes.push(`d ${JSON.stringify(r)}`);
        await parcourir(r);
      } else if (st.isFile()) lignes.push(`f ${JSON.stringify(r)} ${st.mode & 0o111 ? "x" : "-"} ${await empreinteSansSignatureDeCode(abs)}`);
      // Ni fichier, ni dossier, ni lien : rien à faire dans une application.
      else lignes.push(`? ${JSON.stringify(r)}`);
    }
  };
  await parcourir("");
  return { empreinte: crypto.createHash("sha256").update(lignes.join("\n")).digest("hex"), fichiers: lignes.length };
}

const donneesSignees = (identifiant, version, empreinte) => Buffer.from(`${ENTETE}\n${identifiant}\n${version}\n${empreinte}`, "utf8");

/** Empreinte courte d'une clé publique, pour la reconnaître d'un coup d'œil. */
function empreinteCle(pem) {
  const der = crypto.createPublicKey(pem).export({ type: "spki", format: "der" });
  return crypto.createHash("sha256").update(der).digest("hex").slice(0, 16).replace(/(.{4})(?!$)/g, "$1-");
}

/** Pose la clé publique et la signature dans l'application (à la fabrication). */
async function signerApplication(app, clePriveePem, { identifiant, version }) {
  const privee = crypto.createPrivateKey(clePriveePem);
  if (privee.asymmetricKeyType !== "ed25519") throw new Error("la clé d'éditeur doit être une clé Ed25519");
  const publique = crypto.createPublicKey(privee).export({ type: "spki", format: "pem" }).toString();
  fs.writeFileSync(path.join(ressources(app), FICHIER_CLE), publique, { mode: 0o644 });
  const { empreinte, fichiers } = await releve(app);
  const signature = crypto.sign(null, donneesSignees(identifiant, version, empreinte), privee).toString("base64");
  fs.writeFileSync(
    path.join(ressources(app), FICHIER_SIGNATURE),
    `${JSON.stringify({ format: 1, identifiant, version, empreinte, fichiers, cle: empreinteCle(publique), signature }, null, 2)}\n`,
    { mode: 0o644 },
  );
  return { empreinte, fichiers, cle: empreinteCle(publique) };
}

/** La clé publique d'une application installée, ou null si elle n'en a pas. */
function cleDeLApplication(app) {
  try {
    const pem = fs.readFileSync(path.join(ressources(app), FICHIER_CLE), "utf8");
    crypto.createPublicKey(pem);
    return pem;
  } catch {
    return null;
  }
}

/**
 * Vérifie qu'une application a bien été signée par la clé donnée, pour cet
 * identifiant et cette version, et que rien n'y a changé depuis.
 */
async function verifierApplication(app, clePubliquePem, { identifiant, version }) {
  let sig;
  try {
    sig = JSON.parse(fs.readFileSync(path.join(ressources(app), FICHIER_SIGNATURE), "utf8"));
  } catch {
    return { ok: false, raison: "elle ne porte pas de signature de l'éditeur" };
  }
  if (sig.format !== 1 || typeof sig.signature !== "string") return { ok: false, raison: "sa signature est d'un format inconnu" };
  if (sig.identifiant !== identifiant || sig.version !== version) return { ok: false, raison: "sa signature porte sur une autre application ou une autre version" };
  let publique;
  try {
    publique = crypto.createPublicKey(clePubliquePem);
  } catch {
    return { ok: false, raison: "la clé de l'application installée est illisible" };
  }
  const { empreinte } = await releve(app);
  if (empreinte !== sig.empreinte) return { ok: false, raison: "son contenu a changé depuis sa signature" };
  const bonne = crypto.verify(null, donneesSignees(identifiant, version, empreinte), publique, Buffer.from(sig.signature, "base64"));
  return bonne ? { ok: true, cle: empreinteCle(clePubliquePem) } : { ok: false, raison: "elle n'est pas signée par l'éditeur de cette application" };
}

/*
 * L'installateur Windows (27/09/2026, demandé par Medhi après un essai sur un
 * vrai PC : « que Windows se mette à jour tout seul, d'un clic, comme le Mac »).
 *
 * Sous Windows, ce qui s'installe est un seul fichier, l'installateur NSIS
 * (`Helix-Setup-<version>-x64.exe`), et il arrive tel qu'il a été fabriqué :
 * pas d'instance qui refait une archive. La signature porte donc sur ses
 * octets (empreinte SHA-512), avec son nom, sa taille, l'identifiant et la
 * version, et elle est écrite dans le manifeste de la publication
 * (scripts/manifeste-mise-a-jour.mjs). Le poste la vérifie avec la clé
 * publique de l'application qui tourne (`resources/cle-editeur.pem`, posée à
 * la fabrication par scripts/signature/cle-windows.cjs), jamais avec une clé
 * venue de la publication.
 */
const ENTETE_WINDOWS = "helix-installateur-windows-v1";

const donneesInstallateur = ({ identifiant, version, fichier, sha512, octets }) =>
  Buffer.from(`${ENTETE_WINDOWS}\n${identifiant}\n${version}\n${fichier}\n${sha512}\n${octets}`, "utf8");

/** Signe la description d'un installateur Windows (à la publication) ; rend la signature en base64. */
function signerInstallateur(clePriveePem, description) {
  const privee = crypto.createPrivateKey(clePriveePem);
  if (privee.asymmetricKeyType !== "ed25519") throw new Error("la clé d'éditeur doit être une clé Ed25519");
  return crypto.sign(null, donneesInstallateur(description), privee).toString("base64");
}

/** La description d'un installateur est-elle signée par cette clé ? */
function verifierInstallateur(clePubliquePem, signature, description) {
  let publique;
  try {
    publique = crypto.createPublicKey(clePubliquePem);
  } catch {
    return { ok: false, raison: "la clé de l'application installée est illisible" };
  }
  if (typeof signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return { ok: false, raison: "sa signature est d'un format inconnu" };
  let bonne = false;
  try {
    bonne = crypto.verify(null, donneesInstallateur(description), publique, Buffer.from(signature, "base64"));
  } catch {
    bonne = false;
  }
  return bonne ? { ok: true, cle: empreinteCle(clePubliquePem) } : { ok: false, raison: "elle n'est pas signée par l'éditeur de cette application" };
}

/**
 * La clé publique posée dans un dossier de ressources (`process.resourcesPath`
 * d'une application empaquetée : `Helix.app/Contents/Resources` sur macOS,
 * `<dossier d'installation>\resources` sous Windows), ou null.
 */
function cleDesRessources(dossier) {
  try {
    const pem = fs.readFileSync(path.join(dossier, FICHIER_CLE), "utf8");
    crypto.createPublicKey(pem);
    return pem;
  } catch {
    return null;
  }
}

module.exports = {
  signerApplication,
  verifierApplication,
  cleDeLApplication,
  cleDesRessources,
  signerInstallateur,
  verifierInstallateur,
  empreinteCle,
  FICHIER_SIGNATURE,
  FICHIER_CLE,
};
