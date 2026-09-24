import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, MonitorOff, TriangleAlert, Check, Settings2 } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Popover } from "@/components/ui/Popover";
import { MODE_LABEL } from "@/lib/computer";
import { useComputer } from "@/hooks/useComputer";
import { branding } from "@/config/branding";
import { t, tf } from "@/lib/i18n";

/**
 * État réel du contrôle de l'écran, dans la barre de contexte de Cowork.
 *
 * Le contrôle dépend du profil de déploiement et d'autorisations macOS que
 * l'utilisateur seul peut accorder : mieux vaut le dire ici que laisser l'agent
 * échouer au premier clic.
 */
export function ScreenAccessChip({ modeleVoit = true }: { modeleVoit?: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { capability, refresh } = useComputer();
  if (!capability) return null;

  // Comme « Connecter votre messagerie » : le raccourci mène au réglage.
  const versReglages = (texte: string) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        navigate("/parametres/ecran");
      }}
      className="mx-1 mb-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Settings2 size={15} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
      {texte}
    </button>
  );
  const autorisationsManquantes =
    !capability.permissions.capture || !capability.permissions.controle || !capability.modeleEcran;

  const actif = capability.disponible;
  // Prêt côté machine, mais le modèle choisi ne voit pas : l'agent n'aura pas les outils d'écran.
  const sansVision = actif && !modeleVoit;
  const desactive = capability.mode === "desactive";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) refresh();
      }}
      align="start"
      width={330}
      trigger={(p) => (
        <Chip
          leading={
            actif ? (
              <Monitor size={15} strokeWidth={1.75} />
            ) : (
              <MonitorOff size={15} strokeWidth={1.75} />
            )
          }
          onClick={p.onClick}
          active={open}
          aria-expanded={p["aria-expanded"]}
        >
          {sansVision
            ? t("Écran : modèle sans vision")
            : actif
              ? tf("Écran : {0}", MODE_LABEL[capability.mode].toLowerCase())
              : t("Écran indisponible")}
        </Chip>
      )}
    >
      <p className="px-2.5 pb-1 pt-1 text-sm font-semibold text-foreground">
        {t("Contrôle de l'écran")}
      </p>

      {desactive ? (
        <>
          <p className="px-2.5 pb-2 text-xs leading-relaxed text-muted-foreground">
            {t("Désactivé. L'agent travaille sur vos fichiers, mais ne voit ni ne pilote l'écran.")}
            {!capability.modifiable && capability.raisonNonModifiable
              ? ` ${capability.raisonNonModifiable}`
              : ""}
          </p>
          {capability.modifiable && versReglages(t("Activer le contrôle de l'écran…"))}
        </>
      ) : (
        <>
          <p className="px-2.5 pb-2 text-xs leading-relaxed text-muted-foreground">
            {capability.mode === "sandbox"
              ? t("L'agent agit dans une machine virtuelle dédiée. Votre poste n'est jamais touché.")
              : t("L'agent voit et pilote cette machine : la souris, le clavier et les fenêtres réelles.")}
          </p>

          <div className="space-y-1 px-2.5 pb-2">
            <Ligne
              ok={capability.permissions.capture}
              texte={t("Voir l'écran")}
              manque={tf("Autorisez {0} dans Réglages Système > Confidentialité et sécurité > Enregistrement de l'écran.", branding.name)}
            />
            <Ligne
              ok={capability.permissions.controle}
              texte={t("Souris et clavier")}
              manque={tf("Autorisez {0} dans Réglages Système > Confidentialité et sécurité > Accessibilité.", branding.name)}
            />
            <Ligne
              ok={Boolean(capability.modeleEcran)}
              texte={t("Lecture de l'écran")}
              manque={t("Aucun modèle chargé ne sait lire une capture. Réglages > Contrôle de l'écran.")}
            />
            {capability.modeleEcran && (
              <Ligne
                ok={modeleVoit}
                texte={t("Modèle choisi")}
                manque={t("Il ne voit pas les images : l'agent n'aura pas accès à l'écran. Choisissez un modèle de vision (Qwen3-VL, par exemple) dans le sélecteur de modèle.")}
              />
            )}
          </div>

          {autorisationsManquantes && versReglages(t("Régler ce qui manque…"))}

          <p className="border-t border-border px-2.5 pb-1 pt-2 text-xs text-muted-foreground">
            {capability.approbationRequise
              ? t("Chaque action modifiante vous est soumise avant d'être exécutée.")
              : t("Approbation désactivée par l'administrateur : les actions partent sans confirmation.")}
          </p>
          {capability.modifiable && !autorisationsManquantes && versReglages(t("Réglages du contrôle de l'écran"))}
        </>
      )}
    </Popover>
  );
}

function Ligne({ ok, texte, manque }: { ok: boolean; texte: string; manque: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">
        {ok ? (
          <Check size={14} strokeWidth={2} className="text-success" />
        ) : (
          <TriangleAlert size={14} strokeWidth={1.75} className="text-warning" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{texte}</span>
        {!ok && <span className="block text-xs text-muted-foreground">{manque}</span>}
      </span>
    </div>
  );
}

export default ScreenAccessChip;
