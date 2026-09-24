import { Check, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";

/**
 * Carte de demande d'approbation.
 *
 * Le contrôle de l'écran et les outils de fichiers posent la même question et
 * doivent donc la poser de la même façon : même place, même formulation, mêmes
 * deux boutons. Deux cartes dessinées séparément auraient fini par se
 * contredire, et l'utilisateur aurait dû réapprendre à lire la seconde.
 */
export function CarteApprobation({
  icone,
  titre,
  phrase,
  note,
  contenu,
  // Traduits ici, à l'appel : des valeurs par défaut écrites en dur restaient
  // en français sur les deux boutons, dans toutes les langues.
  accord = t("Autoriser"),
  refus = t("Refuser"),
  iconeAccord = Check,
  pied,
  onApprouver,
  onRefuser,
}: {
  icone: ReactNode;
  /** Qui veut agir, et sur quoi. */
  titre: string;
  /** Ce qui va se passer, en français courant. */
  phrase: string;
  /** Ce que l'utilisateur risque d'ignorer, s'il y a lieu. */
  note?: ReactNode;
  /** Ce qui sera fait, montré en entier (le texte d'un mail qui va partir). */
  contenu?: ReactNode;
  /** Libellés des deux boutons, quand « Autoriser » dit mal ce qui se passe. */
  accord?: string;
  refus?: string;
  iconeAccord?: LucideIcon;
  /** Ligne de pied : régime en vigueur, file d'attente restante. */
  pied?: ReactNode;
  onApprouver: () => void;
  onRefuser: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
      <div className={`w-full rounded-2xl ${contenu ? "max-w-lg" : "max-w-md"} border border-border bg-card p-4 shadow-lg`}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-lg bg-warning/15 p-2 text-foreground">
            {icone}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{titre}</p>
            <p className="mt-1 break-words text-sm text-muted-foreground">{phrase}</p>
            {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
          </div>
        </div>

        {contenu && <div className="mt-3">{contenu}</div>}

        <div className="mt-3.5 flex items-center gap-2">
          <Button icon={iconeAccord} className="flex-1" onClick={onApprouver}>
            {accord}
          </Button>
          <Button variant="secondary" icon={X} className="flex-1" onClick={onRefuser}>
            {refus}
          </Button>
        </div>

        {pied && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            {pied}
          </p>
        )}
      </div>
    </div>
  );
}

export default CarteApprobation;
