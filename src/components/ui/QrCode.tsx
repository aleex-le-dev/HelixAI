import { useMemo } from "react";
import { encoderQr } from "@/lib/qr";
import { cn } from "@/lib/cn";

/**
 * QR code dessiné en SVG, calculé sur le poste (voir `src/lib/qr.ts`).
 *
 * Toujours sombre sur clair, y compris en thème sombre : une partie des
 * lecteurs ne reconnaît pas un code inversé. La marge blanche de quatre
 * modules fait partie de la norme, elle n'est pas décorative.
 */
export function QrCode({
  valeur,
  taille = 192,
  titre,
  className,
}: {
  valeur: string;
  taille?: number;
  titre: string;
  className?: string;
}) {
  const { chemin, cote } = useMemo(() => {
    const m = encoderQr(valeur);
    const marge = 4;
    let d = "";
    m.forEach((ligne, y) =>
      ligne.forEach((sombre, x) => {
        if (sombre) d += `M${x + marge} ${y + marge}h1v1h-1z`;
      }),
    );
    return { chemin: d, cote: m.length + marge * 2 };
  }, [valeur]);

  return (
    <svg
      role="img"
      aria-label={titre}
      width={taille}
      height={taille}
      viewBox={`0 0 ${cote} ${cote}`}
      shapeRendering="crispEdges"
      className={cn("rounded-lg bg-white", className)}
    >
      <path d={chemin} className="fill-black" />
    </svg>
  );
}

export default QrCode;
