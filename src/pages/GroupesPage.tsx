import { useMemo, useState } from "react";
import { Check, Crown, Loader2, LogOut, Pencil, Plus, Trash2, UserMinus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { Avatar } from "@/components/ui/Avatar";
import { SearchInput } from "@/components/ui/SearchInput";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  creerGroupe,
  modifierGroupe,
  quitterGroupe,
  supprimerGroupe,
  useGroupes,
  photoDe,
  type Groupe,
  type Personne,
} from "@/lib/groupes";
import { useUtilisateurCourant } from "@/lib/store/identity";
import { cn } from "@/lib/cn";
import { t, tf } from "@/lib/i18n";

/**
 * Groupes de l'équipe. Un groupe réunit des collègues sous un nom : on lui
 * partage d'un geste une conversation ou un dossier de la bibliothèque, et
 * chaque membre le voit. Les groupes sont tenus par l'instance
 * (gateway/src/groupes.ts), qui vérifie qui peut les changer.
 */

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function GroupesPage() {
  const { etat, erreur, recharger } = useGroupes();
  const [onglet, setOnglet] = useState("miens");
  const [recherche, setRecherche] = useState("");
  const [creation, setCreation] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const groupes = etat?.groupes ?? [];
  const miens = groupes.filter((g) => g.estMembre);
  const terme = recherche.trim().toLocaleLowerCase("fr");
  const visibles = (onglet === "miens" ? miens : groupes).filter(
    (g) =>
      !terme ||
      g.nom.toLocaleLowerCase("fr").includes(terme) ||
      g.description.toLocaleLowerCase("fr").includes(terme) ||
      g.membres.some((m) => m.nom.toLocaleLowerCase("fr").includes(terme)),
  );
  const detail = groupes.find((g) => g.id === ouvert) ?? null;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 py-7">
      <PageHeader
        icon={Users}
        title={t("Groupes")}
        subtitle={t("Réunissez des collègues pour leur partager d'un geste une conversation ou un dossier")}
        actions={
          <>
            <SearchInput
              placeholder={t("Rechercher un groupe...")}
              aria-label={t("Rechercher un groupe")}
              containerClassName="w-[240px]"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
            <Button icon={Plus} onClick={() => setCreation(true)} disabled={!etat}>
              {t("Nouveau groupe")}
            </Button>
          </>
        }
      />

      <div className="mt-6">
        <SegmentedTabs
          options={[
            { id: "miens", label: tf("Mes groupes ({0})", miens.length) },
            { id: "tous", label: tf("Tous ({0})", groupes.length) },
          ]}
          value={onglet}
          onChange={setOnglet}
        />
      </div>

      {erreur && (
        <InfoBox tone="warning" className="mt-4">
          {erreur}
        </InfoBox>
      )}

      {!etat && !erreur ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={Users}
          title={terme ? t("Aucun résultat") : onglet === "miens" ? t("Vous n'êtes dans aucun groupe") : t("Aucun groupe")}
          description={
            terme
              ? t("Aucun groupe ne correspond à votre recherche.")
              : t("Créez un groupe, « Comptabilité » ou « Direction » par exemple, puis partagez-lui vos conversations et vos dossiers.")
          }
        />
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((g) => (
            <li key={g.id}>
              <CarteGroupe groupe={g} onOuvrir={() => setOuvert(g.id)} />
            </li>
          ))}
        </ul>
      )}

      {creation && etat && (
        <CreationGroupe
          annuaire={etat.annuaire}
          onFermer={() => setCreation(false)}
          onCree={async (g) => {
            setCreation(false);
            await recharger();
            setOuvert(g.id);
          }}
        />
      )}
      {detail && etat && (
        <DetailGroupe groupe={detail} annuaire={etat.annuaire} onFermer={() => setOuvert(null)} onChange={recharger} />
      )}
    </div>
  );
}

/** Pile d'avatars : cinq au plus, puis « +n ». */
function Visages({ membres }: { membres: Personne[] }) {
  const montres = membres.slice(0, 5);
  return (
    <span className="flex items-center">
      {montres.map((m, i) => (
        <span key={m.id} className={cn("rounded-full ring-2 ring-card", i > 0 && "-ml-2")}>
          <Avatar size={26} initials={m.initiales} photo={photoDe(m.id)} nom={m.nom} />
        </span>
      ))}
      {membres.length > montres.length && (
        <span className="-ml-2 inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground ring-2 ring-card">
          +{membres.length - montres.length}
        </span>
      )}
    </span>
  );
}

function CarteGroupe({ groupe, onOuvrir }: { groupe: Groupe; onOuvrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="flex h-full w-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{groupe.nom}</p>
          <p className="text-xs text-muted-foreground">
            {(groupe.membres.length === 1 ? t("1 membre") : tf("{0} membres", groupe.membres.length))}
          </p>
        </div>
        {groupe.estMembre && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              groupe.estResponsable ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground",
            )}
          >
            {groupe.estResponsable && <Crown size={11} strokeWidth={2} />}
            {groupe.estResponsable ? t("Responsable") : "Membre"}
          </span>
        )}
      </div>
      <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
        {groupe.description || t("Pas de description.")}
      </p>
      <Visages membres={groupe.membres} />
    </button>
  );
}

/** Choix de personnes dans l'annuaire, avec une recherche. */
function ChoixMembres({
  annuaire,
  valeur,
  onChange,
  exclus = [],
}: {
  annuaire: Personne[];
  valeur: string[];
  onChange: (ids: string[]) => void;
  /** Déjà là, et qu'on ne peut pas décocher ici (vous-même, à la création). */
  exclus?: string[];
}) {
  const [terme, setTerme] = useState("");
  // Renommée : « t » est la fonction de traduction depuis la mise en langues.
  const cherche = terme.trim().toLocaleLowerCase("fr");
  const liste = annuaire.filter(
    (p) =>
      !exclus.includes(p.id) &&
      (!cherche ||
        p.nom.toLocaleLowerCase("fr").includes(cherche) ||
        p.email.includes(cherche)),
  );
  return (
    <div className="rounded-xl border border-border">
      <SearchInput
        variant="ghost"
        containerClassName="border-b border-border px-3"
        placeholder={t("Chercher une personne...")}
        aria-label={t("Chercher une personne")}
        value={terme}
        onChange={(e) => setTerme(e.target.value)}
      />
      <ul className="max-h-56 overflow-y-auto p-1">
        {liste.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">{t("Personne à ajouter.")}</li>}
        {liste.map((p) => {
          const coche = valeur.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onChange(coche ? valeur.filter((x) => x !== p.id) : [...valeur, p.id])}
                className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-muted", coche && "bg-muted")}
              >
                <Avatar size={28} initials={p.initiales} photo={photoDe(p.id)} nom={p.nom} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{p.nom}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                </span>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                    coche ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {coche && <Check size={13} strokeWidth={2.5} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CreationGroupe({
  annuaire,
  onFermer,
  onCree,
}: {
  annuaire: Personne[];
  onFermer: () => void;
  onCree: (g: Groupe) => Promise<void>;
}) {
  const moi = useUtilisateurCourant();
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [membres, setMembres] = useState<string[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <Modal open onClose={onFermer} size="md">
      <h2 className="text-lg font-semibold text-foreground">{t("Nouveau groupe")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Vous en serez responsable : vous pourrez le renommer, y ajouter ou en retirer des personnes.")}
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nom.trim() || occupe) return;
          setOccupe(true);
          setErreur(null);
          void creerGroupe({ nom, description, membres })
            .then(onCree)
            .catch((err) => {
              setErreur(message(err));
              setOccupe(false);
            });
        }}
      >
        <Field label={t("Nom du groupe")} required>
          <Input value={nom} maxLength={60} placeholder={t("Ex : Comptabilité")} autoFocus onChange={(e) => setNom(e.target.value)} />
        </Field>
        <Field label={t("Description")}>
          <Textarea
            rows={2}
            value={description}
            maxLength={500}
            placeholder={t("À quoi sert ce groupe")}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">
            {t("Membres")}{membres.length > 0 && tf(" ({0} avec vous)", membres.length + 1)}
          </p>
          <ChoixMembres annuaire={annuaire} valeur={membres} onChange={setMembres} exclus={[moi.id]} />
        </div>
        {erreur && <InfoBox tone="warning">{erreur}</InfoBox>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onFermer}>
            {t("Annuler")}
          </Button>
          <Button type="submit" disabled={!nom.trim() || occupe}>
            {occupe ? t("Création…") : t("Créer le groupe")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DetailGroupe({
  groupe,
  annuaire,
  onFermer,
  onChange,
}: {
  groupe: Groupe;
  annuaire: Personne[];
  onFermer: () => void;
  onChange: () => Promise<void>;
}) {
  const moi = useUtilisateurCourant();
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(groupe.nom);
  const [description, setDescription] = useState(groupe.description);
  const [ajout, setAjout] = useState<string[] | null>(null);
  const [confirmer, setConfirmer] = useState<"quitter" | "supprimer" | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ids = useMemo(() => groupe.membres.map((m) => m.id), [groupe.membres]);

  const agir = async (action: () => Promise<unknown>, fermer = false) => {
    setOccupe(true);
    setErreur(null);
    try {
      await action();
      await onChange();
      if (fermer) onFermer();
      return true;
    } catch (err) {
      setErreur(message(err));
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const changerMembres = (membres: string[], responsables = groupe.responsables.filter((r) => membres.includes(r))) =>
    agir(() => modifierGroupe(groupe.id, { membres, responsables }));

  return (
    <Modal open onClose={onFermer} size="md">
      {edition ? (
        <form
          className="space-y-3 pr-8"
          onSubmit={(e) => {
            e.preventDefault();
            void agir(() => modifierGroupe(groupe.id, { nom, description })).then((ok) => ok && setEdition(false));
          }}
        >
          <Field label={t("Nom du groupe")} required>
            <Input value={nom} maxLength={60} autoFocus onChange={(e) => setNom(e.target.value)} />
          </Field>
          <Field label={t("Description")}>
            <Textarea rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEdition(false)}>
              {t("Annuler")}
            </Button>
            <Button type="submit" size="sm" disabled={!nom.trim() || occupe}>
              {t("Enregistrer")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="pr-8">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-foreground">{groupe.nom}</h2>
            {groupe.estResponsable && (
              <button
                type="button"
                aria-label={t("Renommer le groupe")}
                onClick={() => {
                  setNom(groupe.nom);
                  setDescription(groupe.description);
                  setEdition(true);
                }}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {groupe.description || t("Pas de description.")}
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {(groupe.membres.length === 1 ? t("1 membre") : tf("{0} membres", groupe.membres.length))}
        </p>
        {groupe.estResponsable && ajout === null && (
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setAjout([])}>
            {t("Ajouter des personnes")}
          </Button>
        )}
      </div>

      {ajout !== null && (
        <div className="mt-2 space-y-2">
          <ChoixMembres annuaire={annuaire} valeur={ajout} onChange={setAjout} exclus={ids} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAjout(null)}>
              {t("Annuler")}
            </Button>
            <Button
              size="sm"
              disabled={ajout.length === 0 || occupe}
              onClick={() => void changerMembres([...ids, ...ajout]).then((ok) => ok && setAjout(null))}
            >
              {ajout.length > 1 ? `Ajouter ${ajout.length} personnes` : t("Ajouter")}
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
        {groupe.membres.map((m) => {
          const responsable = groupe.responsables.includes(m.id);
          return (
            <li key={m.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60">
              <Avatar size={30} initials={m.initiales} photo={photoDe(m.id)} nom={m.nom} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">
                  {m.nom}
                  {m.id === moi.id && <span className="text-muted-foreground">{" "}{t("(vous)")}</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
              </span>
              {responsable && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                  <Crown size={11} strokeWidth={2} />{" "}{t("Responsable")}
                </span>
              )}
              {groupe.estResponsable && m.id !== moi.id && (
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    disabled={occupe}
                    aria-label={responsable ? tf("Retirer le rôle de responsable à {0}", m.nom) : `Nommer ${m.nom} responsable`}
                    title={responsable ? t("Retirer le rôle de responsable") : "Nommer responsable"}
                    onClick={() =>
                      void agir(() =>
                        modifierGroupe(groupe.id, {
                          responsables: responsable
                            ? groupe.responsables.filter((r) => r !== m.id)
                            : [...groupe.responsables, m.id],
                        }),
                      )
                    }
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
                  >
                    <Crown size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    disabled={occupe}
                    aria-label={tf("Retirer {0} du groupe", m.nom)}
                    title={t("Retirer du groupe")}
                    onClick={() => void changerMembres(ids.filter((x) => x !== m.id))}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-destructive"
                  >
                    <UserMinus size={14} strokeWidth={1.75} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        {t("Ce qu'on partage avec ce groupe (une conversation, un dossier de la bibliothèque), chaque membre le voit, et le perd s'il quitte le groupe.")}
      </p>

      {erreur && (
        <InfoBox tone="warning" className="mt-3">
          {erreur}
        </InfoBox>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        {confirmer ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-foreground">
              {confirmer === "supprimer"
                ? tf("Supprimer « {0} » ? Ses membres perdent ce qui lui était partagé.", groupe.nom)
                : tf("Quitter « {0} » ? Vous perdez ce qui lui est partagé.", groupe.nom)}
            </span>
            <Button
              variant="destructive"
              size="sm"
              disabled={occupe}
              onClick={() =>
                void agir(() => (confirmer === "supprimer" ? supprimerGroupe(groupe.id) : quitterGroupe(groupe.id)), true)
              }
            >
              {confirmer === "supprimer" ? t("Supprimer") : "Quitter"}
            </Button>
            <Button variant="ghost" size="sm" icon={X} onClick={() => setConfirmer(null)}>
              {t("Annuler")}
            </Button>
          </div>
        ) : (
          <>
            {groupe.estMembre ? (
              <Button variant="ghost" size="sm" icon={LogOut} onClick={() => setConfirmer("quitter")}>
                {t("Quitter le groupe")}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{t("Vous n'êtes pas membre de ce groupe.")}</span>
            )}
            {groupe.estResponsable && (
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmer("supprimer")}>
                {t("Supprimer le groupe")}
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default GroupesPage;
