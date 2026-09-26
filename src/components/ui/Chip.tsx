import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icone/visuel de tete (composant Lucide deja rendu, ou emoji). */
  leading?: ReactNode;
  /** Affiche un chevron de fin. */
  chevron?: boolean;
  active?: boolean;
}

/** Petit selecteur pilule (barre de contexte, ligne d'outils du composer). */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { leading, chevron = true, active, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        // `min-w-0` et le libellé tronqué : dans une barre trop étroite, la puce raccourcit au lieu de passer à la ligne.
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        // Une puce desactivee doit cesser d'inviter au clic : sans cela elle
        // s'allume au survol et laisse croire qu'elle ouvre quelque chose.
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
        active && "bg-muted text-foreground",
        className,
      )}
      {...props}
    >
      {leading && <span className="inline-flex shrink-0">{leading}</span>}
      {children && (
        <span className="min-w-0 truncate whitespace-nowrap" title={typeof children === "string" ? children : undefined}>
          {children}
        </span>
      )}
      {chevron && (
        <ChevronDown
          size={14}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground"
        />
      )}
    </button>
  );
});

export default Chip;
