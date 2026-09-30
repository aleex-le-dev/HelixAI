/*
 * Relève les messages que la passerelle destine à l'écran.
 *
 *   node scripts/i18n-passerelle.mjs            dit ce qui manque
 *   node scripts/i18n-passerelle.mjs --ecrire   prépare les clés manquantes
 *
 * Même principe que `scripts/i18n.mjs` pour l'interface : la clé est la phrase
 * française, relevée avec le compilateur TypeScript plutôt qu'à la regex. Les
 * catalogues vivent dans `gateway/i18n/`, séparés de ceux de l'écran : ce ne
 * sont pas les mêmes phrases, et la passerelle se livre parfois seule.
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

const fichiers = execSync(`find "${RACINE}/gateway/src" -name '*.ts'`, { encoding: "utf8" })
  .trim()
  .split("\n");

const phrases = new Map();
for (const fichier of fichiers) {
  if (fichier.endsWith("/langue.ts")) continue;
  const source = ts.createSourceFile(
    fichier,
    readFileSync(fichier, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const visiter = (noeud) => {
    if (
      ts.isCallExpression(noeud) &&
      ts.isIdentifier(noeud.expression) &&
      (noeud.expression.text === "t" || noeud.expression.text === "tf") &&
      noeud.arguments.length >= 1
    ) {
      const arg = noeud.arguments[0];
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        if (!phrases.has(arg.text)) phrases.set(arg.text, new Set());
        phrases.get(arg.text).add(fichier.replace(RACINE + "/", ""));
      }
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(source);
}

/*
 * Les données affichées : le catalogue des connecteurs.
 *
 * Ses textes (nom, description, rubrique, champs de saisie) sont traduits au
 * moment de le servir, par `t(e.label)` — un appel sur une valeur, que le
 * relevé ci-dessus ne peut pas lire. On relève donc directement les chaînes
 * écrites dans ces propriétés-là, dans les fichiers qui décrivent des données
 * montrées à l'écran. Sans cela, le catalogue restait en français dans une
 * interface anglaise, et le relevé annonçait pourtant 100 %.
 */
const DONNEES_AFFICHEES = {
  "connecteurs.ts": ["label", "description", "categorie", "libelle", "aide", "obstacle"],
  "mcp.ts": ["label"],
  "agenda.ts": ["conseil"],
  "courrier.ts": ["conseil"],
};
for (const [nomFichier, proprietes] of Object.entries(DONNEES_AFFICHEES)) {
  const fichier = join(RACINE, "gateway", "src", nomFichier);
  const source = ts.createSourceFile(fichier, readFileSync(fichier, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const ajouter = (texte) => {
    if (!/\s/.test(texte.trim()) && !/^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(texte)) return; // identifiants
    if (!phrases.has(texte)) phrases.set(texte, new Set());
    phrases.get(texte).add(`gateway/src/${nomFichier}`);
  };
  const visiter = (noeud) => {
    if (ts.isPropertyAssignment(noeud) && ts.isIdentifier(noeud.name) && proprietes.includes(noeud.name.text)) {
      /*
       * La valeur peut être une chaîne, ou un choix entre deux (`actif ? … : …`,
       * `erreur ?? "…"`) : on relève chaque chaîne qui peut s'afficher.
       */
      const chaines = (v) => {
        if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) return [v.text];
        if (ts.isConditionalExpression(v)) return [...chaines(v.whenTrue), ...chaines(v.whenFalse)];
        if (ts.isBinaryExpression(v)) {
          /*
           * `"début " + "fin"` est **une** phrase : c'est elle, entière, que
           * `t()` recevra. La couper en deux donnerait deux clés qui ne
           * correspondent à rien. `a ?? "…"` et `a || "…"`, eux, sont des choix.
           */
          if (v.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            const g = chaines(v.left);
            const d = chaines(v.right);
            return g.length === 1 && d.length === 1 ? [g[0] + d[0]] : [];
          }
          return [...chaines(v.left), ...chaines(v.right)];
        }
        if (ts.isParenthesizedExpression(v)) return chaines(v.expression);
        return [];
      };
      for (const texte of chaines(noeud.initializer)) ajouter(texte);
    }
    // Les rubriques : les éléments du tableau CATEGORIES.
    if (ts.isVariableDeclaration(noeud) && noeud.name.getText(source) === "CATEGORIES" && noeud.initializer && ts.isArrayLiteralExpression(noeud.initializer)) {
      for (const el of noeud.initializer.elements) if (ts.isStringLiteral(el)) ajouter(el.text);
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(source);
}

const cles = [...phrases.keys()].sort((a, b) => a.localeCompare(b, "fr"));
console.log(`Messages de la passerelle : ${cles.length}`);

for (const langue of LANGUES) {
  const chemin = join(RACINE, "gateway", "i18n", `${langue}.json`);
  let catalogue = {};
  try {
    catalogue = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    /* catalogue absent : il sera créé */
  }
  const manquantes = cles.filter((c) => !catalogue[c]);
  const traduites = cles.length - manquantes.length;
  // Arrondi vers le bas : 1052 sur 1056 s'affichait « 100 % » (vu le 28/09/2026).
  const part = cles.length ? Math.floor((traduites / cles.length) * 100) : 100;
  console.log(`  ${langue} : ${traduites}/${cles.length} traduits (${part} %)`);
  if (ECRIRE) {
    const suite = {};
    for (const c of cles) suite[c] = catalogue[c] ?? "";
    writeFileSync(chemin, JSON.stringify(suite, null, 2) + "\n", "utf8");
  }
}
if (ECRIRE) console.log("\nCatalogues de la passerelle mis à jour.");
