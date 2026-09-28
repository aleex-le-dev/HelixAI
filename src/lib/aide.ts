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
    corps: tf("{0} fait tourner des modèles d'IA sur votre matériel ou sur l'instance de votre organisation. Rien ne part vers un service tiers tant que vous n'avez pas branché vous-même une clé chez un fournisseur.\n\nPour commencer :\n- ouvrez un Chat et posez votre question ; le modèle utilisé est indiqué sous le champ de saisie, avec son pays d'hébergement ;\n- déposez un document dans Fichiers pour que les agents puissent s'y référer ;\n- choisissez le niveau d'accord dans la barre du bas de Cowork ou de Code, à côté du « + » : c'est lui qui décide de ce qu'un agent peut faire sans vous demander.\n\nTout ce que vous écrivez reste sur votre poste et sur votre instance. Fermer l'application n'efface rien.", branding.name),
  },
  {
    id: "chats",
    titre: t("Chats : renommer, archiver, supprimer, partager"),
    resume: t("Ranger vos conversations sans rien perdre."),
    motsCles: ["chat", "conversation", "archive", "archiver", "supprimer", "partager", "ranger", "renommer", "nom", "titre"],
    lien: "/",
    corps: t("Chaque chat de la barre latérale porte quatre actions, visibles au survol.\n\n- Renommer (ou un double clic sur son nom) : le nom se change sur place, Entrée le garde, Échap l'annule. Le chat ne remonte pas en tête de liste pour autant.\n- Partager : vous invitez une personne par son adresse. Elle voit la conversation, elle ne peut pas la ranger à votre place.\n- Archiver : le chat quitte la liste et se retrouve sous « Archivés », en bas. Rien n'est effacé, et un clic le remet en place. L'archivage est personnel : archiver un chat partagé ne le retire pas de la liste des autres.\n- Supprimer : les messages sont effacés pour de bon. Il n'y a pas de corbeille ; archivez plutôt si vous hésitez.\n\nUn chat peut aussi être rangé dans un Projet, depuis le champ de saisie. Ce classement ne partage rien : il ne fait qu'ordonner votre propre écran."),
  },
  {
    id: "documents-joints",
    titre: t("Joindre un document au Chat"),
    resume: t("Ce que le modèle lit d'un fichier joint, et ce qu'il ne lit pas."),
    motsCles: ["joindre", "piece jointe", "document", "fichier", "pdf", "word", "excel", "csv", "lire", "resumer", "long"],
    lien: "/",
    corps: t("Le « + » de la zone de saisie, ou un fichier glissé sur la fenêtre, joint un document à votre message. Le texte est lu sur votre poste, puis envoyé avec la question au modèle choisi, quel qu'il soit.\n\n- Formats lus : texte (y compris un CSV d'Excel ou un fichier du Bloc-notes), PDF, Word, Excel, PowerPoint, OpenDocument, et les images pour un modèle qui sait les voir.\n- Le message attend : « Lecture de … » s'affiche, et rien ne part avant que les fichiers soient lus.\n- Dans le message, une carte par fichier dit son nom, son poids et « lu en entier » ou « début seulement » (environ 200 000 caractères, 300 pages d'un PDF ou 5 000 lignes d'un tableur).\n- Un document trop long pour la mémoire du modèle est lu en parties : la réponse le dit en tête (« lu en 5 parties… ») et s'appuie sur les notes prises sur chacune. Au-delà de 24 parties, la suite n'est pas lue, et c'est dit aussi.\n- La question suivante garde le document tant que le Chat reste ouvert : « et la page 3 ? » fonctionne. Un Chat rouvert plus tard n'a plus le texte du fichier : joignez-le de nouveau.\n\nNe se lisent pas, et l'écran le dit : un PDF scanné (des images de pages), un PDF protégé par un mot de passe, les anciens formats .doc, .xls et .ppt (enregistrez-les au format actuel), une photo HEIC d'iPhone (convertissez-la en JPEG).\n\nPour un long document auquel vous reviendrez souvent, déposez-le plutôt dans Fichiers : il y est lu par passages, et les agents peuvent s'y référer."),
  },
  {
    id: "recherche-web",
    titre: t("Rechercher sur le web depuis le Chat"),
    resume: t("Ce qui part vers le moteur de recherche, et quand."),
    motsCles: ["web", "internet", "recherche", "chercher", "duckduckgo", "source", "sources", "lien", "actualite", "page"],
    lien: "/",
    corps: t("Dans le Chat, le « + » de la zone de saisie propose « Rechercher sur le web ». Une fois choisie, la recherche reste active, montrée par la puce « Web · DuckDuckGo » à côté du « + » ; la croix de la puce l'arrête.\n\nTant qu'elle est active :\n- votre question, ou les mots que le modèle en tire, part à DuckDuckGo, sans compte ;\n- votre instance ouvre ensuite les pages trouvées et en donne le texte au modèle. Elle ne lit que des adresses déjà vues (écrites par vous, trouvées par la recherche ou dans une page déjà lue), jamais une adresse inventée, ni une machine du réseau de l'entreprise ;\n- sous la réponse, « Sources du web » donne les pages citées, avec leur lien ; les autres résultats consultés restent repliés.\n\nSans la puce, rien ne part vers le web.\n\nUne page lue est donnée au modèle comme une donnée, jamais comme une consigne, et un appel d'outil qu'elle dicterait n'est pas lancé. Un modèle peut tout de même se laisser influencer par ce qu'il lit : relisez une réponse fondée sur le web comme vous reliriez la page elle-même.\n\nAvec un petit modèle, ou un modèle qui ne sait pas se servir d'outils, votre instance fait la recherche avant la réponse, à partir de votre question, et la lui donne toute prête.\n\nSi l'entrée est grisée, l'administrateur de l'instance a désactivé la recherche sur le web : le menu le dit."),
  },
  {
    id: "modeles",
    titre: t("Choisir un modèle"),
    resume: t("Local, instance, ou fournisseur avec votre clé."),
    motsCles: ["modele", "llm", "local", "cloud", "cle", "api", "pays", "souverain"],
    lien: "/parametres/modeles",
    corps: t("Trois origines, toujours affichées telles quelles :\n\n- local : le modèle tourne sur votre machine. Rien ne sort du poste. C'est le plus lent sur une grosse demande, et le plus sûr.\n- instance : le modèle tourne sur le serveur de votre organisation.\n- clé : vous avez branché votre propre compte chez un fournisseur. La demande part chez lui, et le pays d'hébergement est indiqué à côté du nom.\n\nAucun modèle distant n'est choisi à votre place. Si vous n'avez branché aucune clé, rien ne quitte votre installation.\n\nUn modèle de la machine passe un court essai sur ce poste, quand il est installé ou chargé pour la première fois. S'il répond mal ici (texte illisible, réponse qui tourne en boucle), il n'est plus choisi d'office, ni en « Auto » : le sélecteur le marque « répond mal sur cette machine », et vous pouvez toujours le prendre à la main.\n\n« Comparer intelligence et prix », en bas du sélecteur, place vos modèles selon la note publiée par Epoch AI (sous licence ouverte) et le prix publié par leur éditeur. Un modèle qu'Epoch AI ne note pas est listé à part, « pas de note publiée » : rien n'invente sa note.\n\nSous chaque réponse, le Chat indique combien de temps elle a pris, le temps avant le premier mot et, quand le modèle a réfléchi, la durée de sa réflexion."),
  },
  {
    // La page « Modèles » (28/09/2026) : tout le catalogue libre, seulement ce qui tient sur la machine.
    id: "catalogue-modeles",
    titre: t("Installer d'autres modèles"),
    resume: t("Tous les modèles libres, plus petits ou plus grands, qui tiennent sur la machine."),
    motsCles: ["modele", "installer", "telecharger", "catalogue", "petit", "leger", "mistral", "qwen", "phi", "granite", "deepseek", "lm studio"],
    lien: "/modeles",
    corps: t("Le sélecteur de modèles du Chat propose une courte liste, adaptée à la machine. Pour choisir parmi tous les modèles libres (licences Apache 2.0 ou MIT) : sélecteur de modèles, « Installer un modèle sur cette machine », puis « Voir tous les modèles ».\n\nLa page « Modèles » :\n- recherche par nom, éditeur ou pays ;\n- tri par note (Epoch AI) ou par taille ;\n- filtres : éditeur, lit les images, raisonne, rapide sans carte graphique ;\n- pour chaque modèle : éditeur et pays, licence, taille du téléchargement, note ou « sans note publiée », capacités.\n\nSeuls les modèles que cette machine fait tourner sans ralentir s'installent. Les plus lourds restent visibles, grisés, avec la raison : la mémoire qu'ils demandent, et celle de la machine. Un modèle plus léger répond plus vite, avec des réponses plus simples.\n\nUne installation à la fois : le téléchargement se suit sur la page, puis le modèle apparaît dans le sélecteur. Le modèle posé à la mise en route reste celui qui est conseillé pour la machine ; l'écran de mise en route propose aussi les autres, par « Choisir un autre modèle »."),
  },
  {
    id: "modeles-locaux",
    titre: t("Où sont rangés les modèles locaux"),
    resume: t("Mettre le moteur et les modèles sur un autre disque."),
    motsCles: ["disque", "place", "espace", "emplacement", "dossier", "stockage", "lm studio", "llama", "deplacer", "d:"],
    lien: "/parametres/modeles-locaux",
    corps: tf("Un modèle pèse de 2 à 18 Go. Si le disque principal n'a pas la place, choisissez-en un autre, par exemple D: sous Windows ou un disque externe sur Mac.\n\n- Avant l'installation : l'écran de mise en route montre où iront le moteur et les modèles, la place libre sur ce disque et la place nécessaire. « Changer » ouvre le choix d'un dossier. Les modèles iront alors sur ce disque, et le moteur aussi avec LM Studio, dans un sous-dossier « LM Studio » (« modeles-llamacpp » sur un Mac Intel).\n- Après l'installation : Réglages, Modèles locaux. Sur un Mac Intel, {0} déplace lui-même les modèles, et n'efface les originaux qu'une fois la copie vérifiée. Avec LM Studio déjà installé, {0} ne déplace pas son dossier pendant qu'il tourne : la page donne la marche à suivre.\n\nLe dossier choisi doit être sur un disque de cette machine (pas un partage réseau), hors de votre dossier personnel et de l'espace de travail des agents. Seul l'administrateur de l'instance le change.", branding.name),
  },
  {
    id: "usage",
    titre: t("Mon usage : ce que coûtent vos modèles"),
    resume: t("Jetons consommés, prix publié et coût estimé."),
    motsCles: ["usage", "cout", "prix", "tarif", "facture", "jetons", "consommation", "estime", "publie"],
    lien: "/parametres/usage",
    corps: t("Réglages, Mon usage montre ce que vous avez consommé : requêtes, jetons envoyés et reçus, par jour et par modèle. Chacun ne voit que sa propre consommation.\n\nLe coût, modèle par modèle :\n- Gratuit : le modèle tourne sur votre machine, aucun frais d'API.\n- Prix publié : vous n'avez pas saisi de tarif, alors le prix affiché par le fournisseur sur sa page de prix s'applique. L'écran nomme le fournisseur, donne la date du relevé et le lien vers sa page. Ce prix a pu changer depuis.\n- Tarif saisi : le prix que vous avez renseigné plus bas, pour un modèle. Il l'emporte toujours sur le prix publié.\n- Tarif non renseigné : aucun prix connu. Son coût n'est pas compté, jamais compté à zéro : renseignez-le pour le voir.\n\n« Estimé » veut dire que le montant n'est pas celui de votre facture. Avec un prix publié, c'est toujours le cas : le tarif standard est appliqué, sans le cache, les lots ni les paliers gratuits de votre contrat. Avec un tarif saisi, seulement quand le moteur n'a pas rapporté ses jetons et qu'ils ont été comptés d'après la longueur des échanges.\n\nLes devises ne sont pas converties : un total en dollars et en euros s'affiche en deux montants."),
  },
  {
    id: "accords",
    titre: t("Accords : ce qu'un agent peut faire seul"),
    resume: t("Le garde-fou entre le modèle et vos fichiers, vos mails, votre écran."),
    motsCles: ["accord", "approbation", "permission", "securite", "autonomie", "garde-fou"],
    lien: "/cowork",
    corps: t("Trois niveaux, choisis dans la barre du bas de la zone de saisie (Cowork et Code), à côté du « + » :\n\n- Demander pour tout : rien ne se fait sans un clic de votre part, lectures comprises.\n- Demander avant de modifier : lire est libre ; écrire, déplacer, supprimer et envoyer demandent votre accord. C'est le réglage par défaut.\n- Tout approuver : l'agent travaille sans vous interrompre. Un texte piégé qu'il lit (mail, page web, document) peut alors le faire agir sans que vous le voyiez : à ce niveau, ce risque est accepté.\n\nLe niveau vaut pour toute l'instance : seul son administrateur le change. Sur une instance d'une seule personne, c'est vous.\n\nToujours confirmés, à tout niveau :\n- envoyer un mail, sauf si l'administrateur a activé « Envoyer sans me demander » ;\n- supprimer un événement d'agenda ;\n- programmer une tâche qui tournera seule.\nUn agent déclenché par un mail reçu ne fait jamais rien qui modifie sans vous le montrer.\n\nLa carte dit ce qui va se passer : pour un fichier, où ; pour un connecteur, un événement ou une tâche, ce que l'outil recevra exactement ; pour une commande de Code, la commande entière. Chaque action figure ensuite dans le journal."),
  },
  {
    id: "code",
    titre: t("Code : OpenCode ou Codex"),
    resume: t("Faire écrire du code dans un dossier, et brancher Codex."),
    motsCles: ["code", "programmer", "developper", "opencode", "codex", "chatgpt", "openai", "session", "projet"],
    lien: "/code",
    module: "code",
    corps: tf("L'écran Code confie un travail sur un dossier de projet à un agent de code. Choisissez le dossier sur la ligne au-dessus de la saisie, puis écrivez votre demande. Le panneau de suivi, à droite, montre ce que fait l'agent : fichiers lus et écrits, commandes, tâches.\n\n- Le travail continue quand vous quittez la session : ouvrir une autre session, un Chat ou une autre page n'arrête rien. Dans la barre latérale, une roue marque une session qui travaille encore ; rouverte, elle reprend là où elle en est. Seul « Arrêter » arrête l'agent.\n- Par défaut, le moteur est OpenCode, avec les modèles de {0} : chaque action passe par votre niveau d'approbation.\n\nCodex, avec votre compte ChatGPT. Sur votre propre poste (application de bureau, instance qui n'est pas ouverte aux collègues, compte administrateur), la puce « OpenCode » de la ligne du dossier propose aussi « Codex (votre compte ChatGPT) ». Pour le brancher :\n- installez Codex, le logiciel d'OpenAI : {0} ne l'installe pas pour vous, et donne la commande officielle à copier ;\n- choisissez « Se connecter avec ChatGPT » : la connexion se termine dans votre navigateur, chez OpenAI. {0} ne voit passer ni votre mot de passe ni aucun jeton ;\n- une fois connecté, choisissez « Codex » dans la même puce.\n\nCe qu'il faut savoir avant de s'en servir :\n- votre demande et les fichiers du projet que Codex lit partent chez OpenAI (États-Unis), dans les limites de votre abonnement ;\n- Codex ne passe pas par les approbations de {0} : seul son bac à sable le borne. Au niveau « Tout approuver », il modifie les fichiers du projet et lance des commandes, sans réseau pour ces commandes ; à « Demander avant de modifier », il travaille en lecture seule ; à « Demander pour tout », il n'est pas proposé ;\n- Codex choisit lui-même son modèle ;\n- ses sessions ne vont pas dans la liste de la barre latérale, et quitter l'écran Code arrête une tâche de Codex en cours.\n\nUn collègue, un poste rattaché à une instance ou une instance partagée ne voient pas Codex : un abonnement ChatGPT ne sert qu'à la personne qui l'a.", branding.name),
  },
  {
    // RTK dans Helix Code (28/09/2026, gateway/src/rtk.ts).
    id: "code-rtk",
    titre: t("Code : moins de jetons avec RTK"),
    resume: t("Raccourcir la sortie des commandes de l'agent avant qu'elle parte au modèle."),
    motsCles: ["rtk", "jetons", "tokens", "economie", "cout", "commandes", "sortie", "code"],
    lien: "/code",
    module: "code",
    corps: t("Quand l'agent de code lance une commande (git status, ls, grep, les tests), sa sortie part au modèle, et chaque ligne compte en jetons. RTK, un outil libre installé avec l'agent de code, la raccourcit d'abord : lignes vides, textes d'aide et listes longues en moins.\n\n- Avec un modèle cloud, RTK sert d'office : moins de jetons facturés par le fournisseur.\n- La puce « RTK », sur la ligne du dossier, propose aussi « Toujours », pour les modèles de cette machine (les petits modèles ont peu de place), et « Jamais ».\n- Sous la saisie, « RTK : N jetons économisés sur cette session » dit ce que RTK a mesuré sur cette machine. Rien n'est envoyé nulle part.\n\nCe qui ne change pas : la carte d'accord montre et juge la commande telle que l'agent l'a écrite, votre niveau d'approbation s'applique comme avant, et une commande que RTK ne connaît pas passe telle quelle. Si RTK manque, les commandes partent sans lui.\n\nCe que le modèle lit change un peu : par exemple, git log n'y montre que les dix derniers commits, un par ligne. Choisissez « Jamais » si un modèle s'y perd. Sous Windows et avec Codex, les commandes partent sans RTK."),
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
    corps: tf("Un agent déployé vit dans l'instance, pas dans la fenêtre : il continue quand vous fermez l'application.\n\n- Son modèle : chacun a le sien, choisi à la création dans « Son modèle ». Un modèle est proposé selon son poste, avec la raison (un modèle qui sait se servir d'outils quand il en a, le plus léger pour un poste court) ; « Le prendre » l'accepte, ou choisissez-en un autre. Un modèle cloud ne vous est jamais proposé d'office : choisi à la main, l'écran dit où partent ses messages et qui paie (votre clé, ou celle de l'équipe). Ce modèle sert sur sa fiche, dans ses missions et sur ses messageries ; dans le Chat, c'est celui choisi dans le Chat.\n- Changer de modèle : ouvrez sa carte, onglet Réglages (vous seul, qui l'avez créé), puis « Son modèle ». Le changement vaut dès son message suivant. Si son modèle disparaît (désinstallé, clé retirée), sa carte dit « Modèle indisponible » avec la raison : il ne répond pas avec un autre à sa place, choisissez-en un nouveau dans ses Réglages.\n- Photo : cliquez sur l'avatar de sa carte pour lui en donner une ; elle apparaît aussi dans le choix de l'agent du Chat.\n- Missions : dans son onglet Missions, au rythme voulu : chaque jour, du lundi au vendredi, un jour de la semaine, un jour du mois (ou le dernier), chaque heure, et l'heure à la minute. Chaque mission rend compte dans Activité.\n- Canaux : il peut répondre sur les messageries que vous lui branchez.\n- Liberté : son palier dit ce qu'il a en plus de ses outils {0} (le web au palier « étendu », des commandes au palier « libre »). Ce qu'ouvre un palier ne passe pas par votre accord.\n- Instructions masquées : pour un agent partagé, son auteur peut les masquer. Elles restent sur l'instance, qui les ajoute elle-même au Chat. Le modèle, lui, les lit : une question insistante peut lui en faire dire une partie.\n\nQuand il traite un mail reçu, il travaille avec moins de droits : ni navigateur, ni messagerie, ni commande, ni écriture de fichier, et sur le web il n'ouvre que des adresses déjà vues (dans le mail, une recherche ou une page lue). Un mail piégé ne peut pas lui faire envoyer vos données sur le web.\n\nUn agent ne sait que ce que vous lui donnez : son instruction, ses outils, les documents qu'il a le droit de voir.", branding.name),
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
    id: "taches-programmees",
    titre: t("Tâches programmées"),
    resume: t("Une consigne qui tourne seule, chaque jour, semaine ou mois."),
    motsCles: ["programmer", "programmee", "planifier", "quotidien", "hebdomadaire", "mensuel", "chaque", "rappel", "automatique"],
    lien: "/taches",
    corps: t("Une tâche programmée, c'est une consigne et un rythme : l'instance l'exécute avec vos outils (mails, agenda, fichiers), même fenêtre fermée, puis en garde le compte rendu.\n\n- Où : Tâches, rubrique « Programmées », « Nouvelle tâche programmée ». Ou dans un Chat : « Tous les lundis à 8 h, résume mes mails de la semaine ». Une carte vous la montre avant qu'elle soit créée.\n- Rythme : chaque jour, du lundi au vendredi, chaque semaine (un jour choisi), chaque mois (un jour du mois, ou le dernier), et l'heure.\n- Fait par : l'agent du Chat, ou l'un de vos agents, avec ses instructions, son modèle et ses bases de connaissances.\n- Chaque exécution laisse un compte rendu, qui s'ouvre dans un Chat pour y répondre.\n\nPersonne n'est devant l'écran quand elle tourne : ce qui modifie quelque chose attend votre accord, et sans réponse la carte expire, sauf au niveau « Tout approuver ». Une machine éteinte à l'heure dite fait la tâche au démarrage suivant, une seule fois."),
  },
  {
    id: "images-videos",
    titre: t("Créer une image ou une vidéo"),
    resume: t("Sur votre machine, avec un modèle ouvert, selon sa puissance."),
    motsCles: ["image", "video", "creer", "generer", "dessin", "photo", "film", "animation"],
    lien: "/",
    corps: t("Dans le Chat, le menu « + » propose « Créer une image » et « Créer une vidéo ». Tout se calcule sur la machine de l'instance : ni la description ni le résultat ne partent sur internet.\n\n- Le modèle proposé dépend de la machine (mémoire du Mac, ou de la carte graphique d'un PC). Le conseillé est en tête, avec la taille à télécharger ; rien ne s'installe sans votre clic.\n- Image : carré, portrait ou paysage, en quelques minutes.\n- Vidéo : deux secondes, en paysage ou en portrait. Mesuré sur un Mac de 16 Go : environ 11 minutes. Sur un PC sans carte graphique, la vidéo n'est pas proposée. Au-delà de 45 minutes, elle s'arrête et le dit.\n- Pendant le calcul, les modèles de conversation sont mis de côté pour faire de la place, s'ils ne travaillent pas.\n\nUne image ou une vidéo se voit par qui voit le Chat où elle a été créée, et se télécharge depuis le Chat."),
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
    corps: t("Le connecteur courrier se règle dans Réglages, Connecteurs.\n\n- Lecture : l'agent lit les messages de votre boîte par IMAP.\n- Brouillons : il peut déposer un vrai brouillon dans votre messagerie, que vous relisez et envoyez vous-même.\n- Envoi : il faut renseigner le serveur d'envoi. Chaque message vous est montré en entier avant de partir, avec ses destinataires.\n\nUn mot de passe d'application est souvent nécessaire (Gmail, Outlook) : votre mot de passe habituel sera refusé par le fournisseur. Il est conservé chiffré sur l'instance, jamais dans la fenêtre.\n\nLa boîte est commune à l'instance : seul son administrateur la branche, change son serveur d'envoi ou autorise l'envoi sans confirmation."),
  },
  {
    // X (ex-Twitter), 28/09/2026 : gateway/src/oauthNatif.ts, outilsNatifs.ts, SECURITE.md § 42.
    id: "x",
    titre: t("Connecter X (ex-Twitter)"),
    resume: t("Lire les posts du compte de l'organisation, publier après accord."),
    motsCles: ["x", "twitter", "tweet", "post", "reseaux sociaux", "publier"],
    lien: "/parametres/mcp",
    corps: t("X se branche dans Réglages, Connecteurs, avec l'application que votre organisation crée elle-même sur console.x.com. L'écran dit comment, en quelques étapes. Seul l'administrateur de l'instance branche X, et seul lui peut publier.\n\n- Lecture, sans rien cocher : le compte (abonnés, nombre de posts) et ses derniers posts, avec leurs vues, j'aime, reposts et réponses.\n- Publier, si la case est cochée à la connexion : un post de 280 caractères au plus, avec une image du dossier de travail si vous le demandez. Chaque post vous est montré en entier et ne part qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation.\n\nL'API de X est payante : X n'a plus d'offre gratuite pour les nouveaux développeurs depuis février 2026. On lui achète des crédits, et chaque lecture ou publication est décomptée ; un post qui contient une adresse web coûte plus cher. Les tarifs publiés par X sont rappelés sur l'écran de connexion.\n\nPar prudence, dix publications par heure au plus pour toute l'instance, et le même post n'est pas publié deux fois de suite."),
  },
  {
    // Google Docs, Google Forms, Dropbox, 28/09/2026 : gateway/src/natifs/documents.ts, SECURITE.md § 45.
    // Identifiant à part (tournée finale du 28/09/2026) : « documents » est celui de « Fichiers et
    // documents », et l'aide ouvre un article par son identifiant : un clic ici ouvrait l'autre.
    id: "connecteurs-documents",
    titre: t("Connecter Google Docs, Google Forms et Dropbox"),
    resume: t("Lire documents, formulaires et fichiers ; écrire ou envoyer après accord."),
    motsCles: ["google docs", "document", "google forms", "formulaire", "reponses", "dropbox", "fichier", "envoyer"],
    lien: "/parametres/mcp",
    corps: t("Ces trois services se branchent dans Réglages, Connecteurs. Seul l'administrateur de l'instance les branche, et seul lui peut faire écrire ou envoyer.\n\n- Google Docs et Google Forms reprennent l'application Google de l'instance, celle de Drive et d'Agenda : il suffit d'activer « Google Docs API » ou « Google Forms API » dans le même projet de la console Google Cloud.\n- Dropbox demande une application que votre organisation crée sur dropbox.com/developers/apps. L'écran dit comment, en quelques étapes, et quelle adresse de retour y déclarer.\n\nCe que vos agents peuvent faire :\n- Google Docs : lire un document, onglets et tableaux compris ; si la case est cochée à la connexion, créer un document ou ajouter du texte à la fin d'un document, sans rien effacer.\n- Google Forms : lire un formulaire et ses réponses, les plus récentes d'abord. Rien n'est modifié.\n- Dropbox : lister un dossier, chercher, lire un fichier texte ; si la case est cochée, envoyer un fichier du dossier de travail. Un fichier du même nom n'est jamais remplacé.\n\nChaque écriture et chaque envoi vous est montré en entier et n'a lieu qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation. Par prudence, dix écritures par heure au plus et par service pour toute l'instance, et la même demande n'est pas refaite deux fois de suite."),
  },
  {
    // Messageries, 28/09/2026 : gateway/src/natifs/messageries.ts, SECURITE.md § 46.
    id: "messageries",
    titre: t("Connecter Telegram, Discord ou WhatsApp"),
    resume: t("Lire les messages reçus, envoyer un message après accord."),
    motsCles: ["telegram", "discord", "whatsapp", "messagerie", "bot", "message", "envoyer", "botfather"],
    lien: "/parametres/mcp",
    corps: t("Les messageries se branchent dans Réglages, Connecteurs, rubrique « Messageries ». Seul l'administrateur de l'instance les branche, et seul lui peut faire envoyer un message.\n\n- Telegram : créez un bot avec @BotFather (/newbot) et collez son jeton. Le bot lit les messages reçus depuis sa connexion ; dans un groupe, il ne voit que ceux qui le mentionnent, sauf si vous coupez son mode confidentialité (/setprivacy). Prenez un bot à part : un bot déjà branché sur un agent est refusé.\n- Discord : créez une application sur le portail développeur de Discord, copiez le jeton de son bot, activez « Message Content Intent », puis invitez le bot sur votre serveur.\n- WhatsApp Business : il faut un numéro WhatsApp Business chez Meta, un jeton d'utilisateur système et la clé secrète de l'application. Meta n'envoie les messages reçus qu'à une adresse publique en https : l'écran donne l'adresse et le jeton à déclarer.\n\nLire ne demande rien. Envoyer se coche à la connexion : chaque message vous est montré en entier, avec son destinataire, et ne part qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation.\n\nWhatsApp : on répond librement à une personne pendant les 24 heures qui suivent son dernier message ; au-delà, seul un modèle de message approuvé par Meta peut partir, et Meta le facture.\n\nUn message reçu n'est jamais pris pour une consigne : l'agent le lit comme une donnée, et rien ne part sans vous. Par prudence, vingt messages par heure au plus par messagerie pour toute l'instance, et le même message n'est pas envoyé deux fois de suite au même destinataire."),
  },
  {
    // Commerce et relation client, 28/09/2026 : gateway/src/natifs/commerce.ts, SECURITE.md § 47.
    id: "commerce",
    titre: t("Commerce et relation client"),
    resume: t("Stripe, Shopify, WooCommerce, Salesforce, Pipedrive, Zendesk."),
    motsCles: ["stripe", "shopify", "woocommerce", "salesforce", "pipedrive", "zendesk", "commande", "facture", "paiement", "crm", "ticket", "boutique"],
    lien: "/parametres/mcp",
    corps: t("Ces six services se branchent dans Réglages, Connecteurs, rubrique « Commerce et relation client ». Seul l'administrateur de l'instance les branche, et l'écran dit comment créer la clé ou l'application chez chacun.\n\n- Stripe : une clé restreinte en lecture. Vos agents lisent paiements, clients, factures et abonnements ; rien ne peut être remboursé, encaissé ni viré par ce connecteur. Une clé secrète, qui ouvre tout le compte, est refusée.\n- Shopify : une application de votre organisation, installée sur la boutique. Commandes, produits et stocks, en lecture.\n- WooCommerce : une clé d'API REST en « Lecture ». Commandes et produits.\n- Salesforce et Pipedrive : l'application que vous déclarez chez eux, puis votre accord dans le navigateur. Contacts et affaires ; ajouter une note si la case est cochée.\n- Zendesk : un client OAuth de votre compte. Tickets et échanges ; répondre si la case est cochée, par une réponse publique ou une note interne.\n\nChaque note et chaque réponse vous est montrée en entier et ne part qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation ; seul l'administrateur peut écrire. Par prudence, dix écritures par heure et par service au plus pour toute l'instance, et la même n'est pas faite deux fois de suite. Les clés et les accès sont gardés chiffrés sur l'instance et n'en ressortent jamais."),
  },
  {
    // Projets et rendez-vous, 28/09/2026 : gateway/src/natifs/projetsRegles.ts, SECURITE.md § 48.
    id: "projets",
    titre: t("Connecter Trello, Monday, ClickUp, Todoist, Calendly ou Zoom"),
    resume: t("Lire vos tâches, tableaux et rendez-vous ; écrire après accord si l'administrateur l'a permis."),
    motsCles: ["trello", "monday", "clickup", "todoist", "calendly", "zoom", "tache", "projet", "tableau", "rendez-vous", "reunion"],
    lien: "/parametres/mcp",
    corps: t("Ces six services se branchent dans Réglages, Connecteurs, par le serveur que leur éditeur publie : rien ne s'installe sur la machine, et l'accord se donne dans la page du service. Zoom demande en plus une application, créée une fois sur le Zoom App Marketplace : l'écran dit comment.\n\n- Seul l'administrateur de l'instance branche ces services : un compte branché vaut pour toute l'organisation.\n- Sans rien cocher, vos agents lisent seulement : tâches, tableaux, projets, disponibilités, réunions et leurs résumés.\n- Si l'administrateur coche l'écriture à la connexion, les agents peuvent proposer de créer ou de modifier. Chaque écriture est montrée en entier et n'a lieu qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation, et seul l'administrateur peut l'accepter.\n- Les employés et l'agent de code lisent, mais n'écrivent jamais dans ces services.\n\nSi le service accorde plus que ce qui a été demandé (l'écriture sans que la case soit cochée, par exemple), rien n'est enregistré."),
  },
  {
    // Brevo et Mailchimp, 28/09/2026 : gateway/src/natifs/projets.ts, SECURITE.md § 48.
    id: "campagnes",
    titre: t("Connecter Brevo ou Mailchimp"),
    resume: t("Lire vos campagnes e-mail et leurs statistiques ; préparer un brouillon ou envoyer après accord."),
    motsCles: ["brevo", "sendinblue", "mailchimp", "campagne", "emailing", "newsletter", "liste", "audience", "envoyer"],
    lien: "/parametres/mcp",
    corps: t("Brevo et Mailchimp se branchent dans Réglages, Connecteurs, avec l'application que votre organisation crée elle-même chez le service. L'écran dit comment, en quelques étapes. Seul l'administrateur de l'instance les branche.\n\n- Sans rien cocher : le compte, les listes ou audiences, les campagnes et leurs statistiques (envois, ouvertures, clics, désinscriptions).\n- Préparer des brouillons, si la case est cochée : rien ne part ; la carte d'accord montre le brouillon entier et le nombre de destinataires.\n- Envoyer, si la seconde case est cochée : la carte montre la campagne telle que le service l'enverra, relue chez lui, avec son objet, son expéditeur, son texte, ses liens et le nombre de destinataires. Si la campagne change entre la carte et l'envoi, rien ne part. Seul l'administrateur peut accepter un envoi.\n\nChez Brevo, seules les campagnes adressées à des listes s'envoient d'ici : le nombre de destinataires d'un segment n'est pas connu d'avance. Mailchimp n'a pas d'accès en lecture seule : c'est le logiciel qui s'en tient à la lecture tant que rien n'est coché.\n\nPar prudence, dix brouillons ou envois par heure au plus pour toute l'instance, et la même campagne n'est pas envoyée deux fois."),
  },
  {
    // Microsoft 365, 28/09/2026 : gateway/src/natifs/microsoftBase.ts, natifs/microsoft.ts, SECURITE.md § 44.
    id: "microsoft",
    titre: t("Connecter Microsoft 365"),
    resume: t("Outlook, OneDrive, SharePoint, Excel, Word et Teams, par une seule connexion."),
    motsCles: ["microsoft", "office", "outlook", "onedrive", "sharepoint", "excel", "word", "teams", "entra", "azure"],
    lien: "/parametres/mcp",
    corps: t("Microsoft 365 se branche dans Réglages, Connecteurs : les six lignes Outlook, OneDrive, SharePoint, Excel, Word et Teams ouvrent la même connexion. Seul l'administrateur de l'instance la branche.\n\nIl faut d'abord une application dans le portail Microsoft Entra de votre organisation, créée une fois : l'écran dit comment, en quelques étapes, et liste exactement les permissions à déclarer selon les services cochés. SharePoint et Teams demandent en plus le consentement d'un administrateur de l'annuaire.\n\n- Lecture, sans cocher l'écriture : mails et agenda, fichiers du OneDrive et des sites SharePoint, classeurs Excel, documents Word, canaux Teams.\n- Écriture, si la case est cochée : préparer un brouillon, envoyer un mail (avec des pièces jointes du dossier de travail), créer un événement, écrire des valeurs dans un classeur (jamais de formule), poster dans un canal. Chaque écriture vous est montrée en entier et n'a lieu qu'après votre accord, à chaque fois, quel que soit le niveau d'approbation ; seul l'administrateur peut écrire.\n\nLe compte branché vaut pour toute l'instance : branchez un compte dédié à l'organisation plutôt qu'un compte personnel. Par prudence, dix écritures par heure au plus pour Microsoft 365, et la même écriture n'est pas refaite deux fois de suite.\n\nDébrancher efface l'accès de l'instance. Microsoft ne laisse pas une application révoquer elle-même son accès : pour le couper aussi chez Microsoft, un administrateur le retire dans le portail Entra (« Applications d'entreprise », l'application, « Autorisations »)."),
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
    corps: t("Par défaut, rien ne sort de votre installation. Ce qui peut en sortir, et seulement si vous l'avez branché vous-même :\n\n- un modèle chez un fournisseur avec votre clé : la conversation part chez lui ;\n- un connecteur (boîte mail, stockage, messagerie) : il parle au service que vous avez désigné ;\n- la vérification de mise à jour, vers l'adresse inscrite dans le paquet par votre prestataire, ou vers l'instance de votre organisation. Une mise à jour ne s'installe que si elle porte la signature de l'éditeur de votre application, d'où qu'elle vienne.\n\nVous pouvez à tout moment exporter toutes vos données, ou demander leur effacement, depuis Réglages, Confidentialité. Le journal d'audit garde la trace de chaque action faite par un agent."),
  },
  {
    id: "langue",
    titre: t("Changer la langue"),
    resume: t("Français, anglais, chinois, japonais."),
    motsCles: ["langue", "anglais", "chinois", "japonais", "english", "japanese", "traduction", "language", "中文", "日本語"],
    lien: "/parametres/preferences",
    corps: t(`L'interface se lit en français, en anglais, en chinois ou en japonais. Le choix se fait dans Réglages, Préférences, rubrique Langue.

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
    corps: tf("Une instance {0}, c'est une machine qui répond. Inviter quelqu'un, c'est lui donner le moyen de lui parler.\n\nDeux gestes, dans cet ordre :\n\n- Ouvrez votre instance. Réglages, Profil, « Ouvrir l'instance à mes collègues ». Tant qu'elle est fermée, elle ne répond qu'à votre machine. En l'ouvrant, elle se met à chiffrer ses échanges et affiche les adresses par lesquelles on peut la joindre.\n- Invitez la personne par son adresse email. Elle reçoit un lien : un clic, et son poste se rattache. Sans lien cliquable, l'adresse et le code du mail se saisissent à la main, ou se collent ensemble dans le premier champ.\n\nPar où elle vous rejoint dépend d'où elle se trouve :\n\n- Même réseau. Même Wi-Fi, même bureau, même câble : rien à régler, l'adresse suffit. C'est le cas courant.\n- Ailleurs. Il faut alors un lien privé entre vos deux réseaux : le VPN de votre entreprise, ou un réseau privé monté entre vos machines. {1} le détecte tout seul et affiche l'adresse correspondante. N'ouvrez pas de port sur votre box pour aller plus vite : vous exposeriez votre poste à tout Internet, sans rien y gagner.\n- À toute heure. Votre poste éteint, votre instance ne répond plus : c'est elle qui fait tourner les modèles. Pour une équipe qui travaille en continu, installez l'instance sur une machine qui ne s'éteint pas.\n\nCe que le code d'invitation vaut : sept jours, un seul usage, une seule adresse email. La personne choisit son propre mot de passe, que vous ne connaîtrez jamais. Vous pouvez annuler une invitation tant qu'elle n'a pas servi. Quand le mail part, le code n'est affiché qu'à la personne invitée, dans sa boîte : c'est ce qui prouve qu'elle lit bien cette adresse.\n\nL'administrateur peut aussi créer un compte directement. Le mot de passe qu'il choisit est provisoire : à sa première connexion, la personne en choisit un à elle, et l'ancien ne sert plus.\n\nLe premier rattachement affichera un avertissement sur le certificat : votre instance signe le sien elle-même, aucune autorité extérieure ne le connaît. On accepte une fois, et l'application refusera ensuite tout certificat différent.", branding.name, branding.name),
  },
  {
    id: "probleme",
    titre: t("Quelque chose ne marche pas"),
    resume: t("Les vérifications à faire avant de demander de l'aide."),
    motsCles: ["probleme", "bug", "erreur", "panne", "support", "aide", "lent", "bloque"],
    corps: t("Dans l'ordre :\n\n- Vérifiez l'état de l'instance : Réglages, puis le bandeau en haut de l'écran. Hors ligne, les chats restent lisibles mais aucune réponse ne peut être générée.\n- Un modèle local très lent est normal sur une longue demande : le plan affiché avance étape par étape, même si aucun texte n'apparaît.\n- Une action « en attente » vient presque toujours d'une carte d'accord non répondue : regardez la cloche de notifications.\n- Après une mise à jour, redémarrez l'application une fois.\n\nSi le problème persiste, le bouton « Copier les informations techniques » de cette fenêtre rassemble la version, l'adresse de l'instance et votre système. Joignez-le à votre message : c'est ce qu'on vous demandera.\n\nPour le signaler, « Signaler un problème », plus bas dans cette fenêtre ou en dernier dans les Réglages, prépare le message pour vous. Décrivez ce qui ne va pas (le seul champ obligatoire), ce que vous faisiez et ce que vous attendiez. La case « Joindre les informations techniques » ajoute la version, le système et le modèle choisi ; ni vos messages, ni vos documents, ni aucune clé, ni l'adresse d'une instance d'entreprise. L'écran montre le texte exact avant l'envoi. Puis, au choix :\n- « Ouvrir sur GitHub », quand l'écran le propose, ouvre un ticket prérempli dans votre navigateur. Il faut un compte GitHub, et le ticket est public : n'y mettez rien de privé.\n- « Envoyer par mail » ouvre un mail prérempli dans votre messagerie, adressé au support, qui part de votre adresse.\n\nRien ne part en arrière-plan : c'est vous qui relisez et envoyez."),
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
