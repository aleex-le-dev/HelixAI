import { useEffect, useState } from "react";
import {
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  FileText,
  Loader2,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PanelCard } from "@/components/ui/PanelCard";
import { IconButton } from "@/components/ui/IconButton";
import { dureeCourte } from "@/lib/code";
import type { ActionCode, FichierCode, SuiviCode, TacheCode } from "@/lib/suiviCode";
import { locale, t, tf } from "@/lib/i18n";

/**
 * Le panneau de suivi de l'écran Code : ce que l'agent fait en ce moment, sa
 * liste de tâches, ses actions, les fichiers touchés et le temps total.
 *
 * Demandé par Medhi le 25/09/2026, « comme dans Claude Code, la bande à
 * droite où l'on voit ce qui est en cours ». Sur un petit modèle local, une
 * tâche dure des minutes, dont parfois deux avant le premier mot (lecture de
 * la demande) : sans ce panneau, on croyait que tout plantait. Il ne montre
 * que ce que le flux de la session dit (voir lib/suiviCode.ts), rien de
 * deviné.
 */

const LIBELLE_FICHIER: Record<FichierCode["action"], string> = {
  lu: t("Lu"),
  modifie: t("Modifié"),
  ecrit: t("Écrit"),
};

/** Ce que l'agent fait maintenant, en une phrase. */
function phraseDe(s: SuiviCode): string {
  const p = s.phase;
  switch (p.type) {
    case "demarrage":
      return t("Démarrage de l'agent de code");
    case "lecture":
      return p.sousTache ? t("Le modèle lit la demande de la sous-tâche") : t("Le modèle lit la demande");
    case "attente":
      return t("Le modèle termine une autre demande avant celle-ci");
    case "chargement":
      return t("Le modèle se charge en mémoire");
    case "reponse":
      return t("Le modèle commence à répondre");
    case "reflexion":
      return t("L'agent réfléchit");
    case "ecriture":
      return t("L'agent écrit sa réponse");
    case "preparation":
      return p.libelle ? tf("L'agent prépare : {0}", p.libelle) : t("L'agent prépare une action");
    case "outil":
      return p.libelle ?? t("Action en cours");
    case "suite":
      return t("L'agent reprend avec le résultat");
    case "soustache":
      return p.libelle ?? t("Sous-tâche en cours");
    case "termine":
      return s.issue === "arrete" ? t("Arrêté à votre demande.") : s.issue === "echec" ? t("Interrompu") : t("Terminé");
  }
}

function IconeEtat({ etat, className }: { etat: "encours" | "fini" | "echec"; className?: string }) {
  if (etat === "encours") return <Loader2 size={13} className={cn("shrink-0 animate-spin text-muted-foreground", className)} />;
  if (etat === "fini") return <CircleCheck size={13} strokeWidth={2} className={cn("shrink-0 text-success", className)} />;
  return <CircleAlert size={13} strokeWidth={2} className={cn("shrink-0 text-destructive", className)} />;
}

function IconeTache({ etat }: { etat: TacheCode["etat"] }) {
  if (etat === "completed") return <CircleCheck size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-success" />;
  if (etat === "in_progress") return <CircleDot size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-info" />;
  if (etat === "cancelled") return <CircleX size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />;
  return <Circle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />;
}

/** Ce qui se passe maintenant : la phase, depuis combien de temps, et ce qu'on en sait de sûr. */
function EnCeMoment({ suivi, maintenant }: { suivi: SuiviCode; maintenant: number }) {
  const p = suivi.phase;
  const fini = suivi.fin !== undefined;
  const lecture = p.type === "lecture" || p.type === "attente" || p.type === "chargement";
  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      <div className="flex items-start gap-2">
        {!fini ? (
          <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
        ) : suivi.issue === "fini" ? (
          <CircleCheck size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-success" />
        ) : suivi.issue === "arrete" ? (
          <Square size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <CircleAlert size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-foreground">{phraseDe(suivi)}</span>
          {p.cible && (
            <span className="block truncate text-xs text-muted-foreground" title={p.cible}>
              {p.cible}
            </span>
          )}
          {!fini && (
            <span className="block text-xs text-muted-foreground">{tf("depuis {0}", dureeCourte(maintenant - p.depuis))}</span>
          )}
        </span>
      </div>
      {!fini && lecture && (
        <div className="space-y-1.5 pl-[23px]">
          {p.progression !== undefined && (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={p.progression}
              aria-label={t("Lecture de la demande")}
            >
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${p.progression}%` }} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {[
              p.progression !== undefined ? tf("{0} % lus", p.progression) : undefined,
              p.jetons ? tf("environ {0} jetons", (p.jetons >= 1000 ? Math.round(p.jetons / 1000) * 1000 : p.jetons).toLocaleString(locale())) : undefined,
              p.file ? tf("{0} en file chez le modèle", p.file) : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {maintenant - p.depuis > 20_000 && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("Un modèle local lit toute la demande avant d'écrire : pour une longue demande, cela peut prendre quelques minutes. L'agent travaille.")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Taches({ taches }: { taches: TacheCode[] }) {
  return (
    <ul className="space-y-1.5">
      {taches.map((tache, i) => (
        <li key={`${i}-${tache.texte}`} className="flex items-start gap-2 text-sm">
          <IconeTache etat={tache.etat} />
          <span
            className={cn(
              "min-w-0 flex-1 break-words",
              tache.etat === "completed" || tache.etat === "cancelled" ? "text-muted-foreground" : "text-foreground",
              tache.etat === "cancelled" && "line-through",
              tache.etat === "in_progress" && "font-medium",
            )}
          >
            {tache.texte}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Actions({ actions, maintenant }: { actions: ActionCode[]; maintenant: number }) {
  // Les quarante dernières : une longue tâche en compte des centaines.
  const visibles = actions.slice(-40);
  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto">
      {actions.length > visibles.length && (
        <li className="text-[11px] text-muted-foreground">{tf("{0} actions plus anciennes", actions.length - visibles.length)}</li>
      )}
      {visibles.map((a) => (
        <li key={a.callID} className="text-xs">
          <div className="flex items-start gap-1.5">
            <IconeEtat etat={a.etat} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-foreground">{a.libelle}</span>
              {a.cible && (
                <span className="block truncate text-muted-foreground" title={a.cible}>
                  {a.cible}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
              {dureeCourte((a.fin ?? maintenant) - a.debut)}
            </span>
          </div>
          {a.sous && a.sous.length > 0 && (
            <ul className="ml-[18px] mt-1 space-y-0.5 border-l border-border pl-2">
              {a.sous.slice(-6).map((x) => (
                <li key={x.callID} className="flex items-start gap-1.5 text-muted-foreground">
                  <IconeEtat etat={x.etat} className="mt-0.5" />
                  <span className="min-w-0 flex-1 truncate" title={[x.libelle, x.cible].filter(Boolean).join(" · ")}>
                    {x.libelle}
                    {x.cible && <span className="opacity-80"> · {x.cible}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Fichiers({ fichiers, dossier }: { fichiers: FichierCode[]; dossier?: string }) {
  return (
    <ul className="space-y-1">
      {fichiers.map((f) => (
        <li key={f.chemin} className="flex items-start gap-2 text-sm">
          <FileText size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-foreground" title={f.chemin}>
              {dossier && f.chemin.startsWith(`${dossier}/`) ? f.chemin.slice(dossier.length + 1) : f.chemin.split("/").pop()}
            </span>
            <span className="text-[11px] text-muted-foreground">{LIBELLE_FICHIER[f.action]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SuiviCodePanel({
  suivi,
  dossier,
  onFermer,
  className,
}: {
  suivi: SuiviCode | null;
  dossier?: string;
  onFermer: () => void;
  className?: string;
}) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const enCours = suivi !== null && suivi.fin === undefined;
  // Le temps écoulé avance à la seconde tant que l'agent travaille ; figé ensuite.
  useEffect(() => {
    if (!enCours) return;
    setMaintenant(Date.now());
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(minuterie);
  }, [enCours]);

  const faites = suivi?.taches.filter((x) => x.etat === "completed").length ?? 0;
  const total = suivi ? dureeCourte((suivi.fin ?? maintenant) - suivi.debut) : undefined;

  return (
    <aside
      aria-label={t("Suivi de l'agent de code")}
      className={cn("flex w-[300px] max-w-full shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-background p-3", className)}
    >
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">{t("Suivi")}</h2>
        {total && (
          <span className="text-xs tabular-nums text-muted-foreground" title={t("Temps total de la demande")}>
            {total}
          </span>
        )}
        <IconButton icon={X} label={t("Masquer le suivi")} onClick={onFermer} size={28} iconSize={15} className="ml-auto" />
      </div>

      {!suivi ? (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          {t("Ce que fait l'agent (lecture de la demande, réflexion, fichiers, commandes, sous-tâches) s'affichera ici pendant qu'il travaille.")}
        </p>
      ) : (
        <>
          <PanelCard title={t("En ce moment")}>
            <EnCeMoment suivi={suivi} maintenant={maintenant} />
          </PanelCard>

          {suivi.taches.length > 0 && (
            <PanelCard title={t("Tâches")} headerRight={<span className="text-xs tabular-nums">{`${faites}/${suivi.taches.length}`}</span>}>
              <Taches taches={suivi.taches} />
            </PanelCard>
          )}

          <PanelCard title={t("Actions")} headerRight={<span className="text-xs tabular-nums">{suivi.actions.length}</span>}>
            {suivi.actions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("Aucune action pour l'instant.")}</p>
            ) : (
              <Actions actions={suivi.actions} maintenant={maintenant} />
            )}
          </PanelCard>

          {suivi.fichiers.length > 0 && (
            <PanelCard title={t("Fichiers")} headerRight={<span className="text-xs tabular-nums">{suivi.fichiers.length}</span>}>
              <Fichiers fichiers={suivi.fichiers} dossier={dossier} />
            </PanelCard>
          )}

          {total && (
            <p className="px-1 text-xs text-muted-foreground">
              {suivi.fin !== undefined ? tf("Temps total : {0}", total) : tf("Temps écoulé : {0}", total)}
            </p>
          )}
        </>
      )}
    </aside>
  );
}

export default SuiviCodePanel;
