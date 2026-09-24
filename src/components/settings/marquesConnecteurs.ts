import {
  Blocks,
  BookOpen,
  Brain,
  Compass,
  FileText,
  Folder,
  Globe,
  Laptop,
  Mail,
  MessageSquare,
  Monitor,
  Palette,
  Search,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CleMarque } from "@/components/ui/marques";

/**
 * Le dessin qui va devant chaque service de la liste.
 *
 * Pourquoi cette table vit côté écran, et non dans le catalogue de la
 * passerelle : un logo est une affaire de présentation. La passerelle dit ce
 * qu'un service fait et comment il se branche ; elle n'a pas à transporter des
 * tracés SVG, ni à savoir que Slack ne veut plus voir son logo ailleurs.
 *
 * Une entrée absente n'est pas un défaut : elle retombe sur l'icône neutre
 * ci-dessous, puis sur un carré générique. Un service sans logo reste
 * branchable.
 */
export const MARQUE_DU_CONNECTEUR: Record<string, CleMarque> = {
  courrier: "gmail",
  agenda: "googleAgenda",
  drive: "googleDrive",
  notion: "notion",
  "notion-jeton": "notion",
  linear: "linear",
  atlassian: "jira",
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
  "github-jeton": "github",
  gitlab: "gitlab",
  box: "box",
  "airtable-mcp": "airtable",
  "airtable-jeton": "airtable",
  postgres: "postgresql",
  hubspot: "hubspot",
  brave: "brave",
  kubernetes: "kubernetes",
  cartes: "googleMaps",
};

/**
 * Icône neutre pour les services sans logo utilisable : ceux que Simple Icons
 * n'a jamais eus (Canva, Firecrawl, Tavily, Exa), ceux qui ont demandé le
 * retrait du leur (Slack), et les serveurs livrés avec le produit, qui ne sont
 * la marque de personne.
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
  canva: Palette,
  firecrawl: Search,
  tavily: Search,
  exa: Search,
  courrierIMAP: Mail,
  autre: Compass,
};

/** Le carré générique, quand ni marque ni icône ne sont connues. */
export const ICONE_PAR_DEFAUT: LucideIcon = Blocks;
