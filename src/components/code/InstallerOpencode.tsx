import { useEffect, useRef, useState } from "react";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { branding } from "@/config/branding";
import { fetchCodeStatus, installerOpencode, type CodeStatus } from "@/lib/code";
import { t, tf } from "@/lib/i18n";
import { plateformePoste } from "@/lib/plateforme";

/**
 * L'écran Code sans son moteur : Helix pose OpenCode lui-même (demandé par
 * Medhi le 27/09/2026, « tout s'installe seul »). Version épinglée, empreinte
 * vérifiée (gateway/src/opencodePrive.ts). La commande manuelle reste dite,
 * pour qui préfère, ou pour un système que Helix ne sait pas équiper.
 */
export function InstallerOpencode({ status, onPret }: { status: CodeStatus; onPret: () => void }) {
  const [etat, setEtat] = useState(status);
  const [refus, setRefus] = useState<string | null>(null);
  const enCours = Boolean(etat.installation?.enCours);
  // Par une référence : un rappel neuf à chaque rendu relançait la minuterie.
  const pret = useRef(onPret);
  pret.current = onPret;

  // Pendant l'installation, l'état est relu toutes les deux secondes.
  useEffect(() => {
    if (!enCours) return;
    const minuterie = setInterval(() => {
      void fetchCodeStatus()
        .then((s) => {
          setEtat(s);
          if (s.available) pret.current();
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(minuterie);
  }, [enCours]);

  const lancer = async () => {
    setRefus(null);
    const message = await installerOpencode().catch((err: unknown) => (err instanceof Error ? err.message : String(err)));
    if (message) {
      setRefus(message);
      return;
    }
    setEtat((e) => ({ ...e, installation: { enCours: true, pourcent: 0, erreur: null } }));
  };

  const erreur = refus ?? (enCours ? null : etat.installation?.erreur ?? null);
  const commande = plateformePoste() === "win32" ? t("npm install -g opencode-ai") : t("curl -fsSL https://opencode.ai/install | bash");

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      {etat.installable === false ? (
        <p className="text-sm text-muted-foreground">{etat.raisonNonInstallable}</p>
      ) : enCours ? (
        <div className="w-full">
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {tf("Installation d'OpenCode... {0} %", etat.installation?.pourcent ?? 0)}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${etat.installation?.pourcent ?? 0}%` }} />
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {branding.name}{" "}{t("l'installe lui-même : OpenCode (licence MIT), version épinglée, empreinte vérifiée, environ 60 Mo, pour ce compte seulement.")}
          </p>
          <Button icon={Download} onClick={() => void lancer()}>
            {t("Installer OpenCode")}
          </Button>
        </>
      )}
      {erreur && (
        <InfoBox tone="warning" className="w-full text-left" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}
      <p className="text-xs text-muted-foreground">
        {t("Ou à la main, dans un terminal :")}{" "}<code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{commande}</code>
      </p>
    </div>
  );
}

export default InstallerOpencode;
