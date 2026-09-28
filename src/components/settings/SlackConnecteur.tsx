import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Info, Loader2, Lock, MessageSquare, ShieldAlert, Trash2 } from "lucide-react";
import {
  etat as lireEtat,
  configurer,
  oublier,
  manifeste,
  nomDeBot,
  type EtatSlack,
} from "@/lib/slack";
import { LogoMarque } from "@/components/settings/TuileService";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { branding } from "@/config/branding";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";
import { copierTexte } from "@/lib/pressePapiers";
import { guideApplication } from "@/lib/guidesApplications";

/**
 * Connecteur Slack.
 *
 * La voie retenue est expliquée dans gateway/src/slack.ts : une application
 * créée par l'entreprise dans son propre espace, et son jeton de bot. L'écran
 * la rend faisable sans connaître Slack : le manifeste est prêt à coller, et
 * chaque étape nomme le bouton exact. La contrainte qui surprend (l'application
 * ne lit que les salons où on l'a invitée) est dite avant, pas découverte après.
 *
 * Rien n'est affiché comme branché tant que l'instance n'a pas essayé le jeton
 * et relu ses autorisations : un jeton qui permettrait d'écrire est refusé, et
 * l'écran en donne la raison.
 */

export function SlackConnecteur({ onChange }: { onChange?: () => void } = {}) {
  const [etat, setEtat] = useState<EtatSlack | null | undefined>(undefined);
  const [jeton, setJeton] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [retrait, setRetrait] = useState(false);
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    void lireEtat().then((e) => {
      if (vivant) setEtat(e);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const texteManifeste = useMemo(
    () => manifeste(branding.name, etat?.portees ?? []),
    [etat?.portees],
  );
  const bot = etat?.application || nomDeBot(branding.name);
  const guideSlack = guideApplication("slack", { manifeste: texteManifeste });

  const copier = async () => {
    // lib/pressePapiers (27/09/2026) : dans l'application de bureau, `navigator.clipboard` était toujours refusé.
    if (await copierTexte(texteManifeste)) {
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } else {
      setCopie(false);
      setErreur(t("La copie a échoué : sélectionnez le manifeste à la main."));
    }
  };

  const soumettre = async () => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const r = await configurer(jeton.trim());
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    // Le jeton ne reste pas dans l'onglet une fois accepté.
    setJeton("");
    setSucces(r.message);
    setEtat(await lireEtat());
    onChange?.();
  };

  const debrancher = async () => {
    setRetrait(true);
    setErreur(null);
    setSucces(null);
    const r = await oublier();
    setRetrait(false);
    if (!r.ok) setErreur(r.message);
    else setSucces(r.message);
    setEtat(await lireEtat());
    onChange?.();
  };

  if (etat === undefined) {
    return (
      <Card className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
        {t("Lecture de l'état du connecteur…")}
      </Card>
    );
  }
  if (etat === null) {
    return (
      <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
        {t("L'instance")}{" "}{branding.name}{" "}{t("ne répond pas. Slack se branche depuis cet écran dès qu'elle est joignable.")}
      </InfoBox>
    );
  }

  const messages = (
    <>
      {erreur && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}
      {succes && <InfoBox leading={<Check size={15} strokeWidth={1.75} />}>{succes}</InfoBox>}
    </>
  );

  /* --------------------------------- branché --------------------------------- */
  if (etat.configure) {
    const depuis = etat.depuis ? new Date(etat.depuis) : null;
    return (
      <div className="space-y-3">
        <Card className="flex items-start gap-3">
          {/* Le logo de Slack (troisième tournée des logos, 28/09/2026) ; gap-3 : 12 px libres autour. */}
          <span className="mt-0.5 flex shrink-0">
            <LogoMarque marque="slack" taille={20} degagement={12} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{t("Espace «")}{" "}{etat.espace} »</p>
            <p className="truncate text-sm text-muted-foreground">
              {t("Application @")}{etat.application}
              {depuis && !Number.isNaN(depuis.getTime()) ? tf(", connectée le {0}", formaterDate(depuis)) : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
            {t("Connecté")}
          </span>
        </Card>

        <InfoBox leading={<Lock size={15} strokeWidth={1.75} />}>
          {t("Lecture seule. Vos agents lisent les messages des salons où l'application a été invitée, et rien d'autre : ni messages privés, ni autres salons. Ils ne peuvent ni écrire, ni réagir, ni supprimer. Pour ouvrir un salon aux agents, un membre y tape « /invite @")}{etat.application}{" "}{t("» dans Slack ; pour le fermer, il en retire l'application.")}
        </InfoBox>
        <InfoBox tone="muted" leading={<Info size={15} strokeWidth={1.75} />}>
          {t("Slack est branché pour toute l'instance : chaque compte")}{" "}{branding.name}{" "}{t("peut faire lire ces salons à ses agents. Le jeton est conservé chiffré sur l'instance et n'est transmis qu'à Slack.")}
        </InfoBox>

        {messages}

        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            icon={retrait ? Loader2 : Trash2}
            disabled={retrait}
            onClick={() => void debrancher()}
          >
            {retrait ? t("Débranchement…") : t("Débrancher Slack")}
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------ à brancher, ou à reconnecter ---------------------- */
  return (
    <div className="space-y-3">
      {!etat.chiffrementDonnees && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Le chiffrement des données n'est pas actif sur cette instance.")}{" "}{branding.name}{" "}
          {t("refusera d'enregistrer un jeton Slack tant que ce sera le cas.")}
        </InfoBox>
      )}
      {etat.aReconnecter && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Slack refuse le jeton enregistré pour l'espace «")}{" "}{etat.espace}{" "}{t("» : il a été régénéré, ou l'application a été désinstallée. Vos agents n'ont plus accès à Slack. Collez un nouveau jeton ci-dessous, ou débranchez Slack.")}
        </InfoBox>
      )}

      <Card className="space-y-3 text-sm text-foreground">
        <p className="font-medium">{t("Créer l'application Slack de votre entreprise")}</p>
        <p className="text-muted-foreground">
          {t("Cinq minutes, avec un compte autorisé à installer des applications dans votre espace Slack. L'application reste la vôtre :")}{" "}{branding.name}{" "}{t("lit Slack directement, sans intermédiaire.")}
        </p>
        {/*
         * 28/09/2026 (Medhi : « tout doit être simple, pour tout ») : un bouton qui ouvre
         * la création d'application de Slack avec ce manifeste déjà rempli
         * (`?new_app=1&manifest_json=…`, https://docs.slack.dev/app-manifests/configuring-apps-with-app-manifests/,
         * lu le 28/09/2026). Il ne reste qu'à choisir l'espace de travail.
         */}
        <a
          href={guideSlack?.consoles[0]?.url ?? "https://api.slack.com/apps?new_app=1"}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors [overflow-wrap:break-word] hover:bg-muted"
        >
          <ExternalLink size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="min-w-0">{tf("Ouvrir {0}", guideSlack?.consoles[0]?.libelle ?? t("la création d'application Slack"))}</span>
        </a>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            {t("Le bouton ouvre la création d'application avec le manifeste ci-dessous déjà rempli : choisissez votre espace de travail, vérifiez, puis « Create ». Sinon : « Create New App », « From a manifest », et collez-le.")}
          </li>
          <li>
            {t("Dans « Install App », cliquez sur « Install to Workspace » et acceptez. Selon les règles de votre espace, un administrateur Slack devra peut-être approuver.")}
          </li>
          <li>
            {t("Toujours dans « Install App », copiez le « Bot User OAuth Token » : il commence par xoxb-. Collez-le plus bas.")}
          </li>
          <li>
            {t("Dans chaque salon que vos agents doivent lire, tapez « /invite @")}{bot}{" "}{t("». Les agents ne liront que ces salons.")}
          </li>
        </ol>
        <div className="relative">
          <pre className="max-h-56 overflow-auto rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
            {texteManifeste}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            icon={copie ? Check : Copy}
            className="absolute right-2 top-2"
            onClick={() => void copier()}
          >
            {copie ? t("Copié") : t("Copier le manifeste")}
          </Button>
        </div>
        <InfoBox tone="muted" leading={<Info size={15} strokeWidth={1.75} />}>
          {t("Laissez la distribution publique désactivée. Une application interne à votre espace garde les limites normales de Slack ; une application distribuée hors de la Marketplace de Slack est limitée à une lecture de quinze messages par minute, ce qui rendrait le connecteur inutilisable.")}
        </InfoBox>
      </Card>

      <Card className="space-y-4">
        <Field
          label={t("Jeton de l'application (Bot User OAuth Token)")}
          required
          hint={t("Il commence par xoxb-. Un jeton d'utilisateur (xoxp-) est refusé : il lirait tout ce que voit la personne qui l'a créé, messages privés compris.")}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder={t("xoxb-…")}
            value={jeton}
            onChange={(e) => setJeton(e.target.value)}
          />
        </Field>

        {messages}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {t("Le jeton est essayé, et ses autorisations relues, avant tout enregistrement : un jeton qui permettrait d'écrire est refusé.")}
          </p>
          <div className="flex shrink-0 gap-2">
            {etat.aReconnecter && (
              <Button
                variant="ghost"
                icon={retrait ? Loader2 : Trash2}
                disabled={retrait}
                onClick={() => void debrancher()}
              >
                {t("Débrancher")}
              </Button>
            )}
            <Button
              icon={enCours ? Loader2 : MessageSquare}
              disabled={enCours || !jeton.trim() || !etat.chiffrementDonnees}
              onClick={() => void soumettre()}
            >
              {enCours ? t("Vérification…") : t("Connecter Slack")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default SlackConnecteur;
