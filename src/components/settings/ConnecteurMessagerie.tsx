import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, ExternalLink, Info, KeyRound, Link2, Loader2, Lock, ShieldAlert, Trash2 } from "lucide-react";
import {
  connecterMessagerie,
  etatMessageries,
  oublierMessagerie,
  reglerEnvoiMessagerie,
  type EtatMessagerie,
  type EtatMessageries,
  type IdMessagerie,
} from "@/lib/messageries";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { Switch } from "@/components/ui/Switch";
import { ACopier } from "@/components/ui/ACopier";
import { branding } from "@/config/branding";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";

/**
 * Panneau d'une messagerie (gateway/src/natifs/messageries.ts) : Telegram,
 * Discord, WhatsApp Business. Ajouté le 28/09/2026 à la demande de Medhi.
 *
 * Pas d'autorisation dans le navigateur ici : l'organisation crée son bot (ou
 * son numéro WhatsApp Business) chez le service, et l'administrateur colle le
 * jeton une fois. L'écran dit comment, étape par étape, d'après la
 * documentation lue le 28/09/2026 (citée dans messageries.ts) ; les libellés
 * des consoles changent, et l'écran le dit.
 */

function Lien({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="underline" href={href} target="_blank" rel="noreferrer noopener">
      {children} <ExternalLink size={11} className="inline" />
    </a>
  );
}

/** Comment créer le bot, service par service. */
function Guide({ id }: { id: IdMessagerie }) {
  switch (id) {
    case "telegram":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Dans Telegram, ouvrez la conversation avec")} <Lien href="https://t.me/BotFather">@BotFather</Lien>
            {t(", envoyez /newbot, puis donnez un nom et un identifiant qui finit par « bot ».")}
          </li>
          <li>{t("BotFather répond avec le jeton du bot (123456789:AA…) : collez-le plus bas.")}</li>
          <li>{t("Ajoutez le bot aux groupes à lire. Par défaut, dans un groupe, il ne voit que les messages qui le mentionnent ou lui répondent ; pour qu'il lise tout, envoyez /setprivacy à BotFather, choisissez « Disable », puis ajoutez-le de nouveau au groupe.")}</li>
          <li>{t("Prenez un bot créé pour ce connecteur : un bot déjà branché sur un agent, ou sur un autre logiciel, sera refusé, car Telegram ne donne ses messages qu'à un seul lecteur.")}</li>
        </ol>
      );
    case "discord":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")} <Lien href="https://discord.com/developers/applications">discord.com/developers/applications</Lien>
            {t(", « New Application » : un nom, puis « Create ».")}
          </li>
          <li>{t("Page « Bot » : « Reset Token », puis copiez le jeton et collez-le plus bas.")}</li>
          <li>{t("Même page, « Privileged Gateway Intents » : activez « Message Content Intent ». Sans elle, Discord donne des messages vides, sauf ceux qui mentionnent le bot.")}</li>
          <li>{t("Page « OAuth2 », « URL Generator » : cochez « bot », puis les permissions « View Channels », « Read Message History », et « Send Messages » pour envoyer. Ouvrez l'adresse produite et ajoutez le bot à votre serveur.")}</li>
        </ol>
      );
    case "whatsapp":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")} <Lien href="https://developers.facebook.com/apps">developers.facebook.com/apps</Lien>
            {/* Meta ne propose plus de type d'app : un cas d'usage, puis le portefeuille d'entreprise (guide « Get started » de la Cloud API, relu le 28/09/2026). */}
            {t(", « Créer une app » : choisissez le cas d'usage « Connect with customers through WhatsApp » (communiquer avec vos clients sur WhatsApp), puis le portefeuille d'entreprise de votre organisation. Reliez-y le compte WhatsApp Business et le numéro de votre organisation.")}
          </li>
          <li>{t("WhatsApp, « Configuration de l'API » : recopiez l'identifiant du numéro de téléphone et l'identifiant du compte WhatsApp Business.")}</li>
          <li>
            {t("Dans les")} <Lien href="https://business.facebook.com/settings">{t("paramètres de l'entreprise")}</Lien>
            {t(", « Utilisateurs système » : créez-en un, donnez-lui l'app et le compte WhatsApp, puis générez un jeton avec whatsapp_business_messaging et whatsapp_business_management.")}
          </li>
          <li>{t("« Paramètres de l'app », « Général » : recopiez la clé secrète. Elle sert à reconnaître les messages que Meta envoie à l'instance.")}</li>
          <li>{t("Une fois connecté : dans WhatsApp, « Configuration », déclarez l'adresse du webhook et le jeton de vérification que cet écran affichera, puis abonnez-vous au champ « messages ».")}</li>
        </ol>
      );
  }
}

/** Ce qu'il faut savoir avant de brancher : les règles du service qui changent ce que les agents peuvent faire. */
function Regles({ id }: { id: IdMessagerie }) {
  const texte: Record<IdMessagerie, string> = {
    telegram: t("Un bot n'a pas d'historique : il lit les messages reçus depuis sa connexion, que Telegram garde 24 heures avant qu'ils soient relevés (l'instance les relève chaque minute). Un bot ne peut pas écrire le premier à une personne : on envoie dans une conversation où il a déjà reçu un message. Telegram limite à un message par seconde dans une conversation et vingt par minute dans un groupe."),
    discord: t("Le bot lit les salons des serveurs où il est invité, selon ses permissions. « Message Content Intent » s'active sans examen tant que le bot est sur moins de 100 serveurs ; au-delà, Discord l'examine. Les messages partent sans aucune mention (ni @everyone, ni rôle, ni personne)."),
    whatsapp: t("Règle de Meta : quand une personne écrit au numéro, une fenêtre de 24 heures s'ouvre, pendant laquelle on lui répond librement et gratuitement. Hors de cette fenêtre, seul un modèle de message approuvé par Meta peut partir, et Meta facture chaque modèle délivré, selon sa catégorie et le pays. Pour recevoir les messages, et donc savoir si la fenêtre est ouverte, Meta doit pouvoir joindre l'instance par une adresse publique en https ; sinon, seuls les modèles peuvent partir. Un numéro neuf envoie des modèles à 250 personnes différentes par jour au plus."),
  };
  return <p>{texte[id]}</p>;
}

export function ConnecteurMessagerie({ id, onChange }: { id: IdMessagerie; onChange?: () => void }) {
  const [etats, setEtats] = useState<EtatMessageries | null | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [jeton, setJeton] = useState("");
  const [numero, setNumero] = useState("");
  const [compte, setCompte] = useState("");
  const [secretApp, setSecretApp] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const relire = useCallback(async () => setEtats(await etatMessageries()), []);
  useEffect(() => {
    void relire();
  }, [relire]);

  const agir = async (fn: () => Promise<{ ok: boolean; message: string; etat?: EtatMessageries }>, apres?: () => void) => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const r = await fn();
    setEnCours(false);
    if (!r.ok) setErreur(r.message);
    else {
      setSucces(r.message);
      apres?.();
    }
    if (r.etat) setEtats(r.etat);
    else await relire();
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
  const etat: EtatMessagerie | undefined = etats?.services.find((s) => s.id === id);
  if (!etats || !etat) {
    return (
      <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
        {tf("L'instance {0} ne répond pas. Réessayez quand elle est joignable.", branding.name)}
      </InfoBox>
    );
  }
  const admin = etats.administrateur;
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
    const dernier = etat.webhook?.dernier ? new Date(etat.webhook.dernier) : null;
    return (
      <div className="space-y-3">
        {/* La pastille « Connecté » passe dessous quand la place manque : à 375 px, le nom se coupait lettre à lettre. */}
        <Card className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-40">
            {/* Un numéro ou un nom de bot se lit en entier, même à 375 px (vu à l'écran : « +… » coupé). */}
            <p className="break-words font-medium text-foreground">{etat.compte}</p>
            <p className="text-sm text-muted-foreground">
              {etat.envoi ? tf("{0}, lecture et envoi après accord", etat.nom) : tf("{0}, lecture seule", etat.nom)}
              {depuis && !Number.isNaN(depuis.getTime()) ? tf(", connecté le {0}", formaterDate(depuis)) : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">{t("Connecté")}</span>
        </Card>

        {etat.conflit && (
          <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
            {etat.conflit}
          </InfoBox>
        )}
        {id === "telegram" && etat.toutLeGroupe === false && (
          <InfoBox tone="muted" leading={<Info size={15} strokeWidth={1.75} />}>
            {t("Dans les groupes, ce bot ne voit que les messages qui le mentionnent ou lui répondent (mode confidentialité de Telegram). Pour qu'il lise tout, envoyez /setprivacy à BotFather, choisissez « Disable », puis ajoutez-le de nouveau au groupe.")}
          </InfoBox>
        )}
        {id === "discord" && etat.contenu === false && (
          <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
            {t("« Message Content Intent » n'est pas activée pour ce bot : Discord donne des messages vides, sauf ceux qui le mentionnent. Activez-la dans le portail développeur (page « Bot »), puis reconnectez le bot.")}
          </InfoBox>
        )}
        {id === "whatsapp" && etat.webhook && (
          // Sans carte autour : à 375 px, une carte de plus dans le panneau ne laissait qu'une colonne de quelques mots aux adresses à copier.
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{t("Recevoir les messages : le webhook à déclarer chez Meta")}</p>
            <ACopier valeur={etat.webhook.adresse} libelle={t("l'adresse du webhook")} note={t("Meta exige une adresse publique en https, avec un certificat valide. Si l'instance n'est joignable que sur ce réseau, les messages n'arriveront pas, et seuls les modèles pourront partir.")} />
            {etat.webhook.verification && <ACopier valeur={etat.webhook.verification} libelle={t("le jeton de vérification")} note={t("À coller dans « Jeton de vérification », à côté de l'adresse, puis abonnez-vous au champ « messages ».")} />}
            {!etat.webhook.signature && (
              <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
                {t("Sans la clé secrète de l'application, l'instance ne peut pas vérifier que les messages viennent de Meta : elle ne les lit pas. Reconnectez WhatsApp avec la clé secrète pour recevoir.")}
              </InfoBox>
            )}
            <p className="text-xs text-muted-foreground">
              {dernier && !Number.isNaN(dernier.getTime()) ? tf("Dernière notification de Meta : {0}.", formaterDate(dernier)) : t("Aucune notification de Meta reçue pour l'instant.")}
            </p>
          </div>
        )}

        <InfoBox leading={<Lock size={15} strokeWidth={1.75} />}>
          {etat.envoi
            ? t("Vos agents lisent les messages reçus, et peuvent proposer d'envoyer un message : chaque message vous est montré en entier, avec son destinataire, et ne part qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation. Seul l'administrateur de l'instance peut envoyer. Un message reçu n'est jamais pris pour une consigne. Le jeton est conservé chiffré sur l'instance et n'en ressort jamais.")
            : t("Lecture seule : vos agents lisent les messages reçus, sans rien envoyer. Un message reçu n'est jamais pris pour une consigne. Le jeton est conservé chiffré sur l'instance et n'en ressort jamais.")}
        </InfoBox>
        {admin && (
          <Card className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("Permettre l'envoi de messages")}</p>
              <p className="text-xs text-muted-foreground">{t("Chaque message attendra votre accord, sur une carte qui le montre en entier.")}</p>
            </div>
            <Switch checked={Boolean(etat.envoi)} disabled={enCours} label={t("Permettre l'envoi de messages")} onChange={(v) => void agir(() => reglerEnvoiMessagerie(id, v))} />
          </Card>
        )}
        {messages}
        {admin && (
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" icon={enCours ? Loader2 : Trash2} disabled={enCours} onClick={() => void agir(() => oublierMessagerie(id))}>
              {tf("Débrancher {0}", etat.nom)}
            </Button>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------ à brancher, ou à reconnecter ---------------------- */
  const pret = jeton.trim() && (id !== "whatsapp" || (numero.trim() && compte.trim()));
  const lancer = () =>
    agir(
      () => connecterMessagerie({ service: id, jeton: jeton.trim(), envoi, ...(id === "whatsapp" ? { numero: numero.trim(), compte: compte.trim(), secretApp: secretApp.trim() } : {}) }),
      () => {
        // Le jeton ne reste pas dans l'onglet une fois accepté.
        setJeton("");
        setSecretApp("");
      },
    );

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-medium text-foreground">{tf("{0} : se connecter", etat.nom)}</p>
        <p className="text-sm text-muted-foreground">
          {id === "whatsapp"
            ? tf("Avec le numéro WhatsApp Business de votre organisation et un jeton de Meta. {0} parle à Meta directement, sans intermédiaire.", branding.name)
            : tf("Avec un bot que votre organisation crée chez {0}, une fois. {1} parle à {0} directement, sans intermédiaire.", etat.nom, branding.name)}
        </p>
      </div>
      {etat.aReconnecter && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {tf("{0} refuse le jeton enregistré (révoqué ou régénéré). Collez-en un nouveau.", etat.nom)}
        </InfoBox>
      )}
      {!etats.chiffrement && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Le chiffrement des données n'est pas actif sur cette instance : aucun jeton ne sera enregistré tant que ce sera le cas.")}
        </InfoBox>
      )}
      <InfoBox leading={<KeyRound size={15} strokeWidth={1.75} />}>
        <div className="space-y-2">
          <p className="font-medium">{id === "whatsapp" ? t("Préparer le numéro, une fois pour toute l'instance") : t("Créer le bot, une fois pour toute l'instance")}</p>
          <Guide id={id} />
          <p className="font-medium">{t("Ce qu'il faut savoir")}</p>
          <Regles id={id} />
          <p className="text-xs">{t("Les libellés des consoles changent parfois : cherchez l'équivalent.")}</p>
        </div>
      </InfoBox>

      {!admin ? (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {tf("Seul l'administrateur de l'instance peut brancher {0} : ce service parle au nom de toute l'organisation. Transmettez-lui ces étapes.", etat.nom)}
        </InfoBox>
      ) : (
        <>
          <Field label={id === "whatsapp" ? t("Jeton de l'utilisateur système") : t("Jeton du bot")} hint={t("Gardé chiffré sur l'instance, il n'en ressort jamais.")}>
            <Input type="password" value={jeton} onChange={(e) => setJeton(e.target.value)} autoComplete="off" spellCheck={false} placeholder={id === "telegram" ? "123456789:AA…" : id === "whatsapp" ? "EAA…" : ""} />
          </Field>
          {id === "whatsapp" && (
            <>
              <Field label={t("Identifiant du numéro de téléphone")}>
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} autoComplete="off" spellCheck={false} inputMode="numeric" />
              </Field>
              <Field label={t("Identifiant du compte WhatsApp Business")}>
                <Input value={compte} onChange={(e) => setCompte(e.target.value)} autoComplete="off" spellCheck={false} inputMode="numeric" />
              </Field>
              <Field label={t("Clé secrète de l'application Meta")} hint={t("Pour recevoir les messages. Gardée chiffrée sur l'instance, elle n'en ressort jamais.")}>
                <Input type="password" value={secretApp} onChange={(e) => setSecretApp(e.target.value)} autoComplete="off" spellCheck={false} />
              </Field>
            </>
          )}
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" className="mt-1" checked={envoi} onChange={() => setEnvoi((v) => !v)} />
            <span>
              {t("Permettre aussi d'envoyer des messages.")}{" "}
              <span className="text-muted-foreground">{t("Chaque message vous sera montré en entier, avec son destinataire, et demandera votre accord.")}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t("Le jeton est essayé avant tout enregistrement.")}</p>
            <Button size="sm" icon={enCours ? Loader2 : Link2} disabled={enCours || !pret || !etats.chiffrement} onClick={() => void lancer()}>
              {enCours ? t("Vérification…") : tf("Connecter {0}", etat.nom)}
            </Button>
          </div>
        </>
      )}
      {messages}
    </Card>
  );
}

export default ConnecteurMessagerie;
