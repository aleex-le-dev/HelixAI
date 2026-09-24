import { useEffect, useMemo, useState } from "react";
import { Mail, Info, Loader2, Check, Trash2, Lock, ShieldAlert, Send } from "lucide-react";
import {
  etat as lireEtat,
  configurer as enregistrerCompte,
  oublier as retirerCompte,
  reglerEnvoi,
  reglerConfirmation,
  deviner,
  type Chiffrement,
  type EtatCourrier,
  type ReglageFournisseur,
  type ServeurEnvoi,
} from "@/lib/courrier";
import { Switch } from "@/components/ui/Switch";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { CourrierOauth } from "@/components/settings/CourrierOauth";
import { branding } from "@/config/branding";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";

/**
 * Configuration du connecteur courrier, en IMAP.
 *
 * Trois choix guident cet écran.
 *
 * Le premier : le formulaire se pré-remplit à partir du domaine de l'adresse,
 * mais rien n'est imposé. Un artisan qui tape « contact@sa-societe.fr » ne verra
 * aucune suggestion, parce que son domaine est le sien ; il doit alors pouvoir
 * saisir son serveur sans se battre contre un champ deviné.
 *
 * Le deuxième : le mot de passe d'application est annoncé **avant** que
 * l'utilisateur n'essaie son mot de passe habituel. C'est la cause numéro un
 * d'échec sur Gmail et Outlook, et découvrir la contrainte après trois refus
 * donne l'impression que le produit ne marche pas.
 *
 * Le troisième : rien n'est enregistré tant que la connexion n'a pas réussi.
 * L'instance essaie pour de bon avant d'écrire ; l'écran ne prétend donc jamais
 * qu'une boîte est branchée alors qu'elle ne l'est pas.
 */

const CHIFFREMENTS: { value: Chiffrement; label: string }[] = [
  { value: "tls", label: t("TLS direct (port 993, le plus courant)") },
  { value: "starttls", label: t("STARTTLS (port 143 ou 1143)") },
];

const CHIFFREMENTS_ENVOI: { value: Chiffrement; label: string }[] = [
  { value: "tls", label: t("TLS direct (port 465, le plus courant)") },
  { value: "starttls", label: t("STARTTLS (port 587)") },
];

/**
 * Envoi de mails par les agents.
 *
 * Coupé par défaut : brancher une boîte ne doit pas, à soi seul, donner aux
 * agents le droit d'écrire au nom de l'entreprise. L'activer ne demande pas le
 * mot de passe (c'est celui de la boîte, déjà sur l'instance) et, chez un
 * fournisseur connu, tient en un geste. Une fois actif, chaque mail est montré
 * en entier et ne part qu'après un « Envoyer » : c'est la passerelle qui
 * l'exige, quel que soit le niveau d'approbation.
 */
function EnvoiDeMails({ etat, fournisseurs, onEtat }: { etat: EtatCourrier; fournisseurs: ReglageFournisseur[]; onEtat: (e: EtatCourrier | null) => void }) {
  // Le fournisseur se reconnaît d'abord à son serveur IMAP (un domaine d'entreprise hébergé chez Gmail), puis à l'adresse.
  const fournisseur =
    fournisseurs.find((f) => f.serveur === etat.serveur && f.smtp) ?? deviner(etat.adresse ?? "", fournisseurs);
  const defaut = fournisseur?.smtp;
  const [ouvert, setOuvert] = useState(false);
  const [serveur, setServeur] = useState(defaut?.serveur ?? "");
  const [port, setPort] = useState(String(defaut?.port ?? 465));
  const [chiffrement, setChiffrement] = useState<Chiffrement>(defaut?.chiffrement ?? "tls");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const actif = Boolean(etat.envoi);
  const sansAccord = Boolean(etat.envoiSansAccord);

  const confirmer = async (voulu: boolean) => {
    setEnCours(true);
    setErreur(null);
    const r = await reglerConfirmation(voulu);
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    onEtat(await lireEtat());
  };

  const regler = async (smtp: ServeurEnvoi | null) => {
    setEnCours(true);
    setErreur(null);
    const r = await reglerEnvoi(smtp);
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      // Les réglages devinés n'ont pas suffi : on montre ce qui a été essayé, pour corriger.
      if (smtp) setOuvert(true);
      return;
    }
    setOuvert(false);
    onEtat(await lireEtat());
  };

  const basculer = (voulu: boolean) => {
    if (!voulu) return void regler(null);
    if (defaut && !ouvert) return void regler(defaut);
    setOuvert(true);
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <Send size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{t("Envoi de mails")}</p>
          <p className="text-sm text-muted-foreground">
            {actif && etat.envoi
              ? tf("Les agents peuvent envoyer depuis cette boîte, par {0}:{1}.", etat.envoi.serveur, etat.envoi.port)
              : t("Désactivé : les agents préparent des brouillons, que vous relisez et envoyez vous-même.")}
          </p>
          {!actif && !ouvert && (
            <button
              type="button"
              className="mt-1 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              onClick={() => setOuvert(true)}
            >
              {t("Choisir le serveur d'envoi")}
            </button>
          )}
        </div>
        {enCours ? (
          <Loader2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={actif} onChange={basculer} label={t("Permettre aux agents d'envoyer des mails")} />
        )}
      </div>

      {actif && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t("Envoyer sans me demander")}</p>
              <p className="text-sm text-muted-foreground">
                {sansAccord
                  ? t("Les mails partent sans confirmation au niveau « Tout approuver » et depuis un agent autonome. Aux autres niveaux, chacun vous est encore montré.")
                  : t("Coupé : chaque mail vous est montré en entier et ne part qu'après votre accord, quel que soit le niveau d'approbation.")}
              </p>
            </div>
            <Switch
              checked={sansAccord}
              onChange={(v) => void confirmer(v)}
              label={t("Envoyer des mails sans demander mon accord")}
              disabled={enCours}
            />
          </div>
          {sansAccord && (
            <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
              {t("Un mail envoyé ne se reprend pas, et le texte d'un mail ou d'un document lu par l'assistant peut chercher à le détourner. Un agent qui répond à un mail reçu demande toujours avant d'envoyer, quel que soit ce réglage. Chaque envoi reste au journal.")}
            </InfoBox>
          )}
        </div>
      )}

      {ouvert && !actif && (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {t("Le serveur d'envoi (SMTP) de votre messagerie. Il se connecte avec l'identifiant et le mot de passe de la boîte : rien à ressaisir.")}
          </p>
          <div className="grid gap-4 cq-sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label={t("Serveur d'envoi")} required>
              <Input placeholder="smtp.exemple.fr" value={serveur} onChange={(e) => setServeur(e.target.value)} />
            </Field>
            <Field label={t("Port")} required>
              <Input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <Field label={t("Chiffrement")}>
            <Select
              value={chiffrement}
              onChange={(v) => {
                setChiffrement(v === "starttls" ? "starttls" : "tls");
                setPort(v === "starttls" ? "587" : "465");
              }}
              options={CHIFFREMENTS_ENVOI}
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setOuvert(false)} disabled={enCours}>
              {t("Annuler")}
            </Button>
            <Button
              icon={enCours ? Loader2 : Send}
              disabled={enCours || !serveur.trim() || !(Number(port) > 0)}
              onClick={() => void regler({ serveur: serveur.trim(), port: Number(port), chiffrement })}
            >
              {enCours ? "Essai…" : "Activer l'envoi"}
            </Button>
          </div>
        </div>
      )}

      {/* Pas de bandeau de succès : l'interrupteur et la phrase au-dessus disent déjà l'état. */}
      {erreur && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}
    </Card>
  );
}

interface Formulaire {
  adresse: string;
  identifiant: string;
  motDePasse: string;
  serveur: string;
  port: string;
  chiffrement: Chiffrement;
}

const VIDE: Formulaire = {
  adresse: "",
  identifiant: "",
  motDePasse: "",
  serveur: "",
  port: "993",
  chiffrement: "tls",
};

/** `onChange` prévient l'écran : sans lui, la pastille de la tuile
 *  resterait sur « Connecter » après une connexion réussie. */
export function CourrierIMAP({ onChange }: { onChange?: () => void } = {}) {
  const [etat, setEtat] = useState<EtatCourrier | null | undefined>(undefined);
  const [form, setForm] = useState<Formulaire>(VIDE);
  /* Ce que l'utilisateur a saisi lui-même ne doit pas être écrasé par une
   * suggestion : sans cette mémoire, corriger le serveur d'un compte
   * professionnel hébergé chez Gmail était impossible. */
  const [manuel, setManuel] = useState<Record<string, boolean>>({});
  const [enCours, setEnCours] = useState(false);
  const [retrait, setRetrait] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [parAutorisation, setParAutorisation] = useState(false);

  /**
   * Le fournisseur reconnu accepte-t-il la connexion par autorisation ?
   *
   * Reconnu à l'adresse, et non à un réglage : c'est le domaine du serveur qui
   * dit chez qui la boîte est hébergée. Une adresse d'entreprise chez Google
   * Workspace ne finit pas par « @gmail.com », d'où la lecture du serveur IMAP
   * suggéré plutôt que celle de l'adresse.
   */
  const oauthPossible: "google" | "microsoft" | null = (() => {
    const indice = `${form.adresse} ${form.serveur}`.toLowerCase();
    if (/gmail|googlemail|google/.test(indice)) return "google";
    if (/outlook|office365|hotmail|live\.|microsoft/.test(indice)) return "microsoft";
    return null;
  })();

  useEffect(() => {
    let vivant = true;
    void lireEtat().then((e) => {
      if (vivant) setEtat(e);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const fournisseurs: ReglageFournisseur[] = etat?.fournisseurs ?? [];
  const suggestion = useMemo(
    () => deviner(form.adresse, fournisseurs),
    [form.adresse, fournisseurs],
  );

  /** Applique une suggestion sans jamais recouvrir une saisie manuelle. */
  const majAdresse = (adresse: string) => {
    const trouve = deviner(adresse, fournisseurs);
    setForm((f) => ({
      ...f,
      adresse,
      identifiant: manuel.identifiant ? f.identifiant : adresse,
      serveur: trouve && !manuel.serveur ? trouve.serveur : f.serveur,
      port: trouve && !manuel.port ? String(trouve.port) : f.port,
      chiffrement: trouve && !manuel.chiffrement ? trouve.chiffrement : f.chiffrement,
    }));
  };

  const appliquerFournisseur = (nom: string) => {
    const trouve = fournisseurs.find((f) => f.nom === nom);
    if (!trouve) return;
    setForm((f) => ({
      ...f,
      serveur: trouve.serveur,
      port: String(trouve.port),
      chiffrement: trouve.chiffrement,
    }));
    // Choisir explicitement un fournisseur reprend la main sur les suggestions.
    setManuel((m) => ({ ...m, serveur: true, port: true, chiffrement: true }));
  };

  const champ = (cle: keyof Formulaire, valeur: string) => {
    setForm((f) => ({ ...f, [cle]: valeur }));
    setManuel((m) => ({ ...m, [cle]: true }));
  };

  const soumettre = async () => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const resultat = await enregistrerCompte({
      adresse: form.adresse.trim(),
      identifiant: (form.identifiant || form.adresse).trim(),
      motDePasse: form.motDePasse,
      serveur: form.serveur.trim(),
      port: Number(form.port),
      chiffrement: form.chiffrement,
    });
    setEnCours(false);
    if (!resultat.ok) {
      setErreur(resultat.message);
      return;
    }
    setSucces(resultat.message);
    // Le mot de passe ne reste pas en mémoire de l'onglet une fois accepté.
    setForm(VIDE);
    setManuel({});
    setEtat(await lireEtat());
    onChange?.();
  };

  const retirer = async () => {
    setRetrait(true);
    setErreur(null);
    setSucces(null);
    const resultat = await retirerCompte();
    setRetrait(false);
    if (!resultat.ok) {
      setErreur(resultat.message);
      return;
    }
    setSucces(resultat.message);
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
        {t("L'instance")}{" "}{branding.name}{" "}{t("ne répond pas. Le courrier se configure depuis cet écran dès qu'elle est joignable.")}
      </InfoBox>
    );
  }

  /* ------------------------------ compte branché ------------------------------ */
  if (etat.configure) {
    const depuis = etat.depuis ? new Date(etat.depuis) : null;
    return (
      <div className="space-y-3">
        <Card className="flex items-start gap-3">
          <Mail size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{etat.adresse}</p>
            <p className="text-sm text-muted-foreground">
              {etat.serveur}:{etat.port} en{" "}
              {etat.chiffrement === "starttls" ? "STARTTLS" : "TLS"}
              {depuis && !Number.isNaN(depuis.getTime())
                ? tf(", connectée le {0}", formaterDate(depuis))
                : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
            {t("Connectée")}
          </span>
        </Card>

        <EnvoiDeMails etat={etat} fournisseurs={fournisseurs} onEtat={setEtat} />

        <InfoBox leading={<Lock size={15} strokeWidth={1.75} />}>
          {t("Vos agents peuvent lire les messages de cette boîte, y chercher, et préparer des brouillons dans votre dossier Brouillons, une modification soumise à approbation comme les autres.")}{" "}
          {etat.envoi
            ? etat.envoiSansAccord
              ? t("Ils peuvent aussi envoyer, sans confirmation là où vous l'avez permis ci-dessus.")
              : t("Ils peuvent aussi envoyer, toujours après votre accord, quel que soit le niveau d'approbation choisi.")
            : t("Ils ne peuvent pas envoyer tant que l'envoi n'est pas activé ci-dessus.")}{" "}
          {t("Ils ne peuvent ni supprimer ni même marquer un message comme lu. Le mot de passe est conservé chiffré sur l'instance et n'en ressort jamais.")}
        </InfoBox>

        {erreur && (
          <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
            {erreur}
          </InfoBox>
        )}
        {succes && (
          <InfoBox leading={<Check size={15} strokeWidth={1.75} />}>{succes}</InfoBox>
        )}

        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            icon={retrait ? Loader2 : Trash2}
            disabled={retrait}
            onClick={() => void retirer()}
          >
            {retrait ? "Retrait…" : t("Retirer cette boîte")}
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------------- formulaire -------------------------------- */
  const pretASoumettre =
    form.adresse.includes("@") &&
    form.serveur.trim().length > 0 &&
    form.motDePasse.length > 0 &&
    Number(form.port) > 0;

  return (
    <div className="space-y-3">
      {!etat.chiffrementDonnees && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {t("Le chiffrement des données n'est pas actif sur cette instance.")}{" "}{branding.name}{" "}
          {t("refusera d'enregistrer un mot de passe de messagerie tant que ce sera le cas.")}
        </InfoBox>
      )}

      <Card className="space-y-4">
        <Field
          label={t("Adresse de la boîte")}
          required
          hint={t("C'est elle qui sert à reconnaître votre fournisseur et à pré-remplir le reste.")}
        >
          <Input
            type="email"
            autoComplete="email"
            placeholder="contact@exemple.fr"
            value={form.adresse}
            onChange={(e) => majAdresse(e.target.value)}
          />
        </Field>

        {suggestion && (
          <InfoBox leading={<Info size={15} strokeWidth={1.75} />}>
            <p className="font-medium">{suggestion.nom} reconnu.</p>
            <p className="mt-0.5">{suggestion.conseil}</p>
          </InfoBox>
        )}

        {/*
          Chez Google et Microsoft, le mot de passe du compte est mort depuis
          longtemps et le mot de passe d'application l'est aussi chez le second.
          On propose donc la connexion par autorisation dès que l'adresse les
          désigne — et seulement à ce moment : l'offrir à un fournisseur qui ne
          la gère pas serait une fausse piste.
        */}
        {oauthPossible && (
          <div className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {t("Se connecter avec")}{" "}{oauthPossible === "google" ? "Google" : "Microsoft"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setParAutorisation((v) => !v)}
              >
                {parAutorisation ? t("Revenir au mot de passe") : "Essayer"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Sans mot de passe à créer ni serveur à saisir. Demande une préparation, une fois, par la personne qui administre votre organisation.")}
            </p>
            {parAutorisation && (
              <div className="mt-3">
                <CourrierOauth
                  adresse={form.adresse}
                  fournisseur={oauthPossible}
                  onBranche={() => {
                    void lireEtat().then((e) => {
                      setEtat(e);
                      if (e?.configure) {
                        setParAutorisation(false);
                        setSucces(tf("Boîte {0} branchée.", e.adresse ?? ""));
                        onChange?.();
                      }
                    });
                  }}
                />
              </div>
            )}
          </div>
        )}

        <Field
          label={t("Identifiant de connexion")}
          hint={t("Le plus souvent l'adresse complète. Certains fournisseurs veulent seulement le nom du compte.")}
        >
          <Input
            autoComplete="username"
            placeholder={form.adresse || "contact@exemple.fr"}
            value={form.identifiant}
            onChange={(e) => champ("identifiant", e.target.value)}
          />
        </Field>

        <Field
          label={t("Mot de passe")}
          required
          hint={t("Si la validation en deux étapes est active sur votre compte, il vous faut un mot de passe d'application : Gmail et Outlook refusent le mot de passe habituel.")}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder={t("Mot de passe d'application")}
            value={form.motDePasse}
            onChange={(e) => champ("motDePasse", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 cq-sm:grid-cols-[minmax(0,1fr)_120px]">
          <Field label={t("Serveur IMAP")} required>
            <Input
              placeholder="imap.exemple.fr"
              value={form.serveur}
              onChange={(e) => champ("serveur", e.target.value)}
            />
          </Field>
          <Field label={t("Port")} required>
            <Input
              inputMode="numeric"
              value={form.port}
              onChange={(e) => champ("port", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>

        <Field label={t("Chiffrement")}>
          <Select
            value={form.chiffrement}
            onChange={(v) => champ("chiffrement", v)}
            options={CHIFFREMENTS}
          />
        </Field>

        {fournisseurs.length > 0 && (
          <Field
            label={t("Ou reprendre les réglages d'un fournisseur")}
            hint={t("Utile quand votre domaine est celui de votre entreprise mais que la messagerie est hébergée ailleurs.")}
          >
            <Select
              onChange={appliquerFournisseur}
              placeholder={t("Choisir un fournisseur…")}
              options={fournisseurs.map((f) => ({ value: f.nom, label: f.nom }))}
            />
          </Field>
        )}

        {erreur && (
          <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
            {erreur}
          </InfoBox>
        )}
        {succes && <InfoBox leading={<Check size={15} strokeWidth={1.75} />}>{succes}</InfoBox>}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {t("La connexion est essayée avant tout enregistrement : en cas d'échec, rien n'est conservé.")}
          </p>
          <Button
            icon={enCours ? Loader2 : Mail}
            disabled={!pretASoumettre || enCours}
            onClick={() => void soumettre()}
            className="shrink-0"
          >
            {enCours ? "Connexion…" : t("Connecter la boîte")}
          </Button>
        </div>
      </Card>

      <InfoBox tone="muted" leading={<Lock size={15} strokeWidth={1.75} />}>
        {branding.name}{" "}{t("se connecte directement à votre serveur, sans passer par l'API d'un fournisseur ni par un service tiers. Les agents lisent vos messages sans les marquer comme lus, et peuvent préparer des brouillons. Une fois la boîte connectée, vous pourrez aussi leur permettre d'envoyer : chaque mail vous sera alors montré en entier et ne partira qu'après votre accord. Rien n'est jamais supprimé. Le certificat du serveur est vérifié : une messagerie au certificat inconnu sera refusée plutôt que d'exposer votre mot de passe.")}
      </InfoBox>
    </div>
  );
}

export default CourrierIMAP;
