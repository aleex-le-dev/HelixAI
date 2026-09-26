import { annuler, fermerDemande, modifie, ouvrirDemande, verifierOutil } from "./approbation.ts";
import { journaliser } from "./audit.ts";
import { sessionCode } from "./sessionsCode.ts";
import { t, tf } from "./langue.ts";
import { cheminReel, estProtege } from "./zonesProtegees.ts";

/**
 * Les demandes d'autorisation d'OpenCode, passées par la barrière de Helix.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Revue de sécurité du 25/09/2026, point critique : les outils livrés
 * d'OpenCode (`bash`, `edit`, `write`, `apply_patch`, `webfetch`) agissaient
 * sans jamais demander, parce que ses défauts sont « tout permis », et la
 * passerelle refusait d'office toute demande d'autorisation qui aurait pu
 * passer. Une commande lancée par l'agent a les droits du compte qui fait
 * tourner l'instance : c'était la plus grande porte de Helix, et la seule sans
 * barrière.
 *
 * Désormais la configuration d'OpenCode fait tout demander (opencode.ts,
 * `permission`), et chaque demande (`permission.asked`, lue par fluxCode.ts)
 * arrive ici :
 *
 *  1. sa session est cherchée au registre (sessionsCode.ts) : c'est **la
 *     propriétaire de la session** qui reçoit la carte, et personne d'autre.
 *     Session inconnue du registre, ou registre illisible : refus sans carte ;
 *  2. la demande devient un appel d'outil `code__<permission>` soumis à
 *     `verifierOutil`, au niveau choisi pour l'instance : en « Demander avant
 *     de modifier », lire et chercher passent sans carte, modifier, lancer une
 *     commande ou aller sur le réseau demandent ; en « Tout approuver », rien
 *     ne demande (sauf ce que la barrière demande toujours) ;
 *  3. la réponse revient à OpenCode par sa route de réponse
 *     (`POST /permission/<id>/reply`, relevée dans l'API de la version 1.18.32
 *     le 26/09/2026 : `{ reply: "once" | "always" | "reject", message? }` ;
 *     l'ancienne route `/session/<id>/permissions/<id>` y est marquée
 *     obsolète). Jamais « always » : un accord ne vaut que pour cette
 *     demande, OpenCode ne retient rien. Un refus part avec le message que lit
 *     l'agent, qui poursuit sans l'action.
 *
 * Portée d'un accord : la mémoire de la barrière (`ouvrirDemande`) dure un
 * tour de la session, comme une demande du Chat. Une écriture approuvée dans
 * un dossier couvre les suivantes du même dossier pendant ce tour ; une
 * commande ne couvre que la même commande, mot pour mot.
 */

/** Ce qu'OpenCode 1.18.32 met dans `permission.asked` (schéma `PermissionRequest` de son API). */
export interface DemandeOpenCode {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
}

/** Mémoire de la barrière pour le tour en cours de chaque session racine. */
const tours = new Map<string, string>();
const TOURS_MAX = 200;

/** Une nouvelle demande part dans cette session : les accords du tour précédent ne valent plus. */
export function nouveauTourCode(sessionID: string): void {
  const ancien = tours.get(sessionID);
  if (ancien) fermerDemande(ancien);
  tours.delete(sessionID);
  if (tours.size >= TOURS_MAX) {
    const [plusVieux, contexte] = tours.entries().next().value!;
    fermerDemande(contexte);
    tours.delete(plusVieux);
  }
  tours.set(sessionID, ouvrirDemande());
}

/** Demandes posées à la barrière et encore sans réponse : identifiant OpenCode → carte de Helix. */
const enCours = new Map<string, string>();

/** OpenCode a tranché lui-même (session arrêtée, demande abandonnée) : la carte n'a plus d'objet. */
export function permissionRepondueAilleurs(idOpenCode: string): void {
  const carte = enCours.get(idOpenCode);
  if (carte) annuler(carte);
}

const texte = (v: unknown, max = 4000): string => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Au-delà, une commande n'est pas soumise : refusée sans carte, l'agent la
 * découpe. Revue de sécurité du 26/09/2026 : la carte coupait à 4000
 * caractères, et un `curl` placé après un long texte partait sans avoir été
 * montré ; deux commandes au même début partageaient aussi le même accord.
 */
export const COMMANDE_MAX = 20_000;

/**
 * Traduit une demande d'OpenCode en appel d'outil pour la barrière :
 * `code__bash` + `{ commande }`, `code__edit` + `{ path }`, etc. Le chemin
 * visé passe par `path`, que la barrière sait lire (portée par dossier).
 */
export function outilDe(d: DemandeOpenCode, dossier: string): { outil: string; args: Record<string, unknown> } {
  const m = d.metadata ?? {};
  const motif = d.patterns?.[0];
  const outil = `code__${d.permission.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 60)}`;
  switch (d.permission) {
    case "bash":
      // Entière (un caractère de plus que le maximum, pour savoir qu'elle le dépasse) : la carte et l'accord portent sur toute la commande.
      return { outil, args: { commande: texte(m.command, COMMANDE_MAX + 1) || texte(motif, COMMANDE_MAX + 1), dossier } };
    case "edit":
    case "write":
    case "apply_patch": {
      const chemin = texte(m.filepath) || texte(m.filePath) || texte(motif);
      return { outil, args: { path: chemin && !chemin.startsWith("/") ? `${dossier}/${chemin}` : chemin } };
    }
    case "webfetch":
      return { outil, args: { url: texte(m.url) || texte(motif) } };
    case "websearch":
    case "codesearch":
      return { outil, args: { requete: texte(m.query) || texte(motif) } };
    default: {
      const chemin = texte(m.filepath) || texte(m.path) || texte(motif);
      return { outil, args: chemin ? { path: chemin.startsWith("/") || chemin.includes("*") ? chemin : `${dossier}/${chemin}` } : {} };
    }
  }
}

/**
 * Traite une demande d'autorisation d'OpenCode. `racine` : la session suivie
 * qui a lancé celle-ci (elle-même, ou le parent d'un sous-agent) ;
 * `repondre` : envoie la réponse à OpenCode (fluxCode.ts).
 */
export async function traiterPermissionCode(
  d: DemandeOpenCode,
  racine: string,
  dossier: string,
  repondre: (reponse: { reply: "once" | "reject"; message?: string }) => void,
): Promise<void> {
  const refuser = (cause: string, message: string, qui = "systeme") => {
    journaliser("outil.refuse", qui, { surface: "code", cause, permission: d.permission, session: d.sessionID });
    repondre({ reply: "reject", message });
  };

  let proprietaire: string | undefined;
  try {
    proprietaire = (await sessionCode(d.sessionID))?.userId ?? (await sessionCode(racine))?.userId;
  } catch {
    return refuser("registre-illisible", t("Refusé par l'instance : son registre des sessions de code est illisible, elle ne sait pas pour qui tu travailles."));
  }
  if (!proprietaire) {
    return refuser("session-inconnue", t("Refusé par l'instance : cette session de code n'est inscrite au nom de personne."));
  }

  const { outil, args } = outilDe(d, dossier);
  if (typeof args.commande === "string" && args.commande.length > COMMANDE_MAX) {
    return refuser("commande-trop-longue", tf("Refusé par l'instance : cette commande dépasse {0} caractères, elle ne peut pas être montrée en entier pour accord. Découpe-la, ou écris d'abord un fichier puis lance-le.", String(COMMANDE_MAX)), proprietaire);
  }
  /*
   * Une zone protégée (zonesProtegees.ts : données de l'instance, `~/.helix`,
   * clés, réglages d'autres logiciels) ne se lit ni ne s'écrit, même avec un
   * accord : refus sans carte. Chemin réel, liens résolus : un lien posé dans
   * le projet vers `~/.ssh` est refusé comme sa cible. Une commande (`bash`)
   * ne se borne pas par des chemins : sa carte la montre entière.
   */
  if (typeof args.path === "string" && args.path) {
    const sansMotif = args.path.split(/[*?[{]/)[0]!;
    if (estProtege(cheminReel(sansMotif || args.path))) {
      return refuser("zone-protegee", t("Refusé par l'instance : ce chemin est dans une zone protégée (données de l'instance, clés, réglages d'autres logiciels). Aucun accord ne l'ouvre."), proprietaire);
    }
  }
  const contexte = tours.get(racine) ?? null;
  const promesse = verifierOutil(contexte, outil, args, proprietaire, undefined, false, "code", (carte) => enCours.set(d.id, carte));
  let verdict;
  try {
    verdict = await promesse;
  } finally {
    enCours.delete(d.id);
  }
  if (verdict.autorise) {
    // Au journal, ce qui agit (commande, écriture, réseau) ; pas chaque lecture accordée d'office.
    if (modifie(outil)) journaliser("outil.appele", proprietaire, { outil, surface: "code", session: d.sessionID });
    return repondre({ reply: "once" });
  }
  repondre({ reply: "reject", message: verdict.message });
}
