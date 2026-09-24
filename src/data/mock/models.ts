import { branding } from "@/config/branding";
import { t } from "@/lib/i18n";

export interface AiModel {
  id: string;
  name: string;
  provider: string;
  /** Drapeau/emoji d'origine de l'hebergement. */
  flag: string;
  favorite: boolean;
}

/** Modeles disponibles (donnees mockees, coherentes avec l'ecosysteme). */
export const models: AiModel[] = [
  { id: "local-qwen-2.5-14b", name: "Local Qwen 2.5 14B Instruct", provider: "LM Studio", flag: "💻", favorite: false },
  { id: "qwen-3.5-397b", name: "Qwen 3.5 397B", provider: "Scaleway", flag: "🇫🇷", favorite: true },
  { id: "glm-5.2", name: "GLM 5.2", provider: "Nebius", flag: "🇳🇱", favorite: false },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "AWS Bedrock", flag: "🇺🇸", favorite: false },
  { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "AWS Bedrock", flag: "🇺🇸", favorite: false },
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", provider: "AWS Bedrock", flag: "🇺🇸", favorite: false },
  { id: "mistral-medium-3.5-128b", name: "Mistral Medium 3.5 128b", provider: "Scaleway", flag: "🇫🇷", favorite: false },
  { id: "qwen-3.6-35b", name: "Qwen 3.6 35b", provider: "Scaleway", flag: "🇫🇷", favorite: false },
];

export const defaultModelId = "qwen-3.5-397b";

export interface Behavior {
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
}

/** Presets de comportement (menu « Choisir le comportement »). */
export const behaviors: Behavior[] = [
  // La marque vient de `branding` : aucun libellé affiché ne doit la coder en dur.
  {
    id: "auto",
    label: t("Auto"),
    description: `${branding.name} choisit selon votre demande`,
    recommended: true,
  },
  { id: "rapide", label: t("Rapide"), description: t("Pour écrire, résumer et répondre vite") },
  { id: "approfondi", label: t("Approfondi"), description: t("Pour analyser et raisonner davantage") },
];
