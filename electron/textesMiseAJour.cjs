/**
 * Les messages de la mise à jour (miseAJour.cjs), dans la langue de l'écran.
 *
 * Ils étaient en français seulement : un poste en anglais ou en chinois lisait
 * « Vérification de la signature de l'éditeur… » ou une erreur en français
 * (27/09/2026). Le processus principal n'a pas le catalogue de l'interface :
 * une table, comme zoneNotification.cjs. La langue vient de l'interface
 * (`helix:langue`, main.cjs).
 */

const TEXTES = {
  fr: {
    githubVide: "Aucune publication trouvée sur GitHub (dépôt privé, ou rien de publié).",
    serveurMuet: "Le serveur de mises à jour ne répond pas. Nouvel essai plus tard.",
    rienA: "Aucune publication trouvée à l'adresse de mise à jour.",
    signatureApple: "La mise à jour n'a pas été installée : sa signature ne correspond pas à celle de l'application.",
    verificationImpossible: "Vérification impossible : {0}",
    developpement: "Pas de mise à jour en développement.",
    adresseRefusee: "Adresse de mise à jour refusée, faute de HTTPS : {0}",
    installationImpossible: "Installation impossible : {0}",
    verificationSignature: "Vérification de la signature de l'éditeur…",
    fermetureRelance: "Installation : l'application va se fermer et se rouvrir.",
    sansArchive: "l'annonce ne décrit pas d'archive vérifiable",
    sourceRepond: "la source a répondu {0}",
    empreinte: "l'empreinte de l'archive ne correspond pas à l'annonce",
    pasDApplication: "l'archive ne contient pas d'application",
    autreApplication: "l'archive contient une autre application",
    autreVersion: "la version de l'archive n'est pas celle annoncée",
    sansCle: "cette application n'a pas de clé d'éditeur : une mise à jour ne peut pas y être vérifiée. Installez-la à la main, depuis le paquet de votre prestataire",
    refusee: "la mise à jour a été refusée : {0}",
    sansInstallateur: "l'annonce ne décrit pas d'installateur vérifiable",
    tailleInstallateur: "l'installateur reçu n'a pas la taille annoncée",
    empreinteInstallateur: "l'empreinte de l'installateur ne correspond pas à l'annonce",
    tailleArchive: "l'archive reçue n'a pas la taille annoncée",
    droitsArchive: "les droits des fichiers de l'archive n'ont pas pu être remis d'aplomb",
  },
  en: {
    githubVide: "No release found on GitHub (private repository, or nothing published).",
    serveurMuet: "The update server does not answer. It will try again later.",
    rienA: "No release found at the update address.",
    signatureApple: "The update was not installed: its signature does not match the app's.",
    verificationImpossible: "Could not check for updates: {0}",
    developpement: "No updates in development.",
    adresseRefusee: "Update address refused, it does not use HTTPS: {0}",
    installationImpossible: "Could not install: {0}",
    verificationSignature: "Checking the publisher's signature…",
    fermetureRelance: "Installing: the app will close and reopen.",
    sansArchive: "the announcement describes no verifiable archive",
    sourceRepond: "the source answered {0}",
    empreinte: "the archive's checksum does not match the announcement",
    pasDApplication: "the archive contains no application",
    autreApplication: "the archive contains a different application",
    autreVersion: "the archive's version is not the announced one",
    sansCle: "this app has no publisher key, so an update cannot be verified here. Install it by hand, from your provider's package",
    refusee: "the update was refused: {0}",
    sansInstallateur: "the announcement describes no verifiable installer",
    tailleInstallateur: "the installer received does not have the announced size",
    empreinteInstallateur: "the installer's checksum does not match the announcement",
    tailleArchive: "the archive received does not have the announced size",
    droitsArchive: "the permissions of the archive's files could not be reset",
  },
  zh: {
    githubVide: "在 GitHub 上未找到任何发布（私有仓库，或尚未发布）。",
    serveurMuet: "更新服务器没有响应，稍后将重试。",
    rienA: "在更新地址未找到任何发布。",
    signatureApple: "更新未安装：其签名与应用的签名不一致。",
    verificationImpossible: "无法检查更新：{0}",
    developpement: "开发模式下不提供更新。",
    adresseRefusee: "更新地址未使用 HTTPS，已拒绝：{0}",
    installationImpossible: "无法安装：{0}",
    verificationSignature: "正在验证发行方签名…",
    fermetureRelance: "正在安装：应用将关闭并重新打开。",
    sansArchive: "该通知未描述可验证的压缩包",
    sourceRepond: "来源返回 {0}",
    empreinte: "压缩包的校验值与通知不一致",
    pasDApplication: "压缩包中没有应用",
    autreApplication: "压缩包中是另一个应用",
    autreVersion: "压缩包的版本不是通知中的版本",
    sansCle: "此应用没有发行方密钥，无法在此验证更新。请使用服务商提供的安装包手动安装",
    refusee: "更新被拒绝：{0}",
    sansInstallateur: "该通知未描述可验证的安装程序",
    tailleInstallateur: "收到的安装程序大小与通知不一致",
    empreinteInstallateur: "安装程序的校验值与通知不一致",
    tailleArchive: "收到的压缩包大小与通知不一致",
    droitsArchive: "无法重置压缩包中文件的权限",
  },
};

/** Les raisons de signatureEditeur.cjs (écrites en français), traduites à l'affichage. */
const RAISONS = {
  "elle ne porte pas de signature de l'éditeur": { en: "it carries no publisher signature", zh: "它没有发行方签名" },
  "sa signature est d'un format inconnu": { en: "its signature has an unknown format", zh: "其签名格式未知" },
  "sa signature porte sur une autre application ou une autre version": { en: "its signature is for another app or another version", zh: "其签名针对的是其他应用或其他版本" },
  "la clé de l'application installée est illisible": { en: "the installed app's key cannot be read", zh: "无法读取已安装应用的密钥" },
  "son contenu a changé depuis sa signature": { en: "its content changed after it was signed", zh: "其内容在签名后已被更改" },
  "elle n'est pas signée par l'éditeur de cette application": { en: "it is not signed by this app's publisher", zh: "它不是由此应用的发行方签名的" },
  "elle n'est pas un dossier d'application": { en: "it is not an application folder", zh: "它不是应用文件夹" },
  "d'autres comptes de ce poste pourraient modifier ses fichiers": { en: "other accounts on this computer could modify its files", zh: "此电脑上的其他账户可能修改其文件" },
  "les droits macOS d'un de ses programmes sont illisibles": { en: "the macOS entitlements of one of its programs cannot be read", zh: "无法读取其中某个程序的 macOS 权限" },
  "un de ses programmes n'est plus protégé contre l'injection de code": { en: "one of its programs is no longer protected against code injection", zh: "其中某个程序不再受到代码注入防护" },
  "elle demande à macOS des droits que l'application installée n'a pas": { en: "it asks macOS for entitlements the installed app does not have", zh: "它向 macOS 请求了已安装应用所没有的权限" },
};

let langue = "en";

function changerLangue(code) {
  if (TEXTES[code]) langue = code;
}

/** Le texte `cle`, les `{0}`, `{1}`… remplacés par les valeurs. */
function tx(cle, ...valeurs) {
  const modele = (TEXTES[langue] && TEXTES[langue][cle]) || TEXTES.fr[cle] || cle;
  return modele.replace(/\{(\d+)\}/g, (_t, i) => String(valeurs[Number(i)] ?? ""));
}

/** Une raison de signatureEditeur.cjs dans la langue de l'écran. */
function raison(texte) {
  if (langue === "fr") return texte;
  return (RAISONS[texte] && RAISONS[texte][langue]) || texte;
}

module.exports = { changerLangue, tx, raison };
