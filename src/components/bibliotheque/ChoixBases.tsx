import { BookOpenText, Loader2 } from "lucide-react";
import { useBases } from "@/lib/connaissances";
import { t, tf } from "@/lib/i18n";

/**
 * Cases à cocher des bases de connaissances, pour un agent ou un projet.
 *
 * Une base choisie ici que la personne ne voit plus (supprimée, ou retirée de
 * ses groupes) n'est pas affichée, mais n'est pas retirée non plus : c'est au
 * propriétaire de l'agent de décider, et l'instance l'ignore de toute façon
 * pour qui n'y a pas accès.
 */
export function ChoixBases({ valeur, onChange, aide }: { valeur: string[]; onChange: (ids: string[]) => void; aide?: string }) {
  const { bases, erreur } = useBases();
  if (erreur) return <p className="text-xs text-muted-foreground">{erreur}</p>;
  if (!bases) return <Loader2 size={15} className="animate-spin text-muted-foreground" />;
  if (bases.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("Aucune base de connaissances : créez-en une dans la Bibliothèque, onglet Bases de connaissances.")}</p>;
  }
  return (
    <div className="space-y-1">
      {aide && <p className="text-xs text-muted-foreground">{aide}</p>}
      <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
        {bases.map((b) => {
          const coche = valeur.includes(b.id);
          return (
            <label key={b.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted">
              <input type="checkbox" checked={coche} onChange={() => onChange(coche ? valeur.filter((x) => x !== b.id) : [...valeur, b.id])} />
              <BookOpenText size={15} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">{b.nom}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{tf("{0} passage(s)", b.morceaux)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
