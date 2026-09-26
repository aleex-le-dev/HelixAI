import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, ExternalLink, Link2, Loader2, Lock, ShieldAlert, Trash2 } from "lucide-react";
import {
  collerAdresseAgendaGoogle,
  connecterAgendaGoogle,
  etatAgendaGoogle,
  etatClientGoogle,
  oublierAgendaGoogle,
  type EtatAgendaGoogle,
  type EtatClientGoogle,
} from "@/lib/google";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { FormulaireClientGoogle } from "@/components/settings/ClientGoogle";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";

/**
 * Google Agenda par la connexion Google (gateway/src/agendaGoogle.ts).
 *
 * Ajouté le 26/09/2026 : Google refuse les mots de passe d'application pour
 * ses agendas (essayé sur un vrai compte), le formulaire CalDAV ne peut donc
 * pas l'ouvrir. L'écran n'affiche « connecté » que lorsque l'instance l'est
 * vraiment, après qu'elle a lu l'agenda principal.
 */
export function AgendaGoogle({ onChange }: { onChange?: () => void }) {
  const [etat, setEtat] = useState<EtatAgendaGoogle | null | undefined>(undefined);
  const [client, setClient] = useState<EtatClientGoogle | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [adresseGoogle, setAdresseGoogle] = useState<string | null>(null);
  const [collage, setCollage] = useState("");

  const relire = useCallback(async () => {
    const [e, c] = await Promise.all([etatAgendaGoogle(), etatClientGoogle()]);
    setEtat(e);
    setClient(c);
    return e;
  }, []);

  useEffect(() => {
    void relire();
  }, [relire]);

  // L'accord se donne dans le navigateur : seule l'instance sait quand il est arrivé.
  const attente = Boolean(etat?.attente);
  useEffect(() => {
    if (!attente) return;
    const minuterie = setInterval(() => {
      void relire().then((e) => {
        if (!e || e.attente) return;
        setAdresseGoogle(null);
        setCollage("");
        if (e.issue?.ok) {
          setSucces(e.issue.message);
          onChange?.();
        } else if (e.issue) setErreur(e.issue.message);
      });
    }, 2000);
    return () => clearInterval(minuterie);
  }, [attente, relire, onChange]);

  const lancer = async () => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const r = await connecterAgendaGoogle();
    setEnCours(false);
    if (!r.ok || !r.url) {
      setErreur(r.message);
      return;
    }
    setAdresseGoogle(r.url);
    // Dans l'application de bureau, la fenêtre native confie ce lien au navigateur.
    window.open(r.url, "_blank", "noopener,noreferrer");
    await relire();
  };

  const validerCollage = async () => {
    setEnCours(true);
    setErreur(null);
    const r = await collerAdresseAgendaGoogle(collage.trim());
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    setAdresseGoogle(null);
    setCollage("");
    setSucces(r.message);
    await relire();
    onChange?.();
  };

  const debrancher = async () => {
    setEnCours(true);
    setErreur(null);
    const r = await oublierAgendaGoogle();
    setEnCours(false);
    setSucces(r.message);
    await relire();
    onChange?.();
  };

  if (etat === undefined) {
    return (
      <Card className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
        {t("Lecture de l'état de Google Agenda…")}
      </Card>
    );
  }
  if (etat === null) return null;

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

  if (etat.configure) {
    const depuis = etat.depuis ? new Date(etat.depuis) : null;
    return (
      <div className="space-y-3">
        <Card className="flex items-start gap-3">
          <CalendarDays size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{etat.compte}</p>
            <p className="truncate text-sm text-muted-foreground">
              {t("Google Agenda, par la connexion Google")}
              {depuis && !Number.isNaN(depuis.getTime()) ? tf(", connecté le {0}", formaterDate(depuis)) : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">{t("Connecté")}</span>
        </Card>
        <InfoBox leading={<Lock size={15} strokeWidth={1.75} />}>
          {t("Lecture seule. Vos agents peuvent consulter vos agendas Google et y chercher ; ils ne peuvent ni créer, ni déplacer, ni supprimer un événement. L'accès est conservé chiffré sur l'instance et n'en ressort jamais ; le débrancher le révoque aussi chez Google.")}
        </InfoBox>
        {messages}
        <div className="flex justify-end">
          <Button variant="destructive" size="sm" icon={enCours ? Loader2 : Trash2} disabled={enCours} onClick={() => void debrancher()}>
            {t("Débrancher Google Agenda")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-medium text-foreground">{t("Google Agenda : se connecter avec Google")}</p>
        <p className="text-sm text-muted-foreground">{t("Google refuse les mots de passe d'application pour ses agendas : c'est sa propre connexion qui les ouvre, en lecture seule.")}</p>
      </div>
      {etat.aReconnecter && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Google n'accepte plus l'accès enregistré (révoqué, expiré, ou application changée). Reconnectez-vous.")}
        </InfoBox>
      )}
      {!client?.disponible ? (
        <FormulaireClientGoogle etat={client} api="Google Calendar API" onEnregistre={() => void relire()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {tf("Application Google : {0}", client.identifiant ?? "")}
            </p>
            <Button size="sm" icon={enCours || attente ? Loader2 : Link2} disabled={enCours || attente} onClick={() => void lancer()}>
              {attente ? t("En attente de votre accord dans Google…") : t("Se connecter avec Google")}
            </Button>
          </div>
          {adresseGoogle && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {t("La page de Google ne s'est pas ouverte ?")}{" "}
                <a className="underline" href={adresseGoogle} target="_blank" rel="noreferrer noopener">
                  {t("L'ouvrir")} <ExternalLink size={11} className="inline" />
                </a>
              </p>
              <Field label={t("Instance sur une autre machine : collez ici l'adresse affichée par le navigateur après votre accord")}>
                <Input value={collage} onChange={(e) => setCollage(e.target.value)} placeholder="http://127.0.0.1:…/?state=…&code=…" spellCheck={false} />
              </Field>
              {collage.trim() && (
                <div className="flex justify-end">
                  <Button size="sm" variant="secondary" disabled={enCours} onClick={() => void validerCollage()}>
                    {t("Terminer la connexion")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {messages}
    </Card>
  );
}
