import { useEffect, useRef, useState } from "react";
import { Check, Copy, TextCursorInput } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import { t, tf } from "@/lib/i18n";

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
 */
export function ACopier({
  valeur,
  libelle,
  note,
  className,
}: {
  valeur: string;
  /** Ce que la personne copie, pour le lecteur d'écran : « l'adresse », « le code ». */
  libelle: string;
  /** Une ligne de contexte sous la valeur : d'où elle est joignable, par exemple. */
  note?: string;
  className?: string;
}) {
  const [etat, setEtat] = useState<"prêt" | "copié" | "sélectionné">("prêt");
  const valeurRef = useRef<HTMLSpanElement>(null);
  const minuterie = useRef<number | undefined>(undefined);

  // Le retour visuel s'efface seul ; le démontage l'emporte avec lui.
  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  const revenirAuRepos = () => {
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setEtat("prêt"), 3000);
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(valeur);
      setEtat("copié");
      revenirAuRepos();
    } catch {
      // Refusé : on sélectionne, et le raccourci clavier fait le reste.
      const noeud = valeurRef.current;
      const selection = window.getSelection();
      if (noeud && selection) {
        const plage = document.createRange();
        plage.selectNodeContents(noeud);
        selection.removeAllRanges();
        selection.addRange(plage);
      }
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
        {(etat === "sélectionné" || note) && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {etat === "sélectionné"
              ? t("Copie automatique refusée : le texte est sélectionné, copiez-le au clavier.")
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
              : `Copier ${libelle}`
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
