/**
 * Rapprocher un identifiant de modèle d'une entrée de table (note, prix).
 *
 * Écrit le 27/09/2026 : Medhi a signalé que, quel que soit le modèle cloud
 * choisi, il n'apparaissait pas dans « Comparer les modèles ». Un modèle de la
 * personne porte un identifiant de moteur (« cle-537cdd45fe/gpt-4.1-nano »,
 * « qwen3.5-4b@q4_k_m », « mistralai/ministral-3-3b »), une table porte un nom
 * d'éditeur (« GPT-4.1 nano ») ou l'identifiant d'une API à une date donnée
 * (« gpt-4.1-nano-2025-04-14 »). L'ancien rapprochement ne retirait pas le
 * préfixe de la clé et cherchait un nom **contenu** dans l'autre, ce qui ne
 * retrouvait presque rien et pouvait attraper un voisin.
 *
 * La règle est désormais : **souple sur la forme, stricte sur le fond.**
 *
 *  - la forme s'efface : casse, séparateurs, préfixe de clé ou d'éditeur
 *    (tout ce qui précède le dernier « / »), suffixe de quantification
 *    (« @q4_k_m », « -mlx », « -4bit »), étiquette (« :free »), mention
 *    d'effort d'un relevé (« _high »), « -latest » et « -instruct » en fin ;
 *  - une date de version complète (« -2025-04-14 », « -20250514 ») ne
 *    s'efface qu'en second essai, quand l'identifiant exact n'a rien donné :
 *    chez OpenAI et Anthropic, elle désigne un instantané du même modèle ;
 *  - une date courte (« -2507 », « -0813 ») ne s'efface jamais : chez Qwen,
 *    Mistral ou DeepSeek, elle désigne un autre modèle que celui sans date ;
 *  - aucune ressemblance partielle : « ministral-3-3b » (Ministral 3 3B, 2025)
 *    ne retrouve pas « Ministral 3B » (2024), et « qwen3-4b » ne prend pas la
 *    note de Qwen3-8B ;
 *  - un nom qui désigne deux entrées différentes (« gpt-4o » : trois
 *    instantanés notés séparément) ne désigne plus rien. Mieux vaut « pas de
 *    note publiée » qu'une note choisie au hasard.
 *
 * Sans dépendance ni API de Node : la passerelle et l'interface lisent ce
 * fichier toutes les deux.
 */

const EFFORT = /_(none|low|medium|high|xhigh|max|minimal|unknown|promax|proxhigh|\d+k)$/;
const FORMAT = /[-_.](gguf|mlx|dwq|awq|gptq|fp8|fp16|bf16|int4|int8|q\d(_k)?(_[msl])?|q\d_\d|\d+-?bits?)$/;
const QUALIFICATIF = /[-_ ](latest|instruct)$/;
const DATE = /[-_ ]?(20\d\d-\d\d-\d\d|20\d{6})$/;

const compacter = (s: string) => s.replace(/[^a-z0-9]/g, "");

/** Retire en boucle les suffixes qui ne changent pas le modèle. */
function sansSuffixes(s: string): string {
  let avant = "";
  while (avant !== s) {
    avant = s;
    s = s.replace(EFFORT, "").replace(FORMAT, "").replace(QUALIFICATIF, "");
  }
  return s;
}

/**
 * Les deux formes comparées : exacte (avec la date), puis sans date de
 * version. Vides quand il ne reste rien de l'identifiant.
 */
export function formesDuNom(id: string): { exacte: string; sansDate: string } {
  let s = id.trim().toLowerCase();
  s = s.replace(/@.*$/, "").replace(/:[^/]*$/, "");
  s = s.slice(s.lastIndexOf("/") + 1);
  s = sansSuffixes(s);
  const exacte = compacter(s);
  const sansDate = compacter(sansSuffixes(s.replace(DATE, "")));
  return { exacte, sansDate };
}

/**
 * Un index de noms vers des valeurs. `noms` : tous les noms sous lesquels une
 * valeur est connue. Rend la fonction de recherche.
 */
export function indexerParNom<T>(entrees: { valeur: T; noms: string[] }[]): (id: string) => T | undefined {
  // `null` : nom ambigu, porté par deux valeurs différentes.
  const exactes = new Map<string, T | null>();
  const sansDates = new Map<string, T | null>();
  const poser = (table: Map<string, T | null>, cle: string, valeur: T) => {
    if (!cle) return;
    const deja = table.get(cle);
    if (deja === undefined) table.set(cle, valeur);
    else if (deja !== valeur) table.set(cle, null);
  };
  /*
   * Le second essai ne vise que les noms sans date : « gpt-4.1-nano-2025-04-14 »
   * retrouve « gpt-4.1-nano », mais deux instantanés datés ne se confondent
   * jamais (« gpt-4-turbo-2024-01-25 » n'est pas « gpt-4-turbo-2024-04-09 »).
   * Et si la table donne elle-même un instantané daté différent du nom sans
   * date (OpenAI : « gpt-4o » à 2,50 $, « gpt-4o-2024-05-13 » à 5 $), c'est la
   * preuve que les dates comptent : le nom sans date ne vaut plus pour les
   * autres dates.
   */
  const formes = entrees.flatMap(({ valeur, noms }) => noms.map((nom) => ({ valeur, f: formesDuNom(nom) })));
  for (const { valeur, f } of formes) {
    poser(exactes, f.exacte, valeur);
    if (f.exacte === f.sansDate) poser(sansDates, f.sansDate, valeur);
  }
  for (const { valeur, f } of formes) {
    if (f.exacte === f.sansDate) continue;
    const deja = sansDates.get(f.sansDate);
    if (deja !== undefined && deja !== valeur) sansDates.set(f.sansDate, null);
  }
  return (id: string) => {
    const f = formesDuNom(id);
    if (!f.exacte) return undefined;
    const exacte = exactes.get(f.exacte);
    if (exacte !== undefined) return exacte ?? undefined;
    return sansDates.get(f.sansDate) ?? undefined;
  };
}
