import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wrench, Plus, Loader2 } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Popover } from "@/components/ui/Popover";
import { Switch } from "@/components/ui/Switch";
import {
  outils as lireOutils,
  CONNECTEURS_CHANGE,
  type GroupeOutils,
} from "@/lib/connecteurs";
import { cn } from "@/lib/cn";
import { t, tf } from "@/lib/i18n";

/**
 * Puce « Outils » du composeur.
 *
 * Elle était un simple interrupteur, et disait donc l'essentiel de travers :
 * « activer les outils » sans jamais nommer lesquels. Personne ne sait ce qu'il
 * autorise, et le jour où l'agent range un fichier au mauvais endroit,
 * l'utilisateur découvre après coup ce que l'interrupteur couvrait.
 *
 * Elle devient un menu qui énumère ce dont l'agent dispose vraiment — la liste
 * vient de l'instance, lue aux mêmes sources que celle envoyée au modèle, pour
 * qu'elle ne puisse pas mentir — et qui se termine par le seul geste manquant :
 * en brancher un de plus.
 *
 * Sa fonction d'origine est conservée telle quelle : l'interrupteur en tête de
 * menu active ou coupe les outils, et la puce elle-même reste allumée ou
 * éteinte à l'écran. Le choix est retenu d'un Chat à l'autre (profile.ts,
 * `outilsChat`) : l'écran disait « pour cette conversation », et un Chat
 * nouveau les trouvait pourtant allumés (tournée à l'écran du 28/09/2026).
 */
export function OutilsChip({
  actif,
  onChange,
  autorise,
  nomAgent,
}: {
  /** Les outils sont-ils activés (pour tous les Chats de la personne) ? */
  actif: boolean;
  onChange: (actif: boolean) => void;
  /** L'agent choisi a-t-il le droit d'utiliser des outils ? Son réglage prime. */
  autorise: boolean;
  nomAgent: string;
}) {
  const [open, setOpen] = useState(false);
  const [groupes, setGroupes] = useState<GroupeOutils[] | null | undefined>(undefined);
  const naviguer = useNavigate();

  const recharger = useCallback(() => {
    void lireOutils().then(setGroupes);
  }, []);

  /*
   * On ne lit qu'à l'ouverture : la liste demande à l'instance l'état de quatre
   * modules, ce qui n'a rien à faire au montage de chaque conversation.
   */
  useEffect(() => {
    if (!open) return;
    recharger();
    window.addEventListener(CONNECTEURS_CHANGE, recharger);
    return () => window.removeEventListener(CONNECTEURS_CHANGE, recharger);
  }, [open, recharger]);

  const disponibles = groupes?.filter((g) => g.actif) ?? [];

  return (
    <Popover
      open={open && autorise}
      onOpenChange={setOpen}
      align="start"
      width={310}
      trigger={(p) => (
        <Chip
          leading={<Wrench size={15} strokeWidth={1.75} />}
          onClick={p.onClick}
          active={actif && autorise}
          disabled={!autorise}
          aria-expanded={p["aria-expanded"]}
          className={cn(!autorise && "opacity-40")}
          /*
           * L'icône seule sous 640 px (parcours du 28/09/2026) : à 375 px, les
           * quatre puces du Chat se partageaient la ligne, les libellés étaient
           * tronqués à rien, et celui des connaissances à « C… ».
           */
          compacte
          title={
            !autorise
              ? tf("L'agent « {0} » n'est pas autorisé à utiliser des outils", nomAgent)
              : actif
                ? t("L'agent peut utiliser ses outils")
                : t("Choisir et activer les outils de vos Chats")
          }
        >
          {t("Outils")}
        </Chip>
      )}
    >
      {/*
        L'interrupteur d'abord : c'est ce que la puce faisait avant, et ce que
        la plupart des gens viennent y chercher.
      */}
      <div className="flex items-center gap-3 rounded-lg px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t("Outils de l'agent")}</p>
          <p className="text-xs text-muted-foreground">
            {actif
              ? t("Actifs dans vos Chats, jusqu'à ce que vous les coupiez.")
              : t("Coupés : l'agent répond sans rien faire sur la machine.")}
          </p>
        </div>
        <Switch checked={actif} onChange={onChange} label={t("Activer les outils")} />
      </div>

      <div className="my-1 border-t border-border" />

      {groupes === undefined && (
        <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />{" "}{t("Lecture...")}
        </p>
      )}

      {groupes === null && (
        <p className="px-2.5 py-2 text-xs text-muted-foreground">
          {t("Instance injoignable : la liste des outils ne peut pas être lue.")}
        </p>
      )}

      {groupes && groupes.length > 0 && (
        <>
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {disponibles.length > 0
              ? // Traduit (tournée à l'écran du 28/09/2026 : restait en français en anglais, chinois et japonais).
                tf("Groupes disponibles : {0}", disponibles.length)
              : t("Aucun outil disponible")}
          </p>
          <div className="max-h-64 overflow-y-auto">
            {groupes.map((g) => (
              <div
                key={g.id}
                className="flex items-start gap-2.5 rounded-lg px-2.5 py-2"
                title={g.description}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    g.actif ? "bg-success" : "bg-neutral-70",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm",
                      g.actif ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {g.label}
                    {g.actif && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {g.outils === 1 ? t("1 outil") : tf("{0} outils", g.outils)}
                      </span>
                    )}
                  </p>
                  {/*
                    On dit pourquoi un groupe ne sert pas. « Courrier » grisé sans
                    explication laisse croire à une panne, alors qu'il ne manque
                    qu'une boîte à brancher.
                  */}
                  {g.obstacle && (
                    <p className="text-xs text-muted-foreground">{g.obstacle}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="my-1 border-t border-border" />

      <button
        type="button"
        onClick={() => {
          setOpen(false);
          naviguer("/parametres/mcp");
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
      >
        <Plus size={15} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
        {t("Connecter un service...")}
      </button>
    </Popover>
  );
}

export default OutilsChip;
