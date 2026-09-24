import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  FileText,
  FolderOpen,
  Globe,
  Loader2,
  CircleAlert,
  Box,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useMcp } from "@/hooks/useMcp";
import { PreparerCowork } from "@/components/cowork/PreparerCowork";
import { Competences } from "@/components/cowork/Competences";
import { libelleOutil } from "@/lib/libellesOutils";
import { t } from "@/lib/i18n";
import { useComputer } from "@/hooks/useComputer";
import { ecranMachine } from "@/lib/machine";
import { Modal } from "@/components/ui/Modal";

/** Fichier touché par l'agent pendant la conversation. */
export interface TouchedFile {
  path: string;
  action: "lu" | "modifié" | "ajouté";
}

/**
 * L'action affichée sous chaque fichier. `TouchedFile.action` est une valeur
 * interne : affichée telle quelle, elle restait « lu », « ajouté » dans toutes
 * les langues.
 */
const LIBELLE_ACTION: Record<TouchedFile["action"], string> = {
  lu: t("Lu"),
  modifié: t("Modifié"),
  ajouté: t("Ajouté"),
};

/** Carte de section repliable du panneau droit. */
function PanelCard({
  title,
  headerRight,
  defaultOpen = true,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          {headerRight}
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={cn("transition-transform", !open && "-rotate-90")}
          />
        </span>
      </button>
      {open && <div className="px-3.5 pb-3.5 pt-0">{children}</div>}
    </section>
  );
}

/**
 * L'écran de la machine de l'agent, en direct.
 *
 * L'agent travaille sur son propre bureau : sans cette vue, la personne ne
 * voyait rien de ce qu'il faisait, seulement des cartes « Autoriser ». Une
 * image toutes les deux secondes, tant que la page est visible ; un clic
 * l'agrandit. Rien en mode « cet écran » : on ne rediffuse pas l'écran de la
 * personne à elle-même.
 */
function EcranMachine() {
  const { capability } = useComputer();
  const [image, setImage] = useState<string | null>(null);
  const [grand, setGrand] = useState(false);
  const actif = capability?.mode === "sandbox" && capability.disponible;

  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    let precedente: string | null = null;
    const rafraichir = async () => {
      if (document.hidden) return;
      const url = await ecranMachine();
      if (!vivant) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      setImage(url);
      if (precedente) URL.revokeObjectURL(precedente);
      precedente = url;
    };
    void rafraichir();
    const minuterie = window.setInterval(() => void rafraichir(), 2000);
    return () => {
      vivant = false;
      window.clearInterval(minuterie);
      if (precedente) URL.revokeObjectURL(precedente);
    };
  }, [actif]);

  if (capability?.mode !== "sandbox") return null;
  return (
    <PanelCard title={t("Machine de l'agent")} headerRight={<Box size={16} strokeWidth={1.75} />}>
      {!actif ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("La machine démarre, ou ne répond pas. Son état est dans Paramètres, rubrique Contrôle de l'écran.")}
        </p>
      ) : image ? (
        <>
          <button type="button" onClick={() => setGrand(true)} className="block w-full" aria-label={t("Agrandir l'écran de la machine")}>
            <img src={image} alt={t("Écran de la machine de l'agent")} className="w-full rounded-md border border-border" />
          </button>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("En direct. L'agent travaille ici, pas sur votre écran.")}
          </p>
          <Modal open={grand} onClose={() => setGrand(false)} size="xl">
            <img src={image} alt={t("Écran de la machine de l'agent")} className="w-full rounded-md" />
          </Modal>
        </>
      ) : (
        <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> {t("Chargement...")}
        </p>
      )}
    </PanelCard>
  );
}

/** Nom d'outil qualifié rendu lisible. */
const prettyTool = libelleOutil;

export function CoworkPanel({ files }: { files: TouchedFile[] }) {
  const { servers, toolCount, workspace, loading, error } = useMcp();
  const running = servers.filter((s) => s.running);

  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-background/60 p-3 pt-14">
      <EcranMachine />
      <PanelCard title={t("Fichiers")}>
        {files.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("Les fichiers lus, modifiés ou ajoutés apparaîtront ici.")}
          </p>
        ) : (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={`${f.action}-${f.path}`} className="flex items-start gap-2 text-sm">
                <FileText
                  size={14}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground" title={f.path}>
                    {f.path.split("/").pop()}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{LIBELLE_ACTION[f.action]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {workspace && (
          <p className="mt-2 truncate text-[11px] text-muted-foreground" title={workspace}>
            {t("Dossier :")}{" "}{workspace}
          </p>
        )}
      </PanelCard>

      <PanelCard
        title={t("Outils")}
        headerRight={
          <>
            <span className="text-xs">{toolCount}</span>
            <FolderOpen size={16} strokeWidth={1.75} />
          </>
        }
      >
        {loading ? (
          <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />{" "}{t("Chargement...")}
          </p>
        ) : error ? (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <CircleAlert size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
            {t("Moteur d'outils injoignable.")}
          </p>
        ) : running.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("Aucun outil actif.")}</p>
        ) : (
          <ul className="max-h-52 space-y-0.5 overflow-y-auto">
            {running.flatMap((s) =>
              // « outil » et non « t » : la traduction occupe déjà ce nom.
              s.tools.map((outil) => (
                <li
                  key={`${s.id}-${outil.name}`}
                  className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-foreground"
                  title={outil.description}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-70" />
                  <FileText size={15} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{prettyTool(outil.name)}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {t(s.label).toLowerCase()}
                  </span>
                </li>
              )),
            )}
          </ul>
        )}
      </PanelCard>

      {/*
        Les procédures de la maison, écrites en français par l'équipe
        (`competences.ts`). Une carte à part, et non mêlée aux outils ci-dessus :
        un outil est du code qui agit, une compétence est une manière de s'en
        servir. Les confondre était le défaut de l'ancien bouton, qui promettait
        de « créer une compétence » sous une liste d'outils MCP.
      */}
      <PanelCard title={t("Procédures")}>
        <Competences />
      </PanelCard>

      {/*
       * Placée après les compétences : c'est en constatant qu'il manque de quoi
       * faire un document qu'on comprend à quoi sert cette carte.
       */}
      <PreparerCowork />

      <PanelCard title={t("Connecteurs")}>
        {servers.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("Aucun connecteur.")}</p>
        ) : (
          <ul className="space-y-0.5">
            {servers.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-foreground"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    s.running ? "bg-success" : "bg-neutral-70",
                  )}
                />
                <Globe size={15} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{t(s.label)}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </aside>
  );
}

export default CoworkPanel;
