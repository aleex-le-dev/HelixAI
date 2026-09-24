import { branding, features } from "@/config/branding";
import { t, tf } from "@/lib/i18n";

/**
 * Aide intégrée.
 *
 * Elle est **dans l'application**, pas sur un site : une plateforme souveraine
 * qui n'a pas besoin d'Internet pour fonctionner ne doit pas en avoir besoin
 * pour s'expliquer. Les articles sont du texte, écrits ici, et suivent la
 * version livrée ; un module désactivé n'a pas d'article.
 *
 * Règle de rédaction : décrire ce que le logiciel fait **vraiment**, y compris
 * ses limites. Une aide qui promet plus que le produit fait perdre plus de
 * temps qu'elle n'en fait gagner.
 */

export interface Article {
  id: string;
  titre: string;
  /** Une phrase, affichée dans la liste. */
  resume: string;
  /** Corps de l'article : paragraphes et listes à puces (« - » en début de ligne). */
  corps: string;
  /** Mots que quelqu'un taperait pour trouver cet article. */
  motsCles: string[];
  /** Écran concerné, ouvert depuis l'article. */
  lien?: string;
  /** Article retenu seulement si son module est livré. */
  module?: keyof typeof features;
}

const ARTICLES: Article[] = [
  {
    id: "demarrer",
    titre: t("Premiers pas"),
    resume: tf("Ce que {0} fait, et par où commencer.", branding.name),
    motsCles: ["debut", "commencer", "accueil", "decouvrir", "premier"],
    lien: "/",
    corps: tf("{0} fait tourner des modèles d'IA sur votre matériel ou sur l'instance de votre organisation. Rien ne part vers un service tiers tant que vous n'avez pas branché vous-même une clé chez un fournisseur.\n\nPour commencer :\n- ouvrez un Chat et posez votre question ; le modèle utilisé est indiqué sous le champ de saisie, avec son pays d'hébergement ;\n- déposez un document dans Fichiers pour que les agents puissent s'y référer ;\n- réglez le niveau d'accord dans Réglages, Sécurité : c'est lui qui décide de ce qu'un agent peut faire sans vous demander.\n\nTout ce que vous écrivez reste sur votre poste et sur votre instance. Fermer l'application n'efface rien.", branding.name),
  },
  {
    id: "chats",
    titre: t("Chats : archiver, supprimer, partager"),
    resume: t("Ranger vos conversations sans rien perdre."),
    motsCles: ["chat", "conversation", "archive", "archiver", "supprimer", "partager", "ranger"],
    lien: "/",
    corps: t("Chaque chat de la barre latérale porte trois actions, visibles au survol.\n\n- Partager : vous invitez une personne par son adresse. Elle voit la conversation, elle ne peut pas la ranger à votre place.\n- Archiver : le chat quitte la liste et se retrouve sous « Archivés », en bas. Rien n'est effacé, et un clic le remet en place. L'archivage est personnel : archiver un chat partagé ne le retire pas de la liste des autres.\n- Supprimer : les messages sont effacés pour de bon. Il n'y a pas de corbeille ; archivez plutôt si vous hésitez.\n\nUn chat peut aussi être rangé dans un Projet, depuis le champ de saisie. Ce classement ne partage rien : il ne fait qu'ordonner votre propre écran."),
  },
  {
    id: "modeles",
    titre: t("Choisir un modèle"),
    resume: t("Local, instance, ou fournisseur avec votre clé."),
    motsCles: ["modele", "llm", "local", "cloud", "cle", "api", "pays", "souverain"],
    lien: "/parametres/modeles",
    corps: t("Trois origines, toujours affichées telles quelles :\n\n- local : le modèle tourne sur votre machine. Rien ne sort du poste. C'est le plus lent sur une grosse demande, et le plus sûr.\n- instance : le modèle tourne sur le serveur de votre organisation.\n- clé : vous avez branché votre propre compte chez un fournisseur. La demande part chez lui, et le pays d'hébergement est indiqué à côté du nom.\n\nAucun modèle distant n'est choisi à votre place. Si vous n'avez branché aucune clé, rien ne quitte votre installation."),
  },
  {
    id: "accords",
    titre: t("Accords : ce qu'un agent peut faire seul"),
    resume: t("Le garde-fou entre le modèle et vos fichiers, vos mails, votre écran."),
    motsCles: ["accord", "approbation", "permission", "securite", "autonomie", "garde-fou"],
    lien: "/parametres/securite",
    corps: t("Trois niveaux, réglables à tout moment :\n\n- Demander à chaque action : rien ne se fait sans un clic de votre part.\n- Demander avant de modifier : lire est libre, écrire, déplacer, supprimer et envoyer demandent votre accord. C'est le réglage par défaut.\n- Tout approuver : l'agent travaille sans vous interrompre.\n\nDeux exceptions, qu'aucun réglage ne lève :\n- l'envoi d'un mail demande toujours votre accord, sauf si vous avez activé vous-même l'option « Envoyer sans me demander » dans le connecteur courrier ;\n- un agent déclenché par un mail reçu ne peut jamais envoyer un mail sans vous le montrer, même avec cette option. Un message venu de l'extérieur ne doit pas pouvoir commander votre boîte.\n\nChaque action demandée apparaît sur une carte qui dit exactement ce qui va se passer, et dans le journal d'audit une fois faite."),
  },
  {
    id: "documents",
    titre: t("Fichiers et documents"),
    resume: t("Déposer des fichiers, et ce que les agents en font."),
    motsCles: ["document", "bibliotheque", "fichier", "pdf", "taille", "televersement", "chiffrement"],
    lien: "/bibliotheque",
    module: "bibliotheque",
    corps: t("Les documents sont chiffrés sur l'instance, y compris les gros : ils partent par tranches, chacune scellée séparément, ce qui permet de déposer jusqu'à 1 Go par fichier (2 Go pour un enregistrement de réunion).\n\n- Visibilité : privé, un ou plusieurs groupes, ou toute l'organisation. Elle se change après coup.\n- Les agents lisent un document par passages, pas d'un bloc : une note de 300 pages ne sature pas la mémoire du modèle, mais il faudra parfois lui dire où chercher.\n- L'extraction de texte (PDF, bureautique) s'arrête à 100 Mo par fichier. Au-delà, le fichier est bien stocké, mais son texte n'est pas indexé."),
  },
  {
    id: "agents",
    titre: t("Agents qui travaillent tout seuls"),
    resume: t("Des agents qui tournent même fenêtre fermée."),
    motsCles: ["agent", "employe", "openclaw", "mission", "autonome", "planification"],
    lien: "/agents",
    module: "agents",
    corps: t("Un agent déployé vit dans l'instance, pas dans la fenêtre : il continue quand vous fermez l'application.\n\n- Missions : à heure fixe, à intervalle régulier, ou à chaque mail reçu.\n- Canaux : il peut recevoir et répondre par mail, et sur les messageries que vous lui branchez.\n- Liberté : c'est le même système d'accords que pour le Chat, réglé par agent.\n\nUn agent ne sait que ce que vous lui donnez : son instruction, ses outils, les documents qu'il a le droit de voir. Il n'a pas accès au reste de votre poste."),
  },
  {
    id: "taches",
    titre: t("Tâches et enchaînements"),
    resume: t("Déléguer une carte, et en enchaîner plusieurs."),
    motsCles: ["tache", "kanban", "carte", "deleguer", "enchainer", "dependance"],
    lien: "/taches",
    module: "taches",
    corps: t("Une carte peut être confiée à un agent : il la traite et écrit son compte rendu dedans.\n\n- « Après » : une carte peut attendre qu'une autre soit terminée. Elle ne part pas avant.\n- « Lancement » : automatique, une carte démarre d'elle-même dès que ses prérequis sont finis, et récupère leurs résultats.\n- Les cartes lancées automatiquement passent une à une : sur une machine qui fait tourner un modèle en local, trois agents en même temps se gêneraient.\n\nLimite assumée : ces exécutions vivent dans la fenêtre de l'application. La fermer les interrompt. Les agents de l'écran Agents, eux, travaillent dans l'instance."),
  },
  {
    id: "decoupage",
    titre: t("Demandes longues : le découpage"),
    resume: t("Comment une grosse demande est menée à bout."),
    motsCles: ["decoupage", "plan", "etape", "long", "sequencage", "petit modele"],
    lien: "/",
    corps: t("Quand une demande est trop grosse pour un seul tour, le modèle est appelé une première fois pour juger s'il faut la découper, puis pour en écrire le plan. Chaque étape est ensuite traitée à part, avec son propre budget d'actions, et vérifiée avant de passer à la suivante.\n\nLe découpage n'est pas infini, et c'est voulu :\n- 15 étapes au premier niveau, 8 quand une étape est redécoupée ;\n- 3 niveaux de profondeur ;\n- 60 étapes exécutées au total pour une demande.\n\nUne demande qui touche ces limites s'arrête et le dit, plutôt que de tourner sans fin. Le plan s'affiche au fil de l'eau, avec les étapes faites et celles qui restent."),
  },
  {
    id: "courrier",
    titre: t("Connecter sa boîte mail"),
    resume: t("Lire, écrire des brouillons, envoyer après accord."),
    motsCles: ["mail", "courrier", "imap", "smtp", "boite", "envoyer", "brouillon"],
    lien: "/parametres/mcp",
    corps: t("Le connecteur courrier se règle dans Réglages, Outils et connecteurs.\n\n- Lecture : l'agent lit les messages de votre boîte par IMAP.\n- Brouillons : il peut déposer un vrai brouillon dans votre messagerie, que vous relisez et envoyez vous-même.\n- Envoi : il faut renseigner le serveur d'envoi. Chaque message vous est montré en entier avant de partir, avec ses destinataires.\n\nUn mot de passe d'application est souvent nécessaire (Gmail, Outlook) : votre mot de passe habituel sera refusé par le fournisseur. Il est conservé chiffré sur l'instance, jamais dans la fenêtre."),
  },
  {
    id: "reunions",
    titre: t("Réunions et transcription"),
    resume: t("Enregistrer, transcrire, résumer une réunion."),
    motsCles: ["reunion", "meet", "transcription", "audio", "compte rendu", "bot"],
    lien: "/reunions",
    module: "reunions",
    corps: t("Deux façons d'obtenir une transcription :\n\n- enregistrer depuis votre poste : le son de la réunion est capté, chiffré, puis transcrit sur l'instance ;\n- envoyer un bot dans une réunion Google Meet : il rejoint, écoute et renvoie le son. Il faut l'autoriser à entrer dans la réunion comme n'importe quel participant.\n\nLa transcription tourne sur l'instance. Un enregistrement peut aller jusqu'à 2 Go, soit plusieurs heures."),
  },
  {
    id: "confidentialite",
    titre: t("Où vont vos données"),
    resume: t("Ce qui reste chez vous, ce qui peut en sortir."),
    motsCles: ["donnees", "confidentialite", "rgpd", "vie privee", "export", "effacement", "audit"],
    lien: "/parametres/confidentialite",
    corps: t("Par défaut, rien ne sort de votre installation. Ce qui peut en sortir, et seulement si vous l'avez branché vous-même :\n\n- un modèle chez un fournisseur avec votre clé : la conversation part chez lui ;\n- un connecteur (boîte mail, stockage, messagerie) : il parle au service que vous avez désigné ;\n- la vérification de mise à jour, vers l'adresse inscrite dans le paquet par votre prestataire.\n\nVous pouvez à tout moment exporter toutes vos données, ou demander leur effacement, depuis Réglages, Confidentialité. Le journal d'audit garde la trace de chaque action faite par un agent."),
  },
  {
    id: "langue",
    titre: t("Changer la langue"),
    resume: t("Français, anglais, chinois."),
    motsCles: ["langue", "anglais", "chinois", "english", "traduction", "language", "中文"],
    lien: "/parametres/preferences",
    corps: t(`L'interface se lit en français, en anglais ou en chinois. Le choix se fait dans Réglages, Préférences, rubrique Langue.

- Le choix vaut pour ce poste, pas pour toute l'instance : chacun peut lire dans sa langue, sur la même instance.
- La page se recharge aussitôt, pour que tout l'écran change d'un coup plutôt qu'à moitié.
- Sans choix de votre part, la langue de votre système est suivie, si elle est servie.

Ce qui n'est jamais traduit : ce que vous écrivez. Vos chats, vos documents, vos procédures et les réponses des modèles restent tels quels. Certains messages venus de l'instance peuvent aussi rester en français.`),
  },
  {
    id: "competences",
    titre: t("Apprendre vos manières de faire"),
    resume: t("Écrire une procédure une fois, pour ne plus la répéter."),
    motsCles: [
      "competence",
      "procedure",
      "methode",
      "modele de document",
      "instruction",
      "apprendre",
      "habitude",
      "cowork",
    ],
    lien: "/cowork",
    corps: tf("Une compétence est une manière de faire, écrite en français, que {0} applique quand la situation s'y prête. Par exemple : comment rédiger un compte rendu chez vous, quelles mentions porte un devis, dans quel ordre facturer.\n\nElle se crée dans Cowork, panneau de droite, carte « Procédures », bouton « Créer une compétence ». Trois champs, et pas un de plus :\n\n- le nom, pour la retrouver ;\n- quand s'en servir : c'est la seule phrase que le modèle lit pour décider s'il l'applique, alors décrivez la situation, pas la méthode ;\n- la procédure : les étapes dans l'ordre, et ce qu'il ne faut surtout pas faire. Écrivez-la comme à un nouveau collègue.\n\nCe qu'il faut savoir :\n\n- une compétence ne donne aucun pouvoir nouveau : elle dit comment se servir de ceux qui existent déjà. Pour brancher un nouveau service, ce sont les Connecteurs ;\n- elle s'applique dans Cowork, dans le Chat et aux tâches exécutées par un agent ;\n- l'interrupteur la met de côté sans l'effacer ;\n- « Toute l'organisation » la rend lisible par vos collègues, qui ne peuvent pas la modifier ;\n- les consignes repartent à chaque message : la ligne sous la liste dit combien de caractères sont envoyés. Au-delà d'une douzaine de procédures, les dernières ne partent plus, et l'écran le dit plutôt que de les couper en deux.", branding.name),
  },
  {
    id: "travailler-ensemble",
    titre: t("Travailler avec quelqu'un d'autre"),
    resume: t("Inviter un collègue, et par quel chemin il vous rejoint."),
    motsCles: [
      "inviter",
      "collegue",
      "partager",
      "equipe",
      "reseau",
      "wifi",
      "vpn",
      "instance",
      "rejoindre",
      "code",
      "lien",
    ],
    lien: "/parametres/profil",
    corps: tf("Une instance {0}, c'est une machine qui répond. Inviter quelqu'un, c'est lui donner le moyen de lui parler.\n\nDeux gestes, dans cet ordre :\n\n- Ouvrez votre instance. Réglages, Profil, « Ouvrir l'instance à mes collègues ». Tant qu'elle est fermée, elle ne répond qu'à votre machine. En l'ouvrant, elle se met à chiffrer ses échanges et affiche les adresses par lesquelles on peut la joindre.\n- Invitez la personne par son adresse email. Elle reçoit un lien : un clic, et son poste se rattache. Sans lien cliquable, l'adresse et le code du mail se saisissent à la main, ou se collent ensemble dans le premier champ.\n\nPar où elle vous rejoint dépend d'où elle se trouve :\n\n- Même réseau. Même Wi-Fi, même bureau, même câble : rien à régler, l'adresse suffit. C'est le cas courant.\n- Ailleurs. Il faut alors un lien privé entre vos deux réseaux : le VPN de votre entreprise, ou un réseau privé monté entre vos machines. {1} le détecte tout seul et affiche l'adresse correspondante. N'ouvrez pas de port sur votre box pour aller plus vite : vous exposeriez votre poste à tout Internet, sans rien y gagner.\n- À toute heure. Votre poste éteint, votre instance ne répond plus : c'est elle qui fait tourner les modèles. Pour une équipe qui travaille en continu, installez l'instance sur une machine qui ne s'éteint pas.\n\nCe que le code d'invitation vaut : sept jours, un seul usage, une seule adresse email. La personne choisit son propre mot de passe, que vous ne connaîtrez jamais. Vous pouvez annuler une invitation tant qu'elle n'a pas servi.\n\nLe premier rattachement affichera un avertissement sur le certificat : votre instance signe le sien elle-même, aucune autorité extérieure ne le connaît. On accepte une fois, et l'application refusera ensuite tout certificat différent.", branding.name, branding.name),
  },
  {
    id: "probleme",
    titre: t("Quelque chose ne marche pas"),
    resume: t("Les vérifications à faire avant de demander de l'aide."),
    motsCles: ["probleme", "bug", "erreur", "panne", "support", "aide", "lent", "bloque"],
    corps: t("Dans l'ordre :\n\n- Vérifiez l'état de l'instance : Réglages, puis le bandeau en haut de l'écran. Hors ligne, les chats restent lisibles mais aucune réponse ne peut être générée.\n- Un modèle local très lent est normal sur une longue demande : le plan affiché avance étape par étape, même si aucun texte n'apparaît.\n- Une action « en attente » vient presque toujours d'une carte d'accord non répondue : regardez la cloche de notifications.\n- Après une mise à jour, redémarrez l'application une fois.\n\nSi le problème persiste, le bouton « Copier les informations techniques » de cette fenêtre rassemble la version, l'adresse de l'instance et votre système. Joignez-le à votre message : c'est ce qu'on vous demandera."),
  },
];

/** Articles de l'édition livrée : un module absent n'a pas d'article. */
export const articles = (): Article[] =>
  ARTICLES.filter((a) => !a.module || features[a.module]);

/** Recherche simple, insensible aux accents et à la casse. */
export function chercherArticles(terme: string): Article[] {
  const t = plier(terme.trim());
  if (!t) return articles();
  return articles().filter((a) =>
    [a.titre, a.resume, a.corps, ...a.motsCles].some((champ) => plier(champ).includes(t)),
  );
}

/** « Réunion » et « reunion » doivent se trouver l'un l'autre. */
const plier = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
