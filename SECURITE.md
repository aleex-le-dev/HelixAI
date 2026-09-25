# Sécurité de Helix

État au 21/09/2026 (0.25.0). Ce document dit ce qui est protégé, **et ce qui ne l'est
pas**. Chaque affirmation renvoie au fichier qui la porte, pour qu'un auditeur
puisse la vérifier lui-même plutôt que de nous croire.

La dernière passe complète, ses vingt-trois trouvailles et ce qui en restait ouvert
sont au § 17 ; ce qui a été fermé depuis, au § 18 ; la surface ajoutée par les liens
`helix://` de la 0.24.0, au § 19 ; et le jeton d'instance retiré du dossier de
travail, au § 20. Les surfaces ajoutées le 24/09/2026 sont au § 21, celles du
25/09/2026 (images des Chats partagés, bases de connaissances, entraînement,
ligne de commande et outils de Code) au § 22.

---

## 1. Deux niveaux d'authentification

C'est le point le plus important du produit, et le plus souvent mal compris.
Helix distingue deux questions.

| Question | Réponse | Fichier |
|---|---|---|
| Cette machine a-t-elle le droit de parler à l'instance ? | **Jeton d'instance** | `gateway/src/auth.ts` |
| Qui parle, exactement ? | **Séance utilisateur** | `gateway/src/usersession.ts` |

Le jeton est commun à tout le parc. Il ouvre la porte, il ne nomme personne. La
séance nomme la personne, expire, et se révoque une par une. Une action qui
engage quelqu'un exige donc les deux.

### 1.1 Jeton d'instance

`gateway/src/auth.ts`.

- Créé au premier démarrage : 24 octets aléatoires (`randomBytes(24)`), encodés
  en base64url.
- Rangé dans `<HELIX_DATA_DIR>/instance-token`, permissions `0600`.
  `HELIX_TOKEN` impose une valeur, `HELIX_TOKEN_FILE` change l'emplacement.
- Comparé à **durée constante** (`timingSafeEqual`), après contrôle de longueur.
  Le temps de réponse ne renseigne donc pas sur le préfixe correct.
- Présenté en en-tête `Authorization: Bearer`, ou en paramètre `?token=` pour
  les flux d'évènements (le navigateur n'autorise pas d'en-tête sur
  `EventSource`).
- **Toute route l'exige**, sauf `GET /` et `GET /health`, et sauf les requêtes
  `OPTIONS` (préparation CORS du navigateur).

`GET /health` sans jeton ne renvoie que la présence du service et le nombre de
modèles. Backends, profil client et modèles imposés n'apparaissent qu'avec un
jeton valide (`handleHealth`, `gateway/src/index.ts`).

L'application de bureau lit le jeton sur le disque : sur son propre poste,
l'utilisateur n'a rien à saisir. Un poste rattaché le reçoit de
l'administrateur, avec l'adresse.

### 1.2 Séance utilisateur

`gateway/src/usersession.ts`.

- Ouverte à la connexion (`POST /helix/auth/verify`). Jeton de 32 octets
  aléatoires, rendu **une seule fois**.
- Seule l'**empreinte SHA-256** du jeton est conservée. Le jeton lui-même
  n'est jamais écrit.
- Expiration **glissante de 12 heures**, prolongée à l'usage, avec un **plafond
  absolu de 30 jours** au-delà duquel la séance meurt même si elle sert en
  permanence.
- La prolongation n'est écrite sur disque qu'une fois par minute au plus : la
  résolution d'une séance est sur le chemin de chaque requête.
- Comparaison à durée constante sur chaque candidat, comme pour le jeton.
- L'utilisateur voit ses séances sous un identifiant court (12 caractères de
  l'empreinte), jamais le jeton.
- Révocation une par une (`revokeSession`) ou en bloc (`revokeAll`), depuis
  Réglages, Sécurité.
- Toute mutation passe par une file d'attente qui relit l'état courant. Sans
  elle, une connexion qui s'intercalait entre la lecture et l'écriture
  ressuscitait des séances qu'on venait de révoquer.
- Les séances vivent dans la collection interne `authSessions`
  (`gateway/src/db.ts`), **jamais exposée** par les routes de synchronisation.
- Présentée en en-tête `X-Helix-Session`, ou en paramètre `?session=` pour les
  flux.

### 1.3 Routes qui exigent une séance

Deux mécanismes cohabitent, et c'est voulu.

**a) Barrière commune, posée avant le routage** (`gateway/src/index.ts`, table
`EXECUTION` et fonction `exigeSeance`). Elle couvre les routes qui **font agir**
l'instance : exécuter des outils sur les fichiers, piloter l'agent de code,
installer un logiciel, charger un modèle. Elle est appliquée avant le routage
pour qu'une route ajoutée plus tard ne puisse pas l'oublier par omission.

Contenu exact de la table, dans l'ordre du code :

| Méthode | Chemin |
|---|---|
| `POST` | `/helix/models/load` |
| `POST` | `/helix/provision/moteur` |
| `POST` | `/helix/provision/start` |
| `POST` | `/helix/mcp/toggle` |
| `POST` | `/helix/mcp/workspace` |
| `POST` | `/helix/code/session` |
| `POST` | `/helix/code/prompt` |
| `POST` | `/helix/code/interrupt` |
| `GET` | `/helix/computer/events` |
| `GET` | `/helix/code/events` |
| `POST` | `/helix/atelier/preparer` |
| `POST` | `/helix/atelier/verifier` |
| `POST` | `/helix/dictee/installer` |
| `POST` | `/helix/dictee` |
| `POST` | `/helix/approbation/niveau` |
| `POST` | `/helix/approbation/repondre` |
| `POST` | `/helix/computer/mode` |
| `POST` | `/helix/courrier/configurer` |
| `POST` | `/helix/courrier/envoi` |
| `POST` | `/helix/courrier/oublier` |
| `POST` | `/helix/agenda/configurer` |
| `POST` | `/helix/agenda/oublier` |
| `POST` | `/helix/drive/connecter` |
| `POST` | `/helix/drive/code` |
| `POST` | `/helix/drive/oublier` |
| `POST` | `/helix/slack/configurer` |
| `POST` | `/helix/slack/oublier` |
| `POST` | `/helix/connecteurs/ajouter` |
| `POST` | `/helix/connecteurs/retirer` |
| `GET` | `/helix/usage` |
| `POST` | `/helix/usage/tarif` |
| `POST` | `/helix/auth/profil` |
| `POST` | `/helix/openclaw/installer` |

Trente-deux routes, recopiées du code et revérifiées le 14/09/2026. S'y ajoutent des
**préfixes entiers**, appliqués par la même barrière :

| Préfixe | Fonction | Depuis |
|---|---|---|
| `/helix/employes` | `routeEmploye` : déployer, modifier, retirer un agent, lui parler, ses échanges, son activité, ses missions, ses canaux, ses documents | 0.11.0 |
| `/helix/fournisseurs` | `routeFournisseur` : clés de modèles cloud (§ 15) | 0.12.0 |
| `/helix/espace`, `/helix/espace/fichier` | `routeEspace` : parcourir et relire le dossier de l'équipe (« Depuis Helix », § 16.4) | 0.16.0 |
| `/helix/groupes` | `routeGroupe` (§ 16.1) | 0.16.0 |
| `/helix/bibliotheque` | `routeBibliotheque` (§ 16.2) | 0.16.0 |
| `/helix/reunions` | `routeReunion` (§ 16.3) | 0.16.0 |

Seule exception, le serveur d'outils `/helix/employes/<id>/outils`, appelé par
l'instance OpenClaw sans séance et protégé par sa propre clé (§ 14). Les deux flux d'évènements y figurent
depuis septembre 2026 : le jeton seul ne permet plus d'observer ce que fait
l'agent (voir § 1.5). `GET /helix/usage` y figure aussi : la consommation d'une
personne ne se lit qu'avec sa propre séance.

**b) Contrôle dans le gestionnaire lui-même**, quand la route a besoin de
*savoir qui* et pas seulement *qu'il y a quelqu'un*. Le gestionnaire appelle
`demandeur()`, qui résout la séance puis retrouve le compte :

| Route | Pourquoi |
|---|---|
| `GET /helix/data/<collection>` | Le filtrage dépend de l'identité. Exception : `accounts`, lisible sans séance mais **expurgé** de toute empreinte et de tout sel. C'est l'écran de connexion qui la demande, avant qu'une séance existe |
| `PUT /helix/data/<collection>` | La fusion ne retient que ce que la personne a le droit de toucher. `accounts` est refusé en **403** |
| `GET /helix/audit` | Le journal dit qui s'est connecté et quand |
| `GET /helix/auth/sessions`, `POST /helix/auth/revoke` | On ne liste et on ne ferme que ses propres séances |
| `POST /helix/auth/create` | Le **premier** compte se crée sans séance, il faut amorcer l'instance. Ensuite, créer un compte exige une séance. **Un mot de passe de 10 caractères au moins est exigé dans tous les cas**, amorçage compris |
| `GET /helix/auth/deux-facteurs/etat`, `POST /helix/auth/deux-facteurs/preparer`, `/activer`, `/desactiver`, `/codes` | Réglage du second facteur de la personne connectée, et d'elle seule. Toute modification redemande le mot de passe (§ 2.1) |
| `GET /helix/export` | Export RGPD : le compte est celui de la séance, il n'existe aucun moyen d'exporter les données d'un collègue (§ 7.1) |
| `GET /helix/compte/effacement`, `POST /helix/compte/effacer` | Suppression de son propre compte, sous mot de passe et code (§ 7.2) |
| `GET /helix/dossiers` | Parcourir le disque pour choisir où l'agent travaille |
| `POST /helix/computer/action` | Une action d'écran doit être rattachée à quelqu'un |
| `POST /helix/computer/approve` | Approuver engage une personne, le journal doit pouvoir la nommer |
| `POST /helix/mcp/workspace` | Contrôlée deux fois : par `EXECUTION` et dans le gestionnaire, qui a besoin de l'identité pour la trace |

**Routes de connexion, au jeton seul par nature** (la personne n'a pas encore
de séance) : `POST /helix/auth/verify`, `POST /helix/auth/premier-mot-de-passe`
(une seule fois par compte, § 2), `POST /helix/auth/deux-facteurs` (exige le
défi remis par `verify`, § 2.1), `POST /helix/auth/deux-facteurs/inscription` et
`…/inscription/activer` (instance qui impose le second facteur : exigent le défi
d'inscription remis après le mot de passe).

**Routes accessibles avec le seul jeton d'instance** : `GET /v1/models`,
`GET /helix/models`, `GET /helix/provision`, `GET /helix/provision/stream`,
`GET /helix/data` (révisions), `GET /helix/data/accounts` (expurgé),
`GET /helix/code`, `GET /helix/computer`, `GET /helix/atelier`, `GET /helix/mcp`,
`GET /helix/courrier`, `GET /helix/agenda`, `GET /helix/drive`, `GET /helix/slack`,
`GET /helix/connecteurs`,
`GET /helix/outils`, `GET /helix/approbation`. Ce sont des états, jamais des
contenus : ils disent si un service est configuré, pas ce qu'il contient.

`GET /helix/data` reste au jeton seul **volontairement** : c'est ce que la
synchronisation interroge avant la connexion, pour peupler l'écran de
connexion. Elle n'expose que des horodatages d'écriture par collection, donc de
l'activité, jamais du contenu.

### 1.4 Conversation avec outils

`handleChat`, `gateway/src/index.ts`.

Une même route, `POST /v1/chat/completions`, sert deux usages qui n'engagent pas
la même chose.

| Requête | Séance | Pourquoi |
|---|---|---|
| Conversation simple | **non** | C'est le point d'entrée compatible OpenAI. OpenCode et tout client tiers l'utilisent, et ils exécutent leurs propres outils chez eux. L'instance ne fait que relayer du texte vers le moteur d'inférence |
| `tools: true` | **oui** | L'appelant demande à *l'instance* d'agir : lire et écrire des fichiers, piloter l'écran. Cela engage une personne, et le journal doit pouvoir la nommer |

Le refus est explicite : « Faire agir l'agent sur vos fichiers ou votre écran
demande une séance ouverte. »

Le cas `tools: [...]` (tableau au format OpenAI standard) reste un simple relais :
la passerelle n'exécute rien, c'est le client qui tient la boucle
(`gateway/src/chat.ts`).

**L'identité est transmise à la boucle d'outils.** `handleChat` résout la séance
sur **chaque** requête, y compris une conversation simple, et passe l'identifiant
du compte à `handleChatRequest`. Chaque appel d'outil est donc journalisé sous ce
compte (`journaliser("outil.appele", qui ?? "agent", …)`). Le repli sur `agent`
ne concerne qu'un appel sans séance, cas qui ne peut pas se produire avec
`tools: true`.

---

### 1.5 Failles trouvées en audit, et fermées

Chacune a été **démontrée** par un essai avant d'être corrigée, puis vérifiée
fermée par le même essai. Elles sont consignées ici parce qu'un défaut corrigé
sans trace finit toujours par revenir.

| Défaut | Ce qu'il permettait | Correction |
|---|---|---|
| Serveur OpenCode sans authentification | Tout programme du poste pilotait l'agent de code : lecture, écriture, commandes | Mot de passe aléatoire tiré à chaque démarrage, en HTTP Basic. `opencode.json`, qui porte le jeton d'instance, passé en droits 600 (`gateway/src/opencode.ts`) |
| Casse ignorée dans les dossiers interdits | `/system` accepté là où `/System` était refusé, sur un système de fichiers insensible à la casse. Démontré jusqu'à enraciner le serveur de fichiers sur `/etc` | Comparaison sur une forme repliée, et refus d'un dossier qui en **contient** un interdit (`/private`, `/Library`) |
| Traversée de chemin sur `GET /helix/audit?jour=` | Lire n'importe quel fichier `.jsonl` du disque | `jour` n'est retenu que s'il a la forme `AAAA-MM-JJ` (`gateway/src/audit.ts`) |
| Corps de requête sans borne | 400 Mo envoyés faisaient passer la passerelle de 108 à 1196 Mo | Lecture coupée à 32 Mo |
| Amplification de processus | 40 requêtes sur `GET /helix/code` lançaient 40 processus enfants | Localisation mémorisée, une recherche en cours sert tous les appelants |
| `PUT /helix/data/*` en erreur 500 | Le message d'exception interne était renvoyé au client | Entrées mal formées écartées, échec fermé |
| Promesses rejetées non capturées | Arrêt complet de la passerelle | `.catch` sur les chaînes lancées sans attente |
| **Bouton « refuser » qui approuvait** | Le code lisait `accord !== false` : tout ce qui n'était pas exactement `false` valait approbation. Mesuré : un refus envoyé sous un autre nom de champ a laissé l'agent écrire, et le journal a inscrit une approbation | Seul un `true` explicite autorise, sur les deux routes d'approbation (écran et outils) |
| Flux d'évènements au jeton seul | `computer/events` livrait le texte que l'agent devait saisir, mot de passe compris ; `code/events` démarrait OpenCode | Séance exigée sur les deux ; `code/events` ne démarre plus rien |
| En-têtes de sécurité absents des flux | Aucun des cinq flux ne les portait, et celui de la conversation figeait `Access-Control-Allow-Origin: *` | Tous passent par `entetesFlux` (`gateway/src/entetes.ts`) |
| Origine ouverte à tous | N'importe quelle page du navigateur lisait les réponses si elle détenait le jeton | Origine restreinte à `file://`, à la boucle locale et à l'hôte de l'instance |
| Fuite par un serveur MCP enfant | Un serveur recopiant sa configuration déposait son jeton en clair sur la sortie d'erreur de la passerelle | Secrets masqués dans la sortie d'erreur et dans les messages |
| **`HELIX_GATEWAY_HOST` vide** (0.27.0) | `listen(port, "")` n'écoute pas « nulle part » mais **partout** ; la passerelle, qui tient "" pour local, ne chiffrait pas. Démontré : joignable en clair par l'adresse réseau du poste | Une valeur vide vaut « absente » : boucle locale. Vérifié par la batterie, qui tente la connexion par l'adresse réseau (`gateway/src/config.ts`) |
| En-tête de langue refusé par CORS (0.26.0) | L'en-tête `X-Helix-Langue` manquait à `Access-Control-Allow-Headers` : un poste rattaché voyait **toutes** ses requêtes refusées par son navigateur | Ajouté ; tout nouvel en-tête de l'écran doit y figurer |

Et une faille **de structure**, la plus sournoise : `tsconfig.json` ne couvrait que
`src`. Les vingt-huit fichiers de la passerelle, dont l'authentification, le
chiffrement et le journal, **n'étaient vérifiés par aucune compilation**.
`npm run build` contrôle désormais les deux (`tsconfig.gateway.json`).

**Principe qui s'en dégage** : un contrôle de sécurité qui ne comprend pas ce
qu'on lui demande **refuse**. Il n'accepte jamais par défaut.

**La batterie de sécurité** (`npm run securite`, 0.27.0). Elle démarre une
instance jetable et l'attaque de l'extérieur : 66 vérifications à sa création,
125 le 25/09/2026 (toutes réussies ce jour-là), chacune
disant ce qu'elle attend et ce qu'elle a obtenu — routes sans jeton et sans
séance, compte ouvert sans invitation, mot de passe trop court, énumération des
comptes, force brute freinée, mots de passe et jetons absents du disque et du
journal, billets à usage unique, origine étrangère, en-têtes, chemins détournés
vers `/etc/passwd` ou `~/.ssh`, fin de séance, écoute réseau. Une relecture
rate les oublis précisément parce qu'ils sont absents ; une batterie qui
frappe à chaque porte ne les rate pas. Elle se rejoue avant chaque version.

**Les dépendances.** `npm audit --omit=dev` : zéro vulnérabilité connue dans ce
qui est livré (cinq corrigées en 0.27.0, dans le SDK MCP et le module de mise
à jour, sans saut de version majeure).

### 1.6 Changer d'adresse email sans hériter d'invitations

`POST /helix/auth/profil`, `gateway/src/accounts.ts`, fonction `modifierProfil`.

L'adresse d'un compte n'est pas une simple information : **c'est elle qui
rattache les invitations en attente**. Un projet ou une conversation partagé
avec une adresse qui n'a pas encore de compte est accordé, côté instance, à
quiconque porte cette adresse. Permettre de changer d'adresse rouvrait donc une
prise de compte : prendre l'adresse d'une collègue invitée, et voir ce qui lui
était destiné.

Les protections, dans l'ordre où elles s'appliquent :

1. Seul son propre compte se modifie : viser celui d'un autre est refusé (403).
2. Le **mot de passe actuel** est exigé si le compte en a un, et vérifié
   **avant** l'unicité de l'adresse : sans cela, une séance volée servirait au
   moins à sonder quelles adresses existent sur l'instance. Les tentatives
   comptent pour le blocage, comme à la connexion.
3. L'adresse doit être valide et libre (409 si un compte la porte).
4. **L'adresse devient « déclarée »** (`adresseDeclareeLe`). Une adresse déclarée
   ne rattache plus aucune invitation : `adresseDePartage` la remplace, pour le
   cloisonnement, par une valeur qui ne correspond à rien.

Vérifié par l'attaque elle-même : Alice invite `carole@…` sur un projet ; Robert
prend cette adresse ; il ne voit rien. Il pousse alors une version du projet où
il s'inscrit comme membre actif : la passerelle la **refuse** (`refuses: 1`) et
le projet reste intact.

### 1.7 Dictée

`gateway/src/dictee.ts`, `electron/main.cjs`.

**Le son ne quitte pas le poste.** La reconnaissance vocale intégrée au
navigateur n'est jamais utilisée : dans Chromium, donc dans Electron, elle
envoie l'audio aux serveurs de Google. La transcription est faite par Whisper,
exécuté sur la machine. Vérifié en observant le processus de transcription :
**zéro connexion réseau**. Trois verrous dans le code : mode hors ligne de la
bibliothèque de modèles, interpréteur Python isolé, modèle chargé depuis un
dossier et jamais depuis un nom de dépôt.

**Seul le micro est accordé.** L'application refusait toutes les permissions du
navigateur ; elle accorde désormais l'audio, et rien d'autre : pas la caméra, ni
la localisation, ni les notifications. Une demande qui réclame audio **et**
vidéo est refusée en entier. Elle doit venir de la fenêtre de l'application
elle-même, sur sa propre page.

**Surface réduite.** Le format du son est reconnu à ses premiers octets, et
seuls cinq formats passent (WebM, Ogg, MP4, WAV, AIFF) : chaque décodeur de plus
est une surface d'attaque. Taille bornée à 8 Mo. Le fichier temporaire est
supprimé après la transcription, qu'elle réussisse ou échoue (vérifié).

**Installation sur accord explicite** (`accord: true`, contrôlé par la
passerelle), avec la taille et la provenance annoncées avant : paquet depuis
PyPI, modèle depuis Hugging Face. La révision du modèle est épinglée : le même
dépôt ne peut pas changer de poids entre deux installations. La précaution a
déjà servi : le dépôt que la bibliothèque associe à `large-v3-turbo` redirige
aujourd'hui vers un autre propriétaire.

### 1.8 Consommation

`gateway/src/usage.ts`. Les jetons sont lus dans la réponse de chaque moteur,
jamais inventés. Une mesure estimée est marquée comme telle. `GET /helix/usage`
ne rend que la consommation du demandeur, identifié par sa séance : aucun
paramètre ne permet de lire celle d'un collègue (vérifié). Modifier un tarif
exige une séance et laisse une trace (`tarif.modifie`).

## 2. Mots de passe

`gateway/src/accounts.ts`.

- **PBKDF2-SHA256, 210 000 itérations**, clé de 32 octets, **sel de 16 octets
  tiré au hasard par compte**.
- **Comparaison à durée constante** (`timingSafeEqual`) sur les empreintes.
- **Le traitement est entièrement côté instance.** L'empreinte et le sel ne
  sont jamais transmis à un poste : `toPublic()` les retire, et la liste des
  comptes ne porte qu'un booléen `hasPassword`. Sans cela, chaque poste
  recevrait les empreintes de tous ses collègues et pourrait les attaquer hors
  ligne.
- L'écriture directe de la collection `accounts` est **refusée en 403** : un
  poste ne peut ni remplacer la liste, ni effacer les empreintes.

**Blocage après échecs répétés.** PBKDF2 ralentit une attaque, il ne l'empêche
pas. Un compteur en mémoire s'y ajoute :

- **5 échecs** verrouillent le compte ;
- durée : `60 s × 2^(échecs − 5)`, plafonnée à **15 minutes**. Soit 1 min, puis
  2, 4, 8, puis 15 ;
- un succès remet le compteur à zéro ;
- chaque refus et chaque blocage laissent une trace d'audit.

⚠ Le compteur vit **en mémoire**, pas sur disque : redémarrer la passerelle le
remet à zéro. Il freine une attaque en ligne, il ne survit pas à un
redémarrage.

**Plus aucun compte sans mot de passe, pas même le premier** (depuis 0.9.0).
Jusque-là, le premier compte d'une machine pouvait s'en passer et s'ouvrait par
simple sélection. C'était une faille dès que l'instance est partagée : la liste
des comptes se lit avec le seul jeton d'instance, donc ce jeton suffisait à
prendre l'identité du titulaire. Désormais :

- `creerCompte` refuse toute création sans mot de passe, amorçage compris ;
- **10 caractères minimum**, 1 024 au plus, sans règle de composition (elles
  poussent vers « Motdepasse1! » sans rien gagner ; la longueur, elle, compte).
  La règle est une constante unique (`MOT_DE_PASSE_MIN`), partagée par la
  création, le premier mot de passe et l'outil de récupération ;
- un compte **créé avant la règle** ne s'ouvre plus par sélection :
  `POST /helix/auth/verify` répond **409** `mot-de-passe-a-definir`, sans séance.
  L'écran de connexion bascule sur le choix du premier mot de passe
  (`POST /helix/auth/premier-mot-de-passe`), qui ouvre la séance.

Exposition de cette route, pesée : elle est accessible au jeton seul, comme la
connexion, puisque la personne n'a pas encore de séance. Quiconque tient le
jeton pourrait donc poser le mot de passe à la place du titulaire. Avant, cette
même personne **ouvrait directement une séance** sur le compte ; la fenêtre
n'est pas plus large, et elle **se ferme définitivement au premier usage**
(409 `mot-de-passe-deja-defini` ensuite, trace `motdepasse.defini`). En cas de
litige, l'outil de récupération tranche depuis le poste.

**Récupération.** Il n'y a pas de « mot de passe oublié » par courriel :
l'instance n'envoie pas de courrier. L'autorité est la possession du poste et de
son trousseau. L'outil de récupération redéfinit un mot de passe, ou retire la
double authentification d'un compte qui a perdu téléphone et codes de secours.
Aucune route HTTP n'y mène. Il est **embarqué dans l'application** depuis 0.9.0
(`dist-gateway/motdepasse.cjs`) et tourne avec le binaire de l'application,
sans Node installé :

```
ELECTRON_RUN_AS_NODE=1 "/Applications/<Nom>.app/Contents/MacOS/<Nom>" \
  "/Applications/<Nom>.app/Contents/Resources/dist-gateway/motdepasse.cjs"
```

Depuis les sources : `npm run motdepasse`. La saisie ne s'affiche pas et le mot
de passe n'est jamais passé en argument (il resterait dans l'historique et la
liste des processus).

### 2.1 Double authentification (TOTP)

`gateway/src/totp.ts`, `gateway/src/accounts.ts`, écran
`src/components/settings/DeuxFacteurs.tsx`.

**Format : TOTP (RFC 6238 sur HOTP, RFC 4226)**, SHA-1, 6 chiffres, pas de
30 s : ce que lisent toutes les applications, y compris celles qui n'envoient
rien à personne (Aegis, 2FAS, KeePassXC, Mots de passe d'Apple). Aucun service
tiers, aucune dépendance : le calcul tient dans `node:crypto`. SHA-1 n'est pas
une faiblesse ici (ses collisions ne donnent rien dans un HMAC), et les
variantes SHA-256 sont ignorées en silence par une partie des applications, qui
afficheraient alors des codes faux. Vérifié contre les vecteurs officiels des
deux RFC.

**Activation, en trois temps**, le second facteur n'étant exigé qu'au bout du
troisième (quelqu'un qui abandonne n'est jamais enfermé dehors) :

1. `POST /helix/auth/deux-facteurs/preparer` : **mot de passe redemandé**, même
   avec une séance. Une séance oubliée ouverte ne doit pas suffire à activer le
   second facteur avec le téléphone d'un autre. Tire un secret de 160 bits,
   rangé « en attente » un quart d'heure au plus ;
2. le poste affiche le QR code, **calculé sur le poste** (`src/lib/qr.ts`,
   encodeur écrit ici, sans bibliothèque ni service de génération d'image :
   c'est la dernière chose à confier à un tiers). Toujours noir sur blanc,
   même en thème sombre. Vérifié par décodage réel : neuf tailles décodées à
   l'identique par CoreImage, et le rendu du composant dans l'application relu
   par le détecteur natif du navigateur ;
3. `POST /helix/auth/deux-facteurs/activer` : un premier code juste prouve que
   l'application a bien enregistré le secret. Dix **codes de secours** sont
   remis, **une seule fois**.

**Connexion.** Mot de passe juste et second facteur actif : `verify` répond
401 `deux-facteurs-requis` avec un **défi** (aléa de 192 bits), sans séance.
`POST /helix/auth/deux-facteurs` échange le défi et un code contre la séance.

| Règle | Pourquoi |
|---|---|
| Tolérance d'un pas avant et après | Une horloge de téléphone qui dérive de quelques secondes ne doit pas bloquer quelqu'un |
| **Un pas ne sert qu'une fois** (`dernierPas`) | Un code regardé par-dessus l'épaule, intercepté ou rejoué ne rouvre rien |
| Défi valable 5 minutes, à usage unique | Il prouve le mot de passe ; il ne doit pas devenir un second mot de passe |
| **5 codes faux par défi**, puis retour au mot de passe | Borne l'essai au hasard |
| Les échecs de code comptent dans le **même verrouillage** que les mots de passe | Sinon on alternerait mot de passe juste et codes au hasard sans jamais être bloqué |
| Le mot de passe juste **ne remet pas** le compteur à zéro quand un code est attendu | Même raison ; seul le code accepté le remet à zéro |
| Comparaisons à durée constante, fenêtre parcourue en entier | La durée ne dit pas quel pas a correspondu |

**Codes de secours.** Dix codes de dix caractères (alphabet sans ambiguïté :
ni 0/o, ni 1/l/i ; environ 49 bits), chacun utilisable une fois. L'instance
n'en garde que l'**empreinte PBKDF2** salée : même avec le magasin déchiffré en
main, on ne les relit pas. Casse et tirets indifférents à la saisie. Une
nouvelle série (`/deux-facteurs/codes`, mot de passe **et** code exigés) annule
l'ancienne aussitôt.

**Retrait** : `/deux-facteurs/desactiver`, mot de passe **et** code (ou code de
secours). Pour qui a tout perdu : l'outil de récupération, depuis le poste
(voir plus haut), trace `deuxfacteurs.desactive` avec `par: "outil local"`.

Ce qui ne sort jamais de l'instance : le secret, les empreintes des codes, le
dernier pas. La liste des comptes ne porte qu'un booléen `deuxFacteursActive`.
Le journal consigne `connexion.second_facteur_demande`, `deuxfacteurs.active`,
`deuxfacteurs.desactive`, `deuxfacteurs.codes_regeneres`, et le facteur utilisé
à chaque connexion (`application` ou `code de secours`, avec le nombre restant),
jamais un secret ni un code.

Vérifié de bout en bout sur une passerelle jetable (40 essais, rejoués sur le
paquet compilé) : création sans mot de passe ou trop courte refusée, compte
ancien 409 puis premier mot de passe une seule fois, activation, rejeu du code
d'activation refusé, défi réutilisé refusé, code de secours à usage unique,
régénération qui annule l'ancienne série, désactivation, cinq codes faux qui
épuisent le défi puis verrouillent le compte, et aucun secret dans le journal
ni en clair dans le dossier de données.

⚠ Les défis vivent **en mémoire** : un redémarrage de l'instance les annule
tous, ce qui ne coûte qu'une nouvelle saisie du mot de passe.

**Imposer le second facteur à toute l'instance** (depuis 0.10.0) :
`"deuxFacteursObligatoire": true` dans `helix.config.json`.

- Mot de passe juste, compte sans second facteur : `verify` répond 401
  `deux-facteurs-a-activer` avec un **défi d'inscription** (un quart d'heure, le
  temps d'installer une application), sans séance. L'écran de connexion enchaîne
  sur le QR code, le premier code, puis les codes de secours ; la séance n'est
  ouverte qu'au bout. Même chose à la création du premier compte et au premier mot
  de passe d'un compte ancien.
- Un défi d'inscription ne sert pas de défi de connexion, ni l'inverse. Le même
  défi rend le même secret si l'écran est rechargé ; cinq codes faux le font tomber.
- Les **séances déjà ouvertes** par un compte sans second facteur cessent de valoir
  dès que la règle est posée : elle ne se contourne pas en restant connecté.
- Personne ne peut retirer son second facteur depuis l'interface (403, et le bouton
  n'est pas proposé). L'outil de récupération le peut encore ; la personne devra le
  réactiver à la connexion suivante.

Vérifié de bout en bout (19 essais), dont : séance ancienne refusée, défi
d'inscription refusé comme défi de connexion, défi inventé refusé, même secret au
rechargement, activation qui ouvre la séance et remet dix codes, défi consommé,
retrait refusé, amorçage d'une instance neuve sous obligation.

---

## 3. Chiffrement au repos

`gateway/src/secret.ts`, appliqué par `gateway/src/db.ts`.

**Algorithme : AES-256-GCM.** Le contenu est illisible **et** toute modification
est détectée au déchiffrement. Un chiffrement sans authentification laisserait
un attaquant altérer les données à l'aveugle.

Sont chiffrées **toutes** les collections, synchronisées (`accounts`,
`projects`, `sessions`, `tasks`, `agents`, `profiles`) comme internes
(`authSessions`, `courrierCompte`, `agendaCompte`, `connecteurs`, `usage`,
`tarifs`), **dans le magasin fichiers comme dans PostgreSQL** (depuis 0.9.0). Les fichiers sont écrits en `0600`, dans un dossier `0700`,
par écriture atomique (fichier temporaire puis renommage). Les permissions des
fichiers déjà présents sont resserrées au démarrage : les premières versions
écrivaient en `644`.

**Où vit la clé**, réglé par `chiffrement` dans `helix.config.json` :

| Mode | Emplacement de la clé | Ce que cela protège |
|---|---|---|
| `trousseau` (défaut sur macOS) | Trousseau du compte hôte, service `fr.helix.instance`, compte `cle-donnees` | La clé n'est pas sur le disque des données. Un disque copié ou volé ne suffit pas : il faut la session du compte |
| `fichier` (défaut ailleurs) | `<HELIX_DATA_DIR>/.cle`, permissions `0600` | Une sauvegarde recopiée, un partage réseau mal réglé. Plus faible : clé et données sur le même disque |
| `false` | aucune | Rien. Les données restent en clair |

**Si la clé est illisible, Helix refuse de démarrer.** Le code distingue trois
états du trousseau, et c'est essentiel :

- **trouvée** : on l'utilise ;
- **absente** (`security` renvoie 44) : on en crée une ;
- **illisible** (tout autre code : trousseau verrouillé, accès refusé, liste
  d'applications autorisées invalidée par une mise à jour) : une clé existe
  peut-être. En créer une nouvelle écraserait l'ancienne et rendrait toutes les
  données définitivement illisibles. La passerelle **lève une erreur et
  s'arrête**, avec le message à suivre : déverrouiller la session du compte qui
  héberge l'instance, puis relancer.

Deux garde-fous du même ordre :

- l'écriture dans le trousseau se fait **sans `-U`** : la commande échoue si une
  entrée existe déjà, au lieu de l'écraser ;
- après écriture, la clé est **relue immédiatement**. Si elle n'est pas
  relisible, Helix reste en clair et le dit, plutôt que de produire des données
  irrécupérables au prochain démarrage.

Si un contenu chiffré est trouvé mais qu'aucune clé n'est disponible, la lecture
échoue avec un message qui couvre les deux causes possibles : donnée modifiée,
ou mauvaise clé. AES-GCM ne les distingue pas, et c'est voulu.

**Chaque coffre est lié à sa place.** Version 2 de l'enveloppe
(`helixChiffre: 2`) : le nom de la collection entre dans les données associées
d'AES-GCM. Sans ce lien, quelqu'un qui peut écrire dans la base sans en avoir la
clé (l'hébergeur d'un PostgreSQL, une sauvegarde restaurée à la main) pourrait
recopier le coffre d'une collection dans une autre, et il se déchiffrerait sans
erreur au mauvais endroit. Avec le lien, il est refusé. Mesuré : coffre des
tâches recopié sur la ligne des projets, lecture refusée ; un octet altéré,
lecture refusée.

**PostgreSQL.** La colonne `value` de `helix_state` ne contient plus que des
coffres. C'est là que le chiffrement compte le plus : une base vit souvent
ailleurs que l'instance (autre serveur, hébergeur, sauvegardes automatiques,
réplication), et quiconque la lit n'y trouve ni conversation ni empreinte. La
clé, elle, reste sur la machine de l'instance. Restent lisibles, et c'est
assumé : le nom des collections et l'heure de dernière écriture (`revision`),
qui servent à la synchronisation. Vérifié sur un vrai PostgreSQL 18 : base
existante en clair migrée au démarrage, aucune ligne ne contient plus un nom,
une adresse ou une empreinte, et un compte créé ensuite n'y apparaît qu'en
coffre.

**Migration.** `migrerChiffrement()` (`db.ts`) réécrit au démarrage, sous la
forme actuelle, tout ce qui ne l'est pas encore : données d'avant le
chiffrement, coffres de première version. Sans elle, une collection qui n'est
plus jamais écrite resterait en clair indéfiniment (c'était le cas des comptes,
d'où l'ancienne `migrerComptes`, désormais remplacée). Elle s'exécute **avant
que la passerelle n'accepte une requête** : une réécriture qui croiserait
l'écriture d'un poste pourrait remettre l'ancienne valeur par-dessus la
nouvelle. Une base qui ne répond pas en 15 s n'empêche pas le démarrage.

⚠ Pas de retour en arrière de version : une version antérieure à 0.9.0 ne sait
pas lire les coffres liés.

⚠ **Ce que cela ne protège pas** : une session utilisateur compromise. Un
logiciel malveillant sous le compte de l'utilisateur, ou un accès physique à une
machine déverrouillée, atteint le trousseau comme Helix. Le chiffrement au repos
protège le disque, pas une session ouverte.

---

## 4. Journal d'audit scellé

`gateway/src/audit.ts`.

### 4.1 Ce qui est consigné

Les actions sont déclarées par le type `AuditAction` de `gateway/src/audit.ts`, une
par une ; l'écran Sécurité en donne chacune en français (`SeancesEtJournal.tsx`,
vérifié : aucune sans libellé). Par famille :

| Famille | Actions | Émises par |
|---|---|---|
| Connexion et séances | `connexion.*`, `seance.*`, `deuxfacteurs.*`, `motdepasse.*` | `accounts.ts`, `usersession.ts` |
| Compte | `compte.cree`, `compte.nom_modifie`, `compte.adresse_modifiee`, `compte.photo_modifiee`, `compte.supprime`, `donnees.exportees` | `accounts.ts`, `effacement.ts`, `export.ts` |
| Données | `donnees.ecrites` : écriture d'une collection, espace de travail, dossier de projet | `index.ts` |
| Écran | `ecran.demande`, `.approuve`, `.refuse`, `.execute`, `.mode_modifie` | `computer.ts` |
| Outils | `outil.appele` (**tout** appel, lectures comprises), `outil.demande`, `.approuve`, `.refuse` | `chat.ts`, `serveurOutils.ts`, `approbation.ts` |
| Connecteurs | `drive.*`, `slack.*`, `moteur.conditions_acceptees` | `drive.ts`, `slack.ts`, `index.ts` |
| Agents | `employe.*` (mise en service, modification, messages, missions, mails confiés, canaux, documents, liberté, outils d'OpenClaw) ; `openclaw.installe`, `.mis_a_jour`, `.installation_echouee` | `employes.ts`, `installationOpenClaw.ts` |
| Modèles cloud | `fournisseur.ajoute`, `.modifie`, `.retire` | `fournisseurs.ts` |
| Groupes | `groupe.cree`, `.modifie`, `.quitte`, `.supprime` | `groupes.ts` |
| Bibliothèque | `bibliotheque.dossier_cree`, `.importe`, `.modifie`, `.supprime`, `.consulte` (document d'un autre) | `bibliotheque.ts` |
| Réunions | `reunion.creee`, `.bot_envoye`, `.bot_echec`, `.bot_auto`, `.transcrite`, `.partagee`, `.consultee`, `.supprimee` | `reunions.ts` |

`outil.appele` porte **l'identifiant du compte** qui a lancé la conversation, et
retient le nom de l'outil, le chemin visé (`path`, `source`, `destination` ou
`paths`) et le succès. Pas le contenu. Les lectures sont
consignées volontairement : savoir quels fichiers un agent a lus est
précisément ce qu'un audit cherche après coup. Les outils d'écran en sont exclus,
ils ont déjà leur propre trace, plus détaillée.

Le journal ne contient **aucun secret** : ni mot de passe, ni empreinte, ni
jeton, ni contenu de fichier ou de conversation. Les actions d'écran
n'enregistrent ni les coordonnées ni le texte saisi.

### 4.2 Comment la chaîne est formée

Une ligne JSON par évènement, dans
`<HELIX_DATA_DIR>/audit/audit-AAAA-MM-JJ.jsonl` (fichier `0600`, dossier `0700`).

Chaque entrée porte `quand`, `action`, `qui`, `detail`, `precedent`, `empreinte`.

- `empreinte` est un **HMAC-SHA256** de l'entrée sérialisée, `precedent` compris.
- `precedent` est l'empreinte de l'entrée qui précède. C'est ce qui forme la
  chaîne.
- La **clé du HMAC est la clé de chiffrement des données**
  (`cleDonnees()`), qui vit dans le trousseau, pas à côté du journal. Un
  SHA-256 nu ne protégerait rien : qui peut écrire le fichier pourrait
  recalculer toute la chaîne. Avec un HMAC, reforger la chaîne demande la clé.
- La première entrée d'une installation part d'une **graine aléatoire** de 16
  octets, pour qu'une chaîne ne puisse pas être reconstruite ailleurs à partir
  d'une valeur fixe connue.

Une **ancre** vit hors du journal, dans `audit/chaine.json` (`0600`). Elle
retient deux choses :

- `empreinte` : la dernière empreinte écrite ;
- `debuts` : pour chaque journée, l'empreinte qui précède sa première ligne.

Conservation : **90 jours par défaut**, de 30 à 3650 par `journalConservationJours`
du profil de déploiement ; la durée est affichée dans Paramètres, Sécurité. Purge au
plus une fois par jour, **par la date du fichier** (`audit-AAAA-MM-JJ.jsonl`), et
l'ancre oublie les débuts des journées effacées (vérifié : une journée vieille de 200
jours part, une récente reste, la chaîne se vérifie toujours). La copie
`journalCopie` n'est jamais purgée : c'est à l'entreprise d'en fixer la durée.

`journalCopie` dans le profil de déploiement recopie chaque ligne, au fil de
l'eau, vers un second emplacement : partage réseau, disque de sauvegarde,
montage en lecture seule côté serveur. C'est ce qui rend le journal opposable.

### 4.3 Ce que la vérification détecte

`verifier()` relit un fichier de journée et compare. Résultat exposé par
`GET /helix/audit`, affiché dans Réglages, Sécurité.

| Manipulation | Détectée ? | Comment |
|---|---|---|
| **Entrée modifiée** | ✅ | Le HMAC recalculé ne correspond plus. Anomalie « entrée modifiée », avec le numéro de ligne |
| **Entrée retirée ou insérée au milieu** | ✅ | Le champ `precedent` de la ligne suivante ne correspond plus à l'empreinte attendue. Anomalie « chaîne rompue : entrée retirée ou insérée » |
| **Troncature en tête** (premières lignes retirées) | ✅ | La première ligne restante ne se raccroche pas à l'empreinte notée dans `debuts` pour cette journée. Anomalie « début du journal manquant : premières entrées retirées » |
| **Troncature en queue** (dernières lignes retirées) | ✅ | La dernière empreinte du fichier ne correspond plus à l'ancre. Anomalie « ne correspond pas à l'ancre : journal tronqué ou réécrit » |
| **Refonte complète** du fichier | ✅ | Reforger la chaîne exige la clé du HMAC, qui est dans le trousseau. Sans elle, chaque ligne échoue dès le premier contrôle. Avec les seules permissions du fichier, c'est hors de portée |
| **Ligne illisible** | ✅ | Anomalie « ligne illisible » |
| **Suppression du fichier entier** | ❌ | Il ne reste rien à vérifier. C'est l'objet de `journalCopie` |
| **Suppression de `chaine.json`** | ⚠ partiellement | Sans ancre, les contrôles de troncature en tête et en queue sont désactivés. La modification d'une entrée et la rupture de chaîne au milieu restent détectées |

⚠ **Limite à connaître.** Quand aucune clé de chiffrement n'est disponible
(`chiffrement: false`, ou trousseau inaccessible), le sceau retombe sur une
valeur aléatoire **propre au processus**. La chaîne reste vérifiable pendant
l'exécution en cours, mais après un redémarrage la vérification d'un journal
écrit précédemment signalera « entrée modifiée » alors que rien n'a été touché.
Un journal probatoire suppose donc le chiffrement actif.

⚠ Le journal est **inviolable à la lecture, pas indestructible**. La chaîne rend
la falsification détectable, elle n'empêche pas la destruction.

---

## 5. Contrôle de l'écran

`gateway/src/computer.ts`.

**Désactivé par défaut.** Deux façons de l'activer (`gateway/src/reglagesEcran.ts`),
dans cet ordre de priorité :

1. **le profil de déploiement** (`helix.config.json`, `computerUse`) : s'il fixe le
   réglage, il fait foi, et l'interface le montre verrouillé (« réglé par votre
   prestataire ») ;
2. **l'interface** (depuis 0.10.0) : Paramètres, Contrôle de l'écran, « Activer sur
   ce Mac », ou le raccourci du bouton « Écran » de Cowork. Conditions :
   - **instance non partagée** seulement (`share` absent ou `false`) : la personne
     connectée est devant l'écran piloté. Sur une instance partagée, n'importe quel
     collègue ferait sinon piloter l'écran du serveur ;
   - **mot de passe redemandé**, et code si la double authentification est active ;
     désactiver ne demande rien, resserrer est toujours permis ;
   - seul le mode `hote` est proposé, **toujours avec approbation** : l'interface ne
     sait pas la retirer ;
   - le choix est rangé chiffré (collection interne `reglages`), relu avant la
     première requête, et tracé (`ecran.mode_modifie`, avant et après, au nom de la
     personne). Route `POST /helix/computer/mode`, sous séance (table `EXECUTION`).

Vérifié (12 essais) : défaut désactivé et modifiable, 401 sans séance, refus sur
mauvais mot de passe, activation, persistance après redémarrage, désactivation sans
mot de passe, code exigé avec double authentification, verrouillage sur instance
partagée (403) et quand le profil fixe le mode.

| Mode | Ce que l'agent pilote |
|---|---|
| `desactive` | rien (défaut) |
| `hote` | la machine réelle de l'utilisateur |
| `sandbox` | une machine virtuelle dédiée, via cua/Lume |

### 5.1 Approbation explicite

Point d'entrée unique : `request()`. Toute action **qui modifie quelque chose**
est mise en attente côté passerelle avant de partir.

1. `journaliser("ecran.demande")` ;
2. la demande est poussée à l'interface par SSE (`GET /helix/computer/events`),
   avec un identifiant tiré au hasard ;
3. l'interface répond par `POST /helix/computer/approve`, qui exige une séance ;
4. accord : `journaliser("ecran.approuve")`, puis exécution ;
   refus ou silence : `journaliser("ecran.refuse")`, rien ne part ;
5. **sans réponse au bout de 120 secondes**, la demande expire et vaut refus.

Un poste qui se connecte en cours de route reçoit les demandes déjà posées,
sinon l'agent resterait bloqué sans que personne ne le sache.

Capture, déplacement du curseur et attente ne modifient rien : ils passent sans
demande, pour ne pas noyer l'utilisateur sous les confirmations.

`computerUse.requireApproval: false` lève l'exigence. À réserver aux postes de
démonstration.

### 5.2 Trace

Chaque action modifiante laisse jusqu'à quatre lignes dans le journal :
`ecran.demande`, `ecran.approuve` ou `ecran.refuse`, `ecran.execute`. Y figurent
le type d'action, le mode et le résultat. **Ni les coordonnées ni le texte
saisi**, volontairement : le journal dit ce qui a été fait, il n'enregistre pas
ce que l'utilisateur a tapé.

**Chaque ligne nomme des personnes** (depuis 0.10.0). La demande et l'exécution
sont au nom du compte **pour qui** l'agent travaillait (la personne dont la
conversation l'a lancé, ou celle qui essaie une action depuis les réglages) ;
l'accord et le refus sont au nom du compte **qui a répondu**, avec `pour` dans le
détail ; l'exécution porte `approuvePar`. Sans réponse à temps, la ligne est au
nom de `personne`. Auparavant, les libellés fixes `agent` et `utilisateur` ne
permettaient pas de dire, sur une instance à plusieurs postes, qui avait approuvé
un clic.

Le même défaut touchait les **approbations d'outils** : `outil.approuve` était
consigné au nom de la personne qui avait *demandé*. Il l'est désormais au nom de
celle qui a répondu (`approbation.repondre` reçoit l'auteur de la réponse, pris
dans sa séance). Vérifié : demande d'Alice, accord de Bruno, refus de Chloé, trois
noms justes au journal ; une réponse envoyée par la route de l'autre surface est
refusée.

### 5.3 Garde-fou de modèle

Les outils `ecran__…` ne sont proposés qu'à un modèle de rôle `gui` ou `vision`
(`gateway/src/chat.ts`). Un modèle de conversation à qui on les offrirait
prendrait des captures qu'il ne peut pas voir, puis cliquerait au hasard.

### 5.4 Autorisations macOS

En mode `hote`, macOS exige deux autorisations distinctes, accordées à
l'application Helix dans Réglages Système : **Enregistrement de l'écran** pour
voir, **Accessibilité** pour la souris et le clavier. Helix ne peut pas se les
donner à lui-même. Réglages, Contrôle de l'écran affiche ce qui manque et
propose un essai de capture.

---

## 6. Périmètre des outils fichiers

`gateway/src/mcp.ts`.

Un seul serveur MCP est livré par défaut : `@modelcontextprotocol/server-filesystem`,
lancé par `npx` avec **un seul argument, l'espace de travail**. Le périmètre est
un argument de lancement du processus, pas un réglage à chaud : l'agent ne peut
rien atteindre en dehors de ce qui lui a été désigné.

Un outil de l'instance accompagne ce serveur (0.21.0) : `controle__site_web`
(`gateway/src/controleWeb.ts`), en lecture seule (jamais soumis à accord), limité
au dossier de travail (`realpath` comparé à la racine, comme `espace.ts`). Il lit
les fichiers HTML, CSS et JavaScript et n'exécute rien : le JavaScript est compilé
par `node:vm` (`new Script`) sans être lancé. L'identifiant « controle » est
réservé : un serveur MCP ajouté sous ce nom est refusé.

Deux retouches des arguments avant l'appel (0.20.0, `adapterFichiers` dans
`gateway/src/outils.ts`), pour les erreurs typiques d'un petit modèle : un
`move_file` dont la destination est un dossier existant devient un rangement
dans ce dossier (destination complétée du nom du fichier), comme `mv` ; un
`write_file` sans `content` crée un fichier vide. Le serveur valide toujours le
chemin final contre l'espace de travail : les retouches ne peuvent rien ouvrir
de plus.

Espace par défaut : `HELIX_WORKSPACE`, sinon `workspace` du profil de
déploiement, sinon `~/Helix`. Il est créé au premier lancement s'il n'existe
pas.

Le changer depuis l'interface (`POST /helix/mcp/workspace`) passe par
`validerDossier()` (`gateway/src/opencode.ts`), qui :

- résout le chemin réel avec `realpathSync`, ce qui neutralise une évasion par
  lien symbolique ;
- vérifie que c'est bien un dossier lisible ;
- **refuse les emplacements du système** (`/System`, `/usr`, `/bin`, `/sbin`,
  `/private/etc`, `/private/var/db`, `/Library/Security`, `/Applications`), les
  dossiers qui en contiennent un, et la racine du disque. La comparaison se fait
  sur une forme repliée, parce que le système de fichiers de macOS ignore la
  casse ;
- puis arrête et relance le serveur avec le nouveau périmètre.

Le périmètre était auparavant borné au dossier personnel. C'était trop serré :
les documents d'une PME vivent souvent sur un disque externe ou un partage
réseau. **Cette barrière borne le choix de la personne**, qui désigne son dossier
par le sélecteur du système. Une fois le dossier fixé, c'est le serveur de
fichiers qui y tient l'agent : cela n'a pas changé.

L'opération est tracée (`donnees.ecrites`, collection `cowork.espace`). Le même
contrôle s'applique au dossier de projet de l'écran Code.

Les serveurs MCP tournent en local et dialoguent en JSON-RPC sur l'entrée et la
sortie standard : aucune donnée de l'entreprise ne transite par un service
tiers. Le code du serveur, lui, est récupéré une première fois sur le registre
npm par `npx`.

### 6.1 Ajouter un serveur MCP depuis l'interface

`gateway/src/connecteurs.ts`. **Un serveur MCP est une commande exécutée sur la
machine.** Laisser l'interface choisir cette commande reviendrait à offrir
l'exécution de code à travers la passerelle : sur une instance partagée,
n'importe quel salarié ferait tourner ce qu'il veut sur le serveur de
l'entreprise.

D'où la règle : on n'installe **que des connecteurs du catalogue**. La commande
vient d'une constante du code de Helix, jamais de la requête ; l'utilisateur ne
fournit que ses identifiants. Vérifié :

| Essai | Résultat |
|---|---|
| Commande libre `/bin/sh -c "touch /tmp/PREUVE_RCE"` | Refusée avec l'explication, fichier témoin inexistant |
| Même commande glissée sous l'identifiant `notion` du catalogue | Connecteur ajouté, commande injectée **ignorée** : c'est celle du catalogue qui tourne |
| Ajout sans séance | 401 |

Une commande libre n'est possible que si le profil de déploiement l'autorise
explicitement (`connecteursLibres`). Par défaut, c'est interdit.

Les secrets d'un connecteur sont chiffrés au repos et passés au processus par
son **environnement**, jamais en argument : un argument est visible dans la
table des processus. Un outil apporté par un connecteur inconnu est classé comme
**modifiant** par la barrière d'approbation (§ 6.2), jamais comme une lecture.

Le catalogue ne compte que deux entrées vérifiées (fichiers, Notion). Les
serveurs officiels GitHub, Slack et PostgreSQL publiés sur npm sont dépréciés,
d'autres paquets n'existent pas : chaque entrée engage la passerelle à exécuter
un programme chez le client, on n'en ajoute pas sur une supposition.

### 6.2 Barrière d'approbation des actions

`gateway/src/approbation.ts`. Trois niveaux :

| Niveau | Comportement |
|---|---|
| Tout approuver | L'agent agit sans demander |
| **Demander avant de modifier** | Lectures libres, toute modification demande confirmation. **Défaut à l'installation** |
| Demander pour tout | Chaque appel d'outil demande confirmation |

**La barrière est dans la passerelle**, dans la boucle d'outils : un contrôle posé
dans le navigateur se contourne en appelant la route directement. Vérifié par un
appel brut sans navigateur : l'écriture reste en attente, le fichier intact.

Une réponse vaut pour les actions de même nature dans le même dossier, jusqu'à
la fin de la demande en cours. Sans cela, une tâche découpée en vingt étapes
solliciterait l'utilisateur vingt fois. Un refus se retient aussi, sinon un
agent insistant reposerait la question. Délai de 120 s, l'expiration valant
refus.

Desserrer le niveau exige une séance. Le niveau n'est pas une collection
synchronisée : aucun poste ne peut le remettre à « tout » par la route générique
de données (404).

Un second jeu d'outils atteint les fichiers depuis la passerelle elle-même, sans
passer par MCP : les outils bureautiques `bureau__…`, décrits en § 10.1. Ils sont
bornés au même espace de travail, par un contrôle indépendant.

---

## 7. Cloisonnement des données

`gateway/src/authz.ts`. La règle est appliquée par l'instance, pas par
l'interface.

- **Lecture** : chacun ne reçoit que ses projets, ses conversations, ses tâches
  et ses agents, plus ce qui lui est explicitement partagé, nommément ou à un
  groupe dont il est membre (`Demandeur.groupes`, résolu par l'instance à chaque
  requête). Le profil, qui porte
  instructions personnalisées et mémoire, ne sort jamais de son propriétaire.
- **Écriture** : les postes envoient la collection entière ; l'instance ne
  retient que les enregistrements qu'ils ont le droit de toucher et conserve les
  autres. Pousser une liste vide n'efface rien chez les collègues.
- **Suppression n'est pas modification** : un membre travaille dans un projet
  partagé, seul le propriétaire peut le supprimer.
- **Propriété non transférable** par le poste : modifier un enregistrement
  partagé ne permet pas de se l'approprier, `ownerId` est réimposé.
- Le nombre d'enregistrements refusés est renvoyé au poste et journalisé.

**Rattacher un chat ou une tâche à un projet** est un **classement personnel** :
le champ `projectId` n'entre dans aucune règle de visibilité. Les membres d'un
projet ne voient pas les chats qu'un collègue y range ; pour en lire un, il faut
qu'il le partage nommément. Sans cette règle, ranger un chat en deux clics
serait un partage déguisé, sans liste de destinataires ni révocation. Seul le
propriétaire d'un chat peut le ranger ; une personne à qui on l'a partagé voit
le sélecteur grisé, avec le motif. Les tâches ne sont montrées qu'à leur
propriétaire, rangées ou non.

### 7.1 Export des données (RGPD, articles 15 et 20)

`gateway/src/export.ts`, route `GET /helix/export`, bouton dans Paramètres,
Confidentialité.

Un fichier JSON rassemble, pour la personne de la séance : son compte (sans
secret) et l'état de sa double authentification, son profil, ses conversations
et celles qu'un collègue lui a partagées **nommément** (marquées comme telles),
ses projets et ceux dont elle est membre, ses tâches, ses agents et ceux qu'elle a
mis en service (avec ses échanges), ses clés de modèles (sans la clé), ses groupes,
la liste de ses dossiers et documents de la bibliothèque, ses réunions (compte rendu
et transcription), ses bases de connaissances et les documents qu'elle a ajoutés aux
bases des autres (sans passages ni vecteurs), la liste des images qu'elle a créées
(avec la demande), ses projets d'entraînement (exemples, propositions, comparaison,
modèle installé) (ces trois rubriques depuis le 25/09/2026), sa consommation jour par jour, ses séances et **toutes** ses
entrées du journal d'audit (pas seulement les cinquante de l'écran Sécurité).

N'y entrent pas, et le fichier le dit lui-même dans `nonInclus` : mots de
passe, secret du second facteur et codes de secours (seules des empreintes
existent), jetons de séance (des clés d'accès), réglages de l'instance
(connecteurs, courrier, agenda, tarifs : ils appartiennent à l'instance), les
fichiers du dossier de travail (restés sur le disque), et les conversations de
collègues simplement ouvertes à l'organisation (lisibles, mais pas des données
sur la personne), et le contenu des documents de la bibliothèque (leur liste y est ;
chacun se télécharge depuis l'écran, tel qu'il a été déposé). Les bases de
connaissances (§ 22.2) n'y sont pas encore, pas même leurs métadonnées : c'est un
manque, à combler.

Chaque export est tracé (`donnees.exportees`, avec les nombres d'éléments,
jamais le contenu). Toutes les réponses de la passerelle portent
`Cache-Control: no-store` : un export ne reste pas dans un cache disque. Vérifié :
sans séance, 401 ; un second compte ne reçoit aucune donnée d'Alice ; aucune
empreinte ni jeton dans le fichier.

### 7.2 Suppression de compte (RGPD, article 17)

`gateway/src/effacement.ts`, routes `GET /helix/compte/effacement` (aperçu) et
`POST /helix/compte/effacer`, écran Profil, Zone de danger. Pour une personne
partie : l'outil de récupération (§ 2), qui refuse d'agir tant que l'application
tourne (la passerelle réécrirait par-dessus ce qu'elle garde en mémoire).

**Confirmation** : mot de passe, et code (ou code de secours) si le second facteur
est actif. L'écran montre d'abord, calculé par l'instance, ce qui disparaîtra et ce
qui sera confié à un collègue ; une case « Je comprends que la suppression est
définitive » est exigée. L'outil local demande de retaper l'adresse du compte.

**Disparaît** : le compte, son profil (instructions, mémoire), ses conversations,
ses tâches, ses agents, sa consommation, ses séances, et sa place dans les projets
et les partages de ses collègues. Depuis 0.11.0 aussi : ses conversations avec les
employés (chez Helix et chez OpenClaw, mémoire indexée et **archives** comprises,
§ 14.5) et les agents qu'il avait mis en service, nommés dans l'aperçu avant la
confirmation (§ 14). Depuis 0.16.0 aussi : ses clés de modèles, ses documents et
dossiers de la bibliothèque (contenus effacés du disque ; ce que des collègues avaient
déposé dans ses dossiers leur reste, remonté à la racine), ses réunions (compte rendu,
transcription, son) et ses réglages de réunion ; il sort de ses groupes (un groupe
vide disparaît, un groupe sans responsable en reçoit un).

**Ne disparaît pas** :

- les **projets partagés dont la personne était propriétaire** : confiés au premier
  membre **actif** (jamais à une invitation non acceptée). Un projet sans autre
  membre actif est supprimé. C'est le travail d'une équipe ;
- le **journal d'audit**, scellé et chaîné : le réécrire le rendrait invérifiable,
  et il sert à établir qui a fait quoi sur les données de l'entreprise. Il garde
  l'identifiant du compte et l'adresse notée à la création. C'est une conservation
  pour motif de sécurité, bornée par la durée de conservation du journal (§ 4.2 :
  90 jours par défaut, réglable) ; au-delà, les journées sont effacées. La ligne
  `compte.supprime` ne porte que des nombres, pas l'adresse une fois de plus.

**Ordre des opérations** : séances fermées d'abord (le poste de la personne ne
renvoie plus ses données pendant l'effacement), compte retiré en dernier (si une
étape échoue, l'effacement se relance).

**Pas de réinscription par la bande.** Le cache d'un collègue peut contenir encore
la personne supprimée, et la réinscrire en renvoyant sa copie d'un projet. À chaque
écriture d'un poste, l'instance retire des membres et des partages tout compte qui
n'existe plus. Sans cela, un nouveau compte créé plus tard à la même adresse
hériterait de ses accès.

Vérifié de bout en bout (14 essais) : aperçu exact (conversations, tâches, agents,
projet supprimé, projet confié, deux mentions retirées), refus sur mauvais mot de
passe sans rien effacer, séance fermée, compte introuvable, projet confié sans
doublon de membre, conversations effacées et partage retiré chez le collègue, copie
périmée renvoyée sans réinscription, adresse de nouveau libre et nouveau compte
qui n'hérite de rien, code exigé quand le second facteur est actif ; consommation
effacée sans toucher à celle des collègues.

**Partage à un groupe (0.16.0).** `voitConversation` et `modifieConversation`
reconnaissent aussi une conversation dont `sharedGroupIds` croise les groupes de la
personne, tels que l'instance les connaît (`groupes.ts`), jamais tels que le poste
les déclare. Vérifié : membre du groupe, il la voit ; retiré du groupe, il ne la voit
plus (la révision des conversations suit celle des groupes, la synchronisation
retire donc la copie locale) ; il ne peut ni la réécrire ni se réinscrire en
renvoyant sa copie.

---

## 8. Surface réseau et transport

**Écoute.** La passerelle n'écoute que sur la boucle locale (`127.0.0.1`). Un
poste autonome n'est joignable par personne, même sur le réseau de l'entreprise.
L'ouverture est une décision explicite de l'intégrateur : `share: true` dans le
profil, ou `HELIX_GATEWAY_HOST`.

**TLS** (`gateway/src/tls.ts`). Une instance ouverte au réseau **ne sert jamais
en clair**. Si l'intégrateur ne fournit pas de certificat, la passerelle en
génère un auto-signé au premier démarrage (clé en `0600`, validité un an,
renouvelé 30 jours avant expiration). Si un certificat est déclaré mais
illisible, la passerelle **refuse de démarrer** plutôt que de retomber en clair.
Sur la boucle locale le trafic reste en clair, il ne quitte pas la machine ;
`tls: true` force le chiffrement quand même.

Côté poste, un certificat auto-signé est accepté selon la **règle de la première
rencontre**, comme SSH : l'empreinte est retenue au premier contact, tout
certificat différent est ensuite refusé. Cela n'authentifie pas la première
connexion, mais rend visible toute interposition ultérieure.

**En-têtes.** Toutes les réponses portent `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`,
`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` et
`Cross-Origin-Resource-Policy: same-site` (`ENTETES_SECURITE`,
`gateway/src/index.ts`).

⚠ `Access-Control-Allow-Origin: *` est renvoyé sur toutes les réponses. Ce n'est
pas une faille en soi, puisque le jeton et la séance sont des en-têtes que le
navigateur n'ajoute pas tout seul, mais cela mérite d'être resserré sur une
instance exposée.

---

## 9. Application de bureau

`electron/main.cjs` : `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`.

Une **politique de sécurité du contenu** est posée sur les réponses de la
fenêtre : `default-src 'self'`, `img-src 'self' data: blob:`,
`font-src 'self' data:`, `object-src 'none'`, `frame-ancestors 'none'`,
`form-action 'none'`. L'interface ne peut donc charger ni script, ni police, ni
image venus d'ailleurs : un texte piégé affiché dans une conversation ne peut
pas faire sortir de données vers un serveur tiers.

Deux nuances à connaître :

- la politique **ne s'applique qu'à l'application livrée**, pas au serveur de
  développement, qui injecte des scripts en ligne et recompile à chaud ;
- `connect-src` reste ouvert (`'self' http: https: ws: wss: data:`), parce que
  l'adresse de l'instance d'entreprise n'est pas connue d'avance.

Les permissions du navigateur (caméra, géolocalisation, notifications) sont
refusées d'office. Seule exception : le **micro, en audio seul, demandé par la
page de l'application elle-même**, pour la dictée (§ 1.7). Les liens externes ne
partent au système que s'ils sont en `http(s)`, et la fenêtre ne peut pas quitter
son propre contenu (`setWindowOpenHandler`, `will-navigate`).

**Le pont `preload` ouvre trois portes**, et la page n'a toujours aucun accès à
Node (vérifié : `typeof require` vaut `undefined` dans la page) : le sélecteur de
dossier du système, l'état de la mise à jour (lire, vérifier, installer une
version déjà téléchargée et vérifiée, ouvrir le lien du paquet), et le bot de
réunion (§ 16.3). La page ne fournit ni adresse ni fichier pour la mise à jour : le
flux est inscrit dans le paquet, et le lien du paquet vient du flux, limité à
`http(s)`. Chaque canal vérifie que l'appel vient de la fenêtre de l'application.

**La règle de la première rencontre (certificats) ne vaut que pour la fenêtre de
l'application** (0.16.0) : un certificat invalide présenté à une autre fenêtre (celle
du bot, qui charge Google Meet) est refusé, jamais retenu.

**Fermer la fenêtre ne quitte pas l'application sur macOS** (0.11.0), comme toute
application Mac : la passerelle reste en marche, avec les employés et leurs missions.
C'est ⌘Q qui arrête tout, OpenClaw compris. Jusque-là, la fermeture arrêtait la
passerelle sans quitter l'application, et la fenêtre rouverte depuis le Dock n'avait
plus rien derrière elle.

**Mise à jour** (`electron/miseAJour.cjs`, détail dans SIGNATURE.md § 4) : une seule
adresse, celle de l'agence, en HTTPS ; installation automatique **seulement** si
l'application porte une signature d'éditeur, auquel cas macOS exige que la mise à
jour porte la même. Sinon, simple avertissement « version disponible ».

---

## 10. Atelier bureautique de Cowork

`gateway/src/atelier.ts`. Nouveau, et conçu pour ne pas être une porte d'entrée.

- La liste des paquets Python et Node est **figée dans le code**. Aucune chaîne
  n'est construite depuis une entrée utilisateur, et **le modèle ne décide
  rien**.
- Tout passe par `execFile` ou `spawn` avec un **tableau d'arguments**, jamais
  par un shell.
- L'installation se fait dans un environnement isolé sous
  `<HELIX_DATA_DIR>/cowork` : un environnement virtuel Python et un préfixe npm.
  Ni les installations globales, ni le `PATH` de l'utilisateur, ni les projets
  ne sont touchés.
- **Aucun droit administrateur** n'est demandé.
- L'interface annonce le nombre de bibliothèques, la place occupée et le dossier
  exact **avant** d'installer, et attend un accord explicite.
- Les deux routes qui agissent (`/helix/atelier/preparer`,
  `/helix/atelier/verifier`) exigent une séance. `GET /helix/atelier` est en
  lecture seule.
- LibreOffice et les outils Poppler ne sont **pas** installés automatiquement :
  ils pèsent lourd et peuvent demander des droits. Leur présence est seulement
  signalée.

### 10.1 Outils bureautiques exposés au modèle

`gateway/src/bureau.ts`. C'est la seule voie par laquelle un modèle fait tourner
du Python sur le poste. Elle mérite donc d'être lue en détail par un auditeur.

Cinq outils, ajoutés à la liste seulement si l'atelier est installé :
`bureau__creer_document` (`.docx`), `creer_classeur` (`.xlsx`),
`creer_presentation` (`.pptx`), `creer_pdf`, et `lire_document` (lecture des
quatre formats).

**Ce qui borne cette surface :**

| Garde-fou | Mise en œuvre |
|---|---|
| **Le modèle fournit des données, jamais du code** | Les scripts Python sont des **constantes du module**. Rien n'y est interpolé. Le modèle remplit cinq gabarits, il ne peut ni composer une commande ni évaluer du code |
| **Aucun paramètre en ligne de commande** | La charge part en **JSON sur l'entrée standard** de l'interpréteur. Un argument peut fuiter dans la liste des processus, et une interpolation ferait de chaque titre de document une injection possible |
| **Aucun shell** | `execFile` avec un tableau d'arguments, jamais `exec` |
| **Écriture bornée à l'espace de travail** | Le chemin est normalisé (`..` mangés), le **dossier parent** est résolu par `realpath` (ce qui démasque un lien symbolique posé dans l'espace et pointant ailleurs), et si le fichier existe déjà **sa propre cible** est vérifiée aussi : écrire « dans » un lien revient à écrire au bout du lien. Un chemin hors racine est refusé avec un message qui redonne la racine |
| **Extension imposée** | Chaque outil de création impose son extension, ajoutée si elle manque |
| **Interpréteur de l'atelier** | Celui du venv isolé, pas le Python du système |
| **Isolement d'exécution** | Dossier temporaire créé par appel, effacé ensuite, quel que soit le résultat |
| **Délai maximal** | 120 secondes par appel |
| **Trace** | Chaque appel est journalisé (`outil.appele`), avec le compte, le nom de l'outil et le chemin visé |

⚠ **Ce que cela ne couvre pas.** Comme les outils fichiers, ces outils
**s'exécutent sans approbation** : le popover de Cowork ne les commande pas
davantage. Un document piégé lu par l'agent peut donc lui faire écrire un
fichier dans l'espace de travail. Le périmètre reste la seule barrière.

⚠ Un chemin **relatif** est compté depuis l'espace de travail plutôt que refusé.
C'est un choix d'ergonomie (le modèle perd moins de tours), et la vérification de
confinement s'applique de la même façon. À connaître, cela reste une tolérance.

---

### 10.2 Courrier et agenda

`gateway/src/courrier.ts` (IMAP) et `gateway/src/agenda.ts` (CalDAV). Tous deux
écrits sans dépendance, sur la seule bibliothèque standard de Node : une
bibliothèque tierce qui lit tout le courrier de l'entreprise est un arbre de
dépendances que personne n'a relu.

**Lecture, plus une écriture : le brouillon (0.16.0).** Le courrier n'implémente
ni `STORE`, ni `EXPUNGE`, ni `DELETE`, ni `COPY`, ni `MOVE`, ni `CREATE`, et ouvre
les boîtes par `EXAMINE` : même le drapeau « lu » reste intact. Sa seule écriture
est `APPEND`, avec le drapeau `\Draft`, dans le dossier que le serveur désigne
comme celui des brouillons (`\Drafts`, RFC 6154), jamais créé s'il manque.
`courrier__brouillon` est classé comme modifiant par la barrière d'approbation (les
lectures sont reconnues par leur nom exact ; un outil de courrier inconnu modifie),
et la carte d'approbation dit le destinataire, l'objet, ou l'expéditeur et l'objet
du message auquel on répond. Les destinataires sont vérifiés un à un ; noms et
objet sont réencodés par Helix (mot encodé RFC 2047), corps en base64 : mesuré, un
destinataire ou un objet contenant `\r\nBcc: …` n'ajoute aucun en-tête (refusé, ou
réduit à une ligne). L'agenda n'émet que `PROPFIND` et `REPORT`, jamais `PUT` ni
`DELETE`.

**L'envoi (0.17.0).** Coupé par défaut ; l'activer exige une séance
(`POST /helix/courrier/envoi`, journalisé au nom de qui l'a fait) et le serveur
d'envoi est essayé (connexion, TLS, authentification) avant d'être retenu. Le
client SMTP (`smtp.ts`) vérifie le certificat (TLS 1.2 au moins), refuse un port
STARTTLS qui n'annonce pas STARTTLS (le mot de passe partirait en clair), rejette
toute commande contenant un retour à la ligne, n'accepte que des adresses ASCII
sans chevron, et applique la transparence des lignes commençant par un point.
**`courrier__envoyer` est dans `TOUJOURS_DEMANDER` (approbation.ts)** : la carte est
posée quel que soit le niveau, y compris « Tout approuver », et même pour un agent
« autonome » (serveurOutils.ts) ; aucun accord n'est retenu d'un appel à l'autre (un
refus l'est, pour ce mail précis, pour qu'un agent qui insiste ne repose pas la
question). La carte montre le mail tel qu'il sera servi : composé par le même code
que l'envoi (`apercuEnvoi`), destinataires résolus, texte entier. Sans réponse en
deux minutes, rien ne part. Trente envois par heure au plus pour l'instance. Le
journal (`courrier.envoye`) garde le nombre de destinataires et la taille, jamais
les adresses ni le texte. Limite connue : la carte, comme toutes les demandes
d'approbation, s'affiche sur les postes connectés à l'instance ; une personne qui
partage l'instance voit donc le texte d'un mail en attente d'accord (elle a déjà
accès à la même boîte par ses propres outils). Mesuré : envoi réel au niveau « Tout
approuver » (carte posée), refus (rien ne part), réponse dans le fil (`In-Reply-To`),
`Bcc:` glissé dans l'objet (neutralisé), destinataire refusé par le serveur (dit au
modèle), agent autonome (carte posée, sans mention « sans accord » au journal).

**Option « Envoyer sans me demander » (0.18.0).** `POST /helix/courrier/confirmation`
(séance, journal `courrier.confirmation`) ; rangée avec le compte (`envoiSansAccord`),
elle tombe quand l'envoi est coupé. Allumée, `demandeToujours` rend faux pour
`courrier__envoyer` : l'envoi suit la règle ordinaire (passe sans carte au niveau
« Tout approuver » et pour un agent autonome, journalisé « sansAccord » ; carte
entière aux autres niveaux). **Garde-fou indépendant de l'option :** pendant qu'un
agent traite un mail reçu (`declencher`, compteur par agent,
`traiteUnMailRecu`), `serveurOutils.ts` force la carte pour tout envoi de cet agent,
autonome ou non ; un agent qui, au même moment, parlerait à quelqu'un sur un canal
verrait donc aussi ses envois soumis à accord (choix prudent assumé). La description
de l'outil donnée au modèle change avec l'option, pour ne jamais lui promettre une
relecture qui n'aura pas lieu. Risque accepté en l'allumant : le texte d'un mail ou
d'un document lu dans le Chat peut chercher à faire écrire l'assistant ; l'écran le
dit. Mesuré : option refusée sans séance ; « Tout approuver » + option : parti sans
carte ; « Demander avant de modifier » + option : carte ; agent autonome + option :
parti, journal « sansAccord » ; **vrai tour OpenClaw sur un mail piégé** demandant
d'envoyer la liste des clients à une adresse extérieure, agent autonome et option
allumée : carte posée, refusée, rien n'est parti ; option retombée après
coupure de l'envoi.

**Missions « à chaque mail reçu » (0.16.0).** La passerelle relève `INBOX` toutes
les deux minutes, seulement si une mission en attend ; le curseur (UIDVALIDITY,
prochain UID) avance **avant** le traitement : un mail est confié au plus une fois.
Au premier passage, et quand la boîte change, il retient seulement où il en est :
un agent branché aujourd'hui ne traite pas les archives. Le mail est confié dans
une conversation à part, effacée ensuite archives comprises (§ 14.5), avec la
consigne qu'il est une donnée et jamais un ordre ; vérifié avec un mail qui
demandait d'envoyer un contrat à une adresse extérieure : signalé, non exécuté.

**Les critères de recherche viennent du modèle**, donc d'une source non fiable :

- **IMAP** : chaque valeur extérieure part en **littéral** (sa taille en octets,
  puis les octets). Le serveur la lit comme une donnée quoi qu'elle contienne.
  C'est structurel, pas un échappement : un critère contenant un guillemet, un
  retour à la ligne et une commande complète n'a injecté aucune commande à
  l'essai.
- **CalDAV** : les critères sont échappés en XML. Vérifié sur cinq charges, dont
  celle qui ferme l'élément courant pour en ouvrir un autre : aucun caractère
  structurant ne survit.

**Transport.** Certificat TLS vérifié, **sans option pour désactiver cette
vérification**, même « pour le développement » : c'est l'entrée classique d'une
interception. Réponses de taille bornée (un message de 50 Mo annoncé par un
serveur hostile : 0,8 Mo consommé). Connexion toujours refermée.

**Identifiants** chiffrés au repos, jamais rendus par l'état. Un mot de passe
erroné ne laisse rien enregistré. Les outils ne sont proposés au modèle que si un
compte est configuré : annoncer des outils absents le pousserait à s'acharner.

**Contraintes des fournisseurs**, vérifiées auprès d'eux :

- **Microsoft 365** a désactivé l'authentification basique dans tous les
  locataires, sans réactivation possible, ce qui interdit aussi les mots de
  passe d'application. IMAP y exige OAuth 2.0, **non implémenté** à ce jour.
- **Google** a coupé l'authentification basique en mars 2025 mais garde les
  mots de passe d'application comme exception explicite, pour IMAP, CalDAV et
  CardDAV. Un administrateur Workspace peut les interdire sur son domaine.

### 10.3 Google Drive et Slack

`gateway/src/drive.ts` et `gateway/src/slack.ts`, sur un client HTTPS commun sans
dépendance (`gateway/src/clientHttps.ts`). Aucun tiers de plus que le service
lui-même : l'instance parle directement à `oauth2.googleapis.com`,
`www.googleapis.com` et `slack.com`.

**Lecture seule, par construction et vérifiée.** Drive : portée `drive.readonly`
seule ; la portée accordée est relue dans la réponse de Google, et un accès sans
elle ou plus large est révoqué aussitôt, sans rien enregistrer. Seules des requêtes
GET partent vers l'API. Slack : cinq méthodes de lecture énumérées dans le code
(`METHODES`) ; à la connexion, les autorisations du jeton sont relues
(`x-oauth-scopes`) et tout jeton qui permettrait d'écrire est refusé, de même que
les jetons d'utilisateur (`xoxp-`), d'application (`xapp-`) et à rotation.

**Google** : chaque entreprise a son propre client OAuth (« Application de
bureau »), lu dans le profil de déploiement (`google.clientId`, `clientSecret`),
jamais livré avec le produit. Un client commun ferait de l'agence l'éditeur d'une
portée restreinte pour tout le parc. Redirection vers la boucle locale `127.0.0.1`
sur un port éphémère, ouvert le temps de l'autorisation (10 minutes au plus).
PKCE S256 ; `state` vérifié à durée constante. Page de retour sans script,
`Referrer-Policy: no-referrer`. Jeton d'actualisation chiffré deux fois au repos,
jeton d'accès en mémoire. Au débranchement, l'accès est révoqué chez Google. Un
refus de Google (`invalid_grant`) marque l'accès comme perdu : outils retirés,
écran « à reconnecter », trace `drive.acces_perdu`.

**Slack** : jeton de bot (`xoxb-`) d'une application créée par le client, depuis
le manifeste affiché à l'écran, chiffré deux fois au repos, transmis en en-tête et
jamais dans l'adresse. Une application interne garde les limites de débit
normales ; une application distribuée hors Marketplace serait limitée à une
lecture de 15 messages par minute (règle Slack de 2025-2026). Le débranchement
efface le jeton sans le révoquer chez Slack (il appartient à l'application du
client) ; l'écran le dit.

**Critères du modèle** : texte Drive échappé comme littéral du langage de requête
de Google puis encodé ; identifiants confrontés à l'alphabet de Google ; salon
Slack cherché parmi ceux que Slack a listés ; caractères de contrôle refusés. Le
contenu rendu au modèle est annoncé comme des données, pas des consignes. Outils
classés en lecture dans la barrière d'approbation **par leur nom exact**, pas par
préfixe ; et les identifiants des connecteurs intégrés (`courrier`, `agenda`,
`drive`, `slack`, `bureau`, `ecran`) sont refusés à un serveur MCP libre, qui
emprunterait sinon leur classement.

**Transport** : certificat toujours vérifié, sans option pour désactiver la
vérification ; TLS 1.2 minimum ; aucune redirection suivie ; réponses bornées (2 Mo
de JSON pour Drive, 4 Mo pour Slack, 1 Mo de document lu en partie, en le disant) ;
15 s d'inactivité et 40 s au total au plus.

**Portée de l'accès** : un connecteur branché vaut pour toute l'instance, comme le
courrier et l'agenda ; l'écran le dit.

Vérifié sur une passerelle d'essai reliée à de faux services locaux en HTTPS
(86 vérifications, rejouées sur le code final), dont : refus sans séance, états
sans secret, PKCE et `state`, port refermé, questions de bout en bout dans le Chat,
jeton expiré renouvelé, accès révoqué signalé, certificat inconnu refusé, aucun
secret dans le magasin, le journal ni la sortie, trafic limité à Google et Slack.
**Le branchement réel avec un vrai Google et un vrai Slack n'a pas été éprouvé.**

## 11. Ce qui n'est pas protégé

À savoir avant de vendre.

| Point | Situation | Conséquence |
|---|---|---|
| **Sandbox d'exécution des outils** | absente | Les outils fichiers s'exécutent sur le poste, dans le processus lancé par la passerelle. Seul le contrôle d'écran dispose d'un mode `sandbox` |
| **Injection par le contenu** | aucune barrière technique | L'agent lit des fichiers, du courrier, des agendas. Un texte piégé peut lui demander d'agir. Les protections réelles sont le périmètre de fichiers et la barrière d'approbation, qui retient par défaut toute modification |
| **Conditions de LM Studio** | acceptées par l'entreprise à l'installation | Logiciel fermé d'Element Labs, Inc. (États-Unis). Usage réservé aux besoins internes de l'organisation qui l'installe ; « application service provider » et « software-as-a-service » interdits (conditions du 23/08/2026). HelixAI installé par chaque organisation pour elle-même est dans le cadre ; une instance servie à d'autres organisations ne l'est pas : voir PROJET.md § 3.9 |
| **Jeton d'instance unique** | un seul jeton pour tout le parc | Les séances se révoquent une par une, le jeton non : le renouveler oblige à reconfigurer tous les postes |
| **Blocage des tentatives en mémoire** | non persisté | Un redémarrage de la passerelle remet les compteurs à zéro, et annule les défis de double authentification en cours |
| **Chiffrement au repos** | fichiers et PostgreSQL | Protège le disque, la base et ses sauvegardes. Pas une session utilisateur compromise, qui atteint le trousseau comme Helix. Noms de collections et heures d'écriture restent lisibles dans PostgreSQL |
| **Journal d'audit** | sur disque, chaîné et scellé | Détecte la falsification, pas la suppression du fichier. Et il n'est vérifiable après redémarrage que si le chiffrement est actif |
| **Journal rejouable** | absent | La trace dit qui a approuvé quoi et quand. Elle ne permet pas de rejouer une séquence ni de revoir ce que l'agent voyait. L'historique détaillé vit en mémoire et disparaît au redémarrage |
| **Contrôle d'écran en mode `hote`** | aucune restriction par application | Une action approuvée s'applique n'importe où sur l'écran. Le modèle se trompe régulièrement de cible : l'approbation est la seule protection réelle |
| **Google Drive, audience « Externe »** | limites Google | En mode Test, l'accès expire au bout de 7 jours ; en production sans vérification, écran « application non validée » et 100 utilisateurs au plus. Audience « Interne » (Google Workspace) : aucune de ces limites |
| **Nom de la marque dans les messages** | transmis par l'application de bureau | Une passerelle lancée à la main (serveur, développement) écrit « l'application » faute de nom |
| **Paquet non signé** | voir [SIGNATURE.md](./SIGNATURE.md) | macOS refuse le paquet à l'évaluation Gatekeeper |
| **Double authentification** | facultative, imposable | Chaque personne l'active pour elle-même ; `deuxFacteursObligatoire: true` dans le profil de déploiement l'impose à tous (§ 2.1) |
| **Premier mot de passe d'un compte ancien** | au jeton seul, une fois | Un compte créé avant 0.9.0 sans mot de passe choisit le sien à la connexion suivante. Quiconque tient le jeton pourrait le choisir avant le titulaire (avant, il ouvrait la séance directement) ; la fenêtre se ferme au premier usage (§ 2) |
| **Journal d'audit après suppression d'un compte** | conservé, borné | Il garde l'identifiant et l'adresse notée à la création, le temps de la durée de conservation (90 jours par défaut, réglable, § 4.2). La copie `journalCopie` n'est jamais purgée (§ 7.2) |
| **Bot de réunion** | invité d'une réunion Google Meet | Lit la page de Google par ses libellés : un changement de Google peut le casser, il le dit alors (« page illisible »). Pas éprouvé dans une vraie réunion à ce jour. Enregistrer une réunion suppose l'accord des participants : l'écran le rappelle, rien ne le vérifie (§ 16.3) |
| **Transcription et compte rendu** | automatiques | Whisper se trompe sur des noms (amorcé par ceux de l'équipe, mais pas infaillible) ; un petit modèle peut attribuer une tâche à la mauvaise personne. L'écran dit « relisez avant de diffuser » |
| **Clé de chiffrement en argument** | le temps de l'appel au trousseau | Visible des seuls processus du même compte, qui pourraient de toute façon lire la clé. Quatre méthodes de contournement essayées, aucune possible sans dépendance native : l'analyse est dans `gateway/src/secret.ts` |
| **Courrier Microsoft 365** | inaccessible | OAuth 2.0 non implémenté, et le mot de passe d'application y est interdit |
| **Coût des modèles distants** | à renseigner | La passerelle compte les jetons exactement, mais ne connaît pas le tarif de l'hébergeur : tant qu'il n'est pas saisi, le coût s'affiche « non renseigné » et n'est pas compté |
| **Quotas** | inexistants | Aucune limite d'usage par compte |

---

## 12. Recommandations de déploiement

1. **Restreindre l'accès réseau** à la passerelle (pare-feu, VLAN). Le jeton est
   une protection, pas une raison de l'exposer à Internet.
2. **Fournir un vrai certificat TLS** dès que l'instance sort d'un réseau de
   confiance. Les postes n'ont alors rien à accepter à l'aveugle.
3. **Transmettre le jeton hors bande** (gestionnaire de secrets), jamais par
   courriel en clair.
4. **Configurer `journalCopie`** pour tout client soumis à un audit.
5. **Laisser le chiffrement actif.** Sans lui, le journal d'audit n'est plus
   vérifiable d'une exécution à l'autre.
6. **PostgreSQL** dès que plusieurs personnes écrivent en même temps, avec le
   chiffrement assuré par le serveur de base de données.
7. **Livrer en mode `sandbox`** si le contrôle d'écran est activé.
8. **Sauvegarder** `<HELIX_DATA_DIR>` : comptes, projets, conversations et
   journal y vivent. Sauvegarder aussi la clé du trousseau, sans quoi la
   sauvegarde est illisible.

---

## 13. Avant un audit de sécurité offensive

Ce document est écrit pour être lu par une équipe d'audit, pas pour la rassurer.
En l'état, une revue sérieuse trouvera les points de la section 11 : ils y sont
parce qu'ils sont vrais, pas parce qu'ils sont acceptables.

| Chantier | État | Ce que l'auditeur constaterait sinon |
|---|---|---|
| Autorisation par utilisateur, côté serveur | ✅ fait | Un poste légitime lit les projets de tous les autres |
| Séance exigée pour les routes d'exécution | ✅ fait | Le jeton, présent sur chaque poste, valait exécution complète |
| Séances révocables, avec expiration | ✅ fait | Aucun moyen d'exclure une machine perdue |
| Limitation des tentatives de mot de passe | ✅ fait | Mots de passe des collègues attaquables sans limite |
| Mot de passe obligatoire pour tout compte | ✅ fait | Sur une instance partagée, le jeton suffisait à ouvrir le premier compte |
| Double authentification (TOTP) | ✅ fait, facultative | Un mot de passe deviné ou volé suffisait |
| Chiffrement de PostgreSQL | ✅ fait | La base et ses sauvegardes donnaient tout en clair |
| Écoute réseau fermée par défaut | ✅ fait | Passerelle joignable par tout le réseau |
| TLS sur instance partagée | ✅ fait | Jeton et conversations lisibles au fil |
| Chiffrement au repos | ✅ fait | Un accès disque donne tout, sans mot de passe |
| Journal d'audit chaîné et scellé | ✅ fait | Impossible de dire qui a fait quoi, ni de le prouver |
| En-têtes de sécurité, CSP | ✅ fait | Surface d'attaque de l'interface non contrainte |
| Approbation des outils fichiers | ✅ fait | Un agent écrit et supprime sans rien demander |
| Signature et notarisation | ❌ bloqué | Binaire non vérifiable, alerte au lancement |
| Imputation nominative des appels d'outils | ✅ fait | Le journal dirait « agent », pas qui |
| Imputation nominative des actions d'écran et des approbations | ✅ fait | Impossible de dire qui a approuvé une action sur une instance partagée |
| Suppression de compte (droit à l'effacement) | ✅ fait | Données d'une personne partie conservées sans base |
| Double authentification imposable à toute l'instance | ✅ fait | Un collègue sans second facteur reste le maillon faible |

Le blocage de la signature est administratif, pas technique. La procédure est
décrite dans [SIGNATURE.md](./SIGNATURE.md).

Une revue par un tiers reste nécessaire : ce document dit ce que nous avons
vérifié nous-mêmes, ce qui ne remplace pas un regard extérieur.

## 14. Employés OpenClaw

`gateway/src/employes.ts`, `gateway/src/serveurOutils.ts`. Décision et mesures :
PROJET.md § 3.4.

**L'instance OpenClaw est celle d'Helix, et d'elle seule.** Dossier d'état
`<données>/openclaw` (0700), configuration écrite par la passerelle en 0600 et
réécrite à chaque changement, jeton de passerelle tiré au hasard, écoute sur la
boucle locale (`gateway.bind: loopback`), port 18800. Les variables `HELIX_*` et
`ELECTRON_*` ne sont pas transmises au processus. Une installation personnelle
d'OpenClaw (`~/.openclaw`) n'est ni lue ni modifiée : vérifié pendant les essais, la
passerelle personnelle d'un développeur tournait sur la même machine et n'a pas été
touchée.

**Ce qui est coupé**, dans la configuration écrite par Helix : profil d'outils
`minimal` ; refus explicite de `group:runtime` (commandes système), `group:web`,
`group:ui` (navigateur), `group:nodes`, `group:media`, `group:automation`, `cron`,
`message`, `plugins`, `skill_workshop` ; `tools.elevated` désactivé ;
`tools.fs.workspaceOnly` ; aucune procédure intégrée (`skills.allowBundled: []`) ;
extensions réseau, navigateur, écran, voix et fournisseurs distants désactivées ;
télémétrie, vérification de mise à jour, catalogue de modèles distant et annonce mDNS
coupés ; rêves nocturnes de la mémoire désactivés.

**Ce qui passe par Helix** :

- **Le modèle** : un fournisseur par employé pointe sur `/v1` de la passerelle, avec
  le jeton d'instance **et** la clé des employés (`X-Helix-Cle`). La consommation est
  comptée au nom de l'employé (`employe:<id>`) seulement si la clé est valide : l'en-tête
  `X-Helix-Employe` seul, qu'un poste pourrait écrire, n'attribue rien.
- **Les outils** : `POST /helix/employes/<id>/outils` (MCP, sans état). Jeton
  d'instance exigé comme partout, plus la clé des employés, comparée en temps
  constant : le jeton d'instance est sur chaque poste du parc, la clé n'est que dans
  le dossier de données de l'instance (0600). Mesuré : sans la clé, 403 ; sans le
  jeton, 401. L'employé ne voit que les familles qu'on lui a données, relues à chaque
  appel (une pause ou un outil retiré s'applique tout de suite). Chaque appel passe
  par `verifierOutil` puis `executerOutil` (les mêmes que le Chat), et le journal
  consigne `outil.appele` au nom de `employe:<id>`.
- **Les approbations** : la carte dit quel employé demande. Un employé n'a pas de
  « demande » en cours, chaque accord ne vaut que pour une action. Le délai MCP
  d'OpenClaw est porté au-delà du délai d'approbation (deux minutes) : avant cela,
  l'appel était coupé avant la réponse et l'employé ne savait pas ce qui s'était
  passé. Un employé « autonome » (choix de son propriétaire, consigné) ne demande
  pas ; ses appels portent `sansAccord: true` au journal.
- **Les missions** : créées par Helix (`openclaw automations add --agent …`),
  jamais par l'agent, qui n'a pas l'outil de planification : une automatisation
  OpenClaw peut exécuter une commande système.

**Qui peut quoi.** Toute personne connectée voit l'équipe et parle à chaque employé,
dans sa propre conversation (`--session-key` dérivée de son compte par empreinte
SHA-256 : OpenClaw ramène les clés en minuscules, deux identifiants ne différant que
par la casse auraient partagé une conversation). Seule la personne qui l'a déployé
modifie, met en pause, lance une mission ou retire un employé (403 sinon, mesuré). Un
message en cours ne se suit que par son auteur (404 pour un autre, mesuré).

**Cloisonnement des conversations.** OpenClaw n'est pas une frontière de sécurité
entre personnes qui ne se font pas confiance. Les conversations sont séparées par
clé, et la fiche de poste interdit de rapporter à l'une ce que l'autre a dit (essai :
un code confié par une personne n'a pas été rendu à une autre qui le demandait). Les
notes de travail de l'employé, elles, sont communes : l'écran le dit sous la zone de
saisie.

**RGPD.** Les échanges de chaque personne avec les employés sont gardés par Helix
(collection interne `echangesEmployes`, chiffrée, 200 derniers par employé), inclus
dans l'export, et effacés avec le compte : Helix supprime aussi la conversation chez
OpenClaw (`sessions delete`) et sa mémoire indexée (`memory forget`), puis retire
les employés que la personne avait déployés (agent, automatisations, espace, sans
passer par la corbeille). Un effacement fait sans instance en marche est rattrapé au
démarrage suivant (balayage des automatisations, espaces et conversations sans
titulaire).

**Arrêt.** La passerelle arrête OpenClaw en partant. Tuée net, elle laisse un OpenClaw
orphelin qui garde le port : au démarrage suivant, il est reconnu par le numéro de
processus noté au lancement et par son nom, et arrêté ; un autre programme sur ce
port n'est jamais touché (essai : `kill -9` de la passerelle, reprise propre).

### 14.1 Paliers, canaux et journal (0.12.0)

**Paliers.** La politique d'outils n'est plus globale : le socle est fermé
(profil `minimal`, `exec.mode: deny`, fichiers limités à l'espace), et chaque agent
l'ouvre selon son palier (`politiqueOutils`, `employes.ts`). Refusés à tous les
paliers : `gateway` (la configuration d'OpenClaw), `plugins`, `skill_workshop`, les
appareils appairés, l'écran et le terminal : un employé ne défait pas lui-même le
verrouillage d'Helix. Étendu : web, navigateur, messages ; ni commandes ni rappels
(une automatisation OpenClaw peut exécuter une commande). Libre : `exec` en mode
`full` sur la machine de l'instance, rappels, sous-agents, fichiers hors de son
espace. Passer à Libre redemande le mot de passe (et le code si le second facteur est
actif), à la route (`confirmerLibre`), et le changement est consigné
(`employe.liberte`). Mesuré : sans mot de passe, 400 ; mot de passe faux, 403.

**Canaux.** Les jetons (Telegram, Discord, Slack, Mattermost) sont gardés par Helix
(collection interne `secretsCanaux`, chiffrée) et passés au processus OpenClaw par son
environnement ; la configuration n'en porte que la référence
(`{ source: "env", id: "OC_…" }`). Vérifié : le jeton n'apparaît pas dans
`openclaw.json`, et Telegram l'a bien reçu (refus d'un faux jeton). Chaque compte de
messagerie est routé vers son seul employé ; pas de groupes d'office ; chaque
expéditeur a sa conversation (`session.dmScope: per-account-channel-peer`). Accès par
appairage (le propriétaire accepte dans Helix) ou liste fixe. Pour tout expéditeur venu
d'un canal, `toolsBySender["*"]` refuse les commandes, les rappels et, sauf choix
contraire, les outils de l'entreprise ; vérifié : les conversations ouvertes depuis
Helix gardent leurs outils. **Les commandes de discussion d'OpenClaw sont coupées**
(`commands.*: false`) et `commands.ownerAllowFrom` est rempli d'une valeur inerte : sans
cela, la première personne acceptée sur un canal devenait « propriétaire » d'OpenClaw
(`/config`, approbations d'exécution). La session WhatsApp (liaison Baileys) vit dans
le dossier d'état d'OpenClaw (0700) ; retirer le canal ou l'employé la délie.

**Journal.** Les outils d'OpenClaw (recherche, navigateur, commandes, messages) sont
recopiés du registre d'activité d'OpenClaw vers le journal d'Helix toutes les cinq
minutes et à l'ouverture de l'onglet Activité (`employe.outil_openclaw`) : l'outil,
l'issue et l'heure, **pas le contenu** (OpenClaw ne le garde pas). Vérifié : une
recherche web et un `exec` y figurent.

**Extensions installées à la demande** depuis npm, dans le dossier d'état de
l'instance : `@openclaw/duckduckgo-plugin` (recherche web), `@openclaw/whatsapp`,
`@openclaw/discord`, `@openclaw/slack`, `@openclaw/mattermost`. Ce sont des
téléchargements de code, listés dans README § « Ce qui sort de la machine ».

### 14.2 Installation d'OpenClaw depuis l'interface (0.13.0)

`gateway/src/installationOpenClaw.ts`, route `POST /helix/openclaw/installer` (séance
exigée, dans la table `EXECUTION` : installer un logiciel engage quelqu'un ; consigné
`openclaw.installe` ou `openclaw.installation_echouee`). Aucun script téléchargé n'est
exécuté : la passerelle refait les étapes de l'installateur « sans root »
d'OpenClaw. Node vient de `nodejs.org` en HTTPS, et l'archive est comparée à
l'empreinte de `SHASUMS256.txt` avant d'être ouverte ; une différence arrête tout.
OpenClaw vient de `registry.npmjs.org`, à une version fixée (celle qu'Helix a
éprouvée) ; npm 11.16+ n'autorise les scripts d'installation que pour le paquet
`openclaw`. Les variables `HELIX_*`, `ELECTRON_*` et `npm_*` ne passent pas aux
commandes d'installation. Tout reste dans `<données>/openclaw-moteur`, qui passe avant
toute autre installation d'OpenClaw trouvée sur la machine. Limite : l'empreinte de
Node est lue sur le même site que l'archive (HTTPS), sans vérification de la signature
GPG des publications de Node.

### 14.3 Agents mis en service automatiquement (0.14.0)

Seul le propriétaire d'un agent le met en service (le poste de son propriétaire
déclenche le déploiement). Visibilité reprise de l'agent : un agent « Personnel » est
filtré de la liste de l'équipe, et toutes ses routes (`/helix/employes/<id>/…`)
répondent 404 aux autres comptes, avant tout traitement (mesuré). Supprimer l'agent
retire son employé (missions, espace, conversations).

### 14.4 Documents de référence d'un agent (0.15.0)

Routes `GET`/`POST /helix/employes/<id>/documents` et
`POST …/documents/<nom>/supprimer` ; seul le propriétaire ajoute ou retire (403
sinon, 404 pour un agent personnel d'un autre). Déposés dans l'espace de l'agent
(`documents/`, 0600), 1 Go et 40 documents au plus, écrits en flux sous un nom caché
puis renommés une fois complets. Le nom est réduit à son dernier
segment, sans caractère de contrôle ni fichier caché (mesuré : `../../evil.txt`
devient `documents/evil.txt`, `.env` est refusé). Le texte des PDF et documents Office
est extrait sur le poste qui l'envoie (`src/lib/documents.ts`), à côté du fichier
(`<nom>.helix.txt`). Au journal : le nom et la taille, jamais le contenu. Ils partent
avec l'agent. Les personnes qui lui écrivent sur une messagerie peuvent lui faire
citer ces documents : l'écran le dit.

### 14.5 Mails confiés, archives de conversations, mise à jour d'OpenClaw (0.16.0)

**Archives.** `openclaw sessions delete` garde une archive compressée de la
conversation supprimée (ligne de `session_transcript_archives` dans la base de
l'agent, fichier `*.deleted.*` qui en dérive), « consultable » selon sa propre aide,
jusqu'à ce que la place manque. Mesuré le 14/09/2026. `effacerArchives`
(`employes.ts`) retire la ligne puis le fichier, comme la rétention d'OpenClaw
elle-même, par le Node d'OpenClaw (`node:sqlite`, qui attend son tour si OpenClaw
écrit). Appelé après chaque suppression : effacement d'un compte (archives de remise
à zéro de ses conversations comprises), balayage au démarrage (conversations de
comptes disparus), conversation d'un mail. Vérifié : l'archive d'une conversation
supprimée disparaît, celle d'une personne encore là reste. La rétention d'OpenClaw
(`session.maintenance.resetArchiveRetention`) est aussi ramenée à une seconde.

**Mise à jour d'OpenClaw.** `POST /helix/openclaw/installer` sur une installation
existante devient une mise à jour, **vers la version éprouvée seulement, et jamais vers
une plus ancienne** (409) : OpenClaw fait migrer sa base sans retour possible (mesuré :
2026.9.3 refuse une base écrite par 2026.9.4, « schema version 17; this build supports
16 »). Déroulé : instance arrêtée, aucune relance possible pendant l'opération
(`enMaintenance`), données recopiées (hors caches) dans
`<données>/openclaw-avant-mise-a-jour` (0700), paquet installé, redémarrage vérifié ;
en cas d'échec, l'ancienne version est réinstallée et les données remises (vérifié :
version inexistante, retour automatique, agents en marche). La copie est effacée dès
la réussite : elle contient les conversations de chacun, qu'un effacement de compte
ne doit pas laisser derrière lui. Au journal : `openclaw.mis_a_jour` (de, vers) ou
`openclaw.installation_echouee`. Les messages de npm sont traduits (version non
publiée, registre injoignable, disque plein, droits) : jamais de chemin de la machine
à l'écran.

## 15. Modèles cloud par clé

`gateway/src/fournisseurs.ts`. Une clé est vérifiée chez le fournisseur avant d'être
gardée (collection interne `clesModeles`, chiffrée) ; elle ne ressort jamais (l'écran
voit ses quatre derniers caractères, l'export aussi). Portée : la personne seule, ou
toute l'équipe. Un modèle d'une clé personnelle n'est ni listé ni servi à un autre
compte (mesuré : invisible dans `/helix/models` pour un collègue, et 503 « réservé »
s'il est demandé) ; un employé y a accès si son propriétaire est le titulaire. Aucun
modèle d'une clé n'est choisi d'office (mesuré : sans modèle demandé, la passerelle a
pris le modèle local). Une adresse « compatible OpenAI » saisie à la main doit être en
https (la clé part avec chaque requête), sauf sur la boucle locale. Chaque modèle
affiche le pays du service ; brancher un fournisseur hors UE affiche un avertissement.
Clés branchées, modifiées, retirées : au journal, sans la clé. Effacement d'un compte :
ses clés partent avec lui ; export : fournisseur, modèles, quatre derniers caractères.

## 16. Groupes, bibliothèque, réunions (0.16.0)

### 16.1 Groupes

`gateway/src/groupes.ts`, collection interne `groupes`. Tous les comptes voient la
liste et les membres (l'annuaire de l'équipe, comme l'écran de connexion) ; seuls
les responsables renomment, changent les membres, nomment d'autres responsables,
suppriment (403 sinon) ; il reste toujours un responsable, et le dernier ne part
qu'après en avoir nommé un autre (409). Les membres sont vérifiés contre les comptes
existants. Ce que la personne voit « par groupe » est calculé par l'instance à chaque
requête (`demandeur()` → `groupesDe`). 16 essais, tous passés : droits, doublon de nom,
partage d'une conversation au groupe vu, puis retiré avec le membre.

### 16.2 Bibliothèque

`gateway/src/bibliotheque.ts`. Métadonnées dans la collection interne
`bibliotheque` ; contenus dans `<données>/bibliotheque/<id>` (0600), **chiffrés** par
la clé des données (AES-256-GCM, `chiffrerOctets`), liés à leur identifiant par les
données associées : un fichier recopié sous un autre nom ne se déchiffre pas. En-tête
`HLXF1`, ou `HLXF0` pour un contenu écrit en clair faute de clé (ce que l'écran dit
déjà, `chiffrementActif`). Le texte extrait sur le poste est chiffré de même.

Règles, vérifiées par 23 essais : on voit ce qui est à soi, ouvert à toute l'équipe,
ou partagé à un de ses groupes ; un document partagé depuis un dossier privé apparaît
à la racine du destinataire, le dossier reste invisible (404) ; seul le propriétaire
renomme, déplace, change la visibilité ou supprime (403) ; on ne partage qu'à ses
propres groupes ; on ne dépose que dans un dossier qu'on voit ; un dossier ne va pas
dans lui-même ; un dossier qui contient le document d'un collègue ne se supprime pas
(409) ; les contenus supprimés quittent le disque. Nom réduit à une ligne sans
caractère de contrôle ni chemin (mesuré : `../../contrat.txt` sans barre), emoji limité
à un symbole. Téléchargement en `application/octet-stream` et `attachment` : un
document partagé ne s'exécute jamais dans la page.

**Envois et relectures en flux (0.17.0).** Jusqu'à 1 Go par document. Le corps de
l'envoi est binaire (`televersement.ts` : longueur de l'en-tête, en-tête JSON avec
nom, emplacement, visibilité et texte extrait, puis le fichier) ; les droits sont
vérifiés avant de lire un octet du fichier, qui s'écrit au fil de l'eau sous un nom
provisoire, n'apparaît qu'une fois complet, et n'est inscrit qu'après une seconde
vérification du dossier. Chiffrement par tranches de 4 Mo (`secret.ecrireEnFlux`,
format « HLXF2 ») : chaque tranche est liée à sa place et à son rang, un
enregistrement final porte la taille ; la relecture (`lireEnFlux`) vérifie chaque
tranche avant de la transmettre et refuse une tranche modifiée, permutée ou venue
d'un autre fichier, ou un fichier raccourci. Mesuré : 300 Mo et 1 Go déposés sans que
la mémoire de la passerelle bouge (quelques Mo), relus identiques à l'octet ; un
octet modifié coupe le téléchargement avant la tranche fautive ; des tranches
retirées ne sont jamais rendues comme un fichier complet ; une taille annoncée
au-delà d'1 Go est refusée avant lecture, un envoi qui ment sur sa taille est coupé
à 1 Go sans rien laisser. Place disque vérifiée avant d'accepter (marge de 512 Mo).
Les documents déposés avant (« HLXF1 », un bloc) et l'ancien envoi en JSON (postes
d'une version antérieure) restent acceptés. La passerelle laisse deux heures au
corps d'une requête (Node en coupait toute requête au bout de cinq minutes : un
gros envoi vers une instance distante échouait à coup sûr) ; les en-têtes restent
bornés à une minute. Au-delà de 100 Mo, le texte n'est pas extrait sur le poste :
le document est gardé, et l'écran le dit.

Outils `bibliotheque__chercher` et `bibliotheque__lire`, en lecture ; depuis la
0.18.0, `bibliotheque__lire` rend des passages de 15 000 caractères (paramètre
`depuis`, la réponse dit où reprendre), et la recherche donne la position de
l'extrait. La boucle du Chat coupe tout résultat d'outil à 20 000 caractères : la
coupe est désormais signalée au modèle, qui croyait sinon avoir tout lu. Outils (jamais soumis à
accord au niveau « modifications »). Dans le Chat, ils voient ce que voit la personne ;
chez un agent toujours actif, que plusieurs personnes joignent, seulement ce qui est
ouvert à toute l'équipe (mesuré : un document partagé à un groupe reste introuvable).
Les identifiants de connecteur `bibliotheque` et `reunions` sont réservés : un
serveur MCP ajouté sous ce nom n'hérite pas du laissez-passer de lecture.

### 16.3 Réunions et bot

`gateway/src/reunions.ts`. Le son arrive par la route `…/audio`, lue **en flux** par
tranches de 4 Mo, chacune chiffrée (`reunions:<id>:audio`) et ajoutée au fichier ;
2 Go au plus par réunion (ce qui dépasse est coupé, ce qui a été reçu reste compté et
transcriptible). Seul l'auteur envoie du son, et seulement pendant
l'enregistrement (409 ensuite). Depuis la 0.17.0, le son n'est plus reconstitué en
mémoire : il est déchiffré morceau par morceau vers le fichier temporaire, et relu en
flux pour l'écoute. Pour transcrire, le son est déchiffré dans un fichier
temporaire (0600, `wx`) du dossier de la dictée, **toujours supprimé**, succès comme
échec ; format reconnu à ses premiers octets (sept conteneurs, rien d'autre n'atteint
le décodeur). Whisper tourne par le script constant du module, lancé sans shell, hors
ligne, avec un délai (deux fois la durée du son, vingt minutes au moins). Sauf
réglage, l'audio est effacé dès la transcription faite. Transcription chiffrée à
part ; compte rendu dans la collection interne `reunions`. Même visibilité que la
bibliothèque ; `reunion.consultee` au journal quand quelqu'un d'autre que l'auteur
l'ouvre.

**Compte rendu** (`completion.ts`) : un modèle de la machine, à défaut celui du
prestataire, **jamais** celui d'une clé personnelle ; le modèle et son pays sont
gardés et affichés. La consigne dit que la transcription est une donnée, pas une
instruction. Outils `reunions__chercher` et `reunions__lire` dans le Chat, en lecture,
selon la visibilité.

**Le bot** (`electron/botReunion.cjs`, `electron/botPreload.cjs`) : une fenêtre
cachée de l'application de bureau, dans sa propre session (`persist:helix-bot`), qui
ne navigue que vers meet.google.com et accounts.google.com, n'ouvre aucune autre
fenêtre, et à qui micro, caméra et notifications sont refusés. Son son n'est pas joué
sur la machine (fenêtre muette). **Isolation de contexte coupée pour cette seule
fenêtre** : c'est ce qui permet au préchargement d'observer les connexions WebRTC de
la page. Contreparties : `nodeIntegration` et bac à sable restent en place, le
préchargement n'expose rien à la page, et le seul canal qu'il ouvre (`helix:bot-morceau`)
transporte du son vers la réunion que ce bot enregistre, identifiée par la fenêtre
émettrice et non par le message. Le processus principal envoie ces morceaux à
l'instance avec la séance de la personne, gardée en mémoire le temps de la réunion,
jamais écrite ; par une session réseau dédiée qui n'accepte un certificat auto-signé
que s'il est celui que la fenêtre de l'application a retenu. Lien vérifié deux fois
(passerelle et processus principal) : Google Meet seulement.

Il rejoint comme invité, sous le nom réglé (par défaut « Prise de notes <produit> »),
et part quand la réunion finit, quand il reste seul deux minutes, au bout de quatre
heures, ou sur ordre. Refusé, non admis en quinze minutes, ou page illisible : il le
dit et n'enregistre rien. Envoi automatique aux réunions de l'agenda qui ont un lien
Google Meet, si la personne l'a demandé, dédoublonné par l'instance (un événement, un
bot). Un compte Google peut être connecté au bot par la personne elle-même, sur la
page de Google, dans la session du bot ; « Déconnecter » en efface les données.

Vérifié le 14/09/2026 avec le vrai code face à une réunion simulée (mêmes libellés
que Google Meet en français, vraie connexion WebRTC entre deux pairs) : sans micro,
nom, demande, attente, admission, enregistrement, fin détectée, morceaux reçus et
chiffrés, transcription juste (noms de l'équipe bien orthographiés), compte rendu.
**Pas encore dans une vraie réunion Google Meet.**

### 16.4 « Depuis Helix »

`gateway/src/espace.ts`, routes `GET /helix/espace` et `/helix/espace/fichier`, sous
séance : parcourir et relire le dossier de travail de l'équipe (celui que les agents
voient déjà), 1 Go par fichier (relu en flux, ouvert sans suivre de lien et mesuré sur
le descripteur : un fichier remplacé par un lien entre la vérification et la lecture
n'emmène pas hors du dossier), 500 entrées. Chaque chemin est résolu par `realpath` et comparé
à la racine réelle : `..`, chemin absolu et lien symbolique qui sort du dossier sont
refusés (400, 403) ; un tel lien n'est même pas listé (sa taille trahirait la
cible). Fichiers cachés omis. Mesuré : `../helix.config.json` 400, lien vers
`/etc/hosts` 403 et absent de la liste.


---

## 17. Passe de sécurité du 18 septembre 2026 (0.22.0)

Demandée par le client : « je veux un tour complet sur la sécurité, les failles, et
je ne veux plus aucun souci ». Deux relectures complètes ont été menées en parallèle
et **en lecture seule** — l'une sur la passerelle (51 fichiers, environ 30 000
lignes), l'autre sur Electron, l'interface et l'empaquetage. Chaque trouvaille a
ensuite été vérifiée dans le code avant correction : on ne corrige pas un rapport, on
corrige ce qu'on a vu.

Vingt-trois défauts retenus, tous corrigés dans 0.22.0. Ils sont listés ci-dessous
dans l'ordre de gravité, avec ce qu'ils permettaient et ce qui les ferme.

### 17.1 Critiques

**C1 — Les demandes d'approbation étaient ouvertes à tout porteur du jeton
d'instance.** `GET /helix/approbation` et son flux d'évènements ne figuraient pas
dans `EXECUTION` : ils ne demandaient donc pas de séance, et rendaient la demande
**entière**, `detail` compris. Or ce détail porte, pour un envoi de mail, le message
tel qu'il partira — destinataires résolus, objet, corps complet — et, pour un outil
de fichiers, le chemin absolu visé. Un poste du parc, qui détient le jeton par
construction, lisait ainsi en temps réel la correspondance qu'un agent préparait pour
un collègue. Même chose pour `GET /helix/computer`, qui rendait l'action d'écran
entière, texte à saisir compris — le flux équivalent avait été fermé, pas la route
d'état.

*Correction :* les quatre routes exigent une séance. Et, surtout, une `Demande` porte
désormais le compte qu'elle concerne (`Demande.pour`) : `enAttente()` et le flux ne
montrent à chacun que les siennes.

**C2 — N'importe quelle séance répondait à la demande de n'importe qui.**
`repondre()` consignait l'auteur de la réponse mais ne le comparait à rien, et la
demande ne retenait pas pour qui elle avait été posée. Combiné à C1, un collègue
lisait l'identifiant d'une demande sur le flux et autorisait l'envoi d'un mail
préparé pour quelqu'un d'autre. Le journal nommait alors correctement l'approbateur,
mais le mail était parti.

*Correction :* `repondre()` refuse (404) toute réponse dont l'auteur n'est pas la
personne concernée. **Vérifié par un essai à deux comptes** : Chloé voit sa demande,
Marc ne la voit pas, la réponse de Marc est refusée, celle de Chloé passe.

**C3 — Injection de chemin dans l'API OpenCode locale.** `body.sessionID` était
interpolé tel quel dans une URL, et `fetch` normalise les segments `..` : un corps
JSON contenant `x/../../api/<autre>?` faisait appeler par la passerelle un tout autre
point d'entrée d'OpenCode, **avec l'en-tête d'autorisation du serveur**, et — sur la
route des évènements — renvoyait la réponse telle quelle à l'appelant. C'est-à-dire
une lecture libre d'une API qui sait lire des fichiers et lancer des commandes, en
contournant la barrière d'approbation.

*Correction :* `^[A-Za-z0-9_-]{1,64}$` exigé avant toute interpolation, sur les trois
routes concernées.

**C4 — Une instance ouverte au réseau pouvait servir en clair.** `config.ts`
déclenchait l'écoute réseau sur `HELIX_GATEWAY_HOST`, mais `tls.ts` ne décidait de
chiffrer que sur `share: true` ou la valeur exacte `0.0.0.0`. Une adresse d'écoute
nommée — `192.168.1.10`, `::`, le nom de la machine — ouvrait donc l'instance en
clair, jetons compris, sans que rien ne le signale.

*Correction :* une seule fonction décide, `surLeReseau()` dans `config.ts`, et les
deux modules la lisent.

**C5 — L'adresse d'instance était complétée en `http://`.** Le champ demande
« l'adresse de l'instance » ; personne n'écrit `https://` à la main. Une adresse
saisie sans schéma devenait `http://…`, et chaque requête portait ensuite le jeton
d'instance **et** le jeton de séance en clair dans ses en-têtes.

*Correction :* HTTPS supposé par défaut (`normaliseUrl`), et `probeInstance` refuse
une instance distante en clair, au lieu de l'accepter en silence. La boucle locale
garde HTTP : rien n'y sort de la machine.

### 17.2 Importants

**I1 — Un agent autonome traitant un mail reçu pouvait modifier sans demander.** Le
garde-fou posé en 0.18.0 ne couvrait que `courrier__envoyer`. Un message venu de
l'extérieur pouvait donc encore faire écrire, déplacer ou supprimer des fichiers, ou
écrire dans un service branché, sans qu'aucune personne ne voie rien.

*Correction :* pendant le traitement d'un mail reçu, **tout ce que `modifie()`
classe comme modifiant** repasse par une carte d'accord, et ce forçage traverse même
le niveau « Tout approuver ». La lecture reste libre : c'est ce pour quoi l'agent a
été déclenché.

**I2 — Rendre un agent « autonome » ne demandait rien.** Ouvrir le palier « libre »
exigeait le mot de passe ; rendre l'agent autonome, qui retire la barrière
d'approbation elle-même, ne demandait qu'un interrupteur.

*Correction :* les deux réglages passent par `confirmerIdentite` (mot de passe, et
code si la double authentification est active). L'écran des agents demande le mot de
passe pour l'un comme pour l'autre, en disant lequel.

**I3 — Les séances survivaient au changement de mot de passe.** `revokeAll` n'était
appelée qu'à la suppression d'un compte. Or on redéfinit un mot de passe par l'outil
local précisément parce qu'on a perdu la main : le jeton de séance de l'intrus
restait valable douze heures, et jusqu'à trente jours tant qu'il s'en servait.

*Correction :* `definirMotDePasse` et `retirerDeuxFacteurs` ferment toutes les
séances du compte, et le journal dit combien.

**I4 — Le journal d'audit était lisible en entier par tout compte.** Il dit qui s'est
connecté et quand, quels fichiers chaque agent a touchés, quels documents ont été
ouverts, quelles boîtes sont branchées : la carte complète de l'activité des
collègues.

*Correction :* chacun y voit les siennes, plus celles que l'instance s'attribue à
elle-même (« systeme ») — démarrages, migrations, purges, qui ne nomment personne. La
vérification d'intégrité reste globale : elle ne rend que des compteurs, et une
chaîne rompue doit être visible de tous. *Limite assumée :* il n'y a pas encore de
rôle d'administrateur, donc pas de vue d'ensemble pour qui aurait à en répondre.

**I5 — SSRF authentifiée par l'essai d'un fournisseur de modèles.** Avec le
fournisseur « compatible », l'adresse vient de la personne et c'est l'instance qui se
connecte. Tout hôte HTTPS était joignable, redirections suivies : le réseau interne
de l'entreprise se balayait depuis le serveur, et la réponse revenait à l'appelant.

*Correction :* le nom est résolu et l'adresse refusée si elle tombe dans une plage
interne (RFC 1918, lien-local, CGNAT, unique-local) ; `redirect: "error"` interdit le
saut par redirection. La boucle locale reste admise, et seulement elle : c'est la
raison d'être du fournisseur « compatible » (LM Studio, Ollama installés sur la
machine). Mesuré : `https://192.168.1.10/v1` refusé, `http://127.0.0.1:…` accepté.

**I6 — Références directes non contrôlées sur deux routes d'agents.**
`GET /helix/employes/<id>/activite` et `…/documents` ne vérifiaient pas le
propriétaire : un agent d'organisation livrait à tous le résultat de ses missions et
les noms des fichiers qu'on lui avait confiés. Toutes les autres routes de la famille
le vérifiaient.

*Correction :* contrôle du propriétaire sur les deux.

**I7 — La liste ouverte des comptes disait lesquels n'ont pas de mot de passe.**
`GET /helix/data/accounts` est volontairement lisible au jeton seul (l'écran de
connexion la demande avant toute séance) et publiait `hasPassword`. Or
`POST /helix/auth/premier-mot-de-passe` ouvre une séance à qui pose le premier mot de
passe d'un compte qui n'en a pas : publier la liste des comptes à prendre revenait à
la servir.

*Correction :* `hasPassword` disparaît de la liste ouverte. L'écran de connexion
demande le mot de passe à tout le monde ; l'instance répond « à définir » pour le
seul compte visé.

**I8 — Aucune limitation de débit.** `GET /helix/export` relit tout le magasin **et**
quatre-vingt-dix jours de journal en une requête ; `GET /helix/audit` relit et
rehache le fichier du jour deux fois. Quelques appels simultanés d'une seule séance
suffisaient à faire tomber le processus — c'est-à-dire à arrêter le produit pour tout
le monde.

*Correction :* `gateway/src/debit.ts`, fenêtre glissante en mémoire, par appelant
(jeton de séance, à défaut adresse), sur l'export, l'audit, la dictée et les quatre
routes d'authentification. Mesuré : 30 appels passent, le 31e reçoit 429 avec
`Retry-After`.

**I9 — Toute séance déplaçait le bac à sable de tous les agents.**
`POST /helix/mcp/workspace` change un dossier **commun à l'instance**. Sur un poste
personnel, c'est un geste ordinaire ; sur une instance partagée, c'était le moyen
d'ouvrir à toute l'équipe n'importe quel dossier de la machine hôte.

*Correction :* sur une instance partagée (profil `share`, ou écoute réseau), le
changement demande le mot de passe. Sur un poste personnel, rien ne change : il n'y a
personne d'autre à protéger.

**I10 — La clé cloud « équipe » se dépensait sans nom en face.**
`POST /v1/chat/completions` s'utilise légitimement au seul jeton d'instance (API
compatible, OpenCode) et servait aussi les modèles branchés par clé de portée
« équipe » : la facture de l'entreprise, à qui détient un jeton présent sur chaque
poste.

*Correction :* sans séance **et** depuis une autre machine, les modèles par clé sont
écartés. La boucle locale reste servie : c'est la machine de l'instance qui parle à
elle-même. Les modèles locaux et ceux de l'instance restent ouverts à tous.

**I11 — `contextIsolation: false` sur la fenêtre qui charge Google Meet.** Le
préchargement partageait le realm de la page de Google. Aucun chemin vers Node n'a
été trouvé (`nodeIntegration: false`, `sandbox: true`, rien exposé sur `window`),
mais du code hostile sur la page pouvait remplacer `MediaRecorder` et faire écrire à
l'instance un flux audio choisi, transcrit puis résumé par un modèle : un canal
d'injection de prompt à provenance apparemment fiable.

*État :* réglage inchangé pour l'instant — la capture des pistes WebRTC en dépend —
mais le point est documenté ici et inscrit dans les travaux restants (passer par
`webFrame.executeJavaScript` depuis un préchargement isolé). En attendant, l'audio
d'un bot est à considérer comme une entrée non fiable.

**I12 — La politique de sécurité du contenu ne s'appliquait pas.** Elle était posée
par un en-tête via `session.webRequest.onHeadersReceived`, qui n'intercepte pas les
requêtes `file:` — or l'application livrée charge `index.html` depuis le disque.
L'application empaquetée n'avait donc **aucune** politique. Et celle qui était écrite
laissait de toute façon `connect-src 'self' http: https: ws: wss: data:`, c'est-à-dire
tout Internet, ce qui contredisait le commentaire du fichier.

*Correction :* la politique est posée **dans la page**, à la construction
(`vite.config.ts`), et vérifiée dans `dist/index.html`. `script-src 'self'` est
possible parce que le script de thème, jusqu'ici en ligne, est devenu
`public/theme.js`. `connect-src` ne laisse plus passer que HTTPS et la boucle locale
— l'adresse d'instance est celle du client, inconnue à la construction, ce qui reste
une limite assumée. L'en-tête demeure pour le cas d'une interface servie en HTTP, et
les deux doivent rester d'accord.

**I13 — Acceptation silencieuse du premier certificat rencontré.** La règle de la
première rencontre retenait n'importe quelle empreinte, pour n'importe quelle
origine, avec pour seule trace un `console.log` invisible dans une application
livrée. Quelqu'un présent au moment de la mise en route d'un poste obtenait un
interception permanente et légitimée.

*Correction :* une fenêtre modale affiche l'origine et l'empreinte SHA-256, et ne
retient rien sans un accord explicite. Comme ssh, qui *demande*.

### 17.3 Mineurs, corrigés

| # | Défaut | Correction |
|---|---|---|
| m1 | `will-navigate` comparait les origines : sous `file:`, toutes les pages du disque partagent l'origine « null », donc une navigation vers un fichier HTML quelconque du poste passait, et cette page héritait du préchargement et du stockage local, jetons compris | Comparaison de l'adresse elle-même ; seule la page en place, rechargée, est admise |
| m2 | Cinq canaux IPC ne vérifiaient pas l'expéditeur (dont l'ouverture d'un lien externe et l'installation d'une mise à jour) | Même garde que les canaux du bot, qui l'appliquaient déjà |
| m3 | Le jeton d'instance était imprimé sur la sortie standard à chaque démarrage, donc dans le journal de `launchd` ou `systemd`, lisible plus largement que son fichier en 0600 | On imprime le chemin du fichier, pas le jeton |
| m4 | Toute exception imprévue renvoyait son message au client : chemins absolus, erreurs d'OpenSSL, messages de la base | Une référence courte au client, le détail au journal du serveur |
| m5 | Les secrets des connecteurs étaient chiffrés sans données associées : une enveloppe recopiée d'ailleurs se serait déchiffrée | Enveloppe liée à sa place (`connecteurs#<id>#<variable>`) ; les anciennes continuent de se lire |
| m6 | Le contrôle de code web suivait les liens symboliques en listant un dossier | `lstat`, et les liens sont ignorés |

### 17.4 Ce qui a été examiné sans rien trouver

Dit explicitement, parce qu'une absence de trouvaille n'a de valeur que si l'on sait
ce qui a été regardé.

- **Injection de commande** : aucun `shell: true`, aucune concaténation d'entrée dans
  une commande. Tout passe par `execFile`/`spawn` avec un tableau d'arguments.
- **Injection CR/LF dans les protocoles** : SMTP refuse toute commande contenant `\r`
  ou `\n` ; l'encodage des en-têtes de courrier bascule en base64 dès qu'un caractère
  sort de l'ASCII visible ; les adresses sont validées une à une.
- **Cryptographie** : AES-256-GCM, IV de 12 octets tiré à chaque opération (aucune
  réutilisation, y compris par tranche dans les écritures en flux), données associées
  liées à la collection et au rang de tranche, enregistrement de fin qui porte la
  taille totale. PBKDF2-SHA256 à 210 000 itérations, sel par compte,
  `timingSafeEqual` partout, pas de fenêtre TOTP rejouable. Certificats toujours
  vérifiés, sans réglage pour s'en passer.
- **Traversée de chemin** : rien d'exploitable. `espace.ts` rejette l'absolu et `..`,
  résout par `realpath`, ouvre avec `O_NOFOLLOW` et mesure sur le descripteur — le
  traitement correct de la course entre vérification et lecture.
- **Expressions régulières** : aucune à quantificateurs imbriqués sur une entrée non
  bornée ; celles construites dynamiquement échappent leurs métacaractères.
- **Fusion des collections** (`authz.ts`) : un envoi ne peut ni s'approprier un
  enregistrement, ni effacer ce qu'il n'a pas le droit de supprimer, ni élargir un
  partage dont il n'est qu'invité, ni lire le profil d'autrui.
- **Interface React** : aucun `dangerouslySetInnerHTML`, `innerHTML`, `eval` ni
  `new Function` dans tout `src/`. Le Markdown des modèles est rendu en nœuds React ;
  les liens n'y sont volontairement pas cliquables. Tous les `target="_blank"`
  portent `rel="noreferrer"`.
- **Pont preload** : surface minimale (sélecteur de dossier natif, état de mise à
  jour, pilotage du bot). Aucun accès au système de fichiers, à `child_process`, ni à
  une lecture de secret ; pas de canal passe-plat.
- **Mise à jour** : adresse figée dans le paquet, HTTPS exigé à la construction et au
  démarrage, installation automatique conditionnée à une signature d'éditeur vérifiée
  par `codesign`, pas de rétrogradation.
- **Contrôles d'interface pris pour des contrôles de sécurité** : aucun cas trouvé où
  un bouton caché est le seul garde-fou. Les filtres de l'interface doublent des
  contrôles que la passerelle applique de son côté.

### 17.5 Ce qui restait ouvert après cette passe

Cinq points, annoncés comme non fermés le 18/09/2026. **Quatre l'ont été le
lendemain** (§ 18) ; le cinquième est une contrepartie assumée, pas une dette.

- ~~`connect-src` ouvert à tout HTTPS~~ → § 18.1.
- ~~Jetons de séance en paramètre d'URL pour les flux~~ → § 18.2.
- ~~Jetons dans le stockage local, en clair~~ → § 18.3.
- ~~Pas de rôle d'administrateur~~ → § 18.4.
- Le fournisseur « compatible » peut toujours interroger la boucle locale de la
  machine de l'instance : c'est la contrepartie du moteur de modèles installé sur
  cette même machine, et non un oubli.
- La fenêtre du bot de réunion garde `contextIsolation: false` (§ 17.1, I11), mais
  l'attaque qu'elle rendait possible est fermée (§ 18.5).

---

## 18. Les dettes de la passe précédente, fermées (0.23.0)

Le § 17.5 listait ce que la passe du 18/09/2026 laissait ouvert. Le client a
demandé le lendemain de s'en occuper. Voici ce qui a été fait, et comment chaque
point a été vérifié.

### 18.1 L'interface a une vraie origine : `helix://app`

**Ce qui n'allait pas.** L'application livrée se chargeait depuis le disque, en
`file://`. Trois conséquences, toutes mesurées :

- **toutes** les pages `file:` partagent une même origine, dont la chaîne vaut
  « null ». Le stockage local de Helix était donc atteignable par n'importe quelle
  page HTML posée sur le poste ;
- `session.webRequest.onHeadersReceived` n'intercepte pas `file:` : l'en-tête de
  politique de sécurité ne s'appliquait à **rien** dans l'application livrée (c'est
  ce qui avait imposé la balise `meta`, § 17.1, I12) ;
- une origine « null » n'est pas un contexte sécurisé, ce qui ferme sans raison des
  interfaces du navigateur.

**Ce qui a été fait.** Un schéma propre, `helix://app`, déclaré `standard` et
`secure`, servi par `protocol.handle` depuis le même dossier `dist`
(`electron/main.cjs`, `servirInterface`). Le chemin demandé est résolu puis comparé
à la racine réelle : on ne sort jamais de `dist`. Tout chemin inconnu rend
`index.html`, parce que les routes de l'application ne sont pas des fichiers.

**Et le `connect-src` s'est refermé.** La politique est désormais posée par la
réponse elle-même, donc **calculée** : quand une instance est configurée, elle est
nommée. Mesuré sur l'application réelle, après avoir rangé une instance d'essai :

```
connect-src 'self' https://instance.exemple.fr http://localhost:* http://127.0.0.1:* blob: data:
```

Tant qu'aucune instance n'est choisie, la politique reste ouverte au HTTPS : l'écran
de mise en route doit pouvoir sonder l'adresse que la personne saisit. La balise
`meta` reste dans la page : deux politiques se combinent par **intersection**, elle
ne peut donc que resserrer, jamais élargir.

**Vérifié** en lançant le vrai processus principal sur un profil d'essai :
`origine: "helix://app"`, `isSecureContext: true`, interface rendue, **aucune
violation** de politique dans la console.

**Le changement d'origine ne coûte rien à personne.** Une origine, c'est un
stockage, et le nouveau est vide : sans précaution, la mise à jour aurait ramené
l'écran de mise en route, une reconnexion et des préférences par défaut. Une reprise
unique lit l'ancien stockage dans une fenêtre cachée (`reprendreAncienStockage`),
range les trois valeurs sensibles au coffre et transmet le reste. Un fichier témoin
l'empêche de recommencer — on ne ressuscite pas deux fois ce que quelqu'un a effacé
exprès. Mesuré de bout en bout : ancienne origine peuplée comme en 0.21.0, puis
démarrage en 0.23.0 → l'application s'ouvre **sur l'interface connectée**, le thème
est conservé, les trois secrets sont au coffre, et rien n'est en clair dans la
nouvelle origine.

*Détail utile à qui reprendra ce code :* la lecture se fait par
`executeJavaScript`, pas par un préchargement. Sur une origine `file://`, un monde
isolé se voit refuser l'accès au stockage — mesuré, la lecture depuis un
préchargement rendait toujours un objet vide.

**Deux défauts introduits par ce changement, trouvés en essayant l'application
réelle et corrigés.** Ils méritent d'être écrits : ce sont exactement ceux qu'un
essai en bac à sable ne montre pas.

1. **L'instance ne répondait plus à l'interface.** Le partage entre origines
   (`entetes.ts`) connaissait la boucle locale, l'instance elle-même et l'origine
   opaque `null` de `file://` — pas `helix://app`. Le navigateur bloquait donc chaque
   réponse, et l'écran affichait « Moteur indisponible ». L'origine de l'application
   est désormais admise, et elle seule : aucune page du web ne peut la porter,
   puisque le schéma n'existe que dans l'application. Mesuré : `helix://app` et la
   boucle locale acceptées, `https://site-quelconque.fr` et `helix://autre` refusées.

2. **Naviguer déconnectait.** Servie depuis le disque, l'interface utilisait un
   routeur à ancre ; servie sous un vrai schéma, elle est passée au routeur
   d'historique — qui remplace l'adresse **entière** à chaque navigation,
   paramètres compris. Or l'adresse de départ porte le jeton d'instance que
   l'application remet à son interface (`?token=`). Un clic sur « Réglages »
   l'effaçait ; les requêtes suivantes repartaient sans autorisation, l'instance
   répondait 401, et l'application se croyait déconnectée — avec, à la clé, la perte
   du jeton de séance du coffre. Deux corrections, indépendantes l'une de l'autre :
   l'interface livrée reprend le routeur à ancre (le chemin vit après le « # », les
   paramètres restent), et `instance.ts` retient le jeton du lanceur à sa première
   lecture au lieu de le relire dans une adresse qui peut changer. Mesuré sur le vrai
   processus principal : chargement, Réglages, Connecteurs, toujours connecté,
   **zéro réponse refusée**.

### 18.2 Les jetons ont quitté les adresses de flux

**Ce qui n'allait pas.** `EventSource` ne sait pas poser d'en-tête. Le jeton
d'instance et le jeton de séance voyageaient donc dans l'**adresse** des quatre flux
d'évènements : journaux d'accès de tout intermédiaire, historique du rendu, ligne de
commande d'un `curl` recopié dans un ticket. Un jeton de séance vaut douze heures
glissantes, trente jours au plus — ou trente jours glissants depuis que « Rester
connecté » existe.

**Ce qui a été fait.** `gateway/src/flux.ts` : un **billet** demandé par une requête
normale (avec ses en-têtes), valable **soixante secondes** et **une seule
ouverture**. Il remplace les deux jetons : le présenter prouve qu'une séance
existait, donc qu'un jeton d'instance a servi à l'obtenir. Seule son empreinte est
conservée, et la comparaison est à durée constante.

Côté poste, `src/lib/flux.ts` ouvre les flux et les **rouvre lui-même** avec un
billet neuf, en espaçant les tentatives : la reconnexion automatique du navigateur
ne peut plus rejouer une adresse dont le billet est consommé. Ce n'est pas une
perte — cette reconnexion était muette et sans limite.

**Un piège rencontré, et corrigé** : `demandeur()` est appelée deux fois par requête
(la barrière de séance, puis la route). Avec un jeton, relire ne coûtait rien ; avec
un billet à usage unique, la seconde lecture le trouvait déjà consommé et le flux
répondait 401 alors que le billet était bon. L'identité est désormais retenue le
temps de la requête.

**Vérifié** : billet refusé sans séance (401) ; flux ouvert (200, `: ping`) avec le
seul billet et **aucun jeton dans l'adresse** ; rejeu du même billet refusé (401) ;
billet inventé refusé (401).

### 18.3 Les secrets du poste sont dans le trousseau du système

**Ce qui n'allait pas.** Le jeton de séance, et le jeton d'instance d'un poste
rattaché, vivaient en clair dans le stockage du navigateur. Ce n'est pas une faille
réseau : c'est le risque « poste volé, ou sauvegarde du profil recopiée ».

**Ce qui a été fait.** `electron/coffre.cjs` chiffre un fichier unique
(`~/.helix/secrets.enc`, en 0600) avec `safeStorage`, c'est-à-dire une clé du
trousseau du compte, protégée par le système. Le rendu ne voit ni le fichier ni la
clé : le préchargement lui remet les valeurs **une fois**, au démarrage, avant le
premier script de la page — ce qui a permis de ne rendre asynchrone aucun appel
existant. Les écritures, elles, passent le pont.

Trois clés y sont rangées : le jeton de séance, la configuration d'instance (qui
porte le jeton d'instance), et l'identité connectée. La dernière n'est pas un secret,
mais elle fait couple avec la séance : les séparer voudrait dire qu'une personne
« restée connectée » retrouverait un jeton valide et un écran de connexion.

Hors application de bureau (navigateur, essais), il n'y a pas de trousseau : le repli
sur le stockage local est **annoncé**, et `coffreSysteme()` permet de le dire. Mieux
vaut un repli déclaré qu'un fichier « chiffré » qui ne l'est pas.

**Vérifié** sur l'application réelle : `secrets.enc` créé (99 octets pour une
instance d'essai), l'adresse rangée **n'y apparaît pas en clair**, et le stockage du
navigateur ne contient plus aucune clé de séance, d'instance ou d'identité.

### 18.4 Un rôle d'administrateur, et lui seul voit tout le journal

**Ce qui n'allait pas.** Le § 17.1 avait cloisonné le journal d'audit par personne —
il était lisible en entier par tout compte. Mais cloisonner sans exception voulait
dire que **personne** ne pouvait plus constater l'état de l'instance, ce qui vide de
son sens le fait de sceller le journal.

**Ce qui a été fait.** `gateway/src/roles.ts`. Un administrateur est désigné par le
profil de déploiement (`administrateurs: ["…@…"]` dans `helix.config.json`, fichier
posé sur la machine hôte, jamais modifiable par une requête) ; à défaut, c'est le
**premier compte créé**, c'est-à-dire la personne qui a mis l'instance en route.

Ce rôle **n'ouvre aucune donnée personnelle** : ni conversations, ni documents, ni
courrier. Il ouvre la vue d'ensemble du journal, c'est-à-dire des traces d'actions.
Toute extension devra être pesée et écrite dans `roles.ts`. L'écran dit à chacun ce
qu'il regarde, et pourquoi il l'est.

**Vérifié** avec deux comptes : la première voit les deux auteurs et reçoit
`administrateur: "premier"` ; le second ne voit que les siens et reçoit `null`.

### 18.5 Le bot de réunion ne peut plus se faire dicter son audio

**Ce qui n'allait pas.** La fenêtre qui charge Google Meet partage le monde
JavaScript de la page — c'est ce qui lui permet de voir les connexions WebRTC. Un
script hostile sur cette page pouvait donc remplacer `MediaRecorder`, `AudioContext`
ou `Blob.prototype.arrayBuffer` **après** le chargement, et faire écrire à l'instance
un son de son choix, qui aurait été transcrit, résumé par un modèle et diffusé dans
l'organisation avec l'apparence d'un compte rendu de réunion.

**Ce qui a été fait.** Le préchargement s'exécute avant tout script de la page : il y
**capture les fonctions d'origine** et ne se sert plus que de ces références. Ce que
la page remplacera ensuite ne sera jamais appelé. Chaque morceau est de plus vérifié
comme un vrai `Blob` produit par notre propre enregistreur avant de partir, et le
processus principal vérifie déjà qu'il reçoit un `ArrayBuffer`.

**Ce qui reste, et pourquoi.** `contextIsolation` demeure coupé pour cette seule
fenêtre. L'API qui permettrait les deux — isolation active *et* correctif exécuté
dans le monde de la page — est `contextBridge.executeInMainWorld`, apparue dans
Electron 35 ; l'application est en 33. C'est le premier fichier à reprendre le jour
d'une montée de version, et c'est écrit dans `botReunion.cjs`.

### 18.6 Deux corrections venues avec

**L'adresse d'instance confiée au bot est vérifiée.** Le processus principal n'est
soumis à aucune politique de contenu ; il acceptait n'importe quelle `passerelle.url`
venue du rendu, et y postait les deux jetons toutes les soixante secondes, fenêtre
fermée comprise. HTTPS est désormais exigé, sauf boucle locale, à l'envoi d'un bot
comme à l'activation de l'envoi automatique.

**« Rester connecté sur ce poste. »** Demandé par le client. Ce n'est pas le mot de
passe qui est mémorisé — il n'est conservé nulle part : c'est la **séance** qui est
prolongée, trente jours glissants au lieu de douze heures, avec un plafond absolu
d'un an au lieu de trente jours. Le choix est explicite, il accompagne toutes les
étapes de la connexion (la séance n'est ouverte qu'à la dernière, après le second
facteur s'il est actif), il est inscrit au journal, et la séance porte la mention
« reste connecté » dans la liste des postes, où elle se révoque comme les autres.
Mesuré : 12 h sans la case, 720 h avec.

---

## 19. Le schéma `helix://` ouvert par le système (0.24.0)

La 0.24.0 déclare l'application auprès du système comme ouvrant les liens
`helix:`, pour qu'une invitation reçue par mail se règle en un clic (ADR-042).
C'est une **entrée nouvelle dans l'application**, venue de l'extérieur, et elle
se traite comme telle.

### 19.1 Ce qu'un lien peut faire, et ce qu'il ne peut pas

Un lien `helix://rejoindre#a=<adresse>&c=<code>` **pré-remplit un écran**. Il ne
décide de rien : ni jeton, ni compte, ni mot de passe ne s'en déduisent, et le
rattachement n'a lieu qu'après un clic de la personne, sur un écran qui affiche
l'adresse en toutes lettres.

**Pourquoi ce clic est indispensable.** Le système ouvre un lien `helix://` d'où
qu'il vienne : du mail attendu, mais aussi d'une page web visitée par hasard, et
rien ne distingue les deux à l'arrivée. Un rattachement automatique laisserait
n'importe quel site pointer un poste vers l'instance de son choix ; la personne y
saisirait ensuite son mot de passe en croyant être chez elle. C'est un hameçonnage
complet, sans aucune faille par ailleurs. La première version de ce travail
enchaînait automatiquement, au motif que « le clic dans le mail était le
consentement » : c'était faux, et c'est corrigé.

Quand le poste est **déjà** en service, l'écran le dit aussi, et propose de rester
où l'on est.

### 19.2 Ce que le lecteur de lien refuse

`lireLienInvitation` (electron/main.cjs, et son jumeau côté interface) n'accepte
qu'un hôte `rejoindre` — `helix://app/…` sert l'interface et n'a rien à faire là —
et une adresse en `http`/`https` : un lien ne choisit pas le protocole que
l'application ira parler. Mesuré comme refusé : `helix://app/index.html`,
`a=file:///etc/passwd`, `a=javascript:alert(1)`, un lien sans code, et les
paramètres passés en requête plutôt qu'en fragment.

### 19.3 Le fragment, et pas la requête

Le code voyage après `#`. Un fragment ne quitte pas la machine qui l'ouvre, là où
une requête finit dans les journaux de tout ce qu'elle traverse. Le code vaut sept
jours, un seul usage, une seule adresse email (§ ADR-039), mais autant qu'il ne
traîne pas.

### 19.4 Verrou d'instance unique

Ajouté avec le schéma : sous Windows et Linux, un lien cliqué arrive en argument
d'un second lancement. Sans verrou, ce lancement ouvrirait une seconde copie de
l'application, avec une seconde passerelle sur le même port et le même jeu de
données. `HELIX_INSTANCES_MULTIPLES=1` le lève, pour les essais à deux postes sur
une même machine.


---

## 20. Le jeton d'instance ne traîne plus dans le dossier de travail (0.24.0)

**Ce qui n'allait pas.** Pour piloter OpenCode, la passerelle écrivait un
fichier `opencode.json` **dans le dossier de travail choisi par
l'utilisateur**, et ce fichier porte le jeton d'instance en clair. Le jeton
ouvre toute la passerelle : données, fichiers, exécution d'outils.

Le fichier était bien en 0600, donc illisible par un autre compte de la
machine. Mais le dossier de travail est très souvent un dépôt Git ou un
partage d'équipe : un `git add .` suffisait à publier le jeton, et le
commentaire du code s'en remettait à un `.gitignore` posé par l'intégrateur,
c'est-à-dire à la vigilance de quelqu'un d'autre.

**Ce qui a été fait.** Le fichier vit désormais dans le dossier de données de
l'instance (`<données>/opencode/opencode.json`, 0600), hors de portée d'un
dépôt. Son emplacement est transmis au serveur OpenCode par
`OPENCODE_CONFIG_DIR`. Au démarrage, l'ancien fichier est retiré du dossier de
travail **s'il est bien celui de Helix** — reconnaissable à son unique
fournisseur « helix » — pour ne jamais toucher à la configuration d'un
utilisateur qui aurait la sienne.

**Ce qui reste vrai, et qu'il faut savoir.** Le serveur OpenCode tourne sur la
machine et parle à la passerelle avec ce jeton. Qui peut lire le dossier de
données du compte hôte peut lire le jeton : c'est déjà le cas du fichier
`instance-token` lui-même. La mesure ferme la fuite vers l'extérieur, pas
l'accès local au compte qui fait tourner l'instance.

### 20.1 Le fournisseur hébergé d'OpenCode reste actif

Mesuré le 20/09/2026 sur OpenCode 1.18.3 : la liste `disabled_providers` de la
configuration **n'est pas respectée**. `GET /api/provider` rend encore le
fournisseur « opencode » et trente et un modèles hébergés chez eux. Sur une
plateforme vendue comme locale, c'est une porte par laquelle le code d'un
client peut sortir.

Deux verrous posés en conséquence, qui ne dépendent pas de leur liste :

- la passerelle **nomme toujours le modèle** à l'ouverture d'une session
  (`providerID: "helix"`), au lieu de laisser OpenCode choisir ;
- `small_model` est épinglé sur le modèle de l'instance, sans quoi les travaux
  annexes (titre de session, résumés) partaient chez eux.

Ce qui n'est pas couvert, et qu'il faut surveiller à chaque montée de version
d'OpenCode : un chemin de code de leur côté qui appellerait leur fournisseur
sans passer par le modèle de la session. Le contrôle est simple et tient en une
commande, à refaire après chaque mise à jour :

```bash
curl -s -H "Authorization: Basic $(printf 'opencode:<mot de passe>' | base64)" \
  http://127.0.0.1:<port>/api/provider | python3 -m json.tool | head
```

## 21. Les surfaces ajoutées le 24 septembre 2026

- **Téléchargements de modèles et de moteurs** (images, Lume, LibreOffice de la machine macOS) : jamais « la dernière version ». Chaque fichier est pris à une révision précise et vérifié par sha256 avant usage ; une empreinte fausse efface le fichier. L'application Lume est en plus vérifiée par sa signature (équipe Cua AI).
- **Images créées** : rangées dans les données de l'instance, servies (`/helix/images/fichier/<id>`) à la seule personne qui les a créées (depuis le 25/09/2026, aussi à qui voit le Chat où elles ont été créées : § 22.1) ; identifiant de 128 bits vérifié par expression régulière avant tout accès disque.
- **Import depuis les logiciels du poste** (`/helix/import/...`) : séance exigée **et** demande venue de la boucle locale ; sinon refus. La base de Cursor est ouverte en lecture seule, par un programme lancé sans shell, avec un identifiant de conversation filtré avant d'entrer dans la requête SQL.
- **Extension VS Code** : le jeton d'instance et la séance restent dans le processus de l'extension (la page du Chat n'appelle rien elle-même, CSP à nonce) ; la séance est dans le SecretStorage de VS Code ; le mot de passe n'est jamais gardé.
- **Machine de l'agent** : Docker publié sur 127.0.0.1 seulement ; la machine macOS n'est joignable que depuis le Mac (réseau NAT de la virtualisation d'Apple) ; effacement réservé à une machine non choisie.
- **Chats du poste** : fichier chiffré par safeStorage, 0600, écrit par renommage.
- `npm run securite` vérifie désormais onze routes de plus (images, import, machine) : sans séance, 401. 77 contrôles au total ce jour-là (125 le 25/09/2026, § 22).

## 22. Les surfaces ajoutées le 25 septembre 2026

`npm run securite` compte désormais **140 contrôles, tous réussis le 25/09/2026** (125,
plus 15 sur les employés et les bases de connaissances, ajoutés le même jour, § 22.2).
Ajoutés ce jour-là, par branche : 14 sur les images d'un Chat partagé (13, plus la
connexion d'une collègue), 6 sur les bases de connaissances et 9 de leurs routes
ajoutées aux listes « sans jeton » et « sans séance », 16 sur l'entraînement, 3 sur
la route d'outils de Code.

### 22.1 Images d'un Chat partagé

`gateway/src/images.ts` (`imageVisible`), `gateway/src/authz.ts` (`voitConversation`,
désormais exportée), `gateway/src/index.ts`.

- Une image se voit par **son auteur** et par **qui voit le Chat où elle a été
  créée**, et par personne d'autre. Tout autre demandeur reçoit **404, que l'image
  existe ou non**.
- L'identifiant du Chat est retenu à la création (`chat` dans
  `<données>/images/index.json`). Il faut un Chat **qui contient l'image**, que le
  demandeur voit, **et** qui soit celui de la création : un identifiant recopié dans
  le Chat de quelqu'un d'autre, ou dans son propre Chat, n'ouvre rien. Une image
  d'avant ce changement (sans `chat`) suit une règle de repli : un Chat **de son
  auteur** qui la contient.
- Réponse pour un collègue en `Cache-Control: no-store`, pour qu'un partage retiré
  cesse aussitôt de servir l'image ; l'auteur garde `private, max-age=86400`.
- Le relevé « image vers Chats » gardé en mémoire ne contient que les champs de
  visibilité, pas les messages.
- Effacement d'un compte : ses images (fichiers et registre) partent avec lui
  (`oublierImagesDe`) ; avant, elles restaient sur le disque. Un registre illisible
  n'est jamais réécrit vide : il est mis de côté (`index.<date>.illisible.json`), et
  l'effacement de compte ne réécrit rien sur un registre illisible. Ce cas n'a pas été
  provoqué.
- Contrôlé par `npm run securite` (section 7 de la batterie), avec de fausses images
  posées à la main : auteur 200 ; collègue 404 sans partage, 200 en `no-store` une fois
  le Chat partagé ; ancienne image par la règle de repli ; image d'un autre Chat de
  l'auteur 404 ; identifiant recopié 404 ; partage retiré, 404 aussitôt ; Chat ouvert
  à l'organisation 200 ; identifiant inventé ou mal formé 404.
- Limite : l'image n'apparaît au collègue que si le Chat a été synchronisé vers
  l'instance. Pas essayé avec une vraie image sur un second poste.

### 22.2 Bases de connaissances

`gateway/src/connaissances.ts`, routes `/helix/connaissances*`.

- **Droits hérités de la Bibliothèque** (« Fichiers » à l'écran) : une base a la
  même visibilité que ses objets (vous seul, des groupes, toute l'équipe) ; **seul
  son propriétaire** la modifie, y ajoute ou en retire des documents.
- **Voir une base ne donne pas accès à ses documents.** À chaque recherche, seuls
  comptent les documents que la personne voit dans la Bibliothèque au moment de la
  question ; les autres ne sont ni nommés ni cités, l'écran dit seulement combien il
  y en a. On n'ajoute à une base que des documents qu'on voit, et l'indexation lit le
  texte avec les droits de la personne qui a ajouté le document.
- Une base choisie (par un agent partagé, par exemple) que la personne ne voit pas
  est ignorée par l'instance, et l'écran le dit.
- Préfixe `/helix/connaissances` entier sous séance (`routeConnaissances` dans
  `exigeSeance`). Le champ `connaissances` du corps de `POST /v1/chat/completions`
  n'est lu qu'avec une séance.
- **Au repos** : métadonnées dans la collection interne `connaissances`, chiffrée,
  jamais synchronisée vers les postes ; un index par document et par base, 0600,
  chiffré par `chiffrerOctets` lié à `connaissances:<base>:<document>`. Vérifié : les
  fichiers commencent par l'en-tête chiffré `HLXF1`, ni un mot du document ni le nom
  de la base n'y apparaissent en clair.
- Effacement d'un compte : ses bases et leurs index partent ; ses documents ajoutés
  aux bases de collègues en sont retirés (`effacement.ts`).
- Journal : `connaissances.base_creee`, `base_modifiee`, `base_supprimee`,
  `documents_ajoutes`, `document_retire`, avec identifiants et nombres, jamais de
  texte.
- **Employés OpenClaw** (ajouté le 25/09/2026) : l'outil `connaissances__chercher` de
  leur serveur d'outils ne compte que les bases **et** les documents ouverts à toute
  l'équipe (`chercherPourEmploye`, `equipeSeulement`), avec l'identité `employe:<id>`,
  qui ne possède rien : ni les droits du propriétaire de l'agent, ni ceux de qui lui
  parle, car l'appel ne dit pas pour qui l'employé travaille et ce qu'il lit ressort
  vers d'autres (collègues, messageries, mémoire). Seulement les bases de **son** agent,
  relues à chaque appel. Aucun droit ajouté au canal d'OpenClaw : même route, même clé
  `X-Helix-Cle`, et ce qu'on y lit (ouvert à l'équipe) l'était déjà par la famille
  « bibliothèque ». Refusé aux personnes qui écrivent sur une messagerie, sauf
  `outilsEntreprise`. Sa fiche de poste (`SOUL.md`, relue par le modèle) nomme l'outil,
  jamais les bases. Journal : `outil.appele` avec le nombre de bases et de passages,
  jamais la question.
- Contrôlé par `npm run securite` (section 6 ter, faux modèle d'embeddings et faux
  OpenClaw) : l'outil n'est proposé qu'à un employé qui a des bases ; il rend le passage
  d'un document ouvert, avec son nom ; ni le document privé du propriétaire de l'agent
  (même rangé dans une base ouverte), ni celui d'une collègue (dans sa base privée, ou
  dans une base qu'elle a ouverte), ni le nom d'une base privée ; bases privées seules :
  aucun passage ; sans la clé, clé devinée, séance d'une collègue sans clé : 403 ;
  `SOUL.md` sans nom de base. De bout en bout avec un vrai OpenClaw et qwen3-8b le même
  jour : aucun secret dans les réponses (PROJET.md).
- Vérifié avec un second compte le 25/09/2026 : base privée ni listée, ni lisible
  (404), ni modifiable (404), ni cherchable (0 passage, « 1 ignorée ») ; base ouverte
  à toute l'équipe mais documents privés : 0 document nommé, 0 passage.

Ce qui n'est pas protégé :

- Les passages viennent de documents : un document piégé arrive dans le prompt. La
  consigne le désigne comme une donnée, rien de plus n'est garanti ; en Cowork, outils
  actifs, c'est la barrière d'approbation qui protège.
- Les citations sont enregistrées avec le Chat : qui voit un Chat partagé voit les
  extraits cités (600 caractères au plus chacun), comme il voit déjà la réponse.
- Si le profil impose un modèle `embed` distant (`models.embed`), le texte des
  documents part chez ce fournisseur ; l'écran de la base affiche le modèle qui a
  indexé chaque document.
- Les bases sont dans l'export RGPD depuis le 25/09/2026 (§ 7.1). Un document supprimé de la
  Bibliothèque garde son index sur le disque jusqu'à ce que le propriétaire de la base
  l'en retire ; il n'est plus jamais servi.

### 22.3 Entraînement d'un modèle

`gateway/src/entrainement.ts`, routes `/helix/entrainement*`.

- Préfixe entier sous séance (`routeEntrainement` dans `exigeSeance`). Chaque projet
  n'est rendu qu'à son auteur (404 sinon) ; son identifiant, **24 caractères
  hexadécimaux tirés au sort**, est contrôlé avant tout accès disque.
- **Projet chiffré au repos** (exemples, propositions, comparaisons) par la clé des
  données (`chiffrerOctets`, lié à son identifiant) ; un projet illisible n'est jamais
  réécrit. Les fichiers d'entraînement en clair n'existent que pendant le calcul et
  sont effacés après, y compris quand la passerelle s'arrête (vérifié par SIGTERM en
  plein calcul).
- Aucun exemple ne devient argument de commande : tout passe par des fichiers. Scripts
  Python constants, `spawn` sans shell, Python en mode isolé (`-I`) et environnement
  réduit, Hugging Face hors ligne après installation. Exception documentée : le
  convertisseur GGUF, lancé avec `-s` parce qu'il ne se lance pas en mode isolé.
- Paquets du Mac installés par `pip --require-hashes --only-binary=:all: --no-deps`
  contre des empreintes SHA-256 relevées sur PyPI ; modèles de départ pris à une
  révision et vérifiés par empreinte. Sur NVIDIA, paquets figés à la version mais
  **sans empreintes** (les roues CUDA de PyTorch viennent de son propre dépôt). Un vrai
  refus d'empreinte par pip n'a pas été provoqué : c'est le comportement documenté de
  `--require-hashes`.
- Suppression bornée : seul un dossier sous `<modèles LM Studio>/helix-entrainement`
  peut être effacé. Un modèle en train de répondre n'est ni déchargé ni effacé.
- Journal : `entrainement.installe`, `desinstalle`, `projet_cree`, `projet_supprime`,
  `paires_generees`, `termine`, `publie`, `retire`.
- 16 contrôles dans la batterie : routes fermées sans jeton et sans séance,
  identifiants détournés, projet chiffré sur le disque.

Ce qui n'est pas protégé : **le modèle installé est visible de toute l'instance** dans
le sélecteur, et ce qu'il a appris peut ressortir dans les Chats des collègues ; LM
Studio ne cloisonne pas par personne. L'écran le dit avant l'installation.

### 22.4 Ligne de commande et outils de Code

`cli/helix.mjs`, `gateway/src/outilsCode.ts`, `gateway/src/opencode.ts`.

**Route `/helix/code/outils`, réservée à l'agent de code de l'instance.** Hors du
tableau `EXECUTION` (OpenCode n'a pas de séance), elle exige le jeton d'instance
**et** une clé tirée à chaque démarrage de la passerelle (`X-Helix-Cle`), écrite
seulement dans la configuration d'OpenCode (fichier 0600 qui porte déjà le jeton) et
comparée en temps constant. Sans jeton, 401 ; sans clé ou avec une clé devinée, 403,
même avec une séance (« Accès réservé à l'agent de code de l'instance. »). Contrôlé
par 3 vérifications de la batterie.

- Chaque appel passe par `verifierOutil` puis `executerOutil`, et est scellé au
  journal (`surface: "code"`).
- Le serveur de fichiers de Cowork, la bureautique, le contrôle du code web et
  l'écran ne sont pas servis : ils agiraient hors du dossier du projet.
- OpenCode ne dit pas de quelle session vient un appel. Si toutes les sessions qui
  travaillent appartiennent à la même personne, la carte d'accord va chez elle ;
  sinon (deux personnes, session inconnue), **refus sans carte**. Seul le refus
  « session inconnue » a été observé ; le cas « deux personnes » n'a pas été essayé.
- Un appel abandonné par OpenCode avant l'accord n'est pas exécuté après coup.
- À ce jour, OpenCode 1.18.32 ne propose pas ces outils aux sessions de sa nouvelle
  API : la route est en place, sans être utilisée par Helix Code.

**La ligne de commande `helix`.**

- **Jeton d'instance** : `--jeton` ou `HELIX_JETON`, sinon lu dans
  `~/.helix/data/instance-token` **seulement si l'adresse est locale**. L'envoyer à
  une instance d'entreprise lui donnerait la clé de l'instance du poste.
- **Transport** : même règle que l'application. Sans schéma, https est supposé (sauf
  boucle locale) ; http vers une autre machine est refusé avant tout envoi.
- **Mot de passe** : tapé sans écho, envoyé une fois à `POST /helix/auth/verify`,
  jamais écrit. Double authentification : défi puis code
  (`/helix/auth/deux-facteurs`), écrit mais pas essayé au terminal. Un compte qui doit
  activer le second facteur ou choisir son premier mot de passe est renvoyé vers
  l'application.
- **Séance** : `~/.helix/cli-seance` (ou `HELIX_CLI_SEANCE`), rangée **par adresse
  d'instance** (une séance n'est envoyée qu'à l'instance qui l'a ouverte), écrite de
  façon atomique en 0600, dossier en 0700. Poste nommé « Terminal (<machine>) » à
  l'instance, visible et révocable dans Sécurité. **Contrepartie assumée** : fichier
  en clair, protégé par les permissions du compte, comme les outils de ligne de
  commande habituels ; un trousseau demanderait une dépendance native.
- **Déconnexion** : la séance est d'abord fermée sur l'instance, puis oubliée ; si
  l'instance ne répond pas, elle est oubliée et la ligne de commande dit qu'elle
  expirera d'elle-même.
- Un fichier de séance illisible n'est **jamais réécrit par-dessus** ; la ligne de
  commande dit de le supprimer soi-même.
- **Approbations** : elle n'écoute que les demandes de sa propre séance
  (`/helix/approbation/evenements`) et répond par un booléen explicite. Seuls « o » ou
  « oui » accordent ; toute autre réponse, Ctrl+C ou Ctrl+D refusent. Sans terminal,
  elle ne répond rien et l'expiration (deux minutes) vaut refus.
- Sans `--outils`, le Chat passe par l'API compatible au jeton seul, comme l'extension
  VS Code, avec une consigne qui interdit au modèle de prétendre avoir agi.
- Pas essayé : une instance d'entreprise en https à certificat auto-signé (Node le
  refuse par défaut, il faudrait `NODE_EXTRA_CA_CERTS`), Windows.

### 22.5 Deux protections de données, venues avec

- **Fichier des Chats du poste illisible** (`electron/grandStockage.cjs`,
  `src/lib/store/grandStockage.ts`, `sync.ts`) : il n'est jamais écrasé sans copie
  `sessions.<date>.illisible.enc`, et la synchronisation ne pousse pas une collection
  illisible tant que l'instance ne l'a pas rendue. Sans cela, un trousseau refusé au
  démarrage menait à l'envoi d'une liste d'un seul Chat, que l'instance aurait prise
  pour la suppression voulue de tous les autres. Vérifié par simulation, pas dans
  l'application de bureau.
- **Import par morceaux** (`importLocal.ts`) : le contenu n'est rendu que pour des clés
  de la liste relevée par la passerelle ; aucun chemin venu de la requête n'est lu.
  Vérifié avec `claude-code:../../etc/passwd` : ignorée.

