import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, ExternalLink, KeyRound, Link2, Loader2, Lock, ShieldAlert, Trash2 } from "lucide-react";
import {
  collerAdresseNatif,
  connecterNatif,
  effacerApplication,
  enregistrerApplication,
  etatNatifs,
  oublierNatif,
  type EtatNatif,
  type EtatNatifs,
  type IdChoix,
  type IdNatif,
} from "@/lib/natifs";
import { etatClientGoogle, type EtatClientGoogle } from "@/lib/google";
import { Card } from "@/components/settings/SettingsShell";
import { FormulaireClientGoogle } from "@/components/settings/ClientGoogle";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { ACopier } from "@/components/ui/ACopier";
import { LogoMarqueGrand } from "@/components/settings/TuileService";
import { estNatifProjet, GuideProjet, libelleChoixProjet, pourquoiApplicationProjet, revueProjet } from "@/components/settings/ConnecteurProjets";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";

/**
 * Panneau d'un service branché nativement (gateway/src/oauthNatif.ts) :
 * Google Sheets, Google Slides, YouTube, LinkedIn, Facebook, Instagram,
 * TikTok, et X (ex-Twitter). Ajouté le 28/09/2026 à la demande de Medhi.
 *
 * Il dit, en mots simples, comment l'organisation crée son application chez
 * le fournisseur, ce qui marche sans revue et ce qui en demande une, et que
 * rien n'a encore été essayé avec un vrai compte. Les étapes décrivent les
 * consoles telles que leur documentation les présentait le 28/09/2026 : leurs
 * libellés changent, et l'écran le dit.
 */

const API_GOOGLE: Partial<Record<IdNatif, string>> = { sheets: "Google Sheets API", slides: "Google Slides API", youtube: "YouTube Data API v3" };

function Lien({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="underline" href={href} target="_blank" rel="noreferrer noopener">
      {children} <ExternalLink size={11} className="inline" />
    </a>
  );
}

/**
 * Le logo de YouTube, en tête de son panneau (décision de Medhi, 28/09/2026).
 *
 * La liste des connecteurs le montrerait à 22 px, sous les 100 px que la
 * charte impose (https://brand.youtube/youtube-logo/) : elle garde une icône
 * neutre, et le logo officiel ne paraît qu'ici, en grand. La charte des
 * développeurs (https://developers.google.com/youtube/terms/branding-guidelines)
 * prévoit, pour une fonction qui se sert de l'API, le logo complet plutôt que
 * l'icône, placé à côté de cette fonction, sur un fond uni, et cliquable vers
 * YouTube : d'où le lien vers la page d'accueil de YouTube, qu'elle cite en
 * exemple. Elle demande aussi qu'il ne soit pas l'élément le plus en vue de la
 * page : il n'est que dans le panneau déplié, sous le titre de l'écran et la
 * ligne YouTube de la liste. Dans une fenêtre trop étroite pour le montrer
 * entier à 100 px, il ne paraît pas (LogoMarqueGrand).
 */
function LogoYouTube({ nom }: { nom: string }) {
  return <LogoMarqueGrand marque="youtube" hauteur={100} lien="https://www.youtube.com/" libelle={tf("Ouvrir {0}", nom)} />;
}

/** Comment créer l'application, service par service. */
function Guide({ id }: { id: IdNatif }) {
  // Brevo et Mailchimp (28/09/2026) : leurs textes sont dans ConnecteurProjets.tsx.
  if (estNatifProjet(id)) return <GuideProjet id={id} />;
  switch (id) {
    case "sheets":
    case "slides":
    case "youtube":
      return (
        <p className="text-sm text-muted-foreground">
          {tf("Ce service utilise l'application Google de l'instance, la même que Drive et Agenda. Si elle existe déjà, il suffit d'activer « {0} » dans le même projet de la console Google Cloud (« API et services », « Bibliothèque »).", API_GOOGLE[id] ?? "")}
        </p>
      );
    case "linkedin":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")} <Lien href="https://www.linkedin.com/developers/apps">linkedin.com/developers/apps</Lien>
            {t(", « Create app » : un nom, la page LinkedIn de votre entreprise (LinkedIn l'exige) et un logo.")}
          </li>
          <li>{t("Onglet « Products » : ajoutez « Sign In with LinkedIn using OpenID Connect » et « Share on LinkedIn ». Ces deux-là s'ajoutent tout de suite, sans examen.")}</li>
          <li>{t("Onglet « Auth » : dans « Authorized redirect URLs », ajoutez l'adresse de retour ci-dessous, à l'identique. Recopiez ensuite le « Client ID » et le « Primary Client Secret ».")}</li>
        </ol>
      );
    case "facebook":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")} <Lien href="https://developers.facebook.com/apps">developers.facebook.com/apps</Lien>
            {t(", « Créer une app », de type « Entreprise », pour gérer une Page.")}
          </li>
          <li>{t("Ajoutez le produit « Facebook Login » ; dans ses paramètres, « URI de redirection OAuth valides » : l'adresse de retour ci-dessous, à l'identique.")}</li>
          <li>{t("« Paramètres de l'app », « Général » : recopiez l'« ID de l'app » et la « Clé secrète ».")}</li>
          <li>{t("La personne qui se connecte doit avoir un rôle dans l'application (« Rôles de l'app ») et gérer la Page.")}</li>
        </ol>
      );
    case "instagram":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t("Le compte Instagram doit être professionnel (Entreprise ou Créateur), dans les réglages de l'application Instagram.")}</li>
          <li>
            {t("Sur")} <Lien href="https://developers.facebook.com/apps">developers.facebook.com/apps</Lien>
            {t(", dans une app de type « Entreprise », ajoutez le produit « Instagram », puis « Configuration de l'API avec connexion Instagram ». Recopiez l'« ID de l'app Instagram » et sa « Clé secrète » : ce ne sont pas ceux de Facebook.")}
          </li>
          <li>{t("« Configurer la connexion professionnelle Instagram » : adresse de redirection, l'adresse de retour ci-dessous, à l'identique.")}</li>
          <li>{t("« Rôles de l'app » : ajoutez le compte Instagram comme testeur, puis acceptez l'invitation depuis Instagram.")}</li>
        </ol>
      );
    case "tiktok":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")} <Lien href="https://developers.tiktok.com/apps">developers.tiktok.com</Lien>
            {t(", « Manage apps », « Connect an app ». Plateforme : « Desktop ».")}
          </li>
          <li>{t("Ajoutez « Login Kit », avec l'adresse de retour ci-dessous, et, pour publier, « Content Posting API » avec « Direct Post ».")}</li>
          <li>{t("Portées à cocher : user.info.basic, user.info.stats, video.list, et video.publish pour publier.")}</li>
          <li>{t("Recopiez la « Client key » et le « Client secret ». Pour essayer sans examen, créez un « Sandbox » et ajoutez-y votre compte TikTok comme compte cible.")}</li>
        </ol>
      );
    case "x":
      // D'après https://docs.x.com/x-api/getting-started/getting-access et https://docs.x.com/fundamentals/developer-apps (28/09/2026).
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")} <Lien href="https://console.x.com">console.x.com</Lien>
            {t(", connectez-vous avec le compte X de votre organisation, acceptez l'accord des développeurs, puis créez une application (« New App ») : un nom, une description, l'usage prévu.")}
          </li>
          <li>{t("Achetez des crédits dans la même console : l'API de X se paie à l'usage (voir plus bas).")}</li>
          <li>{t("Dans les réglages d'authentification de l'application, activez OAuth 2.0. Type d'application : « Web App » (elle a un secret) ou « Native App » (sans secret). Si la console demande les droits de l'application, choisissez « Read and write » pour pouvoir publier.")}</li>
          <li>{t("« Callback URI » : l'adresse de retour ci-dessous, à l'identique. X refuse « localhost » : l'adresse montrée commence donc par 127.0.0.1.")}</li>
          <li>{t("Recopiez le « Client ID » et, pour une « Web App », le « Client Secret ». Branchez de préférence le compte qui a créé l'application : X facture moins cher la lecture de ses propres posts.")}</li>
        </ol>
      );
  }
}

/** Ce qui marche sans examen du fournisseur, et ce qui en demande un. */
function Revue({ id }: { id: IdNatif }) {
  if (estNatifProjet(id)) return <p>{revueProjet(id)}</p>;
  const texte: Partial<Record<IdNatif, string>> = {
    sheets: t("Aucun examen pour une application interne à votre Google Workspace. Écrire ouvre toutes les feuilles du compte : Google n'a pas d'accès plus étroit pour une application de bureau."),
    slides: t("Aucun examen pour une application interne à votre Google Workspace. Lecture seule."),
    youtube: t("Aucun examen pour une application interne à votre Google Workspace. Lecture seule : chaînes, vidéos, statistiques publiques. 10 000 unités de quota par jour, une lecture en coûte une."),
    linkedin: t("Sans examen : se connecter et publier au nom de son profil. Impossible : lire les publications d'un profil (LinkedIn n'ouvre plus cet accès). Avec examen : la page d'une entreprise (lire, statistiques, publier) passe par le produit « Community Management API », que LinkedIn examine, à demander sur une application neuve qui n'a aucun autre produit. Limite : 150 publications par personne et par jour."),
    facebook: t("Sans examen (« accès standard ») : seulement pour les personnes qui ont un rôle dans l'application. Pour d'autres personnes : examen de l'application par Meta et vérification de l'entreprise. L'accès dure 60 jours, puis il faut se reconnecter."),
    instagram: t("Sans examen : seulement pour les comptes qui ont un rôle dans l'application (testeur Instagram compris). Pour d'autres comptes : examen par Meta. Publier : une photo JPEG, à une adresse web publique, 100 publications par jour au plus. L'accès dure 60 jours et se renouvelle seul."),
    tiktok: t("Sans examen : le bac à sable, jusqu'à 10 comptes. Tant que l'application n'a pas passé l'audit de TikTok, tout ce qu'elle publie reste privé (visible de vous seul)."),
    // https://docs.x.com/x-api/getting-started/pricing et https://docs.x.com/changelog, lus le 28/09/2026.
    x: t("Aucun examen de X pour brancher le compte de votre organisation, mais l'API est payante. Depuis le 6 février 2026, X n'a plus d'offre gratuite pour les nouveaux développeurs : on achète des crédits d'avance, et chaque appel est décompté. Tarifs publiés par X au 28 septembre 2026 : publier un post, 0,015 $ (0,20 $ s'il contient une adresse web) ; lire un de vos posts, 0,001 $ si le compte branché est celui qui a créé l'application, 0,005 $ sinon. Il faut des crédits avant le premier appel. Les offres Basic et Pro, pour qui y est déjà abonné, permettent aussi de lire et de publier. Limite de X : 100 posts par 15 minutes. Citer un post, suivre, aimer : X ne le permet plus par son API."),
  };
  return <p>{texte[id]}</p>;
}

/** Traduit au rendu, pas au chargement du module : la langue n'est pas encore connue à ce moment-là. */
function libelleChoix(id: IdNatif, c: IdChoix): string {
  if (estNatifProjet(id)) return libelleChoixProjet(c);
  if (c === "page") return t("Page d'entreprise : lire ses publications et statistiques, et y publier si la case du dessus est cochée.");
  if (id === "sheets") return t("Permettre aussi d'écrire dans les feuilles (remplacer une plage, ajouter des lignes).");
  if (id === "facebook") return t("Permettre de publier des posts sur les pages.");
  if (id === "instagram") return t("Permettre de publier des photos.");
  if (id === "tiktok") return t("Permettre de publier des vidéos du dossier de travail.");
  if (id === "x") return t("Permettre de publier des posts : un texte, et une image du dossier de travail si vous le demandez.");
  return t("Permettre de publier des posts.");
}

export function ConnecteurNatif({ id, onChange }: { id: IdNatif; onChange?: () => void }) {
  const [etats, setEtats] = useState<EtatNatifs | null | undefined>(undefined);
  const [client, setClient] = useState<EtatClientGoogle | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [adresse, setAdresse] = useState<string | null>(null);
  const [collage, setCollage] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [secret, setSecret] = useState("");
  const [choix, setChoix] = useState<IdChoix[]>([]);

  const relire = useCallback(async () => {
    const [e, c] = await Promise.all([etatNatifs(), etatClientGoogle()]);
    setEtats(e);
    setClient(c);
    return e?.services.find((s) => s.id === id) ?? null;
  }, [id]);

  useEffect(() => {
    void relire();
  }, [relire]);

  const etat: EtatNatif | undefined = etats?.services.find((s) => s.id === id);
  const attente = Boolean(etat?.attente);
  // L'accord se donne chez le fournisseur : seule l'instance sait quand il est revenu.
  useEffect(() => {
    if (!attente) return;
    const minuterie = setInterval(() => {
      void relire().then((e) => {
        if (!e || e.attente) return;
        setAdresse(null);
        setCollage("");
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

  if (etats === undefined) {
    return (
      <Card className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
        {t("Lecture de l'état du service…")}
      </Card>
    );
  }
  if (!etats || !etat) return null;
  const admin = etats.administrateur;
  const logo = id === "youtube" ? <LogoYouTube nom={etat.nom} /> : null;

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
    const expire = etat.expireLe ? new Date(etat.expireLe) : null;
    const ecrit = etat.accordes?.includes("ecriture") || etat.accordes?.includes("envoi");
    // Brevo et Mailchimp : des brouillons, et l'envoi s'il est coché, pas des publications.
    const droitsProjet = estNatifProjet(id)
      ? [etat.accordes?.includes("ecriture") ? t("brouillons") : "", etat.accordes?.includes("envoi") ? t("envoi de campagnes") : ""].filter(Boolean)
      : null;
    return (
      <div className="space-y-3">
        {logo}
        <Card className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{etat.compte}</p>
            <p className="text-sm text-muted-foreground">
              {droitsProjet && droitsProjet.length > 0 ? tf("{0}, lecture et {1}", etat.nom, droitsProjet.join(", ")) : ecrit ? tf("{0}, lecture et publication", etat.nom) : tf("{0}, lecture seule", etat.nom)}
              {etat.accordes?.includes("page") ? t(", page d'entreprise") : ""}
              {depuis && !Number.isNaN(depuis.getTime()) ? tf(", connecté le {0}", formaterDate(depuis)) : ""}
            </p>
            {expire && !Number.isNaN(expire.getTime()) && (
              <p className="text-xs text-muted-foreground">{tf("L'accès expire le {0} : il faudra se reconnecter.", formaterDate(expire))}</p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">{t("Connecté")}</span>
        </Card>
        <InfoBox leading={<Lock size={15} strokeWidth={1.75} />}>
          {ecrit
            ? t("Vos agents peuvent lire, et proposer d'écrire ou de publier : chaque écriture et chaque publication vous est montrée en entier et n'a lieu qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation. Seul l'administrateur de l'instance peut publier. L'accès est conservé chiffré sur l'instance et n'en ressort jamais.")
            : t("Lecture seule : vos agents peuvent lire, sans rien modifier ni publier. L'accès est conservé chiffré sur l'instance et n'en ressort jamais.")}
        </InfoBox>
        {messages}
        {admin && (
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" icon={enCours ? Loader2 : Trash2} disabled={enCours} onClick={() => void agir(() => oublierNatif(id))}>
              {tf("Débrancher {0}", etat.nom)}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const basculer = (c: IdChoix) => setChoix((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  const lancer = () =>
    agir(
      () => connecterNatif(id, choix),
      (url) => {
        if (!url) return;
        setAdresse(url);
        // Dans l'application de bureau, la fenêtre native confie ce lien au navigateur.
        window.open(url, "_blank", "noopener,noreferrer");
      },
    );
  const boucle = etat.retour.startsWith("http://127.0.0.1") && !etat.retour.includes("/helix/oauth/retour");
  // X accepte une application « publique », sans secret (oauthNatif.ts, `secretFacultatif`).
  const secretFacultatif = id === "x";

  const panneau = (
    <Card className="space-y-3">
      <div>
        <p className="font-medium text-foreground">{tf("{0} : se connecter", etat.nom)}</p>
        <p className="text-sm text-muted-foreground">
          {etat.google
            ? t("Par la connexion Google, avec l'application Google de votre organisation.")
            : id === "x"
              ? /*
                 * Tournée de la 2026.928.3 (SECURITE.md § 43) : X recevait la
                 * phrase commune, « X examine les applications… », que
                 * contredit sa rubrique (« Aucun examen de X »). Ce qui
                 * empêche une application commune chez X, c'est la facture.
                 */
                t("Avec l'application que votre organisation crée chez X, une fois. Le logiciel ne peut pas en fournir une commune : X facture chaque appel à l'application qui le fait, sur ses crédits.")
              : estNatifProjet(id)
                ? pourquoiApplicationProjet(id)
                : tf("Avec l'application que votre organisation crée chez {0}, une fois. Le logiciel ne peut pas en fournir une commune : {0} examine les applications qui servent d'autres comptes que ceux de leur éditeur.", etat.nom)}
        </p>
      </div>
      {etat.aReconnecter && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {tf("{0} n'accepte plus l'accès enregistré (révoqué, expiré, ou application changée). Reconnectez-vous.", etat.nom)}
        </InfoBox>
      )}
      <InfoBox leading={<KeyRound size={15} strokeWidth={1.75} />}>
        <div className="space-y-2">
          <p className="font-medium">{t("Préparer l'application, une fois pour toute l'instance")}</p>
          <Guide id={id} />
          <p className="font-medium">{id === "x" ? t("Ce que permet chaque offre de X") : estNatifProjet(id) ? t("Ce que permet ce branchement") : t("Ce qui demande un examen du fournisseur")}</p>
          <Revue id={id} />
          <p className="text-xs">{t("Les libellés des consoles changent parfois : cherchez l'équivalent.")}</p>
        </div>
      </InfoBox>

      {!etat.google && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t("Adresse de retour à déclarer chez le fournisseur")}</p>
          <ACopier valeur={etat.retour} libelle={t("l'adresse de retour")} note={boucle ? t("Le port change à chaque connexion : déclarez-la avec l'astérisque.") : t("C'est l'adresse par laquelle ce navigateur atteint l'instance. Si le fournisseur exige https, ouvrez l'instance par une adresse en https.")} />
        </div>
      )}

      {!admin ? (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {tf("Seul l'administrateur de l'instance peut brancher {0} : ce service agit au nom de toute l'organisation. Transmettez-lui ces étapes.", etat.nom)}
        </InfoBox>
      ) : etat.google && !client?.disponible ? (
        <FormulaireClientGoogle etat={client} api={API_GOOGLE[id] ?? ""} onEnregistre={() => void relire()} />
      ) : !etat.application.disponible ? (
        <>
          <Field label={tf("Identifiant de l'application {0}", etat.nom)}>
            <Input value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field
            label={secretFacultatif ? t("Secret de l'application, pour une « Web App » seulement") : t("Secret de l'application")}
            hint={secretFacultatif ? t("Laissez vide pour une « Native App » : X la protège sans secret. S'il est donné, il est gardé chiffré sur l'instance et n'en ressort jamais.") : t("Gardé chiffré sur l'instance, il n'en ressort jamais.")}
          >
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <div className="flex justify-end">
            <Button
              size="sm"
              icon={enCours ? Loader2 : Check}
              disabled={enCours || !identifiant.trim() || (!secretFacultatif && !secret.trim())}
              onClick={() =>
                void agir(
                  () => enregistrerApplication(id, identifiant.trim(), secret.trim()),
                  () => {
                    setSecret("");
                    setIdentifiant("");
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
          {etat.choix.map((c) => (
            <label key={c.id} className="flex items-start gap-2 text-sm text-foreground">
              <input type="checkbox" className="mt-1" checked={choix.includes(c.id)} onChange={() => basculer(c.id)} disabled={attente} />
              <span>
                {libelleChoix(id, c.id)}{" "}
                <span className="text-muted-foreground">{c.revue ? t("Demande un examen du fournisseur : sans lui, la connexion sera refusée.") : t("Chaque écriture ou publication vous sera montrée et demandera votre accord.")}</span>
              </span>
            </label>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {tf("Application : {0}", etat.application.identifiant ?? "")}
              {!etat.google && (
                <>
                  {" · "}
                  <button type="button" className="underline" disabled={enCours || attente} onClick={() => void agir(() => effacerApplication(id))}>
                    {t("la retirer")}
                  </button>
                </>
              )}
            </p>
            <Button size="sm" icon={enCours || attente ? Loader2 : Link2} disabled={enCours || attente} onClick={() => void lancer()}>
              {attente ? t("En attente de votre accord…") : tf("Se connecter à {0}", etat.nom)}
            </Button>
          </div>
          {adresse && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {t("La page du service ne s'est pas ouverte ?")} <Lien href={adresse}>{t("L'ouvrir")}</Lien>
              </p>
              {boucle && (
                <>
                  <Field label={t("Instance sur une autre machine : collez ici l'adresse affichée par le navigateur après votre accord")}>
                    <Input value={collage} onChange={(e) => setCollage(e.target.value)} placeholder="http://127.0.0.1:…?state=…&code=…" spellCheck={false} />
                  </Field>
                  {collage.trim() && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="secondary" disabled={enCours} onClick={() => void agir(() => collerAdresseNatif(id, collage.trim()), () => setAdresse(null))}>
                        {t("Terminer la connexion")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
      {messages}
    </Card>
  );
  if (!logo) return panneau;
  return (
    <div className="space-y-3">
      {logo}
      {panneau}
    </div>
  );
}
