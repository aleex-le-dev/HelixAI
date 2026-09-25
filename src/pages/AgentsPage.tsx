import { useMemo, useRef, useState } from "react";
import { BookOpenText, Bot, Loader2, Plus, RefreshCw, Sparkle, Paperclip, Sparkles, Trash2, TriangleAlert, Wrench, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { branding } from "@/config/branding";
import { useAgents } from "@/hooks/useAgents";
import { useMiseEnService, type EtatMiseEnService } from "@/hooks/useMiseEnService";
import { currentUser } from "@/lib/store/identity";
import type { Agent, AgentVisibility } from "@/lib/store/agents";
import { MiseAJourOpenClaw, PanneauEmploye, Statut, useEmployes } from "@/components/agents/Employes";
import { ACCEPT_DOCUMENTS, retenirFichiers, supprimerEmploye, type Employe, type EtatEmployes } from "@/lib/employes";
import { optimiserInstructions } from "@/lib/gateway";
import { ChoixDepuisEspace } from "@/components/agents/ChoixDepuisEspace";
import { ChoixBases } from "@/components/bibliotheque/ChoixBases";
import { LectureBases } from "@/components/agents/LectureBases";
import { features } from "@/config/branding";
import { t, tf } from "@/lib/i18n";

/**
 * Page Agents + modale de création (captures 12 à 14).
 *
 * Un seul geste : créer un agent. Il est mis en service tout seul sur
 * l'instance (OpenClaw s'installe s'il manque) et devient un membre de
 * l'équipe toujours actif : on lui parle depuis sa fiche, on lui confie des
 * missions, on le joint sur une messagerie. Dans le Chat, on peut aussi le
 * choisir comme avant.
 */
export function AgentsPage() {
  const { agents, create, update, remove } = useAgents();
  const [tab, setTab] = useState("tous");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const { etat, recharger } = useEmployes();

  const me = currentUser();
  const { etats, reessayer } = useMiseEnService(agents, me.id, etat, recharger);

  const employeDe = (agentId: string) => etat?.employes.find((e) => e.agentId === agentId);
  // Employés déployés avant que la création d'un agent ne s'en charge : ils restent visibles.
  const sansAgent = (etat?.employes ?? []).filter((e) => !e.agentId || !agents.some((a) => a.id === e.agentId));

  const counts = useMemo(
    () => ({
      tous: agents.length + sansAgent.length,
      organisation: agents.filter((a) => a.visibility === "organisation").length + sansAgent.length,
      personnels: agents.filter((a) => a.visibility === "personnel").length,
    }),
    [agents, sansAgent.length],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const byTab = agents.filter((a) =>
      tab === "tous" ? true : tab === "organisation" ? a.visibility === "organisation" : a.visibility === "personnel",
    );
    return q
      ? byTab.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      : byTab;
  }, [agents, tab, q]);
  const autres = tab === "personnels" ? [] : sansAgent.filter((e) => !q || e.nom.toLowerCase().includes(q));

  const tabs = [
    { id: "tous", label: tf("Tous ({0})", counts.tous) },
    { id: "organisation", label: tf("Organisation ({0})", counts.organisation) },
    { id: "personnels", label: tf("Personnels ({0})", counts.personnels) },
  ];
  const panneau = etat?.employes.find((e) => e.id === ouvert) ?? null;
  const installation = etat?.moteur.installation;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 py-7">
      <PageHeader
        showBack
        icon={Bot}
        title={t("Agents IA")}
        subtitle={t("Vos agents travaillent pour l'équipe, même quand personne ne leur parle")}
        actions={
          <>
            <SearchInput
              placeholder={t("Rechercher des agents...")}
              aria-label={t("Rechercher des agents")}
              containerClassName="w-[260px]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button icon={Plus} onClick={() => setModalOpen(true)}>
              {t("Créer un agent")}
            </Button>
          </>
        }
      />

      <div className="mt-6">
        <SegmentedTabs options={tabs} value={tab} onChange={setTab} />
      </div>

      {etat?.moteur.installe && <MiseAJourOpenClaw etat={etat} recharger={recharger} />}

      {!etat?.moteur.installe && (installation?.etape === "node" || installation?.etape === "openclaw") && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
          {t("Première mise en service :")}{" "}{branding.name}{" "}{t("installe ce qu'il faut à vos agents. C'est une fois pour toutes, et quelques minutes.")}
        </p>
      )}

      {filtered.length === 0 && autres.length === 0 ? (
        <EmptyState
          icon={Bot}
          title={agents.length === 0 ? t("Aucun agent IA") : t("Aucun résultat")}
          description={
            agents.length === 0
              ? t("Créez votre premier agent : il sera prêt à travailler dès sa création.")
              : t("Aucun agent ne correspond à votre recherche")
          }
        />
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              employe={employeDe(agent.id)}
              etat={etat}
              miseEnService={etats[agent.id]}
              canDelete={agent.ownerId === me.id}
              onOuvrir={(id) => setOuvert(id)}
              onReessayer={() => reessayer(agent.id)}
              onConnaissances={(ids) => update(agent.id, { connaissances: ids })}
              onDelete={async () => {
                const e = employeDe(agent.id);
                if (e && e.estProprietaire) await supprimerEmploye(e.id).catch(() => undefined);
                remove(agent.id);
                await recharger();
              }}
            />
          ))}
          {autres.map((e) => (
            <CarteEmploye key={e.id} employe={e} etat={etat} onOuvrir={() => setOuvert(e.id)} />
          ))}
        </ul>
      )}

      <AgentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={(data, fichiers) => {
          // La mise en service suit d'elle-même (useMiseEnService), documents compris.
          const agent = create(data);
          retenirFichiers(agent.id, fichiers);
          setModalOpen(false);
        }}
      />

      {panneau && etat && (
        <PanneauEmploye
          employe={panneau}
          etat={etat}
          onFermer={() => setOuvert(null)}
          onChange={recharger}
          onRetire={() => {
            if (panneau.agentId) remove(panneau.agentId);
          }}
        />
      )}
    </div>
  );
}

/** Ce que la carte dit de l'agent en service : l'état, ou l'étape de sa mise en service. */
function LigneService({
  employe,
  etat,
  miseEnService,
  onReessayer,
}: {
  employe?: Employe;
  etat: EtatEmployes | null;
  miseEnService?: EtatMiseEnService;
  onReessayer: () => void;
}) {
  if (miseEnService?.etape === "erreur") {
    return (
      <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <TriangleAlert size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" />
        <span className="min-w-0">
          {t("Pas encore en service :")}{" "}{miseEnService.message}{" "}
          <button type="button" onClick={onReessayer} className="inline-flex items-center gap-1 underline underline-offset-2">
            <RefreshCw size={11} strokeWidth={2} />{" "}{t("Réessayer")}
          </button>
        </span>
      </span>
    );
  }
  if (miseEnService) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 size={13} strokeWidth={1.75} className="animate-spin" /> {miseEnService.message}
      </span>
    );
  }
  if (employe && etat) return <Statut employe={employe} etat={etat} />;
  return null;
}

function AgentCard({
  agent,
  employe,
  etat,
  miseEnService,
  canDelete,
  onOuvrir,
  onReessayer,
  onConnaissances,
  onDelete,
}: {
  agent: Agent;
  employe?: Employe;
  etat: EtatEmployes | null;
  miseEnService?: EtatMiseEnService;
  canDelete: boolean;
  onOuvrir: (employeId: string) => void;
  onReessayer: () => void;
  onConnaissances: (ids: string[]) => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [bases, setBases] = useState<string[] | null>(null);
  const nombreBases = agent.connaissances?.length ?? 0;
  return (
    <li className="group relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-sm">
      <button
        type="button"
        disabled={!employe}
        onClick={() => employe && onOuvrir(employe.id)}
        className="flex flex-1 flex-col gap-2 text-left disabled:cursor-default"
        aria-label={employe ? tf("Ouvrir {0}", agent.name) : undefined}
      >
        <div className="flex w-full items-start gap-3 pr-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Sparkle size={18} className="fill-info text-info" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{agent.name}</p>
            <p className="text-xs text-muted-foreground">
              {agent.visibility === "organisation" ? t("Organisation") : t("Personnel")}
            </p>
          </div>
        </div>
        {agent.description && <p className="line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <LigneService employe={employe} etat={etat} miseEnService={miseEnService} onReessayer={onReessayer} />
          {agent.toolsEnabled && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
              <Wrench size={11} strokeWidth={2} />{" "}{t("Outils")}
            </span>
          )}
          {employe && (employe.canaux?.length ?? 0) > 0 && (
            <span className="text-[11px] text-muted-foreground">{t("Aussi sur")}{" "}{employe.canaux?.map((c) => c.nom).join(", ")}</span>
          )}
        </div>
      </button>
      {/*
        * Bases de connaissances de l'agent : son propriétaire les change ici.
        * Dans le Chat, chacun y lit ce qu'il a le droit de voir ; l'employé
        * toujours actif (OpenClaw) les consulte par un outil, avec ce qui est
        * ouvert à toute l'équipe, et aussi aux groupes de son propriétaire
        * quand rien de ce qui sort de lui ne va à quelqu'un d'autre
        * (useMiseEnService les lui recopie ; LectureBases dit ce qu'il lira).
        */}
      {features.bibliotheque && (canDelete || nombreBases > 0) && (
        <button
          type="button"
          disabled={!canDelete}
          onClick={() => setBases(agent.connaissances ?? [])}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info disabled:cursor-default"
        >
          <BookOpenText size={11} strokeWidth={2} />
          {nombreBases > 0 ? tf("{0} base(s) de connaissances", nombreBases) : t("Ajouter des connaissances")}
        </button>
      )}
      {bases && (
        <Modal open onClose={() => setBases(null)} size="md">
          <h2 className="pr-8 text-lg font-semibold text-foreground">{tf("Connaissances de {0}", agent.name)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Dans le Chat, avec cet agent, les passages utiles de ces bases sont donnés au modèle avant chaque réponse, et cités sous la réponse. Chaque personne n'y lit que ce qu'elle a le droit de voir.")}
          </p>
          <div className="mt-4">
            <ChoixBases valeur={bases} onChange={setBases} />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">{t("Ce qu'il lit hors du Chat")}</p>
          <div className="mt-1">
            <LectureBases employe={employe} bases={bases} />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBases(null)}>
              {t("Annuler")}
            </Button>
            <Button
              onClick={() => {
                onConnaissances(bases);
                setBases(null);
              }}
            >
              {t("Enregistrer")}
            </Button>
          </div>
        </Modal>
      )}
      {canDelete &&
        (confirmer ? (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-card px-1">
            <Button variant="destructive" size="sm" onClick={() => void onDelete()}>
              {t("Supprimer")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmer(false)}>
              {t("Annuler")}
            </Button>
          </span>
        ) : (
          <button
            type="button"
            aria-label={tf("Supprimer {0}", agent.name)}
            onClick={() => setConfirmer(true)}
            className="absolute right-3 top-3 hidden rounded p-1 text-muted-foreground transition-colors hover:text-destructive group-hover:block"
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
        ))}
    </li>
  );
}

/** Employé déployé sans agent (avant que la création d'un agent ne s'en charge). */
function CarteEmploye({ employe, etat, onOuvrir }: { employe: Employe; etat: EtatEmployes | null; onOuvrir: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOuvrir}
        className="flex h-full w-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm"
      >
        <div className="flex w-full items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Sparkle size={18} className="fill-info text-info" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{employe.nom}</p>
            <p className="text-xs text-muted-foreground">{t("Organisation · par")}{" "}{employe.proprietaire}</p>
          </div>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{employe.poste}</p>
        <div className="mt-auto">{etat && <Statut employe={employe} etat={etat} />}</div>
      </button>
    </li>
  );
}

interface NewAgent {
  name: string;
  description: string;
  instructions: string;
  visibility: AgentVisibility;
  hidePrompt: boolean;
  toolsEnabled: boolean;
  connaissances: string[];
}

function AgentModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: NewAgent, fichiers: File[]) => void;
}) {
  const [visibility, setVisibility] = useState<AgentVisibility>("personnel");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [optimisation, setOptimisation] = useState(false);
  const [depuisEspace, setDepuisEspace] = useState(false);
  const [avantOptimisation, setAvantOptimisation] = useState<string | null>(null);
  const [erreurOptimisation, setErreurOptimisation] = useState<string | null>(null);
  const choixFichiers = useRef<HTMLInputElement>(null);
  const [hidePrompt, setHidePrompt] = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [connaissances, setConnaissances] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  const reset = () => {
    setName("");
    setDescription("");
    setInstructions("");
    setVisibility("personnel");
    setHidePrompt(false);
    setToolsEnabled(true);
    setConnaissances([]);
    setFichiers([]);
    setAvantOptimisation(null);
    setErreurOptimisation(null);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="xl"
    >
      <h2 className="text-lg font-semibold text-foreground">{t("Créer un nouvel agent")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Définissez le comportement et l'expertise de votre nouvel agent. Il est prêt à travailler dès sa création : on lui parle depuis sa fiche ou le Chat, et il peut prendre des missions régulières ou répondre sur une messagerie.")}
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Colonne gauche : avatar + fichiers */}
        <div className="flex flex-col items-center gap-3 border-b border-border pb-5 md:border-b-0 md:border-r md:pb-0 md:pr-6">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
            <Sparkle size={34} className="fill-info text-info" />
          </span>
          <span className="text-sm font-medium text-foreground">
            {name.trim() || t("Agent sans nom")}
          </span>

          <div className="mt-2 w-full space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Paperclip size={12} strokeWidth={2} />{" "}{t("Fichiers de l'agent")}
            </p>
            {fichiers.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("Aucun fichier attaché")}</p>
            ) : (
              <ul className="space-y-1">
                {fichiers.map((f) => (
                  <li key={f.name} className="flex items-center gap-1.5 text-xs text-foreground">
                    <span className="min-w-0 flex-1 truncate" title={f.name}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      aria-label={tf("Retirer {0}", f.name)}
                      onClick={() => setFichiers((l) => l.filter((x) => x !== f))}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={choixFichiers}
              type="file"
              multiple
              accept={ACCEPT_DOCUMENTS}
              className="hidden"
              onChange={(e) => {
                const nouveaux = Array.from(e.target.files ?? []);
                setFichiers((l) => [...l.filter((x) => !nouveaux.some((n) => n.name === x.name)), ...nouveaux].slice(0, 40));
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="sm" icon={Plus} block onClick={() => choixFichiers.current?.click()}>
              {t("Ajouter un fichier")}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {t("PDF, Word, Excel, PowerPoint ou texte : il les consulte pour répondre.")}
            </p>
            <Button variant="secondary" size="sm" icon={Plus} block onClick={() => setDepuisEspace(true)}>
              {t("Depuis")}{" "}{branding.name}
            </Button>
            {depuisEspace && (
              <ChoixDepuisEspace
                onFermer={() => setDepuisEspace(false)}
                onChoisis={(nouveaux) =>
                  setFichiers((l) => [...l.filter((x) => !nouveaux.some((n) => n.name === x.name)), ...nouveaux].slice(0, 40))
                }
              />
            )}
          </div>
        </div>

        {/* Colonne droite : formulaire */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">{t("Visibilité")}</span>
            <div className="inline-flex gap-1.5">
              {(["personnel", "organisation"] as AgentVisibility[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                    visibility === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "organisation" ? t("Organisation") : t("Personnel")}
                </button>
              ))}
            </div>
          </div>

          <Field label={t("Nom de l'agent")}>
            <Input
              placeholder={t("Ex: Agent juridique")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>

          <Field label={t("Description (optionnel)")}>
            <Input
              placeholder={t("Brève description de l'agent")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                {t("Instructions (Prompt système)")}
              </label>
              {avantOptimisation !== null && !optimisation ? (
                <button
                  type="button"
                  onClick={() => {
                    setInstructions(avantOptimisation);
                    setAvantOptimisation(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  {t("Revenir à ma version")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={optimisation || (!name.trim() && !description.trim() && !instructions.trim())}
                  title={t("Le modèle de la machine réécrit vos instructions, sans en changer le sens")}
                  onClick={() => {
                    setOptimisation(true);
                    setErreurOptimisation(null);
                    void optimiserInstructions({ nom: name, description, instructions })
                      .then((propose) => {
                        if (!propose) throw new Error(t("Le modèle n'a rien proposé."));
                        setAvantOptimisation(instructions);
                        setInstructions(propose.slice(0, 50000));
                      })
                      .catch((err) => setErreurOptimisation(err instanceof Error ? err.message : String(err)))
                      .finally(() => setOptimisation(false));
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {optimisation ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} strokeWidth={1.75} />}
                  {optimisation ? t("Réécriture…") : t("Optimiser les instructions")}
                </button>
              )}
            </div>
            <Textarea
              rows={6}
              placeholder={t("Vous êtes un agent spécialisé en...")}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={50000}
            />
            <p className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span className="text-destructive">{erreurOptimisation}</span>
              <span>{instructions.length}/50000</span>
            </p>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">
              {t("Autoriser les outils (fichiers, connecteurs)")}
            </span>
            <Switch
              checked={toolsEnabled}
              onChange={setToolsEnabled}
              label={t("Autoriser les outils")}
            />
          </div>

          {features.bibliotheque && (
            <div className="space-y-1.5">
              <span className="text-sm text-foreground">{t("Bases de connaissances")}</span>
              <ChoixBases
                valeur={connaissances}
                onChange={setConnaissances}
                aide={t("L'agent y cherche avant de répondre et cite ses sources. Hors du Chat (sa fiche, ses missions, ses messageries), seulement dans ce qui est ouvert à toute l'équipe ; aussi dans ce qui est partagé à vos groupes pour un agent personnel sans outils ni messagerie. Sa carte le détaille une fois en service.")}
              />
            </div>
          )}

          {visibility === "organisation" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">
                {t("Masquer le prompt aux non-administrateurs")}
              </span>
              <Switch
                checked={hidePrompt}
                onChange={setHidePrompt}
                label={t("Masquer le prompt aux non-administrateurs")}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          {t("Annuler")}
        </Button>
        <Button
          disabled={!name.trim()}
          onClick={() => {
            onCreate({ name, description, instructions, visibility, hidePrompt, toolsEnabled, connaissances }, fichiers);
            reset();
          }}
        >
          {t("Créer l'agent")}
        </Button>
      </div>
    </Modal>
  );
}

export default AgentsPage;
