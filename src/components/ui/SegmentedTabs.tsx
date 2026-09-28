import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SegmentOption {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedTabsProps {
  options: SegmentOption[];
  value: string;
  onChange: (id: string) => void;
  size?: "sm" | "md";
  className?: string;
  /** Onglets affiches mais sans contenu derriere : ils doivent le montrer. */
  disabledIds?: string[];
  /** Raison de l'indisponibilite, en infobulle. */
  disabledTitle?: string;
}

/**
 * Controle segmente (onglets pilule) : element actif = pastille claire surelevee.
 *
 * Jamais plus large que sa place (tournée à l'écran du 28/09/2026) : à 375 px,
 * « Bureau, CLI, Mobile » dans Installer les apps mesurait 301 px pour 224, et
 * toute la page des réglages défilait de côté. Les onglets gardent leur taille
 * et défilent dans la pilule, sans barre visible.
 */
export function SegmentedTabs({
  options,
  value,
  onChange,
  size = "md",
  className,
  disabledIds,
  disabledTitle,
}: SegmentedTabsProps) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none]",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.id === value;
        const Icon = o.icon;
        const indisponible = disabledIds?.includes(o.id) ?? false;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={indisponible}
            title={indisponible ? disabledTitle : undefined}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors",
              size === "sm" ? "px-3 py-1 text-sm" : "px-4 py-1.5 text-sm max-sm:px-3",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              indisponible && "cursor-not-allowed opacity-45 hover:text-muted-foreground",
            )}
          >
            {Icon && <Icon size={15} strokeWidth={1.75} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedTabs;
