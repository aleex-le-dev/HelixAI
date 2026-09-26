import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  /** Reglage affiche mais sans effet : il doit se montrer indisponible. */
  disabled?: boolean;
  /** Raison de l'indisponibilite, en infobulle. */
  title?: string;
}

/** Menu deroulant (select) pleine largeur, ferme au clic exterieur. */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Sélectionner...",
  className,
  disabled,
  title,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2.5 text-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted/40",
        )}
      >
        <span className={cn(!selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        /*
          La liste défile d'elle-même, pas la page (27/09/2026, vu par Medhi :
          les 28 jours d'une mission faisaient défiler tout l'écran). Le choix
          en cours est amené en vue à l'ouverture.
        */
        <div
          ref={(el) => el?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-pop animate-[popover_120ms_ease-out]"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
            >
              <span className="flex-1">{o.label}</span>
              {o.value === value && <Check size={15} strokeWidth={2} className="text-foreground" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Select;
