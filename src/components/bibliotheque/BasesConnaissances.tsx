import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, Check, FileText, Globe, Loader2, Lock, Plus, RotateCw, Search, Trash2, TriangleAlert, Upload, Users, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { SearchInput } from "@/components/ui/SearchInput";
import { cn } from "@/lib/cn";
import { formaterDate } from "@/lib/formats";
import type { Groupe } from "@/lib/groupes";
import { importerDocument, type Visibilite } from "@/lib/bibliotheque";
import {
  ajouterDocuments,
  creerBase,
  documentsDisponibles,
  essayerQuestion,
  modifierBase,
  reindexer,
  retirerDocument,
  supprimerBase,
  useBases,
  type Base,
  type DocumentDeBase,
  type DocumentDisponible,
  type Recherche,
} from "@/lib/connaissances";
import { ChoixVisibilite } from "@/pages/BibliothequePage";
import { t, tf } from "@/lib/i18n";

/**
 * Bases de connaissances, dans la Bibliothèque : on y rassemble des documents
 * pour que le Chat, Cowork et les agents y cherchent avant de répondre.
 *
 * L'écran ne promet que ce que l'instance fait : il montre l'état réel de
 * l'indexation de chaque document (en attente, en cours avec sa progression,
 * prêt, en échec avec la raison), le modèle qui l'a faite, et permet
 * d'essayer une question pour voir les passages qui ressortent.
 */

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function PastilleBase({ base, groupes }: { base: Pick<Base, "visibilite" | "groupes">; groupes: Groupe[] }) {
  if (base.visibilite === "organisation") {
    return (
      <span className="inline-flex items-center gap-1">
        <Globe size={13} strokeWidth={1.75} />{" "}{t("Toute l'équipe")}
      </span>
    );
  }
  if (base.visibilite === "groupes") {
    const noms = base.groupes.map((id) => groupes.find((g) => g.id === id)?.nom ?? t("Groupe supprimé"));
    return (
      <span className="inline-flex max-w-[240px] items-center gap-1 truncate" title={noms.join(", ")}>
        <Users size={13} strokeWidth={1.75} className="shrink-0" /> <span className="truncate">{noms.join(", ")}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Lock size={13} strokeWidth={1.75} />{" "}{t("Vous seul")}
    </span>
  );
}

function Progression({ fait, total }: { fait: number; total: number }) {
  const part = total > 0 ? Math.min(100, Math.round((fait / total) * 100)) : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={part} aria-valuemin={0} aria-valuemax={100}>
        <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${part}%` }} />
      </span>
      <span className="tabular-nums">{total > 0 ? tf("{0} sur {1} passages", fait, total) : t("Découpage...")}</span>
    </span>
  );
}

function EtatDocument({ d }: { d: DocumentDeBase }) {
  if (d.etat === "pret") {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <Check size={13} strokeWidth={2.5} /> {t("Prêt")}
      </span>
    );
  }
  if (d.etat === "encours") return <Progression fait={d.fait} total={d.total} />;
  if (d.etat === "attente") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 size={13} className="animate-spin" /> {t("En attente")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-destructive" title={d.detail ?? undefined}>
      <TriangleAlert size={13} strokeWidth={2} /> {d.etat === "sans_texte" ? t("Sans texte") : t("Échec")}
    </span>
  );
}

export function BasesConnaissances({ mesGroupes, groupes }: { mesGroupes: Groupe[]; groupes: Groupe[] }) {
  const { bases, erreur, recharger } = useBases();
  const [creation, setCreation] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const base = bases?.find((b) => b.id === ouverte) ?? null;

  return (
    <div className="mt-4 flex flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t(
            "Une base rassemble des documents de la Bibliothèque. L'instance les découpe en passages et les indexe avec le modèle d'embeddings de la machine. Le Chat, Cowork et les agents à qui vous attachez une base y cherchent avant de répondre, et citent les passages utilisés. Chacun n'y retrouve que les documents qu'il a le droit de voir dans la Bibliothèque.",
          )}
        </p>
        <Button icon={Plus} onClick={() => setCreation(true)}>
          {t("Nouvelle base")}
        </Button>
      </div>

      {erreur && (
        <InfoBox tone="warning" className="mt-4">
          {erreur}
        </InfoBox>
      )}

      {!bases && !erreur ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : bases && bases.length === 0 ? (
        <EmptyState
          icon={BookOpenText}
          title={t("Aucune base de connaissances")}
          description={t("Créez une base, ajoutez-y des documents : vos agents pourront répondre à partir d'eux.")}
        />
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(bases ?? []).map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setOuverte(b.id)}
                className="flex h-full w-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm"
              >
                <span className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <BookOpenText size={18} strokeWidth={1.75} className="text-info" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{b.nom}</span>
                    <span className="block text-xs text-muted-foreground">
                      <PastilleBase base={b} groupes={groupes} />
                    </span>
                  </span>
                </span>
                {b.description && <span className="line-clamp-2 text-sm text-muted-foreground">{b.description}</span>}
                <span className="mt-auto text-xs text-muted-foreground">
                  {b.enCours ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> {t("Indexation en cours")}
                    </span>
                  ) : (
                    tf("{0} document(s), {1} passage(s)", b.documents.length + b.masques, b.morceaux)
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {creation && (
        <BaseModal
          mesGroupes={mesGroupes}
          onFermer={() => setCreation(false)}
          onFait={async (b) => {
            setCreation(false);
            await recharger();
            setOuverte(b.id);
          }}
        />
      )}
      {base && (
        <DetailBase
          base={base}
          groupes={groupes}
          mesGroupes={mesGroupes}
          onFermer={() => setOuverte(null)}
          onChange={recharger}
        />
      )}
    </div>
  );
}

/** Créer une base, ou changer son nom, sa description et qui la voit. */
function BaseModal({
  base,
  mesGroupes,
  onFermer,
  onFait,
}: {
  base?: Base;
  mesGroupes: Groupe[];
  onFermer: () => void;
  onFait: (b: Base) => void | Promise<void>;
}) {
  const [nom, setNom] = useState(base?.nom ?? "");
  const [description, setDescription] = useState(base?.description ?? "");
  const [vis, setVis] = useState<{ v: Visibilite; g: string[] }>({ v: base?.visibilite ?? "prive", g: base?.groupes ?? [] });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const valider = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const d = { nom, description, visibilite: vis.v, groupes: vis.g };
      await onFait(base ? await modifierBase(base.id, d) : await creerBase(d));
    } catch (err) {
      setErreur(message(err));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal open onClose={onFermer} size="lg">
      <h2 className="text-lg font-semibold text-foreground">{base ? t("Modifier la base") : t("Nouvelle base de connaissances")}</h2>
      <div className="mt-5 space-y-4">
        <Field label={t("Nom")} required>
          <Input value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} placeholder={t("Par exemple : Règles internes")} />
        </Field>
        <Field label={t("Description")} hint={t("Ce qu'on y trouve, pour que vos collègues sachent quand la choisir.")}>
          <Textarea rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t("Qui peut s'en servir")} hint={t("Voir une base ne donne pas accès à ses documents : chacun n'y retrouve que ceux qu'il voit dans la Bibliothèque.")}>
          <ChoixVisibilite visibilite={vis.v} groupes={vis.g} mesGroupes={mesGroupes} onChange={(v, g) => setVis({ v, g })} />
        </Field>
        {erreur && <InfoBox tone="warning">{erreur}</InfoBox>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onFermer}>
          {t("Annuler")}
        </Button>
        <Button disabled={!nom.trim() || envoi || (vis.v === "groupes" && vis.g.length === 0)} icon={envoi ? Loader2 : undefined} onClick={() => void valider()}>
          {base ? t("Enregistrer") : t("Créer la base")}
        </Button>
      </div>
    </Modal>
  );
}

function DetailBase({
  base,
  groupes,
  mesGroupes,
  onFermer,
  onChange,
}: {
  base: Base;
  groupes: Groupe[];
  mesGroupes: Groupe[];
  onFermer: () => void;
  onChange: () => Promise<void>;
}) {
  const [ajout, setAjout] = useState(false);
  const [edition, setEdition] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const choix = useRef<HTMLInputElement>(null);

  const agir = async (travail: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await travail();
      await onChange();
    } catch (err) {
      setErreur(message(err));
    }
  };

  /*
   * Importer un fichier depuis le poste : il entre dans la Bibliothèque
   * (à la racine, visible comme la base), puis dans la base. Le texte est
   * extrait ici, sur le poste, comme pour tout document de la Bibliothèque.
   */
  const importer = async (fichiers: File[]) => {
    const ids: string[] = [];
    for (const f of fichiers) {
      setEnvoi(tf("Envoi de « {0} »...", f.name));
      try {
        const e = await importerDocument(f, { parentId: null, visibilite: base.visibilite, groupes: base.groupes });
        ids.push(e.id);
      } catch (err) {
        setErreur(message(err));
      }
    }
    setEnvoi(null);
    if (ids.length > 0) await agir(() => ajouterDocuments(base.id, ids));
  };

  return (
    <Modal open onClose={onFermer} size="xl">
      <div className="pr-8">
        <h2 className="text-lg font-semibold text-foreground">{base.nom}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <PastilleBase base={base} groupes={groupes} />
          <span>{tf("{0} passage(s) indexé(s)", base.morceaux)}</span>
          <span>{tf("Créée le {0}", formaterDate(base.createdAt))}</span>
        </p>
        {base.description && <p className="mt-2 text-sm text-foreground">{base.description}</p>}
      </div>

      {base.estProprietaire && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" icon={Plus} onClick={() => setAjout(true)}>
            {t("Ajouter depuis la Bibliothèque")}
          </Button>
          <Button size="sm" variant="secondary" icon={Upload} disabled={Boolean(envoi)} onClick={() => choix.current?.click()}>
            {t("Importer un fichier")}
          </Button>
          <input
            ref={choix}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const fichiers = [...(e.target.files ?? [])];
              e.target.value = "";
              if (fichiers.length > 0) void importer(fichiers);
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => setEdition(true)}>
            {t("Modifier")}
          </Button>
          <Button size="sm" variant="secondary" icon={RotateCw} disabled={base.documents.length === 0} onClick={() => void agir(() => reindexer(base.id))}>
            {t("Tout réindexer")}
          </Button>
          {confirmer ? (
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  void agir(async () => {
                    await supprimerBase(base.id);
                    onFermer();
                  })
                }
              >
                {t("Supprimer la base")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmer(false)}>
                {t("Annuler")}
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmer(true)}>
              {t("Supprimer")}
            </Button>
          )}
        </div>
      )}
      {confirmer && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Les documents restent dans la Bibliothèque : seuls la base et ses index sont supprimés.")}
        </p>
      )}
      {envoi && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> {envoi}
        </p>
      )}
      {erreur && (
        <InfoBox tone="warning" className="mt-3">
          {erreur}
        </InfoBox>
      )}

      <div className="mt-4 max-h-[320px] overflow-y-auto">
        {base.documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {base.masques > 0
              ? t("Vous ne voyez aucun des documents de cette base dans la Bibliothèque.")
              : t("Aucun document pour l'instant.")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">{t("Document")}</th>
                <th className="py-2 font-medium">{t("État")}</th>
                <th className="py-2 text-right font-medium">{t("Passages")}</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {base.documents.map((d) => (
                <tr key={d.id} className="border-b border-border/60">
                  <td className="max-w-[280px] py-2">
                    <span className="flex items-center gap-2">
                      <FileText size={15} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground">{d.nom}</span>
                    </span>
                    {d.erreur && <span className="mt-0.5 block text-xs text-muted-foreground">{d.erreur}</span>}
                    {d.etat === "pret" && d.modele && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {tf("Indexé par {0} en {1} s", d.modele, ((d.dureeMs ?? 0) / 1000).toFixed(1))}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-xs">
                    <EtatDocument d={d} />
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{d.etat === "pret" ? d.morceaux : ""}</td>
                  <td className="py-2 text-right">
                    {base.estProprietaire && (
                      <span className="flex justify-end gap-1">
                        {d.etat === "erreur" && (
                          <button
                            type="button"
                            aria-label={tf("Réindexer {0}", d.nom)}
                            title={t("Réindexer")}
                            onClick={() => void agir(() => reindexer(base.id, d.id))}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                          >
                            <RotateCw size={14} strokeWidth={1.75} />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={tf("Retirer {0} de la base", d.nom)}
                          title={t("Retirer de la base")}
                          onClick={() => void agir(() => retirerDocument(base.id, d.id))}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                        >
                          <X size={14} strokeWidth={1.75} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {base.masques > 0 && base.documents.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {tf("{0} autre(s) document(s) de cette base ne vous sont pas visibles : ils ne sont ni nommés ni cités pour vous.", base.masques)}
          </p>
        )}
        {base.disparus.length > 0 && (
          <div className="mt-3 text-xs text-muted-foreground">
            <p>{t("Supprimés de la Bibliothèque depuis leur ajout (ils ne servent plus) :")}</p>
            <ul className="mt-1 space-y-1">
              {base.disparus.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="truncate">{d.nom}</span>
                  <button type="button" className="underline hover:text-foreground" onClick={() => void agir(() => retirerDocument(base.id, d.id))}>
                    {t("Retirer")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <EssaiQuestion base={base} />

      {ajout && (
        <ChoixDocuments
          deja={new Set(base.documents.map((d) => d.id))}
          onFermer={() => setAjout(false)}
          onValider={async (ids) => {
            setAjout(false);
            await agir(() => ajouterDocuments(base.id, ids));
          }}
        />
      )}
      {edition && (
        <BaseModal
          base={base}
          mesGroupes={mesGroupes}
          onFermer={() => setEdition(false)}
          onFait={async () => {
            setEdition(false);
            await onChange();
          }}
        />
      )}
    </Modal>
  );
}

/** Poser une question à la base, sans passer par le Chat : on voit ce qui ressort, et pourquoi. */
function EssaiQuestion({ base }: { base: Base }) {
  const [question, setQuestion] = useState("");
  const [resultat, setResultat] = useState<Recherche | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const essayer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      setResultat(await essayerQuestion([base.id], question));
    } catch (err) {
      setErreur(message(err));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{t("Essayer une question")}</h3>
      <div className="mt-2 flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("Par exemple : combien de jours de congés ai-je par an ?")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && question.trim()) void essayer();
          }}
        />
        <Button className="shrink-0" icon={envoi ? Loader2 : Search} disabled={!question.trim() || envoi} onClick={() => void essayer()}>
          {t("Chercher")}
        </Button>
      </div>
      {erreur && (
        <InfoBox tone="warning" className="mt-3">
          {erreur}
        </InfoBox>
      )}
      {resultat && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {resultat.erreur ??
              tf(
                "{0} passage(s) sur {1} parcourus, en {2} ms (dont {3} ms pour le modèle d'embeddings).",
                resultat.passages.length,
                resultat.morceauxParcourus,
                resultat.dureeMs,
                resultat.vectorisationMs,
              )}
            {resultat.aReindexer > 0 && ` ${tf("{0} document(s) indexé(s) par un autre modèle : réindexez la base.", resultat.aReindexer)}`}
          </p>
          {resultat.passages.map((p) => (
            <div key={p.n} className="rounded-xl border border-border bg-muted/40 px-3 py-2">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">[{p.n}] {p.document}</span>
                <span>{tf("similarité {0}", p.similarite.toFixed(2))}</span>
                {p.rangMots !== null && <span>{t("mots trouvés")}</span>}
              </p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{p.texte}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Documents de la Bibliothèque à ajouter : ceux que la personne voit. */
function ChoixDocuments({
  deja,
  onFermer,
  onValider,
}: {
  deja: Set<string>;
  onFermer: () => void;
  onValider: (ids: string[]) => void | Promise<void>;
}) {
  const [documents, setDocuments] = useState<DocumentDisponible[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [coches, setCoches] = useState<Set<string>>(new Set());

  useEffect(() => {
    documentsDisponibles()
      .then(setDocuments)
      .catch((err) => setErreur(message(err)));
  }, []);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (documents ?? []).filter((d) => !deja.has(d.id) && (!q || d.nom.toLowerCase().includes(q) || d.dossier.toLowerCase().includes(q)));
  }, [documents, deja, recherche]);

  return (
    <Modal open onClose={onFermer} size="lg">
      <h2 className="text-lg font-semibold text-foreground">{t("Ajouter des documents")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("Les documents de la Bibliothèque que vous voyez. Un document sans texte lisible (image, PDF scanné) ne peut pas être indexé.")}</p>
      <SearchInput
        containerClassName="mt-4"
        placeholder={t("Rechercher un document")}
        aria-label={t("Rechercher un document")}
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
      />
      {erreur && (
        <InfoBox tone="warning" className="mt-3">
          {erreur}
        </InfoBox>
      )}
      <div className="mt-3 max-h-[340px] overflow-y-auto">
        {!documents && !erreur ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : liste.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("Aucun document à ajouter.")}</p>
        ) : (
          liste.map((d) => {
            const coche = coches.has(d.id);
            return (
              <label
                key={d.id}
                className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-muted", !d.aTexte && "opacity-60")}
              >
                <input
                  type="checkbox"
                  checked={coche}
                  onChange={() => {
                    const suivant = new Set(coches);
                    if (coche) suivant.delete(d.id);
                    else suivant.add(d.id);
                    setCoches(suivant);
                  }}
                />
                <FileText size={15} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{d.nom}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.dossier || t("Racine")}
                    {!d.aTexte && ` · ${t("sans texte lisible")}`}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onFermer}>
          {t("Annuler")}
        </Button>
        <Button disabled={coches.size === 0} onClick={() => void onValider([...coches])}>
          {coches.size > 0 ? tf("Ajouter {0} document(s)", coches.size) : t("Ajouter")}
        </Button>
      </div>
    </Modal>
  );
}
