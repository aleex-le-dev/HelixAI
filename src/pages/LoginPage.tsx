import { useEffect, useState } from "react";
import {
  LogIn,
  UserPlus,
  TriangleAlert,
  Lock,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  Copy,
  Check,
  Mail,
} from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { InfoBox } from "@/components/ui/InfoBox";
import { Switch } from "@/components/ui/Switch";
import { branding } from "@/config/branding";
import {
  allAccounts,
  createAccount,
  authenticate,
  definirPremierMotDePasse,
  remplacerMotDePasseProvisoire,
  validerDeuxFacteurs,
  preparerInscription,
  activerInscription,
  toUser,
  type Account,
  type Connexion,
} from "@/lib/store/accounts";
import { ACCOUNTS_CHANGED } from "@/lib/store/sync";
import { setCurrentUser } from "@/lib/store/identity";
import { estCodeInvitation, invitationEnCours, oublierInvitation, rejoindreAvecCode } from "@/lib/invitations";
import { GATEWAY_BASE } from "@/lib/endpoint";
import { claimInvitations } from "@/lib/store/projects";
import { claimSessionShares } from "@/lib/store/sessions";
import { cn } from "@/lib/cn";
import { QrCode } from "@/components/ui/QrCode";
import { adresseOtpauth, secretLisible } from "@/lib/deuxFacteurs";
import { t, tf } from "@/lib/i18n";
import { copierTexte } from "@/lib/pressePapiers";

/** Même règle que la passerelle (`MOT_DE_PASSE_MIN`), qui reste seule juge. */
const MOT_DE_PASSE_MIN = 10;

type Mode =
  | "choix"
  | "connexion"
  | "premier"
  /** Mot de passe choisi par l'administrateur qui a créé le compte : en choisir un à soi. */
  | "provisoire"
  | "deuxfacteurs"
  /** Instance qui impose le second facteur : activation avant la séance. */
  | "inscription"
  /** Codes de secours remis à la fin de l'activation, une seule fois. */
  | "codes"
  | "creation";

/**
 * Écran de connexion.
 *
 * Les comptes sont locaux : Helix ne contacte aucun service d'authentification.
 * Le compte détermine à qui appartiennent le profil, la mémoire et les sessions.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  /*
   * Sur un poste rattaché, la liste des comptes arrive de l'instance une
   * fraction de seconde après l'affichage. Sans cette écoute, le collègue reste
   * bloqué sur « créer un compte » et finit par en créer un second en doublon.
   */
  const [accounts, setAccounts] = useState<Account[]>(() => allAccounts());
  /*
   * Une invitation en cours mène droit à la création du compte : la personne
   * vient de rattacher son poste avec son code, il ne lui reste qu'à choisir
   * son nom et son mot de passe.
   */
  const [mode, setMode] = useState<Mode>(
    invitationEnCours() || accounts.length === 0 ? "creation" : "choix",
  );

  useEffect(() => {
    const relire = () => {
      const liste = allAccounts();
      setAccounts(liste);
      // On ne bascule que depuis l'écran de création automatique : si la
      // personne a explicitement demandé « Ajouter un compte », on la laisse.
      /*
       * Et l'inverse : un choix parmi zéro compte. La liste de départ vient de
       * la copie gardée par ce poste ; une instance neuve (réinstallée, ou une
       * autre passerelle sur la même adresse) en compte zéro une fois relue.
       * L'écran restait sur « Choisissez votre compte pour continuer » sans
       * aucun compte à choisir (tournée à l'écran du 28/09/2026).
       */
      setMode((courant) =>
        courant === "creation" && liste.length > 0 && !fullName && !email && !invitationEnCours()
          ? "choix"
          : courant === "choix" && liste.length === 0
            ? "creation"
            : courant,
      );
    };
    window.addEventListener(ACCOUNTS_CHANGED, relire);
    window.addEventListener("storage", relire);
    return () => {
      window.removeEventListener(ACCOUNTS_CHANGED, relire);
      window.removeEventListener("storage", relire);
    };
  });
  const [selected, setSelected] = useState<Account | null>(null);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [defi, setDefi] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [secretInscription, setSecretInscription] = useState<string | null>(null);
  const [codesSecours, setCodesSecours] = useState<string[]>([]);
  const [compteOuvert, setCompteOuvert] = useState<Account | null>(null);
  const [copie, setCopie] = useState(false);
  /*
   * « Rester connecté sur ce poste ». Ce n'est pas le mot de passe qu'on
   * mémorise — il n'est conservé nulle part — c'est la séance qui dure trente
   * jours au lieu de douze heures. Le choix suit toute la connexion : la
   * séance n'est ouverte qu'à la dernière étape, après le code si la double
   * authentification est active.
   */
  const [rester, setRester] = useState(false);
  /*
   * Invitation en cours : posée par l'écran de mise en route quand le poste a
   * été rattaché avec un code (lib/invitations.ts). Elle porte l'adresse
   * invitée, et l'instance imposera celle-là quoi qu'il arrive.
   */
  const [invitationDuLien] = useState(() => invitationEnCours());
  /*
   * Code d'invitation saisi ici même, sur un poste déjà rattaché à l'instance
   * (parcours du 28/09/2026). « Ajouter un compte » menait à un formulaire
   * que l'instance refusait toujours une fois rempli : elle a déjà des comptes,
   * et n'en ouvre plus que sur invitation ou par l'administrateur connecté
   * (gateway/src/index.ts, `handleAuthCreate`). Or l'écran de connexion est
   * justement celui où personne n'est connecté. Le code demandé d'emblée, et
   * vérifié dès qu'il est complet, en fait un parcours qui aboutit.
   */
  const [codeSaisi, setCodeSaisi] = useState("");
  const [invitationSaisie, setInvitationSaisie] = useState<{ code: string; email: string } | null>(null);
  const invitation = invitationDuLien ?? invitationSaisie;
  const codeRequis = !invitationDuLien && accounts.length > 0;

  // L'adresse du code, posée une fois : le champ est ensuite en lecture seule.
  useEffect(() => {
    if (invitation) setEmail(invitation.email);
  }, [invitation]);

  useEffect(() => {
    if (!codeRequis) return;
    const code = codeSaisi.trim();
    setInvitationSaisie(null);
    if (!estCodeInvitation(code)) return;
    let abandon = false;
    // La même vérification que pour rattacher un poste : elle ne consomme pas le code.
    void rejoindreAvecCode(GATEWAY_BASE, code).then((r) => {
      if (abandon) return;
      if (r.ok) {
        setInvitationSaisie({ code, email: r.email });
        setError(undefined);
      } else setError(r.message);
    });
    return () => {
      abandon = true;
    };
  }, [codeSaisi, codeRequis]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const ouvrir = (account: Account) => {
    const user = toUser(account);
    setCurrentUser(user);
    // Les invitations reçues avant la création du compte deviennent actives.
    claimInvitations(user);
    claimSessionShares(user);
    onSignedIn();
  };

  /** Suite commune à toutes les étapes : séance ouverte, ou étape suivante. */
  const suite = (issue: Connexion) => {
    if (issue.ok) return ouvrir(issue.account);
    if (issue.raison === "a-definir") {
      setNewPassword("");
      setConfirmation("");
      setMode("premier");
      return;
    }
    // Le mot de passe saisi reste en mémoire le temps de l'étape : il prouve qu'on a bien reçu le provisoire.
    if (issue.raison === "a-changer") {
      setNewPassword("");
      setConfirmation("");
      setMode("provisoire");
      return;
    }
    if (issue.raison === "deux-facteurs") {
      setDefi(issue.defi);
      setCode("");
      setMode("deuxfacteurs");
      return;
    }
    if (issue.raison === "inscription") {
      commencerInscription(issue.defi);
      return;
    }
    // Liste du poste en retard : le compte a déjà son mot de passe.
    if (issue.raison === "deja-defini") {
      setPassword("");
      setMode("connexion");
    }
    // Défi expiré ou épuisé : il faut repasser par le mot de passe.
    if (issue.raison === "expire") {
      setDefi(null);
      setPassword("");
      setMode("connexion");
    }
    setError(issue.message);
  };

  const enTravail = async (travail: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await travail();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const signIn = (account: Account, pwd: string) =>
    enTravail(async () => suite(await authenticate(account.id, pwd, rester)));

  /*
   * Aucun compte ne s'ouvre plus par simple sélection, et l'écran ne sait plus
   * d'avance lesquels n'ont pas encore de mot de passe : la liste ouverte ne
   * le dit plus, parce que le dire revenait à désigner les comptes qu'un
   * porteur du jeton d'instance pouvait s'approprier. On demande donc le mot
   * de passe à tout le monde ; l'instance répond « à définir » pour le seul
   * compte visé, et l'écran bascule alors sur le choix du premier.
   */
  const pick = (account: Account) => {
    setSelected(account);
    setPassword("");
    setNewPassword("");
    setConfirmation("");
    setError(undefined);
    setMode("connexion");
  };

  // La longueur est annoncée par l'aide et bloque le bouton ; seule la
  // différence entre les deux saisies mérite un message, sinon on crie en rouge
  // dès la première lettre tapée.
  const saisiesDifferentes = confirmation !== "" && confirmation !== newPassword;
  const nouveauValide = newPassword.length >= MOT_DE_PASSE_MIN && confirmation === newPassword;

  const provisoire = (account: Account) =>
    enTravail(async () => {
      if (!nouveauValide) return;
      suite(await remplacerMotDePasseProvisoire(account.id, password, newPassword, rester));
    });

  const premier = (account: Account) =>
    enTravail(async () => {
      if (!nouveauValide) return;
      suite(await definirPremierMotDePasse(account.id, newPassword, rester));
    });

  const deuxFacteurs = () =>
    enTravail(async () => {
      if (!defi || !code.trim()) return;
      suite(await validerDeuxFacteurs(defi, code.trim(), rester));
    });

  /*
   * Activation imposée : le secret est demandé une fois par défi (l'instance
   * rend le même si on recharge), puis affiché en QR code.
   */
  const commencerInscription = (nouveauDefi: string) => {
    setDefi(nouveauDefi);
    setCode("");
    setSecretInscription(null);
    setMode("inscription");
    void preparerInscription(nouveauDefi)
      .then(({ secret }) => setSecretInscription(secret))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const activer = () =>
    enTravail(async () => {
      if (!defi || !code.trim()) return;
      const { connexion, codesDeSecours } = await activerInscription(defi, code.trim(), rester);
      if (connexion.ok) {
        setSecretInscription(null);
        setCodesSecours(codesDeSecours);
        setCompteOuvert(connexion.account);
        setMode("codes");
        return;
      }
      suite(connexion);
    });

  const copierCodes = async () => {
    // lib/pressePapiers (27/09/2026) : dans l'application de bureau, `navigator.clipboard` était toujours refusé.
    if (await copierTexte(codesSecours.join("\n"))) {
      setCopie(true);
    } else {
      setCopie(false);
      setError(t("La copie a échoué : recopiez les codes à la main."));
    }
  };

  const retourAuChoix = () => {
    setMode("choix");
    setDefi(null);
    setError(undefined);
  };

  const create = () =>
    enTravail(async () => {
      if (!fullName.trim() || !email.trim() || !nouveauValide) return;
      /*
       * Même garde que le bouton (28/09/2026) : Entrée dans la confirmation du
       * mot de passe passait outre le code d'invitation manquant, et l'instance
       * refusait alors la création avec un message qui ne parlait pas du code.
       */
      if (codeRequis && !invitationSaisie) return;
      const { account, inscription } = await createAccount({
        fullName,
        email,
        password: newPassword,
        ...(invitation ? { invitation: invitation.code } : {}),
        rester,
      });
      // Le code a servi : il ne vaut plus rien, et n'a plus à traîner.
      if (invitation) oublierInvitation();
      if (inscription) {
        setSelected(account);
        commencerInscription(inscription);
        return;
      }
      ouvrir(account);
    });

  const carteDuCompte = (account: Account) => (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <Avatar size={36} initials={account.initials} photo={account.photo} nom={account.fullName} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{account.fullName}</span>
        <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
      </span>
    </div>
  );

  const lienRetour = (libelle: string) => (
    <button
      type="button"
      onClick={retourAuChoix}
      className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft size={14} strokeWidth={1.75} /> {libelle}
    </button>
  );

  /** Nouveau mot de passe et sa confirmation : création et premier mot de passe. */
  const champsNouveau = (valider: () => void, autoFocus = false) => (
    <>
      <Field
        label={t("Mot de passe")}
        hint={tf("Au moins {0} caractères. Une phrase courte se retient mieux qu'un mot compliqué.", MOT_DE_PASSE_MIN)}
      >
        <Input
          type="password"
          value={newPassword}
          autoFocus={autoFocus}
          autoComplete="new-password"
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Field>
      <Field label={t("Confirmez le mot de passe")} error={saisiesDifferentes ? t("Les deux saisies diffèrent.") : undefined}>
        <Input
          type="password"
          value={confirmation}
          autoComplete="new-password"
          onChange={(e) => setConfirmation(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") valider();
          }}
        />
      </Field>
    </>
  );

  return (
    // `my-auto` plutôt que `justify-center` : centré quand tout tient, et
    // défilable quand la fenêtre est basse. Avec `justify-center`, le haut de la
    // carte sortait de l'écran sans qu'on puisse y remonter.
    <div className="flex h-screen w-screen flex-col items-center overflow-y-auto bg-background px-6 py-10">
      <div className="my-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoMark size={52} animated />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {branding.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "creation"
              ? t("Créez votre compte pour commencer.")
              : mode === "premier" || mode === "provisoire"
                ? t("Choisissez votre mot de passe.")
                : mode === "deuxfacteurs"
                  ? t("Dernière étape : le code de vérification.")
                  : mode === "inscription"
                    ? t("Votre instance demande une double authentification.")
                    : mode === "codes"
                      ? t("Gardez vos codes de secours.")
                      : t("Choisissez votre compte pour continuer.")}
          </p>
        </div>

        {/* Choix du compte */}
        {mode === "choix" && (
          <div className="space-y-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => pick(account)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-start transition-colors hover:bg-muted"
              >
                <Avatar size={36} initials={account.initials} photo={account.photo} nom={account.fullName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {account.fullName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {account.email}
                  </span>
                </span>
                <Lock size={14} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
              </button>
            ))}
            <Button
              variant="secondary"
              icon={UserPlus}
              block
              className="mt-3"
              onClick={() => {
                setMode("creation");
                setError(undefined);
              }}
            >
              {t("Ajouter un compte")}
            </Button>
          </div>
        )}

        {/* Saisie du mot de passe */}
        {mode === "connexion" && selected && (
          <div className="space-y-4">
            {carteDuCompte(selected)}
            <Field label={t("Mot de passe")}>
              <Input
                type="password"
                value={password}
                autoFocus
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void signIn(selected, password);
                }}
              />
            </Field>
            <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Switch
                checked={rester}
                onChange={setRester}
                label={t("Rester connecté sur ce poste")}
              />
              <span>{t("Rester connecté sur ce poste")}</span>
            </label>
            <Button
              icon={LogIn}
              block
              disabled={busy || !password}
              onClick={() => void signIn(selected, password)}
            >
              {t("Se connecter")}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("Votre mot de passe n'est conservé nulle part. Coché, ce poste reste reconnu trente jours au lieu de douze heures, et cette séance se révoque à tout moment dans Réglages, Sécurité.")}
            </p>
            {lienRetour(t("Changer de compte"))}
          </div>
        )}

        {/* Premier mot de passe d'un compte créé sans */}
        {mode === "premier" && selected && (
          <div className="space-y-4">
            {carteDuCompte(selected)}
            <InfoBox tone="info" leading={<KeyRound size={15} strokeWidth={1.75} />}>
              {t("Ce compte n'a pas encore de mot de passe. Choisissez-en un : il sera demandé à chaque connexion, sur ce poste comme sur les autres.")}
            </InfoBox>
            {champsNouveau(() => void premier(selected), true)}
            <Button
              icon={LogIn}
              block
              disabled={busy || !nouveauValide}
              onClick={() => void premier(selected)}
            >
              {t("Enregistrer et me connecter")}
            </Button>
            {lienRetour(t("Changer de compte"))}
          </div>
        )}

        {mode === "provisoire" && selected && (
          <div className="space-y-4">
            {carteDuCompte(selected)}
            <InfoBox tone="info" leading={<KeyRound size={15} strokeWidth={1.75} />}>
              {t("Ce mot de passe a été choisi par la personne qui a créé votre compte. Choisissez le vôtre : elle ne le connaîtra pas, et l'ancien ne servira plus.")}
            </InfoBox>
            {champsNouveau(() => void provisoire(selected), true)}
            <Button icon={LogIn} block disabled={busy || !nouveauValide} onClick={() => void provisoire(selected)}>
              {t("Enregistrer et me connecter")}
            </Button>
            {lienRetour(t("Changer de compte"))}
          </div>
        )}

        {/* Second facteur */}
        {mode === "deuxfacteurs" && selected && (
          <div className="space-y-4">
            {carteDuCompte(selected)}
            <Field
              label={t("Code de vérification")}
              hint={t("Les six chiffres affichés par votre application d'authentification, ou l'un de vos codes de secours.")}
            >
              <Input
                value={code}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={32}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void deuxFacteurs();
                }}
              />
            </Field>
            <Button
              icon={ShieldCheck}
              block
              disabled={busy || !code.trim()}
              onClick={() => void deuxFacteurs()}
            >
              {t("Vérifier")}
            </Button>
            {lienRetour(t("Changer de compte"))}
          </div>
        )}

        {/* Activation imposée du second facteur */}
        {mode === "inscription" && selected && (
          <div className="space-y-4">
            {carteDuCompte(selected)}
            <p className="text-sm text-muted-foreground">
              {t("Scannez ce code avec une application d'authentification (Aegis, 2FAS, Mots de passe d'Apple, Google Authenticator...), puis saisissez les six chiffres qu'elle affiche.")}
            </p>
            {secretInscription ? (
              <div className="flex flex-col items-center gap-2">
                <QrCode
                  valeur={adresseOtpauth(secretInscription, selected.email)}
                  titre={t("QR code à scanner avec l'application d'authentification")}
                  taille={180}
                  className="border border-border"
                />
                <p className="text-center text-xs text-muted-foreground">
                  {t("Sans appareil photo, saisissez cette clé :")}
                </p>
                <p className="break-all text-center font-mono text-sm text-foreground">
                  {secretLisible(secretInscription)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("Préparation du code…")}</p>
            )}
            <Field
              label={t("Code de vérification")}
              hint={t("Refusé ? Vérifiez que l'heure du téléphone est réglée automatiquement.")}
            >
              <Input
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={32}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void activer();
                }}
              />
            </Field>
            <Button
              icon={ShieldCheck}
              block
              disabled={busy || !code.trim() || !secretInscription}
              onClick={() => void activer()}
            >
              {t("Activer et me connecter")}
            </Button>
            {lienRetour(t("Changer de compte"))}
          </div>
        )}

        {/* Codes de secours, une seule fois */}
        {mode === "codes" && compteOuvert && (
          <div className="space-y-4">
            <InfoBox tone="info" leading={<KeyRound size={15} strokeWidth={1.75} />}>
              {t("Chacun de ces codes ouvre votre compte une fois, si vous n'avez plus votre téléphone. Ils ne seront plus jamais affichés : imprimez-les ou rangez-les dans votre gestionnaire de mots de passe.")}
            </InfoBox>
            <ul className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-4 font-mono text-sm text-foreground">
              {codesSecours.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Button variant="secondary" icon={copie ? Check : Copy} block onClick={() => void copierCodes()}>
              {copie ? t("Copiés") : t("Copier les codes")}
            </Button>
            <Button icon={LogIn} block onClick={() => ouvrir(compteOuvert)}>
              {t("J'ai mis mes codes à l'abri")}
            </Button>
          </div>
        )}

        {/* Création de compte */}
        {mode === "creation" && (
          <div className="space-y-4">
            {!invitation && codeRequis && (
              <InfoBox leading={<Mail size={15} strokeWidth={1.75} />}>
                {t("Cette instance a déjà des comptes : un nouveau s'ouvre avec le code d'invitation qu'un collègue vous a envoyé (Réglages, Profil, Inviter un collègue).")}
              </InfoBox>
            )}
            {codeRequis && (
              <Field
                label={t("Code d'invitation")}
                hint={invitationSaisie ? t("Code d'invitation reconnu. Vous choisirez votre mot de passe juste après.") : undefined}
              >
                <Input
                  value={codeSaisi}
                  autoFocus
                  placeholder={t("ABCD-EFGH-IJKL-MNOP")}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setCodeSaisi(e.target.value)}
                />
              </Field>
            )}
            {invitation && (
              <InfoBox leading={<Mail size={15} strokeWidth={1.75} />}>
                {t("Vous avez été invité sur cette instance. Choisissez votre mot de passe : il n'appartient qu'à vous, personne d'autre ne le connaîtra.")}
              </InfoBox>
            )}
            <Field label={t("Nom complet")}>
              <Input
                value={fullName}
                autoFocus={!codeRequis}
                placeholder={t("Marie Durand")}
                onChange={(e) => setFullName(e.target.value)}
              />
            </Field>
            <Field
              label={t("Adresse email")}
              hint={invitation ? t("C'est l'adresse à laquelle vous avez été invité.") : undefined}
            >
              <Input
                type="email"
                value={email}
                placeholder={t("marie.durand@entreprise.fr")}
                /*
                 * Sur invitation, l'adresse est celle du code : l'instance la
                 * refuserait de toute façon différente, autant ne pas laisser
                 * quelqu'un la saisir pour rien.
                 */
                disabled={Boolean(invitation)}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            {champsNouveau(() => void create())}
            <Button
              icon={UserPlus}
              block
              disabled={busy || !fullName.trim() || !email.trim() || !nouveauValide || (codeRequis && !invitationSaisie)}
              onClick={() => void create()}
            >
              {t("Créer mon compte")}
            </Button>
            {accounts.length > 0 && lienRetour(t("Retour"))}
          </div>
        )}

        {error && (
          <InfoBox
            tone="warning"
            className={cn("mt-4")}
            leading={<TriangleAlert size={15} strokeWidth={1.75} />}
          >
            {error}
          </InfoBox>
        )}

        <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
          {tf("Les comptes restent sur cette instance. {0} ne contacte aucun service d'authentification. Le mot de passe sépare les comptes entre collègues ; ce n'est pas lui qui chiffre les données de l'instance.", branding.name)}
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
