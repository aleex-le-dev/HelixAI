# HelixAI — Plateforme

Plateforme d'agents IA **open source**, en marque blanche, en logiciel de bureau :
chaque organisation installe sa propre instance, chez elle. Elle réunit une interface
React, une **passerelle modèles** locale (`gateway/`) et une enveloppe **Electron** qui
lance la passerelle au démarrage. Interface en **français, anglais et chinois**, au
choix de chacun (Réglages, Préférences).

Contributions : [CONTRIBUTING.md](CONTRIBUTING.md) et [CLA.md](CLA.md).

Sous licence **[GNU AGPL-3.0](LICENSE)** : lisez, installez, modifiez, redistribuez,
vendez. En retour, qui distribue HelixAI ou **le propose comme service en ligne** doit
publier le code de sa version, modifications comprises, sous la même licence.
Explications et portée dans [COPYRIGHT.md](COPYRIGHT.md).

Ce qui fonctionne réellement aujourd'hui : la conversation en streaming sur un modèle
local (ou cloud, par clé), la boucle d'outils MCP sur un espace de travail fichiers,
l'écran Code adossé à OpenCode, le contrôle de l'écran sous approbation, les comptes et
séances, les agents toujours actifs (OpenClaw, installé tout seul), les groupes, la
bibliothèque, les réunions transcrites sur la machine et le bot de réunion, le
branchement d'une trentaine de services (dont douze en un clic, par autorisation dans
le navigateur), la synchronisation de plusieurs postes vers une instance, et depuis le
25/09/2026 les bases de connaissances citées dans le Chat, la ligne de commande
`helix` et l'entraînement d'un petit modèle sur Mac. Ce qui reste annoncé sans
fonctionner est listé en fin de document.

## Démarrer

```bash
npm install
```

### Application (recommandé)

```bash
npm run app
```

Lance Helix en application de bureau : elle compile puis démarre **sa propre
passerelle**, crée son espace de travail au premier lancement, et s'arrête
proprement à la fermeture. Aucun terminal à gérer.

### Produire l'installeur

```bash
npm run package            # paquet non signé, pour les essais
npm run package:signe      # paquet signé et notarié (certificat Apple requis)
npm run verifier:signature # contrôle signature, durcissement, Gatekeeper, notarisation
```

Mode d'emploi de la signature, pas à pas : [`SIGNATURE.md`](./SIGNATURE.md) § 1.

Génère `release/Helix-<version>-<arch>.dmg` et `.zip` (macOS), `.exe` (Windows) ou
`.AppImage` (Linux) selon la plateforme de construction. **Seul macOS a été
construit et éprouvé** ; Windows et Linux sont prévus dans la configuration mais
repoussés à la demande du client. L'installeur embarque
l'interface, la passerelle compilée (`dist-gateway/index.cjs`) et l'icône. La
passerelle tourne dans le runtime Node d'Electron : **lancer Helix et converser
ne demande aucune installation de Node**.

Deux capacités font exception et s'appuient sur des programmes présents sur la
machine :

| Capacité | Ce qu'elle exige | Sans cela |
|---|---|---|
| Outils fichiers (MCP) | `npx` (donc Node/npm) sur le poste | Le serveur de fichiers ne démarre pas, l'agent n'a pas d'outils |
| Écran Code | `opencode` installé (`~/.opencode/bin/opencode` ou dans le `PATH`) | L'écran Code signale que le moteur est absent |
| Modèles locaux | LM Studio | L'écran de mise en route propose de l'installer, sans intervention, sur macOS uniquement |

⚠ Le paquet de `npm run package` n'est **pas signé** : macOS affiche un avertissement
au premier lancement et `spctl` le refuse. Tout est prêt pour la signature et la
notarisation (`npm run package:signe`) ; il manque le certificat Apple, voir
[`SIGNATURE.md`](./SIGNATURE.md). La mise à jour automatique en dépend aussi : non
signée, l'application signale seulement qu'une version existe.

⚠ **LM Studio**, le moteur installé par défaut, est un logiciel fermé dont les
conditions réservent l'usage aux besoins internes de l'entreprise et interdisent
l'usage comme service hébergé pour des tiers. L'écran de première installation fait
accepter ces conditions par l'entreprise. Voir PROJET.md § 3.9 avant d'héberger une
instance pour un client.

### Développement web

Deux processus, dans deux terminaux :

```bash
npm run gateway
```

```bash
npm run dev
```

L'interface est sur `http://localhost:5173`, la passerelle sur
`http://localhost:8787` (Vite la sert derrière `/api`).

### Ligne de commande

`helix` (`cli/helix.mjs`, Node 20 ou plus, sans dépendance) parle à l'instance comme
l'interface : il affiche, et transmet vos réponses ; modèles, outils, barrière
d'approbation et journal restent ceux de l'instance. Sur un poste qui a le dépôt :
`npm link` (ou `node cli/helix.mjs`). L'application empaquetée ne l'installe pas
encore.

```
helix                          Chat interactif
helix chat "question"          Une question, une réponse (aussi : cat notes.txt | helix chat "résume")
helix chat --outils            Chat avec les outils de l'instance ; séance requise
helix code "demande"           Helix Code sur le dossier courant (sans demande : interactif)
helix connexion [--compte adresse@exemple.fr]
helix deconnexion
helix modeles                  Modèles de l'instance
helix outils                   Groupes d'outils et niveau d'accord de l'instance
helix aide
```

Options : `--adresse URL` (ou `HELIX_ADRESSE`, défaut `http://127.0.0.1:8787`),
`--jeton` (ou `HELIX_JETON` ; à défaut, le jeton de l'application du poste, lu
seulement pour une adresse locale), `--modele`, `--effort`, `--outils`. Dans une
conversation : `/nouveau`, `/modele [NOM]`, `/aide`, `/quitter` (ou Ctrl+D) ; Ctrl+C
arrête la réponse en cours. Une demande d'accord s'affiche en entier, « Autoriser ?
[o/N] » : seuls « o » ou « oui » accordent. Sans terminal, rien n'est accordé et
l'expiration vaut refus. Essai automatique : `npm run essai:cli` (ajouter
`-- --modele` avec LM Studio). Vérifié sur macOS seulement ; textes en français
seulement.

### Passerelle modèles

`gateway/` est le seul point de contact avec l'inférence (cf.
[`ARCHITECTURE.md`](./ARCHITECTURE.md), ADR-001). Elle s'exécute directement par
Node 22+, sans étape de compilation en développement, et n'a qu'une dépendance
d'exécution : le SDK MCP (`@modelcontextprotocol/sdk`). Le pilote `pg` n'est
chargé que si une base PostgreSQL est déclarée dans le profil de déploiement.

Elle découvre automatiquement les moteurs disponibles :

| Backend | URL par défaut | Variable d'environnement |
|---|---|---|
| Cluster **exo** | `http://localhost:52415/v1` | `HELIX_EXO_URL` |
| **LM Studio** | `http://localhost:1234/v1` | `HELIX_LMSTUDIO_URL` |

D'autres backends OpenAI-compatibles (cloud européen, second cluster) s'ajoutent
par `backends` dans `helix.config.json`.

Pour le Chat, il suffit que **LM Studio tourne avec son serveur local activé** et qu'un
modèle de conversation soit installé. Si le serveur local est éteint, la passerelle
tente de le démarrer elle-même (`lms server start`) et le referme à la fermeture de
Helix si c'est elle qui l'avait allumé. La passerelle classe les modèles par rôle
(chat, code, vision, gui, embed), préfère un modèle déjà chargé, et relaie le canal de
raisonnement des modèles qui en émettent un (Qwen3, Kimi Thinking…).

#### Routes servies

Toutes exigent le jeton d'instance, sauf `GET /` et `GET /health`. Celles marquées
« séance » exigent en plus une séance utilisateur ouverte (voir
[`SECURITE.md`](./SECURITE.md)).

| Route | Rôle | Séance |
|---|---|---|
| `GET /`, `GET /health` | Contrôle de présence. Sans jeton, ne renvoie que la présence du service | non |
| `GET /v1/models`, `GET /helix/models` | Catalogue des modèles, avec leurs rôles | non |
| `POST /v1/chat/completions` | OpenAI-compatible. Accepte en plus `role`, `effort` et `tools` | si `tools: true` |
| `POST /helix/models/load` | Charge un modèle en mémoire | oui |
| `GET /helix/provision`, `GET /helix/provision/stream` | État et progression de la mise en route | non |
| `POST /helix/provision/moteur` | Installe LM Studio (macOS) | oui |
| `POST /helix/provision/start` | Télécharge et charge un modèle du catalogue | oui |
| `POST /helix/auth/create`, `POST /helix/auth/verify` | Création de compte, connexion | voir ci-dessous |
| `POST /helix/auth/premier-mot-de-passe` | Premier mot de passe d'un compte créé avant 0.9.0, une seule fois | non |
| `POST /helix/auth/deux-facteurs` | Second pas de la connexion : défi remis par `verify` et code | non |
| `GET /helix/auth/deux-facteurs/etat`, `POST …/preparer`, `…/activer`, `…/desactiver`, `…/codes` | Réglage de la double authentification de la personne connectée | oui |
| `GET /helix/export` | Export RGPD des données de la personne connectée | oui |
| `GET /helix/compte/effacement`, `POST /helix/compte/effacer` | Aperçu puis suppression de son propre compte | oui |
| `POST /helix/auth/deux-facteurs/inscription`, `…/inscription/activer` | Activation imposée du second facteur à la connexion (défi d'inscription) | non |
| `GET /helix/auth/sessions`, `POST /helix/auth/revoke` | Séances ouvertes, révocation | oui |
| `GET /helix/data` | Révisions par collection, sans contenu | non |
| `GET`/`PUT /helix/data/<collection>` | Lecture et écriture d'une collection | oui, sauf lecture de `accounts` |
| `GET /helix/audit` | Journal d'audit et vérification de sa chaîne | oui |
| `GET /helix/mcp`, `POST /helix/mcp/toggle`, `POST /helix/mcp/workspace` | Serveurs d'outils et espace de travail | oui pour les deux `POST` |
| `GET /helix/code`, `GET /helix/code/events` | État du moteur, flux d'évènements d'une session | non |
| `GET /helix/dossiers`, `POST /helix/code/session`, `POST /helix/code/prompt`, `POST /helix/code/interrupt` | Écran Code (OpenCode) | oui |
| `GET /helix/computer`, `GET /helix/computer/events` | État du contrôle de l'écran, flux des approbations | non |
| `POST /helix/computer/action`, `POST /helix/computer/approve` | Demander et approuver une action d'écran | oui |
| `GET /helix/atelier` | Diagnostic de l'atelier bureautique de Cowork | non |
| `POST /helix/atelier/preparer`, `POST /helix/atelier/verifier` | Installer et vérifier l'atelier | oui |
| `GET`/`POST /helix/employes`, `POST /helix/employes/<id>`, `…/supprimer`, `…/message`, `GET …/message/<travail>`, `…/echanges`, `…/activite`, `POST …/missions/<m>/lancer` | Employés OpenClaw : équipe, déploiement, conversation, activité (SECURITE.md § 14) | oui |
| `…/canaux` (`GET`, `POST`), `…/canaux/<type>/retirer`, `…/canaux/whatsapp/qr`, `…/demandes`, `…/demandes/<canal>/<code>/accepter` | Messageries d'un employé, liaison WhatsApp par QR, personnes à accepter | oui |
| `GET`/`POST /helix/fournisseurs`, `POST …/essayer`, `POST …/<id>`, `…/<id>/supprimer` | Clés de modèles cloud (SECURITE.md § 15) | oui |
| `POST /helix/employes/<id>/outils` | Serveur d'outils MCP de l'employé, appelé par l'instance OpenClaw (clé `X-Helix-Cle`) | non, clé |
| `GET`/`POST /helix/connaissances`, `GET …/documents`, `POST …/chercher`, `GET`/`POST …/<id>`, `POST …/<id>/{documents,retirer,reindexer,supprimer}` | Bases de connaissances (SECURITE.md § 22.2) ; champ `connaissances` du corps de `POST /v1/chat/completions` | oui |
| `GET /helix/entrainement`, `GET …/projet?id=`, `POST …/{installer,desinstaller,projets,renommer,exemples,importer,generer,lancer,arreter,comparer,publier,retirer,supprimer}` | Entraîner un modèle (SECURITE.md § 22.3) | oui |
| `/helix/code/outils` | Connecteurs servis par MCP à l'agent de code de l'instance (jeton et clé `X-Helix-Cle`, SECURITE.md § 22.4) | non, clé |

#### Variables d'environnement

| Variable | Effet | Défaut |
|---|---|---|
| `HELIX_GATEWAY_PORT` | Port d'écoute | `8787` |
| `HELIX_GATEWAY_HOST` | Interface d'écoute | `127.0.0.1`, ou `0.0.0.0` si `share: true` |
| `HELIX_CONFIG` | Chemin du profil de déploiement | `./helix.config.json` |
| `HELIX_DATA_DIR` | Données, jeton, journal, TLS, clé `.cle`, et l'atelier Cowork (sous-dossier `cowork`) | `~/.helix/data` |
| `HELIX_TOKEN` | Jeton d'instance imposé | tiré au sort au premier démarrage |
| `HELIX_TOKEN_FILE` | Fichier du jeton | `<données>/instance-token` |
| `HELIX_WORKSPACE` | Espace de travail de l'agent | `workspace` du profil, sinon `~/Helix` |
| `HELIX_CODE_DIR` | Dossier de départ de l'écran Code | `workspace` du profil, sinon `~/Helix` |
| `HELIX_EXO_URL`, `HELIX_LMSTUDIO_URL` | Adresses des backends | voir tableau ci-dessus |
| `HELIX_MAX_ETAPES` | Plafond d'allers-retours d'outils | `30` |
| `HELIX_BUDGET_ETAPE` | Actions accordées à une étape d'un travail découpé, 4 au moins (à défaut : 8, 14 ou 20 selon la taille du modèle) | selon le modèle |
| `HELIX_CAPTURE_LARGEUR` | Largeur de la capture envoyée au modèle | `1024` |
| `HELIX_CUA_URL`, `HELIX_CUA_CONTAINER`, `HELIX_CUA_KEY` | Serveur cua du mode `sandbox` | `http://127.0.0.1:8000` |
| `HELIX_APPS_DIR` | Où installer LM Studio | `/Applications`, sinon `~/Applications` |
| `HELIX_GATEWAY_URL` | Cible du proxy Vite en développement | `http://localhost:8787` |
| `VITE_GATEWAY_URL` | Instance imposée à la construction de l'interface | aucune |

### Outils (MCP)

La passerelle lance des **serveurs MCP auto-hébergés** et expose leurs outils au modèle.
Quand l'interrupteur **Outils** est actif dans le Chat, l'agent peut demander l'exécution
d'un outil : la passerelle l'exécute, lui renvoie le résultat, et le cycle se répète
jusqu'à la réponse finale. L'activité est tracée dans la conversation.

Le budget d'allers-retours s'adapte au modèle : 30 étapes en exécution directe
pour un modèle de moins de 14 milliards de paramètres, 40 jusqu'à 45 milliards,
50 au-delà. Ce budget est **plafonné par `HELIX_MAX_ETAPES`, qui vaut 30 par
défaut** : 40 et 50 ne sont atteints que si la variable est relevée. Pour un
petit modèle, c'est **le modèle qui juge** si une demande doit être découpée en
étapes, chacune avec son propre budget, plus court (8, 14 ou 20 selon la taille,
ou `HELIX_BUDGET_ETAPE`) ; une étape trop grosse est redécoupée, et une étape qui
modifie est contrôlée sur l'état réel. Trois étapes avant la
limite, l'agent est invité à conclure et à rendre compte plutôt que d'être coupé
net. Le barème complet est dans [`ARCHITECTURE.md`](./ARCHITECTURE.md), ADR-012.

Serveur par défaut : accès **fichiers** limité à un espace de travail explicite. Il est
lancé par `npx -y @modelcontextprotocol/server-filesystem <espace>`, ce qui suppose
`npx` disponible sur la machine et, au tout premier lancement, un accès au registre npm
pour récupérer ce paquet.

```bash
HELIX_WORKSPACE=/chemin/vers/dossier npm run gateway
```

Par défaut : `~/Helix`. L'espace se change ensuite depuis l'interface, par le
sélecteur de dossier de macOS (`POST /helix/mcp/workspace`). Le chemin est validé
côté instance : tout dossier est admis, disque externe compris, sauf les
emplacements du système et la racine du disque.

### Connecteurs

**Réglages → Connecteurs.** Une grille de tuiles, un clic par service :

| Service | Protocole | Outils offerts à l'agent |
|---|---|---|
| Courrier | IMAP : lecture et brouillons ; SMTP : envoi, s'il est activé, chaque mail montré en entier et accepté un par un (ou sans confirmation, si on le choisit, sauf en réponse à un mail reçu) | `courrier__derniers`, `courrier__chercher`, `courrier__lire`, `courrier__brouillon`, `courrier__envoyer` |
| Agenda | CalDAV, lecture seule | `agenda__prochains`, `agenda__jour`, `agenda__chercher` |
| Google Drive | API Google, lecture seule | `drive__chercher`, `drive__recents`, `drive__dossier`, `drive__lire` |
| Slack | API Slack, lecture seule | `slack__salons`, `slack__messages`, `slack__fil`, `slack__chercher` |
| Notion | serveur MCP officiel | ceux du serveur |

**Google Drive** : l'entreprise crée son propre client OAuth sur console.cloud.google.com
(API Google Drive activée ; audience « Interne » sous Google Workspace ; client de type
« Application de bureau »), puis l'inscrit dans `helix.config.json` :
`"google": { "clientId": "…", "clientSecret": "…" }`, et redémarre l'instance. On
branche ensuite depuis Réglages, Connecteurs : le navigateur s'ouvre pour l'accord.
**Slack** : on crée l'application depuis le manifeste affiché à l'écran
(api.slack.com/apps, « From a manifest »), on l'installe dans l'espace, on colle son
jeton `xoxb-`, puis on l'invite dans les salons à lire. Laisser la distribution
publique désactivée. Aucun des deux n'a encore été branché sur un vrai compte.

Pour Gmail et Google Agenda, il faut un **mot de passe d'application** Google,
pas le mot de passe habituel : le formulaire l'indique et pré-remplit le serveur
d'après le domaine de l'adresse. Microsoft 365 n'est pas encore pris en charge :
il exige OAuth 2.0.

Les outils d'un service ne sont proposés à l'agent qu'une fois ce service
configuré, et ils le sont dans le Chat comme dans Cowork et Code. Dans le Chat,
l'agent dispose aussi de la **bibliothèque** et des **réunions** transcrites
(`bibliotheque__…`, `reunions__…`), en lecture, selon ce que la personne y voit.

### Approbation des actions

**Cowork → « Approuver pour moi ».** Trois niveaux : tout approuver, demander
avant de modifier (**défaut**), demander pour tout. La barrière est appliquée
par la passerelle. Détail dans [`SECURITE.md`](./SECURITE.md), § 6.2.

### Atelier bureautique de Cowork

Cowork sait manipuler des fichiers, mais il ne sait produire ni relire un
document Word, Excel, PowerPoint ou PDF tant que la machine ne porte pas les
bibliothèques correspondantes. La carte **Préparer Cowork**, dans le panneau
droit de Cowork, s'en charge.

Elle procède en trois temps : un **diagnostic** en lecture seule (Python, pip,
Node, npm, bibliothèques présentes ou manquantes, outils optionnels), une
**confirmation** qui annonce le nombre de paquets, la place occupée et le
dossier exact, puis l'**installation** suivie d'une **vérification** qui produit
et relit un document de chaque format.

Trois garanties, appliquées par le code de la passerelle
(`gateway/src/atelier.ts`) :

- la liste des paquets est **figée dans le code**. Le modèle ne décide rien, et
  aucune chaîne de commande n'est construite depuis une entrée utilisateur ;
- tout est installé dans un environnement **isolé** sous
  `<HELIX_DATA_DIR>/cowork` (par défaut `~/.helix/cowork`) : un environnement
  virtuel Python et un préfixe npm. Ni les installations globales, ni le `PATH`,
  ni les projets ne sont touchés ;
- **aucun droit administrateur** n'est demandé.

LibreOffice et les outils Poppler ne sont pas installés automatiquement : ils
pèsent plusieurs centaines de mégaoctets et peuvent demander des droits. Leur
présence est signalée, avec ce qu'elle apporterait.

Une fois l'atelier installé, cinq outils s'ajoutent à ceux du serveur de
fichiers (`gateway/src/bureau.ts`), dans la même liste proposée au modèle :

| Outil | Effet |
|---|---|
| `bureau__creer_document` | Word `.docx` : titre, paragraphes, tableaux |
| `bureau__creer_classeur` | Excel `.xlsx` : onglets, lignes, formules (`=SUM(...)`) |
| `bureau__creer_presentation` | PowerPoint `.pptx` : titre et puces par diapositive |
| `bureau__creer_pdf` | PDF mis en page sur du A4 |
| `bureau__lire_document` | Extrait le texte d'un `.docx`, `.xlsx`, `.pptx` ou `.pdf` |

Tant que l'atelier n'est pas installé, la liste est vide : proposer au modèle
des outils qui échoueront le pousse à s'acharner dessus.

Deux garanties, à connaître avant de vendre la production de documents :

- **le modèle fournit des données, jamais du code.** Les scripts Python sont des
  constantes du module et rien n'y est interpolé. Les paramètres voyagent en
  JSON sur l'entrée standard, pas en ligne de commande ;
- **rien ne s'écrit hors de l'espace de travail.** Chaque chemin est résolu par
  `realpath`, liens symboliques compris, puis comparé à la racine réelle de
  l'espace.

⚠ Ce n'est **pas** un outil d'exécution générique, et c'est délibéré : le modèle
remplit cinq gabarits, il ne lance ni commande ni code. Un graphique, une mise
en forme fine ou une conversion de format sortent de ce périmètre.

### Profil de déploiement client

Helix est installé par l'intégrateur, réglé sur le matériel et les usages de chaque client.
Copiez [`helix.config.example.json`](./helix.config.example.json) en `helix.config.json`
(ou pointez `HELIX_CONFIG` ailleurs) : **ce fichier prime sur toute détection automatique**.

Il permet de fixer, par client :

- le **modèle imposé pour chaque rôle** (`chat`, `code`, `vision`, `gui`, `embed`) ;
- les **backends** (adresse du cluster, ajout d'un cloud européen, désactivation de LM Studio) ;
- l'**espace de travail** accessible à l'agent ;
- `autoProvision: false` pour désactiver le téléchargement automatique (l'intégrateur gère
  les modèles) ;
- le mode **computer-use** : `sandbox` (VM dédiée, recommandé), `hote`, ou `desactive`.
  Écrit ici, il fait foi ; absent, la personne peut l'activer elle-même depuis
  Réglages, Contrôle de l'écran, sur un poste autonome et sous mot de passe ;
- `google` : le client OAuth de l'entreprise, pour le connecteur Google Drive ;
- `deuxFacteursObligatoire: true` pour **imposer la double authentification** à tous les
  comptes : une personne qui ne l'a pas l'active à sa connexion suivante, avant toute
  séance (SECURITE.md § 2.1) ;
- `database` pour une instance **PostgreSQL** : le pilote est livré avec l'application,
  et la base est chiffrée comme les fichiers.
- `openclaw` pour les **agents toujours actifs** : Helix installe OpenClaw lui-même à
  la première mise en service et propose ses mises à jour ; `version` et `node` fixent
  les versions installées, `chemin` impose un exécutable OpenClaw déjà présent, `port`
  déplace l'instance dédiée (18800 par défaut) ;
- `journalConservationJours` : durée de conservation du **journal d'audit** (90 jours
  par défaut, de 30 à 3650) ; `journalCopie` en recopie chaque ligne ailleurs.

Sans ce fichier, la passerelle profile la machine et se débrouille seule.

## Ce qui sort de la machine, et ce qui n'en sort jamais

C'est le cœur de la promesse Helix, et il vaut mieux le dire exactement.

**Ne sortent jamais de la machine, ni de l'instance :**

- les **conversations**, les documents joints, les fichiers lus ou écrits par l'agent ;
- l'**inférence** elle-même : les requêtes partent vers les backends déclarés, qui sont
  par défaut `localhost:1234` (LM Studio) et `localhost:52415` (cluster exo) ;
- les **comptes**, profils, projets, tâches et agents, qui vivent dans `~/.helix/data`
  ou dans la base PostgreSQL de l'entreprise ;
- les **captures d'écran** du mode `hote`, qui vont au modèle local et nulle part ailleurs ;
- aucun service d'authentification, de télémétrie ou d'analytique n'est contacté. La
  politique de sécurité du contenu de l'application empaquetée interdit à l'interface de
  charger un script, une police ou une image venus d'ailleurs.

**Sortent, à l'installation et à la mise en route :**

| Destination | Quand | Pourquoi |
|---|---|---|
| `registry.npmjs.org` | `npm install`, puis au premier démarrage du serveur d'outils, lancé par `npx` | Récupérer le code du serveur MCP fichiers, qui n'est pas empaqueté |
| `formulae.brew.sh` | Bouton « Installer le moteur » | Lire l'adresse et l'empreinte SHA-256 de la version courante de LM Studio |
| `installers.lmstudio.ai` | Idem | Télécharger LM Studio. L'empreinte du paquet est vérifiée avant ouverture, et l'adresse est refusée si elle ne vient pas de ce domaine |
| Catalogue de modèles de LM Studio (HuggingFace) | Téléchargement d'un modèle (`lms get`) | Récupérer les poids. Ce trafic est le fait de LM Studio, que Helix pilote en ligne de commande |
| `registry.npmjs.org`, via OpenCode | Premier usage de l'écran Code | OpenCode charge l'adaptateur `@ai-sdk/openai-compatible` déclaré dans la configuration écrite par Helix |
| `pypi.org` et `registry.npmjs.org` | Bouton « Préparer l'atelier » de Cowork | Télécharger les bibliothèques bureautiques (Word, Excel, PowerPoint, PDF). La liste des paquets est figée dans le code de la passerelle, l'utilisateur la voit avant d'accepter |
| `pypi.org` et `huggingface.co` | Installation de la dictée ou de la transcription des réunions, sur demande | Le moteur de transcription, puis le modèle Whisper adapté à la machine, à une révision figée. Ensuite, la transcription tourne hors ligne |
| `registry.npmjs.org` | Page Agents, au plus deux fois par jour | Lire le numéro de la dernière version publiée d'OpenClaw, pour la dire à l'écran. Rien n'est envoyé |
| `nodejs.org`, puis `registry.npmjs.org` | Bouton « Installer OpenClaw », ou premier déploiement d'un employé | Un Node.js officiel (archive vérifiée par son empreinte SHA-256), puis OpenClaw à la version éprouvée, dans `<données>/openclaw-moteur` |
| `registry.npmjs.org` | Premier employé au palier Étendu, premier branchement de WhatsApp, Discord, Slack ou Mattermost | Extensions officielles d'OpenClaw (recherche web DuckDuckGo, messageries), installées dans le dossier de l'instance |
| Le serveur de mise à jour **de l'agence** | Au lancement puis toutes les six heures, si une adresse est inscrite dans le paquet | Savoir si une version plus récente existe, et la télécharger si l'application est signée. Rien d'autre n'est envoyé que la requête du fichier `latest-mac.yml` (SIGNATURE.md § 4) |

Ces échanges sont des **téléchargements de logiciel et de modèles**. Aucune donnée
métier, aucune conversation, aucun identifiant ne les accompagne. Une fois
l'installation faite, une instance fonctionne sans accès à Internet.

**Sortent uniquement si quelqu'un le décide :** un backend cloud ajouté par l'intégrateur
dans `helix.config.json`, ou un fournisseur dont une personne a branché la clé
(Paramètres, Modèles cloud), reçoit les conversations envoyées à ses modèles. Chaque
modèle affiche où il tourne, et aucun modèle cloud n'est choisi d'office. Un employé au
palier Étendu consulte le web (recherche DuckDuckGo, pages lues) ; un employé branché
sur une messagerie échange avec ses serveurs (Telegram, WhatsApp, Discord, Slack,
Mattermost). Le **bot de réunion** entre dans une réunion Google Meet
(meet.google.com) quand quelqu'un l'y envoie : le son y est capté, puis transcrit sur la
machine ; rien ne part chez un service d'enregistrement. C'est un
choix explicite, jamais un défaut. La configuration d'OpenCode écrite par Helix
désactive d'ailleurs tous les fournisseurs distants (`opencode`, `anthropic`, `openai`,
`google`, `openrouter`) ainsi que la mise à jour automatique, pour qu'aucun repli
silencieux n'envoie le code du client ailleurs. Celle de l'instance OpenClaw des
employés fait de même : seuls les fournisseurs pointant sur la passerelle Helix
existent (`models.mode: replace`), les extensions des fournisseurs distants sont
désactivées, et la télémétrie, la vérification de mise à jour, le catalogue de modèles
distant et l'annonce sur le réseau local sont coupés.

## Comptes

Au premier lancement, l'utilisateur crée un compte (nom, email, mot de passe).
Les comptes vivent dans l'instance : **aucun service d'authentification n'est
contacté**. Le compte détermine à qui appartiennent le profil, la mémoire et les
sessions, ce qui permet à plusieurs collaborateurs de partager un poste ou une
instance sans mélanger leurs données.

Trois règles, appliquées par l'instance :

- **tout compte a un mot de passe**, de 10 caractères au moins, le premier compris
  (depuis 0.9.0). Un compte créé avant sans mot de passe choisit le sien à la
  connexion suivante ;
- le **premier** compte se crée sans être connecté : il faut bien amorcer
  l'instance ;
- **ensuite**, créer un compte exige d'être connecté. C'est un collègue déjà connu
  qui inscrit le suivant, comme dans un ERP. Sans cette règle, n'importe quel poste
  détenant le jeton pourrait s'inscrire à l'adresse d'un invité en attente et
  hériter de ses projets.

Chacun peut activer la **double authentification** dans Paramètres, Sécurité : un
code à six chiffres affiché par une application du téléphone (Aegis, 2FAS, Mots de
passe d'Apple, Google Authenticator...), après le mot de passe. Aucun service tiers
n'intervient. Dix codes de secours sont remis à l'activation. L'intégrateur peut
l'imposer à tous (`deuxFacteursObligatoire`, profil de déploiement).

**Supprimer son compte** : Paramètres, Profil, Zone de danger. L'écran montre d'abord
ce qui disparaît et ce qui est confié à un collègue (les projets partagés), puis
demande le mot de passe, et un code si la double authentification est active. Le
journal d'audit, scellé, est conservé. Pour une personne qui a quitté l'entreprise,
l'administrateur passe par l'outil de récupération (choix 3), application fermée.

**Mot de passe oublié, téléphone perdu.** Il n'y a pas de récupération par courriel :
l'instance n'envoie pas de courrier. L'administrateur du poste qui héberge l'instance
lance l'outil de récupération, embarqué dans l'application :

```bash
ELECTRON_RUN_AS_NODE=1 "/Applications/Helix.app/Contents/MacOS/Helix" "/Applications/Helix.app/Contents/Resources/dist-gateway/motdepasse.cjs"
```

(le nom `Helix` est celui de l'application livrée au client). Il redéfinit un mot de
passe, retire la double authentification, ou supprime un compte ; chaque usage est
inscrit au journal.

Le mot de passe est dérivé par PBKDF2-SHA256 (210 000 itérations, sel par compte) et
n'est jamais stocké en clair ni transmis à un poste. La vérification a lieu sur
l'instance, et cinq échecs verrouillent le compte une minute, puis deux, puis quatre,
jusqu'à quinze minutes.

Les données de l'instance sont par ailleurs **chiffrées au repos**, dans les fichiers
JSON comme dans PostgreSQL, la clé étant rangée dans le trousseau macOS de la machine
de l'instance. Le détail, et ce
que cela ne protège pas, sont dans [`SECURITE.md`](./SECURITE.md).

## Postes et instance

Au tout premier lancement, chaque poste choisit son mode :

| Mode | Pour qui | Modèle |
|---|---|---|
| **Poste autonome** | une personne seule, ou le poste qui héberge l'instance | installé automatiquement sur la machine |
| **Rejoindre l'instance** | un collègue invité, sur son propre PC | **aucun** : l'inférence vient de l'instance |

C'est le fonctionnement d'un ERP : une instance centrale (le cluster ou un
serveur de l'entreprise), des postes qui s'y connectent. Le collègue clique le lien
de son invitation, ou saisit l'adresse et le code, et retrouve immédiatement les
projets et conversations auxquels il a été invité — **sans installer le moindre
modèle**.

### Données de l'instance

La passerelle héberge les collections partagées (comptes, projets,
conversations, tâches, agents). Deux stockages :

| Stockage | Quand | Configuration | Chiffrement au repos |
|---|---|---|---|
| **Fichiers JSON** (défaut) | poste isolé, petite équipe | aucune, `~/.helix/data` (ou `HELIX_DATA_DIR`) | oui, AES-256-GCM |
| **PostgreSQL** | usage concurrent réel | `"database"` dans `helix.config.json` | non, à confier au chiffrement du serveur |

```json
{ "database": "postgresql://helix:motdepasse@192.168.1.50:5432/helix" }
```

Le pilote `pg` n'est pas installé par défaut : `npm i pg` sur la machine qui héberge
l'instance.

Collections partagées : `accounts`, `projects`, `sessions`, `tasks`, `agents`,
`profiles`. Les séances d'authentification vivent dans le même magasin mais ne sont
**jamais** exposées par la synchronisation.

Chaque poste garde une copie locale dans son stockage de navigateur : **l'application
reste utilisable si l'instance est injoignable**, et se resynchronise au retour, en
comparant les révisions toutes les quatre secondes.

## Collaboration

On invite un collègue **par son adresse email**, sur un **projet** (page Projets →
badge des membres) ou sur une **conversation** (barre latérale → icône de partage
au survol).

- Si la personne a déjà un compte sur l'instance, l'accès est **immédiat**.
- Sinon l'invitation reste **en attente** et se dénoue toute seule à la création
  de son compte : elle retrouve alors ses projets et conversations partagés.

Le partage entre machines suppose une **instance partagée** : la passerelle du poste
qui l'héberge écoute sur le réseau, sert en TLS, et les autres postes la visent par
son adresse. Sur une installation isolée, « partagé » signifie « partagé entre les
comptes de cette machine ».

Deux façons de l'ouvrir : `"share": true` dans `helix.config.json`, réservé à
l'intégrateur d'une instance d'entreprise, ou l'interrupteur **Paramètres → Profil →
« Ouvrir l'instance à mes collègues »**, qui demande le mot de passe et le rôle
d'administrateur. Dans les deux cas l'instance chiffre dès qu'elle écoute, et le
jeton reste exigé : ouvrir l'écoute n'ouvre pas l'accès.

### Inviter quelqu'un, et par où il vous rejoint

**Paramètres → Profil → Inviter un collègue.** Une adresse email, un bouton. La
personne reçoit un lien : un clic ouvre son application avec l'adresse et le code
déjà remplis, et elle confirme. Le rattachement n'est jamais automatique, parce
qu'un lien `helix://` peut venir d'ailleurs que du mail attendu (`SECURITE.md` § 19).

L'écran range les adresses de la machine selon ce qu'elles permettent :

| Où est le collègue | Ce qu'il faut | État |
|---|---|---|
| Même réseau (même Wi-Fi, même câble) | rien, l'adresse suffit | fonctionne |
| Ailleurs, avec un VPN ou un réseau privé (Tailscale, WireGuard) | le tunnel monté des deux côtés ; Helix le détecte et affiche l'adresse | fonctionne |
| Ailleurs, sans lien privé | un lien privé entre les deux réseaux | l'écran le dit, et déconseille d'ouvrir un port sur la box |
| À toute heure | une machine qui ne s'éteint pas | instance dédiée |

Helix **détecte** le réseau privé que vous avez monté et s'en sert ; il n'en installe
pas. Un tunnel clés en main suppose un service de rendez-vous entre les machines,
donc un tiers au milieu d'une plateforme qui existe pour ne pas en avoir.

Une conversation, un dossier ou un document de la bibliothèque, une réunion se
partagent aussi à un **groupe** (page Groupes) : chaque membre y a accès, et le perd
s'il quitte le groupe.

Le cloisonnement est appliqué par l'instance, pas par l'interface : chacun ne reçoit
que ses projets, ses conversations, ses tâches et ses agents, plus ce qui lui est
explicitement partagé.

## Réunions

**Réunions → Enregistrer, Importer, ou Envoyer le bot.** Le micro du poste enregistre
(le son part par morceaux de dix secondes, chiffrés sur l'instance) ; un fichier audio
ou vidéo s'importe (2 Go) ; le **bot** (application de bureau) rejoint une réunion
Google Meet comme invité, sans micro ni caméra, sous le nom réglé dans Paramètres, Bot
Recorder, et enregistre jusqu'à la fin. Un participant doit l'admettre, et c'est à
vous de prévenir les personnes présentes. Il peut aussi rejoindre seul les réunions
Google Meet de l'agenda.

La transcription se fait sur la machine de l'instance, par Whisper (le même moteur que
la dictée, installé sur demande) ; le compte rendu (résumé, décisions, actions à
verser dans Tâches) par un modèle de la machine. L'audio est effacé après la
transcription, sauf réglage contraire.

## Contrôle de l'écran

Cowork peut voir l'écran, déplacer la souris et saisir au clavier. **Désactivé
par défaut.** Sur un poste autonome, la personne l'active elle-même : bouton
« Écran » de Cowork, ou Réglages, Contrôle de l'écran, « Activer sur ce Mac », sous
mot de passe, approbation de chaque action toujours exigée. L'intégrateur peut aussi
le fixer dans `helix.config.json`, et son choix fait alors foi ; sur une instance
partagée, c'est la seule voie.

```json
{ "computerUse": { "mode": "sandbox", "image": "macos-sequoia", "requireApproval": true } }
```

| Mode | Ce que l'agent pilote | État |
|---|---|---|
| `desactive` | rien | défaut |
| `sandbox` | une machine virtuelle dédiée, via cua/Lume : le poste n'est jamais touché | écrit et livré côté passerelle, **non vérifié sur une vraie VM** |
| `hote` | la machine réelle | livré et vérifié sur macOS |

Le mode `sandbox` suppose une VM démarrée (`lume run`) et un serveur cua qui écoute sur
`http://127.0.0.1:8000` (`HELIX_CUA_URL`). Sans elle, chaque action renvoie une erreur
explicite.

En mode `hote` sur macOS, rien n'est à installer, mais **deux autorisations
système** sont à accorder à Helix, dans Réglages Système → Confidentialité et
sécurité :

1. **Enregistrement de l'écran** — pour voir. Relancer l'application ensuite.
2. **Accessibilité** — pour la souris et le clavier.

L'état se vérifie dans **Réglages → Contrôle de l'écran**, qui affiche ce qui
manque et propose un essai de capture.

⚠ Le contrôle de l'écran a besoin d'un **modèle capable de lire une image**
(rôle `gui` ou `vision`). Un modèle de conversation ne voit rien : les outils
d'écran ne lui sont pas proposés. La page Réglages propose l'installation du
modèle adapté à la machine.

⚠ **Fiabilité.** Le meilleur modèle auto-hébergeable réussit moins d'une tâche
d'écran sur deux. À vendre comme une capacité assistée sous approbation, pas
comme une automatisation fiable. Chaque action modifiante demande un accord ;
`requireApproval: false` lève cette demande, à réserver aux démonstrations.

## Éditions

Le produit se livre en plusieurs éditions, pilotées par `edition` dans
`src/config/branding.ts` :

| Édition | Contenu |
|---|---|
| `chat` | Conversation seule (sans Cowork ni Code) |
| `complete` | Toutes les surfaces |

`featureOverrides` permet d'activer ou désactiver un module au cas par cas. Les entrées de
navigation **et** les routes suivent automatiquement.

Autres scripts :

```bash
npm run build             # vérifie l'interface ET la passerelle, puis construit
npm run preview           # sert le build de production
npm run typecheck         # vérification TypeScript, interface et passerelle
npm run typecheck:gateway # passerelle seule (tsconfig.gateway.json)
npm run motdepasse        # redéfinit le mot de passe d'un compte, depuis le poste
```

## Rebrander pour un nouveau client

Tout point de personnalisation client est centralisé. **Aucune marque n'est codée en dur
dans les composants.**

1. **`src/config/branding.ts`** — nom produit, logos, URLs, version, pied de page, contacts.
   Changer ces valeurs suffit à rebrander toute l'application.
   ```ts
   name:    "Helix",                      // nom affiché partout
   logo:  { wordmark, mark, alt },        // visuels importés depuis src/assets/
   urls:  { instance, marketing, releases, dpoEmail, supportEmail },
   version: __HELIX_VERSION__,           // lue dans package.json, ne pas l'écrire
   ```
2. **`src/assets/`** — remplacer les visuels réellement consommés par `branding.ts` :
   - `helix-mark.png` : le mark seul (hélice), affiché au centre de l'accueil et dans la
     barre latérale. C'est le seul visuel affiché par défaut ;
   - `helix-logo.png` : logo complet avec texte, exposé sous `logo.wordmark` mais non
     utilisé par les composants livrés.
   Les marks sont des traces filaires noires sur fond blanc, affichées en
   `mix-blend-multiply` (le blanc disparaît sur les surfaces claires). Un nouveau client
   fournit ses propres visuels.

   **`public/brand/`** contient les visuels servis en fichiers statiques :
   `app-icon-256.png` est l'icône d'onglet référencée par `index.html`, `favicon.svg`
   est disponible mais n'est référencé nulle part. L'icône de l'application empaquetée
   est `build/icon.png`.
3. **`src/styles/tokens.css`** — la palette, la typographie, les rayons, les ombres et les
   espacements. Toutes les couleurs sont des tokens HSL consommés via Tailwind
   (`hsl(var(--token) / alpha)`). **Aucune valeur hexadécimale en dur hors de ce fichier.**

### Charte Helix (par défaut)

| Rôle | Token | Valeur |
|------|-------|--------|
| Primaire (texte, boutons) | `--primary` | `hsl(30 8% 9%)` sombre chaud |
| Fond | `--background` | `hsl(40 22% 97%)` crème |
| Accent (interactif, badges) | `--accent` | `hsl(162 70% 38%)` vert émeraude |
| Info (encarts) | `--info` | `hsl(221 83% 53%)` bleu |
| Police | Satoshi | 300–900 (`public/fonts/satoshi.woff2`) |

## Stack

| Couche | Choix |
|---|---|
| Interface | Vite · React 18 · TypeScript · Tailwind CSS · React Router 7 · icônes `lucide-react` |
| Enveloppe desktop | Electron 33, empaquetage par `electron-builder` |
| Passerelle | Node 22+, HTTP/SSE écrits à la main, SDK MCP, `pg` optionnel |
| Inférence | LM Studio (`lms`) et/ou cluster exo, tout endpoint OpenAI-compatible |
| Agent de code | OpenCode en mode serveur, piloté par la passerelle |
| Persistance | Fichiers JSON chiffrés, ou PostgreSQL |

Aucune librairie de composants lourde côté interface.

## Structure

```
src/
  config/branding.ts        Personnalisation client (point unique)
  styles/tokens.css         Tokens de design (couleurs, typo, rayons…)
  components/
    layout/                 WindowChrome, Sidebar, MainArea, AppLayout, PageHeader
    ui/                     Button, IconButton, Chip, Popover, Modal, Select, Switch,
                            SegmentedTabs, Field, InfoBox, EmptyState, Avatar, Logo…
    chat/                   Composer, ModelPicker, ContextSelectors, MessageList,
                            ShareSessionModal, ScreenAccessChip…
    agents/                 Fiche d'un agent (employé OpenClaw), canaux, « Depuis Helix »
    cowork/                 Panneau Cowork, approbations d'écran, PreparerCowork
    onboarding/             Écran de mise en route (moteur, modèle, progression)
    settings/               Coquille des paramètres, séances et journal, apparence
  pages/                    Une page par écran, plus InstanceSetupPage et LoginPage
  hooks/                    useChat, useModels, useMcp, useComputer, useCode,
                            useTasks, useAgents, useProjects, useProfile,
                            useApparence…
  lib/
    store/                  Comptes, identité, sessions, projets, tâches, agents,
                            profils, apparence, et la synchronisation vers l'instance
    gateway.ts, endpoint.ts Appels à la passerelle, jetons, flux SSE
    taskRunner.ts           Exécution d'une tâche par un agent
    atelier.ts              Atelier bureautique de Cowork, côté interface
    soleil.ts               Lever et coucher du soleil, calculés hors ligne
  data/mock/                Ce qui reste fictif (libellés de comportement des modèles)
gateway/src/                Passerelle : routage par rôle, outils, écran, données,
                            comptes, séances, chiffrement, audit, TLS, plan
                            d'étapes, atelier bureautique, agents OpenClaw,
                            groupes, bibliothèque, réunions
cli/helix.mjs               Ligne de commande « helix » (textes dans cli/textes.mjs)
electron/main.cjs           Processus principal : lance la passerelle, CSP, TOFU TLS
electron/botReunion.cjs     Bot de réunion (fenêtre cachée), et son préchargement
```

L'inventaire écran par écran (correspondance avec les captures de référence) est dans
[`SCREENS.md`](./SCREENS.md).

## Vocabulaire produit

Interface française, accents corrects. Termes retenus : **Chat / Nouveau Chat**,
**Agent** (jamais « Assistant »), **Catalogue** (jamais « Officiel »), **Majordome** pour
l'agent d'orchestration par défaut. Aucun tiret cadratin dans les textes affichés.

## Ce qui fonctionne, et ce qui reste à faire

**Branché sur la passerelle et persistant :**

- Chat : streaming, canal de raisonnement, sélection du modèle, pièces jointes
  (documents et images lus sur le poste, envoyés avec la question), historique des
  conversations, partage d'une conversation ;
- Cowork : boucle d'outils fichiers avec découpage en étapes adapté au modèle,
  choix du dossier de travail, contrôle de l'écran avec approbations, préparation
  de l'atelier bureautique ;
- Code : sessions OpenCode, choix du dossier de projet, flux d'évènements ; pour
  une demande de site, un design professionnel fourni au modèle (palette,
  polices, feuille de style, guide) et les pages remises dessus en fin de tour ;
- Images : « + » > « Créer une image » dans le Chat, sur la machine (Z-Image
  Turbo, FLUX.2 klein 4B, Qwen-Image selon la mémoire, licences Apache 2.0) ;
- Import : archives ChatGPT et Claude, et sans export depuis Claude Code, Codex
  et Cursor installés sur le poste ;
- Extension VS Code (`extensions/vscode/`) : Chat, Helix Code sur le dossier
  ouvert, expliquer ou améliorer une sélection ;
- **Bases de connaissances** (RAG, 25/09/2026) : dans Fichiers, onglet « Bases de
  connaissances », on rassemble des documents que l'instance indexe sur la machine
  (modèle d'embeddings de LM Studio, index chiffrés). Un Chat qui a des bases (celles
  de l'agent, du projet, ou cochées dans la pastille « Connaissances ») répond à partir
  des passages trouvés et cite ses sources sous la réponse ; chacun n'y lit que les
  documents qu'il voit dans Fichiers. Essayé de bout en bout dans l'interface ; Cowork
  avec des bases et de vrais PDF ne l'ont pas été. Les employés OpenClaw les
  consultent aussi, dans ce qui est ouvert à toute l'équipe seulement ;
- **Ligne de commande `helix`** (25/09/2026) : Chat et Helix Code dans un terminal,
  avec les outils et la barrière d'approbation de l'instance (voir « Ligne de
  commande » plus haut). Pas encore livrée avec l'application empaquetée ; les
  connecteurs n'atteignent pas encore Helix Code (limite de l'API actuelle
  d'OpenCode), seulement `helix chat --outils` ;
- **Entraîner un modèle** (Paramètres, 25/09/2026) : apprendre à un petit modèle
  ouvert (Qwen3, Apache 2.0) les faits de son organisation à partir d'exemples, le
  comparer au modèle de départ, puis l'installer dans LM Studio. Vérifié de bout en
  bout sur un Mac à puce Apple de 16 Go (MLX-LM) ; le chemin des cartes NVIDIA (QLoRA)
  est écrit mais n'a jamais été essayé sur une vraie machine, et l'écran le dit. Le
  modèle installé est visible de toute l'instance ;
- Projets, Agents, Tâches : création, persistance, partage, et exécution d'une tâche
  par un agent avec avancement du Kanban et trace des outils ; des cartes qui
  s'enchaînent (une carte attend les autres, part d'elle-même après elles et reçoit
  leurs comptes rendus). Un chat se range dans
  un projet (classement personnel, sans partage) ; les tâches ont une échéance et un
  projet, des vues Boîte de réception, Mes tâches, Aujourd'hui, À venir et par
  projet, un filtre (statut, priorité, agent) et un tri (échéance, priorité, mise à
  jour) ;
- Comptes, connexion, séances révocables, **double authentification**, journal
  d'audit consultable dans Paramètres → Sécurité ;
- Paramètres → **Confidentialité** : export RGPD de toutes ses données en JSON ;
- Paramètres → **Connecteurs** : courrier en IMAP, agenda en CalDAV, Notion et
  serveurs MCP du catalogue ;
- la barrière d'approbation des actions de Cowork ;
- Paramètres → **Mon usage** : jetons exacts lus dans la réponse de chaque
  moteur, par modèle et par jour, coût à 0 € pour un modèle local et à
  renseigner pour un modèle distant ;
- Paramètres → **Profil** : nom et adresse enregistrés ; changer d'adresse exige
  le mot de passe actuel et n'hérite d'aucune invitation ;
- Paramètres → **Préférences** : apparence, et formats de date et d'heure
  appliqués partout où une date s'affiche ;
- **dictée** : bouton micro du composer, transcription par Whisper sur la
  machine, installée sur demande ;
- **suggestions de l'accueil** : chacune mène à un écran réel ou pose au Chat une
  question qu'il sait traiter ;
- Paramètres → **Contrôle de l'écran** (activable depuis l'interface sur un poste
  autonome), Personnalisation de l'IA ;
- Paramètres → **Connecteurs** : Google Drive et Slack en lecture seule (jamais
  éprouvés contre les vrais services) ;
- Paramètres → Préférences, **À propos** : mise à jour de l'application depuis le
  serveur de l'agence, automatique une fois l'application signée ;
- **Agents** toujours actifs (OpenClaw) : missions à heure fixe ou à chaque mail
  reçu, messageries, documents de référence, installation et mise à jour depuis la
  page ;
- **Groupes**, **Bibliothèque** (documents chiffrés, recherche dans le contenu),
  **Réunions** (micro, import, bot Google Meet, transcription et compte rendu sur la
  machine), Paramètres → **Bot Recorder** ;
- Paramètres → **Profil** : photo de profil ;
- la **cloche de notifications** et l'**aide intégrée** de la barre latérale (0.22.0) ;
- l'**archivage** des chats, à côté de leur suppression (0.22.0) ;
- le branchement d'un service **en un clic** : « Se connecter », autorisation dans
  votre navigateur, sans jeton à trouver ni tiers en travers (0.22.0) ;
- **« Rester connecté sur ce poste »** à la connexion, et un rôle d'administrateur
  pour la vue d'ensemble du journal d'activité (0.23.0) ;
- l'**invitation d'un collègue** par mail : il reçoit un code, rattache son poste,
  ouvre son compte et choisit son propre mot de passe (0.23.0) ;
- l'**ouverture de l'instance depuis l'écran** : un interrupteur sous mot de passe,
  dans Paramètres → Profil, au lieu d'un fichier JSON à éditer (0.23.0) ;
- le **lien d'invitation** : le mail porte un lien qui ouvre l'application avec
  l'adresse et le code déjà remplis. Le lien reste collable dans le champ
  d'adresse, et le mail garde les deux lignes à saisir à la main (0.24.0) ;
- les **chemins d'accès nommés** : les adresses de la machine sont rangées entre
  « même réseau » et « réseau privé », ce dernier détecté quand un tunnel (VPN,
  Tailscale, WireGuard) est monté sur la machine (0.24.0) ;
- les **compétences** : des procédures écrites en français, une fois, que le modèle
  applique quand la situation s'y prête. Panneau Cowork → Procédures. Elles
  valent aussi dans le Chat et pour les tâches exécutées par un agent, se
  partagent à l'organisation, et l'écran dit combien de caractères partent
  réellement au modèle à chaque message (0.24.0) ;
- **Cowork sur tout le poste** : « Tout mon poste » ouvre le dossier personnel
  et les disques montés d'un coup, au lieu d'un dossier à choisir avant chaque
  demande. Les dossiers du système restent fermés, l'ouverture large redemande
  le mot de passe, et la barrière d'approbation continue de demander avant
  chaque modification (0.24.0) ;
- **« Se connecter avec Google / Microsoft »** pour le courrier : une boîte
  Workspace ou M365 se branche sans mot de passe d'application ni serveur à
  saisir. Demande une préparation unique par l'administrateur de
  l'organisation ; un compte personnel garde le mot de passe d'application, et
  l'écran le dit (0.24.0) ;
- **trois langues** : français, anglais, chinois. Le choix se fait dans
  Réglages, Préférences, vaut pour ce poste, et recharge la page pour que tout
  change d'un coup. 1 842 phrases en 0.25.0 ; le 25/09/2026, 2 301 dans
  l'interface et 650 dans la passerelle, traduites à 100 % dans les deux langues
  (`npm run i18n` le mesure). Ce que vous écrivez n'est jamais traduit (0.25.0) ;
- **Paramètres → Abonnement** : l'offre d'hébergement des modèles, quatre
  formules, avec ce qu'elles comprennent. Éteinte par défaut en marque blanche.
  Aucun paiement n'y est branché, et l'écran le dit (0.24.0).

**Encore annoncé sans fonctionner, et marqué comme tel à l'écran :**

- **Paramètres → API développeur** (clés d'API) ;
- le téléchargement direct des applications ;
- **Composio** : écarté par défaut (voir `PROJET.md` § 3.5). Aucun code ne s'y
  connecte.

Le bot de réunion n'a pas encore été éprouvé dans une vraie réunion Google Meet (il
l'a été face à une réunion simulée, avec le vrai code).

L'inventaire complet, écran par écran, est dans [`SCREENS.md`](./SCREENS.md).

## Accessibilité

Contraste suffisant, navigation clavier, focus visible, `aria-label` sur les boutons à
icône seule, `role` appropriés sur menus/dialogues. L'animation du logo respecte
`prefers-reduced-motion`.
