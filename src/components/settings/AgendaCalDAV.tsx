import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Info,
  Loader2,
  Lock,
  Pencil,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  etat as lireEtat,
  configurer as enregistrerAgenda,
  oublier as retirerAgenda,
  deviner,
  adresseProposee,
  type Calendrier,
  type EtatAgenda,
  type ServeurConnu,
} from "@/lib/agenda";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { branding } from "@/config/branding";
import { formaterDate } from "@/lib/formats";
import { AgendaGoogle } from "@/components/settings/AgendaGoogle";
import { t, tf } from "@/lib/i18n";

/**
 * Configuration du connecteur agenda, en CalDAV.
 *
 * Quatre choix guident cet écran, et ce sont ceux de l'écran de courrier.
 *
 * Le premier : le formulaire se pré-remplit à partir du domaine de l'adresse,
 * mais rien n'est imposé. Un artisan qui tape « contact@sa-societe.fr » ne verra
 * aucune suggestion, parce que son domaine est le sien ; il doit alors pouvoir
 * saisir son adresse CalDAV sans se battre contre un champ deviné.
 *
 * Le deuxième : le mot de passe d'application est annoncé **avant** que
 * l'utilisateur n'essaie son mot de passe habituel. C'est la cause numéro un
 * d'échec sur Google et iCloud, et découvrir la contrainte après trois refus
 * donne l'impression que le produit ne marche pas.
 *
 * Le troisième : rien n'est enregistré tant que la connexion n'a pas réussi et
 * qu'au moins un agenda n'a pas été trouvé. L'écran ne prétend donc jamais
 * qu'un agenda est branché alors qu'il ne l'est pas.
 *
 * Le quatrième : restreindre les agendas consultés exige de ressaisir le mot de
 * passe, parce que l'instance ne le rend jamais. C'est une contrainte assumée,
 * et elle est dite à l'écran plutôt que découverte au moment du clic.
 */

interface Formulaire {
  adresse: string;
  url: string;
  identifiant: string;
  motDePasse: string;
}

const VIDE: Formulaire = { adresse: "", url: "", identifiant: "", motDePasse: "" };

/** Une couleur venue du serveur n'entre dans le style que si elle en est une. */
function couleurSure(valeur: string): string | null {
  return /^#[0-9a-fA-F]{3,8}$/.test(valeur) ? valeur : null;
}

function Pastille({ couleur }: { couleur: string }) {
  const sure = couleurSure(couleur);
  return (
    <span
      aria-hidden
      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40"
      style={sure ? { backgroundColor: sure } : undefined}
    />
  );
}

/** `onChange` prévient l'écran : sans lui, la pastille de la tuile
 *  resterait sur « Connecter » après une connexion réussie. */
export function AgendaCalDAV({ onChange }: { onChange?: () => void } = {}) {
  const [etat, setEtat] = useState<EtatAgenda | null | undefined>(undefined);
  const [form, setForm] = useState<Formulaire>(VIDE);
  /* Ce que l'utilisateur a saisi lui-même ne doit pas être écrasé par une
   * suggestion : sans cette mémoire, corriger l'adresse d'un compte
   * professionnel hébergé chez Google était impossible. */
  const [manuel, setManuel] = useState<Record<string, boolean>>({});
  /* Hébergeur choisi dans le menu déroulant : son conseil doit rester visible,
   * y compris pour un hébergeur qu'aucun domaine ne désigne, comme OVH. */
  const [serveurChoisi, setServeurChoisi] = useState<string>("");
  const [retenus, setRetenus] = useState<string[]>([]);
  const [edition, setEdition] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [retrait, setRetrait] = useState(false);
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

  const serveurs: ServeurConnu[] = etat?.serveurs ?? [];
  const suggestion = useMemo(
    () =>
      serveurs.find((s) => s.nom === serveurChoisi) ?? deviner(form.adresse, serveurs),
    [form.adresse, serveurs, serveurChoisi],
  );

  /** Applique une suggestion sans jamais recouvrir une saisie manuelle. */
  const majAdresse = (adresse: string) => {
    const trouve = deviner(adresse, serveurs);
    const proposee = trouve ? adresseProposee(trouve, adresse) : "";
    setForm((f) => ({
      ...f,
      adresse,
      identifiant: manuel.identifiant ? f.identifiant : adresse,
      url: proposee && !manuel.url ? proposee : f.url,
    }));
  };

  const appliquerServeur = (nom: string) => {
    const trouve = serveurs.find((s) => s.nom === nom);
    if (!trouve) return;
    setServeurChoisi(nom);
    const proposee = adresseProposee(trouve, form.adresse);
    // Un hébergeur sans adresse vérifiée ne doit rien écrire dans le champ :
    // seul son conseil s'affiche, et l'utilisateur saisit lui-même l'adresse.
    if (proposee) {
      setForm((f) => ({ ...f, url: proposee }));
      setManuel((m) => ({ ...m, url: true }));
    }
  };

  const champ = (cle: keyof Formulaire, valeur: string) => {
    setForm((f) => ({ ...f, [cle]: valeur }));
    setManuel((m) => ({ ...m, [cle]: true }));
  };

  const basculer = (nom: string) =>
    setRetenus((r) => (r.includes(nom) ? r.filter((v) => v !== nom) : [...r, nom]));

  const ouvrirEdition = () => {
    setForm({
      adresse: "",
      url: etat?.url ?? "",
      identifiant: etat?.identifiant ?? "",
      motDePasse: "",
    });
    setManuel({ url: true, identifiant: true });
    setServeurChoisi("");
    setRetenus(etat?.retenus ?? []);
    setErreur(null);
    setSucces(null);
    setEdition(true);
  };

  const soumettre = async () => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const resultat = await enregistrerAgenda({
      url: form.url.trim(),
      identifiant: (form.identifiant || form.adresse).trim(),
      motDePasse: form.motDePasse,
      retenus,
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
    setRetenus([]);
    setServeurChoisi("");
    setEdition(false);
    setEtat(await lireEtat());
    onChange?.();
  };

  const retirer = async () => {
    setRetrait(true);
    setErreur(null);
    setSucces(null);
    const resultat = await retirerAgenda();
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
        {tf("L'instance {0} ne répond pas. L'agenda se configure depuis cet écran dès qu'elle est joignable.", branding.name)}
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

  /* ------------------------------ agenda branché ------------------------------ */
  if (etat.configure && !edition) {
    const depuis = etat.depuis ? new Date(etat.depuis) : null;
    const tous = etat.calendriers ?? [];
    const choisis = etat.retenus ?? [];
    const lus = choisis.length > 0 ? tous.filter((c) => choisis.includes(c.nom)) : tous;

    return (
      <div className="space-y-3">
        <Card className="flex items-start gap-3">
          <CalendarDays
            size={20}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{etat.identifiant}</p>
            <p className="truncate text-sm text-muted-foreground">
              {etat.url}
              {depuis && !Number.isNaN(depuis.getTime())
                ? tf(", connecté le {0}", formaterDate(depuis))
                : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
            {t("Connecté")}
          </span>
        </Card>

        <Card className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {lus.length}{" "}{t("agenda(s) consulté(s) par vos agents")}
          </p>
          <ul className="space-y-1.5">
            {lus.map((c: Calendrier) => (
              <li key={c.url} className="flex items-start gap-2 text-sm text-foreground">
                <Pastille couleur={c.couleur} />
                <span className="min-w-0 break-words">{c.nom}</span>
              </li>
            ))}
          </ul>
          {choisis.length > 0 && tous.length > lus.length && (
            <p className="text-xs text-muted-foreground">
              {tous.length - lus.length}{" "}{t("autre(s) agenda existe(nt) sur ce compte et restent hors de portée des agents.")}
            </p>
          )}
        </Card>

        <InfoBox leading={<Lock size={15} strokeWidth={1.75} />}>
          {t("Lecture seule. Vos agents peuvent consulter ces agendas et y chercher ; ils ne peuvent ni créer, ni déplacer, ni supprimer un événement, ni répondre à une invitation. Le mot de passe est conservé chiffré sur l'instance et n'en ressort jamais.")}
        </InfoBox>

        {messages}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" icon={Pencil} onClick={ouvrirEdition}>
            {t("Modifier")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            icon={retrait ? Loader2 : Trash2}
            disabled={retrait}
            onClick={() => void retirer()}
          >
            {retrait ? t("Retrait…") : t("Retirer cet agenda")}
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------------- formulaire -------------------------------- */
  const connus = etat.calendriers ?? [];
  const pretASoumettre =
    form.url.trim().length > 0 &&
    (form.identifiant.trim().length > 0 || form.adresse.includes("@")) &&
    form.motDePasse.length > 0;

  return (
    <div className="space-y-3">
      {/* Google Agenda ne s'ouvre qu'avec la connexion Google (AgendaGoogle.tsx) : proposé avant le formulaire CalDAV. */}
      <AgendaGoogle onChange={onChange} />
      <p className="px-1 pt-1 text-sm font-medium text-foreground">{t("Ou un autre agenda (iCloud, Nextcloud, Fastmail…), par CalDAV")}</p>
      {!etat.chiffrementDonnees && (
        <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
          {tf("Le chiffrement des données n'est pas actif sur cette instance. {0} refusera d'enregistrer un mot de passe d'agenda tant que ce sera le cas.", branding.name)}
        </InfoBox>
      )}

      <Card className="space-y-4">
        <Field
          label={t("Adresse de votre compte")}
          hint={t("Elle sert à reconnaître votre hébergeur et à proposer l'adresse CalDAV. Elle n'est pas transmise au serveur.")}
        >
          <Input
            type="email"
            autoComplete="email"
            placeholder="martine@exemple.fr"
            value={form.adresse}
            onChange={(e) => majAdresse(e.target.value)}
          />
        </Field>

        {suggestion && (
          <InfoBox leading={<Info size={15} strokeWidth={1.75} />}>
            <p className="font-medium">{tf("{0} reconnu.", suggestion.nom)}</p>
            <p className="mt-0.5">{suggestion.conseil}</p>
          </InfoBox>
        )}

        <Field
          label={t("Adresse CalDAV")}
          required
          hint={t("Elle commence par https://. Chez la plupart des hébergeurs elle se récupère depuis l'espace de configuration du compte.")}
        >
          <Input
            placeholder="https://serveur.exemple.fr/remote.php/dav/"
            value={form.url}
            onChange={(e) => champ("url", e.target.value)}
          />
        </Field>

        <Field
          label={t("Identifiant de connexion")}
          hint={t("Le plus souvent l'adresse complète. Certains hébergeurs veulent seulement le nom du compte.")}
        >
          <Input
            autoComplete="username"
            placeholder={form.adresse || "martine@exemple.fr"}
            value={form.identifiant}
            onChange={(e) => champ("identifiant", e.target.value)}
          />
        </Field>

        <Field
          label={t("Mot de passe")}
          required
          hint={t("Si la validation en deux étapes est active sur votre compte, il vous faut un mot de passe d'application : Google et iCloud refusent le mot de passe habituel.")}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder={t("Mot de passe d'application")}
            value={form.motDePasse}
            onChange={(e) => champ("motDePasse", e.target.value)}
          />
        </Field>

        {serveurs.length > 0 && (
          <Field
            label={t("Ou reprendre les réglages d'un hébergeur")}
            hint={t("Utile quand votre domaine est celui de votre entreprise mais que l'agenda est hébergé ailleurs. Certains hébergeurs n'ont pas d'adresse fixe : le conseil vous dit alors où la trouver.")}
          >
            <Select
              onChange={appliquerServeur}
              placeholder={t("Choisir un hébergeur…")}
              options={serveurs.map((s) => ({ value: s.nom, label: s.nom }))}
            />
          </Field>
        )}

        {connus.length > 0 && (
          <Field
            label={t("Agendas à consulter")}
            hint={t("Aucun choix : tous les agendas du compte. Restreindre évite qu'un agenda partagé encombre les réponses.")}
          >
            <div className="flex flex-wrap gap-2">
              {connus.map((c) => {
                const actif = retenus.includes(c.nom);
                return (
                  <button
                    key={c.url}
                    type="button"
                    aria-pressed={actif}
                    onClick={() => basculer(c.nom)}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors " +
                      (actif
                        ? "border-ring/60 bg-muted text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")
                    }
                  >
                    <Pastille couleur={c.couleur} />
                    {c.nom}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {messages}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {t("La connexion est essayée avant tout enregistrement : en cas d'échec, rien n'est conservé.")}
          </p>
          <div className="flex shrink-0 gap-2">
            {edition && (
              <Button variant="ghost" onClick={() => setEdition(false)}>
                {t("Annuler")}
              </Button>
            )}
            <Button
              icon={enCours ? Loader2 : CalendarDays}
              disabled={!pretASoumettre || enCours}
              onClick={() => void soumettre()}
            >
              {enCours ? "Connexion…" : "Connecter l'agenda"}
            </Button>
          </div>
        </div>
      </Card>

      <InfoBox tone="muted" leading={<Lock size={15} strokeWidth={1.75} />}>
        {tf("{0} se connecte directement à votre serveur en CalDAV, protocole ouvert, sans passer par l'API d'un fournisseur ni par un service tiers. L'accès est en lecture seule et le certificat du serveur est vérifié : un agenda au certificat inconnu sera refusé plutôt que d'exposer votre mot de passe.", branding.name)}
      </InfoBox>
    </div>
  );
}

export default AgendaCalDAV;
