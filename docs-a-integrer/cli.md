# Ligne de commande : Chat et Code dans un terminal (à intégrer)

Demandé par le client le 25/09/2026 : « HelixAI Code dans un terminal, comme
Claude Code, Codex CLI ou OpenCode CLI », et « les différents MCP » qui y
marchent aussi. Ce fichier décrit ce qui a été fait, ce qui a été vérifié, et
ce qui ne l'a pas été. Il est à fondre dans README.md (usage), ARCHITECTURE.md
(quatrième client de la passerelle), SECURITE.md (séance de terminal, route
d'outils de Code) et PROJET.md (état).

## Ce qui a été construit

| Fichier | Rôle |
|---|---|
| `cli/helix.mjs` | La ligne de commande. Node 20 ou plus, **aucune dépendance** (fetch intégré, modules standard). Entrée `bin` « helix » dans `package.json`. |
| `cli/textes.mjs` | **Tous** les textes affichés, au même endroit (voir « Langues »). |
| `gateway/src/outilsCode.ts` | Serveur MCP de la passerelle pour l'agent de code : les connecteurs, derrière la barrière d'approbation. Prêt, mais pas encore utilisé par OpenCode (voir plus bas). |
| `gateway/src/opencode.ts` | Déclare ce serveur dans la configuration d'OpenCode (`mcp.helix`, clé tirée à chaque démarrage). |
| `gateway/src/index.ts` | Route `/helix/code/outils` ; `handleCodePrompt` note qui envoie chaque demande de Code. |
| `scripts/essai-cli.mjs` | Essai automatique contre une instance jetable (`npm run essai:cli`, `-- --modele` avec LM Studio). |
| `scripts/securite.mjs` | 3 contrôles de plus sur la nouvelle route (80 au lieu de 77). |

La ligne de commande est un client de la passerelle, comme l'interface et
l'extension VS Code, dont elle reprend la manière (`extensions/vscode/extension.js`).
Elle n'exécute rien elle-même : elle affiche, et transmet les réponses de la
personne. Modèles, outils, barrière d'approbation et journal restent ceux de
l'instance.

## Utilisation

```
helix                          Chat interactif
helix chat "question"          Une question, une réponse (aussi par un tube : cat notes.txt | helix chat "résume")
helix chat --outils            Chat avec les outils de l'instance (fichiers de Cowork, connecteurs) ; séance requise
helix code "demande"           Helix Code sur le dossier courant, une demande
helix code                     Helix Code interactif
helix connexion [--compte adresse@exemple.fr]
helix deconnexion
helix modeles                  Modèles de l'instance
helix outils                   Groupes d'outils, état, et niveau d'accord de l'instance
helix aide
```

Options : `--adresse URL` (ou `HELIX_ADRESSE`, défaut `http://127.0.0.1:8787`),
`--jeton` (ou `HELIX_JETON`, défaut : le jeton de l'application du poste, lu
**seulement pour une adresse locale**), `--modele`, `--effort` (Code), `--outils`.
Dans une conversation : `/nouveau`, `/modele [NOM]`, `/aide`, `/quitter` (ou
Ctrl+D) ; Ctrl+C arrête la réponse en cours (en Code : `POST /helix/code/interrupt`),
et au repos fait sortir.

Installation sur un poste qui a le dépôt : `npm link` (ou `node cli/helix.mjs`).
L'application empaquetée ne l'installe pas encore dans le `PATH` (voir « Reste à faire »).

Ce que la personne voit en Code, mesuré le 25/09/2026 :

```
$ helix code "Crée le fichier bonjour.txt contenant exactement la ligne : Bonjour depuis le terminal"
Helix Code sur ~/…/projet
✓ Écriture bonjour.txt
Le fichier `bonjour.txt` a été créé avec succès et contient exactement la ligne demandée […]
```

## Les outils (« les différents MCP »)

### Depuis le Chat : fait et vérifié

`helix chat --outils` envoie `tools: true`. C'est la boucle de `chat.ts` qui
propose au modèle les outils de l'instance (serveur de fichiers de Cowork,
serveurs MCP du catalogue, courrier, agenda, Drive, Slack, bibliothèque,
réunions, bureautique), les exécute, et passe **avant chaque appel** par
`approbation.verifierOutil`, comme pour l'interface. La ligne de commande
affiche les évènements `helix` : « ✓ Écriture ~/…/accord.txt », « ✗ … : raison »,
le plan et ses étapes.

Avant de commencer, elle dit ce que l'agent a sous la main (groupes actifs de
`GET /helix/outils`) et le dossier de Cowork où travaille le serveur de
fichiers. Elle **ne change pas** ce dossier : il est commun à toute l'instance,
et son changement (mot de passe redemandé sur une instance partagée) reste dans
l'application.

### Approbations : jamais contournées

Pendant `chat --outils` et `code`, la ligne de commande écoute
`GET /helix/approbation/evenements` (séance de la personne : elle ne reçoit
que ses propres demandes). À chaque demande :

- elle l'affiche en entier (« L'agent veut écrire dans ~/… », et pour un mail :
  destinataires, copie, objet, texte) ;
- elle demande « Autoriser ? [o/N] ». **Seuls « o » ou « oui » accordent** ;
  une autre réponse, Ctrl+C ou Ctrl+D refusent. La réponse part par
  `POST /helix/approbation/repondre` avec un booléen explicite ;
- une demande résolue ailleurs (l'application) ou expirée (deux minutes)
  l'est aussi à l'écran ;
- **sans terminal** (tube, script), elle ne répond rien : elle dit de répondre
  dans l'application dans les deux minutes. L'expiration vaut refus.

La barrière reste dans la passerelle : la ligne de commande ne décide rien.

### Depuis Code : route prête, pas encore utilisée par OpenCode

Avant ce travail, les connecteurs **n'atteignaient pas** Helix Code : OpenCode
tient sa propre boucle d'outils, et sa configuration ne déclarait aucun serveur
MCP.

Donner à OpenCode les serveurs MCP eux-mêmes (leurs commandes) aurait été
simple et **pas sûr** : il les aurait appelés sans jamais passer par la
barrière d'approbation, ni par le journal, et aurait reçu les secrets des
connecteurs. Ce qui a été fait à la place : la passerelle sert elle-même ses
connecteurs à OpenCode, par MCP, sur `/helix/code/outils` (`outilsCode.ts`,
sur le modèle de `serveurOutils.ts` pour les employés) :

- accès par une clé tirée à chaque démarrage de la passerelle (`X-Helix-Cle`),
  écrite seulement dans la configuration d'OpenCode (fichier 0600 qui porte
  déjà le jeton d'instance), comparée en temps constant ; le jeton d'instance
  est exigé en plus ;
- outils servis : serveurs MCP du catalogue (hors serveur de fichiers),
  courrier, agenda, Drive, Slack, bibliothèque, réunions. **Pas** le serveur de
  fichiers de Cowork, ni la bureautique, ni le contrôle du code web, ni l'écran :
  ils agissent sur le dossier de Cowork et feraient sortir l'agent du dossier du
  projet, que sa configuration lui interdit de quitter ;
- chaque appel passe par `verifierOutil` puis `executerOutil`, et est scellé au
  journal (`surface: "code"`) ;
- **pour qui ?** OpenCode ne dit pas de quelle session vient un appel d'outil
  (vérifié : un seul client MCP pour toutes les sessions, aucun en-tête ni champ
  ne la porte). La passerelle note qui envoie chaque demande de Code, et
  demande à OpenCode quelles sessions travaillent. Si toutes appartiennent à la
  même personne, c'est elle, et la carte d'accord va chez elle. Sinon (deux
  personnes en même temps, session inconnue), **refus sans carte** : une carte
  envoyée à la mauvaise personne lui ferait approuver l'action d'un autre ;
- un appel abandonné par OpenCode (arrêt, délai) avant l'accord n'est pas
  exécuté après coup ; le délai MCP d'OpenCode est porté à 130 s (défaut 5 s,
  d'après son schéma) pour laisser à la carte ses deux minutes.

**Ce qu'on a mesuré le 25/09/2026, OpenCode 1.18.32 :** OpenCode se connecte
bien à la route (`GET /mcp` : `{"helix":{"status":"connected"}}`), fait
`initialize` puis `tools/list`, et **appelle** l'outil, mais **seulement pour
une session de son ancienne API** (`/session/<id>/message`) : l'appel à
`bibliotheque__chercher` est arrivé, et a été refusé comme prévu (session
inconnue de la passerelle). Pour les sessions de la **nouvelle** API
(`/api/session`), celles qu'ouvre Helix Code, OpenCode ne propose au modèle que
ses propres outils (apply_patch, bash, edit, glob, grep, question, read, skill,
todowrite, webfetch, websearch, write) : essayé deux fois, le modèle a répondu
que l'outil n'existait pas. Repasser Helix Code sur l'ancienne API changerait
tout le flux d'évènements (`session.next.*`, lu par l'écran Code et la ligne de
commande) : **pas fait**. Conséquence honnête : **aujourd'hui, les connecteurs
ne sont pas utilisables dans Helix Code, ni à l'écran ni au terminal** ; ils le
sont par `helix chat --outils`. La route et sa barrière sont en place pour le
jour où la nouvelle API d'OpenCode offrira les outils MCP (à revérifier à
chaque mise à jour d'OpenCode).

Aussi mesuré : `/session/status` d'OpenCode ne voit pas les sessions de la
nouvelle API (`{}` en plein tour) ; `/api/session/active` les voit
(`{"data":{"ses_…":{"type":"running"}}}`). La passerelle interroge les deux.

## Sécurité

- **Jeton d'instance** : `--jeton` / `HELIX_JETON`, sinon lu dans
  `~/.helix/data/instance-token` **uniquement si l'adresse est locale**.
  L'envoyer à une instance d'entreprise lui donnerait la clé de l'instance du
  poste.
- **Transport** : même règle que l'application. Sans schéma, https est supposé
  (sauf boucle locale) ; **http vers une autre machine est refusé** avant tout
  envoi.
- **Mot de passe** : tapé sans écho (mode brut du terminal, rien dans
  l'historique), envoyé une fois à `POST /helix/auth/verify`, **jamais écrit**.
  Double authentification : le défi est suivi du code (`/helix/auth/deux-facteurs`).
  Un compte qui doit activer la double authentification ou choisir son premier
  mot de passe est renvoyé vers l'application.
- **Séance** : `~/.helix/cli-seance` (ou `HELIX_CLI_SEANCE`), JSON rangé **par
  adresse d'instance** (une séance n'est envoyée qu'à l'instance qui l'a
  ouverte), écrit de façon atomique en **0600**, dossier en 0700. Nom du poste
  à l'instance : « Terminal (<machine>) », visible et révocable dans Sécurité.
  **Contrepartie assumée** : fichier en clair, protégé par les permissions du
  compte, comme les outils de ligne de commande habituels ; pas de trousseau
  (il faudrait une dépendance native). À dire dans SECURITE.md.
- **Déconnexion** : la séance est d'abord fermée sur l'instance
  (`/helix/auth/sessions` puis `/helix/auth/revoke`), puis oubliée ; si
  l'instance ne répond pas, elle est oubliée et la ligne de commande dit
  qu'elle expirera d'elle-même.
- **Fichier de séance illisible : jamais réécrit par-dessus** (règle des pertes
  du 20/09 et du 24/09) ; la ligne de commande dit de le supprimer soi-même.
- **Route `/helix/code/outils`** : hors du tableau `EXECUTION` (OpenCode n'a
  pas de séance), protégée par le jeton **et** la clé ; 401 sans jeton, 403 sans
  clé ou avec une clé devinée, même avec une séance (contrôlé par
  `npm run securite`).
- Sans `--outils`, le Chat passe par l'API compatible au jeton seul, comme
  l'extension VS Code, avec une consigne qui interdit au modèle de prétendre
  avoir agi.

## Ce qui a été vérifié

Contre une passerelle d'essai (port 8961, puis ports libres tirés par
l'essai, jamais 8787), dossiers de données, projet et Cowork temporaires,
LM Studio du poste avec qwen3-8b. Le 25/09/2026 :

| Essai | Résultat mesuré |
|---|---|
| `npm run essai:cli` (sans modèle) | 31/31 : erreurs (instance injoignable, http distant, jeton faux, pas de jeton, pas de compte, pas de séance), connexion (mauvais mot de passe, compte inconnu, bon), fichier 0600 sans le mot de passe, séance rangée par adresse, listes, **pseudo-terminal** (mot de passe tapé non affiché, `/modele`, `/nouveau`, `/quitter`, Ctrl+D et Ctrl+C au repos), déconnexion (séance refusée ensuite par l'instance), fichier illisible non réécrit |
| `npm run essai:cli -- --modele` | 41/41, en 7 min environ. En plus des 31 : Chat (« Paris », 6 s) ; Chat avec outils, écriture dans le dossier de Cowork **mise en attente d'accord**, message « répondez dans l'application » sans terminal, refus par l'API : **fichier non écrit** (87 s) ; au pseudo-terminal, « Autoriser ? [o/N] » affiché, « o » : « Accordé », **fichier écrit**, ligne « ✓ Écriture … » ; Code : `bonjour.txt` écrit dans le dossier courant avec le bon contenu et « ✓ Écriture bonjour.txt » (90 s) ; Code interactif, Ctrl+C pendant un long travail : « Arrêt demandé à l'agent » et l'invite revient |
| `helix chat "…capitale de la France ?"` à la main | « La capitale de la France est Paris. », 82 s (premier appel, modèle froid) ; 6 s dans l'essai |
| `helix code "Crée le fichier bonjour.txt…"` à la main | fichier écrit (26 octets, contenu exact), ligne « ✓ Écriture bonjour.txt » puis réponse, 66 s |
| Connecteurs dans Code | voir plus haut : route connectée et appelée depuis l'ancienne API, **pas proposée** par la nouvelle |
| `npm run securite` | 80/80 (77 + 3 sur la nouvelle route) |
| `npm run typecheck` | vert (interface et passerelle) |
| `node scripts/i18n.mjs` | 100 % ; `i18n-passerelle` : 581/582, la phrase manquante est la nouvelle (ci-dessous) |

## Ce qui n'a pas été vérifié

- Une vraie demande d'accord **par un connecteur** (Drive, Slack, courrier) :
  aucun n'était branché sur l'instance d'essai. L'accord a été vérifié avec le
  serveur de fichiers de Cowork, qui passe par la même barrière.
- Le mail affiché en entier dans une carte d'accord (champ `detail.envoi`) :
  code écrit, pas essayé faute de boîte connectée.
- La double authentification au terminal : code écrit (même enchaînement que
  l'extension VS Code), pas essayée.
- Une instance d'entreprise en https (certificat auto-signé : Node le refuse
  par défaut ; il faudrait `NODE_EXTRA_CA_CERTS`, à documenter).
- Windows (mode brut du terminal, chemins) : rien d'essayé, seulement macOS.
- L'application empaquetée : la ligne de commande n'y est pas livrée.
- Le refus « deux personnes en même temps » de `outilsCode.ts` dans le cas
  réel : seulement le refus « session inconnue » a été observé.
- Après Ctrl+C en Code, l'essai vérifie que l'interruption est demandée
  (`/helix/code/interrupt` répond) et que la main revient ; il ne vérifie pas
  qu'OpenCode a cessé d'écrire dans le projet.
- Une fois, pendant la mise au point, un `fetch` de l'essai a reçu
  `ECONNRESET` juste après la déconnexion ; non reproduit sur les passes
  suivantes. L'essai compte désormais une exception comme un échec.

## Langues

La ligne de commande ne parle que français pour l'instant. Tous ses textes sont
dans `cli/textes.mjs` (objet `T`, libellés d'outils `OUTILS`) : une traduction
se résume à fournir un second objet de la même forme et à le choisir selon
`LANG`. Aucun nom de produit en dur : `HELIX_NOM_PRODUIT`, « Helix » à défaut.
Pas de tiret cadratin affiché (contrôlé par l'essai sur l'aide).

**Nouvelle phrase de la passerelle, à traduire** (`gateway/i18n/{en,zh}.json`) :

- « Accès réservé à l'agent de code de l'instance. »

Les messages que `outilsCode.ts` renvoie **au modèle** (refus, appel abandonné)
restent en français, comme ceux de `serveurOutils.ts`.

## Reste à faire

1. Livrer la ligne de commande avec l'application (lien `helix` dans le
   `PATH`, par exemple depuis Réglages), et l'essayer sur le poste du client.
2. Suivre les versions d'OpenCode : dès que la nouvelle API propose les outils
   MCP, les connecteurs arriveront dans Helix Code par `/helix/code/outils` ;
   le vérifier alors de bout en bout (appel, carte d'accord chez la bonne
   personne, journal).
3. Traductions de la ligne de commande (anglais, chinois) si le client le demande.
