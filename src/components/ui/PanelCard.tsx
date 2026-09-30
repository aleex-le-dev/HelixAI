import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Carte de section repliable des panneaux de droite (Cowork, suivi de Code).
 * Elle vivait dans CoworkPanel ; le panneau de suivi de l'écran Code en a eu
 * besoin à son tour.
 */
export function PanelCard({
  title,
  headerRight,
  defaultOpen = true,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-start"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="ms-auto flex items-center gap-2 text-muted-foreground">
          {headerRight}
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={cn("transition-transform", !open && "-rotate-90")}
          />
        </span>
      </button>
      {open && <div className="px-3.5 pb-3.5 pt-0">{children}</div>}
    </section>
  );
}

export default PanelCard;
