import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

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

/** Hauteur au-delà de laquelle la liste défile d'elle-même. */
const HAUTEUR_MAX = 288;
const MARGE = 8;

/**
 * Menu deroulant (select) pleine largeur, ferme au clic exterieur.
 *
 * La liste est posée par-dessus tout l'écran, à la place qui reste sous le
 * bouton (au-dessus s'il y en a plus), et c'est elle qui défile (27/09/2026,
 * vu par Medhi) : ouverte dans une fenêtre ou un panneau, elle était coupée
 * par son cadre, et il fallait faire défiler tout le reste pour voir la fin.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = t("Sélectionner..."),
  className,
  disabled,
  title,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ gauche: number; largeur: number; haut?: number; bas?: number; hauteur: number } | null>(null);
  const selected = options.find((o) => o.value === value);

  const placer = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const dessous = window.innerHeight - r.bottom - MARGE;
    const dessus = r.top - MARGE;
    const voulu = Math.min(HAUTEUR_MAX, options.length * 40 + 10);
    const versLeHaut = dessous < Math.min(voulu, 160) && dessus > dessous;
    setPlace({
      gauche: r.left,
      largeur: r.width,
      ...(versLeHaut ? { bas: window.innerHeight - r.top + 4 } : { haut: r.bottom + 4 }),
      hauteur: Math.max(120, Math.min(HAUTEUR_MAX, versLeHaut ? dessus : dessous)),
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    placer();
    // Le choix en cours, en vue dès l'ouverture.
    requestAnimationFrame(() => liste.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
  }, [open, placer]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (!ref.current?.contains(cible) && !liste.current?.contains(cible)) setOpen(false);
    };
    // Ce qui défile derrière déplace le bouton : la liste le suit (sauf quand c'est elle qui défile).
    const onScroll = (e: Event) => {
      if (liste.current && e.target instanceof Node && liste.current.contains(e.target)) return;
      placer();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", placer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", placer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, placer]);

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
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={liste}
            role="listbox"
            style={{
              position: "fixed",
              left: place.gauche,
              width: place.largeur,
              maxHeight: place.hauteur,
              ...(place.haut !== undefined ? { top: place.haut } : { bottom: place.bas }),
            }}
            // Au-dessus des fenêtres (z-50) : la liste d'un réglage ouvert dans une fenêtre ne passe pas dessous.
            className="z-[70] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-pop animate-[popover_120ms_ease-out]"
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
          </div>,
          document.body,
        )}
    </div>
  );
}

export default Select;
