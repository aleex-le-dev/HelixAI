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

/** Controle segmente (onglets pilule) : element actif = pastille claire surelevee. */
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
        "inline-flex items-center gap-1 rounded-full bg-muted p-1",
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
              "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors",
              size === "sm" ? "px-3 py-1 text-sm" : "px-4 py-1.5 text-sm",
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
