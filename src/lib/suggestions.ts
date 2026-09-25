import type { LucideIcon } from "lucide-react";
import { Mail, Calendar, Bot, SquareCheck, MailOpen, CalendarClock, BookOpenText } from "lucide-react";
import { etat as etatCourrier } from "@/lib/courrier";
import { etat as etatAgenda } from "@/lib/agenda";
import { listerBases } from "@/lib/connaissances";
import { visibleTo as agentsVisibles } from "@/lib/store/agents";
import { visibleTo as tachesVisibles } from "@/lib/store/tasks";
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
  | { icone: LucideIcon; libelle: string; genre: "demander"; question: string; outils: true };

export async function suggestionsDuMoment(): Promise<Suggestion[]> {
  const [courrier, agenda, bases] = await Promise.all([
    etatCourrier().catch(() => null),
    etatAgenda().catch(() => null),
    listerBases().catch(() => null),
  ]);
  const moi = currentUser();
  const agents = agentsVisibles(moi);
  const taches = tachesVisibles(moi);

  const liste: Suggestion[] = [];

  if (courrier?.configure) {
    liste.push({
      icone: MailOpen,
      libelle: t("Résumer mes derniers mails"),
      genre: "demander",
      question: t("Résume mes derniers mails, en signalant ceux qui attendent une réponse."),
      outils: true,
    });
  } else {
    liste.push({
      icone: Mail,
      libelle: t("Connecter votre messagerie"),
      genre: "aller",
      chemin: "/parametres/mcp",
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
  } else {
    liste.push({
      icone: Calendar,
      libelle: t("Connecter votre agenda"),
      genre: "aller",
      chemin: "/parametres/mcp",
    });
  }

  // Une base : on propose de l'interroger ; aucune : d'en créer une. Instance injoignable : rien.
  if (bases && bases.length > 0) {
    liste.push({
      icone: BookOpenText,
      libelle: tf("Interroger « {0} »", bases[0]!.nom),
      genre: "aller",
      chemin: "/bibliotheque?vue=connaissances",
    });
  } else if (bases) {
    liste.push({ icone: BookOpenText, libelle: t("Créer une base de connaissances"), genre: "aller", chemin: "/bibliotheque?vue=connaissances" });
  }

  if (agents.length === 0) {
    liste.push({ icone: Bot, libelle: t("Créer votre premier agent"), genre: "aller", chemin: "/agents" });
  } else if (taches.length === 0) {
    liste.push({ icone: SquareCheck, libelle: t("Créer une tâche à confier à un agent"), genre: "aller", chemin: "/taches" });
  } else {
    liste.push({ icone: SquareCheck, libelle: t("Voir où en sont vos tâches"), genre: "aller", chemin: "/taches" });
  }

  return liste;
}
