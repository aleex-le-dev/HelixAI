import type { LucideIcon } from "lucide-react";
import { Mail, Calendar, Bot, SquareCheck, MailOpen, CalendarClock, BookOpenText, CalendarX, Import } from "lucide-react";
import { etat as etatCourrier } from "@/lib/courrier";
import { etat as etatAgenda } from "@/lib/agenda";
import { listerBases } from "@/lib/connaissances";
import { visibleTo as agentsVisibles } from "@/lib/store/agents";
import { estClose, jourDe, situation, visibleTo as tachesVisibles } from "@/lib/store/tasks";
import { visibleTo as sessionsVisibles } from "@/lib/store/sessions";
import { currentUser } from "@/lib/store/identity";
import { t, tf } from "@/lib/i18n";

/**
 * Suggestions de l'écran d'accueil.
 *
 * Elles vivaient dans `src/data/mock/` et n'étaient que des libellés : cliquer
 * « Connecter votre messagerie » tapait cette phrase dans le Chat, sans rien
 * connecter. Deux d'entre elles proposaient des fonctions inexistantes (une
 * réunion à enregistrer, une automatisation à créer).
 *
 * Désormais une suggestion fait l'une de deux choses, toujours réelle : elle
 * mène à l'écran qui accomplit l'action, ou elle pose au Chat une question
 * qu'il sait traiter avec les outils branchés. Et elle s'adapte à ce qui est
 * configuré : tant que la boîte aux lettres n'est pas branchée, on propose de
 * la brancher ; une fois branchée, on propose de s'en servir.
 *
 * Depuis le 25/09/2026, les agents, les tâches et les bases de connaissances
 * suivent la même règle : « Créer votre premier agent » restait affiché à qui
 * en avait déjà cinq. Une suggestion déjà faite laisse place à la suivante.
 */

export type Suggestion =
  | { icone: LucideIcon; libelle: string; genre: "aller"; chemin: string }
  | { icone: LucideIcon; libelle: string; genre: "demander"; question: string; outils: true }
  /** Attache la base à la zone de saisie : la question suivante y cherche. */
  | { icone: LucideIcon; libelle: string; genre: "base"; base: string };

/** Quatre au plus : au-delà, la liste se lit comme un menu, plus comme une idée. */
const NOMBRE = 4;

/*
 * Toujours pertinentes (demandé par Medhi le 25/09/2026). Chaque suggestion
 * n'apparaît que si elle correspond à l'état réel du poste, et elles sont
 * rangées de la plus utile à la moins utile, pour n'en garder que quatre :
 *  1. ce qui attend la personne (tâches en retard, puis tâches ouvertes) ;
 *  2. se servir de ce qui est déjà branché (une base, le courrier, l'agenda) ;
 *  3. pour un tout nouveau poste, reprendre ses Chats d'une autre IA ;
 *  4. brancher ce qui manque, puis créer un premier agent ou une tâche.
 * Ce qui est déjà fait ne revient pas : « Créer votre premier agent » restait
 * affiché à qui en avait cinq.
 */
export async function suggestionsDuMoment(): Promise<Suggestion[]> {
  const [courrier, agenda, bases] = await Promise.all([
    etatCourrier().catch(() => null),
    etatAgenda().catch(() => null),
    listerBases().catch(() => null),
  ]);
  const moi = currentUser();
  const agents = agentsVisibles(moi);
  const ouvertes = tachesVisibles(moi).filter((x) => !estClose(x));
  const aujourdhui = jourDe(new Date());
  const enRetard = ouvertes.filter((x) => situation(x, aujourdhui) === "retard").length;
  const chats = sessionsVisibles(moi).length;

  const liste: Suggestion[] = [];

  if (enRetard > 0) {
    liste.push({ icone: CalendarX, libelle: enRetard === 1 ? t("Voir votre tâche en retard") : tf("Voir vos {0} tâches en retard", enRetard), genre: "aller", chemin: "/taches" });
  } else if (ouvertes.length > 0) {
    liste.push({ icone: SquareCheck, libelle: ouvertes.length === 1 ? t("Reprendre votre tâche ouverte") : tf("Reprendre vos {0} tâches ouvertes", ouvertes.length), genre: "aller", chemin: "/taches" });
  }

  // La base la plus récemment modifiée : c'est celle qu'on vient de remplir.
  const base = [...(bases ?? [])]
    .filter((b) => b.documents.some((d) => d.etat === "pret"))
    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0];
  if (base) liste.push({ icone: BookOpenText, libelle: tf("Poser une question à « {0} »", base.nom), genre: "base", base: base.id });

  if (courrier?.configure) {
    liste.push({
      icone: MailOpen,
      libelle: t("Résumer mes derniers mails"),
      genre: "demander",
      question: t("Résume mes derniers mails, en signalant ceux qui attendent une réponse."),
      outils: true,
    });
  }
  if (agenda?.configure) {
    liste.push({
      icone: CalendarClock,
      libelle: t("Voir mes rendez-vous de la semaine"),
      genre: "demander",
      question: t("Qu'est-ce que j'ai dans mon agenda cette semaine ?"),
      outils: true,
    });
  }

  // Un poste neuf, sans aucun Chat : son historique est peut-être ailleurs.
  if (chats === 0) liste.push({ icone: Import, libelle: t("Reprendre vos Chats d'une autre IA"), genre: "aller", chemin: "/parametres/importer" });

  if (!courrier?.configure && courrier !== null) liste.push({ icone: Mail, libelle: t("Connecter votre messagerie"), genre: "aller", chemin: "/parametres/mcp" });
  if (!agenda?.configure && agenda !== null) liste.push({ icone: Calendar, libelle: t("Connecter votre agenda"), genre: "aller", chemin: "/parametres/mcp" });

  if (agents.length === 0) {
    liste.push({ icone: Bot, libelle: t("Créer votre premier agent"), genre: "aller", chemin: "/agents" });
  } else if (ouvertes.length === 0) {
    liste.push({ icone: SquareCheck, libelle: t("Créer une tâche à confier à un agent"), genre: "aller", chemin: "/taches" });
  }

  // Aucune base prête et l'instance répond : en créer une (une base vide ou en cours d'indexation n'a rien à dire).
  if (!base && bases) liste.push({ icone: BookOpenText, libelle: t("Créer une base de connaissances"), genre: "aller", chemin: "/bibliotheque?vue=connaissances" });

  return liste.slice(0, NOMBRE);
}
