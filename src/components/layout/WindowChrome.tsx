import type { ReactNode } from "react";

/**
 * Cadre applicatif.
 *
 * L'application occupe toute la fenêtre : c'est un logiciel, pas la maquette
 * d'un logiciel. La barre de titre, les boutons de fenêtre et les coins arrondis
 * sont fournis par le système (ou par Electron une fois empaqueté) — les
 * reproduire nous-mêmes donnerait deux barres de fenêtre superposées.
 */
export function WindowChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-stretch overflow-hidden bg-background">
      {children}
    </div>
  );
}

export default WindowChrome;
