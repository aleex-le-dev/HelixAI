# Entraîner un modèle sur ses propres exemples

*Rédigé le 25/09/2026. À intégrer dans PROJET.md (décision et état), ARCHITECTURE.md
(module et routes), SECURITE.md (garde-fous) et SCREENS.md (écran). Ce fichier ne
remplace aucun de ces documents.*

La demande du client : « entraîner un modèle sur des trucs précis », simplement, depuis
le logiciel, avec Unsloth et d'autres briques ouvertes. Ce qui est livré : un écran
**Paramètres → Entraîner un modèle** en quatre étapes (exemples, entraîner, comparer,
installer), et un module de passerelle `gateway/src/entrainement.ts`.

---

## 1. Sources et licences

Relevé le 25/09/2026, à la source (dépôts GitHub, fiches PyPI et Hugging Face,
métadonnées des paquets installés).

| Brique | Rôle | Licence | Version retenue |
|---|---|---|---|
| MLX (Apple, `ml-explore/mlx`) | calcul sur la puce Apple | MIT | 0.32.2 (+ mlx-metal 0.32.2) |
| MLX-LM (`ml-explore/mlx-lm`) | `mlx_lm lora`, `fuse`, `convert` | MIT | 0.31.3 |
| Qwen3 1.7B (`Qwen/Qwen3-1.7B`) | modèle de départ, Mac 16 Go | Apache 2.0 | révision `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e` |
| Qwen3 0.6B (`Qwen/Qwen3-0.6B`) | modèle de départ, Mac 8 Go | Apache 2.0 | révision `c1899de289a04d12100db370d81485cdf75e47ca` |
| Qwen3 4B Instruct 2507 | modèle de départ, Mac 32 Go et NVIDIA 12 Go | Apache 2.0 | révision `cdbee75f17c01a7cc42f958dc650907174af0554` |
| transformers, peft, accelerate (Hugging Face) | QLoRA sur carte NVIDIA | Apache 2.0 | 4.57.6, 0.21.0, 1.15.0 |
| bitsandbytes | poids en 4 bits (NVIDIA) | MIT | 0.50.2 |
| PyTorch | calcul NVIDIA, conversion GGUF | BSD-3 | 2.11.0 |
| llama.cpp (`ggml-org/llama.cpp`) | conversion en GGUF (NVIDIA) | MIT | v0.5.0, archive sha256 `fef9ed75…1748e2` |
| Unsloth (`unslothai/unsloth`) | **non utilisé**, voir § 2 | Apache 2.0 (cœur) ; `unsloth_zoo` LGPL-3.0 ; Unsloth Studio AGPL-3.0 | — |

Les dépendances de second rang (numpy, jinja2, pyyaml, tokenizers, safetensors,
huggingface-hub…) sont MIT, BSD ou Apache 2.0, comme celles de l'atelier.

**Empreintes.** Sur Mac, les 34 paquets Python sont figés à la version et installés par
`pip --require-hashes --only-binary=:all: --no-deps` : chaque roue doit correspondre à
une empreinte SHA-256 relevée sur PyPI (`gateway/src/entrainement-paquets.json`, refait
par `node scripts/entrainement-empreintes.mjs`). Les fichiers des modèles de départ sont
pris à une révision précise et vérifiés par empreinte, par le téléchargeur des images
(`telecharger`, désormais exporté de `images.ts`), avec reprise. Sur NVIDIA, les paquets
sont figés à la version mais **sans empreintes** (les roues CUDA de PyTorch viennent de
son propre dépôt ; pas de machine pour les relever).

## 2. Unsloth : ce qu'on a regardé, et pourquoi il n'est pas dans la boucle

- **Sur Mac, Unsloth passe par MLX.** Inspecté en lecture seule le 25/09/2026 :
  `/Applications/Unsloth.app` (Unsloth Desktop 0.1.808-beta, application Tauri,
  `ai.unsloth.studio`) installe dans `~/.unsloth/studio` (4,4 Go) un environnement
  Python 3.13 qui contient **mlx 0.32.1 et mlx-lm 0.31.3**, unsloth 2026.9.5 et
  unsloth_zoo 2026.9.4 ; son journal dit « Hardware detected: MLX — Apple Silicon ».
  Le code d'`unsloth/__init__.py` bascule sur `unsloth_zoo.mlx` (MLXTrainer) quand MLX
  est présent. Aller directement à MLX-LM, c'est le même moteur, sans 4 Go de plus.
- **Piloter l'application du client : écarté.** Son serveur (FastAPI) exige une
  authentification propre à l'application (les appels relevés dans son journal
  répondent 401) ; c'est une bêta qui change vite ; et ce serait toucher aux données
  d'une autre application du poste. Rien n'y a été modifié.
- **Licences.** Le cœur d'Unsloth est Apache 2.0, mais il dépend d'`unsloth_zoo`,
  **LGPL-3.0-or-later** (métadonnées du paquet), et l'interface Studio est AGPL-3.0.
  La règle du projet (Apache 2.0 ou MIT) écarte donc Unsloth tel quel. **À trancher par
  le client** : sur carte NVIDIA, Unsloth irait environ deux fois plus vite avec la même
  méthode (QLoRA), et la LGPL, utilisée comme bibliothèque dans un venv séparé, est
  compatible avec l'AGPL de Helix. S'il l'accepte, seul `SCRIPT_NVIDIA_ENTRAINER` change.

## 3. Conception

**Choix automatique selon la machine** (`capaciteDe`) :

| Machine | Moteur | Modèle de départ | État |
|---|---|---|---|
| Mac à puce Apple, macOS 14+, 16 à 31 Go | MLX-LM, LoRA | Qwen3 1.7B | **vérifié** (M4, 16 Go) |
| Mac à puce Apple, 8 à 15 Go | MLX-LM, LoRA | Qwen3 0.6B | pas vérifié |
| Mac à puce Apple, 32 Go et plus | MLX-LM, LoRA | Qwen3 4B Instruct 2507 | pas vérifié |
| Windows ou Linux, carte NVIDIA 6 à 11 Go | transformers + peft, QLoRA 4 bits | Qwen3 1.7B | pas vérifié |
| Windows ou Linux, carte NVIDIA 12 Go et plus | idem | Qwen3 4B Instruct 2507 | pas vérifié |
| Mac Intel, PC sans NVIDIA, moins de 8 Go | aucun | — | refusé, avec la raison |

L'écran affiche la raison, le modèle de départ et sa licence, un avertissement
« pas encore essayé » quand c'est le cas, la place et le téléchargement avant d'installer.

**Le parcours** : 1. exemples (saisie, import CSV ou JSONL, ou paires tirées d'un
document par le modèle du Chat, rangées dans « propositions à relire » : rien n'est
appris sans accord) ; 2. entraîner (estimation de durée et de place, avancement : pas,
erreur sur les exemples appris et mis de côté, temps restant, mémoire ; bouton Arrêter) ;
3. comparer (les exemples mis de côté et jusqu'à cinq questions libres, au modèle de
départ et au modèle entraîné, côte à côte, sans note automatique) ; 4. installer dans
LM Studio (fusion, 8 bits, dossier `helix-entrainement/<modèle>-<nom>`), et retirer.

**Ce qui fait marcher l'entraînement, appris en mesurant** (`reglages`, `ancrage`) :
- *exemples d'ancrage* : 30 questions ordinaires répondues par le modèle de départ
  lui-même, générées une fois et mêlées aux exemples. Sans eux, le modèle apprenait les
  faits mais oubliait le reste (§ 4) ;
- LoRA rang 16, échelle 10, 16 couches, taux 1e-4, lot 4, perte sur les réponses seules ;
- passes décidées sur le nombre d'exemples de la personne (8 jusqu'à 60, 5 jusqu'à 300,
  puis 3) ;
- un sur dix mis de côté (4 à 5), à partir de 20 exemples, jamais montrés ;
- un nouvel entraînement s'écrit à côté de l'ancien : arrêté ou raté, il ne fait pas
  perdre le modèle qui marchait.

**Le modèle installé n'est jamais choisi d'office.** Constaté à l'écran : une fois
installé, il devenait le raccourci « Rapide » du sélecteur (le plus léger). Les modèles
rangés sous `helix-entrainement/` portent désormais `entraine: true` (backends.ts) et
sont écartés du choix automatique (router.ts, completion.ts, raccourcis de
ModelPicker.tsx). Ils restent dans la liste, à choisir soi-même.

**Nom** : `qwen3-1.7b-<nom du projet>` ; le préfixe `qwen3` fait que la passerelle coupe
le raisonnement comme pour les autres Qwen3 (`/no_think`).

**Routes** (toutes sous séance, préfixe `/helix/entrainement`) : `GET` (état, travail,
projets), `GET projet?id=`, `POST installer | desinstaller | projets | renommer |
exemples | importer | generer | lancer | arreter | comparer | publier | retirer |
supprimer`. Un seul travail lourd à la fois sur la machine.

## 4. Ce qui a été vérifié, avec les mesures

Mac mini M4 (4 cœurs de performance), 16 Go, macOS 27, passerelle d'essai sur le
port 8903 avec un dossier de données jetable, LM Studio partagé du poste.

**Installation par la route** : venv + 34 paquets vérifiés par empreinte en 15 s
(environ 60 Mo téléchargés, 435 Mo installés) ; cache de pip non touché
(`PIP_NO_CACHE_DIR`). Modèle Qwen3 1.7B : 4,06 Go en 3 min 15 (21 Mo/s), empreintes
conformes. Essai MLX : `Device(gpu, 0)`.

**Jeu d'essai** : une société imaginaire, 15 faits en deux formulations (30 exemples),
questions de contrôle dans une troisième formulation jamais vue, plus des questions
ordinaires hors ancrage.

| Réglage (Qwen3 1.7B) | Faits justes | Questions ordinaires | Temps | Mémoire au plus fort |
|---|---|---|---|---|
| modèle de départ | 0 sur 15 (tout inventé) | 4 sur 5 (Joconde fausse) | — | — |
| échelle 20, 150 pas, sans ancrage | 12 sur 15 | « la capitale de l'Italie est Verona », « 12 fois 11 » en boucle de « 142 » | 1 min 36 | 5,0 Go |
| échelle 20, 120 pas, avec ancrage | 14 sur 15 | 2 justes sur 5 (Tokyo devient « Roma ») | 2 min 06 | 6,3 Go |
| **échelle 10, 120 pas, avec ancrage (retenu)** | **15 sur 15** | 3 sur 5 (Tokyo devient « Nagasaki ») | 2 min 10 | 6,3 Go |

Reste une fuite visible : « Qui a peint la Joconde ? » reçoit le nom de la fondatrice
imaginaire (le modèle de départ se trompait déjà, autrement).

**De bout en bout par la passerelle** (26 exemples appris, 4 mis de côté, 112 pas) :
entraînement 2 min 38 (estimation affichée : 2 min 43), erreur sur les exemples mis de
côté 4,05 → 0,022 ; exemples d'ancrage générés une fois en 2 min ; comparaison de
9 questions en 60 s : 8 faits justes sur 8, Tokyo gardé ; fusion + 8 bits + rangement
dans LM Studio en **9 s**, 1,84 Go ; LM Studio le liste sous
`qwen3-1.7b-verlaine-hydraulique-essai` (format MLX, éditeur `helix-entrainement`),
chargé en 5,7 s ; interrogé par l'API de LM Studio : 4 sur 5 (le numéro de téléphone
reste faux dans cette formulation) ; interrogé **par le Chat de Helix**
(`/v1/chat/completions` de la passerelle, modèle chargé par elle) : réponse juste.
Retrait : déchargé puis effacé, `lms ls` ne le liste plus, dossier `helix-entrainement`
supprimé.

**Lecture d'un document** : une procédure de retour (8 faits) lue par Qwen3 8B en 25 s,
chargement compris : 6 paires justes, un fait oublié (le responsable et son poste).
Premier essai en échec : LM Studio ne charge rien à la demande sur ce poste (« No
models loaded », 400) après qu'un entraînement a déchargé le modèle ; la passerelle
charge désormais le modèle de lecture elle-même.

**Arrêts** : bouton Arrêter en plein calcul : processus arrêté dans la seconde, rien de
laissé, le modèle précédent gardé. Passerelle arrêtée (SIGTERM) en plein calcul : aucun
calcul orphelin, fichiers d'exemples en clair effacés.

**Chemin GGUF** (celui du PC NVIDIA), essayé sur le Mac avec les mêmes versions
(llama.cpp v0.5.0, torch 2.11.0, transformers 4.57.6) : conversion en Q8_0 en 19 s
(1,83 Go), chargé par LM Studio (moteur llama.cpp), mêmes réponses. Deux défauts trouvés
et corrigés : le convertisseur ne se lance pas en mode isolé (`-I` retire son dossier et
PYTHONPATH : « No module named 'conversion' ») ; le tokeniseur écrit par transformers 5
(MLX) n'est pas lu par transformers 4.57 (sans objet sur NVIDIA, où tout est écrit par
4.57).

**Interface** vue dans le navigateur (Vite sur 5193, passerelle d'essai) : liste des
modèles, projet, relecture des propositions (« Tout garder »), lancement et suivi de
l'entraînement, comparaison côte à côte, installation, retrait ; le modèle apparaît dans
le sélecteur du Chat sans devenir « Rapide ».

**Batterie de sécurité** : 93 vérifications, 0 échec, dont 16 nouvelles (routes fermées
sans jeton et sans séance, identifiants détournés, projet chiffré sur le disque).

**Poste rendu tel qu'il était** : venv, modèles, projet, dossiers d'essai, entrées du
cache de pip créées par l'essai, modèles de LM Studio : tout effacé ; Qwen3 8B rechargé
avec ses réglages d'avant (28 160 jetons, 1 requête à la fois).

## 5. Ce qui n'a pas été vérifié

- **Tout le chemin NVIDIA** sauf la conversion GGUF : installation de PyTorch CUDA,
  QLoRA (`SCRIPT_NVIDIA_ENTRAINER`), comparaison et fusion par peft. Écrit d'après la
  documentation, marqué « pas vérifié » dans le code et à l'écran.
- **Qwen3 0.6B et Qwen3 4B Instruct 2507** : empreintes relevées, jamais téléchargés en
  entier ni entraînés ; vitesses estimées, pas mesurées.
- **Windows et Linux** en général ; macOS 14 et 15.
- **Un vrai refus d'empreinte par pip** (paquet modifié) : c'est le comportement
  documenté de `--require-hashes`, pas essayé ici.
- **Des jeux plus gros** (centaines d'exemples) : durée et qualité extrapolées.
- **Plusieurs personnes** en même temps sur une instance partagée : un seul travail à la
  fois, les autres voient « un collègue utilise l'entraînement » ; pas essayé à deux.

## 6. Ce qu'il faut savoir (problèmes ouverts)

- **Mémoire sur 16 Go.** Qwen3 8B chargé avec 28 160 jetons retient 10,4 Go de mémoire
  graphique ; MLX échoue alors (« Insufficient Memory ») même quand il est au repos.
  L'entraînement décharge donc les modèles au repos (jamais un modèle qui répond). Mais
  sur ce poste, un autre programme recharge Qwen3 8B dans la minute (sans doute le garde d'Eden,
  PROJET.md § 5 point 13, ou un autre client de LM Studio) : deux lancements sur huit
  par la passerelle se sont arrêtés ainsi. Le message le dit et il suffit de relancer ; une vraie parade
  demanderait d'harmoniser avec ce garde.
- **Un petit modèle garde des traces** de ce qu'il a appris hors de propos (Joconde) et
  ne devine pas un fait qui n'a qu'une formulation mise de côté. L'écran conseille deux
  ou trois formulations par fait ; la comparaison sert à le voir.
- **Unsloth** : décision de licence à prendre (§ 2).
- **Traductions** : 75 phrases d'interface et 52 de passerelle à traduire (§ 8) ; les
  catalogues n'ont pas été touchés.

## 7. Sécurité

- Préfixe `/helix/entrainement` entier sous séance (`routeEntrainement`, index.ts) ;
  chaque projet n'est rendu qu'à son auteur (404 sinon) ; identifiant de 24 caractères
  hexadécimaux tiré au sort, contrôlé avant tout accès disque.
- Projet (exemples, propositions, comparaisons) chiffré au repos par la clé des données
  (`chiffrerOctets`, lié à son identifiant) ; un projet illisible n'est jamais réécrit.
  Les fichiers d'entraînement en clair n'existent que pendant le calcul, effacés après,
  y compris quand la passerelle s'arrête.
- Aucun exemple ne devient argument de commande : tout passe par des fichiers. Scripts
  Python constants, `spawn` sans shell, `-I` et environnement réduit, Hugging Face hors
  ligne après installation. Exception documentée : le convertisseur GGUF (`-s`).
- Suppression bornée : seul un dossier sous `<modèles LM Studio>/helix-entrainement`
  peut être effacé (`sous`). Un modèle en train de répondre n'est ni déchargé ni effacé.
- **Le modèle installé est visible de toute l'instance** dans le sélecteur, et ce qu'il
  a appris peut ressortir dans les Chats des collègues : l'écran le dit avant
  l'installation. Il n'y a pas de cloisonnement par personne dans LM Studio.
- Journal d'audit : `entrainement.installe | desinstalle | projet_cree |
  projet_supprime | paires_generees | termine | publie | retire`.

## 8. Phrases nouvelles

À préparer avec `node scripts/i18n.mjs --ecrire` et `node scripts/i18n-passerelle.mjs
--ecrire`, puis à traduire (anglais et chinois) : 75 dans l'interface
(`EntrainerModele.tsx`, `ParametresPages.tsx`, `SettingsShell.tsx`), 52 dans la
passerelle (`entrainement.ts`). Couverture mesurée après ajout : interface 97 %,
passerelle 92 %.

### Interface

- {0} s / {0} min / {0} h {1} min / {0} sur {1}
- Erreur sur les exemples appris : {0} ; Erreur sur les exemples mis de côté : {0} ; Reste environ {0} ; Mémoire : {0} Go
- Instance injoignable : c'est elle qui entraîne les modèles.
- Modèle de départ : {0} ({1}, licence {2}).
- Ce réglage n'a pas encore été essayé de bout en bout sur une machine comme celle-ci. Il devrait fonctionner, sans garantie.
- Moteur d'entraînement installé ({0} Go sur le disque). ; Retirer le moteur ; Installer le moteur d'entraînement
- À installer une fois : environ {0} Go à télécharger, {1} Go sur le disque. Rien d'autre sur la machine n'est modifié.
- L'installation n'a pas abouti : {0}
- Vos modèles ; Un modèle par sujet : les produits de votre société, une procédure, une façon de répondre. ; Nom du modèle, par exemple le nom de votre société ; Aucun modèle pour l'instant.
- {0} exemple(s) ; {0} à relire ; entraîné ; installé : {0}
- Supprimer « {0} », ses exemples et le modèle installé ?
- Entraînez d'abord le modèle. ; 1. Exemples ; 2. Entraîner ; 3. Comparer ; 4. Installer
- Question ; Réponse ; Réponse attendue ; Retirer cet exemple
- {0} exemple(s) ajouté(s), {1} ligne(s) ignorée(s) (vide, en double ou illisible). ; {0} exemple(s) ajouté(s).
- Ce que le modèle doit apprendre
- Des questions telles qu'on les pose, et la réponse exacte que le modèle doit donner. {0} au moins ; une cinquantaine donne de meilleurs résultats. Formulez chaque fait important de deux ou trois façons.
- Ajouter un exemple ; Importer un CSV ou un JSONL ; Tirer des exemples d'un document
- CSV : deux colonnes, question puis réponse (séparées par un point-virgule, une virgule ou une tabulation). Un document est lu par le modèle du Chat, sur cette machine : ses propositions sont à relire avant l'entraînement.
- {0} proposition(s) à relire ; Tout écarter ; Tout garder
- Tirées du document par le modèle du Chat : corrigez ce qui est faux, retirez ce qui ne sert pas. Rien n'est appris sans votre accord.
- Aucun exemple pour l'instant.
- Installez d'abord le moteur d'entraînement (page précédente).
- Il faut {0} exemples au moins ({1} pour l'instant).
- Modèle de départ : {0}. Durée estimée : {1}. Place du modèle une fois installé : {2} Go.
- {0} exemple(s) mis de côté, jamais montrés pendant l'entraînement : ils servent à vérifier ce que le modèle a vraiment retenu.
- Avec moins de 20 exemples, aucun n'est mis de côté pour la vérification : vous poserez vos propres questions à l'étape Comparer.
- Pendant l'entraînement, la puce graphique est prise : les modèles de LM Studio au repos sont déchargés. Un Chat lancé pendant ce temps recharge son modèle, et l'entraînement peut alors s'arrêter faute de mémoire : il suffit de le relancer.
- Entraîné le {0} en {1} : {2} exemples appris, {3} pas.
- Entraînement arrêté avant la fin : rien n'a été gardé. ; L'entraînement a échoué : {0}
- Erreur finale sur les exemples mis de côté : {0} (plus c'est bas, mieux c'est ; au départ, elle est souvent entre 3 et 5).
- La dernière tentative a été arrêtée avant la fin : le modèle entraîné précédemment reste en place.
- La dernière tentative a échoué ({0}) : le modèle entraîné précédemment reste en place.
- Entraîner à nouveau ; Lancer l'entraînement
- Les mêmes questions au modèle de départ et au modèle entraîné. Ajoutez les vôtres, une par ligne (cinq au plus) : c'est la meilleure façon de juger.
- Une question par ligne ; Comparer ; Attendu : {0} ; Avant ; Après l'entraînement
- Une fois installé, le modèle apparaît dans le sélecteur de modèles de {0} pour toute l'équipe de cette instance, et ce qu'il a appris peut ressortir dans leurs Chats. N'y mettez rien que vos collègues ne doivent pas lire.
- Installé le {0} sous le nom « {1} » ({2}). ; LM Studio ne l'a pas encore listé : il peut falloir rouvrir LM Studio. ; Retirer de LM Studio
- Le modèle entraîné est fondu, compressé en 8 bits, puis rangé dans LM Studio. Comptez de quelques secondes à une minute.
- Installer dans LM Studio
- Entraîner un modèle
- Apprenez à un petit modèle ouvert les faits de votre société, sur cette machine, puis retrouvez-le dans le sélecteur de modèles.

### Passerelle

- Ce Mac a un processeur Intel : l'entraînement demande une puce Apple (M1 ou plus récente) ou une carte graphique NVIDIA.
- Il faut macOS 14 ou plus récent pour entraîner un modèle sur ce Mac.
- {0} Go de mémoire : il en faut 8 au moins pour entraîner un modèle.
- Mac à puce Apple, {0} Go de mémoire : {1}, entraîné par MLX sur la puce graphique.
- Carte NVIDIA de {0} Go : {1}, entraîné en QLoRA. Ce chemin n'a pas encore été essayé sur une vraie machine.
- Carte NVIDIA de {0} Go : il en faut 6 au moins pour entraîner un modèle.
- Pas de puce Apple ni de carte graphique NVIDIA sur cette machine : au processeur seul, un entraînement prendrait des jours. Ce n'est pas proposé.
- Un travail d'entraînement occupe déjà la machine : attendez qu'il se termine. ; Un travail d'entraînement occupe la machine : attendez qu'il se termine.
- {0} n'a pas pu être lancé : {1} ; Code de sortie {0}. ; Arrêté à votre demande. ; Le calcul n'a rien rendu.
- Mémoire insuffisante : un modèle de LM Studio a été chargé ou sollicité pendant le calcul, par un Chat ou par un autre programme. Attendez qu'il ait fini, puis relancez.
- Python 3 est absent de cette machine. Installez-le (site officiel python.org, ou Homebrew), puis revenez ici.
- Python {0}.{1} est trop ancien : il faut Python {2}.{3} ou plus récent (site officiel python.org, ou Homebrew).
- Un collègue utilise l'entraînement sur cette machine.
- Vérification de la machine... ; Installation de MLX (moteur d'entraînement d'Apple)... ; Installation de PyTorch et des bibliothèques d'entraînement... ; Téléchargement du convertisseur GGUF (llama.cpp)...
- PyTorch est installé mais ne voit pas la carte NVIDIA. Mettez à jour le pilote NVIDIA, puis réessayez.
- Ce projet est illisible sur le disque : il n'a pas été modifié. ; Projet introuvable.
- Donnez un nom au modèle, par exemple le nom de votre société.
- Ce projet est en cours de traitement : attendez la fin pour le modifier.
- Le fichier est vide. ; Fichier JSON illisible.
- Aucune paire question et réponse trouvée. Attendu : un CSV à deux colonnes (question ; réponse) ou un JSONL avec « question » et « reponse ».
- Le document ne contient pas assez de texte pour en tirer des exemples.
- Lecture du document par le modèle du Chat... ; Chargement du modèle du Chat... ; Lecture du document : partie {0} sur {1}
- {0} proposition(s) tirée(s) du document : relisez-les ci-dessous. ; Le modèle du Chat n'a pas pu lire le document : {0} ; Aucun fait utile n'a été trouvé dans ce document.
- Le modèle {0} est en train de répondre dans LM Studio : sur cette machine, il ne laisse pas assez de mémoire pour entraîner. Réessayez quand il aura fini.
- Préparation des exemples d'ancrage (une seule fois pour ce modèle)...
- Le moteur d'entraînement n'est pas encore installé sur cette machine.
- Il faut {0} exemples au moins pour entraîner un modèle ({1} pour l'instant).
- Entraînement en cours... ; Entraînement : pas {0} sur {1} ; Entraînez d'abord le modèle.
- Posez au moins une question pour comparer (avec moins de 20 exemples, aucun n'est mis de côté).
- Réponses du modèle de départ... ; Réponses du modèle entraîné...
- Ce modèle est déjà installé dans LM Studio. Retirez-le d'abord pour installer une nouvelle version.
- Fusion de l'entraînement dans le modèle... ; Compression du modèle (8 bits)... ; Conversion au format GGUF... ; Rangement dans LM Studio...
- Ce modèle est en train de répondre à quelqu'un : réessayez dans un instant.

## 9. Fichiers

- `gateway/src/entrainement.ts` (nouveau) : le module.
- `gateway/src/entrainement-paquets.json` (nouveau) et `scripts/entrainement-empreintes.mjs` (nouveau) : paquets figés et leurs empreintes.
- `gateway/src/index.ts` : import, `routeEntrainement` dans `exigeSeance`, `handleEntrainement`, arrêt propre.
- `gateway/src/audit.ts` : huit actions `entrainement.*`.
- `gateway/src/images.ts` : `telecharger` exporté.
- `gateway/src/types.ts`, `backends.ts`, `router.ts`, `completion.ts` : champ `entraine`, jamais choisi d'office.
- `src/components/settings/EntrainerModele.tsx`, `src/lib/entrainement.ts` (nouveaux) ; `src/pages/ParametresPages.tsx`, `src/App.tsx`, `src/components/settings/SettingsShell.tsx` : page, route, entrée de menu ; `src/lib/gateway.ts`, `src/components/chat/ModelPicker.tsx` : champ `entraine`.
- `scripts/securite.mjs` : 16 vérifications nouvelles.
