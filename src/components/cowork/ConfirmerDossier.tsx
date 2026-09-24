import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { t } from "@/lib/i18n";

/**
 * Confirmation du changement de dossier de travail, sur une instance partagée.
 *
 * Le dossier est commun à toute l'équipe : le changer déplace le périmètre de
 * tous les agents, de tout le monde, d'un coup. L'instance redemande donc le
 * mot de passe, comme pour le contrôle de l'écran. Sur un poste personnel,
 * cette fenêtre ne s'ouvre jamais : il n'y a personne d'autre à protéger.
 */
export function ConfirmerDossier({
  dossier,
  onAnnuler,
  onConfirmer,
}: {
  /** Chemin choisi, ou « poste » pour l'ouverture au poste entier. */
  dossier: string;
  onAnnuler: () => void;
  onConfirmer: (identite: { motDePasse: string; code?: string }) => Promise<{ ok: boolean }>;
}) {
  const poste = dossier === "poste";
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  const valider = async () => {
    setOccupe(true);
    setEchec(null);
    const r = await onConfirmer({ motDePasse, code: code.trim() || undefined });
    setOccupe(false);
    if (!r.ok) setEchec(t("Mot de passe ou code refusé."));
  };

  return (
    <Modal open onClose={onAnnuler} size="sm">
      <h2 className="text-lg font-semibold text-foreground">
        {poste ? t("Ouvrir tout votre poste à l'agent") : t("Changer le dossier de travail")}
      </h2>
      {poste ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("L'agent pourra lire et modifier vos documents et les disques que vous branchez, sans avoir à choisir un dossier à chaque fois. C'est un changement d'étendue, pas de dossier : on vous redemande votre mot de passe.")}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Cette instance est partagée. Le dossier est le même pour tous les agents de l'équipe : confirmez que c'est bien vous.")}
        </p>
      )}
      <InfoBox tone={poste ? "warning" : "muted"} className="mt-3">
        {poste ? (
          <>
            {t("Ce qui reste fermé : les dossiers du système. Ce qui vous protège ensuite : la barrière d'approbation, qui demande votre accord avant chaque modification. Vérifiez son réglage à côté du dossier, dans la barre du bas.")}
          </>
        ) : (
          <>{t("Nouveau dossier :")}{" "}{dossier}</>
        )}
      </InfoBox>
      <div className="mt-4 space-y-3">
        <Field label={t("Votre mot de passe")}>
          <Input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && motDePasse) void valider();
            }}
          />
        </Field>
        <Field label={t("Code de vérification (si la double authentification est active)")}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
      </div>
      {echec && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {echec}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onAnnuler}>
          {t("Annuler")}
        </Button>
        <Button disabled={occupe || !motDePasse} onClick={() => void valider()}>
          {occupe ? "Vérification…" : poste ? "Ouvrir tout mon poste" : t("Changer le dossier")}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmerDossier;
