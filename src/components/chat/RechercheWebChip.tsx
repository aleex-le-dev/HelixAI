import { useState } from "react";
import { Globe, X } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { Button } from "@/components/ui/Button";
import { t, tf } from "@/lib/i18n";

/**
 * Puce « Web » de la zone de saisie (28/09/2026), comme chez ChatGPT et
 * Claude : elle apparaît quand on choisit « Rechercher sur le web » dans le
 * menu « + », reste tant que la recherche est active, et la croix la retire.
 *
 * Elle nomme le moteur à qui partent les questions, sans qu'on ait à
 * l'ouvrir ; son panneau dit le reste (qui ouvre les pages, où s'affichent
 * les sources, ce qui se passe quand on la retire). Rien ne part vers le web
 * sans elle : c'est elle qui fait porter `web: true` à la demande.
 */
export function RechercheWebChip({ moteur, onFermer }: { moteur: string; onFermer: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-flex min-w-0 max-w-full items-center rounded-full bg-primary/10 text-sm text-primary">
      <Popover
        open={open}
        onOpenChange={setOpen}
        align="start"
        width={320}
        trigger={(p) => (
          <button
            type="button"
            onClick={p.onClick}
            aria-expanded={p["aria-expanded"]}
            className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full pl-3 pr-1.5 font-medium hover:bg-primary/10"
            title={tf("Recherche sur le web active : vos questions partent à {0}.", moteur)}
          >
            <Globe size={15} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">
              {t("Web")}
              <span className="font-normal opacity-80"> · {moteur}</span>
            </span>
          </button>
        )}
      >
        <div className="space-y-2 px-2.5 py-2 text-xs text-muted-foreground">
          <p className="text-sm font-medium text-foreground">{t("Recherche sur le web active")}</p>
          <p>{tf("Chaque question part à {0} pour y être cherchée, sans compte. Votre instance ouvre ensuite les pages trouvées et les donne au modèle ; les sources s'affichent sous la réponse, avec leur lien.", moteur)}</p>
          <p>{t("Retirez cette puce : plus rien ne part vers le web.")}</p>
          <Button
            size="sm"
            variant="secondary"
            block
            onClick={() => {
              setOpen(false);
              onFermer();
            }}
          >
            {t("Arrêter la recherche sur le web")}
          </Button>
        </div>
      </Popover>
      <button
        type="button"
        onClick={onFermer}
        aria-label={t("Arrêter la recherche sur le web")}
        title={t("Arrêter la recherche sur le web")}
        className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-primary/15"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

export default RechercheWebChip;
