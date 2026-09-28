import { useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { enregistrerClientGoogle, type EtatClientGoogle } from "@/lib/google";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { t, tf } from "@/lib/i18n";

/**
 * L'application Google de l'instance, saisie une fois pour Drive et Agenda
 * (gateway/src/clientGoogle.ts). Aucun identifiant Google n'est livré avec le
 * produit : chaque organisation crée le sien. L'écran dit comment, étape par
 * étape, et ne propose de bouton « Se connecter » qu'une fois l'application
 * enregistrée.
 *
 * Les étapes décrivent la console Google Cloud telle qu'elle se présentait le
 * 26/09/2026 ; ses libellés changent de temps en temps, et l'écran le dit.
 */
export function FormulaireClientGoogle({
  etat,
  api,
  onEnregistre,
}: {
  etat: EtatClientGoogle | null;
  /** L'API à activer dans le projet : « Google Calendar API », « Google Drive API ». */
  api: string;
  onEnregistre: () => void;
}) {
  const [identifiant, setIdentifiant] = useState("");
  const [secret, setSecret] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

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
      <InfoBox leading={<KeyRound size={15} strokeWidth={1.75} />}>
        <p className="font-medium">{t("Une fois pour toute l'instance : déclarer une application Google")}</p>
        <p className="mt-1">{t("Google n'ouvre ses services qu'à une application déclarée dans sa console. Aucune n'est livrée avec ce logiciel : chaque organisation crée la sienne (dix minutes), et elle sert ensuite à Google Agenda comme à Google Drive.")}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")}{" "}
            <a className="underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer noopener">
              console.cloud.google.com <ExternalLink size={11} className="inline" />
            </a>
            {t(", créez un projet (par exemple « Helix »).")}
          </li>
          <li>{tf("« API et services », puis « Bibliothèque » : cherchez « {0} » et activez-la.", api)}</li>
          <li>{t("« Écran de consentement OAuth » (ou « Google Auth Platform ») : type « Externe », un nom d'application et votre adresse. Dans « Audience », ajoutez votre adresse comme utilisateur, puis « Publier l'application » : en mode « Test », Google redemande la connexion chaque semaine.")}</li>
          <li>{t("« Clients », puis « Créer un client » : type « Application de bureau ». Google affiche un identifiant, qui se termine par « .apps.googleusercontent.com », et un code secret. Recopiez-les ci-dessous.")}</li>
        </ol>
        <p className="mt-2 text-xs">{t("À la connexion, Google affichera « Google n'a pas validé cette application » : c'est normal pour une application qui ne sert qu'à votre organisation. Choisissez « Continuer ». Les libellés de la console Google changent parfois : cherchez l'équivalent.")}</p>
      </InfoBox>

      {etat?.modifiable === false ? (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Seul l'administrateur de l'instance peut enregistrer l'application Google. Transmettez-lui ces étapes.")}
        </InfoBox>
      ) : (
        <>
          <Field label={t("Identifiant de l'application (client ID)")}>
            <Input placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={t("Code secret de l'application")} hint={t("Gardé chiffré sur l'instance, il n'en ressort jamais.")}>
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
