import { useState } from "react";
import {
  Download,
  Cpu,
  HardDrive,
  Check,
  TriangleAlert,
  Loader2,
  ServerCrash,
  RefreshCw,
} from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { branding } from "@/config/branding";
import { useProvision } from "@/hooks/useProvision";
import { isDesktopApp } from "@/lib/instance";
import { cn } from "@/lib/cn";
import { t, tf } from "@/lib/i18n";

/**
 * Première mise en route : aucun modèle n'est disponible.
 * La machine est profilée, un modèle adapté est proposé, installé et chargé
 * sans que l'utilisateur ait à comprendre ce qui se passe (ADR-009).
 */
export function FirstRun({ onReady }: { onReady: () => void }) {
  const { status, state, unreachable, start, installerMoteur, refresh } = useProvision();
  const [conditions, setConditions] = useState(false);

  const busy =
    state.phase === "checking" ||
    state.phase === "downloading" ||
    state.phase === "loading";

  if (unreachable) {
    return (
      <Shell>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <ServerCrash size={26} strokeWidth={1.5} className="text-muted-foreground" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("Moteur indisponible")}
        </h1>
        {isDesktopApp() ? (
          <>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("Le moteur de")}{" "}{branding.name}{" "}{t("ne répond pas. Il est relancé automatiquement : patientez quelques secondes, puis réessayez.")}
            </p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              {t("S'il ne revient pas, c'est le plus souvent qu'un autre")}{" "}{branding.name}{" "}{t("est déjà ouvert sur cette machine, ou qu'un programme occupe son port. Fermez l'autre fenêtre, puis réessayez.")}
            </p>
            <Button icon={RefreshCw} onClick={() => window.location.reload()}>
              {t("Réessayer")}
            </Button>
          </>
        ) : (
          <>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("Le service")}{" "}{branding.name}{" "}{t("n'est pas joignable à cette adresse. Vérifiez qu'il est démarré, puis rechargez la page.")}
            </p>
            <code className="rounded-lg bg-muted px-3 py-1.5 text-xs text-foreground">
              {t("npm run gateway")}
            </code>
          </>
        )}
      </Shell>
    );
  }

  if (!status) {
    return (
      <Shell>
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("Analyse de votre machine...")}</p>
      </Shell>
    );
  }

  // Poste piloté par l'intégrateur : rien à installer d'ici (revue du 27/09/2026).
  if (status.managed) {
    return (
      <Shell>
        <LogoMark size={52} animated />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{branding.name}</h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {t("Sur ce poste, les modèles sont préparés par l'intégrateur, et aucun n'est encore disponible. Contactez la personne qui a installé ce poste.")}
        </p>
        <Button icon={RefreshCw} variant="ghost" onClick={refresh}>
          {t("Vérifier à nouveau")}
        </Button>
      </Shell>
    );
  }

  /*
   * Sans moteur d'exécution, il n'y a aucun modèle à télécharger : c'est la
   * première chose à mettre en place. Helix s'en charge — demander à
   * l'utilisateur d'aller chercher un logiciel tiers, c'est là que la plupart
   * des installations s'arrêtent.
   */
  if (!status.moteurInstalle) {
    return (
      <Shell>
        <LogoMark size={52} animated />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("Préparation de")}{" "}{branding.name}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {t("Il manque le moteur qui fait tourner les modèles : LM Studio, d'Element Labs.")}
          {" "}{branding.name}{" "}{t("l'installe lui-même : rien à télécharger ni à glisser. Comptez quelques minutes selon votre connexion (0,3 à 1,3 Go selon le système). Les modèles tournent ensuite sur cette machine, sans rien envoyer à l'éditeur.")}
        </p>

        {busy || state.phase === "ready" ? (
          <div className="mt-2 w-full max-w-md">
            <div className="flex items-center gap-2 text-sm">
              {state.phase === "ready" ? (
                <Check size={15} strokeWidth={2.5} className="shrink-0 text-success" />
              ) : (
                <Loader2 size={15} className="shrink-0 animate-spin text-muted-foreground" />
              )}
              <span className="text-muted-foreground">{state.message}</span>
            </div>
            {typeof state.percent === "number" && state.phase === "downloading" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${state.percent}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-3">
            <label className="flex items-start gap-2 text-left text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={conditions}
                onChange={(e) => setConditions(e.target.checked)}
              />
              <span>
                {t("J'accepte, pour moi ou au nom de mon organisation, les")}{" "}
                <a
                  href="https://lmstudio.ai/app-terms"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2"
                >
                  {t("conditions d'utilisation de LM Studio")}
                </a>
                {t(", qui en permettent l'usage personnel et interne, pas un service fourni à d'autres.")}
              </span>
            </label>
            <Button icon={Download} disabled={!conditions} onClick={() => void installerMoteur()}>
              {t("Installer le moteur")}
            </Button>
          </div>
        )}

        {state.phase === "error" && (
          <InfoBox
            tone="warning"
            className="mt-2 w-full max-w-md text-left"
            leading={<TriangleAlert size={15} strokeWidth={1.75} />}
          >
            <p className="font-medium text-foreground">{state.message}</p>
            {state.error && (
              <p className="mt-1 text-xs text-muted-foreground">{state.error}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Vous pouvez aussi l'installer vous-même depuis")}{" "}
              <a
                href="https://lmstudio.ai/download"
                target="_blank"
                rel="noreferrer noopener"
                className="underline"
              >
                lmstudio.ai
              </a>
              {t(", l'ouvrir une fois, puis revenir ici.")}
            </p>
            <Button className="mt-2" size="sm" variant="ghost" icon={RefreshCw} onClick={refresh}>
              {t("Vérifier à nouveau")}
            </Button>
          </InfoBox>
        )}

        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          {t("Le paquet vient de l'éditeur, et son empreinte est vérifiée avant installation. Vous n'aurez jamais à le lancer vous-même :")}{" "}{branding.name}{" "}{t("le démarre quand il en a besoin et, en partant, décharge les modèles qu'il a chargés.")}
        </p>
      </Shell>
    );
  }

  const { hardware, recommended } = status;
  /*
   * « Prêt » sans modèle de Chat (modèle d'écran installé depuis les
   * réglages, modèle retiré depuis) : « Commencer » ne menait nulle part.
   * L'écran repropose alors l'installation (revue du 27/09/2026).
   */
  const pret = state.phase === "ready" && status.hasChatModel;

  return (
    <Shell>
      <LogoMark size={52} animated />
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {t("Bienvenue dans")}{" "}{branding.name}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {branding.name}{" "}{t("fonctionne entièrement sur votre machine. Nous allons installer un modèle adapté à votre matériel. Vos données ne quittent pas cet ordinateur.")}
      </p>

      {/* Profil machine */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
          <Cpu size={13} strokeWidth={1.75} />
          {hardware.appleSilicon ? "Apple Silicon" : hardware.arch}
          {" · "}
          {hardware.cpuCount}{" "}{t("cœurs")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
          <HardDrive size={13} strokeWidth={1.75} />
          {hardware.totalMemoryGb}{" "}{t("Go de mémoire")}
        </span>
      </div>

      {/* Modèle recommandé */}
      <div className="mt-4 w-full max-w-md rounded-2xl border border-border bg-card p-4 text-left">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Recommandé pour votre machine")}
        </p>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="font-medium text-foreground">{recommended.label}</span>
          <span className="text-xs text-muted-foreground">
            {tf("environ {0} Go", recommended.downloadGb)}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{recommended.description}</p>
        {recommended.verifie === false && (
          <p className="mt-1 text-xs text-muted-foreground">
            {tf("Pas encore essayé avec {0} : s'il ne se charge pas, un autre modèle adapté à la machine prend le relais.", branding.name)}
          </p>
        )}

        {/* Progression */}
        {(busy || pret) && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-sm">
              {pret ? (
                <Check size={15} strokeWidth={2.5} className="shrink-0 text-success" />
              ) : (
                <Loader2 size={15} className="shrink-0 animate-spin text-muted-foreground" />
              )}
              <span className={cn(pret ? "text-foreground" : "text-muted-foreground")}>
                {state.message}
              </span>
            </div>
            {typeof state.percent === "number" && state.phase === "downloading" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${state.percent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {state.phase === "error" && (
          <InfoBox tone="warning" className="mt-4" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
            <p className="font-medium text-foreground">{state.message}</p>
            {state.error && (
              <p className="mt-1 max-h-24 overflow-auto text-xs text-muted-foreground">
                {state.error}
              </p>
            )}
          </InfoBox>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {pret ? (
          <Button icon={Check} onClick={onReady}>
            {t("Commencer")}
          </Button>
        ) : (
          <Button icon={Download} disabled={busy} onClick={() => start()}>
            {busy ? t("Installation en cours...") : t("Installer et démarrer")}
          </Button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  );
}

export default FirstRun;
