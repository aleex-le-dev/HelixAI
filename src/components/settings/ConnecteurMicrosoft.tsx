import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Building2, Check, Cloud, ExternalLink, FileText, KeyRound, Link2, Loader2, Lock, Mail, MessagesSquare, Pencil, ShieldAlert, Table2, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  collerAdresseNatif,
  connecterNatif,
  effacerApplication,
  enregistrerApplication,
  etatNatifs,
  oublierNatif,
  type EtatNatif,
  type IdChoix,
  type ServiceMicrosoft,
} from "@/lib/natifs";
import { Card } from "@/components/settings/SettingsShell";
import type { ServiceMaison } from "@/components/settings/Connecteurs";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { ACopier } from "@/components/ui/ACopier";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";

/**
 * Microsoft 365 : Outlook, OneDrive, SharePoint, Excel, Word et Teams, par
 * Microsoft Graph (gateway/src/natifs/microsoftBase.ts). Ajouté le 28/09/2026
 * à la demande de Medhi.
 *
 * Six lignes dans la liste des connecteurs, une seule connexion derrière :
 * chez Microsoft, le consentement s'accumule par application, et un jeton porte
 * tout ce qui a été consenti (microsoftBase.ts). Chaque ligne ouvre donc le
 * même panneau, avec son service coché d'avance ; on y coche les services et
 * l'écriture, une fois pour les six.
 *
 * Le panneau dit en mots simples comment l'administrateur crée l'application
 * dans le portail Entra, quelles permissions déclarer (la liste suit les cases
 * cochées), et lesquelles demandent le consentement d'un administrateur de
 * l'annuaire. Les libellés sont ceux du portail en français le 28/09/2026 ;
 * ils changent, et l'écran le dit.
 *
 * Les logos officiels (clés de marque `outlook`, `onedrive`, `sharepoint`,
 * `excel`, `word`, `teams`) sont posés par un autre travail : icônes neutres
 * en attendant.
 */

const SERVICES: ServiceMicrosoft[] = ["outlook", "onedrive", "sharepoint", "excel", "word", "teams"];
const NOMS: Record<ServiceMicrosoft, string> = { outlook: "Outlook", onedrive: "OneDrive", sharepoint: "SharePoint", excel: "Excel", word: "Word", teams: "Microsoft Teams" };
const ICONES: Record<ServiceMicrosoft, LucideIcon> = { outlook: Mail, onedrive: Cloud, sharepoint: Building2, excel: Table2, word: FileText, teams: MessagesSquare };

/** Traduit au rendu : la langue n'est pas connue au chargement du module. */
function resume(s: ServiceMicrosoft): string {
  switch (s) {
    case "outlook":
      return t("Mails et agenda, envoyer après accord");
    case "onedrive":
      return t("Lister, chercher et lire vos fichiers");
    case "sharepoint":
      return t("Sites et documents de l'organisation");
    case "excel":
      return t("Lire vos classeurs, y écrire après accord");
    case "word":
      return t("Lire vos documents");
    case "teams":
      return t("Canaux et messages, poster après accord");
  }
}

function capacite(s: ServiceMicrosoft): string {
  switch (s) {
    case "outlook":
      return t("lire et chercher les mails, lire l'agenda ; avec l'écriture, préparer un brouillon, envoyer un mail, créer un événement.");
    case "onedrive":
      return t("lister, chercher et lire les fichiers du compte.");
    case "sharepoint":
      return t("chercher les sites, lister, chercher et lire leurs documents.");
    case "excel":
      return t("lire un classeur ; avec l'écriture, y écrire des valeurs, jamais de formule.");
    case "word":
      return t("lire un document.");
    case "teams":
      return t("lire les équipes, les canaux et leurs messages ; avec l'écriture, poster un message.");
  }
}

function Lien({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="break-all underline" href={href} target="_blank" rel="noreferrer noopener">
      {children} <ExternalLink size={11} className="inline" />
    </a>
  );
}

/** Les six lignes de la liste des connecteurs (ParametresPages.tsx), toutes vers le même panneau. */
export function lignesMicrosoft(etat: EtatNatif | undefined, ouvert: string | null, basculer: (cle: string) => void, relire: () => void): ServiceMaison[] {
  return SERVICES.map((s) => {
    const coche = Boolean(etat?.configure && etat.accordes?.includes(s));
    return {
      id: s,
      label: NOMS[s],
      description: coche
        ? tf("Connecté : {0}", etat?.compte ?? "")
        : etat?.aReconnecter
          ? t("Accès perdu, à reconnecter")
          : etat?.configure
            ? t("Pas coché dans la connexion Microsoft 365")
            : resume(s),
      categorie: "Microsoft 365",
      icone: ICONES[s],
      connecte: coche,
      ouvert: ouvert === s,
      onBasculer: () => basculer(s),
      panneau: <ConnecteurMicrosoft service={s} onChange={relire} />,
    };
  });
}

export function ConnecteurMicrosoft({ service, onChange }: { service: ServiceMicrosoft; onChange?: () => void }) {
  const [etat, setEtat] = useState<EtatNatif | null | undefined>(undefined);
  const [admin, setAdmin] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [adresse, setAdresse] = useState<string | null>(null);
  const [collage, setCollage] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [annuaire, setAnnuaire] = useState("");
  const [secret, setSecret] = useState("");
  const [choix, setChoix] = useState<IdChoix[]>([service]);
  const [modifier, setModifier] = useState(false);

  const relire = useCallback(async () => {
    const e = await etatNatifs();
    const ms = e?.services.find((s) => s.id === "microsoft") ?? null;
    setEtat(ms);
    setAdmin(Boolean(e?.administrateur));
    return ms;
  }, []);

  useEffect(() => {
    void relire().then((ms) => {
      // Reconnecter reprend ce qui était coché, plus le service de la ligne ouverte.
      if (ms?.accordes?.length) setChoix([...new Set<IdChoix>([...ms.accordes, service])]);
    });
  }, [relire, service]);

  const attente = Boolean(etat?.attente);
  // L'accord se donne chez Microsoft : seule l'instance sait quand il est revenu.
  useEffect(() => {
    if (!attente) return;
    const minuterie = setInterval(() => {
      void relire().then((e) => {
        if (!e || e.attente) return;
        setAdresse(null);
        setCollage("");
        setModifier(false);
        if (e.issue?.ok) {
          setSucces(e.issue.message);
          onChange?.();
        } else if (e.issue) setErreur(e.issue.message);
      });
    }, 2000);
    return () => clearInterval(minuterie);
  }, [attente, relire, onChange]);

  const agir = async (fn: () => Promise<{ ok: boolean; message: string; url?: string }>, apres?: (url?: string) => void) => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const r = await fn();
    setEnCours(false);
    if (!r.ok) setErreur(r.message);
    else {
      setSucces(r.message);
      apres?.(r.url);
    }
    await relire();
    onChange?.();
  };

  if (etat === undefined) {
    return (
      <Card className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
        {t("Lecture de l'état du service…")}
      </Card>
    );
  }
  if (!etat) return null;

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

  const partage = (
    <p className="text-xs text-muted-foreground">
      {t("Le compte branché vaut pour toute l'instance : chaque personne peut faire lire ses mails, ses fichiers et ses canaux à ses agents. Branchez un compte dédié à l'organisation (une boîte commune, par exemple), pas un compte personnel.")}
    </p>
  );

  if (etat.configure && !modifier) {
    const depuis = etat.depuis ? new Date(etat.depuis) : null;
    const ecrit = etat.accordes?.includes("ecriture");
    const coches = SERVICES.filter((s) => etat.accordes?.includes(s));
    return (
      <div className="space-y-3">
        <Card className="flex flex-wrap-reverse items-start gap-3 max-sm:p-3">
          <div className="min-w-[9rem] flex-1">
            <p className="break-all font-medium text-foreground">{etat.compte}</p>
            <p className="text-sm text-muted-foreground">
              {coches.map((s) => NOMS[s]).join(", ")}
              {ecrit ? t(" ; lecture et écriture") : t(" ; lecture seule")}
              {depuis && !Number.isNaN(depuis.getTime()) ? tf(", connecté le {0}", formaterDate(depuis)) : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">{t("Connecté")}</span>
        </Card>
        {!coches.includes(service) && (
          <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
            {tf("{0} n'est pas coché dans la connexion Microsoft 365. Pour l'ajouter, modifiez les services, puis reconnectez-vous.", NOMS[service])}
          </InfoBox>
        )}
        <InfoBox leading={<Lock size={15} strokeWidth={1.75} />}>
          {ecrit
            ? t("Vos agents peuvent lire, et proposer d'envoyer, d'écrire ou de poster : chaque mail, chaque écriture et chaque message vous est montré en entier et n'a lieu qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation. Seul l'administrateur de l'instance peut écrire. L'accès est conservé chiffré sur l'instance et n'en ressort jamais.")
            : t("Lecture seule : vos agents peuvent lire, sans rien modifier ni envoyer. L'accès est conservé chiffré sur l'instance et n'en ressort jamais.")}
        </InfoBox>
        {partage}
        {messages}
        {admin && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" icon={Pencil} disabled={enCours} onClick={() => setModifier(true)}>
              {t("Modifier les services")}
            </Button>
            <Button variant="destructive" size="sm" icon={enCours ? Loader2 : Trash2} disabled={enCours} onClick={() => void agir(() => oublierNatif("microsoft"))}>
              {t("Débrancher Microsoft 365")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const basculer = (c: IdChoix) => setChoix((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  const avecEcriture = choix.includes("ecriture");
  const services = etat.choix.filter((c) => c.id !== "ecriture" && c.id !== "page");
  const cochees = services.filter((c) => choix.includes(c.id));
  // Ce qu'il faut déclarer dans « Autorisations de l'API » : exactement ce que la connexion demandera.
  const portees = [...new Set([...etat.lecture.filter((p) => p !== "offline_access"), ...cochees.flatMap((c) => [...c.portees, ...(avecEcriture ? (c.ecriture ?? []) : [])])])];
  const consentement = cochees.some((c) => c.admin);
  const lancer = () =>
    agir(
      () => connecterNatif("microsoft", choix),
      (url) => {
        if (!url) return;
        setAdresse(url);
        // Dans l'application de bureau, la fenêtre native confie ce lien au navigateur.
        window.open(url, "_blank", "noopener,noreferrer");
      },
    );

  return (
    <Card className="space-y-3 break-words max-sm:p-3">
      <div>
        <p className="font-medium text-foreground">{t("Microsoft 365 : se connecter")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Une seule connexion pour Outlook, OneDrive, SharePoint, Excel, Word et Teams, avec l'application que votre organisation crée dans son annuaire Microsoft Entra, une fois. Vous cochez ce que vos agents pourront faire.")}
        </p>
      </div>
      {etat.aReconnecter && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Microsoft 365 n'accepte plus l'accès enregistré (révoqué, expiré, ou application changée). Reconnectez-vous.")}
        </InfoBox>
      )}

      <InfoBox className="max-sm:px-2" leading={<KeyRound size={15} strokeWidth={1.75} />}>
        <div className="space-y-2">
          <p className="font-medium">{t("Préparer l'application, une fois pour toute l'instance")}</p>
          <ol className="list-decimal space-y-1 pl-4 sm:pl-5">
            <li>
              {t("Sur")} <Lien href="https://entra.microsoft.com">entra.microsoft.com</Lien>
              {t(", avec un compte qui peut créer des applications : « Applications », « Inscriptions d'applications », « Nouvelle inscription ». Un nom au choix ; « Comptes dans cet annuaire d'organisation uniquement ».")}
            </li>
            <li>{t("« URI de redirection » : plateforme « Client public/natif (mobile et bureau) », et l'adresse de retour ci-dessous, à l'identique. Vous pouvez aussi choisir la plateforme « Web » avec la même adresse : l'application aura alors un secret.")}</li>
            <li>{t("Sur la page « Vue d'ensemble » de l'application, recopiez l'« ID d'application (client) » et l'« ID de l'annuaire (locataire) ».")}</li>
            <li>{t("Plateforme « Web » seulement : « Certificats et secrets », « Nouveau secret client », puis recopiez sa « Valeur » (pas son identifiant). Pour « Client public », pas de secret.")}</li>
            {/*
              La liste des permissions n'apparaît qu'une fois l'application enregistrée, avec les
              cases : l'ancienne phrase renvoyait à une liste « plus bas » absente du premier écran (28/09/2026).
            */}
            <li>{t("« Autorisations de l'API », « Ajouter une autorisation », « Microsoft Graph », « Autorisations déléguées » : ajoutez exactement les permissions que cet écran liste une fois l'application enregistrée, selon les services que vous cochez. Rien de plus : une permission en trop fait refuser la connexion.")}</li>
            <li>{t("Si la liste contient SharePoint ou Teams, ou si votre organisation interdit aux personnes de consentir elles-mêmes : un administrateur de l'annuaire clique sur « Accorder un consentement d'administrateur pour » votre organisation.")}</li>
          </ol>
          <p className="text-xs">{t("Les libellés du portail changent parfois : cherchez l'équivalent.")}</p>
        </div>
      </InfoBox>

      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{t("Adresse de retour à déclarer dans l'application")}</p>
        <ACopier valeur={etat.retour} libelle={t("l'adresse de retour")} note={t("Microsoft ignore le port de « localhost » : l'adresse se déclare telle quelle, sans port.")} />
      </div>

      {partage}

      {!admin ? (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Seul l'administrateur de l'instance peut brancher Microsoft 365 : ce service agit au nom de toute l'organisation. Transmettez-lui ces étapes.")}
        </InfoBox>
      ) : !etat.application.disponible ? (
        <>
          <Field label={t("ID d'application (client)")}>
            <Input value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="off" spellCheck={false} placeholder="00000000-0000-0000-0000-000000000000" />
          </Field>
          <Field label={t("ID de l'annuaire (locataire)")} hint={t("Ou un domaine de l'organisation, ou « common » si l'application accepte plusieurs annuaires.")}>
            <Input value={annuaire} onChange={(e) => setAnnuaire(e.target.value)} autoComplete="off" spellCheck={false} placeholder="00000000-0000-0000-0000-000000000000" />
          </Field>
          <Field label={t("Secret de l'application, pour la plateforme « Web » seulement")} hint={t("Laissez vide pour un « Client public » : Microsoft le protège sans secret. S'il est donné, il est gardé chiffré sur l'instance et n'en ressort jamais.")}>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <div className="flex justify-end">
            <Button
              size="sm"
              icon={enCours ? Loader2 : Check}
              disabled={enCours || !identifiant.trim() || !annuaire.trim()}
              onClick={() =>
                void agir(
                  () => enregistrerApplication("microsoft", identifiant.trim(), secret.trim(), annuaire.trim()),
                  () => {
                    setSecret("");
                    setIdentifiant("");
                    setAnnuaire("");
                  },
                )
              }
            >
              {t("Enregistrer l'application")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t("Ce que vos agents pourront faire")}</p>
            {services.map((c) => {
              const s = c.id as ServiceMicrosoft;
              return (
                <label key={c.id} className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" className="mt-1" checked={choix.includes(c.id)} onChange={() => basculer(c.id)} disabled={attente} />
                  <span className="min-w-0">
                    <span className="font-medium">{NOMS[s]}</span>
                    {t(" : ")}
                    {capacite(s)}
                    {c.admin && <span className="text-muted-foreground">{t(" Demande le consentement d'un administrateur de l'annuaire.")}</span>}
                  </span>
                </label>
              );
            })}
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input type="checkbox" className="mt-1" checked={avecEcriture} onChange={() => basculer("ecriture")} disabled={attente} />
              <span>
                {t("Permettre aussi d'écrire : envoyer un mail, créer un événement, écrire dans un classeur, poster dans Teams, pour les services cochés.")}{" "}
                <span className="text-muted-foreground">{t("Chaque écriture vous sera montrée en entier et demandera votre accord.")}</span>
              </span>
            </label>
          </div>
          {portees.length > 1 && (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">{t("Permissions déléguées à déclarer dans l'application (Microsoft Graph)")}</p>
              <p className="break-words font-mono text-xs text-muted-foreground">{portees.join(", ")}</p>
              {consentement && <p className="text-xs text-muted-foreground">{t("Sites.Read.All et ChannelMessage.Read.All demandent le consentement d'un administrateur de l'annuaire, donné dans le portail avant de vous connecter.")}</p>}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-all text-xs text-muted-foreground">
              {tf("Application : {0}, annuaire {1}", etat.application.identifiant ?? "", etat.application.annuaire ?? "")}
              {" · "}
              <button type="button" className="underline" disabled={enCours || attente} onClick={() => void agir(() => effacerApplication("microsoft"))}>
                {t("la retirer")}
              </button>
              {modifier && (
                <>
                  {" · "}
                  <button type="button" className="underline" disabled={enCours || attente} onClick={() => setModifier(false)}>
                    {t("annuler")}
                  </button>
                </>
              )}
            </p>
            <Button size="sm" icon={enCours || attente ? Loader2 : Link2} disabled={enCours || attente || cochees.length === 0} onClick={() => void lancer()}>
              {attente ? t("En attente de votre accord…") : t("Se connecter à Microsoft 365")}
            </Button>
          </div>
          {adresse && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {t("La page du service ne s'est pas ouverte ?")} <Lien href={adresse}>{t("L'ouvrir")}</Lien>
              </p>
              <Field label={t("Instance sur une autre machine : collez ici l'adresse affichée par le navigateur après votre accord")}>
                <Input value={collage} onChange={(e) => setCollage(e.target.value)} placeholder="http://localhost:…/microsoft?code=…&state=…" spellCheck={false} />
              </Field>
              {collage.trim() && (
                <div className="flex justify-end">
                  <Button size="sm" variant="secondary" disabled={enCours} onClick={() => void agir(() => collerAdresseNatif("microsoft", collage.trim()), () => setAdresse(null))}>
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
