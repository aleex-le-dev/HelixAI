import type { IdChoix } from "@/lib/natifs";
import { t, tf } from "@/lib/i18n";

/**
 * Projets et rendez-vous (28/09/2026, SECURITE.md § 48) : ce que l'écran dit
 * de Trello, Monday, ClickUp, Todoist, Calendly et Zoom (serveurs MCP de leurs
 * éditeurs, Connecteurs.tsx) et de Brevo et Mailchimp (connexions natives,
 * ConnecteurNatif.tsx). À part des panneaux communs, pour que chaque famille
 * de connecteurs garde ses textes au même endroit.
 *
 * Les étapes suivent la documentation de chaque éditeur lue le 28/09/2026
 * (sources dans gateway/src/natifs/projetsRegles.ts) ; les libellés des
 * consoles changent, et le panneau commun le dit.
 */

export const MCP_PROJETS = ["trello", "monday", "clickup", "todoist", "calendly", "zoom"] as const;
export const estMcpProjet = (id: string) => (MCP_PROJETS as readonly string[]).includes(id);
export const estNatifProjet = (id: string): id is "brevo" | "mailchimp" => id === "brevo" || id === "mailchimp";

/** Ce que fait le connecteur, et ce que la case « écriture » change, pour un serveur MCP de la famille. */
export function AideMcpProjet({ id, nom }: { id: string; nom: string }) {
  return (
    <div className="space-y-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
      <p>{tf("{0} se branche par le serveur de son éditeur : rien ne s'installe sur cette machine, et l'accord se donne dans la page de {0}.", nom)}</p>
      <p>{t("Sans rien cocher, vos agents lisent seulement. Si vous cochez l'écriture, ils peuvent aussi proposer de créer ou de modifier : chaque écriture vous est montrée en entier et n'a lieu qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation. Seul l'administrateur de l'instance peut brancher ce service et y écrire.")}</p>
      {id === "clickup" && <p>{t("ClickUp limite ce branchement à 50 appels par jour en offre gratuite, 300 à partir de l'offre Unlimited.")}</p>}
      {id === "trello" && <p>{t("Trello branche un espace de travail par connexion : choisissez-le dans la page de Trello.")}</p>}
    </div>
  );
}

/*
 * Comment créer l'application : Zoom, Brevo et Mailchimp ont rejoint les
 * autres dans lib/guidesApplications.ts (28/09/2026), avec un bouton vers la
 * console, l'adresse de retour dans l'étape où on la colle et les portées
 * copiables.
 */

/** Ce que permet chaque service, et ses limites (ConnecteurNatif.tsx, `Revue`). */
export function revueProjet(id: "brevo" | "mailchimp"): string {
  return id === "brevo"
    ? t("Aucun examen de Brevo : une application privée ne sert que les personnes de votre organisation. Sans rien cocher : le compte, les listes de contacts et les campagnes avec leurs statistiques. Préparer des brouillons et envoyer se cochent séparément ; un envoi vous montre la campagne relue chez Brevo, en entier, et son nombre de destinataires. Seules les campagnes adressées à des listes s'envoient d'ici.")
    : t("Aucun examen de Mailchimp. Mailchimp n'a pas d'accès en lecture seule : l'accès accordé vaut tout le compte, et c'est ce logiciel qui s'en tient à la lecture tant que rien n'est coché. Préparer des brouillons et envoyer se cochent séparément ; un envoi vous montre la campagne relue chez Mailchimp, en entier, et son nombre de destinataires. L'accès n'expire pas : pour le retirer, débranchez ici puis retirez l'application dans votre compte Mailchimp.");
}

/** La phrase de chaque case, pour Brevo et Mailchimp. */
export function libelleChoixProjet(c: IdChoix): string {
  if (c === "envoi") return t("Permettre aussi d'envoyer une campagne prête, après avoir vu la campagne entière et son nombre de destinataires.");
  return t("Permettre de préparer des brouillons de campagne (rien n'est envoyé).");
}

/** Pourquoi l'application est celle de l'organisation. */
export function pourquoiApplicationProjet(id: "brevo" | "mailchimp"): string {
  return id === "brevo"
    ? t("Avec l'application que votre organisation crée chez Brevo, une fois. Le logiciel ne peut pas en fournir une commune : Brevo ne permet pour l'instant que des applications privées, réservées à l'organisation qui les crée.")
    : t("Avec l'application que votre organisation crée chez Mailchimp, une fois. Le logiciel ne peut pas en fournir une commune : son secret donnerait accès à tous les comptes qui l'ont autorisée, et il doit rester chez vous.");
}
