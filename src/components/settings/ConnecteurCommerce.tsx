import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, Cloud, CreditCard, ExternalLink, Handshake, Headset, KeyRound, Link2, Loader2, Lock, ShieldAlert, ShoppingBag, ShoppingCart, Trash2, type LucideIcon } from "lucide-react";
import type { ServiceMaison } from "@/components/settings/Connecteurs";
import type { CleMarquePetite } from "@/components/ui/marques";
import { connecterCommerce, enregistrerCommerce, etatCommerce, oublierCommerce, type EtatCommerce, type EtatsCommerce, type IdCommerce } from "@/lib/commerce";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { ACopier } from "@/components/ui/ACopier";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";

/**
 * Panneau d'un service de commerce ou de relation client
 * (gateway/src/natifs/commerce.ts, 28/09/2026, demandé par Medhi) : Stripe,
 * Shopify, WooCommerce, Salesforce, Pipedrive, Zendesk.
 *
 * Trois façons de brancher, et l'écran dit laquelle : une clé en lecture
 * (Stripe, WooCommerce), les identifiants d'une application de la même
 * organisation (Shopify), ou une application déclarée chez le service puis un
 * accord dans le navigateur (Salesforce, Pipedrive, Zendesk). Les étapes
 * décrivent les consoles telles que leur documentation les présentait le
 * 28/09/2026 ; leurs libellés changent, et l'écran le dit.
 */

/*
 * Icônes neutres (Lucide) en attendant les logos officiels, qu'un autre
 * travail pose : une ligne de la liste « maison » ne lit pas
 * MARQUE_DU_CONNECTEUR, il suffira donc de donner ici la clé de marque
 * (`stripe`, `shopify`, `woocommerce`, `salesforce`, `pipedrive`, `zendesk`)
 * en quatrième colonne, qui passe avant l'icône.
 */
const LISTE: [IdCommerce, string, LucideIcon, CleMarquePetite?][] = [
  ["stripe", "Stripe", CreditCard],
  ["shopify", "Shopify", ShoppingBag],
  ["woocommerce", "WooCommerce", ShoppingCart],
  ["salesforce", "Salesforce", Cloud],
  ["pipedrive", "Pipedrive", Handshake],
  ["zendesk", "Zendesk", Headset],
];

/** Les six lignes de la liste des connecteurs (Paramètres, Connecteurs), chacune avec son panneau. */
export function useServicesCommerce(ouvert: string | null, basculer: (cle: string) => void): ServiceMaison[] {
  const [etats, setEtats] = useState<EtatCommerce[]>([]);
  const relire = useCallback(() => {
    void etatCommerce().then((e) => setEtats(e?.services ?? []));
  }, []);
  useEffect(relire, [relire]);
  const description: Record<IdCommerce, string> = {
    stripe: t("Paiements, clients, factures et abonnements, en lecture seule"),
    shopify: t("Commandes, produits et stocks de la boutique"),
    woocommerce: t("Commandes et produits de la boutique"),
    salesforce: t("Contacts et opportunités, notes après accord"),
    pipedrive: t("Contacts et affaires, notes après accord"),
    zendesk: t("Tickets, réponses après accord"),
  };
  return LISTE.map(([id, label, icone, marque]) => {
    const e = etats.find((s) => s.id === id);
    return {
      id,
      label,
      description: e?.configure ? tf("Connecté : {0}", e.compte ?? "") : e?.aReconnecter ? t("Accès perdu, à reconnecter") : description[id],
      categorie: t("Commerce et relation client"),
      ...(marque ? { marque } : { icone }),
      connecte: Boolean(e?.configure),
      ouvert: ouvert === id,
      onBasculer: () => basculer(id),
      panneau: <ConnecteurCommerce id={id} onChange={relire} />,
    };
  });
}

function Lien({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="underline" href={href} target="_blank" rel="noreferrer noopener">
      {children} <ExternalLink size={11} className="inline" />
    </a>
  );
}

/** Comment créer la clé ou l'application, service par service. */
function Guide({ id }: { id: IdCommerce }) {
  switch (id) {
    case "stripe":
      // https://docs.stripe.com/keys/restricted-api-keys
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Dans le Dashboard Stripe,")} <Lien href="https://dashboard.stripe.com/apikeys">{t("Clés API")}</Lien>
            {t(" : « Créer une clé limitée ».")}
          </li>
          <li>{t("Donnez « Lecture » à PaymentIntents, Customers, Invoices et Subscriptions, et laissez « Aucune » partout ailleurs.")}</li>
          <li>{t("Recopiez la clé, qui commence par rk_live_ (ou rk_test_ pour essayer en mode test). Une clé secrète (sk_…) est refusée : elle ouvre tout le compte.")}</li>
        </ol>
      );
    case "shopify":
      // https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")} <Lien href="https://dev.shopify.com/dashboard">dev.shopify.com</Lien>
            {t(" (Dev Dashboard), avec un compte de la même organisation que la boutique : « Create app ».")}
          </li>
          <li>{t("Dans la version de l'application, portées d'accès : read_orders, read_products et read_inventory, rien d'autre. Publiez la version (« Release »).")}</li>
          <li>{t("Installez l'application sur la boutique, puis recopiez le « Client ID » et le « Client secret » de ses réglages (« Settings »).")}</li>
        </ol>
      );
    case "woocommerce":
      // https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t("Dans l'administration WordPress : WooCommerce, Réglages, Avancé, API REST, « Ajouter une clé ».")}</li>
          <li>{t("Autorisations : « Lecture ». Recopiez la clé client (ck_…) et le secret client (cs_…) : WooCommerce ne les montre qu'une fois.")}</li>
          <li>{t("La boutique doit répondre en https, et les permaliens de WordPress ne doivent pas être « Simple ».")}</li>
        </ol>
      );
    case "salesforce":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t("Dans Setup (Configuration) : « External Client App Manager », « New External Client App ».")}</li>
          <li>{t("Activez OAuth. « Callback URL » : l'adresse de retour ci-dessous, à l'identique. Portées : « Manage user data via APIs (api) » et « Perform requests at any time (refresh_token, offline_access) ». Cochez l'exigence de PKCE.")}</li>
          <li>{t("Recopiez la « Consumer Key » et, si l'application en a un, le « Consumer Secret ».")}</li>
        </ol>
      );
    case "pipedrive":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            {t("Sur")} <Lien href="https://developers.pipedrive.com">developers.pipedrive.com</Lien>
            {t(" (Developer Hub) : « Create an app », de type « Private app ».")}
          </li>
          <li>{t("« Basic info » : un nom, et en « OAuth Callback URL » l'adresse de retour ci-dessous, à l'identique.")}</li>
          <li>{t("« OAuth & access scopes » : Deals et Contacts en « Read only », ou en « Full access » pour ajouter des notes (cochez alors la case plus bas). Recopiez le « Client ID » et le « Client secret ».")}</li>
        </ol>
      );
    case "zendesk":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t("Dans le Centre d'administration de Zendesk : Applications et intégrations, API, Clients OAuth, « Ajouter un client OAuth ».")}</li>
          <li>{t("Type de client : « Confidentiel ». URL de redirection : l'adresse de retour ci-dessous, à l'identique.")}</li>
          <li>{t("Recopiez l'identifiant et le secret (Zendesk ne montre le secret qu'une fois), et indiquez le sous-domaine de votre compte.")}</li>
        </ol>
      );
  }
}

/** Ce que permet la connexion, et ce qui demande un examen du service. */
function Portee({ id }: { id: IdCommerce }) {
  const texte: Record<IdCommerce, string> = {
    stripe: t("Aucun examen. Lecture seule : paiements, clients, factures, abonnements. Rien ne peut être remboursé, encaissé ni viré par ce connecteur, quelle que soit la clé."),
    shopify: t("Aucun examen pour une boutique de votre organisation. Lecture seule : commandes (les 60 derniers jours), produits, stocks. L'accès dure 24 heures et se renouvelle seul."),
    woocommerce: t("Aucun examen. Lecture seule : commandes et produits."),
    salesforce: t("Aucun examen : l'application reste dans votre organisation. Salesforce n'a pas d'accès en lecture seule par son API : le logiciel ne fait que lire, et ajoute une note seulement si la case est cochée. Connectez-vous avec un utilisateur qui n'a que les droits utiles."),
    pipedrive: t("Aucun examen pour une application privée. Les accès choisis dans l'application doivent correspondre à la case cochée ici, sinon la connexion est refusée."),
    zendesk: t("Aucun examen. Lecture : tickets et leurs échanges. Répondre, si la case est cochée : une réponse publique, que Zendesk envoie au client, ou une note interne."),
  };
  return <p>{texte[id]}</p>;
}

/** Traduit au rendu, pas au chargement du module : la langue n'est pas encore connue à ce moment-là. */
function libelleEcriture(id: IdCommerce): string {
  if (id === "salesforce") return t("Permettre d'ajouter des notes aux contacts, opportunités et comptes.");
  if (id === "pipedrive") return t("Permettre d'ajouter des notes aux affaires et aux personnes (l'application doit avoir « Full access »).");
  return t("Permettre de répondre aux tickets (réponse publique ou note interne).");
}

export function ConnecteurCommerce({ id, onChange }: { id: IdCommerce; onChange?: () => void }) {
  const [etats, setEtats] = useState<EtatsCommerce | null | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [adresseAccord, setAdresseAccord] = useState<string | null>(null);
  const [champs, setChamps] = useState({ cle: "", secret: "", clientId: "", adresse: "" });
  const [bac, setBac] = useState(false);
  const [ecriture, setEcriture] = useState(false);

  const relire = useCallback(async () => {
    const e = await etatCommerce();
    setEtats(e);
    return e?.services.find((s) => s.id === id) ?? null;
  }, [id]);

  useEffect(() => {
    void relire();
  }, [relire]);

  const etat: EtatCommerce | undefined = etats?.services.find((s) => s.id === id);
  const attente = Boolean(etat?.attente);
  // L'accord se donne chez le service : seule l'instance sait quand il est revenu.
  useEffect(() => {
    if (!attente) return;
    const minuterie = setInterval(() => {
      void relire().then((e) => {
        if (!e || e.attente) return;
        setAdresseAccord(null);
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
  const vider = () => setChamps({ cle: "", secret: "", clientId: "", adresse: "" });
  const champ = (cle: keyof typeof champs) => ({ value: champs[cle], onChange: (e: { target: { value: string } }) => setChamps((c) => ({ ...c, [cle]: e.target.value })), autoComplete: "off", spellCheck: false });

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
    const ecrit = etat.accordes?.includes("ecriture");
    return (
      <div className="space-y-3">
        <Card className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-40">
            <p className="break-words font-medium text-foreground">{etat.compte}</p>
            <p className="text-sm text-muted-foreground">
              {ecrit ? tf("{0}, lecture et écriture après accord", etat.nom) : tf("{0}, lecture seule", etat.nom)}
              {depuis && !Number.isNaN(depuis.getTime()) ? tf(", connecté le {0}", formaterDate(depuis)) : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">{t("Connecté")}</span>
        </Card>
        <InfoBox leading={<Lock size={15} strokeWidth={1.75} />}>
          {ecrit
            ? t("Vos agents peuvent lire, et proposer d'écrire : chaque écriture vous est montrée en entier et n'a lieu qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation. Seul l'administrateur de l'instance peut écrire. L'accès est conservé chiffré sur l'instance et n'en ressort jamais.")
            : t("Lecture seule : vos agents peuvent lire, sans rien modifier ni publier. L'accès est conservé chiffré sur l'instance et n'en ressort jamais.")}
        </InfoBox>
        {messages}
        {admin && (
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" icon={enCours ? Loader2 : Trash2} disabled={enCours} onClick={() => void agir(() => oublierCommerce(id))}>
              {tf("Débrancher {0}", etat.nom)}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const lancer = () =>
    agir(
      () => connecterCommerce(id, ecriture),
      (url) => {
        if (!url) return;
        setAdresseAccord(url);
        // Dans l'application de bureau, la fenêtre native confie ce lien au navigateur.
        window.open(url, "_blank", "noopener,noreferrer");
      },
    );
  const enregistrer = (valeurs: Parameters<typeof enregistrerCommerce>[1]) => agir(() => enregistrerCommerce(id, valeurs), vider);
  const oauth = etat.mode === "oauth";

  /** Le formulaire de l'administrateur : une clé, des identifiants, ou l'application puis l'accord. */
  let formulaire: ReactNode;
  if (id === "stripe") {
    formulaire = (
      <>
        <Field label={t("Clé restreinte Stripe (rk_live_… ou rk_test_…)")} hint={t("Gardée chiffrée sur l'instance, elle n'en ressort jamais.")}>
          <Input type="password" {...champ("cle")} />
        </Field>
        <div className="flex justify-end">
          <Button size="sm" icon={enCours ? Loader2 : Check} disabled={enCours || !champs.cle.trim()} onClick={() => void enregistrer({ cle: champs.cle.trim() })}>
            {t("Vérifier et connecter")}
          </Button>
        </div>
      </>
    );
  } else if (id === "woocommerce") {
    formulaire = (
      <>
        <Field label={t("Adresse de la boutique")}>
          <Input {...champ("adresse")} placeholder="https://boutique.exemple.fr" inputMode="url" />
        </Field>
        <Field label={t("Clé client (ck_…)")}>
          <Input type="password" {...champ("cle")} />
        </Field>
        <Field label={t("Secret client (cs_…)")} hint={t("Gardés chiffrés sur l'instance, ils n'en ressortent jamais.")}>
          <Input type="password" {...champ("secret")} />
        </Field>
        <div className="flex justify-end">
          <Button size="sm" icon={enCours ? Loader2 : Check} disabled={enCours || !champs.adresse.trim() || !champs.cle.trim() || !champs.secret.trim()} onClick={() => void enregistrer({ adresse: champs.adresse.trim(), cle: champs.cle.trim(), secret: champs.secret.trim() })}>
            {t("Vérifier et connecter")}
          </Button>
        </div>
      </>
    );
  } else if (id === "shopify") {
    formulaire = (
      <>
        <Field label={t("Boutique Shopify")}>
          <Input {...champ("adresse")} placeholder="ma-boutique.myshopify.com" />
        </Field>
        <Field label={tf("Identifiant de l'application {0}", etat.nom)}>
          <Input {...champ("clientId")} />
        </Field>
        <Field label={t("Secret de l'application")} hint={t("Gardé chiffré sur l'instance, il n'en ressort jamais.")}>
          <Input type="password" {...champ("secret")} />
        </Field>
        <div className="flex justify-end">
          <Button size="sm" icon={enCours ? Loader2 : Check} disabled={enCours || !champs.adresse.trim() || !champs.clientId.trim() || !champs.secret.trim()} onClick={() => void enregistrer({ adresse: champs.adresse.trim(), clientId: champs.clientId.trim(), secret: champs.secret.trim() })}>
            {t("Vérifier et connecter")}
          </Button>
        </div>
      </>
    );
  } else if (!etat.application.disponible) {
    formulaire = (
      <>
        {id === "zendesk" && (
          <Field label={t("Sous-domaine Zendesk")}>
            <Input {...champ("adresse")} placeholder="societe.zendesk.com" />
          </Field>
        )}
        <Field label={tf("Identifiant de l'application {0}", etat.nom)}>
          <Input {...champ("clientId")} />
        </Field>
        <Field label={id === "salesforce" ? t("Secret de l'application, s'il y en a un") : t("Secret de l'application")} hint={t("Gardé chiffré sur l'instance, il n'en ressort jamais.")}>
          <Input type="password" {...champ("secret")} />
        </Field>
        {id === "salesforce" && (
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" className="mt-1" checked={bac} onChange={() => setBac((b) => !b)} />
            <span>{t("Organisation de test (sandbox), qui se connecte par test.salesforce.com.")}</span>
          </label>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={enCours ? Loader2 : Check}
            disabled={enCours || !champs.clientId.trim() || (id !== "salesforce" && !champs.secret.trim()) || (id === "zendesk" && !champs.adresse.trim())}
            onClick={() => void enregistrer({ clientId: champs.clientId.trim(), secret: champs.secret.trim(), ...(id === "zendesk" ? { adresse: champs.adresse.trim() } : {}), ...(id === "salesforce" ? { bac } : {}) })}
          >
            {t("Enregistrer l'application")}
          </Button>
        </div>
      </>
    );
  } else {
    formulaire = (
      <>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-1" checked={ecriture} onChange={() => setEcriture((e) => !e)} disabled={attente} />
          <span>
            {libelleEcriture(id)} <span className="text-muted-foreground">{t("Chaque écriture ou publication vous sera montrée et demandera votre accord.")}</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-xs text-muted-foreground">
            {tf("Application : {0}", `${etat.application.identifiant ?? ""}${etat.application.adresse ? ` (${etat.application.adresse})` : ""}${etat.application.bac ? " (sandbox)" : ""}`)}
            {" · "}
            <button type="button" className="underline" disabled={enCours || attente} onClick={() => void agir(() => oublierCommerce(id, true))}>
              {t("la retirer")}
            </button>
          </p>
          <Button size="sm" icon={enCours || attente ? Loader2 : Link2} disabled={enCours || attente} onClick={() => void lancer()}>
            {attente ? t("En attente de votre accord…") : tf("Se connecter à {0}", etat.nom)}
          </Button>
        </div>
        {adresseAccord && (
          <p className="text-sm text-muted-foreground">
            {t("La page du service ne s'est pas ouverte ?")} <Lien href={adresseAccord}>{t("L'ouvrir")}</Lien>
          </p>
        )}
      </>
    );
  }

  return (
    <Card className="space-y-3 max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
      <div>
        <p className="font-medium text-foreground">{tf("{0} : se connecter", etat.nom)}</p>
        <p className="text-sm text-muted-foreground">
          {etat.mode === "cle"
            ? tf("Avec une clé en lecture que votre organisation crée chez {0}, une fois.", etat.nom)
            : etat.mode === "identifiants"
              ? t("Avec une application que votre organisation crée pour sa propre boutique, une fois.")
              : tf("Avec l'application que votre organisation déclare chez {0}, une fois, puis votre accord dans le navigateur.", etat.nom)}
        </p>
      </div>
      {etat.aReconnecter && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {tf("{0} n'accepte plus l'accès enregistré (révoqué, expiré, ou application changée). Reconnectez-vous.", etat.nom)}
        </InfoBox>
      )}
      <InfoBox leading={<KeyRound size={15} strokeWidth={1.75} />}>
        <div className="space-y-2 [overflow-wrap:anywhere]">
          <p className="font-medium">{oauth || id === "shopify" ? t("Préparer l'application, une fois pour toute l'instance") : t("Créer la clé, une fois pour toute l'instance")}</p>
          <Guide id={id} />
          <p className="font-medium">{t("Ce que permet la connexion")}</p>
          <Portee id={id} />
          <p className="text-xs">{t("Les libellés des consoles changent parfois : cherchez l'équivalent.")}</p>
        </div>
      </InfoBox>
      {oauth && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t("Adresse de retour à déclarer chez le fournisseur")}</p>
          <ACopier valeur={etat.retour} libelle={t("l'adresse de retour")} note={t("C'est l'adresse par laquelle ce navigateur atteint l'instance. Si le fournisseur exige https, ouvrez l'instance par une adresse en https.")} />
        </div>
      )}
      {!admin ? (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {tf("Seul l'administrateur de l'instance peut brancher {0} : ce service agit au nom de toute l'organisation. Transmettez-lui ces étapes.", etat.nom)}
        </InfoBox>
      ) : (
        formulaire
      )}
      {messages}
    </Card>
  );
}
