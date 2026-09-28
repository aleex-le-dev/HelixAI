import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Copy, Check, KeyRound, TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { QrCode } from "@/components/ui/QrCode";
import { Card } from "@/components/settings/SettingsShell";
import { useUtilisateurCourant } from "@/lib/store/identity";
import { useFormats } from "@/lib/formats";
import {
  lireEtat,
  preparer,
  activer,
  desactiver,
  regenererCodes,
  adresseOtpauth,
  secretLisible,
  type EtatDeuxFacteurs,
} from "@/lib/deuxFacteurs";
import { t, tf } from "@/lib/i18n";
import { copierTexte } from "@/lib/pressePapiers";

/**
 * Authentification à deux facteurs : activation, codes de secours, retrait.
 *
 * L'activation se fait en trois temps, et le second facteur n'est exigé à la
 * connexion qu'au bout du troisième : mot de passe (une séance oubliée ouverte
 * ne suffit pas), QR code à scanner, premier code juste. Quelqu'un qui
 * abandonne à mi-chemin n'est donc jamais enfermé dehors.
 */

type Etape =
  | { nom: "repos" }
  | { nom: "motdepasse" }
  | { nom: "scanner"; secret: string }
  | { nom: "codes"; codes: string[] }
  | { nom: "retrait" }
  | { nom: "regenerer" };

/** Au-dessous, on prévient : il est temps d'en tirer une nouvelle série. */
const SEUIL_CODES = 3;

export function DeuxFacteurs() {
  const utilisateur = useUtilisateurCourant();
  const formats = useFormats();
  const [etat, setEtat] = useState<EtatDeuxFacteurs | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | undefined>();
  const [etape, setEtape] = useState<Etape>({ nom: "repos" });
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | undefined>();
  const [occupe, setOccupe] = useState(false);
  const [copie, setCopie] = useState(false);

  const charger = useCallback(() => {
    lireEtat()
      .then((e) => {
        setEtat(e);
        setErreurChargement(undefined);
      })
      .catch((err: unknown) =>
        setErreurChargement(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  useEffect(charger, [charger]);

  const aller = (suivante: Etape) => {
    setEtape(suivante);
    setMotDePasse("");
    setCode("");
    setErreur(undefined);
    setCopie(false);
  };

  const enTravail = async (travail: () => Promise<void>) => {
    setOccupe(true);
    setErreur(undefined);
    try {
      await travail();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setOccupe(false);
    }
  };

  const copier = async (codes: string[]) => {
    // lib/pressePapiers (27/09/2026) : dans l'application de bureau, `navigator.clipboard` était toujours refusé.
    if (await copierTexte(codes.join("\n"))) {
      setCopie(true);
    } else {
      setCopie(false);
      setErreur(t("La copie a échoué : recopiez les codes à la main."));
    }
  };

  if (erreurChargement) {
    return (
      <Card>
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreurChargement}
        </InfoBox>
      </Card>
    );
  }
  if (!etat) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">{t("Chargement…")}</p>
      </Card>
    );
  }

  const champMotDePasse = (
    <Field label={t("Votre mot de passe")}>
      <Input
        type="password"
        value={motDePasse}
        autoFocus
        autoComplete="current-password"
        onChange={(e) => setMotDePasse(e.target.value)}
      />
    </Field>
  );

  const champCode = (aide: string, valider: () => void, autoFocus = false) => (
    <Field label={t("Code de vérification")} hint={aide}>
      <Input
        value={code}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={32}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") valider();
        }}
      />
    </Field>
  );

  const messageErreur = erreur && (
    <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
      {erreur}
    </InfoBox>
  );

  const annuler = (
    <Button variant="ghost" onClick={() => aller({ nom: "repos" })} disabled={occupe}>
      {t("Annuler")}
    </Button>
  );

  /* ---- Codes de secours, montrés une seule fois ---- */
  if (etape.nom === "codes") {
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound size={18} strokeWidth={1.75} className="text-foreground" />
          <p className="font-medium text-foreground">{t("Vos codes de secours")}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Chacun ouvre votre compte une fois, si vous n'avez plus votre téléphone. Ils ne seront plus jamais affichés : imprimez-les ou rangez-les dans votre gestionnaire de mots de passe, pas sur ce poste en clair.")}
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-4 font-mono text-sm text-foreground">
          {etape.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {messageErreur}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={copie ? Check : Copy}
            onClick={() => void copier(etape.codes)}
          >
            {copie ? t("Copiés") : t("Copier les codes")}
          </Button>
          <Button
            icon={Check}
            onClick={() => {
              aller({ nom: "repos" });
              charger();
            }}
          >
            {t("J'ai mis mes codes à l'abri")}
          </Button>
        </div>
      </Card>
    );
  }

  /* ---- Activation ---- */
  if (!etat.active) {
    if (etape.nom === "motdepasse") {
      const suivant = () =>
        void enTravail(async () => {
          if (!motDePasse) return;
          const { secret } = await preparer(motDePasse);
          aller({ nom: "scanner", secret });
        });
      return (
        <Card className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("Pour commencer, confirmez que c'est bien vous.")}
          </p>
          <div onKeyDown={(e) => e.key === "Enter" && suivant()}>{champMotDePasse}</div>
          {messageErreur}
          <div className="flex gap-2">
            <Button icon={ShieldCheck} onClick={suivant} disabled={occupe || !motDePasse}>
              {t("Continuer")}
            </Button>
            {annuler}
          </div>
        </Card>
      );
    }

    if (etape.nom === "scanner") {
      const valider = () =>
        void enTravail(async () => {
          if (!code.trim()) return;
          const { codesDeSecours } = await activer(code.trim());
          aller({ nom: "codes", codes: codesDeSecours });
        });
      return (
        <Card className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("Scannez ce code avec votre application d'authentification (Aegis, 2FAS, Mots de passe d'Apple, Google Authenticator ou toute autre application compatible), puis saisissez les six chiffres qu'elle affiche.")}
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <QrCode
              valeur={adresseOtpauth(etape.secret, utilisateur.email)}
              titre={t("QR code à scanner avec l'application d'authentification")}
              className="shrink-0 border border-border"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">{t("Pas d'appareil photo ? Saisissez cette clé :")}</p>
              <p className="break-all font-mono text-sm text-foreground">{secretLisible(etape.secret)}</p>
              <p className="text-xs text-muted-foreground">
                {t("Type : basé sur le temps, six chiffres, trente secondes.")}
              </p>
            </div>
          </div>
          {champCode(t("Si le code est refusé, vérifiez que l'heure du téléphone est réglée automatiquement."), valider, true)}
          {messageErreur}
          <div className="flex gap-2">
            <Button icon={ShieldCheck} onClick={valider} disabled={occupe || !code.trim()}>
              {t("Activer")}
            </Button>
            {annuler}
          </div>
        </Card>
      );
    }

    return (
      <Card className="space-y-4">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
            <ShieldOff size={20} strokeWidth={1.75} className="text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">{t("Application d'authentification")}</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("Désactivée")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Après le mot de passe, un code à six chiffres affiché par votre téléphone sera demandé. Un mot de passe deviné ou volé ne suffira plus.")}
            </p>
          </div>
        </div>
        <Button icon={ShieldCheck} onClick={() => aller({ nom: "motdepasse" })}>
          {t("Activer")}
        </Button>
      </Card>
    );
  }

  /* ---- Active : retrait ou nouvelle série de codes ---- */
  if (etape.nom === "retrait" || etape.nom === "regenerer") {
    const retrait = etape.nom === "retrait";
    const valider = () =>
      void enTravail(async () => {
        if (!motDePasse || !code.trim()) return;
        if (retrait) {
          await desactiver(motDePasse, code.trim());
          aller({ nom: "repos" });
          charger();
        } else {
          const { codesDeSecours } = await regenererCodes(motDePasse, code.trim());
          aller({ nom: "codes", codes: codesDeSecours });
        }
      });
    return (
      <Card className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {retrait
            ? t("Le retrait ne demandera plus que le mot de passe à la connexion. Confirmez avec votre mot de passe et un code.")
            : t("Une nouvelle série remplace l'ancienne, qui cesse aussitôt de fonctionner.")}
        </p>
        {champMotDePasse}
        {champCode(t("Celui de l'application, ou un code de secours."), valider)}
        {messageErreur}
        <div className="flex gap-2">
          <Button
            variant={retrait ? "destructive" : "primary"}
            icon={retrait ? ShieldOff : RefreshCw}
            onClick={valider}
            disabled={occupe || !motDePasse || !code.trim()}
          >
            {retrait ? t("Désactiver") : t("Générer de nouveaux codes")}
          </Button>
          {annuler}
        </div>
      </Card>
    );
  }

  const restants = etat.codesDeSecoursRestants ?? 0;
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
          <ShieldCheck size={20} strokeWidth={1.75} className="text-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{t("Application d'authentification")}</p>
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {t("Activée")}
            </span>
            {etat.obligatoire && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("Imposée par votre instance")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {etat.activeLe ? tf("Depuis le {0}. ", formats.date(etat.activeLe)) : ""}
            {restants > 1
              ? tf("{0} codes de secours restants.", restants)
              : restants === 1
                ? t("1 code de secours restant.")
                : t("Plus aucun code de secours.")}
          </p>
        </div>
      </div>
      {restants <= SEUIL_CODES && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {t("Il vous reste peu de codes de secours. Générez-en une nouvelle série pour ne pas dépendre de votre seul téléphone.")}
        </InfoBox>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={RefreshCw} onClick={() => aller({ nom: "regenerer" })}>
          {t("Nouveaux codes de secours")}
        </Button>
        {/* Instance qui l'impose : la passerelle refuserait, l'écran ne le propose pas. */}
        {!etat.obligatoire && (
          <Button variant="ghost" icon={ShieldOff} onClick={() => aller({ nom: "retrait" })}>
            {t("Désactiver")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Téléphone et codes perdus : l'administrateur du poste peut retirer le second facteur avec l'outil de récupération de l'instance, sur le poste qui l'héberge.")}
      </p>
    </Card>
  );
}

export default DeuxFacteurs;
