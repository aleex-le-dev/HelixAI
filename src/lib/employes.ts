import { apiFetch } from "./endpoint";
import { DOCUMENT_MAX, EXTRACTION_MAX, LIBELLE_DOCUMENT_MAX, envoyerEnFlux } from "./televersement";
import { t, tf } from "@/lib/i18n";

/**
 * Employés : des agents OpenClaw qui travaillent pour toute l'équipe (voir
 * gateway/src/employes.ts). Ce module ne fait que parler à la passerelle :
 * c'est elle qui déploie, planifie et décide qui a le droit de quoi.
 */

export type Famille = "fichiers" | "bibliotheque" | "courrier" | "agenda" | "drive" | "slack" | "bureau";
export type Rythme = "jours-ouvres" | "chaque-jour" | "chaque-heure" | "chaque-semaine" | "a-chaque-mail";
export type Liberte = "encadre" | "etendu" | "libre";
export type TypeCanal = "telegram" | "whatsapp" | "discord" | "slack" | "mattermost";

export interface CanalEmploye {
  type: TypeCanal;
  nom: string;
  /** Présents pour le propriétaire seulement. */
  acces?: "appairage" | "liste";
  autorises?: string[];
  outilsEntreprise?: boolean;
}

export interface ChampCanal {
  cle: string;
  libelle: string;
  secret: boolean;
  aide?: string;
}

export interface Mission {
  id?: string;
  nom: string;
  consigne: string;
  rythme: Rythme;
  /** « À chaque mail reçu » : ne réagir qu'aux messages dont l'expéditeur, ou l'objet, contient ce texte. */
  filtre?: { de?: string; objet?: string };
  heure: string;
  planifiee?: boolean;
}

export interface Employe {
  id: string;
  nom: string;
  poste: string;
  description?: string;
  outils: Famille[];
  missions: Mission[];
  enPause: boolean;
  autonome?: boolean;
  liberte?: Liberte;
  canaux?: CanalEmploye[];
  /** Agent de l'interface dont il est la mise en service. */
  agentId?: string;
  visibilite?: "personnel" | "groupes" | "organisation";
  /** Pour la visibilité « groupes » : les groupes à qui il est partagé. */
  groupes?: string[];
  toutesLesFamilles?: boolean;
  /** Bases de connaissances de l'agent : ce qu'il y lit, `lectureDesBases` le dit. */
  connaissances?: string[];
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
  modele: string;
  proprietaire: string;
  estProprietaire: boolean;
  jetons30Jours: number;
}

export interface EtatEmployes {
  catalogueCanaux: Record<TypeCanal, { nom: string; champs: ChampCanal[]; qr: boolean }>;
  moteur: {
    installe: boolean;
    version?: string;
    enMarche: boolean;
    raison?: string;
    /** Installé par l'application elle-même (sinon trouvé sur la machine). */
    gere: boolean;
    installation: EtatInstallation;
    /** Version éprouvée plus récente que celle en place : la mise à jour proposée. */
    miseAJour?: string;
    /** Version publiée plus récente encore, pas encore éprouvée. */
    parue?: string;
  };
  employes: Employe[];
  familles: { id: Famille; disponible: boolean }[];
  modeles: {
    uid: string;
    nom: string;
    charge: boolean;
    origine: "local" | "agence" | "cle";
    pays?: string;
    fournisseur?: string;
  }[];
}

export interface EtatInstallation {
  etape: "repos" | "preparation" | "node" | "openclaw" | "verification" | "termine" | "erreur";
  message: string;
  avancement?: number;
  version?: string;
  /** Version remplacée, quand c'était une mise à jour. */
  de?: string;
}

/** Lance l'installation d'OpenClaw sur la machine de l'instance ; on suit ensuite `moteur.installation`. */
export async function installerOpenClaw(): Promise<void> {
  await lire(await poster("/helix/openclaw/installer", {}));
}

/**
 * Installe OpenClaw s'il manque et attend la fin, en rapportant chaque étape.
 * Sert au déploiement : l'employé se déploie dès qu'OpenClaw est prêt.
 */
export async function assurerOpenClaw(suivi: (e: EtatInstallation) => void): Promise<void> {
  const etat = await chargerEmployes();
  if (etat.moteur.installe) return;
  await installerOpenClaw();
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const m = (await chargerEmployes()).moteur;
    suivi(m.installation);
    if (m.installe && !["preparation", "node", "openclaw", "verification"].includes(m.installation.etape)) return;
    if (m.installation.etape === "erreur") throw new Error(m.installation.message);
  }
}

export interface Echange {
  quand: string;
  question: string;
  reponse: string;
  ok: boolean;
}

export interface Execution {
  mission: string;
  quand: string;
  statut: string;
  resume: string;
  dureeMs?: number;
}

export const LIBELLE_FAMILLE: Record<Famille, string> = {
  fichiers: t("Fichiers de l'équipe"),
  bibliotheque: t("Bibliothèque"),
  courrier: "Mails",
  agenda: t("Agenda"),
  drive: "Google Drive",
  slack: "Slack",
  bureau: "Documents Office",
};

export const DETAIL_FAMILLE: Record<Famille, string> = {
  fichiers: t("Lire, chercher et écrire dans le dossier de travail"),
  bibliotheque: t("Chercher et lire les documents de la bibliothèque ouverts à toute l'équipe"),
  courrier: t("Lire la boîte mail de l'entreprise, y préparer des brouillons, envoyer après accord si l'envoi est activé"),
  agenda: t("Lire l'agenda de l'entreprise"),
  drive: t("Lire les documents du Drive"),
  slack: t("Lire les salons Slack"),
  bureau: t("Créer des documents Word, Excel, PowerPoint et PDF"),
};

export const LIBELLE_RYTHME: Record<Rythme, string> = {
  "jours-ouvres": t("Chaque jour ouvré"),
  "chaque-jour": t("Chaque jour"),
  "chaque-heure": t("Chaque heure"),
  "chaque-semaine": t("Chaque lundi"),
  "a-chaque-mail": t("À chaque mail reçu"),
};

/** « qwen3-8b · LM Studio (chargé) », « mistral-large · Mistral AI · France ». */
export function libelleModele(m: EtatEmployes["modeles"][number]): string {
  const ou = m.origine === "local" ? (m.charge ? t("sur la machine, chargé") : "sur la machine") : `cloud, ${m.pays ?? t("pays non précisé")}`;
  return `${m.nom} · ${m.fournisseur ?? ""} (${ou})`;
}

/** « Chaque jour ouvré à 8 h 30 » : l'heure n'a pas de sens pour « chaque heure ». */
export function decrireRythme(m: Pick<Mission, "rythme" | "heure" | "filtre">): string {
  if (m.rythme === "a-chaque-mail") {
    const conditions = [
      m.filtre?.de ? tf("de « {0} »", m.filtre.de) : "",
      m.filtre?.objet ? `dont l'objet contient « ${m.filtre.objet} »` : "",
    ].filter(Boolean);
    return conditions.length ? tf("À chaque mail reçu {0}", conditions.join(" et ")) : LIBELLE_RYTHME[m.rythme];
  }
  if (m.rythme === "chaque-heure") return LIBELLE_RYTHME[m.rythme];
  const [h, min] = m.heure.split(":");
  return tf("{0} à {1} h{2}", LIBELLE_RYTHME[m.rythme], Number(h), min && min !== "00" ? ` ${min}` : "");
}

/**
 * Refus de l'instance, avec son code quand l'écran sait le traiter : ici,
 * `memoire-a-vider` (gateway/src/employes.ts, `CODE_MEMOIRE`), qui demande la
 * confirmation de vider la mémoire de l'agent avant d'élargir son audience.
 */
export class RefusInstance extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const CODE_MEMOIRE = "memoire-a-vider";

/** Ce qui élargit l'audience de l'agent, tel que l'instance le dit. */
export type RaisonElargissement = "visibilite" | "groupes" | "messagerie" | "mission-mail" | "liberte" | "outils";

export const estRefusMemoire = (err: unknown): err is RefusInstance => err instanceof RefusInstance && err.code === CODE_MEMOIRE;

async function lire<T>(res: Response): Promise<T> {
  const corps = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: string; details?: Record<string, unknown> } };
  if (!res.ok) throw new RefusInstance(corps.error?.message ?? t("L'instance n'a pas répondu."), corps.error?.code, corps.error?.details);
  return corps;
}

const poster = (chemin: string, corps: unknown) =>
  apiFetch(chemin, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });

export async function chargerEmployes(): Promise<EtatEmployes> {
  return lire<EtatEmployes>(await apiFetch("/helix/employes"));
}

/** Pourquoi un agent toujours actif ne lit que ce qui est ouvert à toute l'équipe (gateway/src/employes.ts, `lectureDesBases`). */
export type RaisonEquipeSeulement = "organisation" | "sans-groupe" | "messagerie" | "mission-mail" | "liberte" | "outils";

/** Ce qu'il lira réellement dans ses bases de connaissances, calculé par l'instance comme son outil le fait. */
export interface LectureDesBases {
  /** `equipe` : ouvert à toute l'équipe ; `groupes` : aussi partagé à chacun de ses groupes ; `proprietaire` : tout ce que vous voyez. */
  regle: "equipe" | "groupes" | "proprietaire";
  raisons: RaisonEquipeSeulement[];
  outilsQuiSortent: Famille[];
  bases: {
    id: string;
    nom?: string;
    visibilite?: "prive" | "groupes" | "organisation";
    lue: boolean;
    documents: number;
    documentsLus: number;
    raison?: "prive" | "groupes-equipe" | "groupes-autres" | "inconnue" | "documents";
  }[];
}

export async function lectureDesBases(id: string, bases: string[]): Promise<LectureDesBases> {
  return lire<LectureDesBases>(await poster(`/helix/employes/${encodeURIComponent(id)}/connaissances`, { bases }));
}

export interface NouvelEmploye {
  nom: string;
  poste: string;
  outils: Famille[];
  missions: Mission[];
  autonome: boolean;
  liberte: Liberte;
  agentId?: string;
  visibilite?: "personnel" | "groupes" | "organisation";
  groupes?: string[];
  description?: string;
  /** Toutes les familles d'outils branchées, y compris celles branchées plus tard. */
  toutesLesFamilles?: boolean;
  /** Bases de connaissances de l'agent. */
  connaissances?: string[];
  /** Exigés pour le palier « libre ». */
  motDePasse?: string;
  code?: string;
  modele?: string;
}

export async function deployerEmploye(
  e: NouvelEmploye,
): Promise<{ employe: Employe; avertissement?: string }> {
  return lire(await poster("/helix/employes", e));
}

export async function modifierEmploye(
  id: string,
  changements: Partial<
    Pick<Employe, "poste" | "outils" | "missions" | "enPause" | "autonome" | "modele" | "liberte" | "description" | "toutesLesFamilles" | "connaissances" | "visibilite" | "groupes">
  > & {
    motDePasse?: string;
    code?: string;
    /** Confirmé à l'écran : sa mémoire est mise de côté puis vidée avant que son audience s'élargisse. */
    viderMemoire?: boolean;
  },
): Promise<{ employe: Employe; avertissement?: string }> {
  return lire(await poster(`/helix/employes/${encodeURIComponent(id)}`, changements));
}

export async function supprimerEmploye(id: string): Promise<void> {
  await lire(await poster(`/helix/employes/${encodeURIComponent(id)}/supprimer`, {}));
}

export interface EnCours {
  travail: string;
  question: string;
  depuis: string;
}

/** Ses échanges avec l'employé, et le message qu'il traite encore s'il y en a un. */
export async function lireEchanges(id: string): Promise<{ echanges: Echange[]; enCours: EnCours | null }> {
  return lire(await apiFetch(`/helix/employes/${encodeURIComponent(id)}/echanges`));
}

/** `avertissement` : l'instance n'a pas pu dire toutes ses exécutions (la liste n'est pas complète). */
export async function lireActivite(id: string): Promise<{ executions: Execution[]; avertissement?: string }> {
  return lire<{ executions: Execution[]; avertissement?: string }>(
    await apiFetch(`/helix/employes/${encodeURIComponent(id)}/activite`),
  );
}

export async function lancerMission(id: string, mission: string): Promise<void> {
  await lire(
    await poster(`/helix/employes/${encodeURIComponent(id)}/missions/${encodeURIComponent(mission)}/lancer`, {}),
  );
}

/** Envoie un message ; la réponse s'attend avec `attendreReponse`. */
export async function envoyerMessage(id: string, texte: string): Promise<string> {
  const { travail } = await lire<{ travail: string }>(
    await poster(`/helix/employes/${encodeURIComponent(id)}/message`, { texte }),
  );
  return travail;
}

/**
 * Un modèle local met souvent une à trois minutes quand l'employé se sert de
 * ses outils : la passerelle rend la main tout de suite, et on vient voir où
 * il en est.
 */
export async function attendreReponse(
  id: string,
  travail: string,
  signal: AbortSignal,
): Promise<{ reponse: string; ok: boolean }> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    if (signal.aborted) throw new DOMException("Abandonné.", "AbortError");
    const etat = await lire<{ etat: string; reponse: string | null }>(
      await apiFetch(`/helix/employes/${encodeURIComponent(id)}/message/${travail}`, { signal }),
    );
    if (etat.etat !== "en-cours") return { reponse: etat.reponse ?? "", ok: etat.etat === "termine" };
  }
}

/* ---- Paliers ---------------------------------------------------------- */

export const PALIERS: Record<Liberte, { titre: string; detail: string }> = {
  encadre: {
    titre: t("Encadré"),
    detail: t("Ses outils de l'entreprise, ses fichiers de travail et sa mémoire. Rien d'autre."),
  },
  etendu: {
    titre: t("Étendu"),
    detail: t("En plus : recherche sur le web, lecture de pages, navigateur, envoi de messages sur ses canaux."),
  },
  libre: {
    titre: t("Libre"),
    detail:
      t("En plus : commandes sur la machine de l'instance, rappels qu'il se programme, fichiers hors de son espace. Votre mot de passe est demandé."),
  },
};

/* ---- Canaux ----------------------------------------------------------- */

export async function brancherCanal(
  id: string,
  donnees: { type: TypeCanal; champs: Record<string, string>; acces: "appairage" | "liste"; autorises: string[]; outilsEntreprise: boolean; viderMemoire?: boolean },
): Promise<{ avertissement?: string }> {
  return lire(await poster(`/helix/employes/${encodeURIComponent(id)}/canaux`, donnees));
}

/* ---- Mémoire mise de côté --------------------------------------------- */

export interface CopieMemoire {
  id: string;
  quand: string;
  fichiers: number;
  octets: number;
  conversations: number;
  raisons: RaisonElargissement[];
  /** Faux quand son audience est aujourd'hui plus large qu'au moment de la copie. */
  restaurable: boolean;
}

export async function lireCopiesMemoire(id: string): Promise<{ copies: CopieMemoire[]; aLuHorsEquipe: boolean }> {
  return lire(await apiFetch(`/helix/employes/${encodeURIComponent(id)}/memoire`));
}

export async function restaurerMemoire(id: string, copie: string): Promise<{ fichiers: number }> {
  return lire(await poster(`/helix/employes/${encodeURIComponent(id)}/memoire/${encodeURIComponent(copie)}/restaurer`, {}));
}

export async function supprimerCopieMemoire(id: string, copie: string): Promise<void> {
  await lire(await poster(`/helix/employes/${encodeURIComponent(id)}/memoire/${encodeURIComponent(copie)}/supprimer`, {}));
}

export async function retirerCanal(id: string, type: TypeCanal): Promise<void> {
  await lire(await poster(`/helix/employes/${encodeURIComponent(id)}/canaux/${type}/retirer`, {}));
}

export async function etatCanaux(id: string): Promise<Record<string, { enMarche: boolean; detail?: string }>> {
  return (await lire<{ etat: Record<string, { enMarche: boolean; detail?: string }> }>(
    await apiFetch(`/helix/employes/${encodeURIComponent(id)}/canaux`),
  )).etat;
}

export async function liaisonWhatsApp(
  id: string,
  attendre: boolean,
): Promise<{ connecte: boolean; qr?: string; message: string }> {
  return lire(await poster(`/helix/employes/${encodeURIComponent(id)}/canaux/whatsapp/qr`, { attendre }));
}

export interface DemandeAcces {
  canal: TypeCanal;
  code: string;
  expediteur: string;
  depuis?: string;
}

export async function lireDemandes(id: string): Promise<DemandeAcces[]> {
  return (await lire<{ demandes: DemandeAcces[] }>(await apiFetch(`/helix/employes/${encodeURIComponent(id)}/demandes`)))
    .demandes;
}

export async function accepterDemande(id: string, canal: TypeCanal, code: string): Promise<void> {
  await lire(
    await poster(
      `/helix/employes/${encodeURIComponent(id)}/demandes/${canal}/${encodeURIComponent(code)}/accepter`,
      {},
    ),
  );
}

/* ---- Documents de référence ------------------------------------------ */

export interface DocumentAgent {
  nom: string;
  fichier: string;
  lecture: string;
  taille: number;
  /** Le modèle peut le lire (texte, ou texte extrait à l'envoi). */
  lisible: boolean;
}

/** Formats qu'on peut confier à un agent : ceux dont on sait tirer le texte sur le poste. */
export const ACCEPT_DOCUMENTS = ".pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.txt,.md,.csv,.json,.html,.xml";

export async function lireDocuments(id: string): Promise<DocumentAgent[]> {
  return (await lire<{ documents: DocumentAgent[] }>(await apiFetch(`/helix/employes/${encodeURIComponent(id)}/documents`)))
    .documents;
}

/**
 * Confie un document à un agent. Le texte est extrait ici, sur le poste (PDF,
 * Word, Excel, PowerPoint, OpenDocument), et part avec le fichier : c'est ce
 * texte que l'agent lit.
 */
export async function envoyerDocument(id: string, fichier: File, onProgression?: (fraction: number) => void): Promise<DocumentAgent[]> {
  if (fichier.size > DOCUMENT_MAX) throw new Error(tf("{0} dépasse {1}.", fichier.name, LIBELLE_DOCUMENT_MAX));
  const ext = (fichier.name.split(".").pop() ?? "").toLowerCase();
  let texte: string | undefined;
  const { EXTENSIONS_DOCUMENTS, extraireTexte } = await import("./documents");
  // Au-delà de 100 Mo, pas d'extraction sur le poste : l'agent aura le fichier, sans son texte.
  if (EXTENSIONS_DOCUMENTS.includes(ext) && fichier.size <= EXTRACTION_MAX) texte = await extraireTexte(fichier, ext);
  const r = await envoyerEnFlux<{ documents: DocumentAgent[] }>(
    `/helix/employes/${encodeURIComponent(id)}/documents`,
    { nom: fichier.name, taille: fichier.size, texte },
    fichier,
    onProgression,
  );
  return r.documents;
}

export async function retirerDocument(id: string, nom: string): Promise<DocumentAgent[]> {
  return (
    await lire<{ documents: DocumentAgent[] }>(
      await poster(`/helix/employes/${encodeURIComponent(id)}/documents/${encodeURIComponent(nom)}/supprimer`, {}),
    )
  ).documents;
}

/*
 * Fichiers choisis à la création d'un agent : ils attendent sa mise en
 * service (l'espace de l'agent n'existe qu'ensuite), puis partent tout seuls.
 */
const fichiersEnAttente = new Map<string, File[]>();

export function retenirFichiers(agentId: string, fichiers: File[]): void {
  if (fichiers.length > 0) fichiersEnAttente.set(agentId, fichiers);
}

export function prendreFichiers(agentId: string): File[] {
  const f = fichiersEnAttente.get(agentId) ?? [];
  fichiersEnAttente.delete(agentId);
  return f;
}
