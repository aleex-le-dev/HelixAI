// @ts-check
"use strict";

/**
 * Helix AI pour VS Code.
 *
 * Le Chat de l'instance Helix dans la barre latérale, et deux commandes sur
 * le code sélectionné (expliquer, améliorer). Tout passe par l'instance
 * Helix : ses modèles (locaux d'abord), ses règles, son journal. L'extension
 * ne parle à aucun autre service.
 *
 * Les appels partent de VS Code lui-même (le processus de l'extension), pas
 * de la page du Chat : le jeton d'instance ne passe jamais dans la page.
 *
 * Instance : par défaut celle de l'application Helix de cet ordinateur
 * (http://127.0.0.1:8787, jeton lu dans ~/.helix/data/instance-token).
 * Une instance d'entreprise se règle dans les paramètres (helix.adresse,
 * helix.jeton).
 */

const vscode = require("vscode");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

/** Taille maximale du fichier ouvert joint à une question, en caractères. */
const FICHIER_MAX = 30_000;

function reglages() {
  const c = vscode.workspace.getConfiguration("helix");
  const adresse = String(c.get("adresse") || "http://127.0.0.1:8787").replace(/\/+$/, "");
  let jeton = String(c.get("jeton") || "");
  if (!jeton) {
    try {
      const dossier = process.env.HELIX_DATA_DIR || path.join(os.homedir(), ".helix", "data");
      jeton = fs.readFileSync(path.join(dossier, "instance-token"), "utf8").trim();
    } catch {
      /* pas d'application Helix sur ce poste : il faudra régler le jeton */
    }
  }
  return { adresse, jeton, modele: String(c.get("modele") || "") };
}

/**
 * Pose une question à l'instance, et rend la réponse morceau par morceau.
 * @param {{role: string, content: string}[]} messages
 * @param {(texte: string) => void} surMorceau
 * @param {AbortSignal} signal
 */
async function demander(messages, surMorceau, signal) {
  const { adresse, jeton, modele } = reglages();
  if (!jeton) {
    throw new Error(
      "Aucun jeton d'instance : ouvrez l'application Helix sur cet ordinateur, ou réglez « helix.jeton » dans les paramètres.",
    );
  }
  let res;
  try {
    res = await fetch(`${adresse}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ messages, stream: true, ...(modele ? { model: modele } : {}) }),
      signal,
    });
  } catch {
    throw new Error(`L'instance Helix ne répond pas (${adresse}). Ouvrez l'application Helix, puis réessayez.`);
  }
  if (!res.ok || !res.body) {
    const corps = await res.json().catch(() => ({}));
    throw new Error(corps?.error?.message || `L'instance a refusé la demande (${res.status}).`);
  }
  const lecteur = res.body.getReader();
  const decodeur = new TextDecoder();
  let reste = "";
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    reste += decodeur.decode(value, { stream: true });
    const lignes = reste.split("\n");
    reste = lignes.pop() ?? "";
    for (const ligne of lignes) {
      const l = ligne.trim();
      if (!l.startsWith("data:")) continue;
      const donnee = l.slice(5).trim();
      if (donnee === "[DONE]") return;
      try {
        const evenement = JSON.parse(donnee);
        if (evenement.error) throw new Error(evenement.error.message || "Erreur du modèle.");
        const morceau = evenement.choices?.[0]?.delta?.content;
        if (morceau) surMorceau(morceau);
      } catch (err) {
        if (err instanceof Error && !(err instanceof SyntaxError)) throw err;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Séance (Helix Code)                                                 */
/* ------------------------------------------------------------------ */

/*
 * Le Chat se contente du jeton d'instance. Helix Code, qui modifie des
 * fichiers, exige une séance : la personne se connecte avec son compte Helix,
 * et la séance est gardée dans le coffre de VS Code (SecretStorage), jamais
 * dans les réglages en clair.
 */
const CLE_SEANCE = "helix.seance";

/** @param {vscode.ExtensionContext} contexte */
async function seance(contexte) {
  return (await contexte.secrets.get(CLE_SEANCE)) || "";
}

/**
 * Appel à l'instance avec le jeton, et la séance si on l'a.
 * @param {string} chemin
 * @param {RequestInit & {seance?: string}} options
 */
async function appel(chemin, options = {}) {
  const { adresse, jeton } = reglages();
  const { seance: s, ...reste } = options;
  return fetch(`${adresse}${chemin}`, {
    ...reste,
    headers: {
      "Content-Type": "application/json",
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      ...(s ? { "X-Helix-Session": s } : {}),
      ...(reste.headers || {}),
    },
  });
}

/** @param {vscode.ExtensionContext} contexte */
async function seConnecter(contexte) {
  let comptes = [];
  try {
    const r = await appel("/helix/data/accounts");
    comptes = ((await r.json()).value || []);
  } catch {
    return void vscode.window.showErrorMessage("L'instance Helix ne répond pas : ouvrez l'application Helix, puis réessayez.");
  }
  if (comptes.length === 0) return void vscode.window.showErrorMessage("Aucun compte sur cette instance.");
  const choix = await vscode.window.showQuickPick(
    comptes.map((c) => ({ label: c.fullName || c.email, description: c.email, id: c.id })),
    { title: "Helix : se connecter", placeHolder: "Votre compte" },
  );
  if (!choix) return;
  const motDePasse = await vscode.window.showInputBox({ title: `Mot de passe de ${choix.label}`, password: true, ignoreFocusOut: true });
  if (!motDePasse) return;
  let r = await appel("/helix/auth/verify", { method: "POST", body: JSON.stringify({ accountId: choix.id, password: motDePasse, poste: "VS Code", rester: true }) });
  let corps = await r.json().catch(() => ({}));
  if (!r.ok && corps?.error?.code === "deux-facteurs-requis" && corps.defi) {
    const code = await vscode.window.showInputBox({ title: "Code de vérification", prompt: "Celui de votre application d'authentification, ou un code de secours.", ignoreFocusOut: true });
    if (!code) return;
    r = await appel("/helix/auth/deux-facteurs", { method: "POST", body: JSON.stringify({ defi: corps.defi, code, poste: "VS Code", rester: true }) });
    corps = await r.json().catch(() => ({}));
  }
  const jetonSeance = corps?.session?.token;
  if (!r.ok || !jetonSeance) {
    return void vscode.window.showErrorMessage(corps?.error?.message || "Connexion refusée.");
  }
  await contexte.secrets.store(CLE_SEANCE, jetonSeance);
  vscode.window.showInformationMessage(`Connecté à Helix : ${choix.label}.`);
}

/* ------------------------------------------------------------------ */
/* Helix Code                                                          */
/* ------------------------------------------------------------------ */

/** Nom lisible des outils de l'agent de code. */
const OUTILS = { read: "Lecture", write: "Écriture", edit: "Modification", list: "Liste", glob: "Recherche", grep: "Recherche", bash: "Commande" };

/**
 * Une demande à Helix Code, sur le dossier ouvert dans VS Code. Rend les
 * évènements de l'agent un à un (texte, outil appelé, outil fini), jusqu'à la
 * fin du tour.
 * @param {vscode.ExtensionContext} contexte
 * @param {{session: string | null}} etat
 * @param {string} texte
 * @param {(e: {type: string, texte?: string, outil?: string, ok?: boolean}) => void} surEvenement
 * @param {AbortSignal} signal
 */
async function demanderAuCode(contexte, etat, texte, surEvenement, signal) {
  const s = await seance(contexte);
  if (!s) throw new Error("Helix Code modifie vos fichiers : connectez-vous d'abord (commande « Helix : se connecter »).");
  const dossier = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!dossier) throw new Error("Ouvrez d'abord un dossier dans VS Code : c'est là que Helix Code travaille.");
  if (!etat.session) {
    const r = await appel("/helix/code/session", { method: "POST", seance: s, body: JSON.stringify({ dossier }) });
    const corps = await r.json().catch(() => ({}));
    if (r.status === 401) await contexte.secrets.delete(CLE_SEANCE);
    if (!r.ok) throw new Error(corps?.error?.message || `Session refusée (${r.status}).`);
    etat.session = corps?.data?.id || corps?.id;
  }
  /*
   * Le flux d'abord, la demande ensuite : aucun évènement ne se perd entre les
   * deux. Ce premier flux a son propre arrêt : si la demande est refusée, ou
   * relancée dans une autre session, personne ne l'attend plus. Il restait
   * ouvert (l'instance le garde en vie toutes les vingt secondes) jusqu'à la
   * fermeture de VS Code, un de plus à chaque relance, et son échec tardif
   * devenait un rejet que personne ne traitait.
   */
  const arretPremier = new AbortController();
  const suivreArret = () => arretPremier.abort();
  signal.addEventListener("abort", suivreArret, { once: true });
  const ecouter = async (session, arretFlux = signal) => {
    const r = await appel(`/helix/code/events?sessionID=${encodeURIComponent(session)}`, { seance: s, signal: arretFlux });
    if (!r.ok || !r.body) throw new Error(`Flux de l'agent indisponible (${r.status}).`);
    const lecteur = r.body.getReader();
    const decodeur = new TextDecoder();
    let reste = "";
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) return;
      reste += decodeur.decode(value, { stream: true });
      const blocs = reste.split("\n\n");
      reste = blocs.pop() ?? "";
      for (const bloc of blocs) {
        const donnee = bloc.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (!donnee) continue;
        let ev;
        try {
          ev = JSON.parse(donnee);
        } catch {
          continue;
        }
        const d = ev.data || {};
        if (ev.type === "session.next.text.ended" && d.text) surEvenement({ type: "texte", texte: d.text });
        else if (ev.type === "session.next.tool.called") {
          const cible = d.input?.filePath || d.input?.path || d.input?.command || d.input?.pattern || "";
          surEvenement({ type: "outil", outil: `${OUTILS[d.tool] || d.tool} ${cible}`.trim() });
        } else if (ev.type === "session.next.tool.failed") surEvenement({ type: "outil-fin", ok: false });
        else if (ev.type === "session.next.tool.success") surEvenement({ type: "outil-fin", ok: true });
        else if (ev.type === "session.next.step.failed") throw new Error(d.error?.message || "L'agent de code a interrompu la tâche.");
        else if (ev.type === "session.next.step.ended" && d.finish && d.finish !== "tool-calls" && d.finish !== "tool_calls") return;
      }
    }
  };
  const flux = ecouter(etat.session, arretPremier.signal);
  flux.catch(() => undefined);
  try {
    const r = await appel("/helix/code/prompt", { method: "POST", seance: s, body: JSON.stringify({ sessionID: etat.session, text: texte }) });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corps?.error?.message || `Demande refusée (${r.status}).`);
    if (corps?.helixRelance?.sessionID) {
      // L'instance a dû relancer la demande dans une nouvelle session : on suit celle-là, et on lâche l'autre.
      arretPremier.abort();
      etat.session = corps.helixRelance.sessionID;
      await ecouter(etat.session);
      return;
    }
    await flux;
  } finally {
    signal.removeEventListener("abort", suivreArret);
    arretPremier.abort();
  }
}

/** Le fichier ouvert, pour le joindre à une question. */
function fichierOuvert() {
  const e = vscode.window.activeTextEditor;
  if (!e) return null;
  const nom = vscode.workspace.asRelativePath(e.document.uri);
  const texte = e.document.getText();
  return {
    nom,
    langage: e.document.languageId,
    texte: texte.length > FICHIER_MAX ? `${texte.slice(0, FICHIER_MAX)}\n[… fichier coupé]` : texte,
  };
}

class VueChat {
  /** @param {vscode.ExtensionContext} contexte */
  constructor(contexte) {
    this.contexte = contexte;
    /** @type {vscode.WebviewView | null} */
    this.vue = null;
    /** @type {{role: string, content: string}[]} */
    this.historique = [];
    /** @type {AbortController | null} */
    this.arret = null;
    /** Session Helix Code en cours (une par vue, sur le dossier ouvert). */
    this.code = { session: null };
  }

  /** @param {vscode.WebviewView} vue */
  resolveWebviewView(vue) {
    this.vue = vue;
    vue.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.contexte.extensionUri, "media")] };
    vue.webview.html = this.page(vue.webview);
    vue.webview.onDidReceiveMessage((m) => {
      if (m.type === "question") void this.question(String(m.texte || ""), Boolean(m.joindre));
      if (m.type === "code") void this.demandeCode(String(m.texte || ""));
      if (m.type === "connexion") void vscode.commands.executeCommand("helix.seConnecter");
      if (m.type === "arreter") this.arret?.abort();
      if (m.type === "nouveau") this.nouveau();
      if (m.type === "inserer") void this.inserer(String(m.texte || ""));
    });
  }

  nouveau() {
    this.arret?.abort();
    this.historique = [];
    this.code = { session: null };
    this.vue?.webview.postMessage({ type: "vider" });
  }

  /**
   * @param {string} texte
   * @param {boolean} joindre joindre le fichier ouvert
   */
  async question(texte, joindre) {
    if (!texte.trim() || this.arret) return;
    const fichier = joindre ? fichierOuvert() : null;
    const contenu = fichier
      ? `${texte}\n\nFichier ouvert : ${fichier.nom}\n\`\`\`${fichier.langage}\n${fichier.texte}\n\`\`\``
      : texte;
    this.historique.push({ role: "user", content: contenu });
    this.vue?.webview.postMessage({ type: "question", texte, fichier: fichier?.nom });
    this.arret = new AbortController();
    let reponse = "";
    try {
      await demander(this.historique, (m) => {
        reponse += m;
        this.vue?.webview.postMessage({ type: "morceau", texte: m });
      }, this.arret.signal);
      this.historique.push({ role: "assistant", content: reponse });
      this.vue?.webview.postMessage({ type: "fin" });
    } catch (err) {
      const arrete = this.arret?.signal.aborted;
      this.historique.pop();
      this.vue?.webview.postMessage({ type: "erreur", texte: arrete ? "Arrêté." : err instanceof Error ? err.message : String(err) });
    } finally {
      this.arret = null;
    }
  }

  /** @param {string} texte */
  async demandeCode(texte) {
    if (!texte.trim() || this.arret) return;
    this.vue?.webview.postMessage({ type: "question", texte });
    this.arret = new AbortController();
    try {
      /*
       * `type` en dernier : placé avant, il était remplacé par celui de
       * l'évènement (« texte », « outil », « outil-fin »), et la page, qui
       * n'attend que « code », n'affichait ni les actions ni la réponse de
       * Helix Code, seulement la fin du tour.
       */
      await demanderAuCode(this.contexte, this.code, texte, (e) => this.vue?.webview.postMessage({ ...e, type: "code" }), this.arret.signal);
      this.vue?.webview.postMessage({ type: "fin" });
    } catch (err) {
      const arrete = this.arret?.signal.aborted;
      if (arrete && this.code.session) void appel("/helix/code/interrupt", { method: "POST", seance: await seance(this.contexte), body: JSON.stringify({ sessionID: this.code.session }) });
      this.vue?.webview.postMessage({ type: "erreur", texte: arrete ? "Arrêté." : err instanceof Error ? err.message : String(err) });
    } finally {
      this.arret = null;
    }
  }

  /** Insère un bloc de code de la réponse dans l'éditeur, à la place de la sélection. */
  async inserer(texte) {
    const e = vscode.window.activeTextEditor;
    if (!e) return void vscode.window.showWarningMessage("Ouvrez d'abord le fichier où insérer le code.");
    await e.edit((b) => (e.selection.isEmpty ? b.insert(e.selection.active, texte) : b.replace(e.selection, texte)));
  }

  /** @param {vscode.Webview} webview */
  page(webview) {
    const nonce = crypto.randomBytes(16).toString("base64");
    const src = (f) => webview.asWebviewUri(vscode.Uri.joinPath(this.contexte.extensionUri, "media", f));
    return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${src("chat.css")}">
</head><body>
<nav class="onglets" role="tablist">
  <button type="button" role="tab" id="onglet-chat" aria-selected="true">Chat</button>
  <button type="button" role="tab" id="onglet-code" aria-selected="false">Code</button>
</nav>
<main id="fil" aria-live="polite">
  <p class="accueil">Chat : posez une question à Helix. Code : Helix Code lit, écrit et modifie les fichiers du dossier ouvert.</p>
</main>
<form id="formulaire">
  <textarea id="saisie" rows="3" placeholder="Demandez à Helix…"></textarea>
  <div class="barre">
    <label><input type="checkbox" id="joindre" checked> Joindre le fichier ouvert</label>
    <span class="espace"></span>
    <button type="button" id="nouveau" class="discret" title="Nouveau Chat">Nouveau</button>
    <button type="submit" id="envoyer">Envoyer</button>
  </div>
</form>
<script nonce="${nonce}" src="${src("chat.js")}"></script>
</body></html>`;
  }
}

/** @param {vscode.ExtensionContext} contexte */
function activate(contexte) {
  const vue = new VueChat(contexte);
  contexte.subscriptions.push(vscode.window.registerWebviewViewProvider("helix.chat", vue, { webviewOptions: { retainContextWhenHidden: true } }));

  /** @param {string} consigne */
  const surSelection = async (consigne) => {
    const e = vscode.window.activeTextEditor;
    const selection = e?.document.getText(e.selection) ?? "";
    if (!selection.trim()) return void vscode.window.showInformationMessage("Sélectionnez d'abord du code.");
    await vscode.commands.executeCommand("helix.chat.focus");
    const langage = e?.document.languageId ?? "";
    void vue.question(`${consigne}\n\n\`\`\`${langage}\n${selection}\n\`\`\``, false);
  };

  contexte.subscriptions.push(
    vscode.commands.registerCommand("helix.expliquer", () => surSelection("Explique ce code, simplement et précisément :")),
    vscode.commands.registerCommand("helix.ameliorer", () =>
      surSelection("Améliore ce code (clarté, bugs, performances). Donne la version corrigée dans un seul bloc de code, puis ce que tu as changé :"),
    ),
    vscode.commands.registerCommand("helix.nouveau", () => vue.nouveau()),
    vscode.commands.registerCommand("helix.seConnecter", () => seConnecter(contexte)),
    vscode.commands.registerCommand("helix.seDeconnecter", async () => {
      await contexte.secrets.delete(CLE_SEANCE);
      vscode.window.showInformationMessage("Déconnecté de Helix.");
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
