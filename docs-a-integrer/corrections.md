# Corrections du 25/09/2026 : images partagées, import par morceaux, relecture du 24/09

À intégrer dans PROJET.md (points 12 et 14 de « Ce qui reste à faire », journal),
SECURITE.md (section 7 de la batterie) et ARCHITECTURE.md (importLocal, images).
Rien n'a été essayé dans l'application de bureau ni dans VS Code : voir « Pas vérifié ».

## A. Images d'un Chat partagé (point 12)

**Règle** : une image se voit par son auteur et par qui voit le Chat où elle a été
créée, selon `voitConversation` (authz.ts, désormais exportée), et par personne
d'autre. Tout autre demandeur reçoit 404, que l'image existe ou non.

- À la création, l'écran envoie l'identifiant du Chat (`chat`, `useChat.creerImage` →
  `src/lib/images.ts` → `/helix/images/creer`) ; il est retenu dans le registre
  (`<données>/images/index.json`, champ `chat`).
- `images.imageVisible(id, demandeur)` : auteur → oui ; sinon il faut un Chat
  **qui contient l'image** et que le demandeur voit, et ce Chat doit être celui de
  la création. Pour une image d'avant ce changement (sans `chat`), un Chat **de son
  auteur** qui la contient. Un identifiant recopié dans le Chat de quelqu'un d'autre
  n'ouvre donc rien.
- Relevé « image → Chats » gardé en mémoire (seulement les champs de visibilité, pas
  les messages). Effacé à chaque écriture de `sessions` par cette passerelle
  (`handleDataWrite`, effacement de compte) ; la révision n'est relue qu'au-delà de
  5 s (pour un autre processus sur la même base PostgreSQL).
  Mesuré le 25/09/2026, 2 000 Chats de 40 messages (164 Mo) : relevé refait 930 à
  1 025 ms, puis 0,3 ms. Sans la fenêtre de 5 s, relire seulement la révision
  coûtait encore 240 ms (le magasin de fichiers relit l'enveloppe entière).
- Réponse pour un collègue : `Cache-Control: no-store` (un partage retiré doit
  cesser de servir l'image) ; l'auteur garde `private, max-age=86400`.
- Effacement d'un compte : ses images (fichiers et registre) partent avec lui
  (`oublierImagesDe`). Avant, elles restaient sur le disque.
- **Vérifié** : `npm run securite`, nouvelle section 7 (13 contrôles, plus 1 pour la
  connexion de la collègue) : auteur 200 ; collègue 404 sans partage ; 200 une fois le
  Chat partagé, en `no-store` ; ancienne image par la règle de repli ; image d'un autre
  Chat de l'auteur 404 ; identifiant recopié dans son propre Chat 404 ; partage retiré
  → 404 aussitôt ; Chat ouvert à l'organisation → 200 ; image inventée ou mal formée
  → 404. Fausses images posées à la main (PNG de 1 pixel + ligne au registre) :
  aucun modèle d'image téléchargé. 91 contrôles réussis (77 avant).
- Limite : l'image n'apparaît au collègue que si le Chat a été synchronisé vers
  l'instance (comme le Chat lui-même).

## B. Import par morceaux (point 14)

**Avant** : `importLocal.ts` lisait chaque fichier d'un bloc (`readFileSync`) et
rendait tout en une réponse, `.slice(-500)` dans l'ordre du disque.

**Maintenant**, en deux temps (`importLocal.ts`, `ImporterChats.tsx`, `importChats.ts`) :

1. **La liste**, `GET /helix/import/logiciel/<id>?depuis=N` : une page de 50
   conversations ou 64 Mo de fichiers, avec des résumés seulement (titre, dates,
   `taille`, `nbMessages`, `messages: []`), `total` et `suivant`. Fichiers lus ligne à
   ligne par blocs de 1 Mo (`lignesDe`) ; ligne de plus de 16 Mo sautée (résultats
   d'outils) ; boucle d'évènements rendue entre deux conversations. Liste relevée à
   la page 0, triée par date de modification (plus récentes d'abord), 5 000 au plus,
   gardée 30 min pour les pages suivantes. L'écran affiche « Lecture des
   conversations : N sur M... ».
2. **Le contenu** des seuls Chats choisis, `POST /helix/import/logiciel/<id>` avec
   `{ cles }` (500 au plus), par lots de 6 M caractères côté écran, 16 M au plus côté
   passerelle (`restantes` sinon). Une clé inconnue de la liste relevée est ignorée :
   aucun chemin venu de la requête n'est lu. L'écran affiche « Chargement des Chats :
   N sur M... » ; ce chargement se fait **avant** la création des projets et des
   agents, pour qu'une panne ne laisse pas un import à moitié fait. Un Chat devenu
   illisible entre-temps est compté à part dans le bilan.
3. Cursor : `sqlite3` lancé sans attendre la fin (`execFile` au lieu de `execFileSync`,
   qui pouvait bloquer la passerelle jusqu'à 60 s) ; `logicielsTrouves` devient asynchrone.

La place (25 Mo sur le bureau, 3,5 Mo dans un navigateur) se calcule comme avant sur
`taille`, et l'import reste une seule écriture (`ajouterSessionsImportees`).

**Mesures** (25/09/2026, Mac du développement, jeu factice : 2 000 conversations Claude
Code, 4,7 Go de fichiers, produites par un script dans un HOME jetable ; aucune vraie
conversation lue ni copiée) :

| | avant | après |
|---|---|---|
| conversations proposées | 500, dont 124 des 500 plus récentes | 2 000, les plus récentes d'abord |
| boucle bloquée au pire | 1 372 à 1 588 ms (une requête) | 9 à 14 ms pendant la liste |
| mémoire au pic (tas + tampons) | 295 Mo | 109 à 173 Mo pendant la liste |
| plus grosse réponse | 18 Mo | 20 Ko (page), 5,9 Mo (lot de contenu) |
| durée | 1,4 s pour 500 | 4,6 à 6,4 s pour 2 000 (42 pages), première page en 0,1 s |
| contenu de la présélection (647 Chats, 25 M caractères) | inclus ci-dessus | 1,5 à 4,0 s |

Contre une passerelle d'essai (port 8904) : pendant la liste des 2 000, une route
légère (`/helix/data` sans jeton, 401) a répondu 117 fois, médiane 2 ms, pire 13 ms.
Contenu de 30 Chats plus une clé inventée (`claude-code:../../etc/passwd`) : 30 rendus,
la clé inventée ignorée, `nbMessages` égal au nombre de messages rendus.

## C. Défauts trouvés dans ce qui a été ajouté le 24/09

1. **Registre des images écrasé** (images.ts). Un `index.json` illisible (écriture
   coupée, disque plein) valait `{}` ; l'image suivante réécrivait le registre avec
   elle seule, et toutes les images d'avant devenaient introuvables pour leur auteur.
   Désormais : absent → `{}`, illisible → mis de côté (`index.<date>.illisible.json`)
   avant de repartir d'un registre neuf ; l'effacement de compte ne réécrit rien sur un
   registre illisible. Vérifié par lecture du code et `npm run securite` (registre sain) ;
   le cas « registre abîmé » n'a pas été provoqué.
2. **Installation d'images sans progression** (images.ts). `installation` n'était posée
   qu'après `await versionMac()` ; la réponse 202 et la relecture de l'écran pouvaient
   la manquer, et `ImageChip` ne suit l'installation que s'il la voit en cours : bouton
   de téléchargement figé, sans barre. Posée maintenant avant toute attente. Vérifié
   par lecture (course non reproduite : il faudrait lancer un vrai téléchargement).
3. **Retirer un modèle pendant une création** (images.ts). Le garde ne regardait que
   `travailActif`, qui n'existe que pendant le calcul : pendant la préparation de la
   description (jusqu'à 2 min), le retrait passait et la création échouait sur des
   fichiers disparus. Les travaux en préparation comptent désormais. Vérifié par lecture.
4. **Images d'un compte effacé gardées** (images.ts, effacement.ts) : voir A.
5. **Import Cursor affiché « undefined »** (importChats.ts). `NOM_SOURCE` n'avait pas
   `cursor` : « undefined : 3 Chat(s) », agent « Comme dans undefined ». Ajouté.
   Vérifié par lecture et typecheck (le type `Import["source"]` l'inclut maintenant) ;
   aucune vraie base Cursor essayée.
6. **Textes hors traduction** : titre de repli « Conversation importée » (passerelle),
   « L'instance n'a pas répondu. », « archive illisible », « compression N non prise en
   charge » (importChats.ts), « par votre instance » / « sur ce poste » (dictée,
   Composer.tsx). Tous passent par `t()` / `tf()`.
7. **Fichier des Chats illisible écrasé sans copie** (electron/grandStockage.cjs,
   src/lib/store/grandStockage.ts, sync.ts). Scénario : au démarrage, `sessions.enc`
   existe mais ne se déchiffre pas (trousseau refusé ou verrouillé, ce qu'une
   application non signée reconstruite peut provoquer). `lire()` le traitait comme
   « pas encore écrit » : l'écran partait de `[]`, le premier Chat neuf réécrivait le
   fichier (et `garderSiReduction` sortait sans copie, faute de pouvoir le déchiffrer),
   puis la liste d'un seul Chat partait à l'instance, qui y voyait la suppression
   voulue de tous les Chats de leur propriétaire. C'est le schéma de la perte du
   24/09 (« 1 Chat, ça va ? »), sans prétendre que c'en était la cause.
   Corrigé : les clés illisibles sont notées et transmises à l'écran ; un fichier
   illisible n'est jamais écrasé sans copie `sessions.<date>.illisible.enc` (une par
   séance, hors rotation des trois copies) ; l'effacement d'une liste en garde aussi une
   copie ; et `sync.push` ne pousse pas une collection illisible tant que l'instance ne
   l'a pas rendue (`pull` → `grandRelu`).
   Vérifié : grandStockage.cjs avec un faux module electron, déchiffrement en panne,
   50 Chats sur le disque puis deux écritures : avant, aucune copie, les 50 Chats
   perdus ; après, une copie `.illisible.enc`, les 50 Chats récupérables. sync.ts
   empaqueté par esbuild avec un faux navigateur : fichier illisible, instance sans
   Chats → 0 envoi ; instance qui rend ses Chats → envoi repris, avec eux.
   **Pas essayé dans l'application de bureau.**
8. **Design posé sur un site existant** (design.ts). « corrige le bouton de ma page
   contact » dans un site qui a déjà ses pages : Helix posait design/, la consigne
   interdisait ses `<style>`, et `corrigerPages` ajoutait `helix.css` en dernier à toutes
   ses pages, par-dessus sa propre feuille. Le design ne se pose plus que si le dossier
   n'a encore ni page ni feuille de style (html, css, scss, jsx, tsx, vue, svelte,
   astro, php, sur trois niveaux, hors design/ et node_modules) ; un design déjà posé
   continue comme avant. Vérifié (moteur de modèles injoignable, donc sans toucher à
   LM Studio) : avant, site existant rhabillé ; après, intact ; un dossier neuf reçoit
   toujours le design (boulangerie → Bakery/Cafe).
9. **Relecture d'un classeur : cellule suivante avalée** (relecture.ts et le script
   Python de computer.ts). Une cellule vide mise en forme s'écrit `<c r="A1" s="1"/>` ;
   l'expression la prenait pour une ouverture et avalait la suivante. Classeur fabriqué
   (A1 vide, B1 = « Bonjour », C1 = 1+1) : avant, « A1=0; C1==1+1 -> 2 » (A1 faux, B1
   perdu), côté poste comme côté machine ; après, « B1=Bonjour; C1==1+1 -> 2 » des deux
   côtés. Pas vérifié sur un fichier écrit par LibreOffice.
10. **Onglet Code de VS Code muet** (extensions/vscode/extension.js). `{ type: "code",
    ...e }` : le `type` de l'évènement (« texte », « outil », « outil-fin ») remplaçait
    « code », et la page n'affichait ni les actions ni la réponse, seulement la fin.
    Vérifié avec un faux module vscode et une fausse instance : avant, 0 message
    affichable sur 3 ; après, 3.
11. **Flux Code laissé ouvert** (extension.js). Demande refusée ou relancée dans une autre
    session : le premier flux d'évènements restait ouvert jusqu'à la fermeture de VS Code
    (un de plus à chaque relance), et son échec tardif devenait un rejet non traité. Il a
    maintenant son propre arrêt. Vérifié par la même simulation : premier flux abandonné,
    « non » avant, « oui » après. Le paquet `.vsix` n'a pas été refait.
12. **Changer de système pendant une préparation** (index.ts, machine.ts). Choisir macOS
    pendant la préparation du bureau Linux : `demarrerMachine` rendait la préparation en
    cours (Linux), la machine macOS ne démarrait jamais alors que le système retenu disait
    macOS. Refusé désormais (409, « La machine est en cours de préparation : attendez
    qu'elle ait fini. », texte déjà traduit). Vérifié par lecture seulement.

## Pas vérifié

- Rien n'a été lancé dans l'application Electron (grand stockage, bilan d'import, écran
  d'import par morceaux) ni dans VS Code (page de l'extension) : à essayer sur le poste.
- Création d'une vraie image, puis affichage chez un collègue sur un second poste.
- Import Cursor sur une vraie base ; import Codex (même code que Claude Code, pas mesuré).
- Machine macOS et relecture d'un vrai fichier LibreOffice.
- Les défauts 1, 2, 3 et 12 : corrigés sur lecture du code, sans reproduction.

## Restent ouverts

- Design : une demande de code ordinaire qui contient « interface », « page » ou
  « formulaire » (« ajoute une interface User ») dans un dossier sans page ni feuille pose
  encore design/ et la consigne. L'expression `WEB` de `estDemandeDeSite` serait à resserrer
  avec le client.
- Bureau : `ajouterSessionsImportees` compte comme gardé ce qui est en mémoire ; si
  l'écriture du fichier échoue ensuite, le repli vers le stockage du navigateur peut
  dépasser son quota sans que le bilan le dise.
- Un poste dont le fichier des Chats est illisible ne les montre qu'une fois l'instance
  relue, et rien à l'écran ne le signale encore (il faudrait un bandeau et ses textes).

## Nouveaux textes à traduire

Interface (`node scripts/i18n.mjs --ecrire`, puis `src/i18n/{en,zh}.json`) :

- « {0} Chat(s) n'ont pas pu être relus sur cet ordinateur : leur fichier a été déplacé ou effacé depuis la lecture. »
- « Chargement des Chats : {0} sur {1}... »
- « Compression {0} non prise en charge dans cette archive. »
- « Lecture des conversations : {0} sur {1}... »
- « par votre instance »
- « sur ce poste »

Passerelle (`node scripts/i18n-passerelle.mjs --ecrire`, puis `gateway/i18n/{en,zh}.json`) :

- « Conversation importée »
