import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Cpu,
  FileText,
  Info,
  Loader2,
  Plus,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { Input, Textarea } from "@/components/ui/Field";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { branding } from "@/config/branding";
import { lireFichiers } from "@/lib/attachments";
import {
  EXEMPLES_MIN,
  arreterTravail,
  comparerModeles,
  creerProjet,
  desinstallerMoteur,
  enregistrerExemples,
  etatEntrainement,
  genererDepuisDocument,
  importerExemples,
  installerMoteur,
  lancerEntrainement,
  lireProjet,
  publierModele,
  retirerModele,
  supprimerProjet,
  type EtatEntrainement,
  type Exemple,
  type Projet,
  type Travail,
} from "@/lib/entrainement";
import { formaterDate } from "@/lib/formats";
import { locale, t, tf, taille } from "@/lib/i18n";

/**
 * Entraîner un modèle : l'assistant en quatre étapes.
 *
 *  1. **Exemples** : des paires question et réponse, saisies, importées
 *     (CSV, JSONL) ou tirées d'un document par le modèle du Chat, et alors
 *     relues avant d'entrer dans l'entraînement ;
 *  2. **Entraîner** : l'instance choisit le modèle de départ et les réglages
 *     selon la machine, annonce le temps et la place, puis entraîne en fond ;
 *  3. **Comparer** : les mêmes questions au modèle de départ et au modèle
 *     entraîné, côte à côte ;
 *  4. **Installer** : le modèle rejoint LM Studio et le sélecteur de modèles.
 *
 * Ce que l'écran ne promet pas : que le modèle saura tout. Un petit modèle
 * retient des faits et une façon de répondre ; il peut encore se tromper, et
 * la comparaison est là pour que la personne en juge elle-même.
 */

type Etape = "exemples" | "entrainer" | "comparer" | "installer";

/** Un nombre dans la langue de lecture : « 4,5 » en français, « 4.5 » en anglais. */
const nombre = (x: number, decimales = 1) => x.toLocaleString(locale(), { maximumFractionDigits: decimales });

function duree(secondes: number): string {
  if (secondes < 60) return tf("{0} s", Math.max(1, Math.round(secondes)));
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return tf("{0} min", minutes);
  return tf("{0} h {1} min", Math.floor(minutes / 60), minutes % 60);
}

function Barre({ fait, total }: { fait: number; total: number }) {
  const part = total > 0 ? Math.min(100, Math.round((fait / total) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={part} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-primary transition-all" style={{ width: `${part}%` }} />
    </div>
  );
}

/** Suivi d'un travail en cours : message, barre, arrêt. */
function SuiviTravail({ travail, onArreter }: { travail: Travail; onArreter?: () => void }) {
  const octets = travail.type === "installation" && travail.total > 1_000_000;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Loader2 size={14} className="animate-spin" /> {travail.message}
      </p>
      {travail.total > 0 && <Barre fait={travail.fait} total={travail.total} />}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {octets && <span>{tf("{0} sur {1}", taille(travail.fait), taille(travail.total))}</span>}
        {travail.perte !== undefined && <span>{tf("Erreur sur les exemples appris : {0}", nombre(travail.perte, 3))}</span>}
        {travail.perteValidation !== undefined && <span>{tf("Erreur sur les exemples mis de côté : {0}", nombre(travail.perteValidation, 3))}</span>}
        {travail.resteSecondes !== undefined && <span>{tf("Reste environ {0}", duree(travail.resteSecondes))}</span>}
        {travail.memoireGo !== undefined && <span>{tf("Mémoire : {0} Go", nombre(travail.memoireGo))}</span>}
      </div>
      {onArreter && (
        <Button size="sm" variant="secondary" icon={Square} onClick={onArreter}>
          {t("Arrêter")}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Écran principal                                                     */
/* ------------------------------------------------------------------ */

export function EntrainerModele() {
  const [etat, setEtat] = useState<EtatEntrainement | null | undefined>(undefined);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const relire = useCallback(async () => {
    try {
      setEtat(await etatEntrainement());
    } catch {
      setEtat(null);
    }
  }, []);

  useEffect(() => {
    void relire();
  }, [relire]);

  // Tant qu'un travail tourne, l'état est relu chaque seconde et demie.
  useEffect(() => {
    if (!etat?.travail) return;
    const minuterie = setInterval(() => void relire(), 1500);
    return () => clearInterval(minuterie);
  }, [etat?.travail, relire]);

  const agir = async (action: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await action();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
    await relire();
  };

  if (etat === undefined) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> {t("Lecture de l'instance...")}
      </p>
    );
  }
  if (etat === null) {
    return (
      <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
        {t("Instance injoignable : c'est elle qui entraîne les modèles.")}
      </InfoBox>
    );
  }

  if (ouvert) {
    return <EcranProjet id={ouvert} etat={etat} relire={relire} onRetour={() => { setOuvert(null); void relire(); }} />;
  }

  const installation = etat.travail?.type === "installation" ? etat.travail : null;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Cpu size={20} strokeWidth={1.5} className="text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">{t("Cette machine")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{etat.raison}</p>
            {etat.base && (
              <p className="mt-2 text-sm text-muted-foreground">
                {tf("Modèle de départ : {0} ({1}, licence {2}).", etat.base.nom, etat.base.depot, etat.base.licence)}
              </p>
            )}
          </div>
        </div>

        {etat.obstacles.map((o) => (
          <InfoBox key={o} tone="warning" className="mt-3" leading={<Info size={15} strokeWidth={1.75} />}>
            {o}
          </InfoBox>
        ))}

        {etat.possible && (
          <div className="mt-4 border-t border-border pt-4">
            {installation && !installation.autre ? (
              <SuiviTravail travail={installation} />
            ) : etat.pret ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={15} className="text-success" /> {tf("Moteur d'entraînement installé ({0} Go sur le disque).", nombre(etat.placeActuelleGo))}
                </p>
                <Button size="sm" variant="ghost" icon={Trash2} disabled={Boolean(etat.travail)} onClick={() => void agir(desinstallerMoteur)}>
                  {t("Retirer le moteur")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {tf("À installer une fois : environ {0} Go à télécharger, {1} Go sur le disque. Rien d'autre sur la machine n'est modifié.", nombre(etat.telechargementGo), nombre(etat.placeGo))}
                </p>
                {etat.erreurInstallation && (
                  <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
                    {tf("L'installation n'a pas abouti : {0}", etat.erreurInstallation)}
                  </InfoBox>
                )}
                <Button disabled={etat.obstacles.length > 0 || Boolean(etat.travail)} onClick={() => void agir(installerMoteur)}>
                  {t("Installer le moteur d'entraînement")}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {etat.travail?.autre && (
        <InfoBox tone="muted" leading={<Info size={15} strokeWidth={1.75} />}>
          {etat.travail.message}
        </InfoBox>
      )}

      {erreur && (
        <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}

      {etat.possible && (
        <Card>
          <h3 className="font-semibold text-foreground">{t("Vos modèles")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Un modèle par sujet : les produits de votre société, une procédure, une façon de répondre.")}
          </p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nom.trim()) return;
              void agir(async () => {
                const p = await creerProjet(nom.trim());
                setNom("");
                setOuvert(p.id);
              });
            }}
          >
            <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t("Nom du modèle, par exemple le nom de votre société")} maxLength={60} />
            <Button type="submit" icon={Plus} disabled={!nom.trim()}>
              {t("Créer")}
            </Button>
          </form>
          {etat.projets.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("Aucun modèle pour l'instant.")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {etat.projets.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 py-3 text-start hover:bg-muted/40" onClick={() => setOuvert(p.id)}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{p.nom}</span>
                      <span className="block text-xs text-muted-foreground">
                        {tf("{0} exemple(s)", p.exemples)}
                        {p.propositions > 0 ? ` · ${tf("{0} à relire", p.propositions)}` : ""}
                        {p.entraine ? ` · ${t("entraîné")}` : ""}
                        {p.publie ? ` · ${tf("installé : {0}", p.publie)}` : ""}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">{t("Ouvrir")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Un projet                                                           */
/* ------------------------------------------------------------------ */

function EcranProjet({ id, etat, relire, onRetour }: { id: string; etat: EtatEntrainement; relire: () => Promise<void>; onRetour: () => void }) {
  const [projet, setProjet] = useState<Projet | null>(null);
  const [etape, setEtape] = useState<Etape>("exemples");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const travail = etat.travail && !etat.travail.autre ? etat.travail : null;
  const occupeIci = travail?.projet === id;
  const precedent = useRef<Travail | null>(null);

  const recharger = useCallback(async () => {
    try {
      setProjet(await lireProjet(id));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  // À la fin d'un travail sur ce projet, on relit le projet : résultats, propositions, modèle installé.
  useEffect(() => {
    if (precedent.current && !occupeIci) {
      // Seul un bilan s'affiche (erreur, nombre de propositions) ; pas une étape en cours restée en l'état (« ... »).
      const m = precedent.current.message;
      if (m && precedent.current.type !== "entrainement" && !m.endsWith("...")) setInfo(m);
      void recharger();
    }
    precedent.current = occupeIci ? travail : null;
  }, [occupeIci, travail, recharger]);

  const agir = async (action: () => Promise<unknown>) => {
    setErreur(null);
    setInfo(null);
    try {
      await action();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
    await relire();
    await recharger();
  };

  if (!projet) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> {erreur ?? t("Lecture de l'instance...")}
      </p>
    );
  }

  const entraine = projet.entrainement?.etat === "fini";
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onRetour}>
          {t("Tous les modèles")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          disabled={occupeIci}
          onClick={() => {
            if (!window.confirm(tf("Supprimer « {0} », ses exemples et le modèle installé ?", projet.nom))) return;
            void agir(async () => {
              await supprimerProjet(id);
              onRetour();
            });
          }}
        >
          {t("Supprimer")}
        </Button>
      </div>
      <h3 className="text-lg font-semibold text-foreground">{projet.nom}</h3>

      <SegmentedTabs
        value={etape}
        onChange={(v) => setEtape(v as Etape)}
        disabledIds={[...(entraine ? [] : ["comparer", "installer"])]}
        disabledTitle={t("Entraînez d'abord le modèle.")}
        options={[
          { id: "exemples", label: t("1. Exemples") },
          { id: "entrainer", label: t("2. Entraîner") },
          { id: "comparer", label: t("3. Comparer") },
          { id: "installer", label: t("4. Installer") },
        ]}
      />

      {erreur && (
        <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}
      {info && (
        <InfoBox tone="info" leading={<Info size={15} strokeWidth={1.75} />}>
          {info}
        </InfoBox>
      )}
      {occupeIci && travail && (
        <Card>
          <SuiviTravail travail={travail} onArreter={travail.type === "publication" ? undefined : () => void agir(arreterTravail)} />
        </Card>
      )}

      {etape === "exemples" && <EtapeExemples projet={projet} occupe={Boolean(etat.travail)} agir={agir} setProjet={setProjet} />}
      {etape === "entrainer" && <EtapeEntrainer projet={projet} etat={etat} occupe={Boolean(etat.travail)} agir={agir} />}
      {etape === "comparer" && <EtapeComparer projet={projet} occupe={Boolean(etat.travail)} agir={agir} />}
      {etape === "installer" && <EtapeInstaller projet={projet} occupe={Boolean(etat.travail)} agir={agir} />}
    </div>
  );
}

type Agir = (action: () => Promise<unknown>) => Promise<void>;

/* ----- 1. Exemples ----- */

function ListeExemples({ liste, onChange }: { liste: Exemple[]; onChange: (l: Exemple[]) => void }) {
  return (
    <ul className="space-y-3">
      {liste.map((e, i) => (
        <li key={i} className="grid gap-2 rounded-xl border border-border p-3 cq-lg:grid-cols-[1fr_1fr_auto]">
          <Textarea rows={2} value={e.question} aria-label={t("Question")} placeholder={t("Question")} onChange={(ev) => onChange(liste.map((x, j) => (j === i ? { ...x, question: ev.target.value } : x)))} />
          <Textarea rows={2} value={e.reponse} aria-label={t("Réponse")} placeholder={t("Réponse attendue")} onChange={(ev) => onChange(liste.map((x, j) => (j === i ? { ...x, reponse: ev.target.value } : x)))} />
          <button type="button" className="self-start rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label={t("Retirer cet exemple")} onClick={() => onChange(liste.filter((_, j) => j !== i))}>
            <X size={15} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function EtapeExemples({ projet, occupe, agir, setProjet }: { projet: Projet; occupe: boolean; agir: Agir; setProjet: (p: Projet) => void }) {
  const [exemples, setExemples] = useState<Exemple[]>(projet.exemples);
  const [propositions, setPropositions] = useState<Exemple[]>(projet.propositions);
  const [modifie, setModifie] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fichierExemples = useRef<HTMLInputElement>(null);
  const fichierDocument = useRef<HTMLInputElement>(null);

  // Nouvelles propositions arrivées du document, ou projet relu : on reprend ce qu'a l'instance, sauf modification en cours.
  useEffect(() => {
    if (modifie) return;
    setExemples(projet.exemples);
    setPropositions(projet.propositions);
  }, [projet, modifie]);

  const enregistrer = (ex: Exemple[], pr: Exemple[]) =>
    agir(async () => {
      setProjet(await enregistrerExemples(projet.id, ex, pr));
      setModifie(false);
    });

  const importer = async (fichiers: FileList | null) => {
    const f = fichiers?.[0];
    if (!f) return;
    await agir(async () => {
      const r = await importerExemples(projet.id, await f.text(), f.name);
      setModifie(false);
      setMessage(r.ignorees > 0 ? tf("{0} exemple(s) ajouté(s), {1} ligne(s) ignorée(s) (vide, en double ou illisible).", r.ajoutes, r.ignorees) : tf("{0} exemple(s) ajouté(s).", r.ajoutes));
    });
  };

  const depuisDocument = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return;
    const { pieces, erreurs } = await lireFichiers([...fichiers]);
    const textes = pieces.filter((p): p is Extract<typeof p, { type: "texte" }> => p.type === "texte");
    if (erreurs.length) setMessage(erreurs.map((e) => `${e.nom} : ${e.raison}`).join(" · "));
    if (!textes.length) return;
    await agir(() => genererDepuisDocument(projet.id, textes.map((p) => p.contenu).join("\n\n"), textes.map((p) => p.nom).join(", ")));
  };

  return (
    <div className="space-y-5">
      <Card>
        <h4 className="font-semibold text-foreground">{t("Ce que le modèle doit apprendre")}</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {tf("Des questions telles qu'on les pose, et la réponse exacte que le modèle doit donner. {0} au moins ; une cinquantaine donne de meilleurs résultats. Formulez chaque fait important de deux ou trois façons.", EXEMPLES_MIN)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={Plus} disabled={occupe} onClick={() => { setExemples([...exemples, { question: "", reponse: "" }]); setModifie(true); }}>
            {t("Ajouter un exemple")}
          </Button>
          <Button size="sm" variant="secondary" icon={Upload} disabled={occupe} onClick={() => fichierExemples.current?.click()}>
            {t("Importer un CSV ou un JSONL")}
          </Button>
          <Button size="sm" variant="secondary" icon={FileText} disabled={occupe} onClick={() => fichierDocument.current?.click()}>
            {t("Tirer des exemples d'un document")}
          </Button>
          <input ref={fichierExemples} type="file" accept=".csv,.tsv,.jsonl,.json,.txt" className="hidden" onChange={(e) => { void importer(e.target.files); e.target.value = ""; }} />
          <input ref={fichierDocument} type="file" multiple accept=".pdf,.docx,.odt,.txt,.md,.pptx,.xlsx" className="hidden" onChange={(e) => { void depuisDocument(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("CSV : deux colonnes, question puis réponse (séparées par un point-virgule, une virgule ou une tabulation). Un document est lu par le modèle du Chat, sur cette machine : ses propositions sont à relire avant l'entraînement.")}
        </p>
        {message && <p className="mt-2 text-sm text-foreground">{message}</p>}
      </Card>

      {propositions.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-foreground">{tf("{0} proposition(s) à relire", propositions.length)}</h4>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={occupe} onClick={() => void enregistrer(exemples, [])}>
                {t("Tout écarter")}
              </Button>
              <Button size="sm" icon={Check} disabled={occupe} onClick={() => void enregistrer([...exemples, ...propositions], [])}>
                {t("Tout garder")}
              </Button>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("Tirées du document par le modèle du Chat : corrigez ce qui est faux, retirez ce qui ne sert pas. Rien n'est appris sans votre accord.")}</p>
          <div className="mt-3">
            <ListeExemples liste={propositions} onChange={(l) => { setPropositions(l); setModifie(true); }} />
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-foreground">{tf("{0} exemple(s)", exemples.length)}</h4>
          <Button size="sm" disabled={!modifie || occupe} onClick={() => void enregistrer(exemples.filter((e) => e.question.trim() && e.reponse.trim()), propositions)}>
            {t("Enregistrer")}
          </Button>
        </div>
        {exemples.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("Aucun exemple pour l'instant.")}</p>
        ) : (
          <div className="mt-3">
            <ListeExemples liste={exemples} onChange={(l) => { setExemples(l); setModifie(true); }} />
          </div>
        )}
      </Card>
    </div>
  );
}

/* ----- 2. Entraîner ----- */

function EtapeEntrainer({ projet, etat, occupe, agir }: { projet: Projet; etat: EtatEntrainement; occupe: boolean; agir: Agir }) {
  const e = projet.entrainement;
  const assez = projet.exemples.length >= EXEMPLES_MIN;
  return (
    <Card className="space-y-4">
      {!etat.pret && (
        <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
          {t("Installez d'abord le moteur d'entraînement (page précédente).")}
        </InfoBox>
      )}
      {!assez && (
        <p className="text-sm text-muted-foreground">{tf("Il faut {0} exemples au moins ({1} pour l'instant).", EXEMPLES_MIN, projet.exemples.length)}</p>
      )}
      {assez && projet.estimation && (
        <div className="text-sm text-muted-foreground">
          <p>{tf("Modèle de départ : {0}. Durée estimée : {1}. Place du modèle une fois installé : {2} Go.", etat.base?.nom ?? "", duree(projet.estimation.secondes), nombre(projet.estimation.disqueGo))}</p>
          <p className="mt-1">
            {projet.estimation.misDeCote > 0
              ? tf("{0} exemple(s) mis de côté, jamais montrés pendant l'entraînement : ils servent à vérifier ce que le modèle a vraiment retenu.", projet.estimation.misDeCote)
              : t("Avec moins de 20 exemples, aucun n'est mis de côté pour la vérification : vous poserez vos propres questions à l'étape Comparer.")}
          </p>
          <p className="mt-1">{t("Pendant l'entraînement, la puce graphique est prise : les modèles de LM Studio au repos sont déchargés. Un Chat lancé pendant ce temps recharge son modèle, et l'entraînement peut alors s'arrêter faute de mémoire : il suffit de le relancer.")}</p>
        </div>
      )}
      {e && (
        <InfoBox tone={e.etat === "fini" ? "info" : "warning"} leading={<Info size={15} strokeWidth={1.75} />}>
          {e.etat === "fini"
            ? tf("Entraîné le {0} en {1} : {2} exemples appris, {3} pas.", formaterDate(e.date), duree(e.secondes), e.exemplesAppris, e.pas)
            : e.etat === "arrete"
              ? t("Entraînement arrêté avant la fin : rien n'a été gardé.")
              : tf("L'entraînement a échoué : {0}", e.message ?? "")}
          {e.etat === "fini" && e.perteValidation !== undefined && (
            <span className="block">{tf("Erreur finale sur les exemples mis de côté : {0} (plus c'est bas, mieux c'est ; au départ, elle est souvent entre 3 et 5).", nombre(e.perteValidation, 3))}</span>
          )}
          {e.etat === "fini" && e.tentative && (
            <span className="block">
              {e.tentative.etat === "arrete"
                ? t("La dernière tentative a été arrêtée avant la fin : le modèle entraîné précédemment reste en place.")
                : tf("La dernière tentative a échoué ({0}) : le modèle entraîné précédemment reste en place.", e.tentative.message)}
            </span>
          )}
        </InfoBox>
      )}
      <Button disabled={!etat.pret || !assez || occupe} onClick={() => void agir(() => lancerEntrainement(projet.id))}>
        {e?.etat === "fini" ? t("Entraîner à nouveau") : t("Lancer l'entraînement")}
      </Button>
    </Card>
  );
}

/* ----- 3. Comparer ----- */

function EtapeComparer({ projet, occupe, agir }: { projet: Projet; occupe: boolean; agir: Agir }) {
  const [questions, setQuestions] = useState("");
  const c = projet.comparaison;
  return (
    <div className="space-y-5">
      <Card>
        <p className="text-sm text-muted-foreground">
          {t("Les mêmes questions au modèle de départ et au modèle entraîné. Ajoutez les vôtres, une par ligne (cinq au plus) : c'est la meilleure façon de juger.")}
        </p>
        <Textarea className="mt-3" rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder={t("Une question par ligne")} />
        <Button className="mt-3" disabled={occupe} onClick={() => void agir(() => comparerModeles(projet.id, questions.split("\n").map((q) => q.trim()).filter(Boolean)))}>
          {t("Comparer")}
        </Button>
      </Card>
      {c && (
        <Card className="space-y-4">
          {c.lignes.map((l, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <p className="font-medium text-foreground">{l.question}</p>
              {l.attendu && <p className="mt-1 text-xs text-muted-foreground">{tf("Attendu : {0}", l.attendu)}</p>}
              <div className="mt-2 grid gap-3 cq-lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Avant")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{l.base}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Après l'entraînement")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{l.entraine}</p>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ----- 4. Installer ----- */

function EtapeInstaller({ projet, occupe, agir }: { projet: Projet; occupe: boolean; agir: Agir }) {
  const p = projet.publie;
  return (
    <Card className="space-y-4">
      <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
        {tf("Une fois installé, le modèle apparaît dans le sélecteur de modèles de {0} pour toute l'équipe de cette instance, et ce qu'il a appris peut ressortir dans leurs Chats. N'y mettez rien que vos collègues ne doivent pas lire.", branding.name)}
      </InfoBox>
      {p ? (
        <>
          <p className="text-sm text-foreground">
            {tf("Installé le {0} sous le nom « {1} » ({2}).", formaterDate(p.date), p.cle ?? p.nom, taille(p.octets))}
          </p>
          {!p.cle && <p className="text-sm text-muted-foreground">{t("LM Studio ne l'a pas encore listé : il peut falloir rouvrir LM Studio.")}</p>}
          <Button variant="secondary" icon={Trash2} disabled={occupe} onClick={() => void agir(() => retirerModele(projet.id))}>
            {t("Retirer de LM Studio")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("Le modèle entraîné est fondu, compressé en 8 bits, puis rangé dans LM Studio. Comptez de quelques secondes à une minute.")}</p>
          <Button disabled={occupe} onClick={() => void agir(() => publierModele(projet.id))}>
            {t("Installer dans LM Studio")}
          </Button>
        </>
      )}
    </Card>
  );
}
