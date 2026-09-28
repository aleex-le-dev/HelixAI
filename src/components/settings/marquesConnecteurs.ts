import {
  Blocks,
  BookOpen,
  Brain,
  CalendarClock,
  LayoutGrid,
  ListTodo,
  SquareCheckBig,
  SquareKanban,
  Compass,
  CreditCard,
  FileText,
  Folder,
  Globe,
  Headset,
  Laptop,
  ListChecks,
  Mail,
  MessageSquare,
  Monitor,
  Search,
  Table2,
  TrendingUp,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CleMarquePetite } from "@/components/ui/marques";

/**
 * Le dessin qui va devant chaque service de la liste.
 *
 * Pourquoi cette table vit côté écran, et non dans le catalogue de la
 * passerelle : un logo est une affaire de présentation. La passerelle dit ce
 * qu'un service fait et comment il se branche ; elle n'a pas à transporter des
 * tracés SVG, ni à savoir quelle charte de marque permet quoi.
 *
 * Une entrée absente n'est pas un défaut : elle retombe sur l'icône neutre
 * ci-dessous, puis sur un carré générique. Un service sans logo reste
 * branchable.
 */
export const MARQUE_DU_CONNECTEUR: Record<string, CleMarquePetite> = {
  courrier: "gmail",
  agenda: "googleAgenda",
  drive: "googleDrive",
  sheets: "googleSheets",
  slides: "googleSlides",
  notion: "notion",
  "notion-jeton": "notion",
  linear: "linear",
  // « Jira et Confluence » : le logo d'Atlassian couvre les deux produits.
  atlassian: "atlassian",
  sentry: "sentry",
  figma: "figma",
  webflow: "webflow",
  wix: "wix",
  vercel: "vercel",
  github: "github",
  "github-jeton": "github",
  gitlab: "gitlab",
  postgres: "postgresql",
  brave: "brave",
  kubernetes: "kubernetes",
  cartes: "googleMaps",
  canva: "canva",
  firecrawl: "firecrawl",
  exa: "exa",
  x: "x",
  // Page de marque de Tavily publiée depuis le premier relevé (seconde tournée, 28/09/2026).
  tavily: "tavily",
};

/**
 * Icône neutre pour les services sans logo utilisable : ceux dont la charte
 * interdit cet usage ou le soumet à une autorisation (Slack, LinkedIn, Meta,
 * TikTok, YouTube, HubSpot, Intercom, Asana, Airtable, Box, PayPal, Square),
 * et les serveurs livrés avec le produit, qui ne sont la marque de personne.
 * Tavily a désormais son logo (MARQUE_DU_CONNECTEUR passe devant) ; son
 * icône reste ici, pour le cas où la ligne serait trop petite pour sa charte. Raisons datées
 * dans scripts/marques/sources.json. YouTube n'a d'icône neutre que dans la
 * liste : sa charte fixe 100 px au moins, son logo est en grand dans son
 * panneau (ConnecteurNatif.tsx), et CleMarquePetite l'écarte des tables
 * ci-dessus.
 */
export const ICONE_DU_CONNECTEUR: Record<string, LucideIcon> = {
  fichiers: Folder,
  bibliotheque: FileText,
  reunions: Video,
  bureau: Laptop,
  ecran: Monitor,
  memoire: Brain,
  reflexion: Brain,
  documentation: BookOpen,
  navigateur: Globe,
  slack: MessageSquare,
  "slack-mcp": MessageSquare,
  "slack-jeton": MessageSquare,
  tavily: Search,
  asana: ListChecks,
  hubspot: TrendingUp,
  intercom: Headset,
  "airtable-mcp": Table2,
  "airtable-jeton": Table2,
  box: Folder,
  paypal: CreditCard,
  square: CreditCard,
  courrierIMAP: Mail,
  autre: Compass,
  // Projets et rendez-vous (28/09/2026) : icônes neutres, les logos sont l'affaire d'un autre travail.
  trello: SquareKanban,
  monday: LayoutGrid,
  clickup: SquareCheckBig,
  todoist: ListTodo,
  calendly: CalendarClock,
  zoom: Video,
};

/** Le carré générique, quand ni marque ni icône ne sont connues. */
export const ICONE_PAR_DEFAUT: LucideIcon = Blocks;

/**
 * Logo des fournisseurs de modèles, par identifiant du catalogue de la
 * passerelle (gateway/src/fournisseurs.ts). Absents faute de logo utilisable
 * (28/09/2026, scripts/marques/sources.json) : OpenAI, Scaleway, OVHcloud,
 * IONOS, Groq, DeepSeek, et « compatible », qui n'est personne. Ils gardent
 * la clé neutre.
 */
/**
 * Le logo de l'éditeur d'un modèle, déduit de son identifiant.
 *
 * Déduit, et non déclaré : l'identifiant est la seule chose que tous les
 * moteurs donnent. « mistralai/Mistral-Small-3.2 » et « mistral-medium » ont
 * en commun le mot qui compte. Une correspondance manquante ne casse rien, la
 * ligne s'affiche avec l'icône neutre.
 *
 * Logos officiels seulement (28/09/2026, scripts/marques/sources.json) :
 * DeepSeek, Qwen, Llama, Gemma et les modèles d'OpenAI n'en ont pas ici, faute
 * de symbole officiel utilisable ou parce que leur charte demande une
 * autorisation. Gemma n'emprunte plus l'icône de Gemini, un autre produit.
 * Partagé par le sélecteur de modèles et la comparaison des modèles.
 */
const MARQUE_DU_MODELE: [RegExp, CleMarquePetite][] = [
  [/claude|anthropic/i, "claude"],
  [/mistral|magistral|devstral|codestral|ministral|pixtral|voxtral/i, "mistral"],
  [/gemini/i, "gemini"],
  [/kimi|moonshot/i, "kimi"],
  [/perplexity|sonar/i, "perplexity"],
  [/grok/i, "grok"],
];

export function marqueDuModele(id: string): CleMarquePetite | undefined {
  return MARQUE_DU_MODELE.find(([re]) => re.test(id))?.[1];
}

export const MARQUE_DU_FOURNISSEUR: Record<string, CleMarquePetite> = {
  mistral: "mistral",
  anthropic: "anthropic",
  google: "gemini",
  openrouter: "openrouter",
  xai: "xai",
  together: "together",
};
