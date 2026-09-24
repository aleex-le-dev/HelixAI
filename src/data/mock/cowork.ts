export interface Skill {
  id: string;
  name: string;
  /** Origine de la competence (systeme = fournie par la plateforme). */
  source: "système";
}

/** Competences disponibles dans Cowork (panneau droit). */
export const skills: Skill[] = [
  { id: "docx", name: "docx", source: "système" },
  { id: "pdf", name: "pdf", source: "système" },
  { id: "pptx", name: "pptx", source: "système" },
  { id: "skill-creator", name: "skill-creator", source: "système" },
  { id: "xlsx", name: "xlsx", source: "système" },
];

export interface Connector {
  id: string;
  name: string;
}

/** Connecteurs actifs (panneau droit). */
export const connectors: Connector[] = [{ id: "web-search", name: "Web search" }];
