import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BellOff,
  Download,
  Bot,
  ShieldQuestion,
  SquareCheckBig,
  Users2,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { IconButton } from "@/components/ui/IconButton";
import { formaterMomentCourt } from "@/lib/formats";
import {
  abonnerNotifications,
  marquerLue,
  notifications,
  toutEffacer,
  toutMarquerLu,
  type GenreNotification,
  type Notification,
} from "@/lib/notifications";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/**
 * Cloche de notifications.
 *
 * Elle ne s'allume que sur du réel : une mise à jour publiée, un accord
 * attendu, une tâche finie, un chat partagé. Rien à vendre, rien à relancer.
 * Le contenu vient de `lib/notifications.ts`, qui écoute les sources déjà en
 * place plutôt que d'en inventer.
 */

const ICONE: Record<GenreNotification, LucideIcon> = {
  maj: Download,
  moteur: Bot,
  approbation: ShieldQuestion,
  tache: SquareCheckBig,
  partage: Users2,
};

function useNotifications(): Notification[] {
  const [liste, setListe] = useState<Notification[]>(() => notifications());
  useEffect(() => {
    const relire = () => setListe(notifications());
    const desabonner = abonnerNotifications(relire);
    window.addEventListener("storage", relire);
    return () => {
      desabonner();
      window.removeEventListener("storage", relire);
    };
  }, []);
  return liste;
}

export function Notifications({ size = 34 }: { size?: number }) {
  const liste = useNotifications();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const aLire = liste.filter((n) => !n.lue).length;

  const ouvrir = (n: Notification) => {
    marquerLue(n.id);
    setOuvert(false);
    if (n.lien) navigate(n.lien);
  };

  return (
    <Popover
      open={ouvert}
      onOpenChange={setOuvert}
      side="top"
      /*
       * Ouverture vers la droite : la cloche est tout à gauche de la fenêtre,
       * et un panneau aligné sur son bord droit sortait de l'écran (mesuré :
       * x = -157). Il s'ouvre donc depuis le bord gauche du bouton.
       */
      align="start"
      width={304}
      trigger={(props) => (
        <span className="relative inline-flex">
          <IconButton
            icon={Bell}
            label={aLire > 0 ? `Notifications (${aLire} non lues)` : t("Notifications")}
            size={size}
            active={ouvert}
            {...props}
          />
          {aLire > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute right-1 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent px-[3px] text-[9px] font-semibold leading-none text-accent-foreground"
            >
              {aLire > 9 ? "9+" : aLire}
            </span>
          )}
        </span>
      )}
      panelClassName="p-0 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-semibold text-foreground">{t("Notifications")}</p>
        {liste.length > 0 && (
          <div className="flex items-center gap-1">
            {aLire > 0 && (
              <button
                type="button"
                onClick={toutMarquerLu}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Check size={12} strokeWidth={2} />
                {t("Tout lu")}
              </button>
            )}
            <button
              type="button"
              onClick={toutEffacer}
              className="rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("Effacer")}
            </button>
          </div>
        )}
      </div>

      {liste.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <BellOff size={20} strokeWidth={1.75} className="text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("Rien à signaler. Les mises à jour, les accords attendus et les tâches terminées arriveront ici.")}
          </p>
        </div>
      ) : (
        <ul className="max-h-[360px] overflow-y-auto">
          {liste.map((n) => {
            const Icone = ICONE[n.genre];
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => ouvrir(n)}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/60",
                    !n.lue && "bg-accent/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0",
                      n.lue ? "text-muted-foreground" : "text-accent",
                    )}
                  >
                    <Icone size={15} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-snug text-foreground">
                      {n.titre}
                    </span>
                    {n.detail && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {n.detail}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {formaterMomentCourt(n.date)}
                    </span>
                  </span>
                  {!n.lue && (
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}

export default Notifications;
