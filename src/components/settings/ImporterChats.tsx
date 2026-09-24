import { useEffect, useMemo, useRef, useState } from "react";
import { grandStockageDisponible } from "@/lib/store/grandStockage";
import { Upload, Loader2, TriangleAlert, CircleCheck, FolderKanban, MessageSquare, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { Card } from "@/components/settings/SettingsShell";
import { NOM_SOURCE, lireExport, lireLogiciel, logicielsDuPoste, type Import, type LogicielTrouve } from "@/lib/importChats";
import { instance } from "@/lib/instance";
import { ajouterSessionsImportees, placeOccupeeParLesChats, type Session } from "@/lib/store/sessions";
import { createProject } from "@/lib/store/projects";
import { createAgent } from "@/lib/store/agents";
import { currentUser } from "@/lib/store/identity";
import { newId } from "@/lib/store/storage";
import { notifySessionsChanged } from "@/hooks/useSessions";
import { creerDossier, importerDocument } from "@/lib/bibliotheque";
import { t, tf, locale } from "@/lib/i18n";

/**
 * Place que les Chats peuvent occuper sur ce poste, en caractères.
 *
 * Dans l'application de bureau, les Chats vont dans un fichier chiffré du
 * poste (grandStockage.ts) : la seule borne est l'envoi à l'instance, qui
 * accepte 32 Mo par collection ; on garde une marge. Dans un navigateur, ils
 * restent dans son stockage local (quelques Mo, et une écriture qui dépasse
 * est ignorée sans erreur). Dans les deux cas, on laisse choisir, on montre la
 * place, et on relit ce qui a vraiment été gardé.
 */
const PLACE_CHATS = grandStockageDisponible() ? 25_000_000 : 3_500_000;

const date = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
const mo = (car: number) => (car / 1_000_000).toLocaleString(locale(), { maximumFractionDigits: 1 });

interface Bilan {
  chats: number;
  chatsDemandes: number;
  projets: number;
  agents: number;
  documents: number;
  documentsEchoues: number;
}

/**
 * Reprendre ses Chats et ses projets depuis ChatGPT ou Claude.
 *
 * L'archive d'export est lue sur ce poste (importChats.ts). On choisit ce
 * qu'on reprend ; les projets Claude reviennent avec leurs documents (rangés
 * dans Fichiers) et, si on le veut, un agent qui porte leurs instructions,
 * pour que les Chats de ce projet se poursuivent comme avant.
 */
export function ImporterChats() {
  const entree = useRef<HTMLInputElement>(null);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [donnees, setDonnees] = useState<Import | null>(null);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [projetsChoisis, setProjetsChoisis] = useState<Set<string>>(new Set());
  const [avecAgents, setAvecAgents] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  /** Logiciels d'IA trouvés sur ce poste (seulement sur un poste autonome : ailleurs, ce seraient ceux du serveur). */
  const [logiciels, setLogiciels] = useState<LogicielTrouve[] | null>(null);
  const [avecInstructions, setAvecInstructions] = useState(true);

  useEffect(() => {
    if (instance().remote) return;
    void logicielsDuPoste().then(setLogiciels);
  }, []);

  const placeLibre = Math.max(0, PLACE_CHATS - placeOccupeeParLesChats());
  const placeChoisie = useMemo(
    () => (donnees?.chats ?? []).filter((c) => choisis.has(c.cle)).reduce((s, c) => s + c.taille, 0),
    [donnees, choisis],
  );
  const trop = placeChoisie > placeLibre;

  const ouvrir = (fichier: File) => charger(() => lireExport(fichier));

  /** Une archive d'export, ou un logiciel du poste : la suite est la même. */
  const charger = async (lire: () => Promise<Import>) => {
    setErreur(null);
    setBilan(null);
    setDonnees(null);
    setLecture(true);
    try {
      const lu = await lire();
      // Les plus récents d'abord, présélectionnés tant qu'il reste de la place.
      lu.chats.sort((a, b) => b.modifieLe.localeCompare(a.modifieLe));
      const pre = new Set<string>();
      let place = 0;
      for (const c of lu.chats) {
        if (place + c.taille > placeLibre) continue;
        pre.add(c.cle);
        place += c.taille;
      }
      setDonnees(lu);
      setChoisis(pre);
      setProjetsChoisis(new Set(lu.projets.map((p) => p.cle)));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setLecture(false);
    }
  };

  const importer = async () => {
    if (!donnees) return;
    setEnCours(true);
    setErreur(null);
    const moi = currentUser();
    const bilanEnCours: Bilan = { chats: 0, chatsDemandes: 0, projets: 0, agents: 0, documents: 0, documentsEchoues: 0 };
    try {
      // Projets d'abord : les Chats s'y rangent.
      const projetsHelix = new Map<string, string>();
      for (const p of donnees.projets.filter((x) => projetsChoisis.has(x.cle))) {
        const description = [p.description, p.instructions ? `${t("Instructions du projet d'origine :")}\n${p.instructions}` : ""]
          .filter(Boolean)
          .join("\n\n");
        const projet = createProject(moi, p.nom, description);
        projetsHelix.set(p.cle, projet.id);
        bilanEnCours.projets++;
        if (avecAgents && p.instructions) {
          createAgent(moi, {
            name: p.nom,
            description: tf("Instructions reprises du projet « {0} ».", p.nom),
            instructions: p.instructions,
            visibility: "personnel",
            hidePrompt: false,
          });
          bilanEnCours.agents++;
        }
        if (p.documents.length > 0) {
          try {
            const dossier = await creerDossier({ nom: tf("Projet importé : {0}", p.nom), parentId: null, visibilite: "prive", groupes: [] });
            for (const d of p.documents) {
              try {
                await importerDocument(new File([d.contenu], d.nom, { type: "text/plain" }), {
                  parentId: dossier.id,
                  visibilite: "prive",
                  groupes: [],
                });
                bilanEnCours.documents++;
              } catch {
                bilanEnCours.documentsEchoues++;
              }
            }
          } catch {
            bilanEnCours.documentsEchoues += p.documents.length;
          }
        }
      }

      // Instructions générales du logiciel (CLAUDE.md, AGENTS.md) : un agent personnel, qu'on choisit ou non.
      if (avecInstructions && donnees.instructions?.trim()) {
        createAgent(moi, {
          name: tf("Comme dans {0}", NOM_SOURCE[donnees.source]),
          description: tf("Vos instructions reprises de {0}.", NOM_SOURCE[donnees.source]),
          instructions: donnees.instructions.trim(),
          visibility: "personnel",
          hidePrompt: false,
        });
        bilanEnCours.agents++;
      }

      const sessions: Session[] = donnees.chats
        .filter((c) => choisis.has(c.cle))
        .map((c) => ({
          id: newId(),
          title: c.titre,
          ownerId: moi.id,
          visibility: "prive" as const,
          sharedGroupIds: [],
          sharedWith: [],
          organisationId: moi.organisationId,
          origin: "local" as const,
          ...(c.projet && projetsHelix.has(c.projet) ? { projectId: projetsHelix.get(c.projet) } : {}),
          messages: c.messages.map((m) => ({ id: newId(), role: m.role, content: m.content, createdAt: m.createdAt })),
          createdAt: c.creeLe,
          updatedAt: c.modifieLe,
        }));
      bilanEnCours.chatsDemandes = sessions.length;
      bilanEnCours.chats = ajouterSessionsImportees(sessions);
      notifySessionsChanged();
      setBilan(bilanEnCours);
      setDonnees(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setEnCours(false);
    }
  };

  const basculer = (cle: string) =>
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  const lisibles = (logiciels ?? []).filter((l) => l.lisible);
  const autres = (logiciels ?? []).filter((l) => !l.lisible);

  return (
    <div className="space-y-4">
      {logiciels && logiciels.length > 0 && (
        <Card className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("Depuis les logiciels de cet ordinateur")}</p>
          <p className="text-sm text-muted-foreground">
            {t("Helix a trouvé ces logiciels d'IA sur cet ordinateur. Il reprend ce qu'ils y ont laissé, sans export à demander : vous choisissez ensuite ce que vous gardez.")}
          </p>
          {lisibles.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{l.nom}</p>
                <p className="text-xs text-muted-foreground">
                  {tf("{0} conversation(s)", l.conversations)}
                  {l.instructions ? ` · ${t("instructions personnelles")}` : ""} · {l.note}
                </p>
              </div>
              <Button
                variant="secondary"
                icon={lecture ? Loader2 : Download}
                disabled={lecture || enCours || (l.conversations === 0 && !l.instructions)}
                onClick={() => void charger(() => lireLogiciel(l.id))}
              >
                {t("Reprendre")}
              </Button>
            </div>
          ))}
          {autres.map((l) => (
            <p key={l.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{l.nom}</span> : {l.note}
            </p>
          ))}
        </Card>
      )}
      <Card className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("Demandez d'abord l'export de vos données au service d'origine. Vous recevez un lien par mail vers une archive ZIP : choisissez-la ici, telle quelle.")}
        </p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>{t("• ChatGPT : Paramètres, Contrôle des données, Exporter les données.")}</li>
          <li>{t("• Claude : Paramètres, Confidentialité, Exporter les données.")}</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          {t("L'archive est lue sur cet ordinateur : rien n'est envoyé ailleurs que dans votre instance.")}
        </p>
        <input
          ref={entree}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void ouvrir(f);
            e.target.value = "";
          }}
        />
        <Button icon={lecture ? Loader2 : Upload} disabled={lecture || enCours} onClick={() => entree.current?.click()}>
          {lecture ? t("Lecture de l'archive...") : t("Choisir l'archive d'export")}
        </Button>
        {erreur && (
          <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
            {erreur}
          </InfoBox>
        )}
        {bilan && (
          <InfoBox tone="muted" leading={<CircleCheck size={15} strokeWidth={1.75} />}>
            <p>
              {tf("{0} Chat(s) repris sur {1}.", bilan.chats, bilan.chatsDemandes)}
              {bilan.projets > 0 && ` ${tf("{0} projet(s) créé(s).", bilan.projets)}`}
              {bilan.agents > 0 && ` ${tf("{0} agent(s) avec les instructions des projets.", bilan.agents)}`}
              {bilan.documents > 0 && ` ${tf("{0} document(s) rangé(s) dans Fichiers.", bilan.documents)}`}
            </p>
            {bilan.chats < bilan.chatsDemandes && (
              <p className="mt-1">
                {t("Les autres n'ont pas pu être gardés : la place de cet ordinateur est pleine. Archivez ou supprimez d'anciens Chats, puis importez le reste.")}
              </p>
            )}
            {bilan.documentsEchoues > 0 && (
              <p className="mt-1">{tf("{0} document(s) n'ont pas pu être rangés dans Fichiers.", bilan.documentsEchoues)}</p>
            )}
          </InfoBox>
        )}
      </Card>

      {donnees && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {tf("{0} : {1} Chat(s), {2} projet(s)", NOM_SOURCE[donnees.source], donnees.chats.length, donnees.projets.length)}
            </p>
            <p className={trop ? "text-xs text-warning" : "text-xs text-muted-foreground"}>
              {tf("Sélection : {0} Mo sur {1} Mo de place libre", mo(placeChoisie), mo(placeLibre))}
            </p>
          </div>

          {donnees.projets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Projets")}</p>
              {donnees.projets.map((p) => (
                <label key={p.cle} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={projetsChoisis.has(p.cle)}
                    onChange={() =>
                      setProjetsChoisis((s) => {
                        const n = new Set(s);
                        if (n.has(p.cle)) n.delete(p.cle);
                        else n.add(p.cle);
                        return n;
                      })
                    }
                  />
                  <FolderKanban size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="text-foreground">{p.nom}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {[
                        p.instructions ? t("instructions") : "",
                        p.documents.length ? tf("{0} document(s)", p.documents.length) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
              {donnees.projets.some((p) => p.instructions) && (
                <label className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                  <input type="checkbox" checked={avecAgents} onChange={() => setAvecAgents((v) => !v)} />
                  {t("Créer un agent avec les instructions de chaque projet, pour continuer ses Chats comme avant")}
                </label>
              )}
            </div>
          )}

          {donnees.instructions?.trim() && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={avecInstructions} onChange={() => setAvecInstructions((v) => !v)} />
              {tf("Reprendre aussi vos instructions de {0}, dans un agent « Comme dans {0} »", NOM_SOURCE[donnees.source])}
            </label>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Chats")}</p>
              <span className="flex gap-3 text-xs">
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setChoisis(new Set(donnees.chats.map((c) => c.cle)))}>
                  {t("Tout choisir")}
                </button>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setChoisis(new Set())}>
                  {t("Aucun")}
                </button>
              </span>
            </div>
            <ul className="max-h-80 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
              {donnees.chats.map((c) => (
                <li key={c.cle}>
                  <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={choisis.has(c.cle)} onChange={() => basculer(c.cle)} />
                    <MessageSquare size={14} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{c.titre}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {date(c.modifieLe)} · {tf("{0} messages", c.messages.length)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {trop && (
            <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
              {t("La sélection dépasse la place libre sur cet ordinateur : retirez des Chats, ou importez en plusieurs fois après avoir archivé d'anciens Chats.")}
            </InfoBox>
          )}

          <Button icon={enCours ? Loader2 : Upload} disabled={enCours || trop || (choisis.size === 0 && projetsChoisis.size === 0)} onClick={() => void importer()}>
            {enCours ? t("Import en cours...") : tf("Importer {0} Chat(s)", choisis.size)}
          </Button>
        </Card>
      )}
    </div>
  );
}

export default ImporterChats;
