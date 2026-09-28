import { ExternalLink } from "lucide-react";
import type { IdNatif } from "@/lib/natifs";
import { t } from "@/lib/i18n";

/**
 * Ce que le panneau d'un service natif dit de Google Docs, Google Forms et
 * Dropbox (gateway/src/natifs/documents.ts, 28/09/2026). À part de
 * ConnecteurNatif.tsx, que d'autres familles de connecteurs complètent le même
 * jour : ce fichier-ci ne porte que ces trois services.
 *
 * Les étapes suivent la documentation lue le 28/09/2026 (citée dans
 * documents.ts) ; les libellés de la console de Dropbox changent parfois, et
 * le panneau le dit déjà.
 */

/** Préparer l'application Dropbox, une fois pour l'instance. */
export function GuideDropbox() {
  return (
    <ol className="list-decimal space-y-1 pl-5">
      <li>
        {t("Sur")}{" "}
        <a className="underline" href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer noopener">
          dropbox.com/developers/apps <ExternalLink size={11} className="inline" />
        </a>
        {t(", « Create app » : « Scoped access », puis « App folder » (un seul dossier, dans Applications) ou « Full Dropbox » (tout le Dropbox du compte), et un nom.")}
      </li>
      <li>{t("Onglet « Permissions » : cochez files.metadata.read et files.content.read, et files.content.write pour envoyer des fichiers (account_info.read l'est déjà), puis « Submit ».")}</li>
      <li>{t("Onglet « Settings », rubrique « OAuth 2 » : dans « Redirect URIs », ajoutez l'adresse de retour ci-dessous, à l'identique. Laissez « Allow public clients » sur « Allow » si vous ne collez pas le secret.")}</li>
      <li>{t("Recopiez l'« App key » et, si vous voulez, l'« App secret ».")}</li>
    </ol>
  );
}

/** Ce qui demande un examen du fournisseur. Traduit au rendu : la langue n'est pas connue au chargement du module. */
export function revueDocuments(): Record<"docs" | "forms" | "dropbox", string> {
  return {
    docs: t("Aucun examen pour une application interne à votre Google Workspace. Écrire ouvre tous les documents du compte : Google n'a pas d'accès plus étroit pour un document que l'on désigne. Rien n'est jamais effacé : l'agent crée un document, ou ajoute du texte à la fin."),
    forms: t("Aucun examen pour une application interne à votre Google Workspace. Lecture seule : les questions et les réponses. Les réponses contiennent souvent des données personnelles : branchez un compte de l'organisation, pas un compte personnel."),
    dropbox: t("Aucun examen tant que l'application sert peu de comptes : elle se relie d'abord au seul compte qui l'a créée, puis à 500 comptes au plus (« Enable additional users »). Au 50e, Dropbox demande de passer l'application en « production », après examen, sous deux semaines. Avec « App folder », l'agent ne voit qu'un dossier ; avec « Full Dropbox », tout le Dropbox du compte."),
  };
}

/** La case d'écriture, pour Docs et Dropbox ; `null` pour les autres services. */
export function libelleChoixDocuments(id: IdNatif): string | null {
  if (id === "docs") return t("Permettre aussi de créer des documents, et d'ajouter du texte à la fin d'un document (rien n'est effacé).");
  if (id === "dropbox") return t("Permettre d'envoyer des fichiers du dossier de travail vers Dropbox (un fichier du même nom n'est jamais remplacé).");
  return null;
}
