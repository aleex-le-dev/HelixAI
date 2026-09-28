import { t, tf } from "./langue.ts";

/**
 * Ce que veut dire un refus renvoyé par un fournisseur au retour d'une
 * autorisation (`error=…` dans l'adresse de retour), dit à quelqu'un qui n'a
 * jamais ouvert une console de développeur.
 *
 * Demandé par Medhi le 28/09/2026 (« tout doit être simple, pour tout ») :
 * la page de retour disait « Le service a refusé la demande (code :
 * access_denied) », sans cause ni remède. Or ce code-là veut presque toujours
 * dire l'une de trois choses, et la plus fréquente chez Google n'est pas un
 * clic sur « Annuler » : c'est un compte absent des utilisateurs de test d'une
 * application restée « en test ». Les codes sont ceux de la RFC 6749 § 4.1.2.1, plus ceux
 * de Microsoft (AADSTS…) que microsoftBase.ts traite déjà pour Microsoft 365.
 *
 * Une erreur qui s'affiche chez le fournisseur lui-même (« redirect_uri_mismatch »
 * chez Google, AADSTS50011 chez Microsoft) ne revient jamais ici : le
 * fournisseur refuse de renvoyer vers une adresse qu'il ne connaît pas. Ces
 * cas-là sont expliqués sur l'écran de préparation, avant d'essayer
 * (src/lib/guidesApplications.ts, « Si … affiche une erreur »).
 *
 * Rien du texte du fournisseur n'est recopié : `error_description` est écrit
 * par qui fabrique l'adresse, et la page de retour est publique (revue du
 * 26/09/2026). Seul le code, un mot du protocole, borné, décide du message.
 */
export function refusLisible(code: string, nom: string, options: { google?: boolean; description?: string } = {}): string {
  const c = code.replace(/[^a-z_]/gi, "").slice(0, 40).toLowerCase();
  const d = (options.description ?? "").slice(0, 2000);
  if (/AADSTS(65001|90094|90008)|consent_required/i.test(`${c} ${d}`)) {
    return tf("{0} demande le consentement d'un administrateur pour une partie des permissions. Un administrateur de l'organisation l'accorde dans la console du fournisseur, puis recommencez. Rien n'a été enregistré.", nom);
  }
  switch (c) {
    case "access_denied":
      return options.google
        ? tf("{0} n'a pas donné l'accès : soit « Annuler » a été choisi, soit le compte utilisé n'a pas le droit de se servir de l'application. Une application Google « en test » n'accepte que ses utilisateurs de test : ajoutez ce compte dans « Audience », ou publiez l'application ; une application « Interne » n'accepte que les comptes de votre organisation. Recommencez ensuite. Rien n'a été enregistré.", nom)
        : tf("{0} n'a pas donné l'accès : soit « Annuler » ou « Refuser » a été choisi, soit le compte utilisé n'a pas le droit de se servir de l'application (chez les fournisseurs qui le demandent, un rôle dans l'application ou une place de testeur). Recommencez ensuite. Rien n'a été enregistré.", nom);
    case "invalid_scope":
      return tf("{0} refuse l'une des permissions demandées : ajoutez-les toutes à l'application, exactement comme l'écran de préparation les liste, puis recommencez. Rien n'a été enregistré.", nom);
    case "unauthorized_client":
      return tf("{0} n'autorise pas cette application à se connecter ainsi : vérifiez son type (celui que l'écran de préparation indique) et qu'elle est bien active, puis recommencez. Rien n'a été enregistré.", nom);
    case "invalid_client":
      return tf("{0} ne reconnaît pas l'application : vérifiez l'identifiant collé dans cet écran, et qu'elle n'a pas été supprimée dans la console. Rien n'a été enregistré.", nom);
    case "redirect_uri_mismatch":
    case "invalid_redirect_uri":
      return tf("{0} refuse l'adresse de retour : copiez-la depuis l'écran de préparation et déclarez-la à l'identique dans l'application (même début http ou https, même port, même chemin). Rien n'a été enregistré.", nom);
    case "invalid_request":
      return tf("{0} a jugé la demande incomplète. Le plus souvent, l'adresse de retour déclarée dans l'application n'est pas exactement celle de l'écran de préparation. Rien n'a été enregistré.", nom);
    case "login_required":
    case "interaction_required":
    case "account_selection_required":
      return tf("{0} demande de vous connecter d'abord : recommencez, et connectez-vous dans la page qui s'ouvre. Rien n'a été enregistré.", nom);
    case "server_error":
    case "temporarily_unavailable":
      return tf("{0} n'a pas pu répondre pour l'instant. Réessayez dans quelques minutes. Rien n'a été enregistré.", nom);
    default:
      return tf("{0} a interrompu l'autorisation (code : {1}). Recommencez ; si cela persiste, vérifiez l'application avec l'écran de préparation. Rien n'a été enregistré.", nom, c || t("inconnu"));
  }
}
