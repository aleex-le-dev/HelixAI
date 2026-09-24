import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Libelle accessible obligatoire (bouton a icone seule). */
  label: string;
  size?: number;
  iconSize?: number;
  active?: boolean;
}

/** Bouton a icone seule, avec `aria-label` obligatoire. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon: Icon, label, size = 34, iconSize = 18, active, className, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          // Meme raison que pour Button : l'indisponibilite doit se voir.
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
          active && "bg-muted text-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        {...props}
      >
        <Icon size={iconSize} strokeWidth={1.75} />
      </button>
    );
  },
);

export default IconButton;
