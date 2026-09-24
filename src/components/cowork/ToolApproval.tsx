import { FileCog, Mail, Send, ShieldCheck } from "lucide-react";
import { CarteApprobation } from "@/components/cowork/CarteApprobation";
import { useApprobation } from "@/hooks/useApprobation";
import { langue, t, tf } from "@/lib/i18n";
import { libelleOutil } from "@/lib/libellesOutils";

/**
 * Ce que l'agent veut faire, dans la langue de l'écran.
 *
 * Le résumé est rédigé en français par l'instance (`resumerOutil`,
 * approbation.ts) : affiché tel quel, la carte d'accord, la phrase qu'il faut
 * comprendre avant de cliquer, arrivait en français dans une interface anglaise
 * ou chinoise. Hors français, on la recompose avec le libellé traduit de l'outil
 * et le chemin visé, qui suffisent à décider.
 */
function phraseDemande(resume: string, outil?: string, cible?: string | null, employe?: string | null): string {
  if (langue() === "fr" || !outil) return `${employe ?? "L'agent"} veut ${resume}.`;
  return `${employe ? `${employe} · ` : ""}${libelleOutil(outil)}${cible ? ` · ${cible}` : ""}`;
}

/**
 * Demande d'accord avant qu'un outil agisse sur vos fichiers.
 *
 * La demande dit ce que l'agent veut faire, pas le nom de la fonction qu'il a
 * appelée : personne n'approuve « fichiers__write_file » en connaissance de
 * cause. Un refus n'interrompt pas la conversation, l'agent en est informé et
 * poursuit avec ce qu'il peut faire sans.
 */
export function ToolApproval() {
  const { enAttente, niveau, repondre } = useApprobation();
  const demande = enAttente[0];
  if (!demande) return null;

  /*
   * Ce que couvre un « Autoriser » est dit avant le clic, pas après. Sans cela,
   * l'utilisateur croirait n'avoir approuvé qu'une seule écriture alors qu'une
   * tâche longue en enchaîne vingt dans le même dossier.
   */
  const etendue =
    niveau === "chaque"
      ? t("Autoriser vaut aussi pour les actions identiques au même endroit, jusqu'à la fin de cette demande.")
      : t("Autoriser vaut aussi pour les prochaines modifications dans ce dossier, jusqu'à la fin de cette demande.");

  // Un employé travaille aussi quand personne ne lui parle : la carte dit lequel demande.
  const employe = demande.detail?.employe ?? null;

  const envoi = demande.detail?.envoi;
  if (envoi) {
    /*
     * Un mail qui part ne se reprend pas : la carte le montre tel que le
     * serveur le recevra, texte entier, et le bouton dit « Envoyer », pas
     * « Autoriser ». Chaque mail redemande, quel que soit le niveau choisi.
     */
    const ligne = (libelle: string, valeur: string) => (
      <div className="flex gap-2">
        <dt className="w-12 shrink-0 text-muted-foreground">{libelle}</dt>
        <dd className="min-w-0 flex-1 break-words text-foreground">{valeur}</dd>
      </div>
    );
    return (
      <CarteApprobation
        icone={<Mail size={16} strokeWidth={1.75} />}
        titre={employe ? tf("{0}, votre agent, veut envoyer un mail", employe) : t("Un mail est prêt à partir")}
        phrase={envoi.enReponse ? t("Réponse envoyée depuis votre boîte, dans le fil du message d'origine.") : t("Envoyé depuis votre boîte, dès votre accord.")}
        contenu={
          <div className="rounded-xl border border-border bg-muted/40 text-sm">
            <dl className="space-y-1 border-b border-border px-3 py-2.5 text-xs">
              {ligne(t("À"), envoi.a)}
              {envoi.cc && ligne(t("Cc"), envoi.cc)}
              {ligne(t("Objet"), envoi.objet)}
            </dl>
            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-foreground">{envoi.corps}</p>
          </div>
        }
        note={t("Un mail envoyé ne se reprend pas. Relisez avant d'accepter.")}
        accord={t("Envoyer")}
        refus={t("Ne pas envoyer")}
        iconeAccord={Send}
        pied={
          <>
            <ShieldCheck size={12} strokeWidth={1.75} />
            {t("Sans réponse, le mail ne partira pas")}
            {enAttente.length > 1 && tf(" · {0} autre(s) en attente", enAttente.length - 1)}
          </>
        }
        onApprouver={() => void repondre(demande.id, true)}
        onRefuser={() => void repondre(demande.id, false)}
      />
    );
  }

  return (
    <CarteApprobation
      icone={<FileCog size={16} strokeWidth={1.75} />}
      titre={employe ? tf("{0}, votre agent, demande votre accord", employe) : t("L'agent veut agir sur vos fichiers")}
      phrase={phraseDemande(demande.resume, demande.detail?.outil, demande.detail?.cible, employe)}
      // Un employé n'a pas de « demande » en cours : chaque accord ne vaut que pour une action.
      note={employe ? t("Autoriser vaut pour cette action seulement.") : etendue}
      pied={
        <>
          <ShieldCheck size={12} strokeWidth={1.75} />
          {t("Sans réponse, l'action ne sera pas faite")}
          {enAttente.length > 1 && tf(" · {0} autre(s) en attente", enAttente.length - 1)}
        </>
      }
      onApprouver={() => void repondre(demande.id, true)}
      onRefuser={() => void repondre(demande.id, false)}
    />
  );
}

export default ToolApproval;
