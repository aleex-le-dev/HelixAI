import { t } from "@/lib/i18n";
/**
 * Ce que l'outil fait, en français. Le nom technique (« read_file »,
 * « envoyer ») n'est pas une phrase ; un outil inconnu (connecteur ajouté)
 * garde son nom, faute de mieux.
 */
const LIBELLES_OUTILS: Record<string, string> = {
  /*
   * Deux libellés, pas un (28/09/2026) : le serveur de fichiers propose les
   * deux outils, et la liste des outils de Cowork montrait deux fois « Lecture
   * d'un fichier ». `read_file` est l'ancien nom de `read_text_file`.
   */
  read_file: t("Lecture d'un fichier (ancien outil)"),
  read_text_file: t("Lecture d'un fichier texte"),
  read_media_file: t("Ouverture d'une image"),
  read_multiple_files: t("Lecture de fichiers"),
  write_file: t("Écriture d'un fichier"),
  edit_file: t("Modification d'un fichier"),
  create_directory: t("Création d'un dossier"),
  list_directory: t("Contenu d'un dossier"),
  list_directory_with_sizes: t("Contenu d'un dossier, avec les tailles"),
  directory_tree: t("Arborescence"),
  move_file: t("Déplacement d'un fichier"),
  search_files: t("Recherche de fichiers"),
  get_file_info: t("Informations sur un fichier"),
  list_allowed_directories: t("Dossiers accessibles"),
  courrier__derniers: t("Derniers mails"),
  courrier__chercher: t("Recherche dans les mails"),
  courrier__lire: t("Lecture d'un mail"),
  courrier__brouillon: t("Brouillon de mail"),
  courrier__envoyer: t("Envoi d'un mail"),
  agenda__prochains: t("Prochains rendez-vous"),
  agenda__jour: t("Agenda du jour"),
  agenda__chercher: t("Recherche dans l'agenda"),
  agenda__creer: t("Création d'un événement"),
  agenda__modifier: t("Modification d'un événement"),
  agenda__supprimer: t("Suppression d'un événement"),
  drive__chercher: t("Recherche dans le Drive"),
  drive__recents: t("Fichiers récents du Drive"),
  drive__dossier: t("Dossier du Drive"),
  drive__lire: t("Lecture d'un fichier du Drive"),
  slack__salons: t("Salons Slack"),
  slack__messages: t("Messages Slack"),
  slack__fil: t("Fil Slack"),
  slack__chercher: t("Recherche dans Slack"),
  bureau__creer_document: t("Création d'un document Word"),
  bureau__creer_classeur: t("Création d'un classeur Excel"),
  bureau__creer_presentation: t("Création d'une présentation"),
  bureau__creer_pdf: t("Création d'un PDF"),
  bureau__lire_document: t("Lecture d'un document"),
  bibliotheque__chercher: t("Recherche dans la bibliothèque"),
  bibliotheque__lire: t("Lecture d'un document de la bibliothèque"),
  reunions__chercher: t("Recherche dans les réunions"),
  reunions__lire: t("Lecture d'une réunion"),
  controle__site_web: t("Contrôle du code web"),
  // Outils livrés de l'agent de code, quand ils demandent un accord (gateway/src/permissionsCode.ts).
  code__bash: t("Commande de l'agent de code"),
  code__edit: t("Modification d'un fichier du projet"),
  code__write: t("Modification d'un fichier du projet"),
  code__apply_patch: t("Modification d'un fichier du projet"),
  code__webfetch: t("Ouverture d'une adresse internet"),
  code__websearch: t("Recherche sur internet"),
  code__read: t("Lecture d'un fichier du projet"),
  code__glob: t("Recherche dans le projet"),
  code__grep: t("Recherche dans le projet"),
  code__list: t("Contenu d'un dossier du projet"),
  // Contrôle de l'écran (computer.ts) : sans eux, la trace montrait « cliquer », « ouvrir app ».
  ecran__capture: t("Capture de l'écran"),
  ecran__cliquer: t("Clic sur l'écran"),
  ecran__double_cliquer: t("Double-clic sur l'écran"),
  ecran__clic_droit: t("Clic droit sur l'écran"),
  ecran__glisser: t("Glisser sur l'écran"),
  ecran__defiler: t("Défilement de l'écran"),
  ecran__saisir: t("Saisie au clavier"),
  ecran__touche: t("Touche du clavier"),
  ecran__ouvrir_app: t("Ouverture d'une application"),
  ecran__attendre: t("Attente"),
  ecran__enregistrer_document: t("Enregistrement du document"),
  ecran__saisir_tableau: t("Saisie d'un tableau"),
  ecran__deplacer: t("Déplacement du curseur"),
  // Messageries (gateway/src/natifs/messageries.ts, 28/09/2026) : la carte d'un envoi, hors du français, commence par ce libellé.
  telegram__conversations: t("Conversations Telegram"),
  telegram__messages: t("Lecture de messages Telegram"),
  telegram__envoyer: t("Envoi d'un message Telegram"),
  discord__salons: t("Salons Discord"),
  discord__messages: t("Lecture de messages Discord"),
  discord__envoyer: t("Envoi d'un message Discord"),
  whatsapp__conversations: t("Conversations WhatsApp"),
  whatsapp__messages: t("Lecture de messages WhatsApp"),
  whatsapp__modeles: t("Modèles de message WhatsApp"),
  whatsapp__envoyer: t("Envoi d'un message WhatsApp"),
  whatsapp__envoyer_modele: t("Envoi d'un modèle WhatsApp"),
};

/** Nom d'outil qualifié « serveur__outil » rendu lisible. */
export function libelleOutil(name: string): string {
  const [serveur, tool = name] = name.split("__");
  return (
    LIBELLES_OUTILS[name] ??
    (serveur === "fichiers" ? LIBELLES_OUTILS[tool] : undefined) ??
    (name.includes("__") ? undefined : LIBELLES_OUTILS[name]) ??
    tool.replace(/_/g, " ")
  );
}

/**
 * Argument le plus parlant d'un appel d'outil (chemin, requête...), celui que
 * le Chat montre à côté du libellé. Partagé depuis le 27/09/2026 : les étapes
 * gardées avec une réponse (hooks/useChat.ts) doivent se relire comme elles
 * s'affichaient.
 */
export function cibleAffichee(args: Record<string, unknown>): string | undefined {
  for (const key of ["path", "query", "url", "pattern", "source"]) {
    const value = args[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}
