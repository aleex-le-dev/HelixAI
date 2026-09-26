import { useEffect, useState } from "react";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { branding } from "@/config/branding";
import { t, tf } from "@/lib/i18n";

/**
 * La fenêtre « Nouvelle version » : un clic, et l'application se met à jour.
 *
 * Décidé par Medhi le 26/09/2026 : pas de mise à jour automatique (il faudrait
 * un certificat Apple et un serveur), mais une fenêtre qui propose d'installer.
 * La version vient de l'instance à laquelle ce poste est rattaché (ou du
 * serveur de l'agence s'il est configuré) ; l'installation est faite par le
 * processus principal (electron/miseAJour.cjs), qui vérifie l'empreinte de
 * l'archive avant de remplacer l'application. « Plus tard » ne la remontre plus
 * pour cette version ; les Paramètres (Préférences, Mise à jour) la gardent.
 */

interface EtatMaj {
  phase: string;
  versionInstallee: string;
  versionDisponible: string | null;
  pourcent: number | null;
  automatique: boolean;
  message: string | null;
}
interface Pont {
  etat: () => Promise<EtatMaj>;
  installer: () => Promise<boolean>;
  surChangement: (rappel: (e: EtatMaj) => void) => () => void;
}

const pont = (): Pont | undefined => (window as unknown as { helix?: { miseAJour?: Pont } }).helix?.miseAJour;
const CLE = "helix:maj-plus-tard";

function repoussee(version: string): boolean {
  try {
    return localStorage.getItem(CLE) === version;
  } catch {
    return false;
  }
}

export function FenetreMiseAJour() {
  const api = pont();
  const [etat, setEtat] = useState<EtatMaj | null>(null);
  const [installation, setInstallation] = useState(false);
  const [fermee, setFermee] = useState(false);

  useEffect(() => {
    if (!api) return;
    void api.etat().then(setEtat).catch(() => undefined);
    return api.surChangement(setEtat);
  }, [api]);

  if (!api || !etat || !etat.versionDisponible) return null;
  const version = etat.versionDisponible;
  const aProposer = etat.phase === "disponible" || (etat.phase === "prete" && etat.automatique);
  const enCours = installation && (etat.phase === "telechargement" || etat.phase === "prete");
  const echec = installation && etat.phase === "erreur";
  if (!enCours && !echec && (!aProposer || fermee || repoussee(version))) return null;

  const plusTard = () => {
    try {
      localStorage.setItem(CLE, version);
    } catch {
      /* stockage refusé : elle reviendra au prochain lancement */
    }
    setFermee(true);
  };

  return (
    <Modal open onClose={enCours ? () => undefined : plusTard} size="sm">
      <div className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{tf("{0} {1} est disponible", branding.name, version)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tf("Vous avez la version {0}. L'installation télécharge la nouvelle depuis votre instance, vérifie qu'elle est intacte, puis ferme et rouvre l'application. Vos Chats et vos réglages restent en place.", etat.versionInstallee)}
          </p>
        </div>
        {enCours && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Loader2 size={14} className="animate-spin" />
              {etat.phase === "prete" ? t("Installation : l'application va se fermer et se rouvrir.") : tf("Téléchargement : {0} %", etat.pourcent ?? 0)}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${etat.pourcent ?? 0}%` }} />
            </div>
          </div>
        )}
        {echec && (
          <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
            {etat.message ?? t("L'installation n'a pas abouti.")}
          </InfoBox>
        )}
        {!enCours && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={plusTard}>
              {t("Plus tard")}
            </Button>
            <Button
              icon={Download}
              onClick={() => {
                setInstallation(true);
                void api.installer().then((ok) => {
                  if (!ok) setInstallation(false);
                });
              }}
            >
              {echec ? t("Réessayer") : t("Installer maintenant")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default FenetreMiseAJour;
