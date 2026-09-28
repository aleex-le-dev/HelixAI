import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  Check,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  Lock,
  Plus,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  etat as lireEtat,
  ajouter as brancher,
  connecter as autoriser,
  retirer as debrancher,
  CONNECTEURS_CHANGE,
  type EntreeCatalogue,
  type EtatConnecteurs,
} from "@/lib/connecteurs";
import { MCP_CHANGE } from "@/hooks/useMcp";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { SearchInput } from "@/components/ui/SearchInput";
import { LogoMarque } from "@/components/settings/TuileService";
import {
  MARQUE_DU_CONNECTEUR,
  ICONE_DU_CONNECTEUR,
  ICONE_PAR_DEFAUT,
} from "@/components/settings/marquesConnecteurs";
import type { CleMarquePetite } from "@/components/ui/marques";
import { AideMcpProjet } from "@/components/settings/ConnecteurProjets";
import { branding } from "@/config/branding";
import { cn } from "@/lib/cn";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";

/**
 * Écran des connecteurs.
 *
 * Deux façons de brancher un service, et l'écran dit toujours laquelle
 * s'applique :
 *
 *  - **Se connecter** : le service publie son propre serveur, on l'autorise
 *    dans son navigateur, comme partout ailleurs. Rien à installer, aucun
 *    jeton à trouver. La page d'autorisation est celle du service : Helix ne
 *    voit jamais le mot de passe ;
 *  - **par jeton** : le service n'offre pas cette voie. On colle un jeton, et
 *    un serveur tourne sur la machine de l'instance.
 *
 * Ce que l'écran ne propose pas compte autant : il n'y a **aucun champ de
 * commande**. Un serveur MCP local est un programme exécuté sur la machine de
 * l'entreprise ; laisser l'interface le choisir reviendrait à offrir
 * l'exécution de code à distance à quiconque atteint la passerelle. La
 * commande vient du catalogue de l'instance, la personne n'apporte que ses
 * identifiants.
 */

/** Date d'ajout, dite comme on la dirait à l'oral. */
function depuisLisible(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formaterDate(date);
}

/**
 * Un service branché par son propre écran : courrier, agenda, Drive, Slack.
 *
 * Ces quatre-là ne sont pas des serveurs du catalogue — ils ont chacun leur
 * panneau de réglages. Ils étaient donc présentés à part, en tuiles, au-dessus
 * de la liste : Gmail apparaissait ainsi deux fois à l'écran, une fois en
 * tuile et une fois dans la liste, et il fallait comprendre que les deux blocs
 * répondaient à la même question. Ils rejoignent la liste, avec leur logo et
 * leur panneau, et la recherche les trouve comme les autres.
 */
export interface ServiceMaison {
  id: string;
  label: string;
  description: string;
  categorie: string;
  marque?: CleMarquePetite;
  icone?: LucideIcon;
  connecte: boolean;
  ouvert: boolean;
  onBasculer: () => void;
  /** Le panneau de réglages, affiché sous la ligne quand elle est ouverte. */
  panneau: ReactNode;
}

/**
 * Le logo d'un service, avec un point d'état posé dessus.
 *
 * Il y avait un point seul, gris ou vert, devant un nom : trente lignes
 * identiques dans lesquelles on cherchait son service en lisant. Le logo se
 * reconnaît sans lire, et le point garde la seule chose qu'il disait — branché,
 * branché mais arrêté, pas branché.
 */
function Pastille({
  id,
  etat,
  marque,
  icone,
}: {
  id?: string;
  etat: "actif" | "attention" | "eteint";
  marque?: CleMarquePetite;
  icone?: LucideIcon;
}) {
  const marqueRetenue = marque ?? (id ? MARQUE_DU_CONNECTEUR[id] : undefined);
  const iconeRetenue = icone ?? (id ? ICONE_DU_CONNECTEUR[id] : undefined) ?? ICONE_PAR_DEFAUT;
  return (
    <span className="relative shrink-0">
      <LogoMarque marque={marqueRetenue} icone={marqueRetenue ? undefined : iconeRetenue} taille={22} />
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-card",
          etat === "actif" ? "bg-success" : etat === "attention" ? "bg-warning" : "bg-neutral-70",
        )}
      />
    </span>
  );
}

/** « Réunion » et « reunion » doivent se trouver l'un l'autre. */
const plier = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Connecteurs({ maison = [] }: { maison?: ServiceMaison[] } = {}) {
  const [etat, setEtat] = useState<EtatConnecteurs | null | undefined>(undefined);
  /** Connecteur dont le formulaire est ouvert (jeton, ou identifiants d'application). */
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [attente, setAttente] = useState<string | null>(null);
  const [retrait, setRetrait] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  /** Trello, Monday… : l'écriture cochée dans le formulaire (ConnecteurProjets.tsx). */
  const [ecriture, setEcriture] = useState(false);
  const sondage = useRef<ReturnType<typeof setInterval> | null>(null);

  const recharger = useCallback(() => {
    void lireEtat().then(setEtat);
  }, []);

  /**
   * Brancher ou débrancher change aussi la liste des serveurs MCP.
   *
   * Le panneau de Cowork et la puce « Outils » lisent cette liste par `useMcp`,
   * qui a son propre signal. Sans ce relais, retirer un connecteur le faisait
   * disparaître d'un écran tout en le laissant affiché, actif, dans l'autre.
   */
  const signalerAuxServeurs = useCallback(() => {
    window.dispatchEvent(new Event(MCP_CHANGE));
  }, []);

  useEffect(() => {
    recharger();
    window.addEventListener(CONNECTEURS_CHANGE, recharger);
    return () => window.removeEventListener(CONNECTEURS_CHANGE, recharger);
  }, [recharger]);

  // Le sondage de l'autorisation en cours s'arrête avec l'écran.
  useEffect(() => () => {
    if (sondage.current) clearInterval(sondage.current);
  }, []);

  const terme = plier(recherche.trim());

  /** Les services maison retenus par la recherche, groupés comme les autres. */
  const maisonParCategorie = useMemo(() => {
    const retenu = (s: ServiceMaison) =>
      !terme || plier(`${s.label} ${s.description} ${s.categorie}`).includes(terme);
    const groupes: { cat: string; services: ServiceMaison[] }[] = [];
    for (const service of maison.filter(retenu)) {
      const existant = groupes.find((g) => g.cat === service.categorie);
      if (existant) existant.services.push(service);
      else groupes.push({ cat: service.categorie, services: [service] });
    }
    return groupes;
  }, [maison, terme]);

  const parCategorie = useMemo(() => {
    if (!etat) return [];
    const retenu = (e: EntreeCatalogue) =>
      !terme || plier(`${e.label} ${e.description} ${e.categorie}`).includes(terme);
    return etat.categories
      .map((cat) => ({
        cat,
        entrees: etat.catalogue.filter((e) => e.categorie === cat && retenu(e)),
      }))
      .filter((g) => g.entrees.length > 0);
  }, [etat, terme]);

  /*
   * Ce qui est livré avec le produit passe devant.
   *
   * Ces serveurs-là sont déjà là et fonctionnent sans rien brancher : les
   * mettre après les services à connecter, c'était faire chercher ce qu'on a
   * déjà. Le groupe est reconnu à l'attribut `integre` et non à son titre, qui
   * est du texte traduit et peut changer.
   */
  const livrees = parCategorie.filter((g) => g.entrees.some((e) => e.integre));
  const aBrancher = parCategorie.filter((g) => !g.entrees.some((e) => e.integre));

  if (etat === undefined) {
    return (
      <Card className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />{" "}{t("Lecture des connecteurs...")}
      </Card>
    );
  }

  if (etat === null) {
    return (
      <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
        {t("Instance injoignable. Les connecteurs vivent dans l'instance : sans elle, rien ne peut être branché ni retiré.")}
      </InfoBox>
    );
  }

  const installe = (id: string) => etat.installes.find((c) => c.id === id);

  const ouvrir = (entree: EntreeCatalogue) => {
    setOuvert(entree.id);
    setSaisie(
      entree.oauth === "appli"
        ? { clientId: "", clientSecret: "" }
        : Object.fromEntries(entree.secrets.map((s) => [s.nom, ""])),
    );
    setEcriture(false);
    setErreur(null);
    setSucces(null);
  };

  const fermer = () => {
    setOuvert(null);
    // Les secrets saisis ne survivent pas à la fermeture du formulaire : ils
    // n'ont aucune raison de rester en mémoire du navigateur.
    setSaisie({});
  };

  /**
   * Attend le retour de l'autorisation.
   *
   * La personne autorise dans son navigateur, hors de l'application : c'est
   * l'instance qui reçoit le retour. On relit donc son état jusqu'à ce que le
   * service apparaisse branché, plutôt que de demander à la personne de
   * rafraîchir elle-même.
   */
  const attendreRetour = (id: string) => {
    setAttente(id);
    if (sondage.current) clearInterval(sondage.current);
    let tours = 0;
    sondage.current = setInterval(() => {
      tours += 1;
      void lireEtat().then((suite) => {
        if (!suite) return;
        setEtat(suite);
        const vivant = suite.installes.find((c) => c.id === id);
        if (vivant?.running || tours > 150) {
          if (sondage.current) clearInterval(sondage.current);
          sondage.current = null;
          setAttente(null);
          if (vivant?.running) {
            setSucces(tf("{0} est branché : {1} outil(s) disponibles.", vivant.label, vivant.toolCount));
            signalerAuxServeurs();
          }
        }
      });
    }, 2000);
  };

  const seConnecter = async (entree: EntreeCatalogue) => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const resultat = await autoriser(
      entree.id,
      entree.oauth === "appli"
        ? { clientId: saisie.clientId ?? "", clientSecret: saisie.clientSecret ?? "" }
        : undefined,
      entree.ecritureAuChoix ? ecriture : undefined,
    );
    setEnCours(false);
    if (!resultat.ok) {
      // Un service qui réclame une application : on ouvre le formulaire.
      if (entree.oauth === "appli" && ouvert !== entree.id) ouvrir(entree);
      /*
       * Après `ouvrir`, qui efface le message (revérification du 28/09/2026) :
       * posé avant, il disparaissait aussitôt, et avec lui l'adresse de retour
       * à déclarer chez le service, que le formulaire annonce « dans le
       * message ci-dessous ». Sans elle, impossible de créer l'application.
       */
      setErreur(resultat.message);
      return;
    }
    if (resultat.etat) setEtat(resultat.etat);
    if (resultat.pret) {
      setSucces(resultat.message);
      fermer();
      signalerAuxServeurs();
      return;
    }
    if (resultat.adresse) {
      fermer();
      setSucces(
        tf("Autorisez {0} dans la fenêtre qui vient de s'ouvrir, puis revenez ici.", entree.label),
      );
      // Le navigateur du système, jamais une fenêtre de l'application : la
      // page d'autorisation est celle du service, et doit le rester.
      window.open(resultat.adresse, "_blank", "noopener,noreferrer");
      attendreRetour(entree.id);
    }
  };

  const soumettreJeton = async (entree: EntreeCatalogue) => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const resultat = await brancher(entree.id, saisie);
    setEnCours(false);
    if (resultat.ok) {
      setSucces(resultat.message);
      fermer();
      if (resultat.etat) setEtat(resultat.etat);
      signalerAuxServeurs();
    } else {
      setErreur(resultat.message);
    }
  };

  const retirerConnecteur = async (id: string) => {
    setRetrait(id);
    setErreur(null);
    setSucces(null);
    const resultat = await debrancher(id);
    setRetrait(null);
    if (resultat.ok) {
      setSucces(resultat.message);
      if (resultat.etat) setEtat(resultat.etat);
      signalerAuxServeurs();
    } else {
      setErreur(resultat.message);
    }
  };

  /** Une ligne de service maison : même dessin que les autres, panneau dessous. */
  const ligneMaison = (service: ServiceMaison) => (
    <div key={service.id} className="rounded-xl border border-border">
      <button
        type="button"
        onClick={service.onBasculer}
        aria-expanded={service.ouvert}
        className="flex w-full flex-wrap items-center gap-3 rounded-xl p-3.5 text-left transition-colors hover:bg-muted"
      >
        <Pastille
          etat={service.connecte ? "actif" : "eteint"}
          marque={service.marque}
          icone={service.icone}
        />
        <span className="min-w-[9rem] flex-1">
          <span className="block text-sm font-medium text-foreground">{service.label}</span>
          <span className="block text-xs text-muted-foreground">{service.description}</span>
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {service.connecte ? t("Connecté") : t("Connecter")}
        </span>
      </button>
      {service.ouvert && <div className="border-t border-border p-3.5">{service.panneau}</div>}
    </div>
  );

  const ligne = (entree: EntreeCatalogue) => {
    const vivant = installe(entree.id);
    /*
     * Le serveur de fichiers est livré avec Helix : il apparaît ici comme les
     * autres, mais sans bouton. Le masquer laisserait croire que l'agent n'a
     * accès à rien tant qu'on n'a rien branché.
     */
    const branche = entree.integre || Boolean(vivant);
    const actif = entree.integre ? true : (vivant?.running ?? false);
    const distant = Boolean(entree.url);

    return (
      <div key={entree.id} className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-3 p-3.5">
          <Pastille
            id={entree.id}
            etat={branche && actif ? "actif" : branche ? "attention" : "eteint"}
          />
          {/*
            Une largeur minimale (28/09/2026) : sous 400 px, le texte se réduisait à un mot par
            ligne et passait sous le bouton ; avec elle, c'est le bouton qui va à la ligne.
          */}
          <div className="min-w-[9rem] flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {entree.label}
              {!entree.integre && (
                <span
                  className="text-muted-foreground"
                  title={
                    distant
                      ? t("Service distant : rien ne s'installe sur cette machine.")
                      : t("Serveur exécuté sur la machine de l'instance.")
                  }
                >
                  {distant ? (
                    <Globe size={12} strokeWidth={1.75} />
                  ) : (
                    <Terminal size={12} strokeWidth={1.75} />
                  )}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{entree.description}</p>
            {vivant?.error && <p className="mt-1 text-xs text-destructive">{vivant.error}</p>}
            {vivant && !vivant.error && (
              <p className="mt-1 text-xs text-muted-foreground">
                {vivant.toolCount}{" "}{t("outil(s)")}
                {vivant.depuis && tf(" · connecté le {0}", depuisLisible(vivant.depuis))}
              </p>
            )}
            {!vivant && entree.oauth === "auto" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Un clic : vous autorisez chez")}{" "}{entree.label}{t(", rien n'est à installer.")}
              </p>
            )}
            {!vivant && entree.oauth === "appli" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Demande une application déclarée chez")}{" "}{entree.label}{t(", une seule fois.")}
              </p>
            )}
          </div>

          {entree.integre ? (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t("Livré avec")}{" "}{branding.name}
            </span>
          ) : vivant ? (
            <Button
              variant="ghost"
              size="sm"
              icon={retrait === entree.id ? Loader2 : Trash2}
              disabled={retrait === entree.id}
              onClick={() => void retirerConnecteur(entree.id)}
            >
              {retrait === entree.id ? t("Retrait...") : t("Retirer")}
            </Button>
          ) : attente === entree.id ? (
            <Button variant="ghost" size="sm" icon={Loader2} disabled>
              {t("En attente de votre accord...")}
            </Button>
          ) : ouvert === entree.id ? (
            <Button variant="ghost" size="sm" icon={X} onClick={fermer}>
              {t("Annuler")}
            </Button>
          ) : distant ? (
            <Button
              variant="secondary"
              size="sm"
              icon={enCours ? Loader2 : ExternalLink}
              disabled={enCours || !etat.chiffrementDonnees}
              // Trello, Monday… : d'abord le formulaire, qui dit ce qui se passe et propose l'écriture.
              onClick={() => (entree.ecritureAuChoix ? ouvrir(entree) : void seConnecter(entree))}
            >
              {t("Se connecter")}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => ouvrir(entree)}>
              {t("Connecter")}
            </Button>
          )}
        </div>

        {ouvert === entree.id && (
          <form
            className="space-y-3 border-t border-border p-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (entree.oauth === "appli" || entree.ecritureAuChoix) void seConnecter(entree);
              else void soumettreJeton(entree);
            }}
          >
            {entree.ecritureAuChoix && <AideMcpProjet id={entree.id} nom={entree.label} />}
            {entree.oauth === "appli" ? (
              <>
                <p className={cn("text-sm text-muted-foreground", entree.ecritureAuChoix && "hidden")}>
                  {entree.label}{" "}{t("veut connaître l'application qui demande l'accès. Créez-la une fois chez eux, indiquez comme adresse de retour celle que l'instance vous donnera dans le message ci-dessous, puis collez son identifiant. Ensuite, « Se connecter » suffira à tout le monde.")}
                </p>
                <Field label={t("Identifiant de l'application (client ID)")} required>
                  <Input
                    autoComplete="off"
                    value={saisie.clientId ?? ""}
                    onChange={(e) => setSaisie((s) => ({ ...s, clientId: e.target.value }))}
                  />
                </Field>
                <Field label={t("Secret de l'application (si le service en donne un)")}>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={saisie.clientSecret ?? ""}
                    onChange={(e) => setSaisie((s) => ({ ...s, clientSecret: e.target.value }))}
                  />
                </Field>
              </>
            ) : (
              <>
                {entree.secrets.map((champ) => (
                  <Field key={champ.nom} label={champ.libelle} hint={champ.aide} required>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={saisie[champ.nom] ?? ""}
                      onChange={(event) =>
                        setSaisie((s) => ({ ...s, [champ.nom]: event.target.value }))
                      }
                      placeholder={t("Collez le jeton ici")}
                    />
                  </Field>
                ))}
                {entree.secrets.length === 0 && !entree.ecritureAuChoix && (
                  <p className="text-sm text-muted-foreground">
                    {t("Ce connecteur ne demande aucun identifiant.")}
                  </p>
                )}
              </>
            )}

            {entree.ecritureAuChoix && (
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" className="mt-1" checked={ecriture} onChange={(e) => setEcriture(e.target.checked)} />
                <span>
                  {tf("Permettre aussi d'écrire dans {0}.", entree.label)}{" "}
                  <span className="text-muted-foreground">{t("Chaque écriture vous sera montrée en entier et demandera votre accord.")}</span>
                </span>
              </label>
            )}

            {erreur && (
              <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
                {erreur}
              </InfoBox>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                icon={enCours ? Loader2 : Check}
                disabled={enCours || !etat.chiffrementDonnees}
              >
                {enCours ? t("Connexion...") : entree.ecritureAuChoix ? t("Se connecter") : t("Connecter")}
              </Button>
              {(entree.console ?? entree.documentation) && (
                <a
                  href={entree.console ?? entree.documentation}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink size={14} strokeWidth={1.75} />
                  {entree.oauth === "appli" ? t("Créer l'application") : entree.ecritureAuChoix ? t("Documentation du service") : t("Où trouver mon jeton")}
                </a>
              )}
            </div>
          </form>
        )}
      </div>
    );
  };

  return (
    <>
      {/*
        Le chiffrement conditionne l'enregistrement d'un jeton : l'annoncer ici
        évite de laisser quelqu'un remplir un formulaire que l'instance
        refusera de toute façon.
      */}
      {!etat.chiffrementDonnees && (
        <InfoBox
          tone="warning"
          className="mb-4"
          leading={<ShieldAlert size={15} strokeWidth={1.75} />}
        >
          {t("Le chiffrement des données n'est pas actif sur cette instance :")}{" "}
          {branding.name}{" "}{t("refusera d'enregistrer un jeton d'accès. Déverrouillez le trousseau du compte hôte, ou réglez « chiffrement » sur « fichier » dans le profil de déploiement.")}
        </InfoBox>
      )}

      {succes && (
        <InfoBox className="mb-4" leading={<Check size={15} strokeWidth={2} />}>
          {succes}
        </InfoBox>
      )}
      {erreur && !ouvert && (
        <InfoBox tone="warning" className="mb-4" leading={<Info size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}

      <Card>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Blocks size={18} strokeWidth={1.75} />{" "}{t("Services connectés")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Chaque service branché ajoute ses outils à vos agents, dans le Chat comme dans Cowork. Un service branché l'est pour toute l'instance.")}
        </p>

        <div className="mt-4">
          <SearchInput
            placeholder={t("Chercher un service...")}
            aria-label={t("Chercher un service")}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>

        {parCategorie.length === 0 && maisonParCategorie.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("Aucun service ne correspond à votre recherche.")}
          </p>
        )}

        {/* D'abord ce qui marche déjà, ensuite ce qui se branche. */}
        {livrees.map(({ cat, entrees }) => (
          <div key={cat} className="mt-5">
            <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {cat}
            </p>
            <div className="space-y-2">{entrees.map(ligne)}</div>
          </div>
        ))}

        {/*
         * Puis les services à panneau : ce sont ceux que presque tout le monde
         * branche, et ceux qu'on vient chercher en arrivant.
         */}
        {maisonParCategorie.map(({ cat, services }) => (
          <div key={cat} className="mt-5">
            <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {cat}
            </p>
            <div className="space-y-2">{services.map(ligneMaison)}</div>
          </div>
        ))}

        {aBrancher.map(({ cat, entrees }) => (
          <div key={cat} className="mt-5">
            <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {cat}
            </p>
            <div className="space-y-2">{entrees.map(ligne)}</div>
          </div>
        ))}

        {/*
          Connecteurs hors catalogue : ils n'existent que si l'intégrateur les a
          posés dans le profil de déploiement, et ils ne se retirent pas moins
          facilement pour autant.
        */}
        {etat.installes
          .filter((c) => !etat.catalogue.some((e) => e.id === c.id))
          .map((c) => (
            <div key={c.id} className="mt-2 rounded-xl border border-border">
              <div className="flex flex-wrap items-center gap-3 p-3.5">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    c.running ? "bg-success" : "bg-warning",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.toolCount}{" "}{t("outil(s) · ajouté hors catalogue par l'intégrateur")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={retrait === c.id ? Loader2 : Trash2}
                  disabled={retrait === c.id}
                  onClick={() => void retirerConnecteur(c.id)}
                >
                  {retrait === c.id ? t("Retrait...") : t("Retirer")}
                </Button>
              </div>
            </div>
          ))}
      </Card>

      <InfoBox className="mt-4" leading={<Lock size={15} strokeWidth={1.75} />}>
        {t("Deux façons de brancher, et aucune ne passe par un tiers.")}{" "}
        <strong className="font-medium">{t("Se connecter")}</strong>{" "}{t("vous envoie chez le service, qui vous demande votre accord ; le jeton revient chiffré dans l'instance et n'en sort plus.")}{" "}<strong className="font-medium">{t("Par jeton")}</strong>{" "}{t("lance un serveur sur la machine de l'instance :")}{" "}{branding.name}{" "}{t("ne lance que les commandes de son catalogue, jamais une commande venue de cet écran, et le jeton est transmis par l'environnement, sans jamais apparaître dans la liste des processus.")}
        {etat.commandeLibre && (
          <>
            {" "}
            {t("Cette instance a été réglée pour accepter aussi des serveurs internes définis par l'intégrateur.")}
          </>
        )}
      </InfoBox>
    </>
  );
}

export default Connecteurs;
