import { ExternalLink, KeyRound, TriangleAlert } from "lucide-react";
import { InfoBox } from "@/components/ui/InfoBox";
import { ACopier } from "@/components/ui/ACopier";
import type { GuideAppli } from "@/lib/guidesApplications";
import { t, tf } from "@/lib/i18n";

/**
 * « Préparer l'application, une fois pour toute l'instance », dit de la même
 * façon pour chaque service qui veut une application déclarée chez lui.
 *
 * Demandé par Medhi le 28/09/2026 : « quand je veux connecter Gmail, il n'y a
 * pas la redirection vers où je dois aller pour créer l'appli ; tout doit être
 * simple, pour tout ». Chaque panneau avait ses étapes à lui, rédigées à des
 * moments différents : un lien dans le texte chez LinkedIn, aucun chez Google
 * pour Gmail, l'adresse de retour tout en bas chez l'un, seulement dans le
 * message d'un premier essai manqué chez GitHub ou Asana. Ce composant pose un
 * seul ordre, celui de la console :
 *
 *  1. un bouton « Ouvrir … » par page de la console où l'on agit, en tête, là
 *     où l'œil tombe (la page exacte de création quand elle a une adresse) ;
 *  2. les étapes numérotées, dans l'ordre réel de la console ; l'adresse de
 *     retour, copiable, dans l'étape où on la colle, et les portées à cocher,
 *     copiables aussi, dans la leur ;
 *  3. ce qu'il ne faut pas faire ;
 *  4. si le fournisseur affiche une erreur : sa cause probable et quoi faire.
 *
 * Les textes et les liens sont dans lib/guidesApplications.ts, vérifiés sur la
 * documentation des fournisseurs le 28/09/2026 ; `npm run securite` (section
 * 32) contrôle que chaque service à application a son guide, un lien de
 * console et, s'il en déclare une, l'adresse de retour copiable.
 */
export function GuideApplication({
  guide,
  retour,
  noteRetour,
  titre,
}: {
  guide: GuideAppli;
  /** L'adresse de retour exacte que l'instance enverra au fournisseur. */
  retour?: string;
  /** Une ligne sous l'adresse de retour (le port, l'astérisque…). */
  noteRetour?: string;
  /** Le titre de l'encart ; par défaut « Préparer l'application, une fois pour toute l'instance ». */
  titre?: string;
}) {
  return (
    /*
     * 375 px : l'icône dans le titre plutôt qu'en colonne à gauche, et une marge
     * plus étroite, pour laisser la largeur aux étapes ; une adresse ou une
     * portée d'un seul tenant se coupe au lieu de sortir du cadre.
     */
    <InfoBox className="max-sm:px-2.5">
      <div className="space-y-3 [overflow-wrap:anywhere]">
        <p className="flex items-start gap-2 font-medium">
          <KeyRound size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{titre ?? t("Préparer l'application, une fois pour toute l'instance")}</span>
        </p>
        {guide.introduction && <p>{guide.introduction}</p>}

        <div className="flex flex-wrap gap-2">
          {guide.consoles.map((c) => (
            <a
              key={c.url}
              href={c.url}
              target="_blank"
              rel="noreferrer noopener"
              // Un bouton, pas un lien noyé dans une phrase : c'est la première chose à faire.
              className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors [overflow-wrap:break-word] hover:bg-muted"
            >
              <ExternalLink size={14} strokeWidth={1.75} className="shrink-0" />
              <span className="min-w-0">{tf("Ouvrir {0}", c.libelle)}</span>
            </a>
          ))}
        </div>

        <ol className="list-decimal space-y-2 pl-5 max-sm:pl-4">
          {guide.etapes.map((e, i) => (
            <li key={i} className="space-y-1.5">
              <p>{e.texte}</p>
              {e.lien && (
                <a className="inline-flex items-center gap-1 underline" href={e.lien.url} target="_blank" rel="noreferrer noopener">
                  {e.lien.libelle} <ExternalLink size={11} className="inline shrink-0" />
                </a>
              )}
              {e.retour && retour && (
                <ACopier valeur={retour} libelle={t("l'adresse de retour")} note={noteRetour} />
              )}
              {e.portees && e.portees.length > 0 && (
                <ACopier valeur={e.portees.join(e.separateur ?? " ")} libelle={t("la liste des portées")} note={e.notePortees} />
              )}
              {e.commandes?.map((c) => (
                <code key={c} className="block w-fit max-w-full break-all rounded bg-muted px-1.5 py-0.5 text-foreground">
                  {c}
                </code>
              ))}
            </li>
          ))}
        </ol>

        {guide.aEviter && guide.aEviter.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-foreground">
            <p className="flex items-center gap-1.5 font-medium">
              <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0" />
              {t("À ne pas faire")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {guide.aEviter.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}

        {guide.erreurs && guide.erreurs.length > 0 && (
          <details className="rounded-lg border border-border bg-card/60 p-2.5 text-foreground">
            <summary className="cursor-pointer font-medium">{tf("Si {0} affiche une erreur", guide.nom)}</summary>
            <dl className="mt-2 space-y-2">
              {guide.erreurs.map((x) => (
                <div key={x.code}>
                  <dt className="font-mono text-xs">{x.code}</dt>
                  <dd className="text-muted-foreground">{x.texte}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        {/* Pas pour une application ouverte sur la machine (Palmier Pro, 29/09/2026) : il n'y a pas de console. */}
        {!guide.sansConsole && <p className="text-xs">{t("Les libellés des consoles changent parfois : cherchez l'équivalent.")}</p>}
      </div>
    </InfoBox>
  );
}

export default GuideApplication;
