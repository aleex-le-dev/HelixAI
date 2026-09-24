import { storage, newId } from "./storage";
import type { User } from "./identity";
import { t, tf } from "@/lib/i18n";

/**
 * Compétences : des procédures écrites une fois, appliquées ensuite.
 *
 * ── Ce que c'est, et ce que ce n'est pas ────────────────────────────────────
 *
 * Une compétence n'est **pas** un outil. Les outils, ce sont les connecteurs :
 * du code qui lit un fichier, envoie un mail, ouvre une page. Une compétence
 * est une **manière de s'y prendre**, en français, que le modèle lit et suit :
 * « voici comment on rédige un compte rendu de visite chez nous », « voici les
 * mentions obligatoires d'un devis », « voici l'ordre des étapes pour
 * facturer ».
 *
 * C'est la réponse à la remarque qu'on entend dans toutes les entreprises :
 * l'assistant est bon, mais il ne sait pas **comment nous faisons**. Écrire
 * cette manière de faire une fois vaut mieux que la redire à chaque
 * conversation, et c'est exactement ce que le bouton « Créer une compétence »
 * promettait sans le tenir.
 *
 * ── Comment elle est utilisée ───────────────────────────────────────────────
 *
 * Le modèle reçoit, dans ses consignes, la liste des compétences actives : leur
 * nom, quand s'en servir, et leurs instructions. Il choisit lui-même celles qui
 * s'appliquent — c'est déjà le principe retenu pour le découpage des tâches
 * (ADR-035) : on ne code pas une règle de sélection que le modèle fait mieux.
 *
 * La liste envoyée est bornée (voir `consignesDesCompetences`) : des consignes
 * qui débordent chassent la question de l'utilisateur hors de la fenêtre du
 * modèle, et un petit modèle est le premier à en souffrir.
 */

export type VisibiliteCompetence = "personnel" | "organisation";

export interface Competence {
  id: string;
  nom: string;
  /** Quand s'en servir : c'est là-dessus que le modèle décide. */
  quand: string;
  /** La procédure elle-même, en français. */
  instructions: string;
  /** Une compétence inactive est conservée mais n'est plus envoyée au modèle. */
  active: boolean;
  visibilite: VisibiliteCompetence;
  ownerId: string;
  organisationId: string;
  createdAt: string;
  updatedAt: string;
}

const CLE = "competences";

function toutes(): Competence[] {
  const brut = storage.get<Competence[]>(CLE, []);
  // Une collection synchronisée peut arriver abîmée d'un poste plus ancien.
  return Array.isArray(brut) ? brut.filter((c) => c && typeof c.id === "string") : [];
}

function ecrire(liste: Competence[]): void {
  storage.set(CLE, liste);
}

/** Les siennes, plus celles publiées dans l'organisation. */
export function competencesVisibles(user: User): Competence[] {
  return toutes()
    .filter(
      (c) =>
        c.ownerId === user.id ||
        (c.visibilite === "organisation" && c.organisationId === user.organisationId),
    )
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

export function competence(id: string): Competence | undefined {
  return toutes().find((c) => c.id === id);
}

export function creerCompetence(
  proprietaire: User,
  donnees: Pick<Competence, "nom" | "quand" | "instructions" | "visibilite">,
): Competence {
  const maintenant = new Date().toISOString();
  const nouvelle: Competence = {
    id: newId(),
    nom: donnees.nom.trim() || t("Compétence sans nom"),
    quand: donnees.quand.trim(),
    instructions: donnees.instructions.trim(),
    active: true,
    visibilite: donnees.visibilite,
    ownerId: proprietaire.id,
    organisationId: proprietaire.organisationId,
    createdAt: maintenant,
    updatedAt: maintenant,
  };
  ecrire([nouvelle, ...toutes()]);
  return nouvelle;
}

export function modifierCompetence(id: string, changements: Partial<Competence>): void {
  ecrire(
    toutes().map((c) =>
      c.id === id ? { ...c, ...changements, updatedAt: new Date().toISOString() } : c,
    ),
  );
}

export function supprimerCompetence(id: string): void {
  ecrire(toutes().filter((c) => c.id !== id));
}

/**
 * Limites de ce qui part dans les consignes.
 *
 * Elles ne sont pas décoratives. Les consignes sont renvoyées **à chaque tour**
 * de la conversation : ce qu'on y met est payé à chaque message, et prend la
 * place du travail en cours. Un modèle de 8 milliards de paramètres, qui est le
 * cas courant sur un poste, tient environ 8 000 jetons de contexte utile ; on
 * s'interdit donc d'en consommer plus d'une petite part.
 *
 * Quand la limite est atteinte, on tronque **par compétence entière** et on le
 * dit dans les consignes : une procédure coupée au milieu est pire qu'une
 * procédure absente, parce que le modèle en suit la moitié avec assurance.
 */
const MAX_COMPETENCES = 12;
const MAX_CARACTERES = 6000;

/**
 * Le bloc de consignes décrivant les compétences actives, ou null s'il n'y en
 * a aucune. Rendu séparément pour être testable sans monter d'interface.
 */
export function consignesDesCompetences(liste: Competence[]): string | null {
  const actives = liste.filter((c) => c.active && c.instructions.trim());
  if (actives.length === 0) return null;

  const retenues: Competence[] = [];
  let taille = 0;
  let ecartees = 0;
  for (const c of actives.slice(0, MAX_COMPETENCES)) {
    const cout = c.nom.length + c.quand.length + c.instructions.length + 40;
    if (taille + cout > MAX_CARACTERES) {
      ecartees++;
      continue;
    }
    retenues.push(c);
    taille += cout;
  }
  ecartees += Math.max(0, actives.length - MAX_COMPETENCES);
  if (retenues.length === 0) return null;

  const blocs = retenues.map((c) =>
    [
      `### ${c.nom}`,
      c.quand ? `Quand : ${c.quand}` : "",
      c.instructions,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    t("Procédures de l'entreprise. Avant de répondre, regarde si l'une d'elles ") +
      t("s'applique à la demande ; si oui, suis-la à la lettre. Si aucune ne ") +
      t("s'applique, n'en parle pas et réponds normalement."),
    ...blocs,
    ecartees > 0
      ? tf("({0} autre(s) procédure(s) existent mais ne tiennent pas ici. ", ecartees) +
        t("Dis-le si la demande semble en relever.)")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
