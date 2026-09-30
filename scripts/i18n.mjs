/*
 * Relève les phrases de l'interface et l'état des catalogues.
 *
 *   node scripts/i18n.mjs            dit ce qui manque
 *   node scripts/i18n.mjs --ecrire   ajoute les clés manquantes, vides
 *
 * La clé de traduction est la phrase française elle-même (voir
 * `src/lib/i18n.ts`). Ce relevé lit donc les appels `t("…")` du code, avec le
 * compilateur TypeScript plutôt qu'avec une expression régulière : une
 * apostrophe, une parenthèse ou un appel sur plusieurs lignes, et une regex se
 * trompe.
 *
 * Une phrase sans traduction n'est pas une panne : elle s'affiche en français.
 * Ce relevé sert à savoir combien il en reste, pas à empêcher de livrer.
 */
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const ECRIRE = process.argv.includes("--ecrire");
// L'espagnol, l'allemand et l'arabe depuis le 30/09/2026 : six catalogues, le français étant la source.
const LANGUES = ["en", "zh", "ja", "es", "de", "ar"];

const fichiers = execSync(`find "${RACINE}/src" -name '*.tsx' -o -name '*.ts'`, {
  encoding: "utf8",
})
  .trim()
  .split("\n");

/** Phrases passées à `t(...)`, avec les fichiers où elles apparaissent. */
const phrases = new Map();
/** Appels `t(valeur)` : légitimes, mais non relevables. Voir plus bas. */
const dynamiques = [];

for (const fichier of fichiers) {
  // Le module de traduction s'appelle lui-même : il n'est pas une source de phrases.
  // `src/i18n/instance.ts`, lui, en est une : il déclare les phrases que la
  // passerelle envoie et que rien d'autre ne relève (voir son en-tête).
  if (fichier.endsWith("/lib/i18n.ts")) continue;
  const source = ts.createSourceFile(
    fichier,
    readFileSync(fichier, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    fichier.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visiter = (noeud) => {
    if (
      ts.isCallExpression(noeud) &&
      ts.isIdentifier(noeud.expression) &&
      /*
       * `t` **et** `tf` : les phrases à trous sont des phrases. Ne relever que
       * `t` laissait cent soixante modèles hors du catalogue, et donc en
       * français à l'écran, sans que ce relevé n'en dise rien. Trouvé en
       * parcourant l'interface en chinois.
       */
      (noeud.expression.text === "t" || noeud.expression.text === "tf") &&
      noeud.arguments.length >= 1
    ) {
      const arg = noeud.arguments[0];
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        const court = fichier.replace(RACINE + "/", "");
        if (!phrases.has(arg.text)) phrases.set(arg.text, new Set());
        phrases.get(arg.text).add(court);
      } else {
        /*
         * Appel sur une valeur, pas sur une phrase écrite : c'est le cas des
         * libellés venus de l'instance (nom d'un serveur d'outils, message
         * d'erreur de la passerelle). Ils se traduisent s'ils figurent au
         * catalogue, et restent en français sinon. Ce n'est donc pas une
         * anomalie, mais ça mérite d'être signalé : ces phrases-là ne se
         * relèvent pas toutes seules, il faut les ajouter à la main.
         */
        dynamiques.push(fichier.replace(RACINE + "/", ""));
      }
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(source);
}

const cles = [...phrases.keys()].sort((a, b) => a.localeCompare(b, "fr"));
if (dynamiques.length) {
  const uniques = [...new Set(dynamiques)];
  console.log(
    `${dynamiques.length} appel(s) sur une valeur venue de l'instance, dans ${uniques.length} fichier(s) : ` +
      `traduits s'ils sont au catalogue, laissés en français sinon.`,
  );
}
console.log(`Phrases de l'interface : ${cles.length}`);

let manquantesTotal = 0;
for (const langue of LANGUES) {
  const chemin = join(RACINE, "src", "i18n", `${langue}.json`);
  let catalogue = {};
  try {
    catalogue = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    /* catalogue absent : il sera créé */
  }

  const manquantes = cles.filter((c) => !catalogue[c] || catalogue[c] === "");
  const orphelines = Object.keys(catalogue).filter((c) => !phrases.has(c));
  manquantesTotal += manquantes.length;

  const traduites = cles.length - manquantes.length;
  // Arrondi vers le bas : 1052 sur 1056 s'affichait « 100 % » (vu le 28/09/2026).
  const part = cles.length ? Math.floor((traduites / cles.length) * 100) : 100;
  console.log(
    `  ${langue} : ${traduites}/${cles.length} traduites (${part} %)` +
      (orphelines.length ? `, ${orphelines.length} devenues inutiles` : ""),
  );

  if (manquantes.length && !ECRIRE) {
    for (const m of manquantes.slice(0, 5)) console.log(`      manque : ${m.slice(0, 70)}`);
    if (manquantes.length > 5) console.log(`      … et ${manquantes.length - 5} autres`);
  }

  if (ECRIRE) {
    /*
     * On range dans l'ordre des phrases du code, en gardant les traductions
     * existantes et en laissant vides les nouvelles. Les clés devenues
     * inutiles sont retirées : un catalogue qui garde ses morts finit par ne
     * plus rien dire de son état.
     */
    const suite = {};
    for (const c of cles) suite[c] = catalogue[c] ?? "";
    writeFileSync(chemin, JSON.stringify(suite, null, 2) + "\n", "utf8");
  }
}

if (ECRIRE) console.log("\nCatalogues mis à jour.");
else if (manquantesTotal) console.log("\n`node scripts/i18n.mjs --ecrire` prépare les clés manquantes.");
