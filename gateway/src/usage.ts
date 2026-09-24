import { db } from "./db.ts";
import { tousLesBackends } from "./config.ts";
import { models } from "./router.ts";
import { journaliser } from "./audit.ts";
import type { BackendKind, ModelInfo } from "./types.ts";
import { t, tf } from "./langue.ts";

/**
 * Consommation des modèles : ce que l'écran « Mon usage » affiche.
 *
 * Cet écran a longtemps montré un budget, une courbe de coûts et une table de
 * modèles entièrement inventés, alors que la passerelle ne comptait rien. Un
 * tableau de bord faux est pire qu'un écran vide : il a l'air d'une mesure.
 * Tout ce qui est rendu ici vient donc de trois sources, et de trois seulement :
 *
 *  1. **Les jetons lus dans la réponse du moteur.** Un moteur compatible OpenAI
 *     (LM Studio, et les hébergeurs européens : Mistral, Scaleway, OVH) renvoie
 *     `usage` quand on le lui demande par `stream_options.include_usage`. Ce
 *     sont ses propres chiffres, pas les nôtres.
 *  2. **Une estimation, marquée comme telle**, quand le moteur ne dit rien :
 *     elle part du nombre de caractères. Elle ne se confond jamais avec une
 *     mesure : les deux sont additionnées dans des compteurs séparés, et
 *     l'écran dit laquelle il affiche.
 *  3. **Des tarifs saisis à la main** pour les modèles distants. Aucun prix
 *     par défaut, même « indicatif » : le tarif d'un hébergeur change, et un
 *     chiffre recopié ici serait faux le jour où il changera. Sans tarif,
 *     l'écran dit « tarif non renseigné » et ne calcule rien.
 */

/* ------------------------------------------------------------------ */
/* Local ou distant                                                    */
/* ------------------------------------------------------------------ */

/**
 * Un modèle local tourne sur le matériel du client : son poste (LM Studio) ou
 * son cluster (exo). Il ne coûte aucun frais d'API, seulement l'électricité et
 * la machine, que l'instance ne mesure pas et ne prétend pas mesurer.
 *
 * Tout backend compatible OpenAI ajouté par le profil de déploiement est tenu
 * pour distant, même s'il tourne en réalité dans la salle serveur du client :
 * l'instance ne peut pas le savoir. Dans ce cas, renseigner un tarif de 0 € le
 * dit explicitement, plutôt que de le supposer.
 */
export function estLocal(kind: BackendKind | string | undefined): boolean {
  return kind === "lmstudio" || kind === "exo";
}

/* ------------------------------------------------------------------ */
/* Registre                                                            */
/* ------------------------------------------------------------------ */

interface Compteurs {
  requetes: number;
  entree: number;
  sortie: number;
  /** Part de `sortie` passée à raisonner, quand le moteur la précise. */
  raisonnement: number;
}

interface Ligne {
  backend: string;
  local: boolean;
  /** Jetons lus dans la réponse du moteur. */
  exact: Compteurs;
  /** Jetons estimés faute de réponse du moteur. Jamais mêlés aux premiers. */
  estime: Compteurs;
}

/** Jour (AAAA-MM-JJ, heure de l'instance), puis compte, puis modèle (uid). */
type Jours = Record<string, Record<string, Record<string, Ligne>>>;

interface Registre {
  version: 1;
  jours: Jours;
}

interface Tarif {
  /** Euros par million de jetons d'entrée. */
  entree: number;
  /** Euros par million de jetons de sortie. */
  sortie: number;
  /** Horodatage ISO de la saisie. */
  depuis: string;
  /** Compte qui l'a saisi. */
  par: string;
}

/**
 * Compte sous lequel ranger une requête sans séance.
 *
 * L'écran Code passe par OpenCode, qui présente le jeton d'instance mais
 * aucune séance : l'instance ne sait pas qui parle. Ces requêtes sont
 * comptées quand même, pour ne pas fausser un total d'instance futur, mais ne
 * sont rendues à personne : les attribuer à quelqu'un serait inventer.
 */
const SANS_SEANCE = "sans-seance";

/**
 * Conservation : 13 mois.
 *
 * De quoi comparer un mois à celui de l'année précédente, pas davantage : un
 * journal qui grossit sans fin est réécrit à chaque requête, et finit par
 * peser sur chacune d'elles.
 */
const CONSERVATION_JOURS = 396;

/**
 * Un jeton vaut environ quatre caractères, pour le français comme pour
 * l'anglais, avec les tokeniseurs des modèles courants. C'est un ordre de
 * grandeur, et c'est pour cela que la mesure qui en sort porte la mention
 * « estimée ».
 */
const CARACTERES_PAR_JETON = 4;

const vide = (): Compteurs => ({ requetes: 0, entree: 0, sortie: 0, raisonnement: 0 });

/**
 * Jour calendaire à l'heure de l'instance.
 *
 * Pas l'heure universelle : une requête envoyée à 1 h du matin à Paris, en
 * été, tomberait sinon sur la veille, et « aujourd'hui » à l'écran ne serait
 * pas le même jour que celui de la personne qui regarde.
 */
function jourDe(date: Date): string {
  const a = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const j = String(date.getDate()).padStart(2, "0");
  return `${a}-${m}-${j}`;
}

/** Jour situé `n` jours avant `date`, en jours calendaires. */
function joursAvant(date: Date, n: number): Date {
  // Midi, pour qu'un changement d'heure ne fasse jamais sauter ou doubler un jour.
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setDate(d.getDate() - n);
  return d;
}

let registre: Registre | null = null;
let tarifs: Record<string, Tarif> | null = null;
let chargement: Promise<void> | null = null;

function estLigne(v: unknown): v is Ligne {
  return typeof v === "object" && v !== null && "exact" in v && "estime" in v;
}

/** Relit registre et tarifs, une fois. Un magasin illisible donne un registre vide. */
async function charger(): Promise<void> {
  if (chargement) return chargement;
  chargement = (async () => {
    try {
      const brut = (await db().read("usage")) as Registre | null;
      registre =
        brut && typeof brut === "object" && typeof brut.jours === "object"
          ? { version: 1, jours: brut.jours }
          : { version: 1, jours: {} };
    } catch (err) {
      console.error("[usage] registre illisible :", err instanceof Error ? err.message : err);
      registre = { version: 1, jours: {} };
    }
    try {
      const brut = await db().read("tarifs");
      tarifs = brut && typeof brut === "object" ? (brut as Record<string, Tarif>) : {};
    } catch (err) {
      console.error("[usage] tarifs illisibles :", err instanceof Error ? err.message : err);
      tarifs = {};
    }
  })();
  return chargement;
}

/*
 * Écritures coalescées.
 *
 * Une demande découpée enchaîne des dizaines de requêtes au moteur en quelques
 * secondes. Écrire le registre à chaque fois, en parallèle, ferait se croiser
 * les écritures. On n'en garde qu'une en cours ; celles qui arrivent pendant
 * sont fondues dans la suivante, qui part avec l'état le plus récent.
 */
let ecriture: Promise<void> | null = null;
let enAttente = false;

function persister(): void {
  if (ecriture) {
    enAttente = true;
    return;
  }
  ecriture = (async () => {
    try {
      do {
        enAttente = false;
        purger();
        await db().write("usage", registre);
      } while (enAttente);
    } catch (err) {
      // Une mesure perdue ne doit jamais faire tomber une conversation.
      console.error("[usage] registre non écrit :", err instanceof Error ? err.message : err);
    } finally {
      ecriture = null;
    }
  })();
}

/** Retire les jours au-delà de la conservation. */
function purger(): void {
  if (!registre) return;
  const limite = jourDe(joursAvant(new Date(), CONSERVATION_JOURS));
  for (const jour of Object.keys(registre.jours)) {
    if (jour < limite) delete registre.jours[jour];
  }
}

/* ------------------------------------------------------------------ */
/* Enregistrement d'une requête                                        */
/* ------------------------------------------------------------------ */

export interface Mesure {
  entree: number;
  sortie: number;
  raisonnement: number;
  /** Lue dans la réponse du moteur (vrai) ou estimée par les caractères (faux). */
  exacte: boolean;
}

/** Ajoute une requête au registre. Ne lève jamais d'exception. */
export function enregistrer(
  qui: string | undefined,
  model: Pick<ModelInfo, "uid" | "backendId" | "backendKind">,
  mesure: Mesure,
): void {
  void charger()
    .then(() => {
      if (!registre) return;
      const jour = jourDe(new Date());
      const compte = qui || SANS_SEANCE;
      const parCompte = (registre.jours[jour] ??= {});
      const parModele = (parCompte[compte] ??= {});
      const ligne = (parModele[model.uid] ??= {
        backend: model.backendId,
        local: estLocal(model.backendKind),
        exact: vide(),
        estime: vide(),
      });
      const cible = mesure.exacte ? ligne.exact : ligne.estime;
      cible.requetes += 1;
      cible.entree += mesure.entree;
      cible.sortie += mesure.sortie;
      cible.raisonnement += mesure.raisonnement;
      persister();
    })
    .catch((err: unknown) =>
      console.error("[usage] mesure perdue :", err instanceof Error ? err.message : err),
    );
}

/** `usage` au format OpenAI, s'il est présent et lisible. */
function lireUsage(valeur: unknown): Omit<Mesure, "exacte"> | null {
  if (!valeur || typeof valeur !== "object") return null;
  const u = valeur as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    completion_tokens_details?: { reasoning_tokens?: unknown } | null;
  };
  const entier = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  const entree = entier(u.prompt_tokens);
  const sortie = entier(u.completion_tokens);
  // Sans ces deux nombres, ce n'est pas une mesure : on retombera sur l'estimation.
  if (entree === null || sortie === null) return null;
  return {
    entree,
    sortie,
    raisonnement: entier(u.completion_tokens_details?.reasoning_tokens) ?? 0,
  };
}

/** Caractères de texte envoyés au moteur : ce sur quoi s'appuie l'estimation d'entrée. */
function caracteresEnvoyes(payload: Record<string, unknown>): number {
  let total = 0;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  for (const m of messages as { content?: unknown; tool_calls?: unknown }[]) {
    if (typeof m?.content === "string") total += m.content.length;
    else if (Array.isArray(m?.content)) {
      /*
       * Seul le texte compte. Une capture d'écran en base64 fait des
       * centaines de milliers de caractères : la compter ferait passer une
       * image pour un roman, et l'estimation serait fausse d'un facteur cent.
       */
      for (const p of m.content as { type?: string; text?: string }[]) {
        if (p?.type === "text" && typeof p.text === "string") total += p.text.length;
      }
    }
    if (Array.isArray(m?.tool_calls)) total += JSON.stringify(m.tool_calls).length;
  }
  // Les définitions d'outils partent avec chaque requête, et le moteur les lit.
  if (Array.isArray(payload.tools)) total += JSON.stringify(payload.tools).length;
  return total;
}

const enJetons = (caracteres: number) => Math.ceil(caracteres / CARACTERES_PAR_JETON);

/**
 * Relevé d'une requête au moteur, du départ à la fin de la réponse.
 *
 * On lui présente chaque fragment reçu ; il retient le dernier `usage` vu, et
 * compte au passage les caractères produits pour le cas où le moteur n'en
 * renverrait aucun. `clore()` enregistre, une seule fois.
 */
export class Releve {
  private readonly qui: string | undefined;
  private readonly model: Pick<ModelInfo, "uid" | "backendId" | "backendKind">;
  private readonly caracteresEntree: number;
  private usage: Omit<Mesure, "exacte"> | null = null;
  private caracteresSortie = 0;
  private caracteresRaisonnement = 0;
  private clos = false;

  // Champs explicites : Node exécute ce fichier en retirant simplement les
  // types, et ne gère pas les propriétés déclarées dans la signature.
  constructor(
    qui: string | undefined,
    model: Pick<ModelInfo, "uid" | "backendId" | "backendKind">,
    payload: Record<string, unknown>,
  ) {
    this.qui = qui;
    this.model = model;
    this.caracteresEntree = caracteresEnvoyes(payload);
  }

  /** Un fragment de flux (`chat.completion.chunk`). */
  observer(json: unknown): void {
    try {
      if (!json || typeof json !== "object") return;
      const fragment = json as {
        usage?: unknown;
        choices?: {
          delta?: {
            content?: unknown;
            reasoning_content?: unknown;
            tool_calls?: { function?: { name?: unknown; arguments?: unknown } }[];
          };
        }[];
      };
      /*
       * `usage` arrive dans un fragment à part, dont `choices` est vide. Il
       * est lu ici, avant tout le reste, pour qu'aucun test sur `choices` ne
       * puisse le faire sauter.
       */
      const lu = lireUsage(fragment.usage);
      if (lu) this.usage = lu;

      const delta = fragment.choices?.[0]?.delta;
      if (!delta) return;
      if (typeof delta.content === "string") this.caracteresSortie += delta.content.length;
      if (typeof delta.reasoning_content === "string") {
        this.caracteresRaisonnement += delta.reasoning_content.length;
      }
      for (const appel of delta.tool_calls ?? []) {
        const f = appel?.function;
        if (typeof f?.name === "string") this.caracteresSortie += f.name.length;
        if (typeof f?.arguments === "string") this.caracteresSortie += f.arguments.length;
      }
    } catch {
      /* une mesure ne doit jamais faire échouer la conversation */
    }
  }

  /** Une réponse complète (`stream: false`), comme celle de la planification. */
  observerReponse(json: unknown): void {
    try {
      if (!json || typeof json !== "object") return;
      const rep = json as {
        usage?: unknown;
        choices?: {
          message?: {
            content?: unknown;
            reasoning_content?: unknown;
            tool_calls?: { function?: { name?: unknown; arguments?: unknown } }[];
          };
        }[];
      };
      const message = rep.choices?.[0]?.message;
      this.observer({
        usage: rep.usage,
        choices: message ? [{ delta: message }] : [],
      });
    } catch {
      /* idem */
    }
  }

  /** Enregistre la requête : exacte si le moteur a parlé, estimée sinon. */
  clore(): void {
    if (this.clos) return;
    this.clos = true;
    const mesure: Mesure = this.usage
      ? { ...this.usage, exacte: true }
      : {
          entree: enJetons(this.caracteresEntree),
          sortie: enJetons(this.caracteresSortie + this.caracteresRaisonnement),
          raisonnement: enJetons(this.caracteresRaisonnement),
          exacte: false,
        };
    enregistrer(this.qui, this.model, mesure);
  }
}

/** Relève et enregistre une réponse complète (`stream: false`) en un appel. */
export function releverReponse(
  qui: string | undefined,
  model: Pick<ModelInfo, "uid" | "backendId" | "backendKind">,
  payload: Record<string, unknown>,
  reponse: unknown,
): void {
  const releve = new Releve(qui, model, payload);
  releve.observerReponse(reponse);
  releve.clore();
}

/**
 * Lit un flux SSE brut par morceaux, sans le modifier, et présente chaque
 * fragment JSON à `surJson`. Sert au relais, qui retransmet les octets tels
 * quels : on lit une copie, on ne touche jamais à ce qui part vers le client.
 */
export function lecteurSSE(surJson: (json: unknown) => void): (morceau: Uint8Array) => void {
  const decodeur = new TextDecoder();
  let tampon = "";
  return (morceau) => {
    try {
      tampon += decodeur.decode(morceau, { stream: true });
      const evenements = tampon.split(/\r?\n\r?\n/);
      tampon = evenements.pop() ?? "";
      for (const evenement of evenements) {
        for (const ligne of evenement.split(/\r?\n/)) {
          if (!ligne.startsWith("data:")) continue;
          const brut = ligne.slice(5).trim();
          if (!brut || brut === "[DONE]") continue;
          try {
            surJson(JSON.parse(brut));
          } catch {
            /* fragment illisible : le client en jugera, pas nous */
          }
        }
      }
    } catch {
      /* idem */
    }
  };
}

/* ------------------------------------------------------------------ */
/* `stream_options` : demandé, et abandonné si le moteur le refuse     */
/* ------------------------------------------------------------------ */

/** Backends qui ont refusé `stream_options` puis accepté la même requête sans. */
const refusStreamOptions = new Set<string>();

/**
 * Corps à envoyer au moteur, avec la demande de consommation quand elle a un
 * sens : en flux seulement. En `stream: false`, `usage` est de toute façon dans
 * la réponse, et OpenAI refuse `stream_options` hors flux.
 */
export function avecMesure(
  backendId: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (payload.stream !== true) {
    if (!("stream_options" in payload)) return payload;
    const { stream_options: _retire, ...sans } = payload;
    return sans;
  }
  if (refusStreamOptions.has(backendId)) return payload;
  const existant =
    payload.stream_options && typeof payload.stream_options === "object"
      ? (payload.stream_options as Record<string, unknown>)
      : {};
  return { ...payload, stream_options: { ...existant, include_usage: true } };
}

/** Le même corps, sans `stream_options` : pour le second essai. */
export function sansMesure(payload: Record<string, unknown>): Record<string, unknown> {
  const { stream_options: _retire, ...sans } = payload;
  return sans;
}

/**
 * Faut-il réessayer sans `stream_options` après ce code ?
 *
 * Un moteur qui ne connaît pas le champ répond 400 ou 422. Une erreur
 * d'authentification ou une limite de débit n'a rien à voir avec lui : les
 * rejouer ne ferait que doubler la charge.
 */
export function refusPossible(status: number): boolean {
  return status >= 400 && status < 500 && ![401, 403, 408, 429].includes(status);
}

/** Retient qu'un backend ne veut pas de `stream_options`, pour ne plus le lui envoyer. */
export function noterRefus(backendId: string): void {
  if (!refusStreamOptions.has(backendId)) {
    refusStreamOptions.add(backendId);
    console.log(
      `[usage] ${backendId} refuse stream_options : sa consommation sera estimée.`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Tarifs                                                              */
/* ------------------------------------------------------------------ */

/** Un euro par jeton : au-delà, c'est une faute de frappe, pas un tarif. */
const TARIF_MAX = 1_000_000;

/** Nature du modèle d'après son identifiant qualifié, même s'il est hors ligne. */
function backendDe(uid: string): { id: string; kind: BackendKind } | null {
  const id = uid.split("/")[0];
  const b = tousLesBackends().find((x) => x.id === id);
  return b ? { id: b.id, kind: b.kind } : null;
}

export type ResultatTarif = { ok: true } | { ok: false; raison: string };

/**
 * Renseigne, change ou retire le tarif d'un modèle distant.
 *
 * `entree` et `sortie` à `null` : le tarif est retiré, et l'écran repasse à
 * « tarif non renseigné ». Un modèle local est refusé : il n'a pas de frais
 * d'API, et un tarif saisi par erreur lui en inventerait.
 */
export async function definirTarif(
  corps: unknown,
  qui: string,
): Promise<ResultatTarif> {
  await charger();
  if (!tarifs) return { ok: false, raison: t("Tarifs illisibles sur cette instance.") };

  const c = (corps ?? {}) as { modele?: unknown; entree?: unknown; sortie?: unknown };
  if (typeof c.modele !== "string" || !c.modele.includes("/")) {
    return { ok: false, raison: t("« modele » doit être l'identifiant complet, par exemple « mistral/mistral-large ».") };
  }
  const backend = backendDe(c.modele);
  if (!backend) return { ok: false, raison: tf("Moteur inconnu pour « {0} ».", c.modele) };
  if (estLocal(backend.kind)) {
    return {
      ok: false,
      raison: t("Ce modèle est local : il n'a pas de frais d'API, il n'y a pas de tarif à renseigner."),
    };
  }

  const ancien = tarifs[c.modele] ?? null;

  if (c.entree === null && c.sortie === null) {
    delete tarifs[c.modele];
  } else {
    const valide = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= TARIF_MAX;
    if (!valide(c.entree) || !valide(c.sortie)) {
      return {
        ok: false,
        raison:
          t("Les deux prix sont requis, en euros par million de jetons, et doivent être des nombres positifs ou nuls."),
      };
    }
    tarifs[c.modele] = {
      entree: c.entree as number,
      sortie: c.sortie as number,
      depuis: new Date().toISOString(),
      par: qui,
    };
  }

  await db().write("tarifs", tarifs);
  journaliser("tarif.modifie", qui, {
    modele: c.modele,
    ancien: ancien ? { entree: ancien.entree, sortie: ancien.sortie } : null,
    nouveau: tarifs[c.modele]
      ? { entree: tarifs[c.modele].entree, sortie: tarifs[c.modele].sortie }
      : null,
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Rapport                                                             */
/* ------------------------------------------------------------------ */

export const PERIODES = ["jour", "semaine", "mois", "tout"] as const;
export type Periode = (typeof PERIODES)[number];

export function estPeriode(v: unknown): v is Periode {
  return typeof v === "string" && (PERIODES as readonly string[]).includes(v);
}

interface CompteursRendus extends Compteurs {
  /** Requêtes dont la consommation est estimée, et non lue dans la réponse. */
  requetesEstimees: number;
}

/**
 * Coût d'un modèle sur la période.
 *  - `gratuit`       : modèle local, aucun frais d'API ;
 *  - `non-renseigne` : modèle distant sans tarif, aucun montant n'est calculé ;
 *  - `calcule`       : jetons × tarif ; `estime` si une part des jetons l'est.
 */
type Cout =
  | { statut: "gratuit" }
  | { statut: "non-renseigne" }
  | { statut: "calcule"; montant: number; estime: boolean };

export interface Rapport {
  periode: Periode;
  du: string;
  au: string;
  totaux: CompteursRendus & {
    /** Somme des coûts calculés. */
    cout: number;
    /** Un coût au moins repose sur des jetons estimés. */
    coutEstime: boolean;
    /** Modèles distants utilisés sur la période et restés sans tarif. */
    sansTarif: number;
  };
  modeles: (CompteursRendus & {
    uid: string;
    backend: string;
    local: boolean;
    cout: Cout;
  })[];
  jours: { jour: string; entree: number; sortie: number; requetes: number }[];
  /** Modèles distants connus, pour la saisie des tarifs. */
  distants: { uid: string; backend: string; tarif: { entree: number; sortie: number; depuis: string } | null }[];
  conservationJours: number;
}

const fusion = (ligne: Ligne): CompteursRendus => ({
  requetes: ligne.exact.requetes + ligne.estime.requetes,
  entree: ligne.exact.entree + ligne.estime.entree,
  sortie: ligne.exact.sortie + ligne.estime.sortie,
  raisonnement: ligne.exact.raisonnement + ligne.estime.raisonnement,
  requetesEstimees: ligne.estime.requetes,
});

/**
 * Consommation d'un compte, et de lui seul, sur une période.
 *
 * Le compte vient de la séance, jamais d'un paramètre : il n'existe aucun
 * moyen, par cette fonction, de lire la consommation d'un collègue.
 */
export async function rapport(compte: string, periode: Periode): Promise<Rapport> {
  await charger();
  const jours = registre?.jours ?? {};
  const maintenant = new Date();
  const au = jourDe(maintenant);

  // « Tout » commence au premier jour où ce compte a consommé, pas treize mois
  // plus tôt : une courbe de quatre cents jours plats n'apprend rien.
  const premierJour =
    Object.keys(jours)
      .filter((j) => jours[j]?.[compte])
      .sort()[0] ?? au;
  const du =
    periode === "jour"
      ? au
      : periode === "semaine"
        ? jourDe(joursAvant(maintenant, 6))
        : periode === "mois"
          ? jourDe(joursAvant(maintenant, 29))
          : premierJour < au
            ? premierJour
            : au;

  // Tous les jours de la période, y compris ceux sans activité : un creux
  // dans la courbe est une information, un jour absent en est une autre.
  const serie: Rapport["jours"] = [];
  for (let d = joursAvant(maintenant, 0); jourDe(d) >= du; d = joursAvant(d, 1)) {
    serie.unshift({ jour: jourDe(d), entree: 0, sortie: 0, requetes: 0 });
  }

  const parModele = new Map<string, { backend: string; local: boolean; c: CompteursRendus }>();
  for (const point of serie) {
    const lignes = jours[point.jour]?.[compte];
    if (!lignes) continue;
    for (const [uid, ligne] of Object.entries(lignes)) {
      if (!estLigne(ligne)) continue;
      const f = fusion(ligne);
      point.entree += f.entree;
      point.sortie += f.sortie;
      point.requetes += f.requetes;
      const cumul = parModele.get(uid) ?? {
        backend: ligne.backend,
        local: ligne.local,
        c: { requetes: 0, entree: 0, sortie: 0, raisonnement: 0, requetesEstimees: 0 },
      };
      cumul.c.requetes += f.requetes;
      cumul.c.entree += f.entree;
      cumul.c.sortie += f.sortie;
      cumul.c.raisonnement += f.raisonnement;
      cumul.c.requetesEstimees += f.requetesEstimees;
      parModele.set(uid, cumul);
    }
  }

  const tableTarifs = tarifs ?? {};
  const modeles: Rapport["modeles"] = [...parModele.entries()]
    .map(([uid, { backend, local, c }]) => {
      let cout: Cout;
      if (local) cout = { statut: "gratuit" };
      else {
        const t = tableTarifs[uid];
        cout = t
          ? {
              statut: "calcule",
              montant: (c.entree * t.entree + c.sortie * t.sortie) / 1_000_000,
              estime: c.requetesEstimees > 0,
            }
          : { statut: "non-renseigne" };
      }
      return { uid, backend, local, ...c, cout };
    })
    .sort((a, b) => b.entree + b.sortie - (a.entree + a.sortie));

  const totaux: Rapport["totaux"] = {
    requetes: 0,
    entree: 0,
    sortie: 0,
    raisonnement: 0,
    requetesEstimees: 0,
    cout: 0,
    coutEstime: false,
    sansTarif: 0,
  };
  for (const m of modeles) {
    totaux.requetes += m.requetes;
    totaux.entree += m.entree;
    totaux.sortie += m.sortie;
    totaux.raisonnement += m.raisonnement;
    totaux.requetesEstimees += m.requetesEstimees;
    if (m.cout.statut === "calcule") {
      totaux.cout += m.cout.montant;
      if (m.cout.estime) totaux.coutEstime = true;
    } else if (m.cout.statut === "non-renseigne") totaux.sansTarif += 1;
  }

  /*
   * Modèles distants proposés à la saisie d'un tarif : ceux que l'instance
   * découvre en ce moment, ceux qui ont déjà un tarif, et ceux que **ce
   * compte** a utilisés et qui sont hors ligne aujourd'hui : un modèle utilisé
   * hier doit pouvoir être tarifé demain. Pas ceux des collègues : même sans
   * chiffre, la liste des modèles qu'une autre personne a sollicités ne
   * regarde qu'elle.
   */
  const distants = new Map<string, string>();
  try {
    for (const m of await models()) {
      if (!estLocal(m.backendKind)) distants.set(m.uid, m.backendId);
    }
  } catch {
    /* découverte indisponible : on s'en tient à ce qui a déjà servi */
  }
  for (const parCompte of Object.values(jours)) {
    for (const [uid, ligne] of Object.entries(parCompte[compte] ?? {})) {
      if (estLigne(ligne) && !ligne.local) distants.set(uid, ligne.backend);
    }
  }
  for (const uid of Object.keys(tableTarifs)) {
    const b = backendDe(uid);
    if (b) distants.set(uid, b.id);
  }

  return {
    periode,
    du,
    au,
    totaux,
    modeles,
    jours: serie,
    distants: [...distants.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([uid, backend]) => {
        const t = tableTarifs[uid];
        return {
          uid,
          backend,
          tarif: t ? { entree: t.entree, sortie: t.sortie, depuis: t.depuis } : null,
        };
      }),
    conservationJours: CONSERVATION_JOURS,
  };
}

/**
 * Consommation d'un compte, jour par jour et modèle par modèle, telle qu'elle
 * est enregistrée : pour l'export de ses données (droit d'accès). Même règle
 * que `rapport` : le compte vient de la séance, jamais d'un paramètre.
 */
export async function consommationDe(compte: string): Promise<{
  conservationJours: number;
  jours: Record<string, Record<string, CompteursRendus & { backend: string; local: boolean }>>;
}> {
  await charger();
  const sortie: Record<string, Record<string, CompteursRendus & { backend: string; local: boolean }>> = {};
  for (const [jour, parCompte] of Object.entries(registre?.jours ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const lignes = parCompte[compte];
    if (!lignes) continue;
    for (const [uid, ligne] of Object.entries(lignes)) {
      if (!estLigne(ligne)) continue;
      (sortie[jour] ??= {})[uid] = { backend: ligne.backend, local: ligne.local, ...fusion(ligne) };
    }
  }
  return { conservationJours: CONSERVATION_JOURS, jours: sortie };
}

/**
 * Efface la consommation d'un compte, tous jours confondus (droit à
 * l'effacement). Les totaux des collègues ne bougent pas : chaque ligne est
 * rangée par compte, rien n'est agrégé en dehors d'elle.
 */
export async function oublierCompte(compte: string): Promise<number> {
  await charger();
  let lignes = 0;
  for (const parCompte of Object.values(registre?.jours ?? {})) {
    if (parCompte[compte]) {
      lignes += Object.keys(parCompte[compte]!).length;
      delete parCompte[compte];
    }
  }
  if (lignes > 0) {
    persister();
    await ecriture;
  }
  return lignes;
}
