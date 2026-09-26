import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type Align = "start" | "center" | "end";

interface PopoverProps {
  /** Element declencheur (recoit onClick + aria). */
  trigger: (props: {
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": true;
  }) => ReactNode;
  children: ReactNode;
  /** Ouverture controlee (optionnelle). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: Align;
  /** Cote d'ouverture. */
  side?: "bottom" | "top";
  /** Largeur fixe du panneau (px). */
  width?: number;
  className?: string;
  panelClassName?: string;
}

const alignClass: Record<Align, string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

/**
 * Popover accessible : ferme sur clic exterieur et touche Echap.
 * Le conteneur est `relative` ; le panneau se positionne par rapport au trigger.
 */
export function Popover({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  align = "start",
  side = "bottom",
  width,
  className,
  panelClassName,
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolled;
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  /*
   * Où ouvrir, et jusqu'où.
   *
   * Le panneau n'avait aucune limite de hauteur. Le choix du modèle, ouvert
   * vers le bas depuis le milieu de l'écran, débordait donc sous la fenêtre :
   * il fallait faire défiler tout le logiciel pour atteindre le bas de la
   * liste. Le panneau mesure maintenant la place de chaque côté du bouton,
   * s'ouvre du côté qui en a le plus quand le côté demandé en manque, et ne
   * dépasse jamais la fenêtre : au-delà, c'est lui qui défile, pas la page.
   */
  const [placement, setPlacement] = useState<{ cote: "bottom" | "top"; hauteur: number }>({
    cote: side,
    hauteur: 480,
  });

  useLayoutEffect(() => {
    if (!open) return;
    const mesurer = () => {
      const cadre = rootRef.current?.getBoundingClientRect();
      if (!cadre) return;
      const marge = 16;
      const dessous = window.innerHeight - cadre.bottom - marge - 8;
      const dessus = cadre.top - marge - 8;
      const SOUHAITE = 360;
      let cote = side;
      if (side === "bottom" && dessous < SOUHAITE && dessus > dessous) cote = "top";
      if (side === "top" && dessus < SOUHAITE && dessous > dessus) cote = "bottom";
      setPlacement({ cote, hauteur: Math.max(160, cote === "bottom" ? dessous : dessus) });
    };
    mesurer();
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, [open, side]);

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    /*
     * Échap ferme le menu, et seulement lui. Écouté en capture et arrêté là :
     * sans cela, la fenêtre qui contient le menu (création d'une tâche, par
     * exemple) recevait la même touche et se fermait avec, brouillon perdu.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex min-w-0", className)}>
      {trigger({
        onClick: () => setOpen(!open),
        "aria-expanded": open,
        "aria-haspopup": true,
      })}
      {open && (
        <div
          id={id}
          role="menu"
          style={{ ...(width ? { width } : {}), maxHeight: placement.hauteur }}
          className={cn(
            // `overscroll-contain` : la molette arrivée au bout de la liste n'entraîne pas la page derrière.
            "absolute z-50 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-pop",
            align === "center"
              ? "popover-center"
              : "animate-[popover_120ms_ease-out]",
            placement.cote === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
            alignClass[align],
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default Popover;
