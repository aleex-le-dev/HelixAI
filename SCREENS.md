# Inventaire des écrans

État au 04/09/2026. Ce document liste les écrans **réellement livrés**, route par
route, et dit pour chacun **ce qui fonctionne et ce qui est une maquette**.

Il remplace l'inventaire de cadrage rédigé en juillet 2026 à partir des 45
captures de référence (`screenshots/`, gardées sur le poste de Medhi et hors du dépôt depuis le 25/09/2026 : elles montrent un autre produit). Cet inventaire décrivait ce qu'il fallait
construire ; celui-ci décrit ce qui existe.

**Comment lire.** « Maquette » signifie : l'écran s'affiche, il est complet et
soigné, mais il n'y a **aucune logique de données derrière**. Les valeurs sont
écrites dans le composant, et les boutons ne déclenchent rien. Ce n'est pas un
défaut de finition, c'est une absence de moteur.

Source de vérité des routes : `src/App.tsx`. Source des entrées de navigation :
`src/lib/nav.ts`.

---

## 1. Vocabulaire

Le vocabulaire appliqué dans l'interface livrée, à ne pas confondre avec celui
des captures d'origine :

| Terme retenu | Terme abandonné | Où |
|---|---|---|
| **Chat**, **Nouveau Chat** | « Discussion », « Nouvelle discussion » | `src/lib/nav.ts` |
| **Agent** | « Assistant » | partout |
| **Catalogue** | « Officiel » | partout |
| **Majordome** | « Agent par Défaut » | `src/lib/store/agents.ts` |

Aucun tiret cadratin dans les textes affichés. Interface entièrement en
français, accents corrects.

---

## 2. Vue d'ensemble

Toutes les routes déclarées dans `src/App.tsx`, dans l'ordre du fichier.

| Route | Écran | Module | État |
|---|---|---|---|
| `/` | Chat | toujours | ✅ **fonctionne** |
| `/cowork` | Cowork | `cowork` | ✅ **fonctionne** |
| `/code` | Code (BETA) | `code` | ✅ **fonctionne**, moteur externe requis |
| `/projets` | Projets | `projets` | ✅ **fonctionne** |
| `/agents` | Agents | `agents` | ✅ **fonctionne** |
| `/bibliotheque` | Bibliothèque | `bibliotheque` | ✅ **fonctionne** (0.16.0) |
| `/reunions` | Réunions | `reunions` | ✅ **fonctionne** (0.16.0), bot dans l'application de bureau |
| `/groupes` | Groupes | `groupes` | ✅ **fonctionne** (0.16.0) |
| `/taches` | Tâches | `taches` | ✅ **fonctionne** |
| `/parametres/*` | Paramètres, 12 sous-pages | toujours | mixte, voir § 5 |
| `*` | repli sur l'accueil | | |

Deux écrans vivent **hors du routeur**, parce qu'ils précèdent tout le reste
(`src/App.tsx`) :

| Écran | Fichier | Quand | État |
|---|---|---|---|
| Rattachement du poste | `src/pages/InstanceSetupPage.tsx` | tant qu'aucune adresse d'instance n'est retenue sur ce poste (`isConfigured`), et sauf si `VITE_GATEWAY_URL` en impose une à la construction | ✅ fonctionne |
| Connexion | `src/pages/LoginPage.tsx` | tant que personne n'est connecté | ✅ fonctionne |

**Éditions.** Chaque route secondaire est conditionnée par un module
(`src/config/branding.ts`, `features`). L'édition `chat` désactive Cowork et
Code ; l'édition `complete` active tout. Les entrées de navigation **et** les
routes suivent le même drapeau : un module désactivé n'est ni affiché ni
atteignable par l'URL.

Bibliothèque, Réunions et Groupes sont actifs dans les deux éditions. Pour livrer
une instance sans eux, poser
`featureOverrides: { bibliotheque: false, reunions: false, groupes: false }`
dans `src/config/branding.ts`.

---

## 3. Écrans qui fonctionnent

### `/` Chat

`src/pages/HomePage.tsx`. Captures 1 à 5.

Ce qui fonctionne : conversation en streaming via la passerelle (`useChat`),
canal de raisonnement des modèles qui en émettent un, sélecteur de modèle
alimenté par le catalogue réel de la passerelle (`useModels`), pièces jointes
lues sur le poste (`useAttachments`), historique des conversations persisté,
partage d'une conversation (`ShareSessionModal`), sélecteurs de projet et
d'agent alimentés par les données réelles (`ContextSelectors`, `useProjects`,
`useAgents`). Le message système est reconstruit à chaque conversation depuis le
profil privé de l'utilisateur (`buildSystemPrompt`).

Ce qui reste fictif sur cet écran :

- les **suggestions** de l'état vide (`src/data/mock/suggestions.ts`) ;
- les **libellés de comportement** Auto / Rapide / Approfondi
  (`behaviors` dans `src/data/mock/models.ts`). Le niveau choisi est bien
  transmis à la passerelle sous forme d'`effort`, mais les textes descriptifs
  sont écrits en dur ;
- (corrigé : le micro fonctionne depuis longtemps, dictée Whisper sur la machine.)

⚠ La liste de modèles de la capture 5 (Qwen 3.5 397B, Claude, Mistral…) n'est
plus utilisée : `models` dans `src/data/mock/models.ts` est du code mort. Le
sélecteur affiche les modèles réellement servis par la passerelle.

Ajouté le 24/09/2026 : le **« + »** du composeur ouvre un menu (« Ajouter des
photos et fichiers », « Créer une image ») ; « Créer une image » pose une
pastille **« Image · modèle × »** dont le menu règle le format (carré,
portrait, paysage) et le modèle (conseillé en premier, taille à télécharger,
« pas encore vérifié avec Helix » quand c'est le cas, installation suivie en
direct). L'image apparaît dans le Chat avec « Télécharger ». Depuis le
25/09/2026, elle est visible aussi de qui voit le Chat partagé où elle a été
créée.

Ajouté le 25/09/2026 : la pastille **« Connaissances »** de la zone de saisie
(`ConnaissancesChip.tsx`, aussi dans Cowork) ouvre la liste des bases de
connaissances à cocher (nombre de passages, « Indexation en cours »), avec
« Gérer les bases de connaissances » ; son libellé devient le nom de la base, ou
« {0} bases ». Le choix est gardé avec le Chat. Sous la réponse, **« Sources »** :
les passages que la réponse cite par leur numéro [n], mis en avant ; les autres,
repliés, « non cités ». Les bases de l'agent choisi ou du projet où le Chat est rangé
sont consultées aussi (« Par l'agent… », « Par le projet… »). Une base qu'on ne voit
pas est dite « ignorée », un document indexé par un autre modèle est signalé.
**Essayé dans l'interface le 25/09/2026** : un Chat avec une base de deux documents a
répondu juste, les deux sources citées sous la réponse.

### `/cowork` Cowork

`src/pages/CoworkPage.tsx`. Captures 6 à 8.

Ce qui fonctionne : boucle d'outils fichiers via MCP, avec trace des appels dans
la conversation ; choix du dossier de travail (`DossierTravailChip`, validé côté
instance) ; contrôle de l'écran sous approbation (`ScreenAccessChip`,
`ScreenApproval`) ; panneau droit alimenté par l'état réel des serveurs MCP
(`CoworkPanel`, `useMcp`) : fichiers touchés, compétences (les outils réellement
exposés), connecteurs (les serveurs réellement lancés) ; carte **Préparer
Cowork** (`PreparerCowork`), qui diagnostique l'atelier bureautique, annonce ce
qui sera installé, puis installe et vérifie.

Ce qui ne fonctionne pas :

- ❌ le popover **« Approuver pour moi »** (`ApprovalSelector`,
  `src/components/chat/CoworkSelectors.tsx`). Les trois niveaux « Demander une
  approbation / Approuver pour moi / Accès complet » sont un affichage sans
  état : aucun `onClick`, la deuxième option est cochée en dur. **Un agent écrit
  et supprime aujourd'hui sans rien demander.** Seul le périmètre du dossier le
  borne. C'est le point le plus trompeur de l'interface ;
- ❌ le bouton **« Créer une compétence »** du panneau droit : `disabled`, à
  50 % d'opacité.

### `/code` Code (BETA)

`src/pages/CodePage.tsx`. Capture 9.

Ce qui fonctionne : sessions OpenCode, choix du dossier de projet, envoi de
consignes, interruption, flux d'évènements relayé par la passerelle (`useCode`).

**Sessions de Code, séparées des Chats** (25/09/2026, `src/components/code/SessionsCode.tsx`,
`useSessionsCode`, registre `gateway/src/sessionsCode.ts`). En mode Code, la barre
latérale montre « Sessions de Code » à la place des Chats, rangées par dossier de
projet (titre = début de la première demande, date ou heure), avec « Nouvelle
session » au lieu de « Nouveau Chat » et « Rechercher une session... » ; une croix
au survol retire une session de la liste (sa conversation reste chez OpenCode). Les
Chats ne montrent rien de Code, et inversement. L'adresse dit ce qui est affiché :
`/code` est l'accueil (sélecteur de dossier, saisie, « Sessions récentes »), `/code?s=<id>`
une session, dont l'historique est relu chez OpenCode ; ouvrir Code ne reprend plus
la dernière session. Revenir à l'accueil n'arrête pas une session qui travaille :
rouverte, elle reprend son flux là où l'instance l'a vu, dans la même bulle. Vu dans
le navigateur le 25/09/2026 (instance jetable, deux dossiers, une session rouverte
après redémarrage de la passerelle, une autre rouverte pendant que l'agent écrivait) ;
pas vu dans l'application de bureau.

**Panneau de suivi** (25/09/2026, `src/components/code/SuiviCode.tsx`) : à droite
dès qu'une conversation existe, ouvert d'office à partir de 1 024 px, par-dessus
l'écran en dessous (bouton « Afficher le suivi », croix pour le masquer). Cartes
repliables (`PanelCard`, désormais dans `components/ui`) : « En ce moment » (lecture
de la demande avec temps écoulé, barre de progression quand l'instance la connaît,
taille approximative ; attente de son tour ; chargement ; réflexion ; outil en cours
et sa cible ; sous-tâche et son action du moment ; « Terminé », « Arrêté à votre
demande. » ou « Interrompu »), « Tâches » (liste `todowrite` de l'agent), « Actions »
(chaque outil, sa durée, et pour une sous-tâche ses propres outils), « Fichiers »
(Lu, Modifié, Écrit), temps total. Le fil de la conversation dit aussi ce que fait
chaque outil (« Sous-tâche : … », « Écriture · index.html ») et, pendant la lecture,
« Le modèle lit la demande (33 s, 32 %, environ 9 000 jetons)... » au lieu de
l'annonce de panne. Vu dans le navigateur le 25/09/2026 (instance jetable, Qwen3 8B),
à 1 400 px et à 375 px ; pas vu dans l'application de bureau.

⚠ **OpenCode n'est pas empaqueté.** Le binaire doit être présent sur la machine
(`~/.opencode/bin/opencode` ou dans le `PATH`). Sinon l'écran annonce que le
moteur est absent.

### `/projets` Projets

`src/pages/ProjetsPage.tsx`. Captures 10 et 11.

Ce qui fonctionne : création, suppression, persistance dans l'instance,
invitation d'un membre par adresse email, révocation, onglets Tous / Récents /
Partagés, décompte des membres actifs et des invitations en attente. Une
invitation à une adresse encore inconnue reste en attente et se dénoue à la
création du compte correspondant. Chaque carte compte les chats rangés dans le
projet, la fiche les liste (« Votre chat » ou « Partagé avec vous ») et son
bouton « Nouveau Chat » en ouvre un déjà rangé dedans.

**Ranger un chat dans un projet** : sélecteur « Projet » du composer, pour un
chat neuf (appliqué à sa création) ou en cours, et « Retirer du projet ». C'est
un **classement personnel** : les membres du projet ne voient pas le chat, sauf
partage explicite, et le menu le dit. Seul le propriétaire d'un chat le range.

**Bases de connaissances d'un projet** (25/09/2026) : la fiche d'un projet a une
section « Bases de connaissances » (`ChoixBases.tsx`) : les Chats rangés dans ce
projet y cherchent avant de répondre, chaque membre n'y lisant que ce qu'il a le droit
de voir. Pas vu à l'écran lors de la vérification du 25/09.

### `/agents` Agents

`src/pages/AgentsPage.tsx`. Captures 12 à 14.

Ce qui fonctionne : création d'un agent (nom, description, prompt système,
visibilité personnelle ou organisation), persistance, onglets Tous /
Organisation / Personnels, et surtout **usage réel** : un agent créé ici est
sélectionnable dans le Chat et exécutable sur une tâche.

**Depuis 0.14.0, plus d'onglet Employés** : chaque agent créé est mis en service tout
seul, et sa carte ouvre la fiche décrite ci-dessous (état « En service », ou l'étape de
sa mise en service, dont l'installation d'OpenClaw la première fois).

**Bases de connaissances d'un agent** (25/09/2026) : à la création d'un agent et sur
sa carte (« Connaissances de {0} »), le choix des bases que le Chat consulte avec cet
agent. Depuis le 25/09/2026, l'employé OpenClaw de l'agent y cherche aussi (sa fiche,
ses missions, ses messageries). Sous le choix des bases, « Ce qu'il lit hors du Chat »
(`src/components/agents/LectureBases.tsx`) dit ce qu'il lira **réellement**, calculé par
l'instance comme son outil le fait (`POST /helix/employes/<id>/connaissances`), base par
base : « lue : 1 document(s) sur 2 », « non lue : base privée », « non lue : partagée à
des groupes », « non lue : partagée à des groupes dont vous n'êtes pas membre ». En tête,
la règle qui s'applique : pour un agent personnel sans messagerie, sans mission à chaque
mail, encadré et sans outil qui écrit, « il lit ce qui est ouvert à toute l'équipe et ce
qui est partagé aux groupes dont vous êtes membre, jamais vos documents privés », plus
l'avertissement qu'il cesse de les lire dès que l'une de ces conditions tombe, et que
ce qu'il a déjà noté dans sa mémoire peut y rester ; sinon, « il ne lit que ce qui est
ouvert à toute l'équipe, parce que : » et la liste des raisons (ouvert à toute
l'organisation, messagerie, mission à chaque mail, liberté au-delà d'« Encadré »,
outils qui écrivent ou envoient, nommés). Agent pas encore en service : la phrase le dit.
**Vu le 25/09/2026** dans le navigateur, avec une instance jetable : agent personnel
sans outils (« lue : 1 document(s) sur 2 » pour une base partagée au groupe Compta, le
second document étant privé), agent d'organisation avec outils (deux raisons, « non
lue : partagée à des groupes »). La carte d'un employé sans agent dit désormais
« Personnel » quand il l'est (elle disait « Organisation » pour tous).

**Fiche d'un agent en service** (0.11.0, `src/components/agents/Employes.tsx`) : des agents
OpenClaw qui travaillent pour toute l'équipe. « Déployer un employé » ouvre un
formulaire court : nom, poste, outils (ceux qui sont branchés sur l'instance ; les
autres sont grisés, avec la raison), missions régulières (rythme et heure), « agir
sans demander d'accord », modèle s'il y en a plusieurs ; trois exemples le préremplissent.
Chaque carte dit l'état (en service, en pause, arrêté), qui l'a déployé, ses outils
et sa prochaine mission. Le panneau d'un employé : **Discuter** (conversation propre à
chaque personne, qui survit à la fermeture du panneau), **Missions** (et « Lancer
maintenant » pour son propriétaire), **Activité** (comptes rendus des missions),
**Réglages** (propriétaire seulement : poste, outils, missions, pause, autonomie,
retrait). Sans OpenClaw sur la machine de l'instance, l'onglet le dit et explique
quoi installer. Depuis 0.12.0 : choix du **modèle** (local, de l'agence ou cloud par
clé, avec le pays du service), **palier de liberté** (Encadré, Étendu, Libre, ce
dernier sous mot de passe), et onglet **Canaux** : brancher Telegram, WhatsApp (QR
code affiché, à scanner depuis le téléphone), Discord, Slack, Mattermost, voir leur
état, accepter les personnes qui demandent à lui parler.

**Paramètres, Modèles cloud** (0.12.0, `src/components/settings/ModelesCloud.tsx`) :
brancher la clé d'un fournisseur (Mistral, Scaleway, OVHcloud, IONOS, OpenAI,
Anthropic, Google, OpenRouter, ou une adresse compatible OpenAI), la vérifier, choisir
les modèles à proposer, pour soi ou pour l'équipe. Le sélecteur de modèle du Chat
range les modèles par origine (sur vos machines, fournis par votre prestataire, vos
clés, clés de l'équipe) et affiche le pays de chaque modèle cloud.

Les **fichiers de l'agent** (« Ajouter un fichier », « Depuis Helix » qui puise dans
la Bibliothèque ou le dossier de l'équipe) deviennent ses documents de référence ;
« Optimiser les instructions » réécrit les instructions avec le modèle de la machine,
et « Revenir à ma version » les rend telles qu'elles étaient.

### `/taches` Tâches

`src/pages/TachesPage.tsx`. Captures 25 à 29.

Ce qui fonctionne : les trois vues **Kanban**, **Tableau** et **Calendrier** ;
création, modification, statuts (à faire, en cours, terminée, annulée),
priorité, projet, échéance (un jour du calendrier, qui ne change pas selon le
fuseau) ; persistance ; et la **délégation à un agent**
(`src/lib/taskRunner.ts`) : l'agent exécute la tâche, la carte avance toute
seule, la trace des outils et le compte rendu sont conservés.

**Enchaînement (0.19.0).** Champ **« Après »** à la création et dans le détail :
une liste des tâches, avec recherche ; celle qui créerait une boucle est grisée,
« attend celle-ci ». Dès qu'une tâche est choisie, ligne **« Lancement »** :
« D'elle-même, dès qu'elle est terminée » ou « À la main » (interrupteur). Sur la
carte qui attend : « Après « … » » et un bouton inactif « Partira d'elle-même » ou
« En attente » ; si une étape a été annulée : « Bloquée : « … » a été annulée » et
« En attente d'une relance ». Le Tableau porte la même mention sous le titre. Le
détail dit « Attendue par « … » : elle partira quand celle-ci sera terminée ».

Rubriques de gauche : **Boîte de réception** (ni échéance ni projet), **Mes
tâches**, **Aujourd'hui** (échéance du jour, plus les tâches ouvertes en retard,
marquées « En retard »), **À venir**, puis chaque projet avec son compteur.
**Filtre** par statut, priorité et agent, **tri** par échéance, priorité ou mise
à jour dans les deux sens (les tâches sans échéance restent en fin de liste),
appliqués aux trois vues. Le calendrier place les tâches à leur date, en semaine
ou en mois. Vue, rubrique, filtre et tri sont retenus par personne sur le poste.
Une tâche rangée dans un projet reste visible de sa seule propriétaire.

⚠ Non traités : la planification, les rappels d'échéance, l'assignation à un
humain (le champ « Assigné à » existe, il n'ouvre aucun flux).

---

## 4. Bibliothèque, Réunions, Groupes (0.16.0)

Ces trois écrans étaient des maquettes jusqu'à 0.15.0. Ils sont désormais tenus par
l'instance ; le détail de sécurité est dans `SECURITE.md` § 16.

### `/bibliotheque` Bibliothèque

`src/pages/BibliothequePage.tsx`, `src/lib/bibliotheque.ts`,
`gateway/src/bibliotheque.ts`.

Filtres Tous les fichiers (navigation par dossiers, fil d'Ariane), Favoris (étoile
au survol d'une ligne), Privés, Groupes ; recherche dans les noms **et le contenu**
des documents (texte extrait sur le poste). « Nouveau dossier » (nom, qui peut le
voir, emoji, couleur) ; « Importer » ou glisser-déposer sur la page (1 Go par
document, visibilité choisie, reprise de celle du dossier ouvert). Menu de chaque
ligne : Télécharger, Renommer, Qui peut le voir, Déplacer, Supprimer (propriétaire
seulement). Le menu contextuel au clic droit des captures n'est pas repris : les
mêmes actions sont dans le menu « ... » de chaque ligne.

À l'écran, ce module s'appelle **« Fichiers »** ; le code et cette documentation
gardent « Bibliothèque ». Les textes ajoutés le 25/09/2026 disent « Fichiers ».

**Onglet « Bases de connaissances »** (25/09/2026,
`src/components/bibliotheque/BasesConnaissances.tsx`). Une base rassemble des
documents de Fichiers : « Nouvelle base » (nom, description, « Qui peut s'en
servir »), puis sur sa fiche « Ajouter depuis Fichiers », « Importer un fichier »
(le document entre d'abord dans Fichiers), « Tout réindexer », « Modifier »,
« Supprimer la base » (les documents restent dans Fichiers). Tableau des documents :
état (En attente, Découpage..., progression « {0} sur {1} passages », Prêt, Sans
texte, Échec), passages, « Indexé par {0} en {1} s », Réindexer, Retirer de la base.
Les documents qu'on ne voit pas ne sont pas nommés (« {0} autre(s) document(s) ... ne
vous sont pas visibles »). Encadré **« Essayer une question »** : passages trouvés,
similarité, « mots trouvés », durée. Durées et similarités avec la virgule décimale
de la langue. **Vu le 25/09/2026** : base créée, deux documents indexés par
`text-embedding-nomic-embed-text-v1.5`, recherche d'essai correcte.

### `/reunions` Réunions

`src/pages/ReunionsPage.tsx`, `src/lib/reunions.ts`, `gateway/src/reunions.ts`,
`electron/botReunion.cjs`.

Boutons Envoyer le bot (application de bureau seulement, grisé ailleurs avec la
raison), Enregistrer (micro : minuteur, niveau, pause, terminer ; l'enregistrement
continue si l'on change d'écran, un point rouge le rappelle dans la barre latérale),
Importer (audio ou vidéo, 2 Go, avancement), réglages. Bandeau d'installation de
la transcription si Whisper manque ; bandeau du bot automatique s'il est activé.
Cartes des bots en cours (rejoint, attend d'être admis, enregistre depuis…, Voir la
fenêtre, Arrêter). Liste des réunions avec statut (transcription en pourcentage,
compte rendu, prête, erreur). Fiche d'une réunion : compte rendu (résumé, points
clés, décisions, actions à ajouter aux Tâches, modèle qui l'a rédigé), transcription
horodatée avec recherche et copie, audio s'il est gardé, Renommer, Partager,
Exporter en Markdown, Supprimer, Relancer après une erreur.

Les éléments des captures qui citaient Recall et Gladia (services tiers) ont disparu :
tout se fait sur la machine. L'import par « URL média » (YouTube…) n'est pas repris :
il supposait qu'un service tiers aille chercher le son.

### `/groupes` Groupes

`src/pages/GroupesPage.tsx`, `src/lib/groupes.ts`, `gateway/src/groupes.ts`.

Onglets Mes groupes et Tous, recherche, cartes (membres, rôle). Création (nom,
description, membres choisis dans l'annuaire). Fiche : renommer, ajouter des
personnes, nommer ou retirer un responsable, retirer un membre, quitter, supprimer.
Le partage à un groupe se fait depuis la conversation (Partager), la bibliothèque et
la fiche d'une réunion.

## 5. Paramètres

`src/components/settings/SettingsShell.tsx` pour la navigation,
`src/pages/ParametresPages.tsx` pour les pages. Quinze entrées, toutes atteignables
(seize avec Abonnement, éteint en marque blanche), relevées dans `SettingsShell.tsx`
le 25/09/2026.

| Route | Écran | État |
|---|---|---|
| `/parametres/profil` | Profil | ✅ **fonctionne**, photo comprise |
| `/parametres/preferences` | Préférences | ✅ **fonctionne** |
| `/parametres/securite` | Sécurité | ✅ **fonctionne** |
| `/parametres/personnalisation` | Personnalisation de l'IA | ✅ **fonctionne** |
| `/parametres/bot-recorder` | Bot Recorder | ✅ **fonctionne** (0.16.0) |
| `/parametres/mcp` | Connecteurs | ✅ **fonctionne** |
| `/parametres/modeles` | Modèles cloud | ✅ **fonctionne** |
| `/parametres/entrainement` | Entraîner un modèle | ✅ **fonctionne sur Mac à puce Apple** (25/09/2026) ; carte NVIDIA pas essayée, et l'écran le dit |
| `/parametres/abonnement` | Abonnement | ⚠ **écran sans paiement branché**, et il le dit |
| `/parametres/importer` | Importer depuis d'autres IA | ✅ **fonctionne** (24/09/2026, par morceaux depuis le 25/09) |
| `/parametres/ecran` | Contrôle de l'écran | ✅ **fonctionne** |
| `/parametres/integrations` | (redirige vers Connecteurs) | ↪ **supprimé** |
| `/parametres/api` | API développeur | ✅ **fonctionne** (26/09/2026) : clés d'API personnelles et documentation |
| `/parametres/usage` | Mon usage | ✅ **fonctionne** |
| `/parametres/confidentialite` | Confidentialité | ✅ **fonctionne** |
| `/parametres/apps` | Installer les apps | ❌ **maquette** |

### Détail

**Profil** (captures 30 et 31). ✅ Nom et adresse enregistrés dans l'instance
(`POST /helix/auth/profil`). Changer d'adresse exige le mot de passe actuel,
une adresse libre, et n'hérite d'aucune invitation en attente : l'adresse devient
« déclarée » et ne rattache plus rien (voir SECURITE.md § 1.6). ✅ La photo de
profil (0.16.0) : JPEG, PNG ou WebP, recadrée en carré de 256 pixels sur le poste,
vérifiée par l'instance (type réel, 80 Ko au plus), visible dans le choix du compte
à la connexion. Déconnexion fonctionnelle. ✅ **Supprimer mon
compte** (Zone de danger, depuis 0.10.0) : un premier clic ouvre le bilan calculé
par l'instance (conversations, tâches, agents, projets supprimés, projets confiés
et à qui, mentions retirées chez les collègues, journal conservé), puis mot de
passe, code si la double authentification est active, et case « Je comprends que
la suppression est définitive ». Le bouton reste inactif tant que tout n'est pas
rempli. Après suppression, le poste oublie ce qui restait de la personne.

**Préférences** (captures 32 et 33). ✅ La carte **Apparence** : quatre modes,
dont la bascule au coucher du soleil calculée sur le poste. ✅ **Dates et
heures** : formats européen, américain ou ISO, 24 ou 12 heures, appliqués
partout où une date s'affiche (journal d'audit, séances, tâches, usage,
connecteurs, heures du soleil). Le choix suit la personne, pas le poste
(`src/lib/formats.ts`). La langue n'offre plus de faux choix : l'interface est
en français. ✅ **À propos** : version installée et mise à jour réelle
(`MiseAJour.tsx`, depuis 0.10.0). Sept états, dont « aucune adresse de mise à jour
n'est inscrite » (rien n'est contacté), « aucune version plus récente (vérifié
le …) », « version X disponible » avec lien vers le paquet quand l'application n'est
pas signée, barre de téléchargement, puis « Redémarrer pour installer » quand elle
l'est. Le régime, automatique ou manuel, est toujours dit. Dans un navigateur, la
carte n'affiche que la version.

**Sécurité** (capture 34). ✅ La carte **Postes et activité**
(`SeancesEtJournal`) fonctionne : séances ouvertes du compte, révocation une par
une, journal d'audit consultable avec le résultat de la vérification de sa
chaîne, chaque action nommée en français. C'est un ajout Helix. ✅
**Authentification à deux facteurs** (`DeuxFacteurs.tsx`, depuis 0.9.0) :
activation en trois temps (mot de passe redemandé, QR code calculé sur le poste
avec la clé lisible pour une saisie à la main, premier code), dix codes de
secours montrés une seule fois, avec copie ; une fois active, date d'activation,
nombre de codes restants (alerte sous trois), nouvelle série et retrait, chacun
sous mot de passe et code. Le bloc « Vérification de l'email », qui affichait
une coche sans rien vérifier, a été retiré.

**Personnalisation de l'IA** (captures 35 et 36). ✅ Instructions personnalisées,
informations personnelles et gestionnaire de mémoire sont persistés dans le
profil privé (`useProfile`) et réellement injectés dans le message système des
conversations.

**Bot Recorder** (capture 37). ✅ Réglages réels (0.16.0) : nom affiché du bot,
compte Google du bot (facultatif, pour les réunions qui refusent les invités),
rejoindre automatiquement les réunions Google Meet de l'agenda, langue, compte
rendu automatique, conservation de l'audio. « Provider de réunions » des captures a
disparu : il n'y a pas de fournisseur, le bot est celui de l'application.

**MCP** (capture 38). ✅ Les serveurs MCP sont ceux réellement lancés par la
passerelle : état, nombre d'outils, liste des outils, interrupteur de démarrage
et d'arrêt, espace de travail affiché (`fetchMcp`, `toggleMcpServer`). La carte
pédagogique « Qu'est-ce que MCP ? » est un texte fixe. Le badge « Pro+ » et le
bouton « Passer au supérieur » des captures ont été retirés : il n'y a pas de
plan payant. ⚠ On ne peut pas **ajouter** un serveur : la liste est figée dans
`gateway/src/mcp.ts`.

**Contrôle de l'écran**. ✅ Ajout Helix, sans équivalent dans les captures.
Carte **Activation** en tête (depuis 0.10.0) : « Activer sur ce Mac », qui explique
ce que cela implique puis demande le mot de passe (et le code si la double
authentification est active) ; « Désactiver » sans mot de passe ; ou « réglage
verrouillé » avec la raison (profil de déploiement, instance partagée). Puis mode en
vigueur, exigence d'approbation, écran détecté, autorisations macOS manquantes
nommées en clair, bouton « Tester la capture » avec aperçu, installation du modèle
de vision adapté à la machine, et dernières actions. Dans Cowork, le bouton
« Écran » mène à cette page (« Activer le contrôle de l'écran… », ou « Régler ce
qui manque… » quand une autorisation manque), comme « Connecter votre messagerie »
mène aux connecteurs.

**Connecteurs** (remplace MCP et Intégrations). ✅ Écran unique en grille de
tuiles, avec les logos officiels : Courrier, Agenda, Google Drive et Slack (actifs
depuis 0.10.0), plus **Tous les services** depuis 0.22.0 — le catalogue, une seule
tuile parce que les services y sont plus de trente et que la grille du haut doit
rester ce qu'elle est : les quatre branchements que presque tout le monde fait. Drive : « Préparation Google à faire »
tant que le client OAuth manque, avec les étapes pour la console Google ; « Se
connecter avec Google », puis attente de l'accord (collage de l'adresse de retour si
l'instance est sur une autre machine) ; « Connecté : compte » ; « Accès perdu, à
reconnecter ». Slack : étapes et manifeste à copier, champ du jeton ; « Espace
« … » » une fois branché ; « Jeton refusé, à reconnecter ». Panneau sous la grille,
un seul ouvert à la fois. Chaque tuile dit le service, une
ligne de résumé et son état ; le formulaire n'apparaît qu'au clic.

Courrier, une fois la boîte connectée (0.17.0) : bloc **« Envoi de mails »** avec son
interrupteur, coupé par défaut. Chez un fournisseur connu, l'allumer suffit (serveur
d'envoi repris, essayé, retenu) ; sinon, ou via « Choisir le serveur d'envoi »,
serveur, port et chiffrement, puis « Activer l'envoi ». L'erreur du serveur s'affiche
sous le bloc. Une fois l'envoi actif, second interrupteur **« Envoyer sans me
demander »** (coupé par défaut ; allumé, un avertissement dit le risque et
l'exception des mails reçus). Quand un agent veut envoyer, la carte d'approbation (en bas de toute
page) devient **« Un mail est prêt à partir »** : À, Cc, Objet, texte entier dans un
cadre qui défile, « Envoyer » ou « Ne pas envoyer », et « Sans réponse, le mail ne
partira pas ».

**Tous les services (0.22.0).** Sous la tuile, la liste complète : un champ de
recherche, puis sept rubriques (Livré avec le produit, Travail en équipe,
Développement, Documents et données, Vente et relation client, Web et recherche,
Paiement et gestion). Chaque ligne porte une pastille d'état, le nom, une icône qui
dit d'où le service tourne (un globe : chez lui, rien ne s'installe ici ; un
terminal : un serveur sur la machine de l'instance), sa description, et le nombre
d'outils une fois branché.

Deux boutons, et l'écran dit lequel s'applique avant qu'on clique :

- **« Se connecter »** pour les douze services qui publient leur serveur et acceptent
  l'enregistrement dynamique — Notion, Linear, Jira/Confluence, Asana, Sentry,
  Intercom, Canva, Figma, Webflow, Wix, Vercel, Square, PayPal. La page
  d'autorisation qui s'ouvre est celle du service, dans le navigateur du système :
  Helix ne voit jamais le mot de passe. Pendant ce temps, le bouton devient « En
  attente de votre accord… » et l'écran relit l'état tout seul, jusqu'à afficher le
  nombre d'outils obtenus. Pour GitHub, Slack, Box et Airtable, le même bouton
  demande d'abord l'identifiant d'une application à créer une fois chez eux, avec
  l'adresse de retour à y inscrire ;
- **« Connecter »** pour les serveurs à exécuter sur la machine de l'instance : un
  formulaire, un jeton à coller, et l'aide qui dit où le trouver.

En pied d'écran, ce que les deux voies garantissent, écrit en toutes lettres : aucune
ne passe par un tiers, le jeton reste chiffré dans l'instance, et Helix ne lance que
les commandes de son catalogue — jamais une commande venue de cet écran.

Pièces jointes du Chat (0.18.0) : un fichier texte de toute taille est accepté, sa
puce porte « (début) » quand seul le début est lu (l'infobulle dit pourquoi et
renvoie à la Bibliothèque) ; une photo lourde est réduite au lieu d'être refusée.

Dans le Chat, la puce **Outils** est retenue d'un Chat à l'autre (0.17.0), et les
traces d'outils disent l'action en français (« Envoi d'un mail », « Lecture d'un
fichier ») au lieu du nom technique.

L'ancien écran **Intégrations** a été supprimé. Il existait en double avec
Connecteurs, et un utilisateur cherchant à brancher sa boîte aux lettres
cliquait sur l'un quand le formulaire était sur l'autre. Il affichait par
ailleurs « Google connecté » avec l'adresse du compte local, sans aucune
connexion réelle. Son adresse redirige vers Connecteurs.

Les logos sont les tracés CC0 de Simple Icons, recopiés dans
`src/components/ui/marques.ts`. Slack et Outlook ont une icône neutre : ces deux
sociétés ont demandé le retrait de leur logo des bibliothèques d'icônes. Les
couleurs de marque sont en hexadécimal, entorse assumée à la règle des tokens :
ce sont des données imposées par ces sociétés, pas des couleurs d'interface.

**API développeur** (`src/components/settings/ClesApi.tsx`, 26/09/2026). ✅ Données
réelles de l'instance (`/helix/cles-api`). En haut : ce qu'une clé permet, et
« Créer une clé » (nom, expiration 30 jours, 90 jours, 1 an ou sans expiration). La
clé créée s'affiche **une fois**, dans un encart d'avertissement, avec un bouton
Copier (si le navigateur refuse la copie, la valeur est sélectionnée et l'écran le
dit) et « J'ai copié la clé » qui la fait disparaître. Liste : nom, `hlx_•••• fin`,
créée le, dernière utilisation, expiration (pastille « Expirée »), Renommer, Révoquer
avec confirmation (« les programmes qui s'en servent seront refusés dès
maintenant »). En dessous, « Utiliser l'API » : l'adresse de base telle que la
passerelle la sert (`http://localhost:<port>/v1`, `https` si elle chiffre, et les
adresses réseau si l'instance est ouverte aux collègues, sinon la phrase qui dit
qu'elle n'est pas joignable d'ailleurs), exemples `curl` et Python (`openai`, sans et
avec flux) remplis avec un vrai modèle de l'instance et une variable d'environnement
nommée d'après la marque, l'usage du champ `connaissances` avec la liste des bases de
la personne et leurs identifiants, la liste des modèles, ce qu'une clé ne permet pas,
et les limites (60 requêtes par minute, 20 clés). Vu dans le navigateur le
26/09/2026 sur une instance jetable, en français et en chinois ; l'exemple `curl` a
été recopié de l'écran et exécuté tel quel. Pas vu dans l'application de bureau.

**Mon usage** (captures 41 et 42). ✅ Données réelles : requêtes, jetons
d'entrée et de sortie (dont ceux de raisonnement), courbe par jour, table par
modèle, sur quatre périodes. Coût « gratuit » pour un modèle local, calculé pour
un modèle distant dont le tarif est renseigné, « tarif non renseigné » sinon.
Chacun ne voit que sa propre consommation. L'ancien écran affichait un budget,
une courbe et un modèle qui n'avaient jamais existé.

**Confidentialité** (captures 43 et 44). ✅ « Télécharger mes données » produit
l'export RGPD réel (`GET /helix/export`, SECURITE.md § 7.1) : un fichier JSON
nommé d'après la marque et le jour, puis un résumé de ce qu'il contient. La liste
affichée des rubriques est exactement celle du fichier ; l'ancienne annonçait
documents, réunions et retours, qui n'existent pas. Le droit à l'effacement
renvoie au délégué : l'écran affirmait qu'on supprimait son compte depuis le
profil, ce qui n'existe pas. L'adresse du DPO vient de `branding.ts`.

**Installer les apps** (capture 45). ⚠ Les boutons « Télécharger pour … » sont
grisés et le disent (« bientôt disponible »), l'onglet Mobile aussi. L'onglet
**CLI** (25/09/2026, `LigneDeCommande.tsx`) est actif dans l'application de bureau :
« Mettre en place » pose `~/.local/bin/helix` (et une ligne marquée dans
`~/.zprofile` si ce dossier manque au PATH), « Mettre à jour » quand le lanceur vise
une autre copie de l'application, « Retirer » enlève les deux ; suivent les
commandes pour commencer. Dans un navigateur, l'onglet le dit au lieu d'offrir un
bouton. Le
lien « Voir toutes les versions » mène à l'URL de `branding.ts`. Seule
l'application macOS est construite et éprouvée ; Windows et Linux figurent dans la
configuration d'empaquetage sans avoir jamais été construits, et l'écran le dit.

---

## 6. Ajouts Helix sans équivalent dans les captures

Ces éléments ne viennent pas de la maquette d'origine. Ils sont documentés ici
pour que personne ne les cherche dans `screenshots/`.


### Importer depuis d'autres IA (24/09/2026)

Paramètres > « Importer depuis d'autres IA » : une carte **« Depuis les
logiciels de cet ordinateur »** liste les logiciels d'IA trouvés (Claude Code,
Codex, Cursor : nombre de conversations, instructions ; ChatGPT et Claude :
pourquoi on ne peut pas les lire), avec « Reprendre ». La suite est celle de
l'import d'archive : choix des Chats et des projets, place disponible, bilan.

**Par morceaux, depuis le 25/09/2026** : pendant la lecture, « Lecture des
conversations : {0} sur {1}... » (les plus récentes d'abord) ; à l'import, « Chargement
des Chats : {0} sur {1}... », avant la création des projets et des agents. Un Chat
devenu illisible entre-temps est compté à part dans le bilan. Un logiciel sans
conversation ni instructions a son bouton désactivé. **Vu le 25/09/2026** : 5 lots pour
Claude Code, 19 Chats listés ; Cursor, à 0 conversation, bouton désactivé.

**Où les Chats ont vraiment été gardés** (25/09/2026) : dans l'application de bureau,
le bilan attend l'écriture du fichier chiffré. Si le fichier l'a refusée, l'encart passe
en avertissement et le dit : Chats gardés pour l'instant dans le stockage du navigateur
(quelques Mo), ou, si celui-ci est plein aussi, seulement en mémoire et perdus à la
fermeture ; puis si l'instance en a reçu la copie ou non (et quoi faire). **Vu le
25/09/2026** dans l'application de bureau, profil d'essai, dossier des Chats rendu non
inscriptible et stockage du navigateur rempli : « 2 Chat(s) repris sur 2. Ni le fichier
chiffré de cet ordinateur ni le stockage du navigateur n'ont pu les garder […] L'instance
en a reçu la copie : ils y restent. »

### Entraîner un modèle (25/09/2026)

Paramètres > **Entraîner un modèle** (`src/components/settings/EntrainerModele.tsx`).
En tête : ce que la machine permet (raison, modèle de départ et sa licence,
avertissement « pas encore essayé » quand c'est le cas), puis « Installer le moteur
d'entraînement » avec la place et le téléchargement annoncés, ou « Retirer le
moteur ». « Vos modèles » : un modèle par sujet, avec son nombre d'exemples, « à
relire », « entraîné », « installé ». Puis quatre étapes :

1. **Exemples** : saisie question et réponse, « Importer un CSV ou un JSONL »,
   « Tirer des exemples d'un document » (lu par le modèle du Chat ; les paires vont
   dans « propositions à relire », avec « Tout garder » et « Tout écarter » : rien
   n'est appris sans accord).
2. **Entraîner** : durée estimée, place du modèle, exemples mis de côté ; pendant le
   calcul, pas, erreur sur les exemples appris et mis de côté, temps restant,
   mémoire, et « Arrêter ».
3. **Comparer** : les exemples mis de côté et jusqu'à cinq questions libres, au modèle
   de départ et au modèle entraîné, côte à côte, sans note automatique.
4. **Installer** dans LM Studio, après l'avertissement que le modèle sera visible de
   toute l'équipe ; « Retirer de LM Studio ». Le modèle apparaît dans le sélecteur du
   Chat sans devenir « Rapide ».

**Vu le 25/09/2026** : l'écran ; « Tirer des exemples d'un document » avec Qwen3 8B,
8 paires couvrant les 5 faits d'un règlement. L'installation du moteur et un
entraînement complet ont été vus dans le navigateur par la branche d'origine, pas
refaits ce jour-là.

### Ligne de commande `helix` (25/09/2026)

Pas un écran, mais une surface : `helix` dans un terminal (Chat, `chat --outils`,
`code`), avec les actions de l'agent affichées « ✓ Écriture bonjour.txt » et les
demandes d'accord « Autoriser ? [o/N] ». Textes en français seulement
(`cli/textes.mjs`). Détail dans docs/GUIDE.md.

### Extension VS Code (24/09/2026)

Icône Helix dans la barre de VS Code : onglets **Chat** (« Joindre le fichier
ouvert », « Insérer » sur chaque bloc de code) et **Code** (actions de l'agent
affichées « ✓ Écriture index.html »). Clic droit sur une sélection :
« Helix : expliquer / améliorer la sélection ».

### Apparence, quatre modes

`src/lib/store/apparence.ts`, `src/hooks/useApparence.ts`,
`src/styles/tokens.css`, `src/lib/soleil.ts`. Réglé dans Paramètres,
Préférences.

| Mode | Comportement |
|---|---|
| **Au coucher du soleil** (défaut) | Sombre la nuit, clair le jour |
| **Clair** | Toujours clair |
| **Sombre** | Toujours sombre |
| **Réglage du système** | Suit l'apparence de macOS (`prefers-color-scheme`) |

Le réglage est propre au **poste**, pas au compte : l'écran de connexion
s'affiche avant qu'on sache qui est là, et la bonne apparence dépend de la pièce
et de l'heure, pas de la personne.

Le thème sombre est un jeu complet de tokens sous
`:root[data-theme="sombre"]` dans `src/styles/tokens.css`. Ce n'est pas la
palette claire inversée : la dominante chaude est conservée et ramenée dans les
valeurs basses, et l'accent émeraude est éclairci (46 % au lieu de 38 %) pour
rester lisible sur fond sombre. Aucune couleur n'est écrite ailleurs que dans ce
fichier.

**Les heures du soleil sont calculées sur le poste, sans réseau**
(`src/lib/soleil.ts`). L'équation du temps usuelle donne lever et coucher à la
minute près. La position vient du **fuseau horaire du système**, rapproché d'une
table de 43 villes orientée Europe. Aucune géolocalisation n'est demandée,
aucun service n'est interrogé : envoyer la position de l'utilisateur à un tiers
pour un réglage d'affichage serait contradictoire avec le produit.

Quand le fuseau est absent de la table, ou aux latitudes où le soleil ne se
couche pas, le calcul renvoie « je ne sais pas » et le mode **suit alors le
réglage du système** plutôt que d'inventer une heure. L'écran de réglage le dit.

La bascule est programmée pour l'instant exact du lever ou du coucher, jamais
plus d'une heure à l'avance : `setTimeout` ne rattrape pas une mise en veille.

Un petit script dans `index.html` repose le dernier thème appliqué **avant le
premier rendu**, à partir de `localStorage`. Sans lui, l'application s'ouvrirait
en clair puis virerait au sombre : un éclair blanc en pleine nuit.

### Préparer Cowork, atelier bureautique

`src/components/cowork/PreparerCowork.tsx`, `src/lib/atelier.ts`,
`gateway/src/atelier.ts`. Carte du panneau droit de Cowork, placée après les
compétences.

Cowork sait manipuler des fichiers, mais il ne sait produire ni relire un
document Word, Excel, PowerPoint ou PDF tant que la machine ne porte pas les
bibliothèques correspondantes. La carte présente en trois temps :

1. **Diagnostic**, en lecture seule : outils système présents (Python, pip,
   Node, npm), bibliothèques installées ou manquantes, outils optionnels
   (LibreOffice, Poppler), obstacles écrits pour quelqu'un qui n'est pas
   informaticien, et place estimée.
2. **Confirmation** : nombre de bibliothèques, taille en mégaoctets, dossier
   exact (`<HELIX_DATA_DIR>/cowork`, par défaut `~/.helix/cowork`), et la
   mention explicite qu'aucun logiciel, projet ou réglage de la machine n'est
   modifié et qu'aucun mot de passe administrateur n'est demandé.
3. **Installation** puis **vérification** : les épreuves produisent puis
   relisent un document de chaque format, dans un dossier temporaire effacé
   ensuite.

Tout est déposé dans un environnement isolé : un environnement virtuel Python et
un préfixe npm sous `<HELIX_DATA_DIR>/cowork`. La liste des paquets est figée
dans le code de la passerelle, **le modèle ne décide rien**.

Une fois l'atelier installé, cinq outils sont proposés au modèle
(`gateway/src/bureau.ts`) : créer un document Word, un classeur Excel, une
présentation PowerPoint, un PDF, et relire ces quatre formats. Ils ne sont
offerts que si l'atelier est là, et Cowork n'en annonce l'existence au modèle
que dans ce cas (`BUREAU_ROLE`, `src/pages/CoworkPage.tsx`).

⚠ Ces cinq outils **n'apparaissent pas dans la carte Compétences** du panneau
droit : celle-ci ne liste que les outils des serveurs MCP
(`src/components/cowork/CoworkPanel.tsx`), et les outils bureautiques sont
fournis par la passerelle elle-même. L'utilisateur ne voit donc nulle part ce
que Cowork sait produire, ce qui mérite d'être corrigé.

Le modèle fournit des **données**, jamais du code : les scripts sont des
constantes du module, les paramètres voyagent en JSON sur l'entrée standard, et
chaque chemin est résolu par `realpath` puis comparé à la racine de l'espace de
travail.

⚠ Ce n'est pas un outil d'exécution générique : cinq gabarits, pas davantage. Un
graphique, une mise en forme fine ou une conversion de format ne sont pas
réalisables.

### Découpage des tâches lourdes

`gateway/src/plan.ts`, boucle par étapes dans `gateway/src/chat.ts`. Visible
dans la conversation : « Le modèle juge s'il faut découper la demande... »,
puis le plan, les étapes annoncées une à une (les parties d'une étape
redécoupée, en retrait, sous elle), et un récapitulatif final.

Un petit modèle ne tient pas un plan de douze actions. **C'est lui qui juge**,
à chaque demande, s'il faut découper (0.20.0) : un premier appel court, sans
outils et sans raisonnement (1 à 3 secondes mesurées sur qwen3-8b), lui montre
la demande et la conversation qui précède. Une question ou une action simple
part en direct ; un travail composé revient en plan, avec l'objectif reformulé
en entier (une demande comme « vas-y » ne se comprend qu'avec la conversation).
La passerelle exécute ensuite **une étape à la fois**, chacune avec sa propre
boucle d'outils et un contexte réduit. L'avancement est tenu par l'instance,
pas par le modèle.

**Une étape trop grosse est redécoupée**, au lieu d'arrêter le travail : actions
épuisées, ou agent qui décrit au lieu de faire, et le modèle en fait 2 à 8
parties plus petites, en tenant compte de ce qu'elle a déjà fait. Jusqu'à trois
niveaux, 60 étapes au plus pour une demande.

**Rédaction longue** (outils coupés) : un rapport, un dossier, un compte rendu
jugés longs par le modèle sont écrits partie par partie, chaque partie avec le
plan entier sous les yeux et la fin de la précédente pour enchaîner.

**Le régime s'adapte à la taille du modèle** (fonction `strategie`). Barème exact
du code :

| Taille annoncée | Découpage | Budget d'outils par étape | Budget en exécution directe |
|---|---|---|---|
| moins de 14 milliards | jugé par le modèle, étapes courtes | 8 | 30 |
| de 14 à 45 milliards | jugé par le modèle, étapes larges | 14 | 40 |
| 45 milliards et plus | jamais | 20 | 50 |
| inconnue, moteur **local** (`lmstudio`) | jugé par le modèle, par prudence | 8 | 30 |
| inconnue, moteur **distant** | jamais, supposé capable | 8 | 50 |

La taille vient du nombre de paramètres annoncé par le backend ; à défaut, elle
est estimée à partir de la taille du fichier, à raison d'environ 0,6 Go par
milliard de paramètres. Le budget d'exécution directe est plafonné par
`HELIX_MAX_ETAPES`, **30 par défaut**. Un premier plan compte au plus 15 étapes ;
un plan d'une seule étape est abandonné. **Une demande qui porte une image
n'est jamais découpée** : les étapes repartent d'un contexte réduit au texte.

Garde-fous appris en essai réel :

- **ce qui passe d'une étape à l'autre, c'est ce que les outils ont lu**, pas
  seulement le résumé du modèle : le nom de chaque fichier lu et un extrait de
  son contenu. Mesuré sur qwen3-8b : résumé en « les clients sont Martin,
  Dupuis et Rose », la correspondance facture-client s'était perdue et deux
  factures ont été rangées chez le mauvais client ; avec les relevés, les
  quatre sont au bon endroit ;
- **une étape se juge à ce que les outils ont rendu, pas à ce que dit le
  modèle.** Une étape d'action sans modification réussie, ou dont des
  modifications ont échoué, est reprise une fois avec le message d'erreur sous
  les yeux ; « rien à faire » n'est accepté que si le modèle a vérifié l'état
  réel (au moins une lecture) sans échec. Mesuré : huit déplacements refusés
  par le serveur de fichiers, un compte rendu « les factures ont été
  déplacées », et l'ancien code affichait « fait » ;
- **une étape qui a modifié quelque chose est contrôlée** : le modèle regarde
  l'état réel avec ses outils de lecture, finit ce qui manque, et son nouveau
  compte rendu remplace l'ancien (l'étape affiche « contrôlée »). Mesuré sur
  qwen3-8b : vingt et un fichiers renommés sur vingt-quatre, aucune erreur
  d'outil, et « les 24 fichiers ont été renommés » ; aucun contrôle des retours
  d'outils ne voit ce qui n'a pas été tenté. **C'est ce constat qui tranche** :
  s'il a regardé sans échec, l'étape est faite, même si des tentatives
  intermédiaires avaient raté ; s'il n'a pas regardé, le verdict des outils
  tient ;
- **un fichier s'écrit d'un seul jet** : un plan qui crée un fichier vide puis
  y revient (menu, contenu) est regroupé en une étape « écrire ce fichier en
  entier » ; le planificateur reçoit un exemple de plan de site, qu'un petit
  modèle suit bien mieux qu'une règle. Mesuré sur qwen3-8b : un site planifié
  par morceaux s'est arrêté au milieu, faute de savoir modifier un fichier par
  morceaux ; écrit fichier par fichier, il a abouti ;
- **revue finale de la demande entière** : une fois les étapes faites, le
  modèle relit la demande d'origine contre les fichiers (rien de manquant, rien
  en double, rien en trop, ce qui doit être identique l'est) ; ce qui manque
  devient des étapes de complément, deux tours au plus. Mesuré : un site dont
  toutes les étapes étaient « faites » avait une feuille de style vide ;
- **le contrôle d'une étape ne juge que cette étape** : il reçoit la liste des
  étapes suivantes, qu'il ne doit pas compter comme manquantes (mesuré :
  « créer le dossier » jugée incomplète faute d'application écrite, et
  redécoupée en toute l'application) ; une étape est une **lecture** si son
  premier verbe l'est (« lire le dossier … à remplacer » n'est pas une action),
  et lire ce qui n'existe pas encore est un constat transmis, pas une panne ;
  un redécoupage ne reprend jamais un fichier qu'une étape suivante écrit ;
- **la revue finale reçoit le contenu des fichiers modifiés**, relu par
  l'instance (16 000 caractères au plus) : mesuré, sans lui le modèle concluait
  « tout est fait » sans avoir relu un fichier ; elle vérifie aussi la langue
  des textes affichés et l'effet immédiat de chaque action. Une revue qui ne
  conclut pas est dite « non concluante », pas « manques » ;
- **contrôle automatique du code web** (`gateway/src/controleWeb.ts`) : un
  programme, pas un avis. Il vérifie les fichiers liés (style, script, image,
  lien entre pages), les fonctions appelées depuis le HTML, les éléments
  cherchés par un script, la syntaxe JavaScript et CSS, le script qui vide le
  conteneur de ses propres champs, la page à accents qui ne déclare pas son
  encodage (« tĆ¢ches »), la classe posée par un script qu'aucune règle de style
  ne peut atteindre (une coche qui ne barre jamais), le script ou la feuille
  qu'aucune page ne charge, et les textes d'interface en anglais quand la
  demande est en français. La revue finale le lance sur les fichiers
  modifiés, le donne au modèle à corriger, le relance ; ce qui reste figure au
  récapitulatif. Le modèle peut aussi l'appeler (« Contrôle du code web »).
  Mesuré : une liste de tâches « relue et terminée » dont la page ne chargeait
  ni son style ni son script, dont le bouton appelait une fonction absente, et
  dont le script effaçait son propre champ de saisie ;
- **un appel d'outil au JSON mal refermé est réparé**, sur la forme seulement
  (accolade finale oubliée, virgule en trop) ; **jamais une valeur coupée en
  route** : refermer « decoupe/notes/202… » en fait un vrai chemin, faux.
  Mesuré avant cette règle : une note renommée « 202 ». L'appel est alors
  refusé et le modèle le refait ;
- **une étape redécoupée est contrôlée dans son ensemble** une fois ses parties
  faites (un sous-plan avait oublié une note), et un redécoupage part de l'état
  réel constaté en dernier, pas de ce qui avait été annoncé ;
- **déplacer un fichier vers un dossier le range dedans**, comme `mv` : c'était
  la cause de ces huit refus (le modèle donnait le dossier comme destination) ;
- une **étape ratée, et impossible à redécouper, arrête le plan**. Les
  suivantes s'appuyaient sur ce qu'elle devait produire ; les lancer quand même
  revient à demander au modèle de travailler sur une information qu'il n'a pas,
  et il l'invente. Le récapitulatif, construit à partir des retours des outils,
  dit où le travail s'est arrêté, pourquoi, et ce qui n'a pas été lancé.

### Écrans de mise en route

`src/pages/InstanceSetupPage.tsx`, `src/pages/LoginPage.tsx` et
`src/components/onboarding/FirstRun.tsx`. Sans équivalent dans les captures.
Rattachement du poste (machine seule, ou adresse et jeton d'une instance
d'entreprise), puis création du premier compte ou connexion.

**Installation du moteur** (FirstRun, poste sans LM Studio) : le moteur est nommé,
avec son éditeur, et l'installation exige de cocher « Mon entreprise accepte les
conditions d'utilisation de LM Studio », avec le lien vers ces conditions. La
passerelle refuse l'installation sans cet accord, et le consigne au journal.

L'écran de connexion a quatre étapes possibles : choix du compte (un cadenas
pour ceux qui ont un mot de passe, « Mot de passe à choisir » pour un compte
créé avant 0.9.0), mot de passe, **premier mot de passe** (avec confirmation),
et **code de vérification** quand la double authentification est active (code
de l'application ou code de secours). Quand l'instance l'**impose** et que le
compte ne l'a pas encore : QR code et clé lisible, premier code, puis les dix
codes de secours avec copie, avant d'entrer. La création exige un mot de passe de 10
caractères et sa confirmation : le bouton reste inactif sinon. La carte défile
quand la fenêtre est basse. Voir `SECURITE.md` § 2.

---

## 7. Coquille applicative

`src/components/layout/`. Conforme aux captures, à une exception près.

- **Fenêtre** : barre de titre native discrète. Sur macOS, feux tricolores
  calés à 12 px du rail replié.
- **Barre latérale** : en-tête de marque, bloc de navigation principal
  (Chat, Cowork, Code avec badge BETA), bouton « Nouveau Chat », liste
  secondaire (Projets, Agents, Bibliothèque, Réunions, Groupes, Tâches),
  recherche, liste des conversations, pied avec avatar, thème, notifications,
  réglages et aide. Les entrées sont filtrées par les modules actifs.
- **Barre latérale repliée** : rail d'icônes, mêmes entrées.

**Chaque chat porte trois actions au survol (0.22.0)** : partager, **archiver**,
supprimer. Archiver range le chat sous « Archivés », en bas de la liste, repliable et
compté ; rien n'est effacé, et un clic le remet en place. C'est un rangement
personnel : archiver un chat partagé ne le retire pas de la liste des autres.
Supprimer efface les messages pour de bon, sans corbeille — d'où l'intérêt d'avoir
les deux gestes côte à côte. Vérifié dans le navigateur : archivage, section
« Archivés (1) », désarchivage, et la marque enregistrée dans l'instance
(`archivedBy`), donc retrouvée sur un autre poste.

**La cloche de notifications fonctionne (0.22.0)** : pastille comptant les non lues,
panneau qui s'ouvre vers la droite (aligné à gauche du bouton : aligné à droite, il
sortait de l'écran), « Tout lu » et « Effacer », et cinq genres d'entrées — mise à
jour de l'application, mise à jour du moteur des agents, accord attendu, tâche
terminée ou en échec, chat partagé. Un clic ouvre l'écran concerné et marque l'entrée
lue. Rien n'est inventé : chaque entrée vient d'une source déjà en place.

**Le « ? » ouvre l'aide (0.22.0)** : douze articles en français, cherchables sans
accent ni casse, écrits pour dire ce que le logiciel fait vraiment, limites comprises.
Tout est embarqué : l'aide fonctionne sans Internet. En pied de fenêtre, l'adresse de
support de l'intégrateur, le lien vers son site, et un bouton qui copie les
informations techniques (version, cadre d'exécution, adresse d'instance, système) —
ni messages, ni documents, ni clés.

**Bandeau « fichier des Chats illisible »** (25/09/2026,
`src/components/layout/AvisChatsIllisibles.tsx`) : par-dessus l'écran, où que l'on
soit, quand le fichier chiffré des Chats du poste n'a pas pu être lu au démarrage. Il
dit ce qui s'est passé (trousseau refusé ou verrouillé, fichier qui ne se déchiffre pas,
fichier qui ne s'ouvre pas), que rien n'est effacé avec le chemin de la copie gardée,
ce qui va se passer selon ce que l'instance a répondu (en cours de relecture, Chats
rendus avec leur nombre, aucun Chat sur l'instance, instance pas relue, instance
injoignable, place pleine), et ce que la personne peut faire (redémarrer, autoriser le
trousseau, contacter l'administrateur). Une croix le ferme ; il revient si la situation
change. Il ne promet jamais le retour des Chats tant que l'instance ne les a pas rendus.
**Vu le 25/09/2026** dans l'application de bureau (profil d'essai, fichier remplacé par
des octets quelconques) : « Vos Chats sont revenus depuis l'instance » avec les trois
Chats dans la liste, puis, l'instance coupée, « L'instance n'est pas joignable : vos
Chats reviendront d'elle au prochain démarrage où elle répondra ». Pas vu : le trousseau
refusé (ce cas n'a pas été provoqué).

Depuis 0.16.0, toutes les entrées de la navigation mènent à un écran qui fonctionne.
Depuis 0.22.0, plus rien n'est grisé au pied de la barre.

**Écran de connexion (0.23.0)** : sous le mot de passe, un interrupteur « Rester
connecté sur ce poste », et une phrase qui dit ce qu'il fait vraiment — le mot de
passe n'est conservé nulle part, c'est la séance qui dure trente jours au lieu de
douze heures, et elle se révoque dans Réglages, Sécurité. Le choix suit toute la
connexion, second facteur compris.

**Réglages, Profil → Collègues (0.23.0)** : carte « Inviter un collègue ». Une
adresse, un bouton, et le collègue reçoit un mail contenant l'adresse de
l'instance et un code. Les invitations en attente sont listées avec leur date de
péremption et un bouton « Annuler ». Sans boîte aux lettres branchée sur
l'instance, l'écran le dit et affiche les deux lignes à transmettre de vive voix,
en chasse fixe : c'est ce que la personne va dicter.

**Écran de mise en route (0.23.0)** : le second champ s'appelle désormais
« Code d'invitation, ou jeton d'instance », et l'aide change selon ce qui est
tapé. Le code n'est pas masqué : il se recopie depuis un mail, souvent à la
main, et le masquer ferait échouer une saisie sur deux sans rien protéger.

**Écran de connexion, sur invitation (0.23.0)** : la personne arrive directement
sur la création de compte, l'adresse pré-remplie et verrouillée (c'est celle du
code), avec un encart qui dit que le mot de passe n'appartiendra qu'à elle.

**Réglages, Préférences → Langue (0.25.0)** : trois cartes, chacune portant le
nom de sa langue dans sa propre langue — Français, English, 中文 — avec la part
réellement traduite, mesurée sur le catalogue et non déclarée. Une phrase sous
le titre prévient que le choix recharge la page, et une autre, en bas, dit ce
qui n'est jamais traduit : ce que vous écrivez, et certains messages venus de
l'instance.

**Cowork, panneau de droite (0.24.0)** : deux cartes là où il n'y en avait
qu'une. « Outils » liste ce que les connecteurs savent faire. « Procédures »
liste ce que la maison sait faire : chaque procédure porte un interrupteur, se
modifie d'un crayon, et une ligne dit combien de caractères partent au modèle à
chaque message. « Créer une compétence » ouvre un formulaire de trois champs
(nom, quand s'en servir, la procédure) et n'est plus grisé.

**Réglages, Abonnement (0.24.0)** : écran présent uniquement quand le module est
allumé, c'est-à-dire chez le prestataire qui héberge les modèles, jamais dans une
installation en marque blanche. Il commence par dire que le logiciel est gratuit
et que ce qui se paie est le calcul ; puis les deux modèles proposés, avec leur
pays d'hébergement ; puis quatre formules (10, 20, 100, 200 € par mois) avec les
jetons compris et leur équivalent en échanges et en pages. Il se termine par un
encart d'avertissement : les formules ne sont pas ouvertes, rien n'encaisse, les
prix sont une proposition. Le seul bouton ouvre la messagerie de la personne.

**Réglages, Profil → Ouvrir l'instance (0.24.0)** : une fois l'instance ouverte,
les adresses ne sont plus alignées en vrac. Deux blocs nommés : « Vos collègues sont
sur le même réseau » (même Wi-Fi, même câble) et « Vos collègues sont ailleurs ».
Le second affiche l'adresse du tunnel quand un réseau privé est actif sur la
machine, et sinon explique ce qu'il faudrait — sans jamais conseiller d'ouvrir un
port sur la box. Chaque adresse porte un bouton « Copier ». Un encart rappelle que
cette machine doit rester allumée, et qu'une équipe qui travaille en continu a
besoin d'une machine qui ne s'éteint pas.

**Réglages, Profil → Inviter un collègue (0.24.0)** : après l'envoi, trois lignes
à copier plutôt qu'à recopier — le lien (un clic suffit), l'adresse, le code —
chacune avec son bouton et une phrase qui dit à quoi elle sert.

**Écran de mise en route, sur lien d'invitation (0.24.0)** : les deux champs
arrivent remplis, et un encart nomme l'instance visée : « Elle rattachera ce poste
à <adresse>. Si cette adresse ne vous dit rien, n'allez pas plus loin. » Le
rattachement n'est **pas** automatique : un lien peut venir d'ailleurs que du mail
attendu. Quand le poste est déjà en service, un second encart le dit et le bouton
de retour devient « Rester sur ce poste ». Le champ d'adresse accepte aussi qu'on
lui colle le lien entier : il le découpe et remplit les deux champs.

**Réglages, Sécurité (0.23.0)** : une séance ouverte ainsi porte la mention « reste
connecté » à côté de « ce poste ». Et le journal d'activité dit désormais ce qu'on
regarde : « vous voyez vos propres actions, et celles de l'instance elle-même » ou,
pour la personne qui administre l'instance, qu'elle voit l'activité de tout le monde,
en précisant d'où lui vient ce rôle (profil de déploiement, ou premier compte créé).

---

## 8. Questions ouvertes de l'inventaire d'origine

Reprises ici avec ce qui a été tranché.

| Question de juillet 2026 | Tranchée |
|---|---|
| « Discussion » ou « Chat » | ✅ **Chat**, choix client du 24/07/2026 |
| Libellé « Majordome » pour l'agent par défaut | ✅ retenu |
| Couleur d'accent : émeraude ou coral | ✅ **émeraude** (`--accent`). Le token `--coral` n'existe plus nulle part dans le code |
| Barre de fenêtre macOS ou Windows | ✅ barre native, calage macOS |
| Noms de marques tierces (modèles, fournisseurs) | ✅ remplacés par le catalogue réel de la passerelle, et les connecteurs par des services réellement branchables |
| API développeur : page ou hors périmètre | ✅ page d'attente assumée, puis écran réel le 26/09/2026 (clés d'API) |
| Menu contextuel clic droit de la Bibliothèque | ↪ remplacé par le menu « ... » de chaque ligne (mêmes actions) |
| Graphique de coût : librairie ou SVG maison | ✅ SVG maison, sans dépendance. Les données restent fictives |
| Section « Organisation » des paramètres | ❌ non construite, aucune capture ne la montrait |

---

## 9. Récapitulatif pour un client

**Ce qui est livré et fonctionne** : Chat, Cowork, Code, Projets, Agents,
Bibliothèque, Réunions, Groupes, Tâches, et dans les paramètres : Profil (photo
comprise), Préférences, Sécurité (postes, journal, double authentification),
Personnalisation de l'IA, Bot Recorder, Connecteurs, Modèles cloud, Contrôle de
l'écran, API développeur (clés d'API, depuis le 26/09/2026), Mon usage,
Confidentialité (export RGPD).

**Ce qui est annoncé « bientôt » et le dit à l'écran** : le téléchargement direct
dans Installer les apps, « Créer une compétence ».

**À éprouver avant de le promettre** : le bot de réunion dans une vraie réunion
Google Meet (il l'a été face à une réunion simulée).
