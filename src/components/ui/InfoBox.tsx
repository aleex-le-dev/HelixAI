import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "warning" | "muted";

/*
 * Le ton « warning » ecrit en `foreground` et non en `warning-foreground` :
 * ce dernier est la couleur de texte POSEE SUR un aplat d'ambre, donc sombre
 * dans les deux themes. Sur un simple voile a 10 %, il devenait du noir sur
 * noir. En theme clair les deux tokens valent exactement la meme couleur :
 * l'encart ne bouge pas d'un pixel.
 */
const toneClass: Record<Tone, string> = {
  info: "border-info/25 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-foreground",
  muted: "border-border bg-muted/60 text-muted-foreground",
};

/** Encart d'information (bleu par defaut), avec icone/emoji optionnel. */
export function InfoBox({
  children,
  leading,
  tone = "info",
  className,
}: {
  children: ReactNode;
  leading?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border p-3 text-sm",
        toneClass[tone],
        className,
      )}
    >
      {leading && <span className="mt-0.5 shrink-0">{leading}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default InfoBox;
