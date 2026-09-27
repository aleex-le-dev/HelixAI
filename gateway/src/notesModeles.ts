import { formesDuNom, indexerParNom } from "./nomsModeles.ts";
import { PRIX_PUBLIES, prixPublie, type PrixTrouve } from "./prixPublies.ts";

/**
 * Notes des modèles : l'indice ECI d'Epoch AI.
 *
 * ── La source, et le droit de la reprendre ──────────────────────────────────
 *
 * Source : Epoch AI, « Capabilities & benchmarking », indice ECI (Epoch
 * Capabilities Index), fichier `epoch_capabilities_index/eci_scores.csv` de
 * l'archive https://epoch.ai/data/benchmark_data.zip, page de présentation
 * https://epoch.ai/benchmarks/use-this-data. Relevé le 27/09/2026 (la page
 * indiquait « Updated Sep. 27, 2026 »).
 *
 * Licence : Creative Commons Attribution 4.0 (CC BY 4.0). La page le dit en
 * ces termes : « Epoch AI's data is free to use, distribute, and reproduce
 * provided the source and authors are credited under the Creative Commons
 * Attribution license ». Attribution exigée, affichée sous le graphique de
 * comparaison : « Epoch AI, Capabilities & benchmarking, epoch.ai, CC BY
 * 4.0 », avec le lien et la date du relevé. Les questions des évaluations
 * restent à leurs auteurs et les données externes gardent leur licence (même
 * page) : on ne reprend ni les unes ni les autres, seulement l'indice, qu'Epoch
 * calcule lui-même.
 *
 * ── Pourquoi Epoch AI (décision du 27/09/2026) ──────────────────────────────
 *
 * Les notes venaient jusqu'ici d'un autre relevé, dont les conditions
 * interdisent de reprendre les données. Medhi a choisi une source sous licence
 * ouverte. Parmi celles qui ont été regardées, l'ECI est la seule qui couvre à
 * la fois les modèles cloud du jour (GPT-6 Astra, Claude Fable 5.1, Gemini 3.8
 * Flash, Mistral Medium 3.5, DeepSeek V4.1 Flash, Qwen 3.8 Max…) et des
 * modèles ouverts qu'on fait tourner chez soi (Qwen3 8B à 32B, Qwen3.5 9B et
 * 35B-A3B, Qwen 3.8 27B, gpt-oss-20b, Magistral Small, Gemma, Llama, Phi), sur
 * **une seule échelle**, avec une licence qui autorise la reprise. Elle ne
 * note pas les plus petits (Qwen3 4B et 1.7B, Qwen3.5 4B et 2B, Ministral 3,
 * Granite 4.1, OLMo 3, Qwen3-VL) : l'écran le dit, il ne leur prête rien.
 *
 * ── Ce qui est recopié ──────────────────────────────────────────────────────
 *
 * Les 217 modèles de l'indice sortis depuis le 01/01/2024, avec leur note
 * telle que publiée (colonne `eci`), leur éditeur (`Organization`, vide quand
 * Epoch ne le donne pas) et leur date de sortie (`date`). `ids` : les
 * identifiants sous lesquels Epoch a mesuré le modèle (colonne `model_version`
 * de `processed_data_for_eci.csv`, sans la mention d'effort « _high »), qui
 * servent à reconnaître un identifiant d'API. Deux sont écartés, parce qu'ils
 * désignent le dernier modèle du fournisseur et non celui qu'Epoch a mesuré :
 * « deepseek-chat » et « deepseek-reasoner ».
 *
 * L'ECI n'est pas un pourcentage : c'est une échelle continue (de 87 à 167
 * pour les modèles recopiés ; GPT-5 y vaut 150). Elle se lit en écart entre
 * deux modèles, pas en « sur cent ».
 */

export interface ModeleNote {
  /** Nom tel qu'Epoch l'écrit. */
  nom: string;
  /** Éditeur tel qu'Epoch l'écrit ; vide quand Epoch ne le donne pas. */
  editeur: string;
  /** Epoch Capabilities Index. Plus haut est meilleur. */
  eci: number;
  /** Date de sortie, AAAA-MM-JJ. */
  sortie: string;
  /** Identifiants sous lesquels Epoch l'a mesuré. */
  ids?: string[];
}

export const SOURCE_NOTES = {
  nom: "Epoch AI",
  titre: "Capabilities & benchmarking",
  indice: "ECI",
  page: "https://epoch.ai/benchmarks/use-this-data",
  licence: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  releveLe: "2026-09-27",
};

export const MODELES_NOTES: ModeleNote[] = [
  { nom: "GPT-6 Astra", editeur: "OpenAI", eci: 166.6, sortie: "2026-09-03" },
  { nom: "Claude Fable 5.1", editeur: "Anthropic", eci: 165, sortie: "2026-09-01" },
  { nom: "Claude Fable 5", editeur: "Anthropic", eci: 163.6, sortie: "2026-06-09" },
  { nom: "Claude Opus 5", editeur: "Anthropic", eci: 162.67, sortie: "2026-07-24" },
  { nom: "GPT-5.5 Pro", editeur: "OpenAI", eci: 162.45, sortie: "2026-04-23", ids: ["gpt-5.5-pro-pre-release"] },
  { nom: "GPT-5.6 Sol", editeur: "OpenAI", eci: 161.99, sortie: "2026-07-09" },
  { nom: "GPT-5.6 Terra", editeur: "OpenAI", eci: 159.31, sortie: "2026-07-09" },
  { nom: "GPT-5.5", editeur: "OpenAI", eci: 159.25, sortie: "2026-04-23", ids: ["gpt-5.5-pre-release"] },
  { nom: "GPT-5.4 Pro", editeur: "OpenAI", eci: 159.12, sortie: "2026-03-05", ids: ["gpt-5.4-pro-2026-03-05"] },
  { nom: "Claude Opus 4.8", editeur: "Anthropic", eci: 158.3, sortie: "2026-05-28" },
  { nom: "Gemini 3.7 Flash", editeur: "Google", eci: 157.72, sortie: "2026-08-13" },
  { nom: "Kimi K3", editeur: "Moonshot", eci: 157.68, sortie: "2026-07-16" },
  { nom: "Gemini 3.8 Flash", editeur: "Google", eci: 157.13, sortie: "2026-09-02" },
  { nom: "GPT-5.4", editeur: "OpenAI", eci: 156.92, sortie: "2026-03-05", ids: ["gpt-5.4-2026-03-05"] },
  { nom: "Muse Spark 1.3", editeur: "Meta", eci: 156.89, sortie: "2026-09-02" },
  { nom: "GPT-5.3 Codex", editeur: "OpenAI", eci: 156.84, sortie: "2026-02-05" },
  { nom: "Qwen 3.8 Max", editeur: "Alibaba", eci: 156.69, sortie: "2026-08-02" },
  { nom: "Grok 4.6", editeur: "xAI", eci: 156.48, sortie: "2026-08-12" },
  { nom: "Claude Opus 4.7", editeur: "Anthropic", eci: 156.39, sortie: "2026-04-16" },
  { nom: "Claude Sonnet 5", editeur: "Anthropic", eci: 156.34, sortie: "2026-06-30" },
  { nom: "GPT-5.6 Luna", editeur: "OpenAI", eci: 156.32, sortie: "2026-07-09" },
  { nom: "GLM-5.3", editeur: "Z.ai", eci: 155.56, sortie: "2026-08-14" },
  { nom: "GPT-5.2 Pro", editeur: "OpenAI", eci: 155.41, sortie: "2025-12-11", ids: ["gpt-5.2-pro-2025-12-11"] },
  { nom: "DeepSeek V4 Pro 0813", editeur: "DeepSeek", eci: 155.39, sortie: "2026-08-13" },
  { nom: "Claude Opus 4.6", editeur: "Anthropic", eci: 155.36, sortie: "2026-02-05" },
  { nom: "Qwen3.8 Max (0902)", editeur: "Alibaba", eci: 155.28, sortie: "2026-09-01" },
  { nom: "Muse Spark 1.2", editeur: "Meta", eci: 155.18, sortie: "2026-08-05" },
  { nom: "DeepSeek V4.1 Flash", editeur: "DeepSeek", eci: 155.01, sortie: "2026-09-09" },
  { nom: "Gemini 3.1 Pro", editeur: "Google", eci: 154.92, sortie: "2026-02-19", ids: ["gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools"] },
  { nom: "Gemini 3.5 Flash", editeur: "Google", eci: 154.55, sortie: "2026-05-19" },
  { nom: "DeepSeek V4 Flash 0731", editeur: "DeepSeek", eci: 154.51, sortie: "2026-07-31" },
  { nom: "Gemini 3.6 Flash", editeur: "Google", eci: 154.36, sortie: "2026-07-21" },
  { nom: "Muse Spark 1.1", editeur: "Meta", eci: 154.32, sortie: "2026-07-09" },
  { nom: "Grok 4.5", editeur: "xAI", eci: 154.02, sortie: "2026-07-08" },
  { nom: "Qwen3.7-Max", editeur: "Alibaba", eci: 153.74, sortie: "2026-05-19" },
  { nom: "GPT-5.2", editeur: "OpenAI", eci: 153.45, sortie: "2025-12-11", ids: ["gpt-5.2-2025-12-11"] },
  { nom: "Gemini 3 Pro", editeur: "Google", eci: 152.96, sortie: "2025-11-18", ids: ["gemini-3-pro-preview"] },
  { nom: "Claude Sonnet 4.6", editeur: "Anthropic", eci: 152.25, sortie: "2026-02-17" },
  { nom: "Muse Spark", editeur: "Meta", eci: 152.09, sortie: "2026-04-08" },
  { nom: "Grok 4.20", editeur: "xAI", eci: 152.01, sortie: "2026-02-17", ids: ["grok-4.20-0309-reasoning"] },
  { nom: "GLM-5.3-Flash", editeur: "Z.ai", eci: 151.9, sortie: "2026-08-20" },
  { nom: "Gemini 3 Flash", editeur: "Google", eci: 151.83, sortie: "2025-12-17", ids: ["gemini-3-flash-preview"] },
  { nom: "GLM-5.2", editeur: "Z.ai", eci: 151.76, sortie: "2026-06-16" },
  { nom: "Kimi K2.6", editeur: "Moonshot", eci: 151.03, sortie: "2026-04-20" },
  { nom: "GPT-5 Pro", editeur: "OpenAI", eci: 150.26, sortie: "2025-10-07", ids: ["gpt-5-pro-2025-10-06"] },
  { nom: "Inkling-Small", editeur: "Thinking Machines", eci: 150.13, sortie: "2026-07-15" },
  { nom: "Claude Opus 4.5", editeur: "Anthropic", eci: 150.1, sortie: "2025-11-24", ids: ["claude-opus-4-5-20251101"] },
  { nom: "Kimi K2.7 Code", editeur: "Moonshot", eci: 150.01, sortie: "2026-06-12" },
  { nom: "GPT-5", editeur: "OpenAI", eci: 150, sortie: "2025-08-07", ids: ["gpt-5-2025-08-07"] },
  { nom: "GLM-5.1", editeur: "Z.ai", eci: 149.86, sortie: "2026-04-07" },
  { nom: "GPT-5.1", editeur: "OpenAI", eci: 149.66, sortie: "2025-11-13", ids: ["gpt-5.1-2025-11-13"] },
  { nom: "Qwen 3.8 27B", editeur: "Alibaba", eci: 149.38, sortie: "2026-08-14" },
  { nom: "Qwen 3.6 Max (Preview)", editeur: "Alibaba", eci: 149.27, sortie: "2026-04-20" },
  { nom: "DeepSeek-V4-Pro", editeur: "DeepSeek", eci: 149.14, sortie: "2026-04-24" },
  { nom: "Grok 4.3 Beta", editeur: "xAI", eci: 149.13, sortie: "2026-04-17", ids: ["grok-4.3"] },
  { nom: "GPT-5.4 Mini", editeur: "OpenAI", eci: 148.83, sortie: "2026-03-17", ids: ["gpt-5.4-mini-2026-03-17"] },
  { nom: "Inkling", editeur: "Thinking Machines", eci: 148.6, sortie: "2026-07-15" },
  { nom: "Kimi K2.5", editeur: "Moonshot", eci: 148.05, sortie: "2026-01-27", ids: ["fireworks/kimi-k2p5"] },
  { nom: "Qwen 3.6 Plus", editeur: "Alibaba", eci: 147.67, sortie: "2026-03-31" },
  { nom: "o3-pro", editeur: "OpenAI", eci: 147.43, sortie: "2025-06-10", ids: ["o3-pro-2025-06-10"] },
  { nom: "Qwen3.7-Plus", editeur: "Alibaba", eci: 147.39, sortie: "2026-06-02" },
  { nom: "MiniMax-M3", editeur: "MiniMax", eci: 147, sortie: "2026-06-01" },
  { nom: "o3", editeur: "OpenAI", eci: 146.88, sortie: "2025-04-16", ids: ["o3-2025-04-16"] },
  { nom: "Claude Sonnet 4.5", editeur: "Anthropic", eci: 146.84, sortie: "2025-09-29", ids: ["claude-sonnet-4-5-20250929"] },
  { nom: "Qwen 3.5 Plus (hosted 397B-A17B)", editeur: "Alibaba", eci: 146.79, sortie: "2026-02-16", ids: ["qwen3.5-plus"] },
  { nom: "MiniMax-M2.5", editeur: "MiniMax", eci: 146.68, sortie: "2026-02-12" },
  { nom: "Qwen3.5 397B-A17B", editeur: "Alibaba", eci: 146.64, sortie: "2026-02-13" },
  { nom: "Qwen3.6 27B", editeur: "Alibaba", eci: 146.47, sortie: "2026-04-22" },
  { nom: "Grok 4", editeur: "xAI", eci: 146.46, sortie: "2025-07-09", ids: ["grok-4-0709"] },
  { nom: "DeepSeek-V3.2", editeur: "DeepSeek", eci: 146.28, sortie: "2025-12-01", ids: ["fireworks/deepseek-v3p2"] },
  { nom: "Nemotron 3 Ultra", editeur: "NVIDIA", eci: 146.2, sortie: "2026-06-04" },
  { nom: "DeepSeek-V4-Flash", editeur: "DeepSeek", eci: 146.1, sortie: "2026-04-24" },
  { nom: "Kimi K2 Thinking", editeur: "Moonshot", eci: 146.02, sortie: "2025-11-06", ids: ["kimi-k2-thinking-turbo"] },
  { nom: "GLM-5", editeur: "Z.ai", eci: 145.84, sortie: "2026-02-11" },
  { nom: "MiniMax-M2.7", editeur: "MiniMax", eci: 145.84, sortie: "2026-03-18" },
  { nom: "GPT-5.4 Nano", editeur: "OpenAI", eci: 145.78, sortie: "2026-03-17", ids: ["gpt-5.4-nano-2026-03-17"] },
  { nom: "o4-mini", editeur: "OpenAI", eci: 145.63, sortie: "2025-04-16", ids: ["o4-mini-2025-04-16"] },
  { nom: "GPT-5 mini", editeur: "OpenAI", eci: 145.51, sortie: "2025-08-07", ids: ["gpt-5-mini-2025-08-07"] },
  { nom: "Gemini 2.5 Pro (Jun 2025)", editeur: "Google", eci: 145.32, sortie: "2025-06-05", ids: ["gemini-2.5-pro", "gemini-2.5-pro-preview-06-05"] },
  { nom: "Gemini 3.5 Flash-Lite", editeur: "Google", eci: 145.12, sortie: "2026-07-21" },
  { nom: "DeepSeek-V3.2-Exp", editeur: "DeepSeek", eci: 145.02, sortie: "2025-09-29", ids: ["DeepSeek-V3.2-Exp_thinking"] },
  { nom: "Qwen3.7 Flash", editeur: "Alibaba", eci: 144.62, sortie: "2026-07-27" },
  { nom: "Gemini 3.1 Flash-Lite", editeur: "Google", eci: 144.45, sortie: "2026-03-03" },
  { nom: "Grok 4 Fast", editeur: "xAI", eci: 144.21, sortie: "2025-09-19" },
  { nom: "Gemini 2.5 Pro (Mar 2025)", editeur: "Google", eci: 144.16, sortie: "2025-03-31", ids: ["gemini-2.5-pro-exp-03-25", "gemini-2.5-pro-preview-03-25"] },
  { nom: "Claude Opus 4.1", editeur: "Anthropic", eci: 144.11, sortie: "2025-08-05", ids: ["claude-opus-4-1-20250805"] },
  { nom: "Qwen 3.5 Flash (hosted 35B-A3B)", editeur: "Alibaba", eci: 143.98, sortie: "2026-02-25", ids: ["qwen3.5-flash"] },
  { nom: "Qwen 3.6 35B-A3B", editeur: "Alibaba", eci: 143.92, sortie: "2026-04-14" },
  { nom: "Qwen3-235B-A22B-Thinking (Jul 2025)", editeur: "Alibaba", eci: 143.87, sortie: "2025-07-25", ids: ["Qwen3-235B-A22B-Thinking-2507"] },
  { nom: "GLM-4.7", editeur: "Z.ai", eci: 143.53, sortie: "2025-12-22" },
  { nom: "Qwen 3.6 Flash", editeur: "Alibaba", eci: 143.26, sortie: "2026-04-27" },
  { nom: "Gemini 2.5 Flash (Sep 2025)", editeur: "Google", eci: 143.04, sortie: "2025-09-25", ids: ["gemini-2.5-flash-preview-09-2025"] },
  { nom: "Gemma 4 31B IT", editeur: "Google", eci: 142.74, sortie: "2026-04-02" },
  { nom: "Claude Opus 4", editeur: "Anthropic", eci: 142.67, sortie: "2025-05-22", ids: ["claude-opus-4-20250514"] },
  { nom: "Qwen3.5-35B-A3B", editeur: "Alibaba", eci: 142.52, sortie: "2026-02-24" },
  { nom: "GPT-5.5 Instant", editeur: "OpenAI", eci: 142.48, sortie: "2026-05-05" },
  { nom: "Gemini 2.5 Pro (May 2025)", editeur: "Google", eci: 142.46, sortie: "2025-05-06", ids: ["gemini-2.5-pro-preview-05-06"] },
  { nom: "Claude Haiku 4.5", editeur: "Anthropic", eci: 142.42, sortie: "2025-10-15", ids: ["claude-haiku-4-5-20251001"] },
  { nom: "Qwen3-Max", editeur: "Alibaba", eci: 142.41, sortie: "2025-09-24", ids: ["qwen3-max-2025-09-23"] },
  { nom: "o1", editeur: "OpenAI", eci: 141.92, sortie: "2024-12-17", ids: ["o1-2024-12-17"] },
  { nom: "Gemma 4 26B A4B", editeur: "Google", eci: 141.85, sortie: "2026-04-02", ids: ["gemma-4-26b-a4b-it"] },
  { nom: "Claude Sonnet 4", editeur: "Anthropic", eci: 141.69, sortie: "2025-05-22", ids: ["claude-sonnet-4-20250514"] },
  { nom: "Gemini 2.5 Flash (May 2025)", editeur: "Google", eci: 141.54, sortie: "2025-05-20", ids: ["gemini-2.5-flash-preview-05-20"] },
  { nom: "Mistral Medium 3.5", editeur: "Mistral AI", eci: 141.42, sortie: "2026-04-28", ids: ["mistral-medium-2604"] },
  { nom: "DeepSeek-R1 (May 2025)", editeur: "DeepSeek", eci: 141.3, sortie: "2025-05-28", ids: ["DeepSeek-R1-0528"] },
  { nom: "Claude 3.7 Sonnet", editeur: "Anthropic", eci: 141.16, sortie: "2025-02-24", ids: ["claude-3-7-sonnet-20250219"] },
  { nom: "Gemini 2.5 Flash (Jun 2025)", editeur: "Google", eci: 140.8, sortie: "2025-06-17", ids: ["gemini-2.5-flash"] },
  { nom: "Grok-3 mini", editeur: "xAI", eci: 140.35, sortie: "2025-06-24", ids: ["grok-3-mini-beta"] },
  { nom: "o3-mini", editeur: "OpenAI", eci: 140.35, sortie: "2025-01-31", ids: ["o3-mini-2025-01-31"] },
  { nom: "Kimi K2 (Jul 2025)", editeur: "Moonshot", eci: 140.13, sortie: "2025-07-12", ids: ["Kimi-K2-Instruct"] },
  { nom: "Gemini 2.5 Flash (Apr 2025)", editeur: "Google", eci: 139.96, sortie: "2025-04-17", ids: ["gemini-2.5-flash-preview-04-17"] },
  { nom: "gpt-oss-120b", editeur: "OpenAI", eci: 139.94, sortie: "2025-08-05" },
  { nom: "DeepSeek-V3.1", editeur: "DeepSeek", eci: 139.92, sortie: "2025-08-21", ids: ["DeepSeek-V3.1_thinking"] },
  { nom: "Qwen3-30B-A3B-Thinking (Jul 2025)", editeur: "Alibaba", eci: 139.63, sortie: "2025-07-30", ids: ["qwen3-30b-a3b-thinking-2507"] },
  { nom: "Qwen3.5-9B", editeur: "Alibaba", eci: 139.45, sortie: "2026-02-24" },
  { nom: "GPT-5 nano", editeur: "OpenAI", eci: 139.39, sortie: "2025-08-07", ids: ["gpt-5-nano-2025-08-07"] },
  { nom: "Qwen3-235B-A22B", editeur: "Alibaba", eci: 139.36, sortie: "2025-04-28" },
  { nom: "DeepSeek-R1", editeur: "DeepSeek", eci: 138.98, sortie: "2025-01-20" },
  { nom: "Qwen3-235B-A22B-Instruct (Jul 2025)", editeur: "Alibaba", eci: 138.93, sortie: "2025-07-25", ids: ["Qwen3-235B-A22B-Instruct-2507", "parasail-qwen3-235b-a22b-instruct-2507"] },
  { nom: "Qwen3-32B", editeur: "Alibaba", eci: 138.51, sortie: "2025-04-29" },
  { nom: "Grok 3", editeur: "xAI", eci: 138.34, sortie: "2025-04-09", ids: ["grok-3-beta"] },
  { nom: "Qwen3-14B", editeur: "Alibaba", eci: 138.23, sortie: "2025-04-29" },
  { nom: "gpt-oss-20b", editeur: "OpenAI", eci: 137.81, sortie: "2025-08-05" },
  { nom: "QwQ-32B", editeur: "Alibaba", eci: 137.6, sortie: "2025-03-05" },
  { nom: "DeepSeek-R1-Distill-Qwen-32B", editeur: "DeepSeek", eci: 137.43, sortie: "2025-01-20" },
  { nom: "Qwen3-30B-A3B-Instruct (Jul 2025)", editeur: "Alibaba", eci: 137.42, sortie: "2025-07-29", ids: ["qwen3-30b-a3b-instruct-2507"] },
  { nom: "GPT-4.1", editeur: "OpenAI", eci: 136.79, sortie: "2025-04-14", ids: ["gpt-4.1-2025-04-14"] },
  { nom: "GPT-4.5", editeur: "OpenAI", eci: 136.74, sortie: "2025-02-27", ids: ["gpt-4.5-preview-2025-02-27"] },
  { nom: "Qwen3-30B-A3B", editeur: "Alibaba", eci: 136.18, sortie: "2025-04-29" },
  { nom: "Qwen3-8B", editeur: "Alibaba", eci: 136.17, sortie: "2025-04-28" },
  { nom: "DeepSeek-V3 (Mar 2025)", editeur: "DeepSeek", eci: 135.95, sortie: "2025-03-24", ids: ["DeepSeek-V3-0324"] },
  { nom: "o1-mini", editeur: "OpenAI", eci: 135.82, sortie: "2024-09-12", ids: ["o1-mini-2024-09-12"] },
  { nom: "DeepSeek-R1-Distill-Qwen-14B", editeur: "DeepSeek", eci: 135.43, sortie: "2025-01-20" },
  { nom: "Gemini 2.0 Flash Thinking (Jan 2025)", editeur: "Google", eci: 135.36, sortie: "2025-01-21", ids: ["gemini-2.0-flash-thinking-exp-01-21"] },
  { nom: "Gemini 2.0 Pro", editeur: "Google", eci: 135.06, sortie: "2025-02-05", ids: ["gemini-2.0-pro-exp-02-05"] },
  { nom: "GPT-4.1 mini", editeur: "OpenAI", eci: 135.01, sortie: "2025-04-14", ids: ["gpt-4.1-mini-2025-04-14"] },
  { nom: "o1-preview", editeur: "OpenAI", eci: 134.78, sortie: "2024-09-12", ids: ["o1-preview-2024-09-12"] },
  { nom: "Gemini 2.0 Flash (Dec 2024)", editeur: "Google", eci: 134.71, sortie: "2024-12-11", ids: ["gemini-2.0-flash-exp"] },
  { nom: "Gemini 2.0 Flash (Feb 2025)", editeur: "Google", eci: 134.69, sortie: "2025-02-05", ids: ["gemini-2.0-flash-001"] },
  { nom: "Mistral Medium 3", editeur: "Mistral AI", eci: 134.07, sortie: "2025-05-07", ids: ["mistral-medium-2505"] },
  { nom: "Gemini 2.5 Flash-Lite (Jun 2025)", editeur: "Google", eci: 133.93, sortie: "2025-06-17", ids: ["gemini-2.5-flash-lite-preview-06-17-thinking", "gemini-2.5-flash-lite-preview-06-17"] },
  { nom: "Claude 3.5 Sonnet (October 2024)", editeur: "Anthropic", eci: 133.55, sortie: "2024-10-22", ids: ["claude-3-5-sonnet-20241022"] },
  { nom: "Magistral Small 1.0", editeur: "Mistral AI", eci: 133.19, sortie: "2025-06-10", ids: ["magistral-small-2506"] },
  { nom: "Qwen2.5-Max", editeur: "Alibaba", eci: 132.54, sortie: "2025-01-25", ids: ["qwen-max-2025-01-25"] },
  { nom: "DeepSeek-V3", editeur: "DeepSeek", eci: 132.36, sortie: "2024-12-26", ids: ["DeepSeek-V3-Base"] },
  { nom: "Llama 4 Maverick", editeur: "Meta", eci: 132.2, sortie: "2025-04-06", ids: ["Llama-4-Maverick-17B-128E-Instruct", "Llama-4-Maverick-17B-128E-Instruct-FP8"] },
  { nom: "Mistral Small 3.2", editeur: "Mistral AI", eci: 131.73, sortie: "2025-06-20", ids: ["mistral-small-3.2-2506", "mistral-small-2506"] },
  { nom: "Gemini 1.5 Pro (Sept 2024)", editeur: "Google", eci: 131.73, sortie: "2024-09-24", ids: ["gemini-1.5-pro-002"] },
  { nom: "Magistral Small 1.2", editeur: "Mistral AI", eci: 131.41, sortie: "2025-09-18", ids: ["magistral-small-2509"] },
  { nom: "Grok-2 (Dec 2024)", editeur: "xAI", eci: 130.48, sortie: "2024-12-12", ids: ["grok-2-1212"] },
  { nom: "Phi-4", editeur: "Microsoft", eci: 130.43, sortie: "2024-12-12" },
  { nom: "Gemma 3 27B", editeur: "Google", eci: 130.04, sortie: "2025-03-12", ids: ["gemma-3-27b-it"] },
  { nom: "Claude 3.5 Sonnet", editeur: "Anthropic", eci: 130, sortie: "2024-06-20", ids: ["claude-3-5-sonnet-20240620"] },
  { nom: "Llama 4 Scout", editeur: "Meta", eci: 129.64, sortie: "2025-04-05", ids: ["Llama-4-Scout-17B-16E-Instruct"] },
  { nom: "GPT-4.1 nano", editeur: "OpenAI", eci: 129.62, sortie: "2025-04-14", ids: ["gpt-4.1-nano-2025-04-14"] },
  { nom: "Gemini 1.5 Flash (Sep 2024)", editeur: "Google", eci: 129.37, sortie: "2024-09-24", ids: ["gemini-1.5-flash-002"] },
  { nom: "Qwen2.5-72B", editeur: "Alibaba", eci: 129.01, sortie: "2024-09-19", ids: ["qwen2.5-72b-instruct", "Qwen2.5-VL-72B-Instruct"] },
  { nom: "GPT-4o (May 2024)", editeur: "OpenAI", eci: 128.97, sortie: "2024-05-13", ids: ["gpt-4o-2024-05-13"] },
  { nom: "GPT-4o (Nov 2024)", editeur: "OpenAI", eci: 128.81, sortie: "2024-11-20", ids: ["gpt-4o-2024-11-20"] },
  { nom: "GPT-4o (Aug 2024)", editeur: "OpenAI", eci: 128.77, sortie: "2024-08-06", ids: ["gpt-4o-2024-08-06"] },
  { nom: "Llama 3.1-405B", editeur: "Meta", eci: 128.76, sortie: "2024-07-23", ids: ["Llama-3.1-405B-Instruct"] },
  { nom: "Qwen2.5-32B", editeur: "Alibaba", eci: 128.52, sortie: "2024-09-17", ids: ["qwen2.5-32b-instruct"] },
  { nom: "Mistral Large 2 (Nov 2024)", editeur: "Mistral AI", eci: 128.52, sortie: "2024-11-18", ids: ["mistral-large-2411"] },
  { nom: "Mistral Large 2 (Jul 2024)", editeur: "Mistral AI", eci: 127.54, sortie: "2024-07-24", ids: ["mistral-large-2407"] },
  { nom: "Mistral Small 3.1", editeur: "Mistral AI", eci: 127.48, sortie: "2025-03-17", ids: ["mistral-small-3.1-2503", "mistral-small-2503"] },
  { nom: "Llama 3.3 70B", editeur: "Meta", eci: 127.32, sortie: "2024-12-06", ids: ["Llama-3.3-70B-Instruct"] },
  { nom: "GPT-4 Turbo (Apr 2024)", editeur: "OpenAI", eci: 127.25, sortie: "2024-04-09", ids: ["gpt-4-turbo-2024-04-09"] },
  { nom: "Claude 3.5 Haiku", editeur: "Anthropic", eci: 127.15, sortie: "2024-10-22", ids: ["claude-3-5-haiku-20241022"] },
  { nom: "Mistral Small 3", editeur: "Mistral AI", eci: 127.06, sortie: "2025-01-30", ids: ["mistral-small-3-2501", "mistral-small-2501"] },
  { nom: "Claude 3 Opus", editeur: "Anthropic", eci: 126.91, sortie: "2024-02-29", ids: ["claude-3-opus-20240229"] },
  { nom: "Gemini 1.5 Pro (May 2024)", editeur: "Google", eci: 126.9, sortie: "2024-05-14", ids: ["gemini-1.5-pro-001"] },
  { nom: "GPT-4o mini", editeur: "OpenAI", eci: 126.56, sortie: "2024-07-18", ids: ["gpt-4o-mini-2024-07-18"] },
  { nom: "GPT-4 Turbo (Nov 2023)", editeur: "OpenAI", eci: 126.46, sortie: "2024-01-25", ids: ["gpt-4-0125-preview", "gpt-4-turbo"] },
  { nom: "Llama 3.1-70B", editeur: "Meta", eci: 125.91, sortie: "2024-07-23", ids: ["Llama-3.1-70B-Instruct"] },
  { nom: "Llama 3.2 90B", editeur: "Meta", eci: 125.5, sortie: "2024-09-24", ids: ["Llama-3.2-90B-Vision-Instruct"] },
  { nom: "Qwen2-72B", editeur: "Alibaba", eci: 125.27, sortie: "2024-06-07", ids: ["qwen2-72b-instruct"] },
  { nom: "DeepSeek-V2 (MoE-236B, May 2024)", editeur: "DeepSeek", eci: 124.78, sortie: "2024-05-07", ids: ["DeepSeek-V2"] },
  { nom: "Amazon Nova Pro", editeur: "Amazon", eci: 123.75, sortie: "2024-12-03", ids: ["amazon.nova-pro-v1:0"] },
  { nom: "Gemma 3 12B", editeur: "Google", eci: 123.49, sortie: "2025-03-12", ids: ["gemma-3-12b-it"] },
  { nom: "Llama 3-70B", editeur: "Meta", eci: 122.91, sortie: "2024-04-18", ids: ["Meta-Llama-3-70B", "Meta-Llama-3-70B-Instruct"] },
  { nom: "Gemini 1.5 Flash (May 2024)", editeur: "Google", eci: 122.57, sortie: "2024-05-23", ids: ["gemini-1.5-flash-001"] },
  { nom: "Gemma 2 27B", editeur: "Google", eci: 122.06, sortie: "2024-06-24", ids: ["gemma-2-27b-it"] },
  { nom: "Mistral Large", editeur: "Mistral AI", eci: 122, sortie: "2024-02-26", ids: ["mistral-large-2402"] },
  { nom: "Mixtral 8x22B", editeur: "Mistral AI", eci: 122, sortie: "2024-04-17", ids: ["open-mixtral-8x22b", "Mixtral-8x22B-Instruct-v0.1", "Mixtral-8x22B-v0.1"] },
  { nom: "phi-3-small 7.4B", editeur: "Microsoft", eci: 121.79, sortie: "2024-04-23", ids: ["Phi-3-small-8k-instruct"] },
  { nom: "phi-3-medium 14B", editeur: "Microsoft", eci: 121.18, sortie: "2024-04-23", ids: ["Phi-3-medium-128k-instruct"] },
  { nom: "Claude 3 Sonnet", editeur: "Anthropic", eci: 120.69, sortie: "2024-02-29", ids: ["claude-3-sonnet-20240229"] },
  { nom: "Gemma 2 9B", editeur: "Google", eci: 119.78, sortie: "2024-06-24", ids: ["gemma-2-9b-it"] },
  { nom: "Qwen2.5-Coder-32B", editeur: "Alibaba", eci: 119.41, sortie: "2024-09-18" },
  { nom: "Command R+", editeur: "Cohere", eci: 119.28, sortie: "2024-08-30", ids: ["c4ai-command-r-plus-08-2024"] },
  { nom: "Mistral NeMo", editeur: "Mistral AI", eci: 118.63, sortie: "2024-07-18", ids: ["Mistral-Nemo-Base-2407", "open-mistral-nemo-2407", "Mistral-Nemo-Instruct-2407"] },
  { nom: "Qwen2.5-7B", editeur: "Alibaba", eci: 118.44, sortie: "2024-09-19", ids: ["qwen2.5-7b-instruct"] },
  { nom: "Claude 3 Haiku", editeur: "Anthropic", eci: 118.3, sortie: "2024-03-07", ids: ["claude-3-haiku-20240307"] },
  { nom: "Ministral 3B", editeur: "Mistral AI", eci: 118.08, sortie: "2024-10-16", ids: ["ministral-3b-2410"] },
  { nom: "phi-3-mini 3.8B", editeur: "Microsoft", eci: 117.23, sortie: "2024-04-23", ids: ["Phi-3-mini-4k-instruct"] },
  { nom: "Llama 3.1-8B", editeur: "Meta", eci: 116.48, sortie: "2024-07-23", ids: ["Llama-3.1-8B-Instruct"] },
  { nom: "Llama 3-8B", editeur: "Meta", eci: 116.33, sortie: "2024-04-18", ids: ["Meta-Llama-3-8B-Instruct", "Meta-Llama-3-8B"] },
  { nom: "Qwen2.5-Coder-14B", editeur: "", eci: 116.26, sortie: "2024-09-18" },
  { nom: "Gemma 3 4B", editeur: "Google", eci: 116.02, sortie: "2025-03-12", ids: ["gemma-3-4b-it"] },
  { nom: "GPT-3.5 Turbo (Jan 2024)", editeur: "OpenAI", eci: 115.61, sortie: "2024-01-25", ids: ["gpt-3.5-turbo-0125"] },
  { nom: "Qwen2.5-Coder (7B)", editeur: "Alibaba", eci: 112.93, sortie: "2024-09-18", ids: ["Qwen2.5-Coder-7B-Instruct"] },
  { nom: "Gemma 7B", editeur: "Google", eci: 111.74, sortie: "2024-02-21" },
  { nom: "Falcon 2 11B", editeur: "Technology Innovation Institute", eci: 109.25, sortie: "2024-05-09", ids: ["falcon-11b"] },
  { nom: "Mistral 7B v0.3", editeur: "Mistral AI", eci: 108.73, sortie: "2024-05-27", ids: ["Mistral-7B-Instruct-v0.3", "open-mistral-7b"] },
  { nom: "DeepSeek-Coder-V2-Lite-Base", editeur: "", eci: 108.57, sortie: "2024-06-13" },
  { nom: "Qwen2.5-Coder-3B", editeur: "", eci: 107.4, sortie: "2024-09-18" },
  { nom: "Nemotron-4 15B", editeur: "NVIDIA", eci: 107.38, sortie: "2024-02-26" },
  { nom: "Yi-9B", editeur: "", eci: 107.27, sortie: "2024-03-01" },
  { nom: "StarCoder 2 15B", editeur: "Hugging Face", eci: 104.61, sortie: "2024-02-20" },
  { nom: "Qwen2.5-Coder (1.5B)", editeur: "Alibaba", eci: 102.56, sortie: "2024-09-18" },
  { nom: "Llama 3.2 1B", editeur: "Meta", eci: 101.95, sortie: "2024-09-24", ids: ["Llama-3.2-1B-Instruct"] },
  { nom: "INTELLECT-1", editeur: "Prime Intellect", eci: 100.38, sortie: "2024-11-29", ids: ["INTELLECT-1-Instruct"] },
  { nom: "CodeQwen1.5-7B", editeur: "", eci: 94.24, sortie: "2024-04-15" },
  { nom: "Gemma 2B", editeur: "Google", eci: 93.57, sortie: "2024-02-21" },
  { nom: "StarCoder 2 7B", editeur: "Hugging Face", eci: 92.92, sortie: "2024-02-20" },
  { nom: "StarCoder 2 3B", editeur: "Hugging Face", eci: 88.01, sortie: "2024-02-22" },
  { nom: "Qwen2.5-Coder-0.5B", editeur: "", eci: 87.38, sortie: "2024-09-18" },
];

/*
 * Identifiants d'API qu'un fournisseur documente pour un de ses modèles sans
 * que ce soit le nom du modèle : chez Mistral, « mistral-medium-3 » est Mistral
 * Medium 3.5 (fiche du modèle), pas le Mistral Medium 3 de 2025 que l'indice
 * note aussi ; « ministral-3b-latest » est Ministral 3 3B, que l'indice ne
 * note pas, et non le Ministral 3B de 2024. Pour un modèle branché chez ce
 * fournisseur, ces identifiants renvoient au nom documenté. Pour un modèle
 * local, non : « deepseek/deepseek-v4-flash » dans LM Studio, ce sont les
 * poids d'avril, pas le modèle que l'API de DeepSeek sert sous ce nom.
 */
const renvois = new Map<string, (id: string) => (typeof PRIX_PUBLIES)[number] | undefined>();
function renvoi(fournisseur: string, id: string) {
  let r = renvois.get(fournisseur);
  if (!r) {
    const lignes = PRIX_PUBLIES.filter((l) => l.fournisseur === fournisseur && l.api);
    r = indexerParNom(lignes.map((l) => ({ valeur: l, noms: l.api ?? [] })));
    renvois.set(fournisseur, r);
  }
  return r(id);
}

const chercher = indexerParNom(MODELES_NOTES.map((m) => ({ valeur: m, noms: [m.nom, ...(m.ids ?? [])] })));

/**
 * La note d'un modèle de l'instance, ou rien.
 *
 * `fournisseur` : l'identifiant du fournisseur cloud qui sert le modèle
 * (prixPublies.ts), pour suivre ses renvois documentés. Absent pour un modèle
 * local.
 */
export function noteDuModele(id: string, fournisseur?: string): ModeleNote | undefined {
  if (!formesDuNom(id).exacte) return undefined;
  if (fournisseur) {
    const ligne = renvoi(fournisseur, id);
    if (ligne) {
      for (const nom of ligne.noms) {
        const m = chercher(nom);
        if (m) return m;
      }
      return undefined;
    }
  }
  return chercher(id);
}

/**
 * La note d'un modèle tel que l'instance le décrit : les renvois du
 * fournisseur ne valent que pour un modèle cloud (`origine` « cle » ou
 * « agence »), jamais pour un modèle de la machine.
 */
export function noteDuModeleServi(m: { id: string; origine?: string; catalogue?: string }): ModeleNote | undefined {
  const cloud = m.origine === "cle" || m.origine === "agence";
  return noteDuModele(m.id, cloud ? m.catalogue : undefined);
}

/** L'éditeur d'un modèle noté, quand ses prix ont été relevés. */
const FOURNISSEUR_DE_L_EDITEUR: Record<string, string> = {
  OpenAI: "openai",
  Anthropic: "anthropic",
  Google: "google",
  "Mistral AI": "mistral",
  DeepSeek: "deepseek",
  xAI: "xai",
};

/**
 * Le prix public de l'éditeur d'un modèle noté, en dollars : c'est l'abscisse
 * du graphique. Seulement le nom du modèle, jamais un identifiant d'API
 * redirigé : l'ancien DeepSeek V4 Flash n'a pas le prix du nouveau.
 */
export function prixDeLEditeur(m: ModeleNote): PrixTrouve | undefined {
  const fournisseur = FOURNISSEUR_DE_L_EDITEUR[m.editeur];
  if (!fournisseur) return undefined;
  for (const nom of [m.nom, ...(m.ids ?? [])]) {
    const p = prixPublie(fournisseur, nom, { devise: "USD", parNomSeulement: true });
    if (p) return p;
  }
  return undefined;
}
