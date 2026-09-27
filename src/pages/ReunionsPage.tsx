import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Calendar,
  CalendarClock,
  Check,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FileAudio,
  Globe,
  ListChecks,
  Loader2,
  Lock,
  Mic,
  Pause,
  Pencil,
  Play,
  RotateCw,
  Settings,
  Square,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { branding } from "@/config/branding";
import { cn } from "@/lib/cn";
import { formaterDateHeure } from "@/lib/formats";
import { useGroupes, type Groupe } from "@/lib/groupes";
import { installer as installerTranscription, messageErreurMicro, type ProgresDictee } from "@/lib/dictee";
import { createTask } from "@/lib/store/tasks";
import { useUtilisateurCourant } from "@/lib/store/identity";
import {
  ACCEPT_AUDIO,
  EnregistreurReunion,
  IMPORT_MAX,
  enregistrementCourant,
  retenirEnregistrement,
  LEGENDE_STATUT,
  chargerReunions,
  creerReunion,
  dureePlaisante,
  envoyerSon,
  horodatage,
  lireAudio,
  lireReunion,
  modifierReunion,
  nomDuBot,
  passerelle,
  pontBot,
  relancerReunion,
  resumerReunion,
  supprimerReunion,
  terminerReunion,
  type BotEnCours,
  type EtatReunions,
  type Reunion,
  type Segment,
  type Visibilite,
} from "@/lib/reunions";
import { t, tf } from "@/lib/i18n";
import { nomDuPays } from "@/lib/fournisseurs";
import { copierTexte } from "@/lib/pressePapiers";

/**
 * Réunions : enregistrer au micro, importer un fichier, ou envoyer le bot à
 * une réunion Google Meet. La transcription (Whisper) et le compte rendu se
 * font sur la machine de l'instance ; rien ne part chez un prestataire.
 */

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const EN_COURS: Reunion["statut"][] = ["file", "transcription", "resume", "enregistrement", "bot-connexion", "bot-attente", "bot-en-cours"];

export function ReunionsPage() {
  const navigate = useNavigate();
  const [etat, setEtat] = useState<EtatReunions | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [modalBot, setModalBot] = useState(false);
  const [enregistrement, setEnregistrementLocal] = useState<EnregistreurReunion | null>(() => enregistrementCourant());
  const setEnregistrement = (e: EnregistreurReunion | null) => {
    retenirEnregistrement(e);
    setEnregistrementLocal(e);
  };
  const [bots, setBots] = useState<BotEnCours[]>([]);
  const [import_, setImport] = useState<{ nom: string; pourcent: number } | null>(null);
  const choixFichier = useRef<HTMLInputElement>(null);
  const pont = pontBot();

  const charger = useCallback(async () => {
    try {
      setEtat(await chargerReunions());
      setErreur(null);
    } catch (err) {
      setErreur(message(err));
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Tant que quelque chose avance (transcription, bot), la liste se relit.
  const actif = (etat?.reunions ?? []).some((r) => EN_COURS.includes(r.statut)) || bots.length > 0;
  useEffect(() => {
    if (!actif) return;
    const minuterie = setInterval(() => void charger(), 4000);
    return () => clearInterval(minuterie);
  }, [actif, charger]);

  useEffect(() => {
    if (!pont) return;
    void pont.liste().then(setBots).catch(() => undefined);
    return pont.surChangement((b) => {
      setBots(b);
      void charger();
    });
  }, [pont, charger]);

  // Un enregistrement en cours ne se perd pas en fermant la fenêtre par mégarde.
  useEffect(() => {
    if (!enregistrement) return;
    const avant = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avant);
    return () => window.removeEventListener("beforeunload", avant);
  }, [enregistrement]);

  const demarrerMicro = async () => {
    setErreur(null);
    let r: Reunion | null = null;
    try {
      r = await creerReunion({ source: "micro" });
      const e = new EnregistreurReunion(r.id);
      await e.demarrer();
      setEnregistrement(e);
      await charger();
    } catch (err) {
      if (r) await terminerReunion(r.id).catch(() => undefined);
      setErreur(err instanceof DOMException ? messageErreurMicro(err) : message(err));
    }
  };

  const importer = async (f: File) => {
    setErreur(null);
    if (f.size > IMPORT_MAX) {
      setErreur(tf("« {0} » dépasse 2 Go.", f.name));
      return;
    }
    try {
      setImport({ nom: f.name, pourcent: 0 });
      const titre = f.name.replace(/\.[^.]+$/, "");
      const r = await creerReunion({ source: "import", titre });
      // Par tranches de 8 Mo : l'avancement se voit, et une coupure ne repart pas de zéro.
      const tranche = 8 * 1024 * 1024;
      for (let debut = 0; debut < f.size; debut += tranche) {
        await envoyerSon(r.id, f.slice(debut, debut + tranche));
        setImport({ nom: f.name, pourcent: Math.round((Math.min(f.size, debut + tranche) / f.size) * 100) });
      }
      await terminerReunion(r.id);
      await charger();
    } catch (err) {
      setErreur(message(err));
    } finally {
      setImport(null);
    }
  };

  if (ouverte) {
    return <DetailReunion id={ouverte} onRetour={() => { setOuverte(null); void charger(); }} />;
  }

  const reunions = etat?.reunions ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Calendar size={26} strokeWidth={1.75} className="mt-0.5 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("Réunions")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("Enregistrées, transcrites et résumées sur vos machines")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={Video}
            onClick={() => setModalBot(true)}
            disabled={!pont || !etat}
            title={pont ? undefined : tf("Le bot de réunion fonctionne depuis l'application de bureau {0}.", branding.name)}
          >
            {t("Envoyer le bot")}
          </Button>
          <Button variant="secondary" icon={Mic} onClick={() => void demarrerMicro()} disabled={Boolean(enregistrement) || !etat}>
            {t("Enregistrer")}
          </Button>
          <Button variant="secondary" icon={Upload} onClick={() => choixFichier.current?.click()} disabled={Boolean(import_) || !etat}>
            {t("Importer")}
          </Button>
          <input
            ref={choixFichier}
            type="file"
            accept={ACCEPT_AUDIO}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importer(f);
            }}
          />
          <IconButton icon={Settings} label={t("Réglages des réunions")} onClick={() => navigate("/parametres/bot-recorder")} />
        </div>
      </div>

      {etat && !etat.transcription.installee && <InstallationTranscription onFaite={charger} />}

      {etat && pont && etat.reglages.botAuto && (
        <InfoBox tone={etat.agenda ? "muted" : "warning"} className="mt-4" leading={<CalendarClock size={15} strokeWidth={1.75} />}>
          {etat.agenda
            ? t("Le bot rejoint seul vos réunions Google Meet de l'agenda, à l'heure dite, tant que l'application est ouverte.")
            : t("Le bot automatique attend un agenda : branchez-le dans Paramètres, Connecteurs.")}
        </InfoBox>
      )}

      {erreur && (
        <InfoBox tone="warning" className="mt-4" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}

      {enregistrement && (
        <PanneauEnregistrement
          enregistrement={enregistrement}
          onFini={async () => {
            setEnregistrement(null);
            await charger();
          }}
        />
      )}

      {import_ && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 size={15} className="animate-spin" />{" "}{t("Envoi de «")}{" "}{import_.nom} » : {import_.pourcent} %
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${import_.pourcent}%` }} />
          </div>
        </div>
      )}

      {bots.length > 0 && (
        <ul className="mt-4 space-y-2">
          {bots.map((b) => (
            <CarteBot key={b.reunionId} bot={b} onChange={setBots} />
          ))}
        </ul>
      )}

      {!etat && !erreur ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : reunions.length === 0 && !enregistrement ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl bg-muted/40 px-8 py-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-sm">
              <Mic size={26} strokeWidth={1.75} className="text-foreground" />
            </span>
            <h2 className="text-xl font-semibold text-foreground">{t("Aucune réunion pour l'instant")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("Enregistrez une réunion au micro, importez un enregistrement, ou envoyez le bot dans une réunion Google Meet. Vous obtenez la transcription et un compte rendu avec les décisions et les tâches.")}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Button icon={Mic} onClick={() => void demarrerMicro()}>
                {t("Enregistrer avec le micro")}
              </Button>
              {pont && (
                <Button variant="secondary" icon={Video} onClick={() => setModalBot(true)}>
                  {t("Envoyer le bot")}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
          {reunions.map((r) => (
            <LigneReunion key={r.id} reunion={r} onOuvrir={() => setOuverte(r.id)} />
          ))}
        </ul>
      )}

      {modalBot && etat && (
        <ModalBot
          nomBot={nomDuBot(etat.reglages, branding.name)}
          onFermer={() => setModalBot(false)}
          onEnvoye={async () => {
            setModalBot(false);
            await charger();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function IconeSource({ source }: { source: Reunion["source"] }) {
  const Icone = source === "bot" ? Bot : source === "import" ? FileAudio : Mic;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Icone size={17} strokeWidth={1.75} />
    </span>
  );
}

function PastilleStatut({ reunion: r }: { reunion: Reunion }) {
  const ton =
    r.statut === "prete"
      ? "bg-success/15 text-success"
      : r.statut === "erreur"
        ? "bg-destructive/10 text-destructive"
        : "bg-info/10 text-info";
  const texte =
    r.statut === "transcription" && r.progression !== undefined
      ? `Transcription ${r.progression} %`
      : r.statut === "prete" && !r.compteRendu
        ? "Transcrite"
        : LEGENDE_STATUT[r.statut];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", ton)}>
      {EN_COURS.includes(r.statut) && <Loader2 size={10} className="animate-spin" />}
      {r.statut === "prete" && <Check size={10} strokeWidth={3} />}
      {texte}
    </span>
  );
}

function LigneReunion({ reunion: r, onOuvrir }: { reunion: Reunion; onOuvrir: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOuvrir} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
        <IconeSource source={r.source} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{r.titre}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {formaterDateHeure(r.createdAt)}
            {r.dureeSecondes ? ` · ${dureePlaisante(r.dureeSecondes)}` : ""}
            {r.compteRendu ? ` · ${r.compteRendu.resume.slice(0, 90)}${r.compteRendu.resume.length > 90 ? "…" : ""}` : ""}
          </span>
        </span>
        <PastilleStatut reunion={r} />
      </button>
    </li>
  );
}

function PanneauEnregistrement({ enregistrement, onFini }: { enregistrement: EnregistreurReunion; onFini: () => Promise<void> }) {
  const [secondes, setSecondes] = useState(0);
  const [niveau, setNiveau] = useState(0);
  const [pause, setPause] = useState(false);
  const [fin, setFin] = useState(false);
  useEffect(() => {
    const minuterie = setInterval(() => {
      if (!enregistrement.enPause) setSecondes((s) => s + 1);
    }, 1000);
    const n = setInterval(() => setNiveau(enregistrement.niveau()), 120);
    return () => {
      clearInterval(minuterie);
      clearInterval(n);
    };
  }, [enregistrement]);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-4">
      <span className={cn("h-3 w-3 shrink-0 rounded-full bg-destructive", !pause && "animate-pulse")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {pause ? "Enregistrement en pause" : t("Enregistrement en cours")} · <span className="tabular-nums">{horodatage(secondes)}</span>
        </p>
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-destructive/70 transition-[width] duration-100" style={{ width: `${Math.round((pause ? 0 : niveau) * 100)}%` }} />
        </div>
        {enregistrement.erreur && <p className="mt-1 text-xs text-destructive">{enregistrement.erreur}</p>}
      </div>
      <Button
        variant="secondary"
        size="sm"
        icon={pause ? Play : Pause}
        disabled={fin}
        onClick={() => {
          if (pause) enregistrement.reprendre();
          else enregistrement.pause();
          setPause(!pause);
        }}
      >
        {pause ? t("Reprendre") : "Pause"}
      </Button>
      <Button
        size="sm"
        icon={fin ? Loader2 : Square}
        disabled={fin}
        onClick={() => {
          setFin(true);
          void enregistrement
            .terminer()
            .catch(() => undefined)
            .finally(() => void onFini());
        }}
      >
        {fin ? "Envoi…" : "Terminer"}
      </Button>
    </div>
  );
}

function CarteBot({ bot, onChange }: { bot: BotEnCours; onChange: (b: BotEnCours[]) => void }) {
  const pont = pontBot();
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const texte =
    bot.phase === "enregistrement" && bot.depuis
      ? tf("Enregistre depuis {0}", horodatage(Math.max(0, (maintenant - Date.parse(bot.depuis)) / 1000)))
      : bot.phase === "attente"
        ? t("Attend qu'un participant l'admette dans la réunion")
        : bot.phase === "fin"
          ? t("Sort de la réunion, envoi du dernier morceau…")
          : bot.phase === "erreur"
            ? bot.message ?? t("Le bot a rencontré un problème.")
            : t("Rejoint la réunion…");
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
        <Bot size={17} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{bot.titre}</p>
        <p className="text-xs text-muted-foreground">{texte}</p>
      </div>
      {pont && bot.phase !== "fin" && (
        <>
          <Button variant="ghost" size="sm" icon={Eye} onClick={() => void pont.afficher(bot.reunionId).then(onChange)}>
            {t("Voir la fenêtre")}
          </Button>
          <Button variant="secondary" size="sm" icon={Square} onClick={() => void pont.arreter(bot.reunionId).then(onChange)}>
            {t("Arrêter")}
          </Button>
        </>
      )}
    </li>
  );
}

function ModalBot({ nomBot, onFermer, onEnvoye }: { nomBot: string; onFermer: () => void; onEnvoye: () => Promise<void> }) {
  const [lien, setLien] = useState("");
  const [titre, setTitre] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const valide = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?\S*)?$/i.test(lien.trim());
  return (
    <Modal open onClose={occupe ? () => undefined : onFermer} size="md">
      <h2 className="text-lg font-semibold text-foreground">{t("Envoyer le bot dans une réunion")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Il rejoint la réunion Google Meet comme invité, sous le nom «")}{" "}{nomBot}{" "}{t("», sans micro ni caméra, et l'enregistre jusqu'à la fin.")}
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const pont = pontBot();
          const p = passerelle();
          if (!valide || occupe || !pont || !p) return;
          setOccupe(true);
          setErreur(null);
          void creerReunion({ source: "bot", lien: lien.trim(), titre })
            .then((r) => pont.envoyer({ reunionId: r.id, lien: r.lien ?? lien.trim(), titre: r.titre, nom: nomBot, passerelle: p }))
            .then(onEnvoye)
            .catch((err) => {
              setErreur(message(err));
              setOccupe(false);
            });
        }}
      >
        <Field label={t("Lien de la réunion Google Meet")} required>
          <Input placeholder="https://meet.google.com/abc-defg-hij" value={lien} autoFocus onChange={(e) => setLien(e.target.value)} />
        </Field>
        <Field label={t("Nom de la réunion")}>
          <Input placeholder={t("Ex : Point d'équipe du lundi")} value={titre} maxLength={120} onChange={(e) => setTitre(e.target.value)} />
        </Field>
        <InfoBox tone="muted">
          {t("Un participant doit l'admettre, comme tout invité. Prévenez les personnes présentes : on n'enregistre pas une réunion sans leur accord. Le son est transcrit sur la machine de l'instance, puis effacé.")}
        </InfoBox>
        {erreur && <InfoBox tone="warning">{erreur}</InfoBox>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={occupe} onClick={onFermer}>
            {t("Annuler")}
          </Button>
          <Button type="submit" icon={Video} disabled={!valide || occupe}>
            {occupe ? "Envoi…" : t("Envoyer le bot")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** La transcription locale manque : on l'installe d'ici (le même moteur que la dictée). */
function InstallationTranscription({ onFaite }: { onFaite: () => Promise<void> }) {
  const [progres, setProgres] = useState<ProgresDictee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <InfoBox tone="info" className="mt-4" leading={<Mic size={15} strokeWidth={1.75} />}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          {t("La transcription se fait sur la machine de l'instance, avec Whisper : aucun son ne part chez un prestataire. Elle n'est pas encore installée.")}
        </p>
        {!progres && (
          <Button
            size="sm"
            onClick={() => {
              setErreur(null);
              setProgres({ phase: "verification", message: t("Préparation…"), percent: 0 });
              void installerTranscription(setProgres)
                .then(onFaite)
                .catch((err) => {
                  setErreur(message(err));
                  setProgres(null);
                });
            }}
          >
            {t("Installer la transcription")}
          </Button>
        )}
      </div>
      {progres && (
        <p className="mt-2 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {progres.message} {progres.percent > 0 ? `${progres.percent} %` : ""}
        </p>
      )}
      {erreur && <p className="mt-2 text-sm">{erreur}</p>}
    </InfoBox>
  );
}

/* ------------------------------------------------------------------ */

function DetailReunion({ id, onRetour }: { id: string; onRetour: () => void }) {
  const moi = useUtilisateurCourant();
  const [donnees, setDonnees] = useState<{ reunion: Reunion; segments: Segment[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState("compte-rendu");
  const [renommer, setRenommer] = useState<string | null>(null);
  const [partage, setPartage] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const { etat: groupes } = useGroupes();

  const charger = useCallback(async () => {
    try {
      setDonnees(await lireReunion(id));
    } catch (err) {
      setErreur(message(err));
    }
  }, [id]);
  useEffect(() => {
    void charger();
  }, [charger]);
  const r = donnees?.reunion;
  useEffect(() => {
    if (!r || !EN_COURS.includes(r.statut)) return;
    const t = setInterval(() => void charger(), 3000);
    return () => clearInterval(t);
  }, [r, charger]);
  useEffect(() => () => {
    if (audio) URL.revokeObjectURL(audio);
  }, [audio]);

  if (!donnees || !r) {
    return (
      <div className="flex h-full flex-col px-8 py-7">
        <button type="button" onClick={onRetour} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} strokeWidth={1.75} />{" "}{t("Réunions")}
        </button>
        {erreur ? <InfoBox tone="warning" className="mt-4">{erreur}</InfoBox> : <Loader2 size={20} className="mx-auto mt-16 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  const proprietaire = r.ownerId === moi.id;
  const exporter = () => {
    const cr = r.compteRendu;
    const lignes = [
      `# ${r.titre}`,
      "",
      `${formaterDateHeure(r.createdAt)}${r.dureeSecondes ? `, ${dureePlaisante(r.dureeSecondes)}` : ""}`,
      "",
      ...(cr
        ? [
            t("## Résumé"),
            "",
            cr.resume,
            "",
            ...(cr.points.length ? [t("## Points clés"), "", ...cr.points.map((p) => `- ${p}`), ""] : []),
            ...(cr.decisions.length ? [t("## Décisions"), "", ...cr.decisions.map((d) => `- ${d}`), ""] : []),
            ...(cr.actions.length
              ? ["## Actions", "", ...cr.actions.map((a) => `- [ ] ${a.tache}${a.qui ? ` (${a.qui})` : ""}${a.echeance ? tf(", pour {0}", a.echeance) : ""}`), ""]
              : []),
          ]
        : []),
      "## Transcription",
      "",
      ...donnees.segments.map((s) => `[${horodatage(s.debut)}] ${s.texte}`),
    ];
    const url = URL.createObjectURL(new Blob([lignes.join("\n")], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.titre.replace(/[\\/:*?"<>|]/g, " ").trim() || "reunion"}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 py-7">
      <button type="button" onClick={onRetour} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} strokeWidth={1.75} />{" "}{t("Réunions")}
      </button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {renommer !== null ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void modifierReunion(r.id, { titre: renommer })
                  .then(() => setRenommer(null))
                  .then(charger)
                  .catch((err) => setErreur(message(err)));
              }}
            >
              <Input value={renommer} maxLength={120} autoFocus onChange={(e) => setRenommer(e.target.value)} className="min-w-[280px]" />
              <Button type="submit" size="sm" disabled={!renommer.trim()}>
                {t("Enregistrer")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRenommer(null)}>
                {t("Annuler")}
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{r.titre}</h1>
              {proprietaire && (
                <button type="button" aria-label={t("Renommer")} onClick={() => setRenommer(r.titre)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Pencil size={15} strokeWidth={1.75} />
                </button>
              )}
            </div>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {[
                formaterDateHeure(r.createdAt),
                dureePlaisante(r.dureeSecondes),
                r.source === "bot" ? t("Bot de réunion") : r.source === "import" ? t("Importée") : t("Micro"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="inline-flex items-center gap-1">
              {r.visibilite === "organisation" ? (
                <>
                  <Globe size={13} strokeWidth={1.75} />{" "}{t("Toute l'équipe")}
                </>
              ) : r.visibilite === "groupes" ? (
                <>
                  <Users size={13} strokeWidth={1.75} /> {r.groupes.map((g) => groupes?.groupes.find((x) => x.id === g)?.nom ?? t("Groupe supprimé")).join(", ")}
                </>
              ) : (
                <>
                  <Lock size={13} strokeWidth={1.75} />{" "}{t("Vous seul")}
                </>
              )}
            </span>
            <PastilleStatut reunion={r} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.aTranscription && (
            <Button variant="secondary" size="sm" icon={Download} onClick={exporter}>
              {t("Exporter")}
            </Button>
          )}
          {proprietaire && (
            <Button variant="secondary" size="sm" icon={Users} onClick={() => setPartage(true)}>
              {t("Partager")}
            </Button>
          )}
          {proprietaire && (
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmer(true)}>
              {t("Supprimer")}
            </Button>
          )}
        </div>
      </div>

      {r.audio.conserve && r.aTranscription && (
        <div className="mt-4">
          {audio ? (
            <audio controls src={audio} className="w-full max-w-lg" />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={Play}
              onClick={() =>
                void lireAudio(r.id)
                  .then((b) => setAudio(URL.createObjectURL(b)))
                  .catch((err) => setErreur(message(err)))
              }
            >
              {t("Écouter l'enregistrement")}
            </Button>
          )}
        </div>
      )}

      {erreur && <InfoBox tone="warning" className="mt-4">{erreur}</InfoBox>}
      {info && <InfoBox tone="muted" className="mt-4">{info}</InfoBox>}

      {r.statut === "erreur" && (
        <InfoBox tone="warning" className="mt-4" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{r.message ?? t("Cette réunion n'a pas pu être traitée.")}</span>
            {proprietaire && r.audio.octets > 0 && (
              <Button size="sm" variant="secondary" icon={RotateCw} onClick={() => void relancerReunion(r.id).then(charger).catch((err) => setErreur(message(err)))}>
                {t("Relancer la transcription")}
              </Button>
            )}
          </div>
        </InfoBox>
      )}

      {(r.statut === "file" || r.statut === "transcription") && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 size={15} className="animate-spin" />
            {r.statut === "file" ? t("En attente : une autre réunion est en cours de transcription.") : tf("Transcription sur la machine : {0} %", r.progression ?? 0)}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${r.progression ?? 0}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("Compter environ un cinquième de la durée de la réunion. Vous pouvez quitter cet écran.")}</p>
        </div>
      )}

      {r.aTranscription && (
        <>
          <SegmentedTabs
            className="mt-6"
            options={[
              { id: "compte-rendu", label: t("Compte rendu") },
              { id: "transcription", label: `Transcription (${donnees.segments.length})` },
            ]}
            value={onglet}
            onChange={setOnglet}
          />
          {onglet === "compte-rendu" ? (
            <CompteRenduVue
              reunion={r}
              proprietaire={proprietaire}
              onResumer={() => void resumerReunion(r.id).then(charger).catch((err) => setErreur(message(err)))}
              onTaches={(n) => setInfo(n > 1 ? tf("{0} tâches ajoutées à Tâches.", n) : t("Tâche ajoutée à Tâches."))}
            />
          ) : (
            <TranscriptionVue segments={donnees.segments} />
          )}
        </>
      )}

      {partage && (
        <PartageReunion
          reunion={r}
          mesGroupes={(groupes?.groupes ?? []).filter((g) => g.estMembre)}
          onFermer={() => setPartage(false)}
          onFait={async () => {
            setPartage(false);
            await charger();
          }}
        />
      )}
      {confirmer && (
        <Modal open onClose={() => setConfirmer(false)} size="sm">
          <h2 className="pr-8 text-lg font-semibold text-foreground">{t("Supprimer cette réunion ?")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Le compte rendu, la transcription et l'audio éventuel disparaissent, pour tous ceux qui y avaient accès.")}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmer(false)}>
              {t("Annuler")}
            </Button>
            <Button variant="destructive" onClick={() => void supprimerReunion(r.id).then(onRetour).catch((err) => setErreur(message(err)))}>
              {t("Supprimer")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CompteRenduVue({
  reunion: r,
  proprietaire,
  onResumer,
  onTaches,
}: {
  reunion: Reunion;
  proprietaire: boolean;
  onResumer: () => void;
  onTaches: (n: number) => void;
}) {
  const moi = useUtilisateurCourant();
  const [ajoutees, setAjoutees] = useState<Set<number>>(new Set());
  const cr = r.compteRendu;
  if (r.statut === "resume") {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={15} className="animate-spin" />{" "}{t("Rédaction du compte rendu par le modèle de la machine…")}
      </p>
    );
  }
  if (!cr) {
    return (
      <div className="mt-6 space-y-3">
        <p className="text-sm text-muted-foreground">{r.message ?? t("Pas encore de compte rendu pour cette réunion.")}</p>
        {proprietaire && (
          <Button size="sm" icon={ClipboardList} onClick={onResumer}>
            {t("Rédiger le compte rendu")}
          </Button>
        )}
      </div>
    );
  }
  const ajouter = (indices: number[]) => {
    for (const i of indices) {
      const a = cr.actions[i]!;
      createTask(moi, {
        title: a.tache,
        description: [tf("Issue de la réunion « {0} ».", r.titre), a.qui ? tf("Personne citée : {0}.", a.qui) : "", a.echeance ? tf("Échéance citée : {0}.", a.echeance) : ""]
          .filter(Boolean)
          .join(" "),
      });
    }
    setAjoutees(new Set([...ajoutees, ...indices]));
    onTaches(indices.length);
  };
  const restantes = cr.actions.map((_, i) => i).filter((i) => !ajoutees.has(i));
  return (
    <div className="mt-6 max-w-3xl space-y-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("Résumé")}</h2>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{cr.resume}</p>
      </section>
      {cr.points.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("Points clés")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
            {cr.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}
      {cr.decisions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("Décisions")}</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground">
            {cr.decisions.map((d, i) => (
              <li key={i} className="flex gap-2">
                <Check size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-success" /> {d}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("Actions")}</h2>
          {restantes.length > 1 && (
            <Button variant="ghost" size="sm" icon={ListChecks} onClick={() => ajouter(restantes)}>
              {t("Tout ajouter aux tâches")}
            </Button>
          )}
        </div>
        {cr.actions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("Aucune action n'a été relevée dans cette réunion.")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {cr.actions.map((a, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  {a.tache}
                  {(a.qui || a.echeance) && (
                    <span className="block text-xs text-muted-foreground">
                      {[a.qui, a.echeance ? `pour ${a.echeance}` : ""].filter(Boolean).join(", ")}
                    </span>
                  )}
                </span>
                {ajoutees.has(i) ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success">
                    <Check size={13} strokeWidth={2.5} />{" "}{t("Dans Tâches")}
                  </span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => ajouter([i])}>
                    {t("Ajouter aux tâches")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        {t("Rédigé par")}{" "}{cr.modele}, {cr.origine === "local" ? t("sur la machine de l'instance") : cr.pays ? tf("chez le prestataire ({0})", nomDuPays(cr.pays)) : t("chez le prestataire")}{t(", à partir d'une transcription automatique : relisez avant de diffuser.")}
        {proprietaire && (
          <button type="button" onClick={onResumer} className="underline underline-offset-2 hover:text-foreground">
            {t("Rédiger à nouveau")}
          </button>
        )}
      </p>
    </div>
  );
}

function TranscriptionVue({ segments }: { segments: Segment[] }) {
  const [terme, setTerme] = useState("");
  const [copie, setCopie] = useState<"prêt" | "copiée" | "refusée">("prêt");
  // Renommée : « t » est la fonction de traduction depuis la mise en langues.
  const cherche = terme.trim().toLocaleLowerCase("fr");
  const visibles = useMemo(
    () =>
      cherche
        ? segments.filter((s) => s.texte.toLocaleLowerCase("fr").includes(cherche))
        : segments,
    [segments, cherche],
  );
  if (segments.length === 0) return <p className="mt-6 text-sm text-muted-foreground">{t("La transcription est vide : personne n'a parlé, ou le son est inaudible.")}</p>;
  return (
    <div className="mt-5 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchInput containerClassName="w-[260px]" placeholder={t("Chercher dans la transcription")} aria-label={t("Chercher dans la transcription")} value={terme} onChange={(e) => setTerme(e.target.value)} />
        <Button
          variant="ghost"
          size="sm"
          icon={copie === "copiée" ? Check : Copy}
          onClick={() => {
            // lib/pressePapiers (27/09/2026) : l'échec était muet, et l'application de bureau refusait toujours `navigator.clipboard`.
            void copierTexte(segments.map((s) => `[${horodatage(s.debut)}] ${s.texte}`).join("\n")).then((ok) => {
              setCopie(ok ? "copiée" : "refusée");
              if (ok) setTimeout(() => setCopie((c) => (c === "copiée" ? "prêt" : c)), 2000);
            });
          }}
        >
          {copie === "copiée" ? t("Copiée") : t("Copier le texte")}
        </Button>
      </div>
      {copie === "refusée" && (
        <p className="mt-2 text-xs text-destructive" role="status">
          {t("La copie a échoué : sélectionnez la transcription à la main.")}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("Transcription automatique, sans distinction des personnes qui parlent.")}</p>
      <ol className="mt-3 space-y-2">
        {visibles.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="w-14 shrink-0 pt-px text-right tabular-nums text-muted-foreground">{horodatage(s.debut)}</span>
            <span className="text-foreground">{s.texte}</span>
          </li>
        ))}
        {visibles.length === 0 && <li className="text-sm text-muted-foreground">{t("Rien ne correspond.")}</li>}
      </ol>
    </div>
  );
}

function PartageReunion({
  reunion,
  mesGroupes,
  onFermer,
  onFait,
}: {
  reunion: Reunion;
  mesGroupes: Groupe[];
  onFermer: () => void;
  onFait: () => Promise<void>;
}) {
  const [v, setV] = useState<Visibilite>(reunion.visibilite);
  const [g, setG] = useState<string[]>(reunion.groupes.filter((x) => mesGroupes.some((m) => m.id === x)));
  const [erreur, setErreur] = useState<string | null>(null);
  const options: { id: Visibilite; label: string; icon: typeof Lock }[] = [
    { id: "prive", label: t("Vous seul"), icon: Lock },
    { id: "groupes", label: t("Des groupes"), icon: Users },
    { id: "organisation", label: t("Toute l'équipe"), icon: Globe },
  ];
  return (
    <Modal open onClose={onFermer} size="md">
      <h2 className="pr-8 text-lg font-semibold text-foreground">{t("Qui peut voir cette réunion")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("Compte rendu et transcription ; seul vous pouvez la modifier ou la supprimer.")}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={o.id === "groupes" && mesGroupes.length === 0}
            onClick={() => setV(o.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium text-foreground disabled:opacity-50",
              v === o.id ? "border-ring bg-muted" : "border-border hover:bg-muted/60",
            )}
          >
            <o.icon size={14} strokeWidth={1.75} /> {o.label}
          </button>
        ))}
      </div>
      {v === "groupes" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {mesGroupes.map((x) => {
            const coche = g.includes(x.id);
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setG(coche ? g.filter((y) => y !== x.id) : [...g, x.id])}
                className={cn("rounded-full border px-3 py-1 text-xs", coche ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}
              >
                {x.nom}
              </button>
            );
          })}
        </div>
      )}
      {erreur && <InfoBox tone="warning" className="mt-3">{erreur}</InfoBox>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onFermer}>
          {t("Annuler")}
        </Button>
        <Button
          disabled={v === "groupes" && g.length === 0}
          onClick={() => void modifierReunion(reunion.id, { visibilite: v, groupes: g }).then(onFait).catch((err) => setErreur(message(err)))}
        >
          {t("Enregistrer")}
        </Button>
      </div>
    </Modal>
  );
}

export default ReunionsPage;
