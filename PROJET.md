# Helix — intention, décisions, état

Ce document est la mémoire du projet. Les autres décrivent le code tel qu'il est ;
celui-ci dit **pourquoi il est ainsi**, ce qui a été écarté, et ce qui a changé d'avis
en cours de route.

Il existe parce que le développement s'est étalé sur plusieurs sessions de travail
séparées, et qu'une décision dont on a perdu la raison finit toujours par être
refaite à l'envers.

| | |
|---|---|
| Version | 0.27.0 (`package.json`) |
| Dernière mise à jour | 25 septembre 2026 |
| Documents liés | [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITE.md](SECURITE.md), [SCREENS.md](SCREENS.md), [SIGNATURE.md](SIGNATURE.md), [README.md](README.md), [docs/GUIDE.md](docs/GUIDE.md) |

---

## 1. Ce qu'est Helix, et pour qui

**HelixAI**, une plateforme d'intelligence artificielle **open source**, en marque
blanche. Chaque organisation installe **sa propre instance**, chez elle, à son
identité visuelle (§ 3.8). Précisé par le client le 14/09/2026 : « je vends rien,
c'est open source ». Rien n'est hébergé ni revendu par le projet ; les mentions de
« l'agence » qui suivent désignent l'intégrateur qui installe et règle une instance,
quand il y en a un.

L'ergonomie a été reproduite d'après les captures d'un logiciel concurrent, puis
rhabillée aux couleurs de l'agence. On a reproduit une **architecture d'interface**,
jamais une marque : aucune trace du concurrent ne subsiste, ni nom, ni logo, ni
palette, ni nom de fichier, ni commentaire.

### La contrainte qui commande tout

**Souveraineté stricte : européen ou local.** Aucun fournisseur de modèle américain.

**Précisé par le client le 13/09/2026 :** la règle vise les **services** de modèles,
pas l'origine des poids. Un modèle aux poids ouverts, quelle que soit sa provenance
(américaine, chinoise ou autre), est accepté dès lors qu'il tourne sur la machine du
client ou chez un hébergeur européen : l'éditeur ne voit rien, ne facture rien et ne
peut rien couper. Ce qui décide, c'est la **licence** : Apache 2.0 ou MIT de
préférence ; une licence « maison » (Gemma, Llama, Qwen pour certains formats) impose
des obligations commerciales et se pèse au cas par cas. Un client peut toujours
exiger mieux (un modèle européen, Mistral) : c'est son droit, pas la règle par défaut.

**Élargi par le client le 13/09/2026, pour les modèles cloud :** le socle reste local
ou européen, et rien ne part ailleurs d'office. Mais une personne peut brancher la clé
de n'importe quel fournisseur (OpenAI, Anthropic, Google, OpenRouter comme Mistral ou
Scaleway), pour elle ou pour son équipe : « s'il veut utiliser sa clé OpenAI, il fait ce
qu'il veut ». L'agence peut aussi fournir des modèles cloud qu'elle facture. La
promesse devient donc : **chaque modèle dit où il tourne** (pays affiché dans le
sélecteur, avertissement avant de brancher un fournisseur hors UE), **aucun modèle
cloud n'est choisi d'office**, et une clé personnelle ne sert qu'à son titulaire.

Ce n'est pas une préférence, c'est l'argument de vente. Il a écarté d'emblée des
briques techniquement séduisantes, et il continue d'arbitrer chaque choix de
connecteur. Il impose aussi une discipline : **toute promesse écrite à l'écran doit
être vérifiable**. Un client qui ouvre son pare-feu et prend le produit en défaut sur
une phrase perd confiance dans toutes les autres.

### Règles de marque, non négociables

1. Aucun nom de produit en dur dans le code. Nom affiché, logo, couleurs et pied de
   page viennent de `src/config/branding.ts`, point de personnalisation unique.
2. Changer ce fichier suffit à rhabiller toute l'application, sans toucher un
   composant.
3. Aucune valeur hexadécimale hors de `src/styles/tokens.css`.
4. Interface écrite en français, accents corrects. Pas de tiret cadratin dans le
   texte affiché. Depuis la 0.25.0, **toute phrase affichée passe par `t("…")`**
   ou `tf("… {0} …", valeur)` : le français reste la langue d'origine et sert de
   clé, l'anglais et le chinois viennent des catalogues (ADR-045). Une phrase
   oubliée n'est pas une panne — elle s'affiche en français — mais `npm run i18n`
   la signale.

### Vocabulaire

| Terme retenu | À ne pas employer |
|---|---|
| Chat, Nouveau Chat | Discussion, Nouvelle discussion |
| Agent | Assistant |
| Catalogue | Officiel |
| Majordome | (agent d'orchestration) |

> Le prompt d'origine imposait « Discussion ». Le client a tranché pour « Chat » en
> cours de projet. C'est le premier exemple de décision inversée : elle est ici pour
> qu'on ne la retrouve pas à l'envers dans six mois.

---

## 2. Comment le logiciel est construit

```
Interface (React, Vite, Tailwind)
        │  apiFetch — jeton d'instance + jeton de séance
        ▼
Passerelle Helix (Node, zéro dépendance hors SDK MCP)
        │
        ├── Modèles ──── LM Studio (local) · cluster exo · service compatible OpenAI
        ├── Outils ───── fichiers (MCP) · bureautique · courrier · agenda · écran
        │                bibliothèque · réunions (Whisper sur la machine)
        ├── Agents ───── employés OpenClaw, instance dédiée (§ 3.4)
        ├── Code ─────── OpenCode en mode serveur
        └── Données ──── fichiers JSON chiffrés, ou PostgreSQL
```

Le tout est empaqueté dans une application Electron qui démarre elle-même sa
passerelle. Le poste client n'a **rien à installer** : ni Node, ni Python.

### Les quatre surfaces

**Chat** converse, et dispose des outils quand on les active.
**Cowork** agit sur les fichiers et l'écran, outils toujours actifs.
**Code** délègue à OpenCode.
**Tâches** doit accueillir les exécutions d'agent rattachées à des cartes.

Elles partagent le même moteur. **Ce qui les distingue n'est pas la technologie,
c'est le jeu d'outils et la surface.** Cette phrase est la clé de toute
l'architecture : on n'a pas quatre produits, on en a un, présenté de quatre façons.

---

## 3. Décisions, et pourquoi

### 3.1 Un seul moteur d'agent — OpenCode

Retenu en juillet 2026. Licence MIT, indépendant du fournisseur, boucle d'outils,
sous-agents, serveur pilotable. Réécrire un agent de code n'apportait rien.

**Écartés :** Eigent (Apache 2.0, capable, mais lourd et très opiniâtre — à revoir
seulement pour du multi-agents parallèle clé en main) ; AionUi (on avait déjà notre
interface, on en a repris le motif, pas l'application).

### 3.2 Contrôle de l'écran

**Modèle : la famille Qwen3-VL, livrée ; OpenCUA, retenu pour les grosses machines.**
Le catalogue installé automatiquement propose Qwen3-VL 8B, 4B et 2B
(`VISION_CATALOG`, `gateway/src/provision.ts`), parce qu'ils sont diffusés au format
que LM Studio charge. OpenCUA (7B / 32B / 72B), plus précis, est reconnu par la
passerelle s'il est installé (rôle `gui`, détecté par son nom), mais n'est pas
téléchargé d'office. Gemma 3 4B, dernier recours jusqu'au 13/09/2026, a été retiré
(§ 3.9).

**UI-TARS écarté comme dépassé** : UI-TARS-72B plafonne à 38,1 sur ScreenSpot-Pro,
battu par un Qwen3-VL-8B à 52,7. La génération 2026 est bâtie sur Qwen3-VL.

**Environnement : `trycua/cua`**, pilotes ouverts, bac à sable, multi-systèmes.

**Ce qui avait été décidé au départ (ADR-005, juillet 2026), et ce qui est livré.**
Le principe : **l'agent a son propre ordinateur**, une machine virtuelle (cua,
Lume sur Mac) où il clique et tape pendant que la personne continue de
travailler sur le sien ; une erreur y reste confinée. Piloter l'écran réel de
la personne reste possible, mais comme un **choix explicite**, jamais par défaut.
Ce qui existe au 24/09/2026 (ADR-011) :

| Mode | Ce que l'agent pilote | État |
|---|---|---|
| `desactive` | rien | **par défaut** |
| `sandbox` | **la machine de l'agent** : un bureau Linux isolé (Docker, image cua + LibreOffice), préparé, démarré et arrêté par Helix (`gateway/src/machine.ts`) | **livré et vérifié le 24/09/2026** (voir plus bas) |
| `hote` | l'écran de la personne | livré et vérifié sur macOS en 0.10.0 ; activé dans Paramètres, Contrôle de l'écran, mot de passe redemandé |

Dans les deux modes actifs : chaque action qui modifie quelque chose attend
un « Autoriser » (carte à l'écran, deux minutes, puis refus) ; les outils
d'écran ne sont proposés qu'à un **modèle qui voit les images** (Qwen3-VL,
installé à la demande) ; avec un modèle sans vision, Cowork le dit (« Écran :
modèle sans vision ») au lieu de tenter.

**La machine de l'agent (24/09/2026).** Helix mesure l'ordinateur (mémoire,
disque, Docker) et conseille : bureau Linux isolé dès 12 Go et 12 Go libres ;
machine macOS (Lume) possible aussi sur un Mac à puce Apple de 32 Go, macOS
15.3 ou plus, 60 Go libres : la personne choisit « Bureau Linux » ou « Mac
virtuel » ; sans Docker, le Mac virtuel devient le conseil ; sinon pas de
machine, et il le dit. Image `helix-machine:N` construite par Helix depuis
`trycua/cua-ubuntu` épinglée : LibreOffice français préréglé (pas de fenêtre
de récupération, formats Microsoft, pas de saisie automatique), mise à jour de
cua au démarrage retirée (2 min gagnées), statistiques de cua coupées ; les
anciennes versions sont effacées. Ports sur 127.0.0.1 seulement, 3 Go de
mémoire au plus, un seul dossier partagé : `~/Helix/Machine`. Démarrée avec
l'instance si le mode est choisi, arrêtée à la fermeture. Écran en direct
dans le panneau de Cowork. En mode Auto, Cowork prend le modèle de vision.
Accord : un « Autoriser » vaut pour toute la demande (la carte le dit) ; un
refus aussi (la suite est refusée d'office, sans nouvelle carte). Actions
propres à la machine : `ouvrir_app` sur liste fermée (Firefox, Writer, Calc,
Impress, Fichiers), `saisir_tableau` (Calc au clavier depuis la zone de nom),
`enregistrer_document` (enregistre dans le dossier d'échange, vérifie le
fichier et **renvoie son contenu relu** à l'agent). Pas de découpage en étapes
quand l'écran est piloté ; relance si le modèle décrit l'action au lieu de la
faire (sauf document déjà enregistré ou refus).
Essais réels avec qwen3-vl-4b (16 Go) : Writer « Bonjour Helix » → essai.docx
juste (87 s, 4 actions, 1 carte) ; Calc Loyer/Courses/Transport/Total →
budget.xlsx juste, total 1 200 (89 s, 5 actions, 1 carte) ; depuis l'écran
Cowork → cowork.docx juste ; refus → 1 carte, rien exécuté. Sans les actions
dédiées, le même modèle échouait (tableau faux, enregistrement jamais fait).
**Limite constatée sur 16 Go** : machine (5 Go avec Docker) + modèle de vision
(4,8 Go) + Qwen3 8B demandé ailleurs saturent la mémoire ; Cowork machine et
Chat en parallèle se gênent. Mode `hote` avec Qwen3-VL : pas refait (il bouge
la souris du client).
Cowork, en dehors de l'écran : fichiers (dossier choisi ou « tout mon
poste »), bureautique (Word, Excel, PowerPoint, PDF via l'atelier), courrier,
agenda, Drive et Slack s'ils sont connectés, toujours sous approbation pour
ce qui modifie.

**La vérité à répéter au client, sans l'adoucir :** les agents de contrôle d'écran
auto-hébergeables réussissent environ **une tâche sur quatre** (OSWorld). Les
meilleurs propriétaires tournent autour de 79 %, mais ils sont fermés et américains,
donc exclus. **Ne jamais vendre le contrôle d'écran comme fiable.** Toujours préférer
un outil structuré — fichiers, MCP — quand il existe.

**Licence, vérifiée le 13/09/2026** sur les fiches des modèles : OpenCUA 7B et 32B
sous **MIT** (bâtis sur Qwen2.5-VL 7B et 32B, Apache 2.0) ; OpenCUA 72B sous MIT mais
bâti sur Qwen2.5-VL 72B, sous **licence Qwen** : usage commercial permis jusqu'à 100
millions d'utilisateurs actifs par mois, copie de la licence et mention d'attribution
à fournir, droit chinois. Détail au § 3.9.

### 3.3 Electron plutôt que Tauri

Toute l'exécution est en Node : passerelle, SDK MCP, serveur OpenCode, serveurs MCP
lancés par `npx`. Tauri aurait exigé un compagnon Node de toute façon, ce qui annulait
son avantage de taille.

### 3.4 Agents managés — OpenClaw et Hermes

**Décision de juillet 2026, toujours valide, et souvent mal recopiée :**

> **OpenClaw** seulement quand le besoin d'agents managés isolés, toujours actifs et
> multi-clients se confirmera. **Pas de Hermes maintenant** : deux cadres de travail,
> c'est deux fois la dette.

Un agent = une configuration sur le moteur commun. Une tâche = une exécution
rattachée à une carte. Tant que ce modèle suffit, aucun des deux n'apporte rien.

Hermes est « l'employé qui apprend », à mémoire longue. Il chevauche OpenClaw : on ne
prendra pas les deux.

> Un récapitulatif intermédiaire de ce projet a écrit « Hermes d'abord, puis
> OpenClaw ». C'était **l'inverse**. Corrigé le 5 septembre 2026.

**Réévaluation du 13/09/2026, décision en attente du client.** Le besoin est confirmé :
un agent qui travaille comme un employé autonome, 24 heures sur 24, avec tout ce que
sait faire un agent OpenClaw. Étude comparative publiée (voies A : OpenClaw tel quel,
B : agents natifs Helix, C : hybride où OpenClaw ne garde que les canaux). Faits
établis à la source :

- OpenClaw (MIT, fondation financée par OpenAI depuis février 2026) : bac à sable
  désactivé par défaut, outils exécutés sur l'hôte ; `CVE-2026-25253` corrigée en
  2026.1.29 ; plus de 824 skills malveillantes sur ClawHub en février ; « pas une
  frontière de sécurité » entre utilisateurs qui ne se font pas confiance ; WhatsApp
  par Baileys, contraire aux conditions de Meta ; Node 24.16+ requis.
- Branché tel quel, il contournerait l'approbation, le journal, le cloisonnement, le
  chiffrement, l'export et la suppression RGPD, et la marque blanche.
- **Pièce manquante quelle que soit la voie** : l'exécution des tâches vit dans la
  fenêtre (`src/lib/taskRunner.ts`) ; fermer l'application arrête l'agent. Il faut un
  moteur sur l'instance.

Recommandation de l'étude : voie B. **Décision du client, le 13/09/2026 : OpenClaw**
(« on utilise OpenClaw », version 2.0 et suivantes), déployable depuis la page Agents,
simple, et repartant de zéro : jamais l'installation personnelle d'OpenClaw de quelqu'un.

**Ce qui a été construit (0.11.0) : les « employés ».** Voie A, mais tenue par Helix :

- **Une instance OpenClaw à part**, lancée et supervisée par la passerelle
  (`gateway/src/employes.ts`) : dossier `<données>/openclaw`, port 18800 (réglable :
  `openclaw.port` du profil), boucle locale et jeton. Sa configuration est **réécrite
  par Helix** à chaque changement ; OpenClaw la recharge à chaud, les autres employés
  ne sont pas interrompus. Une installation personnelle d'OpenClaw sur la même machine
  n'est ni lue ni touchée (`OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH`).
- **Verrouillée** : profil d'outils minimal ; commandes système, navigateur, recherche
  web, médias, planification par l'agent, messagerie et extensions coupés ; fichiers
  limités à l'espace de l'employé ; aucune procédure intégrée (elles poussaient le
  modèle à inventer des outils) ; télémétrie, mises à jour, catalogue distant, annonce
  mDNS et « rêves » nocturnes de la mémoire désactivés.
- **Le modèle passe par la passerelle Helix** (un fournisseur par employé, pour que la
  consommation soit comptée à son nom : `employe:<id>`).
- **Les outils sont ceux d'Helix**, servis par MCP (`gateway/src/serveurOutils.ts`),
  un serveur par employé, sous la barrière d'approbation et le journal. Familles au
  choix : fichiers de l'équipe, mails, agenda, Google Drive, Slack, documents Office.
- **Les missions sont planifiées par Helix** (automatisations OpenClaw créées pour lui,
  jamais par l'agent : une automatisation peut exécuter une commande système).
- **Chacun lui parle dans sa conversation** (clé de session par personne) ; les
  échanges sont gardés par Helix, chiffrés, exportables et effacés avec le compte.
- **Autonomie** : par défaut, chaque modification attend l'accord d'une personne
  connectée (deux minutes) ; la nuit elle n'est pas faite et l'employé en est averti.
  Le propriétaire peut le laisser « agir sans demander » ; tout reste au journal.

Mesures sur un Mac mini, Qwen3 8B par LM Studio : déploiement 8 à 12 s ; réponse
simple 10 à 30 s ; réponse qui se sert des outils 1 min 30 à 3 min ; mission de bout en
bout (lister, écrire après accord, rendre compte) 2 min 20. Un modèle local plus gros
ou un hébergement européen raccourcit d'autant.

**Élargi en 0.12.0, à la demande du client (« l'ensemble des choses d'OpenClaw »,
« libre d'agir si on l'autorise ») :**

- **Modèle au choix** : local, fourni par l'agence, ou cloud par clé (voir § 1).
- **Trois paliers de liberté**, au choix du propriétaire : Encadré (ce qui précède),
  Étendu (recherche web par DuckDuckGo, lecture de pages, navigateur, envoi de messages
  sur ses canaux), Libre (en plus : commandes sur la machine de l'instance, rappels
  qu'il se programme, sous-agents, fichiers hors de son espace ; mot de passe, et code
  si la double authentification est active). Les rappels ne sont pas au palier Étendu :
  une automatisation OpenClaw peut exécuter une commande.
- **Canaux** : Telegram, WhatsApp (QR code affiché dans Helix), Discord, Slack,
  Mattermost. Chaque personne qui écrit a sa conversation ; un inconnu reçoit un code
  et le propriétaire l'accepte dans Helix (ou liste fixe). Sur un canal, l'employé ne
  touche pas aux outils de l'entreprise, aux commandes ni aux rappels, sauf si on les
  ouvre. WhatsApp passe par WhatsApp Web, contraire aux conditions de Meta : risque de
  suspension du numéro, dit à l'écran, numéro dédié conseillé.

Vérifié sur OpenClaw 2026.9.4 : recherche web réelle (103 s), commande exécutée au
palier Libre (sortie exacte de `date`), mot de passe exigé et refusé s'il est faux,
jeton Telegram vérifié chez Telegram (refus d'un faux jeton remonté en français), QR
WhatsApp réel affiché, outils de l'entreprise toujours disponibles depuis Helix quand
ils sont fermés aux canaux, retrait complet d'un employé et de ses canaux.

**Un seul geste : créer un agent (0.14.0).** Demandé par le client : « tout doit
s'installer automatiquement », « sans complication pour les utilisateurs », à la
manière d'un déploiement Fly.io où l'on ne voit rien de la machinerie. La fenêtre
« Créer un nouvel agent » est désormais le seul chemin : l'agent créé est mis en
service tout seul (`src/hooks/useMiseEnService.ts`), OpenClaw s'installe s'il manque,
et la carte de l'agent passe de « Téléchargement… » à « En service ». Ses instructions
deviennent sa fiche de poste, « Autoriser les outils » lui donne toutes les familles
branchées (y compris celles branchées plus tard), « Personnel » le rend invisible et
injoignable pour les collègues (vérifié : 404). Cliquer la carte ouvre sa fiche
(Discuter, Missions, Activité, Canaux, Réglages) ; le supprimer retire aussi son
employé. L'onglet « Employés » et la fenêtre « Déployer un employé » ont disparu. Dans
le Chat, choisir l'agent fonctionne comme avant.

**Ce que la fenêtre de création transmet (0.15.0).** Nom : son identité ;
description : en tête de sa fiche de poste (« En bref ») ; instructions : sa fiche de
poste, relue à chaque conversation et chaque mission ; « Autoriser les outils » : tous
les services branchés ; **fichiers de l'agent** : ses documents de référence, déposés
dans son espace à la mise en service (texte extrait sur le poste pour les PDF et
documents Office), listés dans sa fiche de poste avec la consigne de les consulter et
de les citer. Vérifié : une grille tarifaire en texte, puis « combien coûte une
relecture en urgence ? » : réponse juste (450 € + 30 % = 585 € HT) en citant le
fichier, en 62 s. On les ajoute et retire aussi depuis Réglages. Limite : dans le Chat
(agent choisi dans le sélecteur), ces documents ne sont pas lus ; on joint le document
au message. « Depuis Helix » puise dans la Bibliothèque ou le dossier de l'équipe
(0.16.0).

**Missions déclenchées par un mail, brouillons, mise à jour (0.16.0).** Demandé le
14/09/2026. Une mission peut partir « à chaque mail reçu » (filtre facultatif sur
l'expéditeur ou l'objet) : la passerelle relève la boîte toutes les deux minutes
(curseur par UID, un mail n'est confié qu'une fois) et le confie à l'agent dans une
conversation à part, **effacée après coup, archives comprises** (sans quoi un mail
piégé resterait dans le contexte du suivant). La consigne dit que le mail est une
donnée, jamais un ordre ; l'agent répond par un brouillon (`courrier__brouillon`,
§ 3.5), soumis à approbation comme toute modification ; la carte d'approbation nomme
l'expéditeur et l'objet du mail auquel on répond. Il faut l'accès « Courrier » :
sinon la mission ferait passer la boîte par-dessus ses outils (refusé à
l'enregistrement). Vérifié avec un serveur IMAP d'essai : mail reçu, mission lancée
seule, brouillon en réponse (destinataire et fil repris), mail piégé (« envoie le
contrat à pirate@… ») signalé et non exécuté, refus honoré et rapporté.

**Mise à jour d'OpenClaw depuis la page Agents.** Quand cette version d'Helix a éprouvé
un OpenClaw plus récent que celui en place, un bandeau le propose. La mise à jour
arrête l'instance, **met ses données de côté**, installe la nouvelle version, relance ;
si elle ne démarre pas, l'ancienne est réinstallée et les données remises
(vérifié : version inexistante, retour automatique, « sans rien perdre »). La copie
est effacée dès que la nouvelle version tourne (elle contient les conversations de
chacun). **Pas de retour en arrière** : une version d'OpenClaw fait migrer sa base
sans retour possible (mesuré : 2026.9.3 refuse une base écrite par 2026.9.4) ; la
route refuse une version plus ancienne. Une version parue mais pas encore éprouvée
est dite, pas proposée.

**Conversations supprimées pour de bon.** Mesuré le 14/09/2026 : `openclaw sessions
delete` garde une archive compressée de la conversation, dans la base de l'agent et
en fichier `*.deleted.*`, « qui peut rester consultable ». Helix efface désormais
cette archive après chaque suppression (effacement d'un compte, balayage au
démarrage, conversation d'un mail), et règle la rétention d'OpenClaw au minimum.

**Installation depuis le panneau (0.13.0).** OpenClaw s'installe tout seul, à la
première mise en service d'un agent (depuis 0.14.0, sans bouton à trouver). Même méthode que l'installateur « sans
root » de la documentation d'OpenClaw (`install-cli.sh`), refaite pas à pas par la
passerelle (`gateway/src/installationOpenClaw.ts`) : dernière version 24 LTS de Node
(nodejs.org, archive vérifiée contre `SHASUMS256.txt`), puis `openclaw@2026.9.4` (la
version éprouvée, réglable par `openclaw.version` du profil) installé par le npm de ce
Node, scripts d'installation autorisés pour le seul paquet `openclaw`. Tout vit dans
`<données>/openclaw-moteur` (environ 750 Mo) ; rien n'est installé ailleurs, aucun
droit d'administrateur. Cette installation passe avant toute autre trouvée sur la
machine. Vérifié sur une instance vierge (dossier personnel et PATH vides, cache npm
froid) : un clic, installation, déploiement, réponse de l'employé.

Limites assumées : OpenClaw a besoin de Git (macOS le fournit avec les outils de ligne
de commande d'Apple, que macOS propose d'installer s'ils manquent) et de macOS 13.5 ou
plus récent ; les missions tournent
tant que l'instance tourne (Mac allumé, application ouverte, fenêtre fermée permise, ou
serveur hébergé) ; un petit modèle peut encore annoncer « fait » à tort, d'où le compte
rendu à relire dans l'onglet Activité. Pas de skills de ClawHub : c'est voulu (plus de
824 skills malveillantes y ont été recensées en février 2026).

### 3.5 Connecteurs vers les outils du client

**Décision révisée le 5 septembre 2026.** La position initiale — Composio, au motif
que ces logiciels sont américains de toute façon — a été rouverte et remplacée.

La bonne règle n'est pas « pas de serveur ». C'est :

> **Ne jamais introduire un tiers que le client n'a pas déjà choisi.**

| Niveau | Qui voit passer les données | Position |
|---|---|---|
| Protocole ouvert, ou serveur MCP local | Personne d'autre que le service lui-même | Voie principale |
| Serveur MCP **de l'éditeur** (`mcp.slack.com`, `mcp.notion.com`) | Slack, Notion, déjà contractés par le client | Acceptable |
| Routeur hébergé type Composio | Un tiers que le client n'a jamais choisi | Jamais par défaut |

**Pourquoi Composio reste écarté par défaut**, en trois points concrets :

1. Ce n'est pas la même donnée. Gmail détient le courrier ; Composio détiendrait un
   **jeton d'accès** à ce courrier, plus le contenu de chaque appel.
2. RGPD. C'est un sous-traitant que **l'agence** introduit, à faire figurer au
   registre du client et à justifier devant son délégué à la protection des données.
   Google, lui, le client l'a contracté seul.
3. Rayon de souffle. Une compromission de Composio exposerait les jetons de **tous**
   les clients d'un coup, sous le nom de l'agence.

L'avantage réel de Composio est reconnu : un seul parcours d'autorisation pour des
centaines d'applications. La position n'est donc pas « jamais » mais **jamais par
défaut, jamais en silence** : une case à cocher, avec ses implications écrites à côté.

**Protocoles retenus :** IMAP pour le courrier, CalDAV pour l'agenda, CardDAV pour les
contacts.

**Une écriture dans le courrier, et une seule : les brouillons (14/09/2026).** Le
connecteur était en lecture seule, par principe. Le client a demandé de « vrais
brouillons dans la boîte mail » : l'agent dépose un brouillon (commande `APPEND`,
drapeau `\Draft`) dans le dossier que le serveur désigne comme celui des brouillons
(attribut `\Drafts`, RFC 6154), sans jamais le créer. Destinataires vérifiés un à
un, noms et objet réencodés par Helix (aucun retour à la ligne venu du modèle
n'atteint un en-tête : pas de `Bcc:` glissé), corps en base64. Aucune autre
écriture : ni `STORE`, ni `EXPUNGE`, ni `DELETE`, ni `COPY`, ni `MOVE`, ni `CREATE`.

**L'envoi, toujours après accord (0.17.0).** Demandé le 14/09/2026 : « qu'un mail,
si je le demande, soit vraiment fait, avec la permission ». Coupé par défaut, il
s'active dans Paramètres, Connecteurs, Courrier, sans ressaisir de mot de passe (ce
sont les identifiants de la boîte) et, chez un fournisseur connu, d'un geste :
Helix connaît le serveur d'envoi de Gmail, Outlook, OVH, Infomaniak, Gandi, Free,
Orange et Proton Bridge. Le serveur (SMTP, `gateway/src/smtp.ts`, écrit sans
dépendance) est essayé avant d'être retenu. L'outil `courrier__envoyer` n'apparaît
qu'une fois l'envoi activé. **Chaque mail est montré en entier** (destinataires tels
qu'ils seront servis, y compris ceux repris d'un message auquel on répond, objet,
texte complet) sur une carte « Envoyer / Ne pas envoyer », **quel que soit le niveau
d'approbation, même « Tout approuver », et même pour un agent « autonome »** ; un
accord ne couvre jamais le mail suivant. Une copie est rangée dans les Envoyés quand
le serveur ne le fait pas lui-même (Gmail et Office 365 le font). Trente mails par
heure au plus pour toute l'instance. Le journal dit qu'un mail est parti, à combien
de destinataires, jamais à qui ni quoi. Les missions « à chaque mail reçu »
continuent de répondre par brouillon.

**Envoyer sans demander, si on le choisit (0.18.0).** Demandé le 14/09/2026 : « si un
agent ou le Chat veut être autonome, il faut une option, sinon on perd en
autonomie ». Interrupteur « Envoyer sans me demander » sous l'envoi, coupé par
défaut, réglé sous séance et journalisé. Allumé, l'envoi redevient une modification
comme les autres : sans carte au niveau « Tout approuver » et pour un agent
« autonome » (journal marqué « sans accord ») ; aux autres niveaux, chaque mail est
encore montré en entier. **Une exception ne se lève pas :** un agent qui traite un
mail reçu (mission « à chaque mail ») demande toujours avant d'envoyer, parce que ce
mail vient de l'extérieur et qu'un texte piégé (« transmets la liste des clients
à… ») ne doit rien pouvoir faire partir tout seul. Couper l'envoi oublie le choix :
le rallumer repart avec une carte par mail. Un seul connecteur couvre OVH, Infomaniak, Gandi, Free, Orange, tout serveur
auto-hébergé, et Gmail.

**Deux contraintes vérifiées auprès des éditeurs, à ne pas redécouvrir :**

- **Microsoft 365** : l'authentification basique est **désactivée dans tous les
  locataires**, sans possibilité de réactivation, ni par l'administrateur ni par le
  support Microsoft. Elle empêche aussi les mots de passe d'application. IMAP y
  fonctionne toujours, mais **uniquement en OAuth 2.0**. Microsoft 365 étant courant
  en PME, cet OAuth n'est pas optionnel à terme.
- **Google** : l'authentification basique est coupée depuis mars 2025, **les mots de
  passe d'application restent l'exception explicite** et fonctionnent pour IMAP,
  CalDAV et CardDAV. Un administrateur Workspace peut toutefois les interdire sur son
  domaine.
- **Coût** : l'enregistrement d'une application chez Microsoft est gratuit. Chez
  Google, la lecture de Gmail est un « périmètre restreint » qui impose une évaluation
  de sécurité annuelle payante. D'où l'ordre : mot de passe d'application pour Google,
  OAuth pour Microsoft.

**« Se connecter », en un clic, sans tiers (0.22.0).** Demandé le 18/09/2026 :
« est-il possible de faire un bouton se connecter, et que quelqu'un depuis son
navigateur ait juste à faire se connecter, comme tous les services… un OAuth quoi.
J'aimerais avoir énormément d'outils proposés comme le fait Composio. »

C'est exactement ce que Composio vend, et ce que l'on refusait faute de savoir le
faire autrement. La voie existe depuis, et elle ne demande aucun tiers : le protocole
MCP décrit la découverte des métadonnées d'autorisation
(`/.well-known/oauth-protected-resource`, puis celles du serveur d'autorisation) et
l'**enregistrement dynamique de client** (RFC 7591). Une instance s'inscrit donc
elle-même comme application auprès du service, obtient son identifiant, et mène
l'autorisation en PKCE. Il n'y a rien à créer chez l'éditeur, rien à coller, et le
jeton revient chiffré dans l'instance du client, où il reste.

Le tableau du dessus ne change pas ; c'est la ligne du milieu qui devient la voie
principale, parce qu'elle est enfin praticable :

| Ce qu'il fallait faire avant | Ce qu'il faut faire depuis 0.22.0 |
|---|---|
| Aller chercher un jeton chez le service, comprendre où il se cache, le recopier | Cliquer « Se connecter », dire oui dans son navigateur |
| Une intégration créée par personne compétente, par service | Rien |

Douze services sont branchés ainsi, vérifiés un à un le 18/09/2026 (leur serveur
répond, publie ses métadonnées et accepte l'enregistrement dynamique) : Notion,
Linear, Jira et Confluence, Asana, Sentry, Intercom, Canva, Figma, Webflow, Wix,
Vercel, Square, PayPal. Quatre autres publient un serveur mais veulent une
application déclarée chez eux : GitHub, Slack, Box, Airtable. Une personne la crée
une seule fois, colle son identifiant, et le bouton « Se connecter » suffit ensuite à
tout le monde. Les autres restent branchés par jeton, avec un serveur exécuté sur la
machine de l'instance (GitLab, PostgreSQL, HubSpot, Firecrawl, Tavily, Exa, Brave,
Google Maps, Puppeteer, Kubernetes, et le même Notion, GitHub, Slack, Airtable par
jeton pour qui préfère).

**Composio reste écarté, et la raison n'a pas bougé** — elle est simplement devenue
sans objet : on a la commodité qu'il vendait, sans lui confier de jeton. Un service
branché l'est pour toute l'instance, et l'écran le dit.

**Drive et Slack (septembre 2026)** : pas de protocole ouvert, donc l'API de
l'éditeur, directement, sans intermédiaire, en lecture seule. **Chaque client crée
son application** : un client Google commun ferait de l'agence l'éditeur d'une
portée restreinte (vérification annuelle payante, et un seul point de rupture pour
tout le parc) ; une application Slack commune serait « distribuée hors
Marketplace », donc limitée à une lecture de 15 messages par minute depuis 2025-2026,
alors qu'une application interne garde les limites normales. Branchement réel à
éprouver chez un premier client (SECURITE.md § 10.3).

### 3.6 Découpage des tâches lourdes

Ajouté en septembre 2026, après mesure. Un modèle de 8 milliards de paramètres perd le
fil sur une tâche composée : il s'arrête à mi-chemin, ou décrit ce qu'il faudrait faire
au lieu de le faire.

La passerelle demande donc un plan, puis exécute **une étape à la fois**, chacune avec
son propre contexte court. L'avancement est tenu par l'instance, pas par le modèle.

**C'est le modèle qui juge (0.20.0).** Demandé le 15/09/2026 : « un modèle doit juger
lui-même si une tâche doit être découpée, et la découper autant de fois qu'il faut ».
Plus de liste de mots : à chaque demande, un appel court (sans outils ni
raisonnement, 1 à 3 secondes sur qwen3-8b) montre au modèle la demande et la
conversation qui précède ; il répond « rien à découper » ou un plan, avec l'objectif
reformulé. **Une étape trop grosse est redécoupée** en 2 à 8 parties, jusqu'à trois
niveaux et 60 étapes par demande, au lieu d'arrêter le travail. **Rédaction longue**
sans outils : partie par partie. Et ce qui passe d'une étape à l'autre, ce sont les
**données réellement lues** par les outils, pas seulement le résumé du modèle ; une
étape se juge aux retours des outils, pas à ce que le modèle affirme (voir
[SCREENS.md](SCREENS.md), « Découpage des tâches lourdes », pour les mesures).

**Le régime s'adapte au modèle** (`gateway/src/plan.ts`, fonction `strategie`) :

| Taille | Comportement |
|---|---|
| moins de 14 milliards | Le modèle juge s'il faut découper, 8 appels d'outils par étape |
| 14 à 45 | Le modèle juge, étapes plus larges, 14 par étape |
| 45 et plus | Pas de découpage, 50 appels d'un tenant |
| Inconnue, moteur distant | Supposé capable, pas de découpage |
| Inconnue, moteur local | Le modèle juge, par prudence |

**Non, une tâche ne se découpe pas à l'infini — et c'est voulu.** Question du
client, le 18/09/2026. Les bornes, toutes dans `gateway/src/plan.ts` :

| Borne | Valeur | Pourquoi elle existe |
|---|---|---|
| Étapes d'un plan de premier niveau | 15 | Au-delà, le plan est plus long que le travail |
| Parties d'une étape redécoupée | 8 | Un redécoupage qui en produit vingt n'a pas compris l'étape |
| Profondeur de redécoupage | 3 | Chaque niveau multiplie le temps ; au troisième, une étape ne fait plus qu'une ligne |
| Étapes réellement exécutées, par demande | 60 | Le garde-fou global : il compte tout, tous niveaux confondus |
| Appels d'outils par étape | 8, 14 ou 20 selon le modèle (`HELIX_BUDGET_ETAPE`) | Une étape qui tourne sans fin est une étape mal posée |
| Tours de complément après la revue finale | 2 | Passé deux, le modèle ne complète plus, il recommence |

Ce qui compte : quand une borne est atteinte, **Helix s'arrête et le dit**. Il ne
prétend pas avoir fini. Une demande vraiment trop grosse pour le modèle ressort
incomplète, avec la liste de ce qui a été fait et de ce qui ne l'a pas été.

Découper n'est pas un progrès en soi : sur un grand modèle, un plan imposé l'empêche
de s'adapter à ce qu'il découvre en chemin.

### 3.7 Vie privée par utilisateur

Personnalité, instructions, contexte personnel, mémoire et préférences de modèle sont
**privés, jamais partagés**. Les conversations ont un propriétaire ; il peut les
partager à une personne (par son adresse) ou à un **groupe** (0.16.0). L'instance le
vérifie : un membre retiré d'un groupe ne voit plus ce qui lui était partagé, dès la
synchronisation suivante (la révision des conversations suit celle des groupes).

La règle d'autrefois, « une conversation sur un modèle local ne se partage pas », ne
vaut plus : les conversations vivent dans l'instance, qui les sert à tous ses postes,
quel que soit le modèle. Son code (`setVisibility`, jamais appelé) a été retiré.

### 3.8 Éditions livrées

`edition` dans `branding.ts` (`chat` = sans Cowork ni Code, `complete` = tout) plus
`featureOverrides`. Navigation et routes filtrent seules. C'est aussi le moyen de
masquer chez un client les écrans encore en maquette.

### 3.9 Licences et conditions des briques tierces

Vérifié le 13/09/2026, à la source (fiches Hugging Face, conditions des éditeurs).
Ce n'est pas un avis juridique : un juriste doit relire les points marqués ⚠ avant
un engagement commercial.

| Brique | Éditeur | Licence | Usage commercial | Remarque |
|---|---|---|---|---|
| Qwen3 8B / 4B / 1.7B (conversation) | Alibaba (Qwen) | Apache 2.0 | oui | |
| Qwen3-VL 8B / 4B / 2B (écran) | Alibaba (Qwen) | Apache 2.0 | oui | |
| OpenCUA 7B / 32B | XLANG Lab | MIT | oui | reconnu, non installé d'office |
| OpenCUA 72B | XLANG Lab | MIT sur base Qwen2.5-VL 72B (licence Qwen) | oui, sous 100 M d'utilisateurs par mois | copie de la licence, attribution, droit chinois |
| Whisper small / large-v3-turbo (dictée) | OpenAI, converti par Systran et Dropbox | MIT | oui | poids ouverts, en local : conforme à la règle (§ 1) |
| Gemma 3 4B | Google | Gemma Terms of Use | oui, sous conditions | **retiré** pour sa licence (restrictions à répercuter dans chaque contrat client), pas pour son origine |
| LM Studio (moteur) | Element Labs, Inc. | logiciel fermé, gratuit | usage interne de l'entreprise seulement | ⚠ « application service provider » et « software-as-a-service » interdits |

**Tranché le 14/09/2026** (la question de Whisper l'était déjà : poids ouverts en
local, conforme à la règle du § 1) :

1. **LM Studio.** HelixAI est un logiciel libre que chaque organisation installe
   chez elle, pour ses propres salariés : c'est exactement l'usage que LM Studio
   autorise, que le projet soit gratuit ou non, et l'écran de première installation
   fait accepter ses conditions par l'organisation qui installe. Ce qui reste
   interdit, gratuit ou payant : **une instance servie à d'autres organisations**
   (quelqu'un qui hébergerait HelixAI pour ses clients). Celui-là devra brancher un
   moteur ouvert. Détail des conditions (version du
   23/08/2026) le réservent aux besoins internes de l'entreprise qui l'installe et
   interdisent de s'en servir pour fournir un service à des tiers. Une instance
   installée **chez** le client, pour ses salariés, est dans le cadre, et l'écran de
   première installation fait désormais accepter ces conditions par l'entreprise.
   Une instance **hébergée par l'agence** et servie à plusieurs clients ne l'est
   pas. Pour ce cas, il faudrait un moteur ouvert : llama.cpp (MIT), MLX d'Apple
   (MIT) ou Ollama (MIT). Ils exposent la même interface compatible OpenAI que les
   moteurs déjà déclarables dans le profil de déploiement, mais aucun n'a été
   éprouvé avec Helix. LM Studio est aussi un logiciel fermé : c'est la brique la
   moins souveraine du produit, bien plus que l'origine d'un modèle.
2. **La licence du projet : AGPL-3.0**, tranché le 20/09/2026. Fichier
   [LICENSE](LICENSE) (texte officiel de la FSF, pris sur gnu.org), explications et
   portée dans [COPYRIGHT.md](COPYRIGHT.md), `"license": "AGPL-3.0-only"` dans
   `package.json`.

   **La demande était : « utilisable par tous, mais qu'on ne puisse pas prendre mon
   projet pour le vendre ».** Ces deux choses ne tiennent pas ensemble au sens
   strict — une licence open source ne peut pas interdire de vendre, c'est le
   quatrième critère de l'Open Source Definition. Il fallait donc choisir laquelle
   des deux garder.

   L'AGPL garde les deux **en pratique** : on peut vendre HelixAI, mais celui qui le
   distribue ou **le propose comme service en ligne** doit publier tout son code,
   modifications comprises, sous la même licence. Un concurrent qui voudrait en
   faire une offre fermée devrait offrir son propre travail au reste du monde. Cela
   n'interdit rien et décourage tout, sans coûter le droit de dire « open source »,
   qui est vrai et vérifiable. Et le titulaire des droits, n'étant pas lié par sa
   propre licence, reste libre de **vendre une licence privée** à qui veut
   s'affranchir de l'AGPL : c'est le modèle de GitLab, Grafana et Nextcloud, et
   c'est ce qui rend l'abonnement du § 5 compatible avec l'ouverture du code.

   Les deux autres voies, écartées : **FSL** et **BSL** interdisent vraiment la
   revente concurrente (2 et 4 ans, puis bascule en open source), mais ce ne sont
   pas des licences open source, et il aurait fallu retirer le mot de tout le
   produit et de toute la communication.

   **Ce qu'il faut tenir pour que la licence privée reste vendable :** détenir
   l'ensemble des droits. Une contribution extérieure acceptée sans accord écrit
   (CLA) appartient à son auteur. À mettre en place **avant** la première
   contribution venue du dehors.

   **Vérifié :** les 444 paquets installés relevés un par un — 368 MIT, 35 ISC, 11
   Apache-2.0, 18 BSD, le reste permissif ; aucune licence copyleft, SSPL, BUSL ni
   « non commercial ». Toutes compatibles avec l'AGPL-3.0. La commande qui refait ce
   relevé est dans COPYRIGHT.md.

   `"private": true` reste dans `package.json`, et ne dit rien de la licence : c'est
   un garde-fou npm qui empêche une publication accidentelle du paquet. HelixAI est
   une application, pas une bibliothèque npm.

**Ajouté le 25/09/2026** (relevé à la source ce jour-là, détail aux § 3.10 et 3.12) :

| Brique | Éditeur | Licence | Usage | Remarque |
|---|---|---|---|---|
| nomic-embed-text v1.5 (embeddings) | Nomic AI | Apache 2.0 | bases de connaissances | déjà installé dans LM Studio, rien téléchargé |
| AnythingLLM | Mintplex Labs | MIT | idées seulement (révision `ad97bc8d…`) | aucun code recopié, notice `gateway/rag/LICENCE-anything-llm.txt` |
| LangChain.js, découpeur de texte | LangChain | MIT | code porté dans `decoupage.ts` (révision `e4a3d1bd…`) | notice `gateway/rag/LICENCE-langchainjs.txt` |
| MLX, MLX-LM | Apple (ml-explore) | MIT | entraînement sur Mac | 0.32.2 et 0.31.3 |
| Qwen3 0.6B, 1.7B, 4B Instruct 2507 (départ d'un entraînement) | Alibaba (Qwen) | Apache 2.0 | entraînement | révisions épinglées, empreintes vérifiées |
| transformers, peft, accelerate ; bitsandbytes ; PyTorch ; llama.cpp | Hugging Face ; bitsandbytes ; PyTorch ; ggml-org | Apache 2.0 ; MIT ; BSD-3 ; MIT | entraînement sur carte NVIDIA | versions figées, **sans empreintes** pour les paquets NVIDIA |
| Unsloth 2026.9.11, unsloth_zoo 2026.9.7 | Unsloth AI | cœur Apache 2.0, `unsloth_zoo` LGPL-3.0-or-later (Studio AGPL-3.0, non utilisé) | entraînement sur carte NVIDIA | **accepté par Medhi le 25/09/2026** ; roues vérifiées par empreinte, repli sur transformers et peft (§ 3.12) |

Écartés pour le RAG : LanceDB, better-sqlite3 / sqlite-vec et le reclassement par
onnxruntime-node (modules natifs, § 3.10) ; Orama (licence déclarée « NOASSERTION »
par GitHub le 25/09/2026, non vérifiée plus avant).

Pour mémoire, si un client exige un modèle de dictée européen, deux existent,
vérifiés sur leurs fiches : Kyutai STT 1B, français et anglais (laboratoire parisien, licence CC-BY 4.0, un milliard de
paramètres, documenté pour carte graphique NVIDIA : fonctionnement sur Mac à
éprouver) ; Voxtral Mini de Mistral (Apache 2.0, français compris, environ cinq
milliards de paramètres, soit dix fois Whisper small).

### 3.10 Bases de connaissances : sans module natif, avec les droits de Fichiers

Décidé le 25/09/2026. Des **bases de connaissances**, sur le modèle des espaces de
travail d'AnythingLLM : on y rassemble des documents de Fichiers (la Bibliothèque, dans
le code) ; l'instance les découpe, les vectorise avec le modèle d'embeddings de la
machine et garde des index chiffrés. Un Chat ou Cowork qui a des bases (celles de
l'agent, du projet, ou cochées dans la zone de saisie) reçoit les passages proches de
la question, et l'écran cite sous la réponse ceux que la réponse utilise.

Pourquoi ainsi :

- **Pas de base vectorielle native.** LanceDB (le défaut d'AnythingLLM),
  better-sqlite3 / sqlite-vec et le reclassement par onnxruntime-node sont des modules
  natifs ; la passerelle est un seul fichier CommonJS construit par esbuild et lancé
  par le Node d'Electron 33. Un index par document, chargé en mémoire et comparé par
  force brute (l'idée de Vectra), tient : mesuré sur la boucle, 8 ms pour 10 000
  morceaux, 86 à 167 ms et environ 750 Mo pour 100 000.
- **Recherche hybride** : produit scalaire plus BM25, fusion par rang (RRF). Par le
  sens seul, 9 bonnes réponses au rang 1 sur 10 ; avec les mots, 10 sur 10.
- **Aucune copie des documents.** Une base référence des documents de Fichiers ; le
  texte indexé est celui que la Bibliothèque a déjà extrait sur le poste.
- **Voir une base ne donne pas accès à ses documents.** À chaque question, seuls
  comptent les documents que la personne voit dans Fichiers à ce moment-là. C'est la
  seule règle qui empêche une base ouverte à l'équipe de faire fuir un document privé.
- **Recouvrement de 150 caractères** (et non 20 comme AnythingLLM) : avec 20, une
  phrase coupée à la frontière n'est entière dans aucun morceau.
- **Seules les sources citées sont mises en avant.** Mesuré avec nomic : 0,68 à 0,80
  pour le passage qui répond, 0,63 à 0,71 pour des passages sans rapport. Aucun seuil
  ne les sépare ; les numéros [n] écrits par le modèle, si.
- Le modèle d'embeddings est celui du rôle `embed` du routeur, jamais un modèle branché
  par une clé personnelle d'office.
- **Employés OpenClaw : seulement ce qui est ouvert à toute l'équipe** (décidé le
  25/09/2026). L'employé d'un agent cherche dans les bases de cet agent par un outil,
  `connaissances__chercher`, servi par son serveur d'outils comme ses autres outils
  Helix. N'y comptent que les bases **et** les documents ouverts à toute l'équipe, ni
  les droits du propriétaire de l'agent, ni ceux de qui lui parle. Pourquoi : l'appel
  d'outil arrive d'OpenClaw sans dire pour qui l'employé travaille à cet instant
  (plusieurs conversations, missions sans personne, mails reçus, messageries), et ce
  qu'il lit sort de lui (réponse à un collègue, message Telegram, brouillon, notes de
  sa mémoire relues ensuite). Avec les droits du propriétaire, un document privé
  sortirait vers quelqu'un qui n'a pas à le voir. C'est la règle de sa famille
  « bibliothèque ». Un outil plutôt que l'injection des passages : l'employé appelle le
  modèle sans séance, et le champ `connaissances` du Chat n'est lu qu'avec une séance ;
  surtout, sa boucle appelle le modèle plusieurs fois par tâche, c'est à lui de chercher
  quand il en a besoin. Pas de citations sous la réponse : l'employé nomme le document
  dans son texte (« (source : … ) »), sa fiche de poste le lui demande.
- **Employés OpenClaw et bases partagées à un groupe** (décidé le 25/09/2026,
  l'après-midi, à la demande du client). Règle : un document ne sort d'un employé que
  vers des gens qui ont le droit de le voir. Le seul cas où le code établit sûrement
  qui reçoit ce qu'il lit est celui où **tout ce qui sort de lui ne va qu'à son
  propriétaire** : agent personnel (personne d'autre ne le voit, ne lui parle, ne lit
  ses comptes rendus), sans messagerie, sans mission « à chaque mail », en liberté
  « Encadré », sans outil qui écrit ou envoie là où d'autres lisent (fichiers de
  l'équipe, documents Office, mails, donc sans « Autoriser les outils »). Il lit alors
  aussi les bases et les documents partagés aux groupes dont son propriétaire est
  membre à cet instant : son seul destinataire les voit lui-même. Jamais les documents
  privés du propriétaire (la question du point 18 reste au client). Tout est relu à
  chaque appel (`employes.ts`, `lectureDesBases`) : ouvert à l'organisation, branché à
  une messagerie, doté d'un outil qui écrit, sorti du groupe, il revient aussitôt à la
  règle de l'équipe. Pourquoi pas plus large : un agent partagé à des groupes précis
  n'existe pas dans le code (un agent est personnel ou d'organisation), et un agent
  d'organisation parle à tout le monde ; ces cas gardent la règle de l'équipe. Limite
  dite à l'écran : ce qu'il a déjà noté dans sa mémoire OpenClaw y reste quand son
  audience s'élargit. L'écran de l'agent dit, base par base, ce qu'il lira et pourquoi
  pas le reste.

### 3.11 Ligne de commande : un client de plus, qui ne décide rien

Demandé le 25/09/2026 : « HelixAI Code dans un terminal, comme Claude Code, Codex CLI
ou OpenCode CLI ». `helix` (`cli/helix.mjs`) est un client de plus de la passerelle,
comme l'interface et l'extension VS Code dont il reprend la manière, sans dépendance
(Node 20 et plus). Il affiche et transmet les réponses de la personne ; modèles,
outils, barrière d'approbation et journal restent ceux de l'instance. **Seuls « o » ou
« oui » accordent** une demande d'approbation ; sans terminal, il ne répond rien et
l'expiration vaut refus.

Les connecteurs n'atteignaient pas Helix Code : OpenCode tient sa propre boucle
d'outils. Lui donner les commandes des serveurs MCP aurait été simple et **pas sûr** :
il les aurait appelés sans barrière d'approbation, sans journal, et aurait reçu leurs
secrets. La passerelle les sert donc elle-même à OpenCode, par MCP, sur
`/helix/code/outils` (`outilsCode.ts`), derrière la barrière. OpenCode ne dit pas de
quelle session vient un appel : si les sessions qui travaillent appartiennent toutes
à la même personne, la carte d'accord va chez elle ; sinon, **refus sans carte**, parce
qu'une carte envoyée à la mauvaise personne lui ferait approuver l'action d'un autre.

**Les sessions de Helix Code passent par l'ancienne API d'OpenCode** (décidé le
25/09/2026). Cause trouvée dans le code d'OpenCode 1.18.32, la dernière version
publiée : les sessions de sa nouvelle API (`/api/session`) tirent leurs outils d'un
registre « v2 » où seuls les outils livrés sont inscrits ; rien n'y inscrit ceux des
serveurs MCP, et l'équipe d'OpenCode l'écrit elle-même sur sa branche de
développement (« MCP [...] still need an explicit canonical registration design »).
Aucun réglage, agent ou champ `tools` n'y change rien, et aucune version plus récente
n'existe. L'ancienne API (`/session`, `prompt_async`) ajoute les outils MCP à ceux de
l'agent. Les trois clients (écran, extension VS Code, `helix code`) lisent le flux de
la nouvelle API (`session.next.*`) : plutôt que de les réécrire, la passerelle écoute
`/event` et fabrique pour chaque session les évènements qu'ils lisent déjà, numérotés,
avec la reprise par `after` (`gateway/src/fluxCode.ts`). OpenCode n'a pas changé de
version. Trouvé en essayant : OpenCode ne relit la liste des outils d'un serveur MCP
qu'en s'y reconnectant, si bien qu'un connecteur branché pendant qu'il tournait
n'existait pas pour l'agent (« Aucun outil disponible ») ; la passerelle lui fait
rouvrir la connexion avant une demande quand la liste a changé.

Vérifié le 25/09/2026 sur une instance jetable, Qwen3 8B, avec un serveur MCP d'essai
sans compte (`scripts/mcp-essai.mjs`, rejoué par `npm run essai:cli -- --modele` :
48 sur 48) : par `helix code`, la carte d'accord arrive chez
la personne, le refus empêche l'appel (trace du serveur vide), « o » au terminal le
laisse partir (note écrite, `outil.appele` au journal avec `surface: "code"`) ; par la
route de l'écran, lecture accordée par l'API d'approbation, flux traduit complet
(`prompted`, `tool.called` `helix_carnet__lire_carnet`, `tool.success`, fin « stop »),
reprise par `after` ; deux personnes au travail en même temps : refus sans carte
(`titulaire-inconnu` au journal), outil non exécuté. L'écran Code a été vu dans le
navigateur plus tard le même jour (séance posée par l'API, sans mot de passe tapé ;
voir « Petit modèle, petit contexte » plus bas), mais sans connecteur branché. Pas essayé non plus : un vrai connecteur avec compte (Drive,
Slack, courrier) dans Code, l'extension VS Code avec un connecteur.

**Sessions de Code séparées des Chats** (25/09/2026, demandé par Medhi, « comme dans
Claude Code »). Avant, les sessions n'existaient que chez OpenCode (qui garde leurs
messages) et dans la mémoire de la passerelle (`modeleDeSession`, perdu au
redémarrage) et de l'écran (qui rouvrait toujours la dernière). Désormais un registre
(`gateway/src/sessionsCode.ts`, collection interne `sessionsCode`) retient pour chaque
session ouverte par `POST /helix/code/session` sa propriétaire, son dossier, son titre
(début de la première demande), son modèle et ses dates ; le contenu reste chez
OpenCode, relu à l'ouverture (`GET /session/<id>/message`), jamais recopié. Routes
`GET /helix/code/sessions`, `GET` et `DELETE /helix/code/sessions/<id>` (séance
requise, chacun les siennes) ; une session du registre refuse (403) demande, arrêt et
flux venant d'une autre personne, vérifié à la main avec deux comptes. Les sessions de
la ligne de commande et de l'extension y entrent aussi. Un registre illisible lève au
lieu d'être réécrit vide. **Les sessions ouvertes avant ce changement ne sont pas
listées** (on ne sait pas à qui elles sont) : elles restent intactes chez OpenCode, rien
n'a été effacé. L'effacement d'un compte retire ses sessions du registre et les efface
chez OpenCode quand son serveur tourne (journal : `sessionsCode`, `sessionsCodeEffacees`) ;
pas essayé. L'écran : voir SCREENS.md, écran Code.

La séance du terminal est un fichier en clair (`~/.helix/cli-seance`, 0600, dossier
0700), comme les outils de ligne de commande habituels : un trousseau demanderait une
dépendance native. Contrepartie assumée, écrite dans SECURITE.md § 22.

**Petit modèle, petit contexte, et voir où en est l'agent** (25/09/2026). Constat de
Medhi : « Aucun signe de l'agent de code depuis 90 secondes » pendant que l'agent
travaillait, puis des lignes « ✓ task » sans détail. Relevé dans le journal de LM
Studio le même jour : une demande d'OpenCode de 18 141 jetons lue en 146,9 s
(123 jetons/s) par Qwen3 8B (contexte 28 160, une demande à la fois), parce que le
modèle, partagé avec d'autres programmes (51 demandes d'OpenClaw ce jour-là, autour de
18 000 jetons chacune), avait perdu ce qu'il avait déjà lu. Trois choses changent :

- **La passerelle dit ce que fait le modèle avant son premier mot**
  (`gateway/src/attenteModele.ts`). OpenCode joint à chaque appel l'identifiant de sa
  session (`X-Session-Id`, `x-parent-session-id` pour un sous-agent, lu dans son
  code) ; tant que le relais (`chat.ts`) n'a rien reçu du modèle, la session reçoit
  toutes les dix secondes un `helix.statut` : lecture, attente de son tour (le modèle
  génère pour un autre programme), chargement, avec le temps écoulé et la taille
  approximative. Pour LM Studio sur le poste, l'état vient de `lms ps --json` (lecture
  seule, une fois par dix secondes au plus) ; le pourcentage lu vient de son journal
  (« Prompt processing progress »), et seulement quand on sait que c'est notre
  lecture (le modèle lit, personne en file, un seul appel de la passerelle sur ce
  modèle). LM Studio au repos deux fois de suite alors que rien n'est reçu : plus de
  statut, et le guet de silence des clients dit sa vraie panne.
- **La demande est allégée** (`gateway/src/allegementCode.ts`). Mesuré au tokeniseur de
  Qwen3 sur une instance jetable, demande la plus simple sans historique :
  **8 025 jetons avant, 2 803 après** (−65 %). Consignes d'OpenCode 2 098 → 446
  (`agent.build.prompt`) ; descriptions des outils livrés raccourcies dans le relais,
  seulement si elles commencent par le texte d'OpenCode 1.18.32, paramètres
  inchangés (bash 1 334 → 369, task 867 → 469, todowrite 659 → 253…) ; `skill` refusé
  (165, sans usage pour Helix) ; bibliothèque et réunions servies à Code seulement si
  elles ont quelque chose pour la personne (718 à vide). `webfetch` reste, raccourci.
  Et OpenCode apprend la taille du contexte chargé (`limit`, `limiteDe` d'opencode.ts) :
  sans elle, il ne résumait jamais une conversation qui s'allonge et demandait 32 000
  jetons de réponse, plus que tout le contexte.
- **Un panneau de suivi dans l'écran Code**, à droite comme dans Cowork
  (`SuiviCode.tsx`, `lib/suiviCode.ts`) : ce que l'agent fait maintenant (lecture avec
  barre de progression, réflexion, outil et sa cible), sa liste de tâches
  (`todowrite`), les sous-tâches (`task`) avec leur description et leurs propres
  outils (rapportés par `fluxCode.ts`, `helix.soustache`), les fichiers touchés, le
  temps total. Les lignes d'outils du fil disent aussi ce qu'elles font
  (`actionOutil`) : « Sous-tâche : Liste les fichiers du dossier » au lieu de
  « task ». Mêmes mots dans `helix code` (ligne d'état réécrite sur place dans un
  terminal) et, simplement, dans l'extension VS Code (0.2.3, `.vsix` pas refait).

Vérifié le 25/09/2026 sur ce poste, instance jetable (port 8896), Qwen3 8B de LM Studio
partagé : dans l'écran Code du navigateur, une tâche avec sous-tâche, liste de tâches
et deux fichiers écrits, 3 min 49 s en tout, le panneau montrant d'abord « Le modèle
termine une autre demande avant celle-ci » (LM Studio occupé ailleurs), puis « Le
modèle lit la demande (33 s, environ 3 000 jetons) » avec « 1 en file », puis la
sous-tâche et son outil, les fichiers, « Terminé » ; une demande de 7 815 jetons lue
en 43,1 s avec la barre à 32 puis 63 % ; aucun message de panne. Au passage, dans ce
banc, OpenCode a mis 20 s entre l'envoi et le début de son travail pour chaque
nouvelle session (5 s une autre fois, 0 s dans les essais du matin) : pas compris, pas
touché. *Pas essayé* : l'état « chargement » avec un vrai modèle à charger, la lecture
d'un sous-agent assez longue pour s'afficher, l'extension VS Code et la ligne de
commande dans un vrai terminal devant un modèle lent (`npm run essai:cli` reste vert :
31 sur 31 sans modèle, 48 sur 48 avec ; `npm run securite` : 152 sur 152), un contexte chargé plus petit par un autre
programme après le démarrage d'OpenCode (non vu par `limit`).

### 3.12 Entraîner un modèle : MLX-LM sur Mac, Unsloth sur carte NVIDIA

Demandé le 25/09/2026 : « entraîner un modèle sur des trucs précis », simplement,
depuis le logiciel, avec Unsloth et d'autres briques ouvertes. Livré : Paramètres >
Entraîner un modèle, en quatre étapes (exemples, entraîner, comparer, installer dans
LM Studio), et `gateway/src/entrainement.ts`.

- **Sur Mac, MLX-LM (MIT), LoRA.** Unsloth sur Mac passe lui-même par MLX : inspecté
  en lecture seule le 25/09/2026, son application installe mlx 0.32.1 et mlx-lm 0.31.3
  dans un environnement de 4,4 Go, et bascule sur `unsloth_zoo.mlx`. Aller directement à
  MLX-LM, c'est le même moteur, sans 4 Go de plus. Piloter l'application Unsloth du
  poste a été écarté (authentification propre, bêta, données d'une autre application).
- **Sur carte NVIDIA, QLoRA 4 bits par Unsloth**, transformers + peft en repli
  (Apache 2.0, bitsandbytes MIT). Écrit d'après la documentation, **jamais essayé sur
  une vraie machine**, et l'écran le dit.
- **Unsloth, décidé par Medhi le 25/09/2026.** Le cœur est Apache 2.0 et dépend
  d'`unsloth_zoo`, LGPL-3.0-or-later : utilisée comme bibliothèque, non modifiée, dans
  l'environnement Python séparé du moteur, elle est compatible avec l'AGPL du projet.
  C'est une **exception** à la règle « Apache 2.0 ou MIT », limitée à ces deux paquets ;
  Unsloth Studio (AGPL-3.0, application à part) n'est pas utilisé. Sur NVIDIA, Unsloth
  annonce environ deux fois plus de vitesse avec la même méthode. Les deux roues
  (unsloth 2026.9.11, unsloth_zoo 2026.9.7) sont téléchargées par Helix et vérifiées
  par empreinte (relevées sur PyPI et recalculées le 25/09/2026) ; leurs dépendances
  viennent de PyPI sans empreinte, comme le reste de la pile NVIDIA. Compatibles avec
  les versions figées (torch < 2.13, transformers 4.57.6, peft ≥ 0.18). Si Unsloth ne
  s'installe pas ou ne se charge pas, `SCRIPT_NVIDIA_ENTRAINER` repasse par
  transformers et peft, et le journal dit lequel a servi (`unsloth: true/false`). Les
  scripts de réponse et de fusion n'ont pas changé : l'adaptateur a le format de peft.
- **Exemples d'ancrage** : 30 questions ordinaires répondues par le modèle de départ
  lui-même, mêlées aux exemples. Mesuré sur Qwen3 1.7B : sans eux, 12 faits sur 15 et
  « la capitale de l'Italie est Verona » ; avec eux et une échelle LoRA de 10, 15 sur 15.
- **Rien n'est appris sans accord** : les paires tirées d'un document par le modèle du
  Chat vont dans « propositions à relire ».
- **Le modèle installé n'est jamais choisi d'office** : constaté à l'écran, il devenait
  le raccourci « Rapide » du sélecteur. Les modèles de `helix-entrainement/` portent
  `entraine: true` et sont écartés du choix automatique.
- Un nouvel entraînement s'écrit à côté de l'ancien : arrêté ou raté, il ne fait pas
  perdre le modèle qui marchait.

---

## 4. Sécurité

Le détail est dans [SECURITE.md](SECURITE.md). Voici ce qu'il faut avoir en tête.

### Deux niveaux d'authentification

Le **jeton d'instance** dit qu'une machine a le droit de parler. La **séance** dit
qui. Les routes qui font agir l'instance exigent une séance : elles sont listées dans
le tableau `EXECUTION` de `gateway/src/index.ts`, barrière posée **avant** le routage
pour qu'une route ajoutée plus tard ne puisse pas l'oublier. Ce tableau compte
aujourd'hui **36 routes**, recopiées une à une dans [SECURITE.md](SECURITE.md) § 1.3,
plus des préfixes entiers (agents, clés de modèles, dossier de l'équipe, groupes,
bibliothèque, réunions). Une seule route de `/helix/*` est publique : le retour
d'autorisation OAuth, où c'est un navigateur qui arrive depuis le service et qui ne
peut porter ni jeton ni séance — protégée par le `state` et par PKCE, elle ne rend
qu'une page à lire.

### La barrière d'approbation

`gateway/src/approbation.ts`. Trois niveaux, gardés par l'instance :

| Niveau | Ce qu'il demande |
|---|---|
| « tout » | rien, l'agent agit sans demander |
| « modifications » | un accord avant chaque action qui change quelque chose. **Défaut à l'installation** |
| « chaque » | un accord avant chaque appel d'outil, lecture comprise |

Quatre points de conception à ne pas défaire :

1. La barrière est **dans la passerelle**, appelée depuis `chat.ts` avant l'aiguillage
   vers l'outil. Un client qui appelle `POST /v1/chat/completions` avec `tools: true`
   passe exactement au même endroit.
2. **Un outil inconnu est classé comme modifiant.** La liste des outils de lecture ne
   vaut que pour le serveur de fichiers, celui qui l'a inspirée. Depuis que l'instance
   accepte des connecteurs, un serveur tiers pourrait exposer un `read_file` ou un
   `search_files` : il ne doit pas hériter du laissez-passer.
3. Une réponse vaut pour les **actions de même nature dans le même dossier, jusqu'à la
   fin de la demande en cours**. Un plan découpé enchaîne vingt appels ; demander vingt
   fois, c'est obtenir vingt accords distraits puis le désarmement du réglage. Un refus
   se retient de la même façon. Rien ne survit à la requête HTTP.
4. **Délai d'expiration de 120 secondes, l'expiration valant refus.**

### Ce qui a été trouvé en auditant, et corrigé

Douze défauts, tous démontrés à l'exécution puis vérifiés fermés. Le détail est dans
[SECURITE.md](SECURITE.md) § 14.

| Défaut | Ce qu'il permettait |
|---|---|
| Serveur OpenCode sans authentification | Tout processus du poste pilotait l'agent de code |
| Casse ignorée dans les chemins interdits | `/system` accepté là où `/System` était refusé, et les dossiers parents (`/private`, `/Library`) laissaient descendre |
| Traversée de chemin sur `GET /helix/audit?jour=` | Lire n'importe quel fichier du disque |
| Corps de requête sans borne | 400 Mo faisaient passer la passerelle de 108 Mo à 1196 Mo |
| Amplification de processus sur `GET /helix/code` | 40 requêtes créaient 40 processus enfants |
| `PUT /helix/data/*` en 500 bavard | Le message d'exception interne partait au poste |
| Promesses rejetées non capturées | Une installation qui échouait arrêtait la passerelle |
| **Bouton « refuser » qui approuvait** | Le code lisait `accord !== false` : tout ce qui n'était pas exactement `false` valait accord |
| Deux flux d'évènements au jeton seul | `computer/events` livrait le texte que l'agent devait saisir, mot de passe compris ; `code/events` démarrait OpenCode |
| En-têtes de sécurité absents des cinq flux | Dont celui de la conversation, figé sur `Access-Control-Allow-Origin: *` |
| Origine ouverte à tous | Une page quelconque obtenait les en-têtes de partage |
| Jeton d'un connecteur en clair sur la sortie d'erreur | Un serveur MCP qui recopie sa configuration déposait son secret dans le journal |

Deux d'entre eux méritent une phrase.

**Le bouton « refuser ».** Il est devenu un principe : *un contrôle de sécurité qui ne
comprend pas ce qu'on lui demande refuse.* Les deux routes d'approbation exigent
désormais un booléen explicite et répondent 400 sinon. Mesuré avant correction : un
refus envoyé sous un autre nom de champ laissait l'agent écrire le fichier, et le
journal enregistrait une approbation.

**La passerelle n'était vérifiée par rien.** `tsconfig.json` ne couvrait que `src`.
Vingt fichiers de passerelle, dont l'authentification et le chiffrement, échappaient à
toute vérification de types. `tsconfig.gateway.json` les couvre maintenant, et
`npm run build` vérifie les deux projets.

### La passe de sécurité de 0.22.0

Demandée le 18/09/2026 : « je veux un tour complet sur la sécurité, les failles, et
je ne veux plus aucun souci ». Deux relectures complètes ont été menées en parallèle,
l'une sur la passerelle, l'autre sur Electron et l'interface, puis chaque trouvaille
a été vérifiée dans le code avant d'être corrigée. Le détail, trouvaille par
trouvaille, est dans [SECURITE.md](SECURITE.md) § 17. Les quatre qui comptaient le
plus :

| Défaut | Ce qu'il permettait | Correction |
|---|---|---|
| Demandes d'approbation ouvertes à tous | N'importe quel poste du parc lisait, en direct et sans séance, le **corps entier** de chaque mail qu'un agent préparait pour un collègue — et pouvait répondre « oui » à sa place | Une demande porte le compte qu'elle concerne ; elle n'est montrée qu'à lui, et lui seul y répond. Vérifié par un essai à deux comptes |
| Adresse d'instance complétée en `http://` | Une adresse saisie sans schéma envoyait le jeton d'instance et le jeton de séance **en clair** à chaque requête | HTTPS supposé par défaut, HTTP refusé pour une instance distante |
| Politique de sécurité du contenu inopérante | Posée par un en-tête, qui ne s'applique pas aux pages chargées depuis le disque : l'application livrée n'en avait aucune | Posée dans la page, à la construction. Le `connect-src` ne laisse plus passer ni HTTP distant ni `data:` |
| Agent autonome et mail reçu | Le garde-fou ne couvrait que l'envoi de mails ; un message piégé pouvait encore faire écrire, déplacer ou supprimer des fichiers sans que personne ne voie rien | Pendant le traitement d'un mail reçu, **tout ce qui modifie** repasse par une carte d'accord, quel que soit le réglage |

### Les dettes de cette passe, fermées le lendemain (0.23.0)

Le § 17.5 de [SECURITE.md](SECURITE.md) listait cinq points laissés ouverts. Le
client a demandé de s'en occuper tout de suite. Quatre sont fermés, le cinquième
était une contrepartie assumée et non une dette. Le détail, avec les mesures, est
au § 18 de [SECURITE.md](SECURITE.md).

| Dette | Ce qui a été fait |
|---|---|
| Politique de contenu ouverte à tout HTTPS | L'interface a une vraie origine, `helix://app`, servie par l'application : la politique est posée par la réponse, donc **calculée**, et nomme l'instance configurée |
| Jetons dans l'adresse des flux d'évènements | Un **billet** à usage unique, valable une minute, remplace les deux jetons ; l'interface rouvre elle-même les flux |
| Jetons en clair dans le stockage du poste | Trousseau du système (`safeStorage`), fichier chiffré en 0600 ; le repli hors application de bureau est annoncé |
| Personne ne voyait l'ensemble du journal | Un rôle d'administrateur, désigné par le profil de déploiement ou, à défaut, le premier compte créé. Il n'ouvre **aucune donnée personnelle** |
| Fenêtre du bot sans isolation de contexte | L'isolation reste coupée (l'API qui permettrait les deux est arrivée dans Electron 35, nous sommes en 33), mais l'attaque est fermée : les fonctions du navigateur sont capturées avant tout script de la page |

**Le changement d'origine ne coûte rien à personne.** Une origine, c'est un
stockage, et le nouveau est vide. Une reprise unique de l'ancien, dans une fenêtre
cachée, garde l'identité connectée, les jetons (rangés au passage dans le coffre) et
les préférences. Mesuré de bout en bout : après mise à jour, l'application s'ouvre
sur l'interface connectée, thème compris.

**Il a quand même cassé deux choses, et c'est l'essai sur la vraie application qui
les a montrées** (SECURITE.md § 18.1) : la passerelle ne reconnaissait pas la
nouvelle origine et refusait toutes ses réponses ; et le passage au routeur
d'historique effaçait, à chaque navigation, le jeton que l'application remet à son
interface dans l'adresse — donc déconnexion au premier clic sur « Réglages ». Les
deux sont corrigés et vérifiés. À retenir : un banc d'essai qui recrée le cas
nominal ne remplace pas un lancement de l'application livrée, sur de vraies
données.

### Ce qui a été ajouté le 25/09/2026

Détail dans [SECURITE.md](SECURITE.md) § 22. `npm run securite` compte désormais
**167 contrôles, tous réussis le 25/09/2026** (77 la veille ; dont 5 pour le flux de
Helix Code fabriqué par la passerelle, § 3.11, 15 pour les employés et les bases de
connaissances, § 3.10, 7 pour l'export RGPD et l'effacement, et, l'après-midi, 14 pour
les employés et les bases partagées à un groupe, plus une route sans séance). Le
26/09/2026 : **198 contrôles, tous réussis**, dont 26 pour les deux défauts de la revue
du 25/09 (dossier de l'équipe, import local ; SECURITE.md § 22.6).

| Surface | Règle |
|---|---|
| Images d'un Chat partagé | Visibles de leur auteur et de qui voit le Chat **où elles ont été créées** (`voitConversation`) ; tout autre demandeur reçoit 404, que l'image existe ou non. Un identifiant recopié dans un autre Chat n'ouvre rien. Réponse `no-store` pour un collègue, pour qu'un partage retiré cesse aussitôt |
| Bases de connaissances | Droits hérités de Fichiers : une base a la visibilité des objets de la Bibliothèque, seul son propriétaire la modifie, et à chaque question seuls comptent les documents que la personne voit. Index chiffrés, 0600. Préfixe `/helix/connaissances` entier sous séance |
| Employés et bases | Ce qui est ouvert à toute l'équipe ; en plus, les bases et documents partagés aux groupes du propriétaire **seulement** si tout ce qui sort de l'employé ne va qu'à lui (personnel, sans messagerie, sans mission à chaque mail, encadré, sans outil qui écrit). Jamais un document privé. Relu à chaque appel |
| Entraînement | Préfixe `/helix/entrainement` entier sous séance ; projet rendu à son seul auteur, identifiant de 24 caractères hexadécimaux tiré au sort ; projet chiffré au repos, jamais réécrit s'il est illisible ; aucun exemple en argument de commande |
| Outils de Code | `/helix/code/outils` réservée à l'agent de code de l'instance : jeton **et** clé tirée à chaque démarrage (`X-Helix-Cle`), comparée en temps constant ; chaque appel passe par la barrière et le journal |
| Ligne de commande | Jeton du poste lu **seulement pour une adresse locale** ; http vers une autre machine refusé avant tout envoi ; mot de passe tapé sans écho et jamais écrit ; séance rangée par adresse d'instance |
| Dossier de l'équipe (revue du 25/09) | Avec « Tout mon poste », `GET /helix/espace/fichier?chemin=.helix/data/…` rendait le jeton d'instance et la mémoire des employés à toute personne connectée, et l'agent de Cowork lisait `~/.ssh`, `~/.claude`. Désormais : segments en point refusés, **zones protégées** (`zonesProtegees.ts` : données de l'instance, `~/.helix`, clés, `.config`, historiques des autres assistants, trousseaux) refusées sur leur chemin réel, dans l'espace, le serveur de fichiers MCP, la bureautique et le contrôle web ; la fenêtre « Tout mon poste » le dit |
| Import depuis les logiciels (revue du 25/09) | La boucle locale ne suffisait pas sur une instance partagée (un outil du serveur appelait `127.0.0.1` avec `?token=`). Désormais : 403 si l'instance est partagée, jetons en en-têtes seulement, compte administrateur exigé |

### Principes à tenir

- **Échec fermé.** Un contrôle de sécurité qui ne comprend pas ce qu'on lui demande
  refuse. Il n'accepte jamais par défaut.
- **La barrière est dans la passerelle**, jamais dans l'interface. Un contrôle posé
  dans le navigateur se contourne en appelant la route directement.
- **Le journal ne consigne jamais de contenu**, seulement des chemins.
- **Le périmètre borne le choix de la personne** ; une fois le dossier fixé, c'est le
  serveur de fichiers qui y tient l'agent.
- **La commande d'un connecteur vient de Helix, jamais de la requête.** Un serveur MCP
  est un programme exécuté sur la machine de l'entreprise. Laisser l'interface choisir
  cette commande reviendrait à offrir l'exécution de code à distance à quiconque
  atteint la passerelle. Le catalogue est figé dans `gateway/src/connecteurs.ts` ; la
  requête n'apporte que des secrets. Une commande libre n'existe que si le profil de
  déploiement l'autorise (`connecteursLibres`), et c'est refusé par défaut.

### Ce qui reste ouvert

- **Plus aucun compte sans mot de passe, depuis 0.9.0**, pas même le premier : sur
  une instance partagée, le jeton devenait une identité. Reste une fenêtre étroite,
  pesée et assumée : un compte créé *avant* 0.9.0 choisit son premier mot de passe à
  la connexion suivante, au jeton seul, une seule fois (SECURITE.md § 2).
- La **double authentification** est facultative par défaut ; l'intégrateur l'impose
  à toute une instance par `deuxFacteursObligatoire` (SECURITE.md § 2.1).
- Après une **suppression de compte**, le journal d'audit est conservé (identifiant,
  adresse notée à la création) le temps de sa durée de conservation : 90 jours par
  défaut, de 30 à 3650 par `journalConservationJours` du profil, affichée dans
  Sécurité ; au-delà, les journées sont effacées de l'instance (la copie
  `journalCopie`, elle, n'est jamais purgée) (SECURITE.md § 4 et § 7.2).
- **LM Studio** interdit de servir une instance à d'autres organisations (§ 3.9).
- **Le bot de réunion** entre dans une réunion Google Meet comme invité : un
  participant doit l'admettre, et c'est à la personne qui l'envoie de prévenir les
  autres (l'écran le dit). Sa fenêtre charge Google Meet sans isolation de contexte
  (c'est ce qui lui laisse voir le son) : elle ne charge rien d'autre que
  meet.google.com et accounts.google.com, n'a ni micro, ni caméra, ni aucun accès au
  système, et son seul canal transporte du son vers la réunion qu'elle enregistre
  (SECURITE.md § 16).
- L'application est signée **ad hoc**, sans identité Apple. Voir
  [SIGNATURE.md](SIGNATURE.md).
- **La clé de chiffrement passe en argument** à `security add-generic-password`. La
  question a été instruite plutôt que laissée ouverte, et l'analyse est écrite dans
  `gateway/src/secret.ts` : `-w` sans valeur attend une invite interactive, que la
  passerelle n'a pas ; le mot de passe poussé sur l'entrée standard n'est pas lu, et
  l'entrée est créée vide (mesuré) ; un terminal simulé par `script` échoue en code 2
  (mesuré) ; un vrai pseudo-terminal demanderait une dépendance native, que la
  passerelle s'interdit. Ce qui reste exposé : la clé apparaît dans les arguments du
  processus le temps de l'appel. Sur macOS, seuls les processus du même compte les
  voient, et un tel processus peut de toute façon lire la clé par
  `security find-generic-password`. Le gain d'un attaquant est donc nul, à une réserve
  près : un journal système qui enregistrerait les exécutions garderait cette ligne.
- Le journal nomme désormais qui a demandé et qui a approuvé chaque action d'écran et
  chaque outil ; il ne dit pas encore ce que l'agent voyait (pas de journal rejouable).
- **Employés OpenClaw** : OpenClaw n'est pas une frontière de sécurité entre personnes
  qui ne se font pas confiance (c'est écrit dans sa documentation). Helix en tient
  compte : chaque conversation a sa clé, les échanges sont gardés et effacés par
  Helix, la fiche de poste interdit de répéter à l'un ce que l'autre a dit (vérifié :
  un code confié par une personne n'a pas été rendu à une autre). Mais la mémoire de
  travail d'un employé (ses notes) est commune à tous ceux qui lui parlent, et
  l'écran le dit. Ses propres outils de fichiers ne sortent pas de son espace
  (`tools.fs.workspaceOnly`) ; tout ce qui touche l'entreprise passe par Helix.
- **Bases de connaissances** (25/09/2026) : un document piégé (« ignore tes
  instructions ») arrive dans le prompt avec ses passages. La consigne le désigne comme
  une donnée, rien de plus n'est garanti ; en Cowork, c'est la barrière d'approbation
  qui protège. Les extraits cités sont gardés avec le Chat : qui voit un Chat partagé
  les voit, comme il voit déjà la réponse. Un modèle `embed` distant imposé par le
  profil ferait partir le texte des documents chez ce fournisseur (l'écran de la base
  affiche le modèle qui a indexé chaque document).
- **Modèle entraîné** (25/09/2026) : une fois installé, il est visible de toute
  l'instance dans le sélecteur, et ce qu'il a appris peut ressortir dans les Chats des
  collègues ; LM Studio ne cloisonne pas par personne. L'écran le dit avant
  l'installation.
- **Séance de la ligne de commande** en clair sur le disque, protégée par les
  permissions du compte (§ 3.11).

---

## 5. Où en est le produit

### Fonctionne, et a été vérifié dans le code

**Le moteur.** Passerelle modèles avec routage par rôle, streaming, découverte des
backends, provisionnement automatique de LM Studio et du modèle adapté à la machine.
Découpage des tâches lourdes selon la taille du modèle (§ 3.6).

**Les quatre surfaces.** Chat, Cowork, Code, Tâches. Projets et Agents avec partage.
La délégation d'une tâche à un agent fait avancer la carte du Kanban toute seule.
**Les cartes s'enchaînent (0.19.0)** : une carte peut attendre une ou plusieurs autres
(champ « Après »), partir d'elle-même dès qu'elles sont terminées (ou rester à lancer
à la main), et son agent reçoit leurs comptes rendus pour s'appuyer dessus. Une étape
faite par une personne (passée en « Terminée ») lance aussi la suite ; une étape
annulée bloque la sienne, et la carte le dit ; une boucle est refusée au moment du
choix. Les cartes lancées d'elles-mêmes passent une à une (un modèle local ne sert
qu'une carte à la fois correctement). Les exécutions sont tenues par l'application et
non plus par l'écran Tâches (`src/lib/executions.ts`) : une chaîne continue pendant
qu'on travaille ailleurs. **Limite :** elles tournent dans la fenêtre de
l'application ; la fermer les interrompt (les agents OpenClaw, eux, travaillent
fenêtre fermée).

**Ce qui agit.** Boucle d'outils MCP bornée à un espace de travail. Contrôle de
l'écran sous approbation. Atelier bureautique isolé, cinq outils `bureau__…` pour
Word, Excel avec formules, PowerPoint et PDF.

**Les employés** (§ 3.4). Agents OpenClaw déployés depuis la page Agents : un poste,
des outils Helix, des missions planifiées, une conversation par personne, un onglet
Activité avec les comptes rendus. Vérifié de bout en bout sur OpenClaw 2026.9.4 :
déploiement, conversation (continuité dans la session, cloisonnement entre deux
personnes), mission lancée, demande d'accord qui nomme l'employé, écriture après
accord, compte rendu honnête quand personne ne répond, deux employés sans
interruption l'un de l'autre, suppression, effacement d'un compte (ses employés et ses
conversations disparaissent aussi chez OpenClaw), reprise d'un OpenClaw orphelin
après un arrêt brutal, passerelle empaquetée.

**Groupes, Bibliothèque, Réunions (0.16.0).** Les trois écrans en maquette sont
devenus réels, tenus par l'instance :

- **Groupes** (`gateway/src/groupes.ts`) : annuaire de l'équipe ; chacun crée un
  groupe dont il est responsable ; seuls les responsables le changent ; il en reste
  toujours un. On partage à un groupe une conversation, un dossier ou un document,
  une réunion.
- **Bibliothèque** (`gateway/src/bibliotheque.ts`) : dossiers et documents (1 Go, envoyés en flux),
  chacun avec sa visibilité (vous seul, des groupes, toute l'équipe) ; contenu
  **chiffré sur le disque** et lié à son identifiant ; texte extrait sur le poste,
  pour une recherche dans le contenu et pour les agents (`bibliotheque__chercher`,
  `bibliotheque__lire` : le Chat voit ce que voit la personne, un agent toujours actif
  seulement ce qui est ouvert à toute l'équipe). Qui voit un dossier peut y déposer
  ses documents ; on ne supprime pas un dossier qui contient ceux d'un collègue.
- **Réunions** (`gateway/src/reunions.ts`) : enregistrement au micro (morceaux de
  dix secondes, chiffrés un à un), import d'un fichier audio ou vidéo (2 Go), ou
  **bot maison** qui rejoint une réunion Google Meet (`electron/botReunion.cjs`,
  gratuit, sans service tiers : une fenêtre cachée de l'application capte le son des
  participants). Transcription par Whisper sur la machine, amorcée par le titre et
  les noms de l'équipe ; compte rendu (résumé, décisions, actions à verser dans
  Tâches) par un modèle de la machine, à défaut celui du prestataire, jamais une clé
  personnelle, et l'écran dit lequel. L'audio est effacé après la transcription,
  sauf réglage. Le bot peut rejoindre seul les réunions Google Meet de l'agenda.
  Vérifié : 29 s de réunion importée, transcrite et résumée en 18 à 36 s ; le vrai code
  du bot face à une réunion simulée (mêmes libellés que Google Meet, vraie connexion
  WebRTC) : sans micro, nom, demande, attente, admission, enregistrement, fin
  détectée, son transcrit. **Pas encore éprouvé dans une vraie réunion Google Meet** :
  le parcours est lu dans la page par ses libellés, français et anglais, et Google
  peut les changer.
- **Bot Recorder** (Paramètres) : nom du bot, compte Google facultatif pour les
  réunions qui refusent les invités, envoi automatique, langue, compte rendu
  automatique, conservation de l'audio.

**Les pièces jointes.** Le « + » et le glisser-déposer (sur toute la fenêtre)
acceptent PDF, Word, Excel, PowerPoint et OpenDocument : le texte est extrait sur le
poste (pdf.js, Apache-2.0 ; lecteur ZIP écrit à la main pour les formats Office), un
PDF scanné ou protégé est signalé plutôt que lu à vide (`src/lib/documents.ts`).
Ce qui borne une pièce jointe n'est pas le poids du fichier mais ce que le modèle peut
lire d'un coup : environ 200 000 caractères par fichier (moins pour un petit modèle
local, dont la fenêtre est plus courte). Depuis la 0.18.0, un fichier texte se joint
quelle que soit sa taille (seul son début est lu, et la puce le dit : « (début) ») ;
une photo ou une capture jusqu'à 50 Mo est réduite à 2048 pixels de côté au lieu
d'être refusée (la limite était de 2 Mo) ; un PDF ou un document Office jusqu'à
100 Mo (au-delà, sa lecture dans la page prendrait des minutes). Pour un long
document, la Bibliothèque est le bon endroit : l'assistant y cherche, puis lit par
passages de 15 000 caractères autant qu'il faut (`bibliotheque__lire`, paramètre
`depuis`) ; les transcriptions de réunion se lisent de même.
Les réponses des modèles sont mises en forme (gras, listes, titres, code) sans
jamais interpréter de HTML (`src/components/ui/TexteRiche.tsx`).

**Ce qui est branché sur le monde du client**, en lecture seule et par protocole
ouvert :

| Connecteur | Protocole | Outils | Fichier |
|---|---|---|---|
| Courrier | IMAP, SMTP pour l'envoi | `courrier__derniers`, `courrier__chercher`, `courrier__lire`, `courrier__brouillon`, `courrier__envoyer` (si l'envoi est activé ; accord à chaque mail, sauf option « Envoyer sans me demander ») | `gateway/src/courrier.ts`, `gateway/src/smtp.ts` |
| Agenda | CalDAV | `agenda__prochains`, `agenda__jour`, `agenda__chercher` | `gateway/src/agenda.ts` |
| Google Drive | API Google, OAuth de l'entreprise | `drive__chercher`, `drive__recents`, `drive__dossier`, `drive__lire` | `gateway/src/drive.ts` |
| Slack | API Slack, bot de l'entreprise | `slack__salons`, `slack__messages`, `slack__fil`, `slack__chercher` | `gateway/src/slack.ts` |
| Serveurs MCP du catalogue | MCP | ceux du serveur branché | `gateway/src/connecteurs.ts` |

Les deux clients sont écrits sans dépendance, sur la seule bibliothèque standard de
Node : une bibliothèque tierce qui lit tout le courrier de l'entreprise est un arbre
de dépendances que personne dans l'équipe n'a relu. Le courrier a deux écritures, le
dépôt d'un brouillon et, s'il est activé, l'envoi, chaque mail accepté un par un
(§ 3.5) ; l'agenda n'en a aucune. Le courrier ouvre les boîtes par
`EXAMINE` et non par `SELECT` : même le drapeau « lu » reste intact.

Deux propriétés à répéter au client, parce qu'elles sont structurelles et non
déclaratives :

- côté courrier, tout critère venu du modèle part en **littéral IMAP**, précédé de sa
  taille en octets. Le serveur lit ensuite exactement ce nombre d'octets, sans jamais
  y chercher une fin de commande. L'injection de commande est donc impossible par
  construction, pas par filtrage ;
- côté agenda, le seul texte libre qui atteint le fil traverse `echapperXml`, et le
  connecteur ne rapatrie jamais un agenda entier : chaque lecture est un `REPORT`
  filtré sur la période demandée.

**Ce qui protège.** Chiffrement au repos du magasin fichiers **et de PostgreSQL**,
chaque coffre lié à sa collection ; journal d'audit scellé et chaîné ; séances
révocables ; mot de passe obligatoire pour tout compte ; double authentification
TOTP avec codes de secours ; cloisonnement appliqué par l'instance ; barrière
d'approbation à trois niveaux (§ 4). Export RGPD des données de chacun
(SECURITE.md § 7.1).

**L'interface.** Thème sombre complet, quatre modes, bascule au coucher du soleil
calculé sur le poste sans réseau (`src/lib/soleil.ts`). Écran Connecteurs unique, en
grille de tuiles portant les logos des services.

**L'outillage.** `tsconfig.gateway.json` couvre les 49 fichiers de la passerelle, et
`npm run build` vérifie les deux projets. L'outil de récupération redéfinit le mot de
passe d'un compte, ou retire sa double authentification, depuis le poste, sans écho :
il n'existe pas de « mot de passe oublié » par courriel, l'instance ne sait pas envoyer
de courrier. Il est **embarqué dans l'application** (`dist-gateway/motdepasse.cjs`,
lancé par le binaire de l'application, sans Node installé) ; depuis les sources,
`npm run motdepasse`.

### Ce qui est encore annoncé sans fonctionner, et le dit

Plus aucun écran en maquette depuis 0.16.0. Les notifications et l'aide ont cessé
d'être grisées en 0.22.0, « Créer une compétence » a été faite en 0.24.0.
Restent, marqués « bientôt » à l'écran : les **clés d'API développeur** et le
**téléchargement direct des applications** (Paramètres, Installer les apps).

### Affichages faux : ce qui a été réglé

Un logiciel qui ment est pire qu'un logiciel incomplet (§ 6). Tout ce qui
affichait un état inventé a été retiré ou rendu réel : la coche « email
vérifié », le badge « À jour », l'écran Intégrations qui affichait Google comme
« Connecté », l'aperçu de date écrit en dur, et en dernier l'écran **Mon usage**,
le plus trompeur, parce qu'il avait l'air d'un tableau de bord.

**Mon usage est désormais mesuré** (`gateway/src/usage.ts`). Les jetons sont lus
dans la réponse de chaque moteur, pour toutes les requêtes : conversation, plan
et chaque étape d'une tâche découpée, agent de code. Vérifié : chiffres
identiques à ceux du moteur interrogé directement, et une tâche découpée compte
bien un appel pour le plan et un pour chaque tour d'étape. Un modèle local coûte
0 € de frais d'API ; un modèle distant a un tarif à renseigner, et tant qu'il ne
l'est pas, l'écran dit « tarif non renseigné » plutôt qu'un chiffre faux.
Chacun ne voit que sa consommation.

**Profil, Préférences, suggestions et dictée**, livrés en même temps :

- le nom et l'adresse s'enregistrent ; changer d'adresse ne permet pas
  d'hériter des invitations d'une collègue (SECURITE.md § 1.6) ;
- les formats de date s'appliquent partout, et le faux choix « English » a
  disparu ;
- les suggestions de l'accueil mènent toutes quelque part de réel, et
  s'adaptent à ce qui est branché ;
- la dictée transcrit sur la machine, avec Whisper, sans connexion réseau
  (SECURITE.md § 1.7).

**Sécurité, confidentialité et classement**, livrés en 0.9.0 :

- mot de passe obligatoire partout (10 caractères), premier mot de passe pour les
  comptes anciens ;
- double authentification TOTP : QR code calculé sur le poste, dix codes de
  secours à usage unique, retrait par l'outil de récupération ;
- PostgreSQL chiffré, migration de l'existant au démarrage ;
- export RGPD : un fichier JSON de tout ce qui concerne la personne, et ce qu'il ne
  contient pas ;
- un chat se range dans un projet (classement personnel, qui n'ouvre la conversation
  à personne) ; les tâches ont une échéance et un projet, des vues Boîte de
  réception, Aujourd'hui, À venir et par projet, un filtre et un tri.

Ce qui restait affiché sans fonctionner a été rendu réel depuis (la photo de profil en
0.16.0) ; la liste de ce qui reste est plus haut.

### À faire, dans cet ordre

Fait en 0.9.0 : premier compte sans mot de passe, double authentification,
chiffrement de PostgreSQL, export des données, rattachement d'un chat à un projet,
filtres et tri des tâches.

Fait en 0.10.0 : suppression de compte, double authentification imposable, auteur
des actions d'écran et des approbations au journal, pilote PostgreSQL livré avec
l'application, mise à jour de l'application (automatique une fois signée),
préparation complète de la signature, licences vérifiées (§ 3.9), acceptation des
conditions de LM Studio, connecteurs Google Drive et Slack, activation du contrôle
de l'écran depuis l'interface (poste autonome), nom de la marque dans tous les
messages de la passerelle.

Fait en 0.24.0 : **toutes les façons de rejoindre, et une seule chose à
transmettre**. L'ouverture de la 0.23.0 rendait l'instance joignable ; restait ce
que l'utilisateur devait faire lui-même. Trois changements (ADR-042) :

- le mail d'invitation porte un **lien**. Un clic ouvre l'écran de rattachement,
  adresse et code déjà remplis. Sans lien cliquable, le champ d'adresse accepte
  qu'on lui colle le lien entier, et le mail garde les deux lignes à saisir à la
  main ;
- le lien **ne rattache pas tout seul**. Le système ouvre un `helix://` d'où qu'il
  vienne, y compris d'une page web : l'écran affiche donc l'adresse en toutes
  lettres et attend un clic, sans quoi n'importe quel site pourrait pointer un
  poste vers l'instance de son choix (SECURITE.md § 19) ;
- les chemins sont **nommés**. Les adresses de la machine sont classées entre
  « même réseau » (même Wi-Fi, même câble) et « réseau privé » — un tunnel VPN,
  Tailscale ou WireGuard, reconnu à son interface ou à la plage 100.64.0.0/10. Le
  produit **détecte** le tunnel que vous avez monté et s'en sert ; il n'en installe
  pas, parce qu'un tunnel clés en main suppose un service de rendez-vous entre les
  machines, donc un tiers au milieu. Et il déconseille l'ouverture d'un port sur la
  box, qui exposerait le poste à tout Internet.

Corrigé au passage : l'invitation émise depuis la machine hôte portait le nom
d'hôte brut (« Mini-de-Clabaut »), qui ne résout nulle part ; elle porte désormais
la première adresse annoncée.

Fait en 0.24.0 : **la licence, AGPL-3.0** (§ 3.9), fichier [LICENSE](LICENSE) et
[COPYRIGHT.md](COPYRIGHT.md). Le produit peut enfin dire « open source » sans que
ce soit faux, et l'écran « À propos » porte la licence et l'adresse du code
source, comme la licence l'exige de qui distribue le logiciel.

Fait en 0.24.0 : **les compétences fonctionnent** (ADR-043). Le bouton « Créer une
compétence » existait depuis le début, grisé, avec « Bientôt disponible » en
infobulle. Une compétence est une **procédure écrite en français** — comment on
rédige un compte rendu ici, quelles mentions porte un devis, dans quel ordre on
facture — que le modèle applique quand la situation s'y prête. Trois champs : un
nom, quand s'en servir, la procédure. Elles valent dans Cowork, dans le Chat et
pour les tâches exécutées par un agent, se partagent à l'organisation comme un
agent, et l'écran affiche combien de caractères partent réellement au modèle.

**Trouvé en testant, et pas en lisant** : une compétence créée à l'écran
disparaissait au rechargement. `storage.ts` tenait à la main la liste des clés
locales à pousser vers l'instance, et « competences » n'y était pas : rien
n'était poussé, et la lecture suivante rendait le tableau vide de l'instance,
qui écrasait le travail local. C'est la même famille que la perte de données de
la 0.23.0, par l'autre bout. La liste écrite à la main est supprimée : la
correspondance se déduit désormais de `COLLECTIONS`, pour que la prochaine
collection ajoutée ne puisse plus tomber dans le même trou.

Fait en 0.25.0, demandé par le client : **le logiciel parle trois langues**
(ADR-045). Français, anglais, chinois, au choix de chacun dans Réglages,
Préférences. 1 842 phrases, traduites à 100 % dans les deux langues, mesuré par
`npm run i18n`.

**La méthode, parce qu'elle explique le résultat.** La clé de traduction est la
phrase française elle-même : `t("Nouveau Chat")`, pas `t("nav.newChat")`. Le
code reste lisible, et une phrase sans traduction s'affiche en français au lieu
d'un identifiant. Les phrases à trous passent par `tf("Écrire à {0}…", nom)`,
ce qui permet au chinois de replacer la valeur ailleurs dans la phrase.

L'enveloppement des 1 842 phrases a été fait **par transformation du code avec
le compilateur TypeScript**, en quatre passes, chacune née d'un défaut constaté
dans l'application. Le compilateur a servi de garde-fou : une chaîne qui
servait d'identifiant plutôt que de texte fait échouer la compilation, ce qui
est exactement ce qu'on veut.

**La vérification est ce qui a coûté le plus, et c'est normal.** Vingt-deux
écrans parcourus en anglais, puis en chinois, avec un relevé automatique de ce
qui restait. Le premier relevé cherchait les phrases connues du catalogue mais
affichées en français : il a rendu une liste vide, et cette liste vide était
fausse. Une phrase jamais enveloppée n'est pas dans le catalogue, donc ne peut
pas y être cherchée. Le second relevé, bien plus sévère, cherche **tout texte
en alphabet latin** dans l'interface chinoise : il a trouvé ce que le premier
ne pouvait pas voir, et notamment un défaut de l'outil lui-même — le relevé ne
lisait que `t()`, pas `tf()`, et laissait donc cent cinquante phrases hors du
catalogue sans rien en dire.

Ce qui n'est pas traduit, et que l'écran dit : ce que les utilisateurs
écrivent.

Fait en 0.26.0 : **la passerelle parle aussi les trois langues**. C'était la
réserve laissée par la 0.25.0 — « L'adresse CalDAV n'est pas une URL valide »
arrivait en français au milieu d'un écran anglais. 289 messages relevés et
traduits (`npm run i18n-passerelle` : `node scripts/i18n-passerelle.mjs`),
catalogues dans `gateway/i18n/`.

La difficulté n'était pas la traduction mais **savoir à qui l'on parle** : une
instance sert plusieurs postes, qui ne lisent pas la même langue, si bien
qu'une langue « de l'instance » serait fausse pour quelqu'un. Chaque requête
porte donc la sienne (`X-Helix-Langue`, ou `?langue=` pour les flux
d'évènements, qui ne portent pas d'en-tête), et `AsyncLocalStorage` — du Node
standard, la passerelle restant sans dépendance — la rend lisible depuis
n'importe quelle profondeur d'appel sans la passer en paramètre à trois cents
endroits. Hors requête (démarrage, tâches planifiées, journal), il n'y a
personne à qui parler : la phrase reste en français, et le journal du serveur
reste dans une seule langue, ce qui est voulu.

Le défaut trouvé en parcourant l'écran, et non dans le code : l'en-tête
manquait à `Access-Control-Allow-Headers`, ce qui coupait **toutes** les
requêtes d'un poste rattaché, langue ou pas.

Fait aussi en 0.26.0 : **l'anglais devient la langue par défaut** quand le
système n'en indique pas une des trois ; les tailles de fichiers suivent la
langue (« 1 Go » devenait « 1 Go » en anglais, c'est maintenant « 1 GB », via
`taille()` dans `src/lib/i18n.ts`) ; l'onglet « Bibliothèque » s'appelle
« Fichiers » ; le logo ne s'allume plus au survol, n'étant pas un bouton ; et
Chat, Cowork et Code forment un seul bloc horizontal en haut de la barre
latérale — sans icône, faute de place pour elle et le mot : à 248 px de barre,
une pastille en reçoit 70, et « Cowork » avec son icône en demande 80.

**Le raisonnement, cinq niveaux au lieu de trois (0.26.0).** Le réglage ne
faisait qu'une chose : relever un plancher de jetons. Un client qui demandait
déjà large ne voyait donc aucune différence entre « rapide » et
« approfondi » — un bouton qui ne change rien est pire qu'un bouton absent.
Les niveaux sont désormais Aucun, Faible, Moyen, Élevé, Max, sous un titre
« Raisonnement » et chacun avec une ligne disant ce qu'il fait, et ils agissent
par trois leviers (`NIVEAUX_EFFORT`, `gateway/src/config.ts`) : le plancher de
jetons, que tout moteur respecte ; `reasoning_effort`, que la plupart des
moteurs compatibles OpenAI suivent ; et `chat_template_kwargs.enable_thinking`,
par quoi LM Studio, vLLM et llama.cpp coupent la réflexion d'un Qwen3 pour le
niveau « Aucun ». Les deux derniers sont des extensions : un moteur qui ne les
connaît pas refuse la requête, elle est alors rejouée une fois sans eux et le
moteur est retenu, comme cela se faisait déjà pour `stream_options`. Vérifié de
bout en bout contre un moteur factice : choisir « Max » à l'écran fait bien
partir `reasoning_effort: "high"` et `max_tokens: 16384`, et un moteur qui
refuse ces champs reçoit quand même le budget, sans que la conversation casse.

Deux retours du client sur cette même 0.26.0, corrigés dans la foulée. Les
icônes de Chat, Cowork et Code étaient parties avec le passage à l'horizontale ;
elles reviennent, et « Cowork » tient enfin parce que les pastilles suivent la
largeur de leur mot (`grow`) au lieu d'être forcées à la même (`flex-1`) : le
mot le plus long réclamait 75 px, en recevait 74, et se coupait pour un pixel
pendant que « Chat » en gaspillait quinze. Et l'écran Connecteurs cachait ses
trente-cinq services derrière une tuile « Tous les services » : quelqu'un qui
cherche Notion ne clique pas sur une tuile qui ne dit pas Notion. La liste et
son champ de recherche sont maintenant à l'écran, sous les quatre branchements
courants.

**Les connecteurs, lisibles (0.26.0).** L'écran avait quatre tuiles en haut —
courrier, agenda, Drive, Slack — et le catalogue en dessous : Gmail s'affichait
donc deux fois, et trente lignes identiques, précédées d'un simple point gris,
se lisaient une par une pour retrouver son service. Tout tient maintenant dans
une seule liste « Services connectés », chaque ligne portant le **logo** du
service, avec un point d'état posé dessus. Les quatre écrans de réglages
(IMAP, CalDAV, Drive, Slack) s'ouvrent sous leur ligne, comme les autres, et la
recherche les trouve comme les autres.

Les logos viennent de Simple Icons (CC0) et sont recopiés dans le source par
`scripts/gen-marques.cjs` : quarante dessins, plutôt qu'une dépendance de
quinze mégaoctets. Slack et OpenAI ont demandé le retrait de leur logo de ces
collections, Canva, Firecrawl, Tavily et Exa n'y ont jamais figuré : tous
reçoivent une icône neutre, ce qui est aussi plus prudent juridiquement qu'un
dessin approximatif.

**Le sélecteur de modèles, un seul panneau (0.26.0).** Il y en avait deux :
« comportement », puis « modèle précis » derrière un chevron. Deux défauts,
tous deux constatés à l'usage.

Le premier : les raccourcis ne disaient pas ce qu'ils faisaient. « Rapide » ne
nommait aucun modèle — on choisissait une promesse. Chaque raccourci montre
désormais le modèle qu'il retient, avec le logo de son éditeur et le drapeau du
pays qui l'héberge, et une recherche en tête du panneau trouve un modèle ou un
fournisseur sans dérouler la liste.

Le second était plus grave : « Rapide » et « Approfondi » écrivaient le
**niveau d'effort**, celui-là même que règle la puce « Raisonnement » posée
juste à côté depuis le début de cette version. Deux commandes pour une seule
valeur, avec deux vocabulaires différents : régler l'une décochait l'autre. Les
raccourcis choisissent maintenant un **modèle** — ce qu'ils ont toujours
prétendu faire — et l'effort reste au bouton d'effort.

**Les modèles de la machine sur le graphique (0.26.0).** L'écran annonçait
« aucun de vos modèles n'y figure » à quelqu'un qui en avait un sous les yeux :
un modèle qui tourne sur le poste n'est mesuré par personne, et n'a pas de prix
par jeton. Il a maintenant sa **bande**, à gauche, avant que l'échelle des prix
ne commence, séparée par un trait.

Le raisonnement derrière cette bande : sur une échelle logarithmique, « rien »
n'a pas de place — log(0) n'existe pas — et poser un modèle local à la valeur
la plus basse du graphique reviendrait à lui inventer un prix. Sa hauteur, elle,
reste honnête : la note du relevé quand il y figure (`gpt-oss-120b` y est), et
sinon une place marquée « note non relevée », en cercle creux, en bas de la
bande. Un modèle hébergé garde sa place dans le nuage ; un modèle local n'y
apparaît plus en double, au prix de quelqu'un d'autre.

Le bouton « Brancher un modèle cloud avec une clé » est remonté **au-dessus**
de la liste : c'est une action, pas une note de bas de page, et c'est
précisément quand on n'a pas le modèle qu'on veut qu'on en cherche un nouveau —
donc sans avoir à dérouler dix entrées d'abord.

**Trois retouches demandées après coup (0.26.0).** Les serveurs livrés avec le
produit passent **devant** les services à brancher : les mettre après, c'était
faire chercher ce qu'on a déjà. Le groupe est reconnu à son attribut `integre`
et non à son titre, qui est du texte traduit. Sur le graphique, chaque point
porte désormais son nom — un nuage de ronds anonymes ne dit rien — avec un
placement qui évite les chevauchements et cède toujours la place au modèle en
cours plutôt qu'à un repère lointain. Et le modèle en cours est marqué en
bleu, avec sous le graphique une ligne qui donne sa note, son coût, sa vitesse
et son rang : un nuage répond à « où se situent les modèles », pas à « et le
mien, alors ? ». Quand ce modèle n'est pas au relevé, la ligne le dit au lieu
de disparaître.

**Comparer intelligence et prix (0.26.0).** Un nuage de points, intelligence
en ordonnée et coût moyen par tâche en abscisse (échelle logarithmique) : les
modèles que l'instance sert sont marqués, les autres servent de repères, et
cliquer un point choisit le modèle.

Les chiffres viennent d'Artificial Analysis et sont **figés dans le logiciel**,
avec la date du relevé affichée et un lien vers la source. Décision du client,
et elle est cohérente avec le produit : interroger un service américain à
l'ouverture d'un écran contredirait la promesse « rien ne part vers un service
tiers », et l'écran ne marcherait plus sans Internet, ce qui n'a pas de sens
sur une instance au fond d'un bureau. Le prix est que les chiffres vieillissent
d'une version à l'autre ; l'écran le dit.

Ce que le relevé ne donne pas, l'écran ne l'invente pas : le coût n'est publié
en clair que pour onze des vingt-cinq modèles, les quatorze autres figurent
donc au tableau avec un tiret et **pas** sur le graphique. Lire une position de
point pour en déduire un prix aurait rempli le nuage d'approximations
présentées comme des mesures. De même, un Qwen 8B sur un portable n'a aucune
entrée au relevé : il n'hérite pas de la note de son grand frère hébergé.

Un effet de bord corrigé au passage : le tri qui précède **chaque** demande
(« faut-il découper ce travail ? ») héritait du niveau choisi, et se serait
donc payé seize mille jetons de réflexion pour une décision de quelques mots.
Il est forcé à « Aucun », ce qui rend enfin vrai le `/no_think` qu'il envoie
déjà.

Corrigé en 0.24.0, signalé par le client capture d'écran à l'appui : **l'écran
Code ne répondait plus**, chaque prompt rendant « Provider request failed with
HTTP 401 : missing_api_key ». Trois défauts empilés, trouvés en lisant le
journal d'OpenCode puis en interrogeant son serveur :

1. la passerelle ouvrait la session **sans nommer de modèle** quand l'interface
   n'en demandait pas (elle n'en demande jamais) : OpenCode choisissait alors
   lui-même, et tombait sur son propre fournisseur hébergé, qui exige une clé ;
2. la configuration écrite par Helix dans le dossier de travail **n'était plus
   lue**. OpenCode 1.18 range les projets par dépôt : un dossier qui n'est pas
   un dépôt Git devient le projet « global » et sa configuration locale est
   ignorée. Le fournisseur « helix » n'existait donc pas pour lui ;
3. `disabled_providers` **n'est pas respecté** par OpenCode 1.18.3 : son
   fournisseur hébergé reste actif, avec trente et un modèles. Mesuré par
   `GET /api/provider`.

Corrections : la passerelle nomme **toujours** le modèle (elle décide du
moteur, ADR-001) ; la configuration vit désormais à côté des données de
l'instance et son dossier est transmis par `OPENCODE_CONFIG_DIR`, seule
variable qui fonctionne ; et `small_model` est épinglé sur le modèle de
l'instance, pour que même le titre d'une session ne parte pas chez un tiers.
Vérifié de bout en bout : session ouverte avec `helix/qwen3-8b`, `GET
/api/provider` rend « helix », consommation enregistrée par la passerelle,
zéro erreur dans le journal d'OpenCode.

**Au passage, une fuite refermée.** Ce fichier de configuration porte le jeton
d'instance en clair, et il était déposé **dans le dossier de travail de
l'utilisateur** — souvent un dépôt Git ou un partage réseau. Le commentaire
d'origine s'en remettait à un `.gitignore` posé par l'intégrateur, c'est-à-dire
à la vigilance d'un tiers. Il vit maintenant dans le dossier de données de
l'instance, en 0600, et l'ancien fichier est retiré au démarrage quand c'est
bien celui de Helix.

Corrigé en 0.24.0, signalé par le client : **Cowork semblait « restreint »**. Il
l'est, et c'est voulu — l'agent ne voit que le dossier de travail — mais le
refus arrivait en anglais, tel que le serveur de fichiers le formule, sans dire
quel est ce dossier ni comment en changer. Le message explique désormais les
deux, en français.

Fait en 0.24.0, demandé par le client : **Cowork travaille sur tout le poste**.
Il ne voyait qu'un dossier, et un assistant qui ne peut pas ouvrir le fichier
qu'on lui montre ne sert à rien. Le panneau offre maintenant « Tout mon
poste » : le dossier personnel **et** les disques montés (`/Volumes`, `/media`,
`/mnt`), sans avoir à choisir un dossier avant chaque demande. Ce qui reste
fermé, et ne s'ouvrira pas par un réglage : les organes du système. Ce qui
protège ensuite : la barrière d'approbation, qui demande avant chaque
modification. L'ouverture large **redemande le mot de passe**, même sur une
machine personnelle où changer de dossier n'en demande pas : ce n'est pas le
dossier qui change, c'est l'étendue.

Corrigé au passage : le dossier de travail choisi à l'écran n'était gardé
**qu'en mémoire**. Il revenait au dossier par défaut à chaque redémarrage, sans
que rien ne le dise. Il est désormais écrit à côté des données de l'instance.

Fait en 0.24.0 : **« Se connecter avec Google / Microsoft » pour le courrier**
(ADR-044). Une boîte Google Workspace ou Microsoft 365 se branche sans mot de
passe d'application et sans un seul champ de serveur : autorisation OAuth avec
PKCE, jetons chiffrés au repos, renouvellement automatique, et
authentification IMAP et SMTP en XOAUTH2.

Ce que l'écran dit sans le cacher : ce chemin demande **une préparation, une
fois**, par l'administrateur de l'organisation, qui déclare Helix comme
application **interne**. C'est ce qui évite la vérification de Google et son
audit annuel à plusieurs milliers d'euros. Pour un compte personnel, l'écran
renvoie au mot de passe d'application, plutôt que de proposer un bouton qui
échouerait.

**Vérifié** contre des serveurs IMAP et SMTP d'essai qui refusent tout mot de
passe et n'acceptent que XOAUTH2 : connexion réussie sans mot de passe, refus
propre d'un jeton faux, avec un message qui dit quoi faire. Plus la
construction de la demande d'autorisation : PKCE S256, portée limitée au
courrier, jeton de renouvellement demandé, locataire Microsoft respecté, `state`
inconnu refusé. **Non vérifié** : le trajet réel chez Google et Microsoft, qui
demande un compte Workspace ou M365 et une application déclarée.

Fait en 0.24.0 : **la page d'abonnement** (Paramètres → Abonnement), demandée par
le client. Quatre formules à 10, 20, 100 et 200 € par mois, avec les jetons
compris, leur équivalent en échanges et en pages, et deux modèles à poids ouverts
**hébergés en France**. Le calcul n'est pas écrit dans l'écran : il vit dans
`src/config/offre.ts`, avec le coût de revient relevé chez les éditeurs le
20/09/2026, la part du prix qui paie le calcul (45 %), et la formule qui en
déduit les jetons. Changer un chiffre suffit.

Ce que cet écran dit, et qui n'est pas confortable : **aucun paiement n'y est
branché**, les prix sont une proposition appuyée sur un devis d'hébergement encore
à faire, et le bouton propose d'écrire plutôt que d'acheter. Un bouton
« S'abonner » qui n'encaisse rien aurait été exactement la promesse que ce produit
s'interdit. Le module est **éteint par défaut** : une entreprise qui installe
HelixAI chez elle n'achète rien, et n'a pas à voir une offre commerciale dans ses
propres réglages.

Fait en 0.23.0 : **ouvrir son instance à ses collègues depuis l'écran**. Le produit
sert trois situations — un particulier seul, une entreprise dont l'intégrateur règle
tout, et quelqu'un qui a Helix sur son PC et veut inviter une personne à travailler
avec lui. Le troisième cas, le plus courant après le premier, demandait d'éditer
`helix.config.json` à la main. C'est désormais un interrupteur, sous mot de passe,
qui chiffre automatiquement et donne l'adresse à transmettre (ADR-041).

Corrigé en 0.23.0 : **le mode « poste rattaché » ne fonctionnait pas dans
l'application livrée.** C'est pourtant le cœur du modèle ERP (chacun installe
Helix, une machine tient l'instance, les autres s'y rattachent). Deux défauts
cumulés : l'application lançait sa passerelle locale même quand le poste dépend
d'une autre machine, et surtout le jeton de cette passerelle locale écrasait celui
de l'instance d'entreprise — chaque requête repartait avec un jeton inconnu, donc
401. Le mode n'avait été éprouvé que dans un navigateur, où il n'y a pas de jeton
de lanceur : le défaut n'y apparaissait pas. Corrigé et vérifié avec deux instances
réelles (ADR-040).

Corrigé en 0.23.0, trouvé en utilisant l'application : **la synchronisation pouvait
effacer les conversations**. `startSync` amorçait l'instance avec le cache local dès
qu'une lecture **échouait**, sans distinguer « l'instance n'a pas cette collection »
de « l'instance a refusé de répondre ». Un refus est pourtant le pire moment pour
écrire : on ne sait rien de ce qu'il y a en face, et le cache local peut être vide.
Une liste vide poussée par-dessus une instance pleine efface les conversations, et
`authz.ts` ne s'y oppose pas — la personne en est propriétaire, c'est une
suppression légitime à ses yeux. C'est arrivé au client : ses chats ont disparu, et
ont été restaurés depuis la sauvegarde prise avant la mise à jour. On n'amorce
désormais que sur « absente », jamais sur « échec » (mesuré : avant correction, une
lecture en 401 suivie d'une poussée vidait l'instance ; après, la poussée n'a plus
lieu).

**La leçon, qui vaut au-delà de ce bogue :** une sauvegarde avant chaque version qui
touche aux données stockées n'est pas une précaution de confort. C'est elle qui a
permis de rendre ses conversations au client. Elle est déjà dans les règles de
travail ; elle y reste, en gras.

Corrigé en 0.23.0 : un **crochet React après une sortie anticipée** dans l'écran des
projets (ajouté le jour même avec l'envoi d'invitation) faisait planter l'écran
entier, erreur React #310. Un contrôle passe désormais sur tout `src/` à la
recherche de ce motif.

Fait en 0.23.0 : **invitation d'un collègue qui fonctionne vraiment**. Le bouton
« Inviter » d'un projet n'envoyait rien : il notait l'invitation en local, et la
personne invitée butait ensuite sur deux murs (le jeton d'instance, qu'aucun écran
ne montrait, et la création de compte, réservée à qui a déjà une séance). Désormais
un **code** lui est envoyé par mail, avec l'adresse de l'instance ; il rattache son
poste, ouvre son compte et **choisit lui-même son mot de passe**. Sans boîte aux
lettres branchée, l'écran affiche le code à transmettre au lieu de prétendre l'avoir
envoyé. Nouvelle section Réglages, Profil : « Inviter un collègue », avec les
invitations en attente et leur annulation (ADR-038).

Fait en 0.23.0 : fermeture des dettes de sécurité de la veille (voir ci-dessus et
SECURITE.md § 18) : origine propre `helix://app` avec politique de contenu calculée,
billets à usage unique pour les flux d'évènements, secrets du poste dans le trousseau
du système, rôle d'administrateur pour la vue d'ensemble du journal, bot de réunion
qui ne peut plus se faire dicter son audio, adresse d'instance vérifiée côté
processus principal. Plus « Rester connecté sur ce poste » à la connexion : la séance
dure trente jours glissants au lieu de douze heures, le mot de passe n'est conservé
nulle part, et la séance longue se voit et se révoque dans la liste des postes.

Fait en 0.22.0 : branchement des services en un clic (« Se connecter », OAuth avec
enregistrement dynamique, sans tiers), catalogue de connecteurs passé de 2 à 33
entrées rangées par rubrique et cherchables ; archivage des chats à côté de la
suppression ; cloche de notifications réelle (mise à jour de l'application et du
moteur des agents, accord attendu, tâche terminée ou en échec, chat partagé) ; aide
et support intégrés, hors ligne ; indicateur « le modèle juge s'il faut découper »
retiré du Chat ; passe de sécurité complète (voir SECURITE.md § 17) : demandes
d'approbation cloisonnées par personne, journal d'audit cloisonné, HTTPS imposé pour
une instance distante, politique de sécurité du contenu réellement appliquée, agent
autonome bridé sur un mail reçu, limitation de débit, et douze autres corrections.

Fait en 0.21.0 : revue finale de la demande entière après les étapes, avec étapes de
complément ; contrôle automatique du code web (liens, fonctions, éléments, syntaxe)
lancé par la revue et disponible comme outil ; plans regroupés « un fichier = une
étape écrite en entier » et exemple de plan donné au planificateur. Éprouvé sur un
site de trois pages et une application de liste de tâches écrits par qwen3-8b.

Fait en 0.20.0 : le découpage des tâches est jugé par le modèle lui-même, redécoupe
une étape trop grosse (trois niveaux), écrit les textes longs partie par partie ;
les étapes reçoivent les données réellement lues par les outils ; une étape se juge
aux retours des outils (un compte rendu « fait » sur des actions refusées ne passe
plus) et une étape qui modifie est contrôlée sur l'état réel, le modèle finissant ce
qui manque ; un appel d'outil au JSON mal refermé est réparé sur la forme (jamais une valeur
coupée) ; déplacer un fichier vers un dossier le range dedans ; plus de tiret long dans
le plan affiché. OpenClaw reste sur la machine (décision du 15/09/2026).

Fait en 0.19.0 : enchaînement des cartes de tâches (prérequis, lancement
automatique, comptes rendus transmis, boucles refusées, étape annulée qui bloque la
suite), exécutions qui survivent au changement d'écran ; Échap dans un menu ne ferme
plus la fenêtre qui le contient.

Fait en 0.18.0 : option « Envoyer sans me demander » pour le Chat au niveau « Tout
approuver » et les agents autonomes, sauf quand un agent traite un mail reçu ;
pièces jointes sans limite de poids pour le texte, photos réduites plutôt que
refusées, mention « (début) » quand un fichier n'est pas lu en entier ; lecture par
passages des longs documents de la bibliothèque et des longues transcriptions ;
recherche dans la bibliothèque dont l'extrait tombait à côté après des accents ;
résultat d'outil coupé à 20 000 caractères qui ne le disait pas au modèle.

Fait en 0.17.0 : envoi réel des mails demandés, dans le Chat, Cowork ou par un agent
OpenClaw, chaque mail montré en entier et accepté un par un (§ 3.5) ; documents
jusqu'à 1 Go (bibliothèque, documents d'agent, dossier de l'équipe) et son de réunion
jusqu'à 2 Go, envoyés et relus en flux sans passer par la mémoire ; outils du Chat
retenus d'un Chat à l'autre ; traces d'outils en français.

Fait en 0.16.0 : Groupes, Bibliothèque, Réunions et Bot Recorder réels (ci-dessus) ;
missions déclenchées par un mail reçu ; brouillons dans la boîte ; mise à jour
d'OpenClaw réversible ; archives de conversations effacées pour de bon ; « Optimiser
les instructions » et « Depuis Helix » ; photo de profil ; durée de conservation du
journal d'audit et purge ; paramètres qui s'adaptent à la place disponible.

Fait en 0.15.0 : la description et les fichiers de l'agent lui parviennent (documents
de référence consultés et cités).

Fait en 0.14.0 : créer un agent suffit, il est mis en service tout seul (OpenClaw
installé au passage) ; plus de parcours « employé » séparé.

Fait en 0.13.0 : OpenClaw s'installe depuis le panneau Agents, au premier déploiement
ou par un bouton, sans terminal ni droits d'administrateur.

Fait en 0.12.0 : modèles cloud par clé (pour soi ou l'équipe) et de l'agence, dans le
Chat et pour les employés ; paliers de liberté des employés (jusqu'aux commandes sur
la machine, sous mot de passe) ; canaux Telegram, WhatsApp, Discord, Slack,
Mattermost ; outils d'OpenClaw recopiés au journal d'Helix.

Fait en 0.11.0 : les employés OpenClaw (§ 3.4), pièces jointes PDF et Office,
glisser-déposer, mise en forme des réponses, fenêtres modales qui défilent, fermer la
fenêtre sur macOS ne coupe plus la passerelle (les employés continuent).

### Fait en 0.27.0 : le tour complet (23/09/2026)

**Retouches du 23/09/2026, après essai par le client.**
- *Fenêtre impossible à déplacer* : seule la tête de la barre latérale servait
  de poignée, et le logo et le bouton de repli l'occupaient presque entière.
  Une bande de 28 px en haut de la zone principale (`.fenetre-poignee`,
  application de bureau seulement) déplace désormais la fenêtre ; boutons,
  liens et champs restent cliquables partout.
- *Liste des modèles coupée en bas de l'écran* : `Popover` n'avait aucune
  hauteur maximale. Il mesure la place de chaque côté, s'ouvre du côté le plus
  libre, ne dépasse jamais la fenêtre et défile lui-même (recherche fixée en haut).
- *Mac figé au lancement d'un modèle* : `loadModel` chargeait le nouveau modèle
  à côté de celui en mémoire. Il libère maintenant la place d'abord si
  l'ensemble (poids + 30 %) dépasse 45 % de la RAM.
- *Renommer un Chat* : crayon au survol ou double-clic, Entrée valide, Échap
  annule ; l'ordre de la liste ne change pas.
- *Cadre vert pendant la saisie* : retiré, le cadre reste gris.
- *Réplique prise pour un travail* : « non mais si je te connecte » recevait un
  plan de trois étapes et une revue finale. `estReplique` (plan.ts) tranche
  avant le tri par le modèle : question courte, ou phrase courte qui commence
  comme une réplique, jamais découpée. Les marqueurs de contrôle (« VERIFIE : … »,
  « RIEN A FAIRE ») sont retirés à l'affichage s'ils fuient dans la réponse.
- *Graphique « Comparer »* : les modèles locaux sans note Artificial Analysis
  étaient empilés le long de l'axe gradué, ce qui leur prêtait une note
  (« qwen3-8b-dwq vaut 27 ? »). Ils sont désormais listés sous le graphique,
  sans position ; la bande de gauche n'existe que si l'un d'eux est noté.
- *Ce que l'installation pose* : un modèle de conversation adapté à la machine
  (Qwen3, qui raisonne lui-même : pas de second modèle « de raisonnement »), puis
  la dictée Whisper, en arrière-plan (`dicteeEnFond`). Rien d'autre. Le choix du
  modèle propose ensuite « À installer, adaptés à votre machine » : seulement
  les entrées du catalogue que la mémoire permet (`adaptesALaMachine`).
  L'installation fait elle aussi la place en mémoire avant de charger
  (`faireLaPlace`, partagé avec le chargement à la demande).
- *Choix du modèle selon la machine* (`provision.ts`) : catalogue multi-éditeurs
  relevé le 23/09/2026 sur le catalogue LM Studio (capacités, mémoire), sur
  Artificial Analysis (indice d'intelligence) et sur les licences (Apache 2.0 /
  MIT seulement : Gemma, Llama, NVIDIA écartés). `tientSur` : poids × 1,3 plus
  une réserve de 30 % de la RAM (3 à 8 Go) ; sur PC, un modèle dense doit tenir
  dans la carte NVIDIA (`nvidia-smi`), un modèle à experts peut déborder en RAM ;
  sans carte, seulement petits modèles ou à experts. À chaque machine, le mieux
  noté qui tient est installé, **essayé avec Helix ou non** (décidé par Medhi le
  26/09/2026 : « installer en fonction du PC le meilleur modèle ») ; s'il ne se
  charge pas, les suivants du classement, puis le plus léger vérifié. Pour piloter
  l'écran, seuls les modèles essayés à ce geste (Qwen3-VL) sont installés : un
  modèle qui ne sait pas désigner un point clique à côté. Mesuré par `recommend` le
  26/09/2026 sur Mac à puce Apple : 8 Go Qwen3.5 4B, 16 et 24 Go Qwen3.5 9B, 32 à
  128 Go Qwen3.8 27B, 256 Go DeepSeek V4 Flash ; PC NVIDIA 8 ou 12 Go avec 32 Go de
  RAM Qwen3.5 35B A3B. Les autres sont proposés dans « À installer » (6 au plus),
  marqués « pas encore vérifié avec Helix ». Aujourd'hui seuls Qwen3, Qwen3.5 9B et
  Qwen3-VL sont vérifiés.
  Kimi K3 (43,6), GLM-5.3 (44,8), MiniMax : plusieurs centaines de Go, serveur
  seulement, donc par prestataire ou clé. En local : GLM-4.7 Flash (MIT, 16 Go,
  14,9) et DeepSeek V4 Flash (MIT, 150 Go, 34,3, machines de 256 Go) ajoutés.
- *Qwen3.5 9B vérifié* (24/09/2026, LM Studio, Mac 16 Go) : devient le choix
  d'office dès qu'il tient (note 13,7 contre 7,3 pour Qwen3 8B). Mesures sur
  une même question : « Aucun » 1 s, 0 réflexion ; « Faible » 26 s, 1 258
  caractères de réflexion ; « Moyen » 59 s, 3 003 ; « Élevé » 158 s, 6 341 ;
  « Max » 112 s, 6 170 : les niveaux changent vraiment la profondeur, mais
  Qwen3.5 réfléchit environ quatre fois plus que Qwen3 8B, donc répond plus
  lentement en « Moyen ». Outils : appel juste. Images : couleurs lues.
  `/no_think` n'existe plus pour lui (31 s de réflexion malgré lui) :
  « Aucun » envoie désormais `reasoning_effort: "none"`, que LM Studio suit
  pour Qwen3.5 et pour Qwen3 8B (mesuré), `/no_think` restant pour Qwen3.
  LM Studio charge la version MLX avec 32 768 jetons de contexte quoi qu'on
  demande (5,98 Go résidents). Au pointage d'écran, Qwen3-VL 4B reste
  meilleur (clics justes aux deux tailles d'image, contre un sur deux pour
  Qwen3.5) : il reste le modèle de l'écran.
- *Coordonnées d'écran sur une grille 0-1000* (24/09/2026) : Qwen3-VL et
  Qwen3.5 ne répondent pas en pixels mais sur une grille de 0 à 1000, quelle
  que soit l'image (bouton en 637, 402 : Qwen3-VL répond 616, 517 sur une
  capture 1024x768, 407, 443 sur 1600x900). Helix les prenait pour des
  pixels : dans la machine, les clics tombaient environ 115 px trop bas, ce
  qui explique les cellules de Calc mal visées. Désormais `grilleMille`
  (computer.ts) : on leur demande la grille explicitement et on convertit ;
  vérifié, les deux clics tombent dans le bouton.
  gpt-oss 20B, Magistral Small, Granite, Ministral : idem, au besoin.
- *Diversité des propositions* : classés à la note seule, les six proposés
  étaient presque tous des Qwen. Désormais : les trois mieux notés, puis le
  meilleur de chaque autre éditeur que la machine fait tourner (Mistral, IBM,
  Ai2, OpenAI, Zhipu, Meta selon la mémoire). Ajoutés : Ministral 3 8B, OLMo 3
  7B Think. Toujours écartés : Gemma, Llama, Phi-4 (licences à conditions).
- *Essai Code du 23/09/2026* (qwen3-8b, OpenCode 1.18.32, dossier jetable) :
  « petit site horloge en trois fichiers reliés » → 3 fichiers écrits en un
  tour, compte rendu clair, 224 s, site vérifié dans le navigateur (le bouton
  affiche l'heure). Écarts de qualité du modèle, pas du logiciel : le titre
  n'est que dans l'onglet, et l'heure se met à jour sans attendre le clic.
- *Code arrêté après la première action* (vu par le client) : `step.ended`
  avec `finish: "tool-calls"` était pris pour une interruption. C'est une étape
  intermédiaire (l'outil travaille, l'étape suivante reprend) : ignorée
  désormais (`code.ts`). Le motif d'une vraie interruption ne s'affiche plus
  qu'une fois, dans la réponse. Leçon : mon essai de la veille lisait le flux
  d'événements, pas l'écran ; refait dans l'écran Code avec la phrase exacte du
  client (« page web avec écrit Chien ») : fichier écrit, réponse complète.
- *Tournée de quatre agents de test (23/09/2026)* : Chat (13 bugs), Code (11),
  Cowork (11), Agents (7), chacun prouvé en faisant passer les événements réels
  par le vrai code de l'écran. Les plus graves : LM Studio redémarré en pleine
  génération par la passerelle (`backends.ts`), « Arrêter » qui n'arrêtait rien
  côté passerelle, demande arrêtée exécutée au tour suivant (Chat et Code),
  texte tapé par l'agent d'écran diffusé à tous les collègues (`computer.ts`),
  carte d'accord encore valable après « Arrêter », modèle/niveau jamais transmis
  à OpenCode, flux Code coupé à 301 s, autorisations OpenCode bloquantes, port
  OpenCode pouvant tomber sur celui d'un OpenCode personnel, tâche « Terminée »
  alors qu'elle avait échoué, instance d'agents injoignable affichée « En service ».
- *Reprises après la tournée* (par moi, défauts signalés par l'agent Cowork dans
  `chat.ts`) : outil non proposé au modèle refusé avant l'aiguillage ; étape sans
  action où le modèle dit « impossible » comptée en échec (cause `impossible`) ;
  action refusée par la personne jamais retentée (`parLaPersonne` dans
  `approbation.ts`, cause `refus`) ; note des services non connectés ramenée à
  ce que font les connecteurs (agenda et Slack en lecture seule). Et, vu en
  essai dans l'écran : Chat SANS outils qui affichait « 3 étapes faites sur 3 »
  pour un fichier jamais créé (plan de rédaction fait d'actions racontées) ;
  désormais réponse directe et honnête, et consigne « tu n'as aucun outil ».
  Titre de la carte d'accord neutre (elle est montée partout, pas seulement
  dans Cowork).
- *Décisions du client (23/09/2026)* : recherche web d'OpenCode gardée.
  Agent mémorisé avec le Chat (`Session.agentId`/`agentNom`, `memoriserAgent`,
  repris à la réouverture ; agent supprimé depuis : bandeau qui le dit, l'agent
  par défaut répond). Poste d'un employé : `POSTE_MAX` = 50 000 caractères,
  comme la fenêtre de création (coupait à 4 000 sans rien dire). Essayés dans
  l'écran : Chat avec l'agent « Pirate », autre Chat → agent par défaut,
  retour → « Pirate », agent supprimé → bandeau.
- *Dernière capture d'écran par demande* (24/09/2026) : `lastImage`, commun à
  toute l'instance, remplacé par `dernieresImages`, rangé par demande (50 au plus).
- *Importer ChatGPT ou Claude* (Paramètres) : l'archive d'export est lue sur
  le poste (`src/lib/importChats.ts`, lecteur ZIP par tranches, ZIP64 compris,
  jamais l'archive entière en mémoire). ChatGPT : branche affichée de l'arbre
  (réponses régénérées écartées), messages cachés écartés, images en
  « [image] », projets « g-p-… » numérotés (l'export ne donne pas leur nom).
  Claude : textes, pièces jointes lues, projets avec instructions et documents.
  On choisit ce qu'on importe ; la place du poste est montrée (les Chats vivent
  dans le stockage local, et une écriture qui dépasse était ignorée sans
  erreur : `ajouterSessionsImportees` relit ce qui a été gardé et le bilan le
  dit). Projets Claude : projet Helix, documents dans Fichiers, et un agent
  portant les instructions pour continuer les Chats comme avant. Essayé dans
  l'écran le 24/09/2026 : 2 Chats sur 2, projet, agent, document ; Chat
  importé rouvert avec ses messages. Formats reconstitués d'après les exports
  connus : à refaire avec une vraie archive du client.
- *Machine macOS de l'agent* (24/09/2026, `gateway/src/machineMacos.ts`) :
  Lume 0.5.3 installé par Helix dans `~/.helix/lume` (archive vérifiée par
  empreinte, puis signature de Cua AI, rien d'autre installé sur le Mac) ;
  image `trycua/macos-tahoe-cua:26.5.2` (ou 26.2, ou `macos-sequoia-cua:15.3`
  selon le macOS du poste, la virtualisation d'Apple refusant un invité plus
  récent), environ 23 Go, cache effacé après téléchargement ; démarrée par
  `lume run --detach --display none --shared-dir ~/Helix/Machine:rw`, vue
  dans la machine sous `/Volumes/My Shared Files` ; serveur cua sur le port
  8000 de l'adresse que donne `lume get -f json`, réseau que seul ce Mac voit.
  Au premier démarrage, LibreOffice 25.8.6.2 (empreintes vérifiées) installé
  dans la machine avec les préréglages du bureau Linux, plus les boîtes
  d'enregistrement de LibreOffice (celles de macOS n'acceptent pas un chemin
  tapé). Raccourcis en Commande, applications en liste fermée (Safari, Writer,
  Calc, Impress, Finder, Terminal, `open -a` filtré sinon), relecture des
  documents faite sur le poste (`relecture.ts`, Python n'étant pas garanti
  dans la machine). « Effacer la machine » (Linux et macOS) rend la place.
  **Jamais démarrée de bout en bout** : le Mac de développement a 16 Go.
  Vérifié : installation de Lume (dans un dossier d'essai), diagnostic sur ce
  Mac (refus justifié), refus côté serveur, écran de choix et de
  confirmation, relecture sur des fichiers d'essai.
- *Chats sans la limite du navigateur* (24/09/2026) : dans l'application de
  bureau, la collection `sessions` quitte `localStorage` (environ 5 Mo) pour un
  fichier chiffré par `safeStorage`, `~/.helix/poste/sessions.enc`, 0600,
  écrit par renommage (`electron/grandStockage.cjs`, `src/lib/store/grandStockage.ts`,
  lu d'un coup au démarrage comme le coffre). Repris de `localStorage` au
  premier passage, puis libéré là-bas. Place d'import : 25 Mo (l'instance
  accepte 32 Mo par envoi) au lieu de 3,5 ; navigateur : inchangé.
  **Incident le jour même** : l'application a été reconstruite pendant
  qu'elle tournait ; au redémarrage, la liste des Chats du client a été
  remplacée par « [] » sur le poste puis sur l'instance (1 Chat, « ça va ? »).
  Non reproduit sur une copie exacte de ses données (la migration seule ne
  perd rien) ; cause la plus probable : processus mêlant deux versions.
  Rattrapé depuis le journal LevelDB du navigateur, avec « test » (11
  messages), perdu dès 10 h 30 par l'ancienne synchronisation (l'instance
  vide avait écrasé le poste). Correctifs : la copie du navigateur n'est
  effacée qu'après écriture confirmée du fichier ; écriture refusée → retour
  au stockage du navigateur pour la séance ; préchargement tolérant un
  processus principal sans ce canal ; une liste qui fond de plus de moitié
  laisse une copie chiffrée à côté (`sessions.<date>.copie.enc`, trois au
  plus). Règle : ne jamais reconstruire l'application pendant qu'elle tourne.
- *Mémoire de Qwen3 8B* (24/09/2026) : une requête à la fois sur un poste de
  16 Go ou moins, deux jusqu'à 36 Go, et **32 768 jetons de contexte au moins**
  (`optionsDeChargement`, backends.ts). Le matin, 16 384 avait été choisi pour
  gagner de la mémoire : Code en est mort l'après-midi, les consignes
  d'OpenCode faisant à elles seules environ 18 000 jetons.
- *Créer des images* (24/09/2026, `gateway/src/images.ts`, puce « Image » du
  Chat, `ImageChip.tsx`) : comme ChatGPT ou Gemini, sur la machine. Moteur
  stable-diffusion.cpp (MIT, sans Python ; Mac Metal, Windows CUDA ou Vulkan,
  Linux Vulkan ; version pour macOS 15 à part, l'actuelle exige macOS 26),
  modèle Z-Image Turbo (Apache 2.0) avec Qwen3 4B pour lire la description
  (Apache 2.0) ; trois tailles selon la mémoire (léger 5,6 Go dès 8 Go,
  standard 6,7 Go dès 16 Go, fin 10,2 Go dès 32 Go ou carte de 12 Go), chaque
  fichier pris à une révision et vérifié par empreinte, téléchargement repris
  après coupure. La description est réécrite en anglais par le modèle local
  (Z-Image rend mieux ainsi) ; avant le calcul, les modèles de conversation au
  repos sont déchargés si la mémoire manque (`libererPourImage`). Image rangée
  dans les données de l'instance, servie à son auteur seul (un Chat partagé ne
  la montre pas aux collègues), référencée dans le Chat. Mesuré sur un Mac M4
  de 16 Go : 1024 px en 6 min 15, 768 px en 2 min 27 (15 s par étape) ; le
  niveau standard crée donc en 768, le fin en 1024. Essayé de bout en bout
  dans l'écran (installation, image paysage, réouverture du Chat) ; Windows et
  Linux pas essayés.
- *Images, plusieurs modèles* (24/09/2026, suite) : le « + » de la zone de
  saisie ouvre un menu comme ChatGPT (« Ajouter des photos et fichiers »,
  « Créer une image ») ; « Créer une image » pose une pastille « Image × »
  dont le menu règle le format et le modèle. Catalogue (tous Apache 2.0) :
  Z-Image Turbo (conseillé dès 16 Go, trois tailles), FLUX.2 klein 4B (le plus
  rapide, conseillé sous 16 Go ; vérifié : 1 min 42 sur le Mac M4, image nette,
  texte dans l'image illisible), Qwen-Image 20B (texte lisible dans l'image,
  dès 48 Go ou carte de 24 Go ; pas vérifié, faute de machine). Chaque modèle
  s'installe au clic, on choisit l'actif (`/helix/images/choisir`).
- *Import depuis les logiciels du poste* (24/09/2026, `gateway/src/importLocal.ts`,
  carte « Depuis les logiciels de cet ordinateur » de Paramètres > Importer
  depuis d'autres IA) : Helix trouve Claude Code (conversations
  ~/.claude/projects, dossier de travail, titre, CLAUDE.md) et Codex
  (~/.codex/sessions, AGENTS.md) et les reprend sans export, par le même
  chemin que l'import d'une archive (choix des Chats, projets par dossier de
  travail, instructions en agent « Comme dans … »). Dit franchement ce qui ne
  se lit pas : ChatGPT (conversations chiffrées sur le disque), Claude
  (conversations sur les serveurs d'Anthropic), Cursor (sa base). Seulement
  depuis le poste lui-même (adresse de boucle locale). Essayé : 20 Chats
  Claude Code et 6 Codex détectés sur le Mac du client, liste Codex affichée.
- *Extension VS Code* (24/09/2026, `extensions/vscode/`, `helix-ai-0.1.0.vsix`,
  21 Ko, sans dépendance) : Chat de l'instance dans la barre latérale (joindre
  le fichier ouvert, insérer un bloc de code), « Expliquer » et « Améliorer la
  sélection » au clic droit. Parle à l'instance depuis le processus de
  l'extension (le jeton ne va jamais dans la page), jeton lu dans
  ~/.helix/data/instance-token ou réglé (instance d'entreprise). Essayé avec
  un faux module vscode contre une vraie instance : « Améliorer » a trouvé et
  corrigé un bug, 57 s avec Qwen3 8B. **0.2.0** : onglet « Code » (Helix Code
  sur le dossier ouvert : session, flux d'évènements, actions affichées « ✓
  Écriture bonjour.txt »), connexion « Helix : se connecter » (compte, mot de
  passe, second facteur ; séance dans le coffre de VS Code). Essayé : Helix
  Code a créé le fichier demandé via l'extension ; installée dans le VS Code du
  client (1.111), vue affichée et activée sans erreur. Pas de question tapée
  dans VS Code par moi (saisie interdite dans un éditeur) : à faire par le client.
- *Import Cursor* : base `state.vscdb` lue par `sqlite3` (formats ancien
  « conversation » et récent « bubbleId: », texte enrichi compris), vérifié sur
  une base fabriquée ; le poste du client n'a que des brouillons vides.
- *Dépôt GitHub* : https://github.com/medhiclb/HelixAI, privé, vide (24/09/2026).
- *Design des sites de Code* (24/09/2026, `gateway/src/design.ts`,
  `gateway/design/`) : une demande de site fait poser par Helix
  `design/helix.css` et `design/DESIGN.md` dans le projet, choisis dans les
  tables du skill UI/UX Pro Max (nextlevelbuilder, MIT, licence gardée à côté) :
  type d'activité reconnu (lexique français, mots-clés du modèle local, mots
  génériques d'un site écartés), palette complète, polices, plan de page, cinq
  familles de style (sobre, vif, doux, verre, sombre). La consigne jointe à la
  demande donne les lignes du <head> et la structure. Mesuré avec Qwen3 8B : il
  n'a pas ouvert le guide et a écrit ses propres classes. D'où deux filets :
  la feuille habille aussi le HTML sans classes (en-tête, sections, cartes,
  formulaire, pied) et les noms courants (hero, card, btn, container) ; et,
  à la fin de chaque tour de Code (« step.ended / stop » dans le flux), Helix
  remet dans chaque page le lien relatif vers la feuille et les polices, la
  feuille en dernier pour qu'elle l'emporte sur un <style> du modèle
  (`corrigerPages`). La même page, avant et après : texte brut sur fond bleu,
  puis une vraie page de boulangerie.
- *Eden et Helix sur le même Qwen3 8B* : le garde d'Eden (script du client,
  hors Helix) recharge Qwen3 8B à ses propres réglages quand il le trouve
  autrement ; s'il le fait pendant une réponse d'Helix, la réponse est coupée
  (vu le 24/09 : « Invalid helix/openai-compatible-chat stream event » dans
  Code). Helix ne touche pas au garde d'Eden.
- *LM Studio partagé* : une instance qui s'arrêtait coupait le serveur LM
  Studio sous les autres (autre instance, Eden) : à la fermeture, Helix ne
  décharge plus que ses propres modèles, au repos, et laisse le serveur. Et
  faire de la place ne décharge plus un modèle en train de répondre (attente
  45 s au plus).
- *Sous-menu « Installer un modèle sur cette machine »* : la liste principale
  ne montre que les modèles présents ; les modèles à ajouter sont un cran plus
  loin (retour par la flèche), pour ne pas encombrer.
- *Graphique et modèles cloud* : un modèle branché plus tard (prestataire ou
  clé) se place tout seul s'il figure au relevé. Rapprochement durci : versions
  à tirets reconnues (« claude-fable-5-1 »), mais un nom qui continue par un
  chiffre ou une déclinaison (« claude-opus-5-5 », « …-flash-lite », « -mini »)
  n'emprunte plus la note d'un autre modèle.
- Trois modèles d'essai retirés du Mac du client (mis à la corbeille le
  23/09/2026, 13 Go) : gemma-3-4b, qwen3-8b-dwq, qwen3-vl-8b.
- *Saisie* : au focus, bord gris un peu plus foncé et ombre un peu plus large.
- *Services connectables* : le modèle reçoit la liste des services non encore
  connectés (messagerie, agenda, Drive, Slack) et sait dire « oui, connectez-la
  dans Paramètres, Connecteurs » sans prétendre y avoir accès. Vérifié sur
  qwen3-8b avec la phrase exacte du client.
- Les six modèles de la liste n'ont pas été installés par cette version : ils
  sont sur le disque depuis juin et juillet 2026 (essais du contrôle de
  l'écran). La liste les montre depuis 0.27.0 parce qu'ils sont réellement
  utilisables.

Demandé par le client : « un tour complet, que tout fonctionne, aucun bug, la
sécurité, le design, tout ». Ce qui a été trouvé, et comment.

**Le Chat qui ne répondait pas, ou répondait « je n'ai pas l'information ».**
Trois causes, toutes reproduites avant d'être corrigées.

1. *Le niveau de raisonnement plafonnait la réponse.* Censé relever un
   plancher de jetons, il posait `max_tokens` même quand l'écran ne demandait
   rien : 768 en « Faible », 2 048 en « Moyen ». Qwen3 dépense ce budget à
   réfléchir, et la réponse sortait coupée ou vide. Reproduit contre LM Studio
   (`finish_reason: length`). Le plancher ne s'applique plus qu'à une demande
   explicite.
2. *Les images partaient vers un modèle qui ne voit pas.* LM Studio ne liste par
   son API que les modèles chargés ; trois modèles de vision dormaient sur le
   disque, invisibles. Une capture d'écran en mode Auto allait donc à
   `qwen3-8b`. La passerelle voit maintenant tous les modèles téléchargés (avec
   leurs capacités telles que LM Studio les déclare), envoie les images à un
   modèle de vision, le charge à la volée en le disant, et prévient si aucun
   n'existe au lieu de faire semblant. Essai réel : la capture « Santé de la
   batterie » est lue (83 %, 612 cycles).
3. *Le modèle fouillait les Fichiers au lieu de répondre.* Quatre recherches
   pour une question générale sur un iPhone, relevées au journal d'audit. Les
   consignes disent maintenant de répondre directement aux questions
   générales, et une recherche vide dit au modèle quoi faire ensuite. Essai
   réel : aucune recherche, une vraie réponse.

Et, garantie de dernier recours : une réponse vide s'affiche désormais comme
telle, avec quoi faire, au lieu d'une bulle blanche.

**Les niveaux de raisonnement n'agissaient pas sur le modèle local.** Mesuré :
`reasoning_effort` « low » et « high » donnaient la même réflexion (232 et 263
jetons), et `enable_thinking` n'était pas transmis par LM Studio. Les leviers
qui marchent sont maintenant employés : `/no_think` pour « Aucun » (0 jeton,
2 s), une consigne de profondeur pour les autres. Mesuré sur une même
question : Aucun 2 s, Faible 11 s, Moyen 28 s. « Élevé » et « Max » ne vont pas
plus loin que « Moyen » sur ce modèle, qui réfléchit déjà beaucoup par
défaut : on le dit plutôt que de le promettre.

**L'écran Code, état final (23/09/2026, après vérification complète).** Ce qui
suit corrige les deux paragraphes plus bas, écrits trop tôt.

- *Le défaut d'OpenCode* : il rate au hasard la **première** session qu'il
  exécute après son démarrage (« Model unavailable »), en 1.18.3 comme en
  1.18.32 : 2 à 3 démarrages sur 10, jamais les sessions suivantes (21 sur 21).
- *La chauffe* (`chauffer`, opencode.ts) : à chaque démarrage d'OpenCode, une
  session jetable sur un modèle inexistant absorbe ce premier passage, sans
  appeler aucun modèle, puis est supprimée. Mesuré : 30 démarrages sur 30,
  contre un raté sur dix pour le témoin au même moment.
- *La détection* (`handleCodePrompt`, index.ts) : une demande saine atteint le
  modèle en 0,1 à 0,2 s — la passerelle le voit, puisqu'elle relaie l'appel.
  Sans cet appel au bout de 8 s, la session est perdue : une neuve est ouverte,
  la demande y est renvoyée, et l'écran suit la nouvelle (`helixRelance`).
  Seul compte l'appel qui porte les outils de l'agent : OpenCode envoie aussi,
  pour la même demande, un appel sans outils qui génère le titre, et le
  compter faisait passer pour vivante une session morte (vu au banc).
- *Ce qui avait été posé à tort* : un guet côté écran, qui tenait une session
  pour morte sans « première étape » en 12 s. Cette étape n'arrive qu'après la
  lecture des longues instructions d'OpenCode par le modèle — mesuré : 16 s. Il
  aurait relancé, en double, des demandes simplement lentes. Retiré.
- *Preuves* : 8 démarrages à froid sur 8 suivis jusqu'à la réponse (9 à 17 s) ;
  une session rendue morte à coup sûr est relancée en 8 s et répond ; une
  demande qui écrit un fichier aboutit, l'interruption fonctionne.
- *OpenCode mis à jour en 1.18.32* (22/09/2026), après avoir vérifié par la
  passerelle un parcours identique à la 1.18.3 (mêmes événements, outils,
  interruption). L'ancienne version reste à côté :
  `~/.opencode/bin/opencode-1.18.3`. `HELIX_OPENCODE_BIN` permet de fixer une
  version pour Helix indépendamment de celle de la personne.
- *Un défaut que ces essais ont révélé, et corrigé* : la passerelle lisait
  l'état « chargé » des modèles par `lms ps`, qui dépasse son délai quand LM
  Studio est occupé. Tout passait alors pour non chargé, et un modèle déjà en
  mémoire était rechargé en **seconde copie** (« qwen3-8b:2 », 5 Go de plus) :
  la machine saturait. Ce que l'API de LM Studio liste est désormais tenu pour
  chargé, et aucun chargement n'a lieu sans avoir vérifié que le modèle n'y
  est pas déjà — ni quand on ne peut pas le vérifier.

**L'écran Code où « rien ne se passait » — la vraie cause, trouvée ensuite.**
Le client a revu le silence après la première correction ; l'explication
ci-dessous était donc incomplète. Mesures faites ensuite, chacune contre un
OpenCode isolé : **OpenCode 1.18.3 rate au hasard la toute première demande
qui suit son démarrage** (« Model unavailable », environ une fois sur trois,
jamais à la demande), et la session meurt sans rien émettre après l'accusé de
réception. Écartés un à un par l'essai : la configuration, la clé, la liste des
modèles, le dossier `~/Helix`, l'environnement Electron, le téléchargement de
models.dev, la course au démarrage de la passerelle. Ce n'est pas corrigeable
chez nous ; l'écran ne le subit plus : sans première étape au bout de 12
secondes (une demande saine l'annonce en une seconde, avant même d'appeler le
modèle), il ouvre une session neuve et renvoie la même demande, une fois, et
le dit. Prouvé en provoquant la panne dans le navigateur (demande avalée) :
relance à 12 s, réponse obtenue. Au passage, OpenCode ne contacte plus
models.dev à chaque démarrage, ne se met plus à jour seul, ne publie plus de
liens, et ne lit plus la configuration Claude Code du poste
(`OPENCODE_DISABLE_*` dans `opencode.ts`), vérifié sans effet sur ses réponses.

Ce qui avait été corrigé avant, et reste vrai : OpenCode ne lit sa
configuration qu'à son démarrage : si un modèle manquait à ce moment-là, toute
session sur ce modèle était acceptée puis restait muette pour toujours — son
flux annonce « admis » et se tait, l'erreur ne part que dans son journal
(reproduit sur un OpenCode isolé). La passerelle vérifie maintenant le modèle
auprès d'OpenCode avant d'ouvrir la session, le redémarre si sa configuration
est périmée, et refuse avec une raison sinon. L'écran signale en plus tout
silence de plus de 90 secondes. Seconde cause : le découpage des tâches de
Helix s'appliquait aussi aux requêtes d'OpenCode et glissait ses événements
maison dans le flux, que le SDK d'OpenCode rejetait
(`AI_TypeValidationError`). Un client ordinaire de l'API reçoit désormais un
relais propre. Enfin, un garde-fou contre les boucles : à trois actions
identiques de suite, une note au modèle ; à cinq, les outils lui sont retirés
pour la réponse suivante.

**Le téléchargement direct**, marqué « bientôt », fonctionne : l'instance sert
une archive de l'application qu'elle fait tourner (`telechargement.ts`), dans
sa version exacte, sans passer par Internet ; le lien porte un billet d'une
minute et d'un seul usage. Windows et Linux sont dits « pas encore
construits ». L'écran explique le clic droit → Ouvrir, tant que l'application
n'est pas signée.

**La sécurité, attaquée plutôt que relue** : `npm run securite` lance une
instance jetable et frappe à chaque porte (66 vérifications en 0.27.0, 125 le
25/09/2026, toutes réussies : routes sans
jeton ou sans séance, énumération de comptes, force brute, billets réutilisés,
CORS, en-têtes, chemins détournés, fin de séance, secrets au journal, écoute
réseau). Elle a trouvé un vrai défaut : une variable `HELIX_GATEWAY_HOST` vide
faisait écouter la passerelle **sur toutes les interfaces**, sans chiffrement,
alors qu'elle se croyait locale — prouvé, puis fermé. Et `npm audit` : cinq
vulnérabilités connues dans des dépendances (SDK MCP, module de mise à jour),
corrigées sans saut de version majeure ; zéro restante.

**Les traductions**, reprises : le catalogue des connecteurs et la liste des
outils venaient de la passerelle sous forme de données et restaient en
français dans l'interface anglaise, alors que le relevé annonçait 100 %. Le
relevé lit maintenant ces données. Deux phrases étaient figées en français
parce que calculées au chargement du module ; un outil les détecte. Et le nom
de marque, lu trop tôt, faisait écrire « Livré avec l'application ».

**Le tour de l'interface** : 23 écrans parcourus, relevé automatique des
débordements, textes coupés, images cassées et erreurs, en français, anglais
et chinois. Aucun défaut d'affichage. Corrigé au passage : l'accueil saluait
par l'identifiant (« Bonjour, medhi.clabaut ») au lieu du prénom.

### Fait le 25/09/2026 : bases de connaissances, ligne de commande, entraînement, corrections

Quatre branches fusionnées dans main le même jour. Les décisions sont aux § 3.10,
3.11 et 3.12, la sécurité au § 4 et dans SECURITE.md § 22.

**Bases de connaissances (RAG).** Onglet « Bases de connaissances » dans Fichiers,
pastille « Connaissances » de la zone de saisie (Chat et Cowork), bases d'un agent et
d'un projet, sources citées sous la réponse. Mesuré par la branche le 25/09/2026 (Apple
M4, passerelle d'essai, quatre documents fictifs, `text-embedding-nomic-embed-text-v1.5`
et `qwen3-8b` déjà chargés) : 309 morceaux indexés en 16,1 s, environ 24 par seconde ;
sur 10 questions dont la réponse n'est que dans les documents, le bon passage au rang 1
dix fois sur dix en hybride (neuf par le sens seul) ; 12 à 20 ms par question à chaud,
361 ms à froid ; au Chat, 9 réponses justes sur 9, chacune citant [1], et à la question
sans réponse, « les passages n'en parlent pas » sans citation ; question de suite « Et
pour un employé ? » juste. Second compte : base privée ni listée, ni lisible, ni
cherchable ; base ouverte mais documents privés, 0 document nommé, 0 passage. Index en
0600, chiffrés (en-tête `HLXF1`), 1,1 Mo pour 300 morceaux.
**Essayé de bout en bout dans l'interface le 25/09/2026**, par la personne qui a
fusionné : base créée, deux documents indexés par
`text-embedding-nomic-embed-text-v1.5`, recherche d'essai correcte, puis un Chat avec la
base attachée a répondu juste (27 jours de congés, baguette à 1,30 euro) avec les deux
sources citées sous la réponse.
*Pas essayé* : Cowork avec des bases (outils actifs) ; de vrais PDF et documents Office
(seuls des fichiers texte ont été indexés) ; une vraie base de 100 000 morceaux (seule
la boucle de recherche a été mesurée) et la mémoire de l'application avec un gros
cache ; la reprise de l'indexation après un arrêt en plein travail ; l'effet des
préfixes `search_document:` / `search_query:` ; PostgreSQL comme magasin ; l'instance
empaquetée, Windows et Linux.

**Ligne de commande `helix`.** `helix` (Chat interactif), `helix chat "question"` (aussi
par un tube), `helix chat --outils` (outils de l'instance, séance requise),
`helix code` sur le dossier courant, `connexion`, `deconnexion`, `modeles`, `outils`.
Installation sur un poste qui a le dépôt : `npm link` ou `node cli/helix.mjs`.
Vérifié par la branche le 25/09/2026 : `npm run essai:cli` 31 sur 31 sans modèle, 41 sur
41 avec qwen3-8b (écriture mise en attente d'accord, refusée puis accordée au
pseudo-terminal par « o » ; Code écrit `bonjour.txt` au bon contenu ; Ctrl+C rend la
main). Connecteurs dans Code : route connectée et appelée depuis l'ancienne API
d'OpenCode, **pas proposée par la nouvelle** (§ 3.11).
*Pas essayé* : une vraie demande d'accord par un connecteur (Drive, Slack, courrier) et
le mail affiché en entier dans la carte ; la double authentification au terminal ; une
instance d'entreprise en https à certificat auto-signé (Node le refuse, il faudrait
`NODE_EXTRA_CA_CERTS`) ; Windows ; le refus « deux personnes en même temps » de
`outilsCode.ts` (seul « session inconnue » a été observé) ; qu'OpenCode cesse vraiment
d'écrire après Ctrl+C. La ligne de commande ne parle que français (textes dans
`cli/textes.mjs`).

**Entraîner un modèle.** Paramètres > Entraîner un modèle, quatre étapes. Vérifié par
la branche le 25/09/2026 (Mac mini M4, 16 Go, macOS 27) : moteur installé par la route
en 15 s (34 paquets vérifiés par empreinte, 435 Mo), Qwen3 1.7B téléchargé (4,06 Go en
3 min 15, empreintes conformes) ; de bout en bout, 26 exemples appris et 4 mis de côté,
entraînement en 2 min 38 (2 min 43 annoncées), erreur sur les exemples mis de côté de
4,05 à 0,022, 8 faits justes sur 8 à la comparaison ; installé dans LM Studio en 9 s
(1,84 Go), puis interrogé par le Chat de Helix : réponse juste ; retrait complet. Arrêt
en plein calcul, par le bouton ou par l'arrêt de la passerelle : rien de laissé, le
modèle précédent gardé. Chemin GGUF (celui du PC NVIDIA) essayé sur le Mac : conversion
Q8_0 en 19 s, mêmes réponses.
**Vérification du 25/09/2026 par la personne qui a fusionné** : écran vu ; « Tirer des
exemples d'un document » essayé avec Qwen3 8B : l'ancienne consigne ne rendait que 2
paires sur un règlement de 5 faits ; consigne corrigée (« Couvre chacun des faits »),
8 paires couvrant les 5 faits. L'installation du moteur (4 Go) et un entraînement
complet **n'ont pas été refaits** dans cette vérification.
*Pas essayé* : tout le chemin NVIDIA sauf la conversion GGUF (PyTorch CUDA, QLoRA,
comparaison et fusion par peft) ; Qwen3 0.6B et Qwen3 4B Instruct 2507 (empreintes
relevées, jamais téléchargés en entier ni entraînés) ; Windows, Linux, macOS 14 et 15 ;
un vrai refus d'empreinte par pip ; des jeux de centaines d'exemples ; deux personnes à
la fois sur une instance partagée.

**Images d'un Chat partagé** (ancien point 12). Une image se voit par son auteur et par
qui voit le Chat où elle a été créée ; toute autre demande reçoit 404. Relevé
« image vers Chats » gardé en mémoire : mesuré le 25/09/2026 sur 2 000 Chats de 40
messages (164 Mo), 930 à 1 025 ms pour le refaire, puis 0,3 ms. Les images d'un compte
effacé partent avec lui (elles restaient sur le disque). Vérifié par `npm run securite`
avec de fausses images posées à la main ; *pas essayé* : une vraie image créée puis vue
par un collègue sur un second poste. L'image n'apparaît au collègue que si le Chat a été
synchronisé vers l'instance.

**Import par morceaux** (ancien point 14). La liste arrive par pages de 50 conversations
(ou 64 Mo de fichiers) lues ligne à ligne, les plus récentes d'abord, 5 000 au plus ;
seul le contenu des Chats choisis est ensuite chargé, par lots, **avant** la création
des projets et des agents. Mesuré le 25/09/2026 sur un jeu factice de 2 000
conversations Claude Code (4,7 Go, HOME jetable) : 2 000 proposées au lieu de 500, boucle
de la passerelle bloquée 9 à 14 ms au pire au lieu de 1 372 à 1 588 ms, mémoire au pic
109 à 173 Mo au lieu de 295 Mo, première page en 0,1 s. Une clé inventée
(`claude-code:../../etc/passwd`) est ignorée. Cursor : `sqlite3` ne bloque plus la
passerelle. **Vu à l'écran le 25/09/2026** : 5 lots pour Claude Code, 19 Chats listés ;
Cursor, à 0 conversation, a son bouton désactivé. *Pas essayé* : Cursor sur une vraie
base, Codex (même code, pas mesuré).

**Douze défauts de ce qui avait été ajouté le 24/09, corrigés.** Registre des images
illisible réécrit par-dessus (désormais mis de côté, `index.<date>.illisible.json`) ;
installation d'images sans progression ; modèle d'image retiré pendant la préparation
d'une création ; images d'un compte effacé gardées ; import Cursor affiché
« undefined » ; textes hors traduction ; **fichier des Chats illisible écrasé sans
copie** (le schéma de la perte du 24/09, sans prétendre que c'en était la cause :
désormais copie `sessions.<date>.illisible.enc`, et `sync.push` ne pousse pas une
collection illisible tant que l'instance ne l'a pas rendue ; vérifié avec un faux module
electron, 50 Chats récupérables au lieu de perdus, **pas essayé dans l'application de
bureau**) ; design posé sur un site existant (ne se pose plus que dans un dossier sans
page ni feuille de style) ; relecture d'un classeur qui avalait la cellule suivant une
cellule vide mise en forme ; onglet Code de VS Code muet ; flux Code de VS Code laissé
ouvert ; changement de système pendant la préparation de la machine (refusé, 409). Les
défauts 1, 2, 3 et 12 ont été corrigés sur lecture du code, sans reproduction ; le
paquet `.vsix` n'a pas été refait ; rien n'a été lancé dans VS Code.

**Interface et traductions.** À l'écran, la Bibliothèque s'appelle « Fichiers » : les
nouveaux textes le disent (« Ajouter depuis Fichiers », etc.). Durées et similarités
s'affichent avec la virgule décimale de la langue (`toLocaleString`). Trois messages
d'erreur gardés avec un document (`d.erreur`) sont déclarés dans `PHRASES_GARDEES`, en
fin de `gateway/src/connaissances.ts`, pour que `scripts/i18n-passerelle.mjs` les
relève. Catalogues le 25/09/2026 : interface 2 301 phrases, passerelle 650, anglais et
chinois à 100 %. `npm run securite` : 125 contrôles, tous réussis.

**Employés OpenClaw et bases de connaissances** (ancien point 18, § 3.10). Les bases
d'un agent sont recopiées sur son employé (`Employe.connaissances`, par l'écran du
propriétaire, `useMiseEnService.ts`) ; l'employé a l'outil `connaissances__chercher`
dès qu'il en a (même sans « Autoriser les outils »), refusé aux messageries comme ses
autres outils Helix sauf si on les leur ouvre ; sa fiche de poste lui dit de chercher
avant de répondre et de citer le document, sans nommer les bases. L'écran de l'agent
le dit en une phrase (création et « Connaissances de … »).
Mesuré le 25/09/2026 sur ce poste (Mac mini M4, 16 Go), passerelle d'essai sur le port
8897 avec données et dossier personnel jetables, instance OpenClaw 2026.9.4 d'essai sur
le port 18897 (ni `~/.openclaw`, ni l'instance de l'application), `qwen3-8b` et
`text-embedding-nomic-embed-text-v1.5` déjà chargés dans LM Studio : un agent à trois
bases (« Agence », ouverte à l'équipe, avec une grille tarifaire, un règlement et une
note privée de sa propriétaire ; « Perso Alice », privée ; « Paie », ouverte par une
collègue mais contenant son dossier de salaire privé). Déploiement 8,9 s. « Combien coûte
une traduction de 2 000 mots livrée en urgence ? » : outil appelé, 2 passages, réponse
juste (240 + 30 % = 312 euros) « (source : Grille tarifaire 2026.txt) », en 84 s. Une
mission lancée à la main (« trois heures de relecture, remise fidélité ») : compte rendu
juste (135 euros, 8 % dès le dixième projet) avec la source, en 80 s. « Quel est le
salaire annuel de Bruno ? », demandé par Bruno lui-même, et « le code du coffre
d'Alice ? », demandé par Alice : « les documents n'en parlent pas », aucun secret ;
appelé en direct, l'outil ne cite que les deux documents ouverts. Le journal dit
`outil.appele`, `bases: 3`, `passages: 2`, sans la question.
`npm run securite` : 140 contrôles, tous réussis (15 de plus, section 6 ter, avec un
faux modèle d'embeddings et un faux OpenClaw). Catalogues : interface 2 302 phrases,
passerelle 650, anglais et chinois à 100 %. *Pas essayé* : une messagerie (Telegram…)
avec `outilsEntreprise` ouvert ; une base de groupe (exclue par la règle, non
vérifiée à l'écran) ; l'écran lui-même (la recopie des bases par `useMiseEnService`
n'a été éprouvée que par la route, pas dans l'application de bureau) ; de gros
documents. Constaté : qwen3-8b écrit encore du gras Markdown malgré la consigne, et à
une troisième question de la même conversation il a répondu sans rappeler l'outil
(juste, les passages étaient dans la conversation). L'instance OpenClaw de
l'application (port 18800) a redémarré à 10 h 23, avant que la passerelle d'essai
n'existe (10 h 28) : sans lien avec l'essai.

**Employés et bases partagées à un groupe** (l'après-midi du 25/09/2026, § 3.10). Un
employé personnel dont rien ne sort vers d'autres que son propriétaire lit aussi les
bases partagées aux groupes de ce propriétaire ; l'écran « Connaissances de … » dit ce
qu'il lira, base par base, et pourquoi pas le reste (`LectureBases.tsx`,
`POST /helix/employes/<id>/connaissances`). La carte d'un employé sans agent disait
« Organisation » même pour un employé personnel : corrigé. Vérifié le 25/09/2026 :
`npm run securite` 167 contrôles, tous réussis (14 de plus en section 7 ter : lecture du
groupe, rien du groupe étranger ni du privé, fermeture dès l'élargissement par la
visibilité, les outils, la liberté, une messagerie Telegram, la sortie du groupe, et
réouverture quand la condition revient). De bout en bout sur ce poste, passerelle
d'essai sur 8899 (données jetables) et OpenClaw 2026.9.4 d'essai sur le port 18877
(dossier temporaire ; ni `~/.openclaw`, ni 18789, ni 18800), `qwen3-8b` et
`text-embedding-nomic-embed-text-v1.5` déjà chargés : base « Base Compta » partagée au
groupe Compta, avec la grille du groupe et une note privée d'Alice ; l'employé
personnel d'Alice répond « PAPAYE-3150 (source : Tarifs-Compta.txt) » en 108 s, et au
code du coffre d'Alice « ne figure pas » (en 21 s, en inventant au passage un nom de
document, « Règles-Compta.txt ») ; ouvert à l'organisation, la même question posée par
Bruno ne ramène rien (journal : `regle: "equipe"`, 0 passage), et « cherche dans ta
mémoire » non plus (l'employé n'avait rien noté). Écran vu dans le navigateur (instance
jetable) : agent personnel sans outils, « lue : 1 document(s) sur 2 » ; agent
d'organisation avec outils, deux raisons et « non lue : partagée à des groupes ».
*Pas essayé* : dans l'application de bureau ; sur une messagerie réelle ; un
employé qui a noté un passage de groupe dans sa mémoire puis est ouvert à l'équipe.

**Fichier des Chats illisible : le bandeau, et le bilan d'import** (anciens restes du
point 21). Un bandeau par-dessus l'écran dit ce qui s'est passé, où est la copie, ce
que l'instance a répondu, et quoi faire (`AvisChatsIllisibles.tsx`). La copie
`.illisible.enc` est faite dès la lecture ; un fichier qu'on n'a pas pu copier n'est
jamais remplacé ; le blocage de la poussée survit à un rechargement de la fenêtre. Au
bureau, le bilan d'import attend l'écriture du fichier et dit si les Chats sont dans
le fichier, dans le stockage du navigateur ou seulement en mémoire, et si l'instance en
a la copie ; quand le navigateur refuse aussi, la mémoire reste la source de lecture
(avant, la liste lue redevenait l'ancienne, et la poussée suivante l'aurait envoyée).
**Vu le 25/09/2026 dans l'application de bureau** (Electron de développement, profil
d'essai `HELIX_PROFIL_ESSAI`, `HELIX_DATA_DIR` temporaire, passerelle jetable sur 8898,
jamais `~/.helix/poste`) : fichier remplacé par des octets quelconques → copie faite au
démarrage, bandeau, trois Chats rendus par l'instance ; instance coupée → « pas
joignable », rien poussé ; dossier des Chats non inscriptible et stockage du navigateur
rempli → import de deux Chats par l'écran : « ils ne sont qu'en mémoire […] L'instance
en a reçu la copie ». *Pas provoqué* : le trousseau refusé ou verrouillé. Une sonde
lancée avec un dossier personnel d'essai est restée bloquée (sans doute une demande du
trousseau à l'écran) et a été arrêtée au bout d'une minute ; les essais ont ensuite
gardé le vrai dossier personnel ; dans `~/.helix`, l'application d'essai n'écrit que le
fichier du thème (`electron/main.cjs`, `fichierTheme`), réécrit à 15 h 32 avec la même
valeur, « clair ».

### Ce qui reste à faire

*Liste refaite le 25/09/2026. Ce qui est fait est décrit plus haut ;
ne restent ici que les points ouverts.*

**Ce qui dépend du client**

1. **Signature et notarisation** : tout est prêt (SIGNATURE.md § 1), il manque
   le compte Apple Developer (99 € par an) et le certificat « Developer ID
   Application ». La mise à jour automatique s'active d'elle-même ensuite.
2. **Abonnements aux modèles hébergés** : l'écran existe (Paramètres →
   Abonnement), rien n'encaisse. Dans l'ordre : devis réel d'hébergement chez un
   fournisseur européen, relais chez l'agence qui garde la clé (jamais la clé
   dans le profil du client), jeton et compte de consommation par client,
   paiement. Les **clés d'API** (Paramètres → API développeur, « bientôt »)
   viendront avec (décision du 20/09/2026).
3. **Relecture native** des traductions anglaise et chinoise.
4. **Essais avec de vrais comptes** : bot dans une vraie réunion Google Meet
   (puis Teams, Zoom si demandés) ; courrier Workspace / M365 par OAuth et mode
   d'emploi de l'administrateur ; envoi SMTP et déclenchement par mail sur une
   vraie boîte (Gmail, OVH) ; Drive et Slack ; agents sur Telegram, WhatsApp,
   Discord, Slack.
5. **Rendre le dépôt public** (AGPL) le moment venu : retirer d'abord l'adresse
   mail personnelle du client de `src/lib/store/identity.ts` et
   `src/data/mock/user.ts`.

6. **Unsloth sur NVIDIA** (§ 3.12) : accepté et branché le 25/09/2026, jamais essayé
   (pas de carte NVIDIA ici). À vérifier sur une vraie machine : que pip résout la pile
   avec les deux roues, que `@@MOTEUR@@unsloth` sort bien, et le gain de vitesse réel.

**Ce qui attend une machine qu'on n'a pas**

7. **Qwen-Image** (texte lisible dans l'image) : 48 Go ou carte de 24 Go.
8. **Machine macOS de Cowork** (Lume) : Mac de 32 Go.
9. **Windows et Linux** : images, machine de l'agent, dictée, ligne de commande
   (mode brut du terminal, chemins), jamais essayés sur place.
10. **Entraînement sur carte NVIDIA** : installation de PyTorch CUDA, QLoRA, comparaison
    et fusion par peft jamais essayés sur une vraie machine (seule la conversion GGUF
    l'a été, sur le Mac) ; paquets NVIDIA figés à la version mais sans empreintes.
    Aussi : Qwen3 0.6B (Mac de 8 Go) et Qwen3 4B Instruct 2507 (Mac de 32 Go, NVIDIA
    12 Go) jamais téléchargés en entier ni entraînés ; macOS 14 et 15.

**Ce qu'on peut faire ici**

11. **Extension VS Code** : première vraie question tapée dans VS Code par le
    client ; publication sur la place de marché (compte éditeur à créer). Les deux
    corrections du 25/09 (onglet Code muet, flux laissé ouvert) sont vérifiées par
    simulation seulement ; le `.vsix` 0.2.2 (avec ces corrections et les connecteurs
    dans Helix Code) est refait et installé depuis le 25/09/2026.
12. **Import Cursor** : l'éprouver sur de vraies conversations (le poste du
    client n'a que des brouillons vides). Import Codex par morceaux : pas mesuré.
13. **Le modèle de l'écran Code** : Qwen3 8B y est faible (répétitions, guide de
    design ignoré sans les filets de design.ts). Un modèle fait pour le code
    (Qwen3-Coder, Devstral) ou une clé cloud ferait mieux.
14. **Détection de design** : resserrée le 25/09/2026 (`estDemandeDeSite`, design.ts).
    Les mots sûrs (site, landing, vitrine, portfolio, page d'accueil…) suffisent ; les
    mots ambigus (page, interface, formulaire, maquette, html, css) demandent un verbe
    de création ; un mot de programmation (TypeScript, type, API, serveur, classe,
    fonction, test, bug…) écarte la demande, sauf création d'un site. 26 phrases
    d'essai sur 26 (`npm run essai:design`). Reste : l'éprouver sur les vraies
    demandes du client.
15. **Le garde d'Eden**, l'instance OpenClaw personnelle du client (script hors
    Helix), recharge Qwen3 8B à ses propres réglages : il peut couper une réponse
    d'Helix en cours, et **gêne l'entraînement** sur un Mac de 16 Go. Qwen3 8B chargé
    avec 28 160 jetons retient 10,4 Go de mémoire graphique, MLX échoue alors
    (« Insufficient Memory ») ; l'entraînement décharge les modèles au repos, mais un
    programme du poste (sans doute ce garde, ou un autre client de LM Studio) recharge
    Qwen3 8B dans la minute : deux lancements sur huit se sont arrêtés ainsi le
    25/09/2026. Le message le dit et il suffit de relancer ; une vraie parade demande
    d'harmoniser avec ce garde, si le client le demande. Helix n'y touche pas.
16. **Serveurs MCP dans HelixAI Code** (§ 3.11) : ils marchent depuis le 25/09/2026,
    par l'ancienne API d'OpenCode et un flux traduit par la passerelle
    (`fluxCode.ts`), vérifiés de bout en bout avec un serveur d'essai sans compte
    (`npm run essai:cli -- --modele`). L'écran Code a été regardé dans le navigateur
    le 25/09/2026 (panneau de suivi, § 3.11), sans connecteur branché. Reste : un
    connecteur dans l'écran Code, et l'extension VS Code (nom de
    l'outil sans le préfixe `helix_`, changé mais pas essayé, `.vsix` pas refait) ;
    essayer un vrai
    connecteur à compte ; à chaque mise à jour d'OpenCode, relire si la nouvelle API
    reçoit enfin les outils MCP (alors on pourra y revenir) et si l'ancienne existe
    toujours. L'historique rejoué par le flux n'est plus que celui que la passerelle
    a vu depuis son démarrage.
17. **Ligne de commande** : livrée avec l'application le 25/09/2026 (paquet
    `Resources/cli`, Paramètres > Installer les apps > CLI, qui pose `~/.local/bin/helix`
    et, si besoin, une ligne marquée dans `~/.zprofile` ; `electron/ligneDeCommande.cjs`).
    Windows pas fait. Traductions anglaise et chinoise de ses textes (`cli/textes.mjs`), si le
    client le demande. Documenter `NODE_EXTRA_CA_CERTS` pour une instance à certificat
    auto-signé.
18. **Employés OpenClaw et bases de connaissances** : fait le 25/09/2026 (outil
    `connaissances__chercher`, § 3.10) ; l'après-midi, un agent personnel dont rien ne
    sort vers d'autres (sans messagerie, sans mission « à chaque mail », encadré, sans
    outil qui écrit) lit aussi les bases partagées aux groupes de son propriétaire, et
    l'écran de l'agent dit ce qu'il lira. Reste : le voir dans l'application de bureau
    (vu dans le navigateur seulement) ; l'essayer sur une messagerie ; décider avec le
    client (a) si un tel agent pourrait lire aussi les **documents privés** de son
    propriétaire (non fait : sa mémoire OpenClaw les garderait si l'agent est ouvert
    ensuite), (b) s'il faut une visibilité « partagé à des groupes » pour les agents,
    qui ouvrirait le même droit à un agent de groupe (n'existe pas : un agent est
    personnel ou d'organisation), (c) que faire de la mémoire d'un employé dont
    l'audience s'élargit (aujourd'hui gardée, l'écran le dit).
19. **Export RGPD** : fait le 25/09/2026, `/helix/export` contient désormais les bases
    de connaissances (sans vecteurs), les images créées (liste et demandes) et les
    projets d'entraînement (exemples) ; l'effacement d'un compte retire aussi ses
    projets d'entraînement et le modèle rangé dans LM Studio, qu'il oubliait
    (7 contrôles de plus, section 7 quater de `npm run securite`). Reste : un document supprimé de Fichiers reste listé dans la
    base (« supprimés depuis ») jusqu'à ce que le propriétaire l'y retire ; son index
    reste sur le disque jusque-là, sans plus jamais être servi.
20. **À essayer dans l'application de bureau** : le fichier des Chats illisible est vu
    le 25/09/2026 dans l'application de développement, profil d'essai (fichier abîmé,
    instance coupée, écriture refusée) ; reste le **trousseau refusé ou verrouillé**
    (jamais provoqué) et l'application empaquetée. Aussi : l'écran d'import par
    morceaux avec un vrai logiciel ; Cowork avec des bases de connaissances ; de vrais
    PDF et documents Office dans une base ; une vraie image vue par un collègue sur un
    second poste.
21. **Petits restes du 25/09** : le bandeau du fichier des Chats illisible et le bilan
    d'import au bureau sont faits (« Fait le 25/09/2026 », plus haut). Restent : un Chat
    ouvert sur un poste dont l'instance n'a pas été relue (fichier illisible, instance
    injoignable) n'est pas envoyé, et le démarrage suivant le remplace par la liste de
    l'instance (le bandeau le dit, rien ne le fusionne) ; après un repli vers le
    stockage du navigateur, le démarrage suivant relit le fichier chiffré, qui n'a pas
    les Chats gardés dans le navigateur (ils reviennent de l'instance si elle les a
    reçus, ce que le bilan dit) ; un petit modèle entraîné garde des traces hors de
    propos (la Joconde attribuée à la fondatrice imaginaire), d'où le conseil de deux
    ou trois formulations par fait.
22. **Helix Code avec un petit modèle** (§ 3.11, 25/09/2026) : à voir dans
    l'application de bureau (le panneau de suivi n'a été regardé que dans le
    navigateur, instance jetable) ; refaire le `.vsix` 0.2.3 de l'extension et l'y
    essayer ; mesurer la qualité des réponses de Qwen3 8B avec les consignes courtes
    sur de vraies tâches (une seule tâche essayée : juste, mais la liste de tâches
    réécrite avec un seul élément) ; comprendre les 20 s qu'OpenCode a mises à
    démarrer chaque session du banc ; `limit` ne suit pas un modèle rechargé plus
    petit par un autre programme (Eden) après le démarrage d'OpenCode. Le vrai remède
    au modèle qui relit tout reste de ne pas le partager : c'est au client de voir si
    Eden et Helix doivent se partager Qwen3 8B.
23. **Sessions de Code** (§ 3.11) : les voir dans l'application de bureau ; décider
    avec le client si les sessions d'avant le 25/09 doivent être rattachées (sur une
    instance à un seul compte, on pourrait les lui attribuer ; pas fait) ; renommer une
    session (pas fait, le titre est la première demande) ; l'effacement d'un compte avec
    des sessions de Code, pas essayé.
24. **Zones protégées et import local** (revue du 25/09/2026, SECURITE.md § 22.6) :
    corrigés et vérifiés par `npm run securite` et dans le navigateur (instance
    jetable). Restent : les voir dans l'application de bureau avec le vrai « Tout mon
    poste » (dossier personnel réel, `~/.helix/data` réel) ; le bash de Helix Code
    n'est pas borné par ces zones (OpenCode a ses propres outils, fichiers de Helix Code
    non touchés par cette correction) : à décider avec le client ; la liste des zones
    est celle des emplacements connus, pas une garantie sur tout secret du poste ;
    Windows et Linux (trousseaux, `%APPDATA%`) pas couverts ; le choix « Depuis Helix »
    de l'écran d'un employé n'a été vérifié que par l'API (pas d'employé sur l'instance
    jetable).

**Titulaire des droits** : tranché le 24/09/2026, « Medhi Clabaut » (entreprise
individuelle, SIREN 994 907 145), partout ; mentions légales et section
« Logiciel HelixAI » du site helix-agence.fr à jour.
---

## 6. Ce qu'il ne faut pas refaire

Les erreurs qui ont coûté du temps, pour qu'elles ne se répètent pas.

**Ne jamais affirmer sans mesurer.** Chaque bug sérieux de ce projet a été trouvé en
exécutant, jamais en relisant. Un correctif dont on n'a pas vu l'effet n'est pas un
correctif.

**Se méfier des marqueurs abstraits dans les consignes de modèle.** La phrase
« il faut `<espace de travail>/Dossier` » était recopiée telle quelle par un modèle de
8 milliards de paramètres, et chaque lecture de fichier échouait. Un exemple concret
ne laisse rien à interpréter.

**Une étape muette n'est pas une étape réussie.** Elle laisse un trou que l'étape
suivante comble en inventant. C'est ainsi qu'un bilan comptable s'est rempli de
montants vraisemblables et entièrement faux.

**Un logiciel qui ment est pire qu'un logiciel incomplet.** Une fonction absente se
pardonne ; une coche verte « email vérifié » qui ne vérifie rien est ce qu'un auditeur
relève en premier.

**Libérer le port 8787 après un essai.** La passerelle de développement qui y traîne
empêche l'application du client de démarrer, et le message affiché ne dit pas pourquoi.
