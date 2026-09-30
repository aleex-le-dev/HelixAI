import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { suggestionsDuMoment, type Suggestion } from "@/lib/suggestions";
import { t } from "@/lib/i18n";

/**
 * Suggestions de l'écran d'accueil.
 *
 * Chacune mène quelque part de réel : un écran, ou une question que le Chat
 * sait traiter. Le lien « Plus d'idées », qui ne menait nulle part, a été
 * retiré plutôt que laissé désactivé.
 */
export function SuggestionList({
  onDemander,
  onBase,
}: {
  /** Pose une question au Chat ; `outils` demande de les activer pour elle. */
  onDemander?: (question: string, outils: boolean) => void;
  /** Attache une base de connaissances à la zone de saisie. */
  onBase?: (base: string) => void;
}) {
  const navigate = useNavigate();
  const [liste, setListe] = useState<Suggestion[]>([]);

  useEffect(() => {
    let vivant = true;
    void suggestionsDuMoment().then((s) => vivant && setListe(s));
    return () => {
      vivant = false;
    };
  }, []);

  if (liste.length === 0) return null;

  return (
    <div className="w-full">
      <div className="px-1 pb-1.5">
        <span className="text-sm text-muted-foreground">{t("Suggestions pour vous")}</span>
      </div>
      <ul className="space-y-0.5">
        {liste.map((s) => {
          const Icone = s.icone;
          return (
            <li key={s.libelle}>
              <button
                type="button"
                onClick={() =>
                  s.genre === "aller"
                    ? navigate(s.chemin)
                    : s.genre === "base"
                      ? onBase?.(s.base)
                      : onDemander?.(s.question, s.outils)
                }
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Icone size={17} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
                <span>{s.libelle}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SuggestionList;
