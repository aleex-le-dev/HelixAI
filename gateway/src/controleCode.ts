import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { applicationPreparee, problemesMetier } from "./application.ts";
import { controler } from "./controleWeb.ts";
import { estProtege } from "./zonesProtegees.ts";
import { t, tf } from "./langue.ts";

/**
 * Contrôle automatique de ce que Helix Code vient d'écrire, et relance de
 * l'agent tant que ce n'est pas propre.
 *
 * Demandé par Medhi le 26/09/2026 : « le petit modèle doit produire un bon
 * niveau de logiciel, même si c'est long, sinon personne n'utilisera Helix
 * Code ». Essai du même jour, ERP pour cabinet d'avocat avec Qwen3 8B :
 * l'agent annonçait une application « fonctionnelle » ; son script ne
 * compilait pas (`document,getElementById`), puis, corrigée, elle s'ouvrait
 * sur une page blanche, onglets blanc sur gris, listes figées. L'agent ne
 * s'en rendait compte que si on le lui disait. Désormais Helix le lui dit
 * lui-même, à la fin de chaque tour :
 *  1. contrôle statique des fichiers web modifiés pendant le tour
 *     (controleWeb.ts : syntaxe, fichiers liés, fonctions appelées, éléments
 *     cherchés) ;
 *  2. essai réel des pages modifiées dans le navigateur de l'application
 *     (electron/rendu.cjs : erreurs, page vide, texte illisible, boutons et
 *     formulaires essayés), quand l'application le prête ;
 *  3. s'il reste des problèmes, une demande de correction part à l'agent dans
 *     la même session, avec la liste exacte, jusqu'à `TOURS_MAX` fois ; le
 *     panneau de suivi dit où on en est.
 * Un programme vérifie, pas le modèle : il ne se contente pas de « c'est fait ».
 */

/** Le début de chaque relance : sessionsCode.ts s'en sert pour ne pas l'afficher comme un message de la personne. */
export const ENTETE_RELANCE = "[Contrôle automatique de Helix] Le travail n'est pas terminé : un programme a vérifié les fichiers et essayé les pages dans un vrai navigateur, et a trouvé ces problèmes :";

/*
 * La méthode jointe à chaque demande de code (index.ts), quel que soit le
 * modèle. Tirée des essais du 26/09/2026 avec Qwen3 8B : ses « edit » échouaient
 * faute de recopier exactement le texte à remplacer (trois fois de suite sur un
 * fichier de 30 lignes), puis il annonçait le travail fait. Réécrire en entier
 * un fichier court a marché du premier coup. Le marqueur du début sert à
 * retirer ce texte de l'historique affiché (sessionsCode.ts).
 */
export const METHODE_CODE = [
  "",
  "",
  "---",
  "Méthode de travail (Helix), pour un travail juste du premier coup :",
  "- Avant de modifier un fichier, lis-le. Un fichier de moins de 300 lignes : réécris-le EN ENTIER avec write, plutôt qu'avec edit. Un fichier plus long : edit, en recopiant exactement le texte à remplacer, lu juste avant.",
  "- Un morceau à la fois : un fichier complet et juste, puis le suivant. Relis chaque fichier écrit.",
  "- N'utilise que des fonctions, des champs et des fichiers qui existent vraiment : vérifie-les dans le code avant de t'en servir.",
  "- Ne dis « fait », « corrigé » ou « testé » que pour ce que tu as vraiment fait. Un programme contrôlera ton travail après toi et te renverra ce qui ne va pas.",
].join("\n");

/** Relances automatiques par demande de la personne : au-delà, on s'arrête et on dit ce qui reste. */
export const TOURS_MAX = 5;
const FICHIERS_MAX = 2000;
const PAGES_ESSAYEES_MAX = 3;
const WEB = new Set([".html", ".htm", ".css", ".js", ".mjs"]);

interface Suivi {
  /** Début de la demande de la personne (ms) : les fichiers modifiés depuis sont ceux du travail. */
  debut: number;
  /** Relances automatiques déjà faites pour cette demande. */
  tours: number;
  /** Une relance automatique vient de partir : sa fin de tour ne remet pas le compteur à zéro. */
  enRelance: boolean;
  /** La personne a arrêté : pas de contrôle ni de relance jusqu'à sa prochaine demande. */
  arrete?: boolean;
}
const suivis = new Map<string, Suivi>();

/** Une demande de la personne (pas une relance de Helix) : nouveau travail, compteur à zéro. */
export function nouvelleDemandeCode(sessionID: string): void {
  const s = suivis.get(sessionID);
  if (s?.enRelance) {
    s.enRelance = false;
    return;
  }
  suivis.set(sessionID, { debut: Date.now() - 2000, tours: 0, enRelance: false });
}

/** « Arrêter » : plus aucune relance automatique pour cette demande (la personne a repris la main). */
export function arretDemandeCode(sessionID: string): void {
  const s = suivis.get(sessionID);
  if (s) {
    s.tours = TOURS_MAX;
    s.enRelance = false;
    s.arrete = true;
  }
}

/** La personne a-t-elle arrêté la demande en cours (pendant la préparation d'une application, par exemple) ? */
export function demandeArretee(sessionID: string): boolean {
  return suivis.get(sessionID)?.arrete === true;
}

/** Fichiers web du dossier modifiés depuis `depuis`, sans node_modules ni fichiers cachés. */
function modifiesDepuis(dossier: string, depuis: number, extensions: Set<string> = WEB): string[] {
  const trouves: string[] = [];
  const pile = [dossier];
  let vus = 0;
  while (pile.length > 0 && vus < FICHIERS_MAX) {
    const courant = pile.pop()!;
    let noms: string[] = [];
    try {
      noms = readdirSync(courant);
    } catch {
      continue;
    }
    for (const nom of noms) {
      if (nom.startsWith(".") || nom === "node_modules" || nom === "dist" || nom === "build") continue;
      const chemin = join(courant, nom);
      vus++;
      let st;
      try {
        st = statSync(chemin);
      } catch {
        continue;
      }
      if (st.isDirectory()) pile.push(chemin);
      else if (extensions.has(extname(nom).toLowerCase()) && st.mtimeMs >= depuis && !estProtege(chemin)) trouves.push(chemin);
    }
  }
  return trouves;
}

/*
 * Au-delà du web : Python et JSON, ajoutés le 26/09/2026 (« tout doit être
 * optimisé pour qu'un petit modèle soit vraiment utile en code »). Sans rien
 * exécuter de ce que l'agent a écrit : Python est seulement analysé (`ast.parse`
 * lit le texte, n'importe ni ne lance rien), JSON seulement relu.
 */
const AUTRES = new Set([".py", ".json"]);
/** Fichiers de réglages qui admettent des commentaires : ce n'est pas du JSON strict. */
const JSON_TOLERANT = /^(tsconfig|jsconfig)[\w.-]*\.json$|^\.?(eslintrc|babelrc)|settings\.json$|launch\.json$|extensions\.json$/i;
const ANALYSE_PYTHON = [
  "import ast, json, sys",
  "sortie = []",
  "for f in sys.argv[1:]:",
  "    try:",
  "        ast.parse(open(f, encoding='utf-8').read(), f)",
  "    except SyntaxError as e:",
  "        sortie.append({'f': f, 'l': e.lineno or 0, 'm': e.msg or 'syntaxe'})",
  "    except Exception as e:",
  "        sortie.append({'f': f, 'l': 0, 'm': str(e)[:200]})",
  "print(json.dumps(sortie))",
].join("\n");

async function problemesAutres(dossier: string, depuis: number): Promise<{ problemes: string[]; fichiers: number }> {
  const touches = modifiesDepuis(dossier, depuis, AUTRES).slice(0, 60);
  const problemes: string[] = [];
  const rel = (f: string) => relative(dossier, f) || f;
  for (const f of touches.filter((x) => x.endsWith(".json") && !JSON_TOLERANT.test(basename(x)))) {
    try {
      const st = statSync(f);
      if (st.size > 2_000_000) continue;
      JSON.parse(readFileSync(f, "utf8"));
    } catch (err) {
      problemes.push(`${rel(f)} : JSON invalide (${(err instanceof Error ? err.message : String(err)).slice(0, 160)}).`);
    }
  }
  const python = touches.filter((x) => x.endsWith(".py"));
  if (python.length > 0) {
    const r = await new Promise<string>((resolve) => {
      execFile("python3", ["-I", "-c", ANALYSE_PYTHON, ...python], { timeout: 20_000, maxBuffer: 1_000_000 }, (err, stdout) => resolve(err ? "" : stdout));
    });
    try {
      for (const e of JSON.parse(r || "[]") as { f: string; l: number; m: string }[]) {
        problemes.push(`${rel(e.f)}${e.l ? `, ligne ${e.l}` : ""} : erreur de syntaxe Python (${e.m}).`);
      }
    } catch {
      // Python absent ou réponse illisible : rien n'est affirmé.
    }
  }
  return { problemes, fichiers: touches.length };
}

interface RapportRendu {
  ok?: boolean;
  console?: string[];
  ressources?: string[];
  texteAuChargement?: number;
  illisibles?: { texte: string; balise: string; contraste: number }[];
  essais?: { quoi: string; probleme: string }[];
  erreurs?: string[];
}

/** Essaie une page dans le navigateur de l'application ; `null` si l'application ne le prête pas (passerelle seule). */
async function essayerPage(fichier: string): Promise<RapportRendu | null> {
  const url = process.env.HELIX_RENDU_URL;
  const cle = process.env.HELIX_RENDU_CLE;
  if (!url || !cle) return null;
  try {
    const r = await fetch(`${url}/rendre`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Helix-Cle": cle },
      body: JSON.stringify({ fichier }),
      signal: AbortSignal.timeout(40_000),
    });
    return r.ok ? ((await r.json()) as RapportRendu) : null;
  } catch {
    return null;
  }
}

/** Les problèmes d'une page essayée, en phrases pour l'agent. */
function problemesDuRendu(page: string, r: RapportRendu): string[] {
  const p: string[] = [];
  for (const m of [...(r.console ?? []), ...(r.erreurs ?? [])]) p.push(tf("{0} : erreur à l'exécution : {1}", page, m));
  for (const m of r.ressources ?? []) p.push(tf("{0} : fichier ou ressource introuvable : {1}", page, m));
  if ((r.texteAuChargement ?? 1) < 30) {
    p.push(tf("{0} : la page s'ouvre (presque) vide ; le premier écran doit montrer quelque chose d'utile sans avoir à cliquer (une section active par défaut, par exemple).", page));
  }
  for (const i of r.illisibles ?? []) {
    p.push(tf("{0} : texte illisible « {1} » ({2}) : contraste {3} sur son fond, il faut au moins 4,5.", page, i.texte, i.balise, String(i.contraste)));
  }
  // Un bouton qui échoue sur une erreur déjà dite n'ajoute rien : on ne répète pas la même cause.
  const dites = new Set([...(r.console ?? []), ...(r.erreurs ?? [])]);
  for (const e of r.essais ?? []) {
    if (dites.has(e.probleme)) continue;
    dites.add(e.probleme);
    p.push(tf("{0} : {1} : {2}", page, e.quoi, e.probleme));
  }
  return p;
}

/** Les fonctions réellement définies dans les scripts d'un dossier : ce que l'agent peut appeler. */
function fonctionsDefinies(dossier: string): string[] {
  const noms = new Set<string>();
  for (const f of modifiesDepuis(dossier, 0).filter((x) => /\.m?js$/i.test(x)).slice(0, 20)) {
    let code = "";
    try {
      code = readFileSync(f, "utf8").slice(0, 400_000);
    } catch {
      continue;
    }
    for (const m of code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)) {
      noms.add(m[1] ?? m[2]!);
    }
  }
  return [...noms].slice(0, 60);
}

/*
 * L'ordre compte pour un petit modèle : il corrige d'abord ce qu'il lit en
 * premier. Les erreurs qui cassent tout (syntaxe, exécution, fonction absente)
 * passent devant la lisibilité et les formulaires.
 */
const gravite = (p: string) =>
  /syntaxe|compile|SyntaxError|JSON invalide/i.test(p) ? 0 : /erreur à l'exécution|n'est définie|introuvable|absent/i.test(p) ? 1 : /vide/i.test(p) ? 2 : 3;

/** Contrôle ce que le tour a modifié. Rend les problèmes (vides si tout va bien) et ce qui a été vérifié. */
export async function controlerTourCode(
  sessionID: string,
  dossier: string,
): Promise<{ problemes: string[]; fichiers: number; pagesEssayees: number; essaiReel: boolean; dossiers?: string[] }> {
  const suivi = suivis.get(sessionID);
  const depuis = suivi?.debut ?? Date.now() - 10 * 60_000;
  const autres = await problemesAutres(dossier, depuis);
  const touches = modifiesDepuis(dossier, depuis);
  if (touches.length === 0) return { problemes: autres.problemes, fichiers: autres.fichiers, pagesEssayees: 0, essaiReel: false, dossiers: [] };
  const dossiers = [...new Set(touches.map((f) => dirname(f)))];
  const retenus = dossiers.filter((d) => !dossiers.some((p) => p !== d && d.startsWith(p + sep)));
  const problemes: string[] = [...autres.problemes];
  let fichiers = autres.fichiers;
  for (const d of retenus) {
    const r = controler(d, { racine: dossier });
    fichiers += r.fichiers;
    for (const x of r.problemes) if (!problemes.includes(x)) problemes.push(x);
  }
  // Une application préparée par Helix (application.ts) : ses règles du métier, vérifiées sur le plan.
  if (applicationPreparee(dossier)) {
    let prepareeCeTour = false;
    try {
      prepareeCeTour = statSync(join(dossier, "app", "plan.js")).mtimeMs >= depuis;
    } catch {}
    for (const x of problemesMetier(dossier, prepareeCeTour)) if (!problemes.includes(x)) problemes.push(x);
  }
  const pages = touches.filter((f) => /\.html?$/i.test(f));
  // Une page non touchée mais dont le script ou la feuille l'a été : on essaie l'index de son dossier.
  for (const d of retenus) {
    const index = join(d, "index.html");
    if (!pages.includes(index) && modifiesDepuis(d, 0).includes(index)) pages.push(index);
  }
  let pagesEssayees = 0;
  let essaiReel = false;
  // Pas d'essai réel d'une page dont le script ne compile pas : l'erreur est déjà dite.
  if (!problemes.some((x) => /syntaxe|compile|SyntaxError/i.test(x))) {
    for (const page of pages.slice(0, PAGES_ESSAYEES_MAX)) {
      const r = await essayerPage(page);
      if (!r) break;
      essaiReel = true;
      pagesEssayees++;
      for (const x of problemesDuRendu(relative(dossier, page) || page, r)) if (!problemes.includes(x)) problemes.push(x);
    }
  }
  problemes.sort((a, b) => gravite(a) - gravite(b));
  return { problemes: problemes.slice(0, 30), fichiers, pagesEssayees, essaiReel, dossiers: retenus };
}

/**
 * Fin d'un tour : contrôle, puis relance si besoin. `relancer` envoie un texte
 * à la session (index.ts, même modèle et même dossier) ; `statut` écrit dans
 * le panneau de suivi.
 */
export async function apresTourCode(
  sessionID: string,
  dossier: string,
  relancer: (texte: string) => Promise<boolean>,
  statut: (message: string) => void,
): Promise<void> {
  let suivi = suivis.get(sessionID);
  if (suivi?.arrete) return;
  if (!suivi) {
    suivi = { debut: Date.now() - 10 * 60_000, tours: 0, enRelance: false };
    suivis.set(sessionID, suivi);
  }
  statut(t("Contrôle automatique du code écrit..."));
  const r = await controlerTourCode(sessionID, dossier);
  if (r.fichiers === 0) return statut("");
  if (r.problemes.length === 0) {
    statut(
      r.essaiReel
        ? tf("Contrôle automatique : {0} fichier(s) vérifié(s) et {1} page(s) essayée(s), aucun problème trouvé.", r.fichiers, r.pagesEssayees)
        : (r.dossiers?.length ?? 0) === 0
          ? tf("Contrôle automatique : {0} fichier(s) vérifié(s), aucun problème trouvé.", r.fichiers)
          : tf("Contrôle automatique : {0} fichier(s) vérifié(s), aucun problème trouvé (pages non essayées : navigateur de l'application indisponible).", r.fichiers),
    );
    console.log(`[code] contrôle automatique : propre (${r.fichiers} fichiers, ${r.pagesEssayees} pages essayées).`);
    return;
  }
  if (suivi.tours >= TOURS_MAX) {
    // La liste elle-même : la personne voit ce qui reste, au lieu d'un « terminé » trompeur.
    statut([tf("Contrôle automatique : {0} problème(s) restent après {1} corrections :", r.problemes.length, TOURS_MAX), ...r.problemes.slice(0, 10).map((x) => `- ${x}`)].join("\n"));
    console.log(`[code] contrôle automatique : ${r.problemes.length} problème(s) restent après ${TOURS_MAX} tours.`);
    return;
  }
  suivi.tours++;
  suivi.enRelance = true;
  statut(tf("Contrôle automatique : {0} problème(s) trouvé(s), l'agent les corrige (correction {1} sur {2}).", r.problemes.length, suivi.tours, TOURS_MAX));
  console.log(`[code] contrôle automatique : ${r.problemes.length} problème(s), relance ${suivi.tours}/${TOURS_MAX}.`);
  // Une fonction appelée qui n'existe pas : on lui dit celles qui existent, pour qu'il appelle la bonne ou écrive la manquante.
  const definies = r.problemes.some((x) => /n'est définie/.test(x)) ? [...new Set((r.dossiers ?? []).flatMap(fonctionsDefinies))] : [];
  const texte = [
    // Le texte en toutes lettres : le relevé des traductions (scripts/i18n-passerelle.mjs) ne lit que les chaînes écrites dans t().
    t("[Contrôle automatique de Helix] Le travail n'est pas terminé : un programme a vérifié les fichiers et essayé les pages dans un vrai navigateur, et a trouvé ces problèmes :"),
    ...r.problemes.map((x) => `- ${x}`),
    ...(definies.length > 0 ? ["", tf("Fonctions qui existent vraiment dans les scripts : {0}. Écris celles qui manquent, ou appelle celles-ci.", definies.join(", "))] : []),
    "",
    t("Un fichier de moins de 300 lignes : réécris-le en entier avec write, plutôt qu'avec edit (un edit échoue si le texte à remplacer n'est pas recopié à l'identique)."),
    t("Corrige-les tous, dans les fichiers concernés. Relis chaque fichier modifié en entier avant de dire que c'est fini. Ne réponds pas « c'est fait » sans avoir corrigé : le contrôle repassera après toi."),
  ].join("\n");
  const ok = await relancer(texte);
  if (!ok) {
    suivi.enRelance = false;
    statut(t("Contrôle automatique : la demande de correction n'a pas pu partir."));
  }
}
