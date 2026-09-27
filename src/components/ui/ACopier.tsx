import { useEffect, useRef, useState } from "react";
import { Check, Copy, TextCursorInput } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import { t, tf } from "@/lib/i18n";
import { copierTexte, selectionner, viderSiContient } from "@/lib/pressePapiers";

/**
 * Une ligne qu'on ne recopie pas : on la copie.
 *
 * Adresse d'instance, code d'invitation, lien de rattachement : trois valeurs
 * que le produit demandait de retaper à la main, et trois occasions de se
 * tromper d'un caractère pour ne rien comprendre à l'échec qui suit. Le bouton
 * enlève la marche.
 *
 * Le presse-papiers peut être refusé — origine non sécurisée, autorisation
 * retirée par le système. Un bouton qui ne fait rien en silence serait pire
 * que pas de bouton : on **sélectionne alors la valeur** et on le dit, pour
 * qu'un raccourci clavier termine le geste. La voie manuelle ne disparaît
 * jamais, elle cesse seulement d'être la seule.
 *
 * La copie passe par `lib/pressePapiers` (27/09/2026) : dans l'application de
 * bureau, `navigator.clipboard` était toujours refusé, et ce bouton ne faisait
 * que sélectionner.
 */
export function ACopier({
  valeur,
  libelle,
  note,
  className,
  effacerApres,
}: {
  valeur: string;
  /** Ce que la personne copie, pour le lecteur d'écran : « l'adresse », « le code ». */
  libelle: string;
  /** Une ligne de contexte sous la valeur : d'où elle est joignable, par exemple. */
  note?: string;
  className?: string;
  /**
   * Pour un secret (clé d'API) : au bout de ce délai, en millisecondes, le
   * presse-papiers est vidé s'il contient encore la valeur. Revue du
   * 26/09/2026 : une clé copiée y restait indéfiniment. Si la lecture du
   * presse-papiers est refusée, on ne vide rien (ce serait peut-être autre
   * chose que la personne a copié depuis), et la note le dit.
   */
  effacerApres?: number;
}) {
  const [etat, setEtat] = useState<"prêt" | "copié" | "sélectionné">("prêt");
  const valeurRef = useRef<HTMLSpanElement>(null);
  const minuterie = useRef<number | undefined>(undefined);

  const effacement = useRef<number | undefined>(undefined);
  const [efface, setEfface] = useState<"attente" | "fait" | "remplacé" | "impossible" | null>(null);

  // Le retour visuel s'efface seul ; le démontage l'emporte avec lui. Le vidage du presse-papiers, lui, reste prévu.
  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  const prevoirEffacement = () => {
    if (!effacerApres) return;
    window.clearTimeout(effacement.current);
    setEfface("attente");
    effacement.current = window.setTimeout(async () => {
      const issue = await viderSiContient(valeur);
      setEfface(issue === "vidé" ? "fait" : issue);
    }, effacerApres);
  };

  const revenirAuRepos = () => {
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setEtat("prêt"), 3000);
  };

  const copier = async () => {
    if (await copierTexte(valeur)) {
      setEtat("copié");
      revenirAuRepos();
      prevoirEffacement();
    } else {
      // Refusé : on sélectionne, et le raccourci clavier fait le reste.
      selectionner(valeurRef.current);
      setEtat("sélectionné");
      revenirAuRepos();
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          ref={valeurRef}
          className="block truncate font-mono text-[13px] text-foreground"
          title={valeur}
        >
          {valeur}
        </span>
        {(etat === "sélectionné" || note || efface) && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {etat === "sélectionné"
              ? t("Copie automatique refusée : le texte est sélectionné, copiez-le au clavier.")
              : efface === "attente"
                ? tf("Le presse-papiers sera vidé dans {0} s, s'il la contient encore.", Math.round((effacerApres ?? 0) / 1000))
                : efface === "fait"
                  ? t("Presse-papiers vidé.")
                  : efface === "remplacé"
                    ? t("Le presse-papiers contient autre chose depuis : il n'a pas été touché.")
                    : efface === "impossible"
                    ? t("Le presse-papiers n'a pas pu être relu : il n'a pas été vidé. Copiez autre chose par-dessus une fois la clé collée.")
                    : note}
          </span>
        )}
      </span>
      <IconButton
        icon={etat === "copié" ? Check : etat === "sélectionné" ? TextCursorInput : Copy}
        /*
          Deux-points plutôt qu'un participe accordé : `libelle` vaut tantôt
          « le lien », tantôt « l'adresse ». « l'adresse sélectionné » serait
          faux une fois sur deux.
        */
        label={
          etat === "copié"
            ? tf("{0} : copié", libelle)
            : etat === "sélectionné"
              ? tf("{0} : sélectionné, à copier au clavier", libelle)
              : tf("Copier {0}", libelle)
        }
        size={30}
        iconSize={15}
        className="shrink-0"
        onClick={() => void copier()}
      />
    </div>
  );
}

export default ACopier;
