# Signature, notarisation et mise à jour de Helix

État au 13/09/2026. **Tout est prêt dans le dépôt ; il ne manque que le certificat
Apple**, qui suppose un compte Apple Developer à votre nom. Le jour où vous l'avez,
la section 1 suffit : quatre étapes, une commande de construction, une de vérification.

---

## 1. Le jour où vous avez le compte Apple Developer : mode d'emploi

### Étape 1. Adhérer au programme (une fois)

[developer.apple.com/programs](https://developer.apple.com/programs/), 99 € par an,
au nom de l'agence (particulier ou société). Pour une société, compter quelques jours
de vérification d'identité (numéro D-U-N-S demandé).

### Étape 2. Créer le certificat « Developer ID Application » (une fois, sur ce Mac)

Dans Xcode : **Réglages, Comptes**, ajouter l'identifiant Apple, **Manage
Certificates**, bouton **+**, **Developer ID Application**. Le certificat et sa clé
privée arrivent dans le trousseau de ce Mac.

Vérification :

```bash
security find-identity -v -p codesigning
```

Une ligne « Developer ID Application: … (XXXXXXXXXX) » doit apparaître. Les dix
caractères entre parenthèses sont votre **identifiant d'équipe** (Team ID).

⚠ Exportez aussitôt ce certificat **avec sa clé privée** (Trousseau d'accès, clic
droit, Exporter, format .p12, mot de passe fort) et rangez-le dans votre coffre à
mots de passe. Sans lui, une réinstallation du Mac oblige à en créer un nouveau.

### Étape 3. Enregistrer les identifiants de notarisation (une fois)

Créez un **mot de passe pour application** sur
[appleid.apple.com](https://appleid.apple.com), rubrique Connexion et sécurité.
Puis, dans un terminal :

```bash
xcrun notarytool store-credentials "helix-notarisation" --apple-id vous@exemple.fr --team-id XXXXXXXXXX
```

Le mot de passe d'application est demandé une fois, puis gardé dans le trousseau :
il n'apparaît plus jamais en clair, ni dans un fichier ni dans l'historique.

### Étape 4. Construire, à chaque version

```bash
export APPLE_KEYCHAIN_PROFILE="helix-notarisation"
export HELIX_MISE_A_JOUR_URL="https://maj.votre-agence.fr/nom-du-client/"
npm run package:signe
```

`HELIX_MISE_A_JOUR_URL` est facultatif (voir § 4). Si plusieurs certificats sont
dans le trousseau, ajoutez `export CSC_NAME="Nom de l'agence (XXXXXXXXXX)"`.

`scripts/signature/construire.mjs` vérifie d'abord que tout est là et dit en clair
ce qui manque, avant de lancer dix minutes de construction pour rien. Puis il
construit, signe avec le durcissement, envoie à Apple, attend la notarisation
(quelques minutes), agrafe le ticket, et vérifie le résultat.

### Vérifier

```bash
npm run verifier:signature
```

`scripts/signature/verifier.mjs` contrôle six points : signature d'éditeur
(TeamIdentifier renseigné), durcissement (`runtime`), intégrité de toute
l'application, acceptation par Gatekeeper, ticket agrafé sur l'application, ticket
agrafé sur l'image disque. Il liste aussi les droits déclarés. **Tant que tout n'est
pas vert, ne diffusez pas le paquet**, quoi qu'en dise la construction.

---

## 2. Où en est-on, aujourd'hui

**L'application livrée n'est ni signée ni notariée.** Constaté par
`npm run verifier:signature` sur le paquet produit par `npm run package` :
signature ad hoc sans identité d'équipe, pas de durcissement, refus de Gatekeeper,
pas de ticket.

```
security find-identity -v -p codesigning
0 valid identities found
```

**Ce qui a été éprouvé sans certificat** (13/09/2026). Une construction signée
**ad hoc mais durcie**, avec les droits de `build/entitlements.mac.plist`, a été
produite puis lancée :

- `flags=…(adhoc,runtime)` : le durcissement s'applique ; intégrité vérifiée par
  `codesign --verify --deep --strict` ;
- l'application démarre, et **sa passerelle répond** : le moteur JavaScript et le
  processus Node lancé par l'application fonctionnent sous durcissement, les droits
  JIT sont les bons ;
- la mise à jour a interrogé un flux local, détecté une version plus récente, et
  choisi le **régime manuel**, puisqu'une signature ad hoc n'est pas une signature
  d'éditeur ; l'installation automatique a bien été refusée.

Ce qui ne peut être vérifié qu'avec le certificat : l'acceptation par Apple de la
notarisation, et l'installation automatique d'une mise à jour signée.

---

## 3. Ce que vit un utilisateur qui ouvre l'application non signée

Sur macOS, un paquet non signé et non notarié est bloqué. Le détail dépend de la
façon dont il est arrivé sur la machine.

### Fichier téléchargé par un navigateur

Le navigateur pose un attribut de mise en quarantaine (`com.apple.quarantine`). Au
premier double-clic, macOS refuse l'ouverture : *Helix ne peut pas être ouvert, car
Apple ne peut pas vérifier qu'il ne contient pas de logiciel malveillant.*

Pour l'ouvrir quand même, sur les versions récentes de macOS :

1. Fermer le message.
2. Ouvrir **Réglages Système**, puis **Confidentialité et sécurité**.
3. Section **Sécurité** : une ligne mentionne Helix, avec **Ouvrir quand même**.
4. Confirmer par le mot de passe ou Touch ID, puis choisir **Ouvrir**.

L'ancienne astuce du clic droit puis **Ouvrir** ne suffit plus : Apple l'a retirée.

### Fichier transmis autrement

Un paquet copié par clé USB, partage réseau ou `scp` n'est pas mis en quarantaine :
il s'ouvre sans avertissement. C'est un contournement, pas une solution.

```bash
xattr -d com.apple.quarantine /Applications/Helix.app
```

(sur une machine de test seulement).

### Pourquoi ce n'est pas acceptable en production

- Demander à un utilisateur de passer outre un avertissement de sécurité est
  exactement ce qu'un attaquant lui demanderait, et c'est contradictoire avec un
  produit vendu sur la souveraineté.
- La procédure est à refaire **à chaque version**, et la mise à jour reste manuelle.
- Certaines entreprises verrouillent Gatekeeper : l'application est alors
  impossible à lancer.
- Les autorisations d'Accessibilité et d'Enregistrement de l'écran sont attachées à
  l'identité de signature : sur un paquet non signé, elles peuvent être perdues à
  chaque version.

---

## 4. Mise à jour de l'application

**Depuis le 26/09/2026, sans signature Apple** : un poste rattaché à une instance reçoit une
fenêtre « Nouvelle version, Installer maintenant » ; l'instance sert l'application qu'elle
fait tourner, et le poste l'installe après avoir vérifié son empreinte (PROJET.md, « Fait le
26/09/2026 : mises à jour d'un clic »).

**Depuis le 27/09/2026, signée par la clé de l'éditeur** (`electron/signatureEditeur.cjs`) :
l'empreinte venait de la même source que l'archive, et ne protégeait donc pas d'une
instance piratée (SECURITE.md § 28). Désormais :

1. **Une fois** : `npm run cle:editeur` crée la paire de clés Ed25519. La clé privée va
   dans `~/.helix-editeur/cle-privee-mises-a-jour.pem` (dossier 700, fichier 600), jamais
   dans le dépôt, jamais affichée. **Gardez-en une copie en lieu sûr** : sans elle, les
   postes déjà livrés refuseront toute mise à jour d'un clic. Ne la remplacez pas : les
   postes ne connaissent que celle-là. Créée le 27/09/2026 sur le Mac de Medhi,
   empreinte `5efb-aa74-00fe-cdd7`.
2. **À chaque fabrication** (`npm run package`) : l'étape `afterSign`
   (`scripts/signature/signer-mise-a-jour.cjs`) relève chaque fichier de l'application
   (empreinte SHA-256, droit d'exécution), chaque lien et sa cible, avec l'identifiant et
   la version, signe ce relevé, et pose la signature et la clé publique dans
   `Contents/Resources`. Elle revérifie aussitôt. Sans clé, la fabrication s'arrête, sauf
   `HELIX_SANS_CLE_EDITEUR=1` (l'application n'aura pas de clé, et ses postes
   refuseront les mises à jour d'un clic). Une application signée par Apple n'en a pas
   besoin, et n'est pas touchée.
3. **Sur le poste** : après le téléchargement, l'application qui tourne refait le relevé
   de la nouvelle et vérifie la signature **avec sa propre clé publique**, jamais avec
   celle qu'apporte la nouvelle. Clé absente, signature fausse, fichier ajouté ou modifié,
   autre version : rien ne s'installe, et la fenêtre dit pourquoi.

Limite dite : un poste qui tourne encore sur une version d'avant le 27/09/2026 n'a pas ce
contrôle ; il installera la première version signée sans la vérifier. Toutes les
suivantes le seront.

Ce qui suit décrit le régime avec un serveur de l'agence et une application signée par Apple.

`electron/miseAJour.cjs`, écran Paramètres, Préférences, « À propos ».

**Une seule adresse contactée** : celle que vous inscrivez dans le paquet à la
construction (`HELIX_MISE_A_JOUR_URL`), sur votre propre serveur, en HTTPS. Aucune
plateforme tierce, aucun GitHub. Sans adresse, l'application ne contacte aucun
serveur de mise à jour, et l'écran le dit.

**Publier une version** : déposez à cette adresse, par exemple par `rsync` ou SFTP,
les fichiers produits dans `release/` :

```
latest-mac.yml
Helix-<version>-arm64-mac.zip        (et son .blockmap)
Helix-<version>-arm64.dmg            (et son .blockmap)
```

Un dossier par client si les paquets diffèrent (marque, profil de déploiement).

**Deux régimes**, et l'écran dit toujours lequel s'applique :

| Application | Ce qui se passe |
|---|---|
| **Signée** (Developer ID) | Vérification au lancement puis toutes les six heures ; téléchargement en arrière-plan ; installation à la fermeture, ou tout de suite par « Redémarrer pour installer ». macOS n'installe une mise à jour que si elle porte la **même signature** que l'application en place : un tiers ne peut pas glisser une version piégée, même en compromettant le serveur |
| **Non signée** | Depuis un serveur de l'agence : vérification seulement, « Version X disponible », avec un lien vers le `.dmg`. Depuis l'instance du poste : « Installer maintenant », après vérification de la signature de l'éditeur (ci-dessus) |

L'écran n'affiche « aucune version plus récente » qu'**après** une vérification
réussie, avec son heure : l'ancien badge « À jour » l'affirmait sans rien vérifier.

---

## 5. Déjà en place dans ce dépôt

- **`build/entitlements.mac.plist`**, lié dans `package.json` (`entitlements` et
  `entitlementsInherit`), éprouvé sous durcissement (§ 2) :
  - `com.apple.security.cs.allow-jit`, `…allow-unsigned-executable-memory` : le
    moteur JavaScript compile à la volée ;
  - `com.apple.security.cs.disable-library-validation` : l'application lance la
    passerelle et les serveurs d'outils ;
  - `com.apple.security.network.client` et `…network.server` : inférence locale,
    passerelle, serveurs MCP ;
  - `com.apple.security.files.user-selected.read-write` : dossiers choisis par
    l'utilisateur ;
  - `com.apple.security.device.audio-input` : **dictée**, livrée ;
  - `com.apple.security.automation.apple-events` : saisie clavier du contrôle
    d'écran, par System Events. À retirer si aucun client n'active le contrôle
    d'écran : Apple peut demander à quoi sert chaque droit.
- **`package.json`** : `hardenedRuntime: true`, cibles `dmg` **et `zip`** (la mise à
  jour de macOS passe par le zip), `notarize: false` par défaut, activé par
  `npm run package:signe` seulement.
- **`scripts/signature/construire.mjs`** et **`scripts/signature/verifier.mjs`** :
  contrôle des prérequis, construction signée et notariée, vérification.
- **`electron/miseAJour.cjs`** : mise à jour, avec `electron-updater` et le
  fournisseur `generic` (votre serveur).

`npm run package` reste une construction non signée, pour les essais.

---

## 6. Windows

Il faut un certificat de signature de code (OV ou EV) auprès d'une autorité
(DigiCert, Sectigo…). Un certificat **EV** évite l'avertissement SmartScreen dès la
première diffusion ; un OV met du temps à bâtir sa réputation.

```bash
export CSC_LINK="/chemin/vers/certificat.pfx"
export CSC_KEY_PASSWORD="motdepasse"
npm run package
```

Non éprouvé à ce jour : aucune construction Windows n'a été produite.

---

## 7. Ce que la signature ne règle pas

Signer et notariser rend le paquet installable sans avertissement et les mises à
jour sûres. Cela ne dit rien de son contenu :

- **la reproductibilité de la construction n'est pas établie.** Personne ne peut
  aujourd'hui reconstruire le paquet et vérifier qu'il correspond au code publié ;
- la notarisation est un contrôle automatique d'Apple (logiciel malveillant connu,
  signature, durcissement), pas un audit de sécurité.
