import { useState } from "react";
import { Check, Loader2, ShieldAlert } from "lucide-react";
import { enregistrerClientGoogle, type EtatClientGoogle } from "@/lib/google";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { GuideApplication } from "@/components/settings/GuideApplication";
import { guideGoogle } from "@/lib/guidesApplications";
import { t, tf } from "@/lib/i18n";

/**
 * L'application Google de l'instance, saisie une fois pour tous les services
 * Google (gateway/src/clientGoogle.ts) : Gmail, Agenda, Drive, Sheets, Slides,
 * Docs, Forms et YouTube. Aucun identifiant Google n'est livré avec le
 * produit : chaque organisation crée le sien. L'écran dit comment, étape par
 * étape, et ne propose de bouton « Se connecter » qu'une fois l'application
 * enregistrée.
 *
 * 28/09/2026 (Medhi : « il n'y a pas la redirection vers où je dois aller pour
 * créer l'appli ») : les étapes renvoyaient à la page d'accueil de la console
 * Google Cloud, à charge de trouver « API et services » puis le reste. Elles
 * ouvrent maintenant chaque page où l'on agit (projet, activation des API d'un
 * coup, Google Auth Platform, création du client), dans l'ordre de la console
 * (lib/guidesApplications.ts, `guideGoogle`, sources citées).
 */
export function FormulaireClientGoogle({
  etat,
  api,
  onEnregistre,
}: {
  etat: EtatClientGoogle | null;
  /** L'API dont se sert le service qui affiche ce formulaire : « Google Calendar API », « Google Drive API ». */
  api: string;
  onEnregistre: () => void;
}) {
  const [identifiant, setIdentifiant] = useState("");
  const [secret, setSecret] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const guide = guideGoogle();

  const valider = async () => {
    setEnCours(true);
    setErreur(null);
    const r = await enregistrerClientGoogle(identifiant.trim(), secret.trim());
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    setSucces(r.message);
    setSecret("");
    onEnregistre();
  };

  return (
    <div className="space-y-3">
      <GuideApplication guide={guide} titre={t("Une fois pour toute l'instance : déclarer une application Google")} />
      {api && <p className="text-xs text-muted-foreground">{tf("Ce service se sert de « {0} », activée avec les autres par le bouton « Ouvrir l'activation des API Google ».", api)}</p>}

      {etat?.modifiable === false ? (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Seul l'administrateur de l'instance peut enregistrer l'application Google. Transmettez-lui ces étapes.")}
        </InfoBox>
      ) : (
        <>
          <Field label={t("Identifiant de l'application (client ID)")} hint={guide.champs?.identifiant}>
            <Input placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={t("Code secret de l'application")} hint={`${guide.champs?.secret ?? ""} ${t("Gardé chiffré sur l'instance, il n'en ressort jamais.")}`}>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          {erreur && (
            <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
              {erreur}
            </InfoBox>
          )}
          {succes && <InfoBox leading={<Check size={15} strokeWidth={1.75} />}>{succes}</InfoBox>}
          <div className="flex justify-end">
            <Button size="sm" icon={enCours ? Loader2 : Check} disabled={enCours || !identifiant.trim()} onClick={() => void valider()}>
              {t("Enregistrer l'application Google")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
