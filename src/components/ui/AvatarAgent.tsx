import { useRef, useState } from "react";
import { Camera, Sparkle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { photoValide, reduirePhoto } from "@/lib/photo";
import { t } from "@/lib/i18n";

/**
 * L'avatar d'un agent : sa photo s'il en a une (27/09/2026, demandé par
 * Medhi), sinon l'étincelle des agents. Seule une image intégrée s'affiche :
 * la politique de l'interface (img-src) n'en chargerait pas d'autre, et une
 * adresse ne doit pas pouvoir y passer.
 */
export function AvatarAgent({ photo, nom, size = 40, className }: { photo?: string; nom: string; size?: number; className?: string }) {
  if (photoValide(photo)) {
    return <img src={photo} alt={nom} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-muted", className)} style={{ width: size, height: size }} role="img" aria-label={nom}>
      <Sparkle size={Math.round(size * 0.45)} className="fill-info text-info" />
    </span>
  );
}

/** L'avatar, cliquable pour choisir une photo (et la retirer). `onChange(null)` la retire. */
export function ChoixPhotoAgent({
  photo,
  nom,
  size = 40,
  onChange,
}: {
  photo?: string;
  nom: string;
  size?: number;
  onChange: (photo: string | null) => void;
}) {
  const choix = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <span className="relative inline-flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        title={photo ? t("Changer la photo de l'agent") : t("Ajouter une photo à l'agent")}
        aria-label={photo ? t("Changer la photo de l'agent") : t("Ajouter une photo à l'agent")}
        onClick={(e) => {
          e.stopPropagation();
          choix.current?.click();
        }}
        className="group/photo relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AvatarAgent photo={photo} nom={nom} size={size} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/40 text-background opacity-0 transition-opacity group-hover/photo:opacity-100">
          <Camera size={Math.round(size * 0.4)} strokeWidth={1.75} />
        </span>
      </button>
      {photo && (
        <button
          type="button"
          aria-label={t("Retirer la photo de l'agent")}
          title={t("Retirer la photo de l'agent")}
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
          className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive"
        >
          <X size={10} strokeWidth={2} />
        </button>
      )}
      <input
        ref={choix}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          setErreur(null);
          if (f) void reduirePhoto(f).then(onChange).catch((err) => setErreur(err instanceof Error ? err.message : String(err)));
        }}
      />
      {erreur && <span className="max-w-[160px] text-center text-[11px] text-destructive">{erreur}</span>}
    </span>
  );
}
