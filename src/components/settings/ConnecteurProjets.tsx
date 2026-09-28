import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
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

function Lien({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="underline" href={href} target="_blank" rel="noreferrer noopener">
      {children} <ExternalLink size={11} className="inline" />
    </a>
  );
}

/** Une commande à taper, sur sa propre ligne : deux commandes collées se liraient comme une seule. */
function Commande({ children }: { children: ReactNode }) {
  return <code className="mt-1 block w-fit max-w-full break-all rounded bg-muted px-1.5 py-0.5 text-foreground">{children}</code>;
}

/** Ce que fait le connecteur, et ce que la case « écriture » change, pour un serveur MCP de la famille. */
export function AideMcpProjet({ id, nom }: { id: string; nom: string }) {
  return (
    <div className="space-y-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
      <p>{tf("{0} se branche par le serveur de son éditeur : rien ne s'installe sur cette machine, et l'accord se donne dans la page de {0}.", nom)}</p>
      <p>{t("Sans rien cocher, vos agents lisent seulement. Si vous cochez l'écriture, ils peuvent aussi proposer de créer ou de modifier : chaque écriture vous est montrée en entier et n'a lieu qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation. Seul l'administrateur de l'instance peut brancher ce service et y écrire.")}</p>
      {id === "clickup" && <p>{t("ClickUp limite ce branchement à 50 appels par jour en offre gratuite, 300 à partir de l'offre Unlimited.")}</p>}
      {id === "trello" && <p>{t("Trello branche un espace de travail par connexion : choisissez-le dans la page de Trello.")}</p>}
      {id === "zoom" && (
        <ol className="list-decimal space-y-1 pl-5 [overflow-wrap:anywhere]">
          <li>
            {t("Zoom demande une application déclarée chez lui. Sur")} <Lien href="https://marketplace.zoom.us/develop/create">marketplace.zoom.us</Lien>
            {t(", « Develop », « Build App », choisissez « General App », gérée par l'utilisateur (« User-managed »).")}
          </li>
          <li>{t("Dans « OAuth Redirect URL » et dans la liste d'adresses autorisées, indiquez l'adresse de retour que l'instance donne dans le message qui s'affiche après un premier essai de connexion.")}</li>
          <li>{t("Dans « Scopes », ajoutez les portées de lecture : meeting:read:search, meeting:read:assets, cloud_recording:read:list_user_recordings, cloud_recording:read:content, docs:read:export, docs:read:list_file_collaborators, hub:read:content, my_notes:read:content, agentic_search:read:search, agentic_search:read:ask. Pour écrire, ajoutez aussi meeting:write:meeting, meeting:update:meeting, docs:write:import et hub:write:content, et cochez l'écriture ici.")}</li>
          <li>{t("Recopiez le « Client ID » et le « Client Secret » ci-dessous. Zoom accorde les portées de l'application : si elle a des portées d'écriture et que la case n'est pas cochée, la connexion est refusée.")}</li>
        </ol>
      )}
    </div>
  );
}

/** Comment créer l'application, pour Brevo et Mailchimp (ConnecteurNatif.tsx, `Guide`). */
export function GuideProjet({ id }: { id: "brevo" | "mailchimp" }) {
  if (id === "brevo")
    // https://developers.brevo.com/docs/oauth-quickstart et /docs/apps-getting-started, lus le 28/09/2026.
    return (
      <ol className="list-decimal space-y-1 pl-5 [overflow-wrap:anywhere]">
        <li>
          {t("Brevo crée les applications avec son outil en ligne de commande (")}<Lien href="https://developers.brevo.com/docs/oauth-quickstart">developers.brevo.com</Lien>
          {t(") : installez-le, puis connectez-le au compte Brevo de votre organisation.")}
          <Commande>npm install -g @getbrevo/cli</Commande>
          <Commande>brevo login</Commande>
        </li>
        <li>
          {t("Créez une application privée, réservée à votre organisation, avec l'adresse de retour ci-dessous, à l'identique :")}
          <Commande>brevo app init</Commande>
        </li>
        <li>
          {t("Dans le fichier app-config.json, « auth.scopes » : account:read, contacts:read, campaigns.email:read, et campaigns.email:write pour préparer des brouillons ou envoyer. Puis envoyez la configuration :")}
          <Commande>brevo app upload</Commande>
        </li>
        <li>
          {t("L'identifiant et le secret sont écrits dans src/oauth/.env.local, et s'affichent aussi par la commande ci-dessous. Collez-les plus bas.")}
          <Commande>brevo app credentials --app-id … --reveal-secret</Commande>
        </li>
      </ol>
    );
  // https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/, lu le 28/09/2026.
  return (
    <ol className="list-decimal space-y-1 pl-5 [overflow-wrap:anywhere]">
      <li>
        {t("Dans votre compte Mailchimp, ouvrez")} <Lien href="https://us1.admin.mailchimp.com/account/oauth2/">{t("« Registered apps »")}</Lien>
        {t(" (Profil, Extras), puis « Register An App » : un nom, votre entreprise, votre site.")}
      </li>
      <li>{t("« Redirect URI » : l'adresse de retour ci-dessous, à l'identique.")}</li>
      <li>{t("Recopiez le « Client ID » et le « Client Secret ». Mailchimp ne montre le secret qu'une fois.")}</li>
    </ol>
  );
}

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
