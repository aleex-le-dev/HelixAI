import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Zone principale a droite de la barre laterale. */
export function MainArea({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("relative flex min-w-0 flex-1 flex-col", className)}>
      {/*
       * Poignée de la fenêtre. La barre de titre du système est masquée : sans
       * cette bande, seul l'en-tête de la barre latérale (presque entièrement
       * occupé par le logo et le bouton de repli) permettait de déplacer la
       * fenêtre, autant dire jamais. N'existe que dans l'application de bureau.
       */}
      <div aria-hidden className="fenetre-poignee h-7 shrink-0" />
      {children}
    </main>
  );
}

export default MainArea;
