import type { LucideIcon } from "lucide-react";
import { Mail, Calendar, Bot, SquareCheck, MailOpen, CalendarClock } from "lucide-react";
import { etat as etatCourrier } from "@/lib/courrier";
import { etat as etatAgenda } from "@/lib/agenda";
import { t } from "@/lib/i18n";

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
 */

export type Suggestion =
  | { icone: LucideIcon; libelle: string; genre: "aller"; chemin: string }
  | { icone: LucideIcon; libelle: string; genre: "demander"; question: string; outils: true };

export async function suggestionsDuMoment(): Promise<Suggestion[]> {
  const [courrier, agenda] = await Promise.all([
    etatCourrier().catch(() => null),
    etatAgenda().catch(() => null),
  ]);

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

  liste.push(
    { icone: Bot, libelle: t("Créer votre premier agent"), genre: "aller", chemin: "/agents" },
    { icone: SquareCheck, libelle: t("Créer une tâche à confier à un agent"), genre: "aller", chemin: "/taches" },
  );

  return liste;
}
