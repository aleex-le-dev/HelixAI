import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/cn";
import { fetchRtk, type EtatRtk } from "@/lib/code";
import type { ReglageRtk } from "@/lib/store/profile";
import { locale, t, tf } from "@/lib/i18n";

/**
 * Réglage RTK de l'écran Code (28/09/2026, gateway/src/rtk.ts). RTK raccourcit
 * la sortie des commandes de l'agent avant qu'elle parte au modèle. D'office
 * avec un modèle cloud (demandé par Medhi : moins de jetons facturés) ; au
 * choix avec les modèles de la machine, où il aide les petits modèles, qui ont
 * peu de place. La passerelle décide à chaque demande ; la carte d'accord
 * montre toujours la commande d'origine.
 */
export function ReglageRtkCode({
  valeur,
  onChange,
  sessionId,
}: {
  valeur: ReglageRtk;
  onChange: (v: ReglageRtk) => void;
  sessionId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [etat, setEtat] = useState<EtatRtk | null>(null);
  useEffect(() => {
    if (!open) return;
    /*
     * La réponse d'une session quittée entre-temps n'écrase pas celle de la
     * session affichée, et l'état relu d'une autre session n'est pas montré le
     * temps de la lecture (28/09/2026) : les jetons épargnés sont ceux « de
     * cette session ».
     */
    let vivant = true;
    setEtat(null);
    void fetchRtk(sessionId).then((r) => {
      if (vivant) setEtat(r);
    });
    return () => {
      vivant = false;
    };
  }, [open, sessionId]);

  const ligne = (v: ReglageRtk, titre: string, description: string) => (
    <button
      type="button"
      aria-pressed={valeur === v}
      onClick={() => {
        onChange(v);
        setOpen(false);
      }}
      className={cn("flex w-full flex-col rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-muted", valeur === v && "bg-muted/60")}
    >
      <span className="text-sm font-medium text-foreground">{titre}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );

  const e = etat?.etat;
  const economies = etat?.session?.economies;
  const situation = !e
    ? null
    : !e.branchable
      ? e.raison
      : e.installe
        ? tf("RTK {0} est installé sur la machine de l'instance.", e.version)
        : e.installation.enCours
          ? t("Installation de RTK en cours : les commandes partent sans lui en attendant.")
          : e.installation.erreur
            ? tf("RTK n'a pas pu être installé : {0} Les commandes partent sans lui.", e.installation.erreur)
            : t("RTK n'est pas encore installé : il s'installe seul dès qu'une session en a besoin ; d'ici là, les commandes partent sans lui.");

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      side="bottom"
      coteFixe
      width={360}
      trigger={(p) => (
        // À 375 px, l'icône seule : le nom du dossier, à côté, garde la place (Chip.tsx).
        <Chip leading={<Gauge size={15} strokeWidth={1.75} />} compacte onClick={p.onClick} active={open} aria-expanded={p["aria-expanded"]}>
          {t("RTK")}
        </Chip>
      )}
    >
      <p className="px-2.5 pb-1 pt-1 text-sm font-semibold text-foreground">{t("Sortie des commandes (RTK)")}</p>
      <p className="px-2.5 pb-2 text-xs leading-relaxed text-muted-foreground">
        {t("RTK raccourcit ce qu'affichent les commandes de l'agent (git, ls, grep, tests) avant que cela parte au modèle. Les approbations jugent et montrent toujours la commande d'origine, et une commande que RTK ne connaît pas passe telle quelle.")}
      </p>
      {ligne("cloud", t("Avec les modèles cloud"), t("Par défaut : moins de jetons facturés par le fournisseur."))}
      {ligne("toujours", t("Toujours"), t("Aussi avec les modèles de cette machine : les petits modèles ont peu de place."))}
      {ligne("jamais", t("Jamais"), t("Les commandes partent telles quelles."))}
      {(situation || economies) && (
        <div className="mt-1 space-y-1 border-t border-border px-2.5 pb-1 pt-2 text-xs leading-relaxed text-muted-foreground">
          {economies && economies.jetons > 0 && (
            <p className="text-foreground">{tf("{0} jetons économisés sur cette session", economies.jetons.toLocaleString(locale()))}</p>
          )}
          {situation && <p>{situation}</p>}
        </div>
      )}
    </Popover>
  );
}

/**
 * Sous la saisie d'une session : ce que RTK a épargné, d'après l'historique
 * qu'il tient sur la machine de l'instance. Relu à la fin de chaque tour ;
 * rien n'est affiché tant qu'il n'a rien épargné.
 */
export function EconomiesRtk({ sessionId, occupe }: { sessionId: string | null; occupe: boolean }) {
  const [jetons, setJetons] = useState(0);
  /*
   * Remis à zéro quand la session change (28/09/2026) : sans cela, « Nouvelle
   * session » ou une autre session rouverte gardait sous sa saisie les jetons
   * épargnés dans la précédente, jusqu'à la fin de son premier tour.
   */
  const [pour, setPour] = useState(sessionId);
  if (pour !== sessionId) {
    setPour(sessionId);
    setJetons(0);
  }
  useEffect(() => {
    if (!sessionId || occupe) return;
    let vivant = true;
    void fetchRtk(sessionId).then((r) => {
      if (vivant) setJetons(r?.session?.economies?.jetons ?? 0);
    });
    return () => {
      vivant = false;
    };
  }, [sessionId, occupe]);
  if (jetons <= 0) return null;
  return (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      {tf("RTK : {0} jetons économisés sur cette session", jetons.toLocaleString(locale()))}
    </p>
  );
}
