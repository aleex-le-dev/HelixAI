/*
 * Le faux modèle des captures (scripts/captures/capturer.mjs, 28/09/2026).
 *
 * Un serveur compatible OpenAI sur 127.0.0.1, qui tient deux rôles :
 *
 *  - le « LM Studio » de la scène (`/v1/…`) : un modèle de conversation
 *    (qwen/qwen3.5-9b) et un modèle d'embeddings (nomic v1.5), sous leurs
 *    noms habituels ;
 *  - le « Mistral AI » de la scène (`/mistral/v1/…`) : la passerelle d'essai
 *    y est renvoyée par son module préalable (prealable.mjs) quand elle croit
 *    parler à api.mistral.ai. Aucune requête ne sort de la machine.
 *
 * Les réponses sont celles de la scène (scenes/<langue>.mjs) : une réponse
 * est choisie par un mot de la dernière question (`declencheur`), puis
 * rendue en flux, réflexion d'abord, au rythme voulu pour l'animation. Les
 * renvois aux passages (`{{doc:politique}}`) sont remplacés par le numéro
 * que la passerelle a donné au document dans ses instructions : la réponse
 * cite toujours les bons passages, quel que soit l'ordre de la recherche.
 *
 * Les embeddings ne sont pas ceux d'un vrai modèle : un vecteur par thème de
 * la scène (`themes`, des mots-clés), assez pour que la question de la
 * démonstration retrouve la politique d'achat et la liste des fournisseurs,
 * et rien d'autre.
 */
import http from "node:http";

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Vecteur d'un texte : une composante par thème (nombre de ses mots-clés présents), plus un fond commun. */
export function vecteurScene(scene, texte) {
  const bas = String(texte).toLowerCase();
  const v = scene.themes.map((mots) => mots.reduce((n, m) => n + (bas.includes(m.toLowerCase()) ? 1 : 0), 0));
  v.push(0.02);
  const norme = Math.hypot(...v) || 1;
  return v.map((x) => x / norme);
}

/** Les numéros des passages, lus dans les instructions : « [2] Document : liste-fournisseurs.md (base « … ») ». */
function numerosDesDocuments(messages) {
  const systeme = messages.filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  const numeros = new Map();
  for (const m of systeme.matchAll(/^\[(\d+)\] Document : (.+?) \(base /gm)) if (!numeros.has(m[2])) numeros.set(m[2], m[1]);
  return numeros;
}

function texteDe(m) {
  if (typeof m?.content === "string") return m.content;
  if (Array.isArray(m?.content)) return m.content.map((p) => (p.type === "text" ? p.text : "")).join("\n");
  return "";
}

/** Coupe un texte en morceaux de deux ou trois caractères (japonais, chinois) ou d'un mot (le reste). */
function morceaux(texte) {
  const sortie = [];
  const cjk = /[　-鿿＀-￯]/;
  let i = 0;
  while (i < texte.length) {
    // Un passage en gras part d'un seul morceau : l'écran n'affiche jamais « ** » le temps que le gras se referme.
    const gras = /^\*\*[^*]+\*\*/.exec(texte.slice(i));
    if (gras) {
      sortie.push(gras[0]);
      i += gras[0].length;
    } else if (cjk.test(texte[i])) {
      sortie.push(texte.slice(i, i + 2));
      i += 2;
    } else {
      // Un mot latin s'arrête aussi au premier caractère japonais ou chinois (pas d'espace entre eux).
      const m = /^\s*[^\s　-鿿＀-￯]+\s*/.exec(texte.slice(i)) ?? /^\s+/.exec(texte.slice(i));
      const n = m ? m[0].length : 1;
      sortie.push(texte.slice(i, i + n));
      i += n;
    }
  }
  return sortie;
}

export function demarrerFauxModele(scene, port) {
  const recues = [];
  const serveur = http.createServer((req, res) => {
    let corps = "";
    req.on("data", (b) => (corps += b));
    req.on("end", async () => {
      const mistral = req.url.startsWith("/mistral/");
      const chemin = req.url.replace(/^\/mistral/, "").split("?")[0];
      const json = (v, statut = 200) => {
        res.writeHead(statut, { "Content-Type": "application/json" });
        res.end(JSON.stringify(v));
      };
      if (chemin === "/v1/models") {
        if (mistral) {
          return json({
            object: "list",
            data: scene.modelesMistral.map((id) => ({
              id,
              object: "model",
              owned_by: "mistralai",
              capabilities: { completion_chat: true, function_calling: true, vision: false },
              max_context_length: 131072,
            })),
          });
        }
        return json({ object: "list", data: [{ id: scene.modeleChat, object: "model" }, { id: scene.modeleEmbed, object: "model" }] });
      }
      if (chemin === "/v1/embeddings") {
        const entree = JSON.parse(corps || "{}").input ?? [];
        const liste = Array.isArray(entree) ? entree : [entree];
        return json({ object: "list", model: scene.modeleEmbed, data: liste.map((t, index) => ({ object: "embedding", index, embedding: vecteurScene(scene, t) })), usage: { prompt_tokens: 8, total_tokens: 8 } });
      }
      if (chemin !== "/v1/chat/completions") return json({ error: { message: "inconnu" } }, 404);

      const demande = JSON.parse(corps || "{}");
      const messages = demande.messages ?? [];
      const derniere = texteDe([...messages].reverse().find((m) => m.role === "user"));
      recues.push({ modele: demande.model, question: derniere.slice(0, 200), flux: demande.stream !== false });
      const reponse =
        scene.reponses.find((r) => r.declencheur && derniere.includes(r.declencheur)) ?? scene.reponses.find((r) => !r.declencheur);
      const numeros = numerosDesDocuments(messages);
      const texte = reponse.texte.replace(/\{\{doc:([^}]+)\}\}/g, (_, nom) => `[${numeros.get(nom) ?? "1"}]`);
      const reflexion = reponse.reflexion ?? "";
      const entree = Math.round(JSON.stringify(messages).length / 3.2);
      const sortie = Math.round((texte.length + reflexion.length) / 1.6);
      const usage = { prompt_tokens: entree, completion_tokens: sortie, total_tokens: entree + sortie };

      // Sans flux : l'essai du modèle à la mise en route, un titre, un résumé.
      if (demande.stream === false || demande.stream === undefined) {
        return json({ id: "scene", object: "chat.completion", created: Math.floor(Date.now() / 1000), model: demande.model, choices: [{ index: 0, message: { role: "assistant", content: scene.reponseCourte }, finish_reason: "stop" }], usage });
      }
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      const envoyer = (delta, fin) =>
        res.write(`data: ${JSON.stringify({ id: "scene", object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: demande.model, choices: [{ index: 0, delta, ...(fin ? { finish_reason: fin } : {}) }] })}\n\n`);
      const rythme = reponse.rythmeMs ?? 40;
      await attendre(reponse.avantPremierMotMs ?? 400);
      if (reflexion) {
        envoyer({ role: "assistant", reasoning_content: "" });
        for (const m of morceaux(reflexion)) {
          if (res.destroyed) return;
          envoyer({ reasoning_content: m });
          await attendre(8);
        }
      }
      for (const m of morceaux(texte)) {
        if (res.destroyed) return;
        envoyer({ content: m });
        await attendre(rythme);
      }
      envoyer({}, "stop");
      res.write(`data: ${JSON.stringify({ id: "scene", object: "chat.completion.chunk", choices: [], usage })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
  });
  return new Promise((ok) => serveur.listen(port, "127.0.0.1", () => ok({ serveur, recues })));
}
