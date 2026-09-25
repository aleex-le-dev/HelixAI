import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpenText, Check, Loader2, Settings2 } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Popover } from "@/components/ui/Popover";
import { useBases } from "@/lib/connaissances";
import { features } from "@/config/branding";
import { cn } from "@/lib/cn";
import { t, tf } from "@/lib/i18n";

/**
 * Bases de connaissances de la zone de saisie : celles que la personne choisit
 * pour ce Chat, plus celles qui viennent de l'agent ou du projet (cochées
 * d'office, et le menu dit d'où elles viennent).
 *
 * Choisir une base ne donne accès à rien : c'est l'instance qui décide, à
 * chaque question, ce que la personne a le droit d'en lire.
 */
export function ConnaissancesChip({
  choisies,
  onChange,
  heritees = [],
  side = "bottom",
}: {
  choisies: string[];
  onChange: (ids: string[]) => void;
  /** Bases attachées à l'agent ou au projet, avec la raison affichée (« par l'agent X »). */
  heritees?: { id: string; raison: string }[];
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { bases } = useBases();
  if (!features.bibliotheque) return null;

  const parId = new Map((bases ?? []).map((b) => [b.id, b]));
  // Une base héritée que la personne ne voit pas n'est pas nommée : l'instance l'ignorera de toute façon.
  const heriteesVisibles = heritees.filter((h) => parId.has(h.id));
  const actives = new Set([...choisies.filter((id) => parId.has(id)), ...heriteesVisibles.map((h) => h.id)]);
  const libelle =
    actives.size === 0
      ? t("Connaissances")
      : actives.size === 1
        ? (parId.get([...actives][0]!)?.nom ?? t("Connaissances"))
        : tf("{0} bases", actives.size);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      side={side}
      width={320}
      trigger={(p) => (
        <Chip
          leading={<BookOpenText size={15} strokeWidth={1.75} className={cn(actives.size > 0 && "text-info")} />}
          onClick={p.onClick}
          active={open || actives.size > 0}
          aria-expanded={p["aria-expanded"]}
        >
          {libelle}
        </Chip>
      )}
    >
      <p className="px-2.5 pb-1.5 pt-1 text-xs text-muted-foreground">
        {t("Avant de répondre, l'agent cherche dans les bases cochées et cite les passages qu'il utilise.")}
      </p>
      {!bases ? (
        <div className="flex justify-center py-4 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : bases.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">{t("Aucune base de connaissances pour l'instant.")}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {bases.map((b) => {
            const heritee = heriteesVisibles.find((h) => h.id === b.id);
            const coche = actives.has(b.id);
            return (
              <button
                key={b.id}
                type="button"
                disabled={Boolean(heritee)}
                onClick={() => onChange(coche ? choisies.filter((x) => x !== b.id) : [...choisies, b.id])}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
              >
                <BookOpenText size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{b.nom}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {heritee
                      ? heritee.raison
                      : b.enCours
                        ? t("Indexation en cours")
                        : tf("{0} passage(s)", b.morceaux)}
                  </span>
                </span>
                {coche && <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-foreground" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          navigate("/bibliotheque?vue=connaissances");
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Settings2 size={16} strokeWidth={1.75} />
        <span>{t("Gérer les bases de connaissances")}</span>
      </button>
    </Popover>
  );
}
