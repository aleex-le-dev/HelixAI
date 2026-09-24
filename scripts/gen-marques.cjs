/*
 * Engendre `src/components/ui/marques.ts` depuis la collection Simple Icons.
 *
 *   npm i --no-save simple-icons && node scripts/gen-marques.cjs
 *
 * Pourquoi engendrer plutôt que dépendre : la collection pèse une quinzaine de
 * mégaoctets pour trois mille dessins, dont on en utilise quarante. Les tracés
 * sont donc recopiés une fois dans le source, et ce script sert à recommencer
 * proprement quand la liste change.
 *
 * Simple Icons est publiée en CC0. Deux marques manquent volontairement à la
 * collection — Slack et OpenAI ont demandé le retrait de leur logo — et
 * quelques autres n'y ont jamais figuré : elles reçoivent une icône neutre,
 * ce qui est aussi plus prudent juridiquement qu'un dessin approximatif.
 */
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

let si;
try {
  si = require("simple-icons");
} catch {
  console.error("simple-icons est absent : `npm i --no-save simple-icons` avant de lancer ce script.");
  process.exit(1);
}

/** clé Helix → identifiant Simple Icons (sans le préfixe « si »). */
const MARQUES = {
  // Services branchés
  gmail: "gmail",
  googleAgenda: "googlecalendar",
  googleDrive: "googledrive",
  notion: "notion",
  icloud: "icloud",
  nextcloud: "nextcloud",
  proton: "protonmail",
  ovh: "ovh",
  infomaniak: "infomaniak",
  gandi: "gandi",
  linear: "linear",
  jira: "jira",
  asana: "asana",
  sentry: "sentry",
  intercom: "intercom",
  figma: "figma",
  webflow: "webflow",
  wix: "wix",
  vercel: "vercel",
  square: "square",
  paypal: "paypal",
  github: "github",
  gitlab: "gitlab",
  box: "box",
  airtable: "airtable",
  postgresql: "postgresql",
  hubspot: "hubspot",
  brave: "brave",
  kubernetes: "kubernetes",
  googleMaps: "googlemaps",
  // Fournisseurs de modèles
  anthropic: "anthropic",
  mistral: "mistralai",
  deepseek: "deepseek",
  qwen: "qwen",
  meta: "meta",
  gemini: "googlegemini",
  huggingface: "huggingface",
  ollama: "ollama",
  perplexity: "perplexity",
  moonshot: "moonshotai",
};

const entrees = [];
const absents = [];
for (const [cle, id] of Object.entries(MARQUES)) {
  // Les clés de Simple Icons sont « siNotion », « siPostgresql » : première
  // lettre en capitale, le reste tel quel.
  const nu = id.replace(/[^a-z0-9]/gi, "");
  const icone = si["si" + nu.charAt(0).toUpperCase() + nu.slice(1)];
  if (!icone) {
    absents.push(`${cle} (${id})`);
    continue;
  }
  entrees.push(
    `  ${cle}: {\n    titre: t(${JSON.stringify(icone.title)}),\n` +
      `    couleur: "#${icone.hex}",\n    chemin: ${JSON.stringify(icone.path)},\n  },`,
  );
}

const entete = `import { t } from "@/lib/i18n";
/**
 * Marques des services et des fournisseurs de modèles que Helix sait nommer.
 *
 * Les tracés viennent de la collection Simple Icons, publiée en CC0 : ils sont
 * recopiés ici une fois pour toutes plutôt qu'importés, pour ne pas embarquer
 * quinze mégaoctets de dépendance au profit de quarante dessins.
 *
 * EXCEPTION ASSUMÉE À LA RÈGLE DES TOKENS : ces couleurs sont en hexadécimal.
 * Ce ne sont pas des couleurs d'interface mais des données, celles que ces
 * sociétés imposent pour leur marque. Les rendre aux couleurs de Helix les
 * rendrait méconnaissables, ce qui est le contraire du but.
 *
 * Slack et OpenAI sont absents : ces deux sociétés ont demandé le retrait de
 * leur logo des bibliothèques d'icônes. Canva, Firecrawl, Tavily et Exa n'y
 * ont jamais figuré. Tous reçoivent une icône neutre plutôt qu'un dessin
 * approximatif, ce qui est aussi plus prudent juridiquement.
 *
 * Un logo sert ici à indiquer une compatibilité, usage courant. Avant une
 * diffusion commerciale large, les chartes de marque méritent d'être relues.
 *
 * Fichier engendré par scripts/gen-marques.cjs, à ne pas modifier à la main.
 */

export interface Marque {
  titre: string;
  couleur: string;
  chemin: string;
}

export const MARQUES = {
`;

const pied = `} satisfies Record<string, Marque>;

export type CleMarque = keyof typeof MARQUES;
`;

writeFileSync(
  join(__dirname, "..", "src", "components", "ui", "marques.ts"),
  entete + entrees.join("\n") + "\n" + pied,
  "utf8",
);
console.log(`marques.ts engendré : ${entrees.length} marques.`);
if (absents.length) console.log("absents de Simple Icons :", absents.join(", "));
