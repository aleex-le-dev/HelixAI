import { Sun, Moon, SunMoon, Monitor } from "lucide-react";
import { useApparence } from "@/hooks/useApparence";
import { useFormats } from "@/lib/formats";
import { MODES, type ModeApparence } from "@/lib/store/apparence";
import { courseDuSoleil, positionApprochee } from "@/lib/soleil";
import { Card } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/cn";
import { t, tf } from "@/lib/i18n";

const ICONES: Record<ModeApparence, typeof Sun> = {
  soleil: SunMoon,
  clair: Sun,
  sombre: Moon,
  systeme: Monitor,
};


/**
 * Réglage de l'apparence.
 *
 * Les horaires du jour sont affichés sous le choix « au coucher du soleil ».
 * Un réglage qui agit tout seul doit dire quand il va agir : sans cela,
 * l'application changerait de couleur un soir sans que personne comprenne
 * pourquoi.
 */
export function Apparence() {
  const { mode, theme, choisir } = useApparence();
  // Par le crochet : cette carte est sur la même page que le réglage des
  // formats, et les heures du soleil doivent basculer en 12 h dès qu'on le choisit.
  const { heure } = useFormats();

  const position = positionApprochee();
  const course = position ? courseDuSoleil(new Date(), position[0], position[1]) : null;

  return (
    <Card>
      <h3 className="text-lg font-semibold text-foreground">{t("Apparence")}</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {tf("Actuellement en thème {0}.", theme === "sombre" ? t("sombre") : t("clair"))}
      </p>

      <div className="grid gap-2 cq-sm:grid-cols-2">
        {MODES.map((m) => {
          const Icone = ICONES[m.valeur];
          const actif = mode === m.valeur;
          return (
            <button
              key={m.valeur}
              type="button"
              onClick={() => choisir(m.valeur)}
              aria-pressed={actif}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3.5 py-3 text-start transition-colors",
                actif
                  ? "border-accent bg-accent/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <Icone
                size={18}
                strokeWidth={1.75}
                className={cn("mt-0.5 shrink-0", actif ? "text-accent" : "text-muted-foreground")}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{m.nom}</span>
                <span className="block text-xs text-muted-foreground">{m.detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      {mode === "soleil" && (
        <p className="mt-3 text-xs text-muted-foreground">
          {course
            ? tf("Aujourd'hui : lever à {0}, coucher à {1}. ", heure(course.lever), heure(course.coucher)) +
              t("Les horaires sont calculés sur ce poste, sans rien demander au réseau.")
            : t("Les horaires du soleil ne peuvent pas être établis ici : l'apparence suit ") +
              t("alors le réglage du système.")}
        </p>
      )}
    </Card>
  );
}

export default Apparence;
