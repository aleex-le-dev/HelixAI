import { deployment } from "./deployment.ts";
import { publicAccounts } from "./accounts.ts";

/**
 * Qui administre cette instance.
 *
 * ── Pourquoi c'est arrivé tard, et volontairement petit ─────────────────────
 *
 * La passerelle n'avait aucune notion de rôle, et c'était tenable tant que
 * chaque route ne rendait à chacun que ses propres données. Une chose y
 * échappait : le **journal d'audit**. Rendu en entier, il donnait à chaque
 * salarié la carte de l'activité de ses collègues ; cloisonné (0.22.0), il ne
 * laissait plus personne constater l'état de l'instance. Les deux sont
 * mauvais. Il fallait donc savoir dire « cette personne en répond ».
 *
 * ── Comment l'administrateur est désigné ────────────────────────────────────
 *
 * 1. Le **profil de déploiement** le dit : `administrateurs: ["…@…"]` dans
 *    `helix.config.json`. C'est un fichier posé sur la machine hôte par
 *    l'intégrateur, jamais modifiable par une requête. C'est la voie d'une
 *    instance d'entreprise.
 * 2. À défaut, le **premier compte créé** sur l'instance : celle ou celui qui
 *    l'a mise en route. Sur un poste personnel, c'est l'unique compte, et la
 *    question ne se pose pas. Sur une instance qu'on a montée sans profil,
 *    c'est la personne qui l'a montée.
 *
 * Ce rôle **n'ouvre aucune donnée personnelle** : ni les conversations, ni les
 * documents, ni les mails de qui que ce soit. Il ouvre la vue d'ensemble du
 * journal, c'est-à-dire des traces d'actions, et rien d'autre. Toute extension
 * de ce rôle doit être pesée ici, et écrite.
 */

const normalise = (adresse: unknown): string =>
  typeof adresse === "string" ? adresse.trim().toLowerCase() : "";

/** Adresses déclarées administratrices par le profil de déploiement. */
function declarees(): string[] {
  const brut = (deployment() as { administrateurs?: unknown }).administrateurs;
  if (!Array.isArray(brut)) return [];
  return brut.map(normalise).filter(Boolean);
}

/** Cette personne administre-t-elle l'instance ? */
export async function estAdministrateur(accountId: string): Promise<boolean> {
  const comptes = await publicAccounts();
  const compte = comptes.find((c) => c.id === accountId);
  if (!compte) return false;

  const liste = declarees();
  if (liste.length > 0) return liste.includes(normalise(compte.email));

  /*
   * Aucun profil : le compte le plus ancien. `createdAt` est posé à la
   * création et n'est modifiable par aucune route (les comptes ne s'écrivent
   * pas par la synchronisation, voir handleDataWrite).
   */
  const premier = [...comptes].sort((a, b) =>
    String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
  )[0];
  return Boolean(premier && premier.id === accountId);
}

/** Comment le rôle a été attribué, pour que l'écran puisse le dire. */
export async function origineDuRole(accountId: string): Promise<"profil" | "premier" | null> {
  if (!(await estAdministrateur(accountId))) return null;
  return declarees().length > 0 ? "profil" : "premier";
}
