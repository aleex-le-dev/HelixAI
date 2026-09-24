/**
 * Relevé Artificial Analysis : intelligence, coût et vitesse des modèles.
 *
 * ── Pourquoi une table figée, et non un appel au site ───────────────────────
 *
 * Helix promet que rien ne part vers un service tiers tant que personne n'a
 * branché de clé. Interroger artificialanalysis.ai à l'ouverture d'un écran
 * contredirait cette promesse, et l'écran ne marcherait plus sans Internet, ce
 * qui n'a pas de sens sur une instance qui tourne au fond d'un bureau.
 *
 * Les chiffres sont donc recopiés, avec la date du relevé affichée à l'écran.
 * Ils vieillissent : c'est le prix, il est assumé, et il est dit. Le lien vers
 * la source est à côté, pour qui veut la version du jour.
 *
 * ── Ce qui est relevé, et ce qui ne l'est pas ───────────────────────────────
 *
 * `intelligence` est donné pour les vingt-cinq modèles de la comparaison de
 * référence. `coutParTache` et `vitesse` ne le sont que pour les onze mis en
 * avant : ce sont les seules valeurs publiées **en clair** sur la page. Le
 * reste n'est lisible que sur un graphique, et lire une position de point pour
 * en déduire un prix donnerait un chiffre approché présenté comme une mesure.
 * Un champ vide est plus honnête, et l'écran le dit.
 *
 * Source : https://artificialanalysis.ai — Artificial Analysis Intelligence
 * Index v4.3.2 (dix évaluations).
 */

export interface ModeleReference {
  /** Nom tel qu'Artificial Analysis l'écrit. */
  nom: string;
  /** Société qui publie le modèle, pour le logo et le regroupement. */
  editeur: string;
  /** Artificial Analysis Intelligence Index. Plus haut est meilleur. */
  intelligence: number;
  /** Coût moyen en dollars d'une tâche de l'indice. Plus bas est meilleur. */
  coutParTache?: number;
  /** Jetons de sortie par seconde. */
  vitesse?: number;
}

/** Date du relevé, affichée à l'écran : un chiffre sans date ne vaut rien. */
export const RELEVE_LE = "2026-09-21";
export const VERSION_INDICE = "v4.3.2";
export const SOURCE = "https://artificialanalysis.ai";

export const MODELES_REFERENCE: ModeleReference[] = [
  { nom: "Claude Fable 5.1 (max with fallback)", editeur: "Anthropic", intelligence: 53, coutParTache: 7.63, vitesse: 70 },
  { nom: "GPT-6 Astra (max)", editeur: "OpenAI", intelligence: 53, coutParTache: 3.26, vitesse: 71 },
  { nom: "Claude Opus 5 (max)", editeur: "Anthropic", intelligence: 51, coutParTache: 5.86, vitesse: 61 },
  { nom: "Muse Spark 1.3 (max)", editeur: "Thinking Machines", intelligence: 48, coutParTache: 1.6, vitesse: 241 },
  { nom: "GPT-5.6 Sol (max)", editeur: "OpenAI", intelligence: 47 },
  { nom: "Qwen3.8 Max (0902)", editeur: "Alibaba", intelligence: 45 },
  { nom: "GLM-5.3 (max)", editeur: "Z AI", intelligence: 45, coutParTache: 2.01, vitesse: 72 },
  { nom: "Grok 4.6 (high)", editeur: "xAI", intelligence: 44, coutParTache: 1.86, vitesse: 67 },
  { nom: "Step 5 Preview", editeur: "StepFun", intelligence: 44 },
  { nom: "Kimi K3 (max)", editeur: "Moonshot AI", intelligence: 44, coutParTache: 2.0, vitesse: 44 },
  { nom: "GPT-5.6 Terra (max)", editeur: "OpenAI", intelligence: 42 },
  { nom: "GLM-5.3-Flash", editeur: "Z AI", intelligence: 42 },
  { nom: "Gemini 3.8 Flash (high)", editeur: "Google", intelligence: 41, coutParTache: 1.24, vitesse: 329 },
  { nom: "DeepSeek V4.1 Flash (max)", editeur: "DeepSeek", intelligence: 39, coutParTache: 0.27, vitesse: 239 },
  { nom: "GPT-5.6 Luna (max)", editeur: "OpenAI", intelligence: 37, coutParTache: 0.18, vitesse: 165 },
  { nom: "DeepSeek V4 Pro 0813 (max)", editeur: "DeepSeek", intelligence: 36, coutParTache: 0.67, vitesse: 108 },
  { nom: "Qwen3.8 27B (xhigh)", editeur: "Alibaba", intelligence: 34 },
  { nom: "K2 Horizon 375B A23B", editeur: "Moonshot AI", intelligence: 31 },
  { nom: "MiniMax-M3", editeur: "MiniMax", intelligence: 29 },
  { nom: "Inkling", editeur: "IBM", intelligence: 25 },
  { nom: "Nemotron 3 Ultra", editeur: "NVIDIA", intelligence: 23 },
  { nom: "Gemini 3.5 Flash-Lite", editeur: "Google", intelligence: 22 },
  { nom: "Muse Glimmer (high)", editeur: "Thinking Machines", intelligence: 17 },
  { nom: "Mistral Medium 3.5", editeur: "Mistral", intelligence: 14 },
  { nom: "gpt-oss-120b (high)", editeur: "OpenAI", intelligence: 12 },
];

/**
 * Rapproche un identifiant de modèle de l'instance d'une entrée du relevé.
 *
 * Le rapprochement est volontairement **strict sur le fond, souple sur la
 * forme** : on compare des identifiants réduits à leurs lettres et chiffres,
 * sans la mention de niveau d'effort qu'Artificial Analysis ajoute entre
 * parenthèses. « deepseek-v4.1-flash » retrouve ainsi « DeepSeek V4.1 Flash
 * (max) », mais « qwen3-8b » ne se rapproche de rien — et c'est correct : ce
 * modèle-là n'est pas mesuré, mieux vaut ne rien dire que dire à peu près.
 */
const reduire = (s: string) =>
  s
    .replace(/\([^)]*\)/g, "")
    .toLowerCase()
    /*
     * Les API écrivent les versions avec des tirets (« claude-fable-5-1 »), le
     * relevé avec des points (« Claude Fable 5.1 »). Un chiffre, un tiret, un
     * chiffre qui termine le nom : c'est une version. « qwen3-8b » n'en est pas
     * une (le 8 est suivi d'une lettre) et reste tel quel.
     */
    .replace(/(\d)-(\d+)(?=$|[^a-z0-9])/g, "$1.$2")
    .replace(/[^a-z0-9.]/g, "");

const PAR_CLE = new Map(MODELES_REFERENCE.map((m) => [reduire(m.nom), m]));

export function referenceDuModele(idModele: string): ModeleReference | undefined {
  const cle = reduire(idModele);
  if (!cle) return undefined;
  const exact = PAR_CLE.get(cle);
  if (exact) return exact;
  /*
   * Un identifiant de moteur porte souvent un préfixe de dépôt ou un suffixe
   * de quantification : « mistralai/mistral-medium-3.5-q4 ». On accepte donc
   * qu'il **contienne** le nom relevé, jamais l'inverse : « gpt » ne doit pas
   * attraper « gpt-6 astra ».
   */
  for (const [nom, modele] of PAR_CLE) {
    if (nom.length < 6) continue;
    const i = cle.indexOf(nom);
    if (i < 0) continue;
    /*
     * Le nom relevé doit s'arrêter là où s'arrête un numéro de version :
     * « claude-opus-5-5 » contient « claudeopus5 » mais c'est un autre modèle,
     * et lui prêter la note de Claude Opus 5 serait faux.
     */
    const suite = cle.slice(i + nom.length);
    if (/^[0-9.]/.test(suite)) continue;
    // Même règle pour une déclinaison : « …-flash-lite » n'est pas « …-flash ».
    if (/^(lite|mini|nano|micro|pro|plus|turbo|air|small|large|ultra|max|vision|omni|coder|code)/.test(suite)) continue;
    return modele;
  }
  return undefined;
}
