import { tf } from "./langue.ts";
/**
 * Découpage d'une demande en étapes courtes.
 *
 * Un petit modèle ne tient pas un plan de douze actions dans sa tête. Mesuré
 * sur qwen3-8b avec « range ces quatre factures dans des dossiers par client » :
 * une fois il s'est arrêté à mi-chemin sans un mot, une fois il a listé le
 * dossier puis expliqué ce qu'il *faudrait* faire au lieu de le faire. Élargir
 * le budget d'outils n'y change rien — ce n'est pas la place qui manque, c'est
 * le fil qui se perd.
 *
 * D'où ce découpage : on demande d'abord un plan, puis on exécute **une étape à
 * la fois**, chacune avec sa propre petite boucle d'outils et un contexte
 * réduit à ce qu'elle exige. L'avancement est tenu ici, pas par le modèle : à
 * chaque étape il ne voit qu'un objectif simple et le résultat des précédentes.
 *
 * C'est plus long qu'un seul passage, et c'est le but : un travail lourd finit
 * par aboutir sur une machine modeste, au lieu d'échouer vite.
 */

/*
 * Bornes. Le découpage peut se répéter (une étape trop grosse est redécoupée),
 * mais pas sans fin : un modèle qui découperait toujours plus finement
 * tournerait des heures sans rien rendre.
 */
/** Étapes d'un premier plan. */
const MAX_ETAPES = 15;
/** Étapes d'un redécoupage. */
export const SOUS_ETAPES_MAX = 8;
/** Niveaux de redécoupage : une étape, ses parties, les parties de ses parties. */
export const PROFONDEUR_MAX = 3;
/** Étapes exécutées en tout pour une demande, redécoupages compris. */
export const ETAPES_TOTALES_MAX = 60;

/** Ce qu'une étape a produit, transmis aux suivantes. */
export interface Avancement {
  titre: string;
  resultat: string;
  ok: boolean;
  /**
   * Ce que les outils ont réellement rendu à la lecture (un fichier lu, un
   * dossier listé), tel quel. Le compte rendu du modèle ne suffit pas : sur
   * qwen3-8b, « les clients sont Martin, Dupuis et Rose » a remplacé « la
   * facture 103 est de Martin », et l'étape suivante a rangé deux factures
   * chez le mauvais client. L'instance garde donc la donnée, pas la paraphrase.
   */
  releves?: { cible: string; extrait: string }[];
}

/** Plan rendu par le modèle : l'objectif reformulé, et les étapes (vide : pas de découpage). */
export interface Plan {
  objectif: string;
  etapes: string[];
}

/**
 * Consigne de tri et de plan, en un seul appel.
 *
 * C'est le modèle qui juge si la demande doit être découpée, pas une liste de
 * mots : « fais le bilan » peut cacher dix actions, « lis ce fichier puis
 * dis-moi s'il est long » n'en demande qu'une. Il reçoit la conversation qui
 * précède, parce qu'une demande comme « vas-y » ne se comprend qu'avec elle,
 * et il reformule l'objectif en entier : chaque étape repart de cette
 * reformulation, pas de la conversation.
 *
 * Volontairement stricte sur la forme : un petit modèle bavarde, et un plan
 * noyé dans des explications n'est pas exploitable. On demande du JSON nu.
 */
/**
 * La langue d'une demande, devinée sur son texte : lettres chinoises, mots et
 * accents français, anglais sinon. `null` quand rien ne tranche.
 */
export function langueDe(texte: string): "fr" | "en" | "zh" | null {
  const t = texte.toLowerCase();
  if ((texte.match(/[\u3400-\u9fff]/g) ?? []).length >= 4) return "zh";
  const fr = (t.match(/\b(le|la|les|un|une|des|du|de|et|pour|avec|qui|que|dans|sur|est|fais|ajoute|écris|ecris|peux|mon|mes|demain|aujourd'hui)\b/g) ?? []).length + (t.match(/[éèêàçùâîô]/g) ?? []).length;
  const en = (t.match(/\b(the|a|an|and|for|with|that|which|in|on|is|make|write|add|build|create|my|please|tomorrow|today)\b/g) ?? []).length;
  if (fr > en) return "fr";
  if (en > fr) return "en";
  return null;
}

/*
 * La phrase qui fixe la langue de la réponse. Mesuré le 26/09/2026 avec Qwen3 8B :
 * « Réponds dans la langue de la demande (en anglais si elle est en anglais) »
 * le faisait répondre en anglais à une demande en français (« No existing events
 * found for tomorrow… ») : le mot « anglais » l'y poussait. On nomme donc la
 * langue elle-même, et seulement elle.
 */
export function phraseLangue(texte: string, verbe: "Réponds" | "Écris" = "Réponds"): string {
  switch (langueDe(texte)) {
    case "fr":
      return `${verbe} en français.`;
    case "en":
      return `${verbe} en anglais : la demande est en anglais.`;
    case "zh":
      return `${verbe} en chinois : la demande est en chinois.`;
    default:
      return `${verbe} dans la langue de la demande.`;
  }
}

export function consigneDePlan(
  demande: string,
  options: { contexte?: string; espace?: string; avecOutils: boolean },
): string {
  const regles = options.avecOutils
    ? [
        "- Chaque étape doit être réalisable avec un ou deux appels d'outils.",
        "- Commence par les étapes qui servent à voir (lister, lire) avant celles qui modifient.",
        "- Toute information tirée d'un fichier QUI EXISTE DÉJÀ (un nom, un montant, une date) doit",
        "  être relevée par une étape de LECTURE placée AVANT celle qui s'en sert. Pour créer quelque",
        "  chose de neuf (un site, un document) à partir de la seule demande, pas d'étape de lecture. Cette étape",
        "  de lecture doit dire dans son intitulé tout ce qu'elle relève, pas seulement",
        "  une partie : « lire chaque facture pour relever le client ET le montant ».",
        "- Ne crée pas deux étapes pour la même chose. Si une étape lit des fichiers,",
        "  n'en ajoute pas une autre pour en tirer une information : c'est le même travail.",
        "- La dernière étape doit accomplir ce que la demande réclame, pas la résumer.",
        "- Pour créer un fichier (une page, un script, une feuille de style), UNE étape qui",
        "  l'écrit avec tout son contenu : pas d'étape pour créer un fichier vide, ni pour le",
        "  créer puis l'écrire. Chaque fichier demandé a son étape d'écriture, sans exception.",
        "- Ce qui est commun à plusieurs fichiers (un menu, un lien vers la feuille de style)",
        "  s'écrit dans chacun au moment de l'écrire, pas dans une étape à part après coup.",
        options.espace ? `- L'espace de travail est : ${options.espace}` : "",
      ]
    : [
        "- Il n'y a pas d'outils : le travail est un texte à écrire.",
        "- Pour un texte long (rapport, dossier, compte rendu, présentation, article),",
        "  une étape par partie du texte, dans l'ordre où elles paraîtront. Chaque étape",
        "  nomme la partie et dit ce qu'elle doit contenir.",
        "- Un mail, une réponse courte, une explication tiennent en une seule fois : pas d'étapes.",
      ];
  return [
    "Tu organises le travail d'un assistant qui tourne sur un petit modèle.",
    "",
    "Juge d'abord la demande ci-dessous, avec la conversation qui la précède.",
    "- Si c'est une question, une conversation, ou un travail qui se fait en une ou deux",
    '  actions simples, réponds exactement : {"etapes": []}',
    // Vu le 25/09/2026 : « combien de jours de congés, et combien coûte la baguette ? » découpée en deux étapes.
    "- Une question qui porte sur plusieurs points reste une question : {\"etapes\": []}.",
    "- Sinon, découpe-le en étapes simples, dans l'ordre, sans en oublier.",
    "",
    "Règles du découpage :",
    `- Au maximum ${MAX_ETAPES} étapes, une action concrète par étape.`,
    /*
     * La langue : cette consigne est en français, et Qwen3 8B y alignait ses
     * étapes même pour une demande en anglais (vu le 25/09/2026 : « Rechercher le
     * nombre de jours de congés... » sous une question anglaise, écran en anglais).
     */
    `- ${phraseLangue(demande, "Écris")} Objectif et étapes compris.`,
    "- Si le travail porte sur une liste (des fichiers, des clients, des mails), une étape",
    "  qui la relève d'abord, puis des étapes qui la traitent par petits paquets.",
    ...regles,
    "",
    "Réponds UNIQUEMENT par un objet JSON, sans texte autour :",
    '{"objectif": "la demande reformulée en entier, avec tous les détails utiles tirés de la conversation (noms, montants, dossiers, ton, longueur)", "etapes": ["première étape", "deuxième étape"]}',
    /*
     * Un exemple, parce qu'un petit modèle suit un exemple bien mieux qu'une
     * règle. Mesuré sur qwen3-8b : avec les seules règles, il créait encore
     * des fichiers vides, puis écrivait le menu dans une étape à part, et
     * oubliait d'écrire la feuille de style.
     */
    ...(options.avecOutils
      ? [
          "",
          "Exemple pour « crée un site de deux pages, accueil.html et tarifs.html, avec style.css et un menu commun » :",
          '{"objectif": "Site de deux pages avec feuille de style commune et menu", "etapes": [' +
            '"Écrire style.css avec tout le style du site (menu, titres, textes)", ' +
            '"Écrire accueil.html complet : lien vers style.css, menu vers accueil.html et tarifs.html, contenu de l\'accueil", ' +
            '"Écrire tarifs.html complet : lien vers style.css, le même menu, contenu des tarifs"]}',
        ]
      : []),
    "",
    options.contexte ? `Conversation qui précède (la plus récente en dernier) :\n${options.contexte}\n` : "",
    "Demande :",
    demande,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Redécoupage d'une étape qui s'est révélée trop grosse : le budget d'actions
 * épuisé, ou l'agent qui a décrit au lieu de faire. Plutôt que d'arrêter le
 * travail, on demande au modèle d'en faire des parties plus petites, en
 * tenant compte de ce que l'étape a déjà fait avant de s'arrêter.
 */
export function consigneDeSousPlan(
  objectif: string,
  etape: string,
  dejaFait: string,
  rappel: string,
  constat = "",
  suivantes: string[] = [],
): string {
  return [
    "Une étape de travail s'est révélée trop grosse pour être faite d'un coup.",
    "",
    `Objectif général : ${objectif}`,
    rappel ? `\nDéjà fait avant elle :\n${rappel}\n` : "",
    `Étape trop grosse : ${etape}`,
    dejaFait.trim() ? `\nCe qu'elle a déjà fait avant de s'arrêter :\n${dejaFait.trim().slice(0, 2500)}\n` : "",
    constat.trim()
      ? `\nÉtat réel constaté en dernier (c'est lui qui compte, pas ce qui a été annoncé) :\n${constat.trim().slice(0, 2500)}\n`
      : "",
    "N'oublie aucun élément de ce qui reste : chaque élément doit figurer dans une des nouvelles étapes.",
    "Découpe UNIQUEMENT cette étape-là : n'y ajoute pas le travail des autres étapes du plan.",
    ...(suivantes.length > 0
      ? ["Ces étapes sont déjà prévues après elle ; ne les reprends pas :", ...suivantes.slice(0, 12).map((e) => `- ${e}`)]
      : []),
    `Découpe CE QUI RESTE de cette étape en 2 à ${SOUS_ETAPES_MAX} étapes plus petites, chacune faisable`,
    "en un ou deux appels d'outils. Si elle porte sur une liste (des fichiers, des clients),",
    "répartis la liste en citant les éléments : « Renommer les factures a.pdf, b.pdf et c.pdf ».",
    "Ne répète pas ce qui est déjà fait.",
    "Écris les étapes dans la langue de l'objectif général.",
    'Si elle ne peut vraiment pas être découpée davantage, réponds {"etapes": []}.',
    "",
    'Réponds UNIQUEMENT par un objet JSON : {"etapes": ["...", "..."]}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Revue finale de la demande entière, une fois toutes les étapes faites.
 *
 * Chaque étape peut être faite sans que la demande le soit : mesuré sur
 * qwen3-8b, un site de trois pages dont le plan créait la feuille de style et
 * la reliait aux pages, sans jamais l'écrire ; toutes les étapes « faites »,
 * un fichier `style.css` vide, et un menu en double sur chaque page. On
 * relit donc la demande d'origine contre l'état réel.
 */
export function consigneDeRevue(objectif: string, controleAuto: string[] = [], contenus = ""): string {
  return [
    "Revue finale, avant de rendre le travail.",
    "",
    `Demande d'origine : ${objectif}`,
    "",
    ...(controleAuto.length > 0
      ? [
          "Le contrôle automatique du code (un programme, pas un avis) a trouvé ces problèmes. Corrige-les en premier,",
          "en réécrivant les fichiers concernés en entier avec write_file :",
          ...controleAuto.map((p) => `- ${p}`),
          "",
        ]
      : []),
    ...(contenus
      ? [
          "Voici le contenu ACTUEL des fichiers modifiés, relu par l'instance à l'instant : juge sur lui, ligne à ligne.",
          contenus,
          "",
        ]
      : ["Regarde l'état réel avec les outils de lecture : liste les dossiers, relis chaque fichier concerné."]),
    "Pour chaque élément de la demande, vérifie qu'il est vraiment fait, et correctement :",
    "- rien de manquant (un fichier demandé absent ou vide, une partie oubliée) ;",
    "- rien en double (un menu, un paragraphe, une ligne écrits deux fois) ;",
    "- ce qui doit être identique l'est vraiment (un menu « commun » : le même code dans chaque fichier) ;",
    "- ce qui doit être cohérent l'est (liens entre fichiers, noms de fonctions et d'identifiants, valeurs) ;",
    "- rien en trop : un fichier ou un dossier créé par erreur, vide ou inutile, se supprime ou se signale ;",
    "- le résultat est utilisable tel quel (une page lisible, un script sans fonction appelée mais absente) ;",
    "- chaque action demandée produit son effet tout de suite (un clic, une coche changent l'affichage sans rechargement) ;",
    "- les textes affichés sont dans la langue de la demande (en français si elle est en français).",
    "Corrige tout de suite ce qui est petit, avec les outils. Ne refais pas ce qui est bon.",
    `Puis dis en quelques phrases ce qui est fait (${phraseLangue(objectif).replace(/\.$/, "").toLowerCase()}), et termine par une de ces deux lignes, exactement :`,
    `${VERIFIE} : TOUT EST FAIT`,
    `${VERIFIE} : INCOMPLET, suivi de la liste de ce qui manque ou reste à corriger`,
  ].join("\n");
}

/** Étapes pour compléter ce que la revue finale a trouvé manquant. */
export function consigneDeComplement(objectif: string, constatRevue: string, rappel: string): string {
  return [
    "La revue finale d'un travail a trouvé des manques.",
    "",
    `Demande d'origine : ${objectif}`,
    rappel ? `\nCe qui a été fait :\n${rappel}\n` : "",
    `Constat de la revue :\n${constatRevue.trim().slice(0, 3000)}`,
    "",
    `Donne 1 à ${SOUS_ETAPES_MAX} étapes, chacune faisable en un ou deux appels d'outils, qui complètent`,
    "ou corrigent EXACTEMENT ce qui manque, sans refaire ce qui est bon. Un fichier à écrire : une",
    "étape qui l'écrit avec tout son contenu. Si rien ne manque en réalité, réponds {\"etapes\": []}.",
    /*
     * Mesuré sur qwen3-8b le 23/09/2026 : « cherche dans la bibliothèque le
     * document sur les congés » ; rien trouvé, la revue a jugé la demande
     * incomplète, et les compléments ont rédigé une politique de congés,
     * puis annoncé « validée avec les responsables RH » et « formation
     * organisée ». Tout inventé. Une absence est un résultat, pas un manque.
     */
    "Seulement ce que la demande d'origine demande, rien de plus. Une information introuvable (document",
    "absent, fichier inexistant) est un résultat, pas un manque : ne crée pas, n'invente pas ce qui n'existe pas.",
    "Jamais d'étape qui consiste à contacter, faire valider, informer ou former quelqu'un : tu ne le peux pas.",
    "",
    'Réponds UNIQUEMENT par un objet JSON : {"etapes": ["...", "..."]}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Extrait le plan d'une réponse de modèle.
 *
 * Les petits modèles encadrent volontiers leur JSON de texte ou de balises de
 * code : on va chercher l'objet (ou, à défaut, le tableau d'un plan à
 * l'ancienne) plutôt que d'exiger une réponse parfaite.
 */
export function lirePlan(reponse: string, demande: string, max = MAX_ETAPES): Plan {
  const nettoyer = (brut: unknown): string[] =>
    Array.isArray(brut)
      ? brut
          .filter((e): e is string => typeof e === "string")
          .map((e) => e.trim())
          .filter((e) => e.length > 0 && e.length < 400)
          .slice(0, max)
      : [];
  // Le raisonnement d'un modèle qui pense tout haut n'est pas le plan.
  const texte = reponse.replace(/<think>[\s\S]*?<\/think>/g, "");
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut !== -1 && fin > debut) {
    try {
      const o = JSON.parse(texte.slice(debut, fin + 1)) as { objectif?: unknown; etapes?: unknown };
      const objectif = typeof o.objectif === "string" && o.objectif.trim() ? o.objectif.trim().slice(0, 4000) : demande;
      return { objectif, etapes: nettoyer(o.etapes) };
    } catch {
      /* on tente le tableau */
    }
  }
  const d = texte.indexOf("[");
  const f = texte.lastIndexOf("]");
  if (d !== -1 && f > d) {
    try {
      return { objectif: demande, etapes: nettoyer(JSON.parse(texte.slice(d, f + 1))) };
    } catch {
      /* rien d'exploitable */
    }
  }
  return { objectif: demande, etapes: [] };
}

/** Noms de fichiers cités dans un intitulé d'étape (« index.html », « style.css »…). */
const FICHIER = /[\w./-]*[\w-]\.(?:html?|css|js|mjs|ts|tsx|jsx|json|md|txt|py|php|vue|svelte|xml|ya?ml|csv|sql|sh)\b/gi;
const fichiersDe = (etape: string) => [...new Set((etape.match(FICHIER) ?? []).map((f) => f.split("/").pop()!.toLowerCase()))];
/** « créer le fichier X » : une étape qui ne fait que créer, sans dire quoi écrire. */
const creationSeule = (etape: string) =>
  /^\s*cr[ée]er\b/i.test(etape) && !/\b(avec|contenant|qui contient|et y)\b/i.test(sansAccents(etape));
/** Une étape qui vaut pour plusieurs fichiers sans les nommer (« le menu commun aux trois pages »). */
const pourPlusieurs = (etape: string) =>
  /\b(commun|communs|commune|chaque (page|fichier)|toutes les pages|tous les fichiers|(deux|trois|quatre|cinq|les) pages)\b/i.test(sansAccents(etape));

/**
 * Regroupe un plan par fichier : une étape écrit un fichier en entier.
 *
 * Un petit modèle écrit bien un fichier d'un seul jet, et le modifie mal par
 * morceaux. Mesuré sur qwen3-8b pour un site de trois pages : son plan créait
 * des fichiers vides, puis ajoutait le menu, puis le contenu ; les
 * modifications ne retrouvaient pas le texte à remplacer, et le travail s'est
 * arrêté au milieu. Même avec la consigne et un exemple, il découpe ainsi.
 * Quand un fichier est d'abord créé vide puis repris par d'autres étapes,
 * celles-ci sont fondues dans une seule : « écrire ce fichier en entier, avec
 * tout ce qu'il doit contenir ». Une étape commune à plusieurs fichiers sans
 * les nommer (« le menu des trois pages ») est ajoutée à chacun.
 */
export function regrouperParFichier(etapes: string[]): string[] {
  // Les fichiers que le plan crée vides : ce sont eux qu'on réécrit d'un bloc.
  const crees = new Map<string, number>();
  etapes.forEach((e, i) => {
    const f = fichiersDe(e);
    if (f.length === 1 && creationSeule(e) && !crees.has(f[0]!)) crees.set(f[0]!, i);
  });
  if (crees.size === 0) return etapes;
  const ajouts = new Map<string, string[]>();
  const retirees = new Set<number>();
  etapes.forEach((e, i) => {
    const f = fichiersDe(e);
    if (f.length === 1 && crees.has(f[0]!) && crees.get(f[0]!) !== i) {
      ajouts.set(f[0]!, [...(ajouts.get(f[0]!) ?? []), e]);
      retirees.add(i);
    } else if (f.length === 0 && pourPlusieurs(e) && !/^\s*cr[ée]er (le|un) dossier/i.test(e)) {
      // Commun aux fichiers d'une même famille : ajouté à chaque page (ou à chaque fichier créé).
      for (const nom of crees.keys()) {
        if (/\.html?$/.test(nom) || !/page/i.test(e)) ajouts.set(nom, [...(ajouts.get(nom) ?? []), e]);
      }
      retirees.add(i);
    }
  });
  return etapes.flatMap((e, i) => {
    if (retirees.has(i)) return [];
    const f = fichiersDe(e);
    if (f.length === 1 && crees.get(f[0]!) === i) {
      const reste = ajouts.get(f[0]!) ?? [];
      return [
        `Écrire ${f[0]} en entier, d'un seul coup avec write_file, avec tout son contenu (${e.replace(/\s*\.$/, "")})` +
          (reste.length > 0 ? ` : ${reste.map((r) => r.replace(/\s*\.$/, "")).join(" ; ")}` : " : tout ce que la demande attend de ce fichier"),
      ];
    }
    return [e];
  });
}

/**
 * Rappel des étapes déjà faites, borné en taille : avec un redécoupage, une
 * demande peut compter des dizaines d'étapes, et tout rappeler noierait un
 * petit modèle. Les plus récentes sont rapportées en entier, les plus
 * anciennes résumées, puis seulement comptées.
 *
 * Tout jeter au-delà d'une fenêtre glissante faisait perdre des faits acquis
 * tôt : sur le banc, les montants relevés à l'étape 2 avaient disparu quand
 * l'étape 8 devait écrire le bilan, et le modèle les a inventés. D'où les
 * résumés avant l'oubli.
 */
export function rappelDes(precedentes: Avancement[], budget = 7000): string {
  const lignes: string[] = [];
  let reste = budget;
  let omises = 0;
  for (let i = precedentes.length - 1; i >= 0; i--) {
    const p = precedentes[i]!;
    const recente = i >= precedentes.length - 4;
    const taille = recente ? 600 : 220;
    const lus =
      recente && p.releves && p.releves.length > 0
        ? "\n" +
          p.releves
            .slice(0, 12)
            .map((r) => `    lu dans ${r.cible || "l'outil"} : ${r.extrait.replace(/\s+/g, " ").trim().slice(0, 300)}`)
            .join("\n")
        : "";
    const ligne = `- ${p.titre} : ${p.ok ? p.resultat.slice(0, taille) : "échec : " + p.resultat.slice(0, 200)}${lus}`;
    if (ligne.length > reste) {
      // La plus récente passe toujours, quitte à être coupée : c'est elle dont l'étape en cours dépend.
      if (lignes.length === 0) {
        lignes.unshift(`${ligne.slice(0, reste)}…`);
        omises = i;
      } else omises = i + 1;
      break;
    }
    lignes.unshift(ligne);
    reste -= ligne.length;
  }
  if (omises > 0) lignes.unshift(`- (${omises} étape${omises > 1 ? "s" : ""} plus ancienne${omises > 1 ? "s" : ""}, faite${omises > 1 ? "s" : ""})`);
  return lignes.join("\n");
}

/**
 * Consigne d'une étape : l'objectif du moment, et juste assez du passé pour
 * s'y raccrocher. Rappeler l'intégralité du travail ferait perdre au modèle
 * exactement ce qu'on cherche à lui épargner.
 */
export function consigneDEtape(
  objectif: string,
  etape: string,
  repere: string,
  precedentes: Avancement[],
): string {
  const rappel = rappelDes(precedentes);
  return [
    `Demande générale : ${objectif}`,
    "",
    precedentes.length > 0 ? `Déjà fait :\n${rappel}` : "",
    "",
    `Étape ${repere}, à réaliser maintenant :`,
    etape,
    "",
    "Fais uniquement cette étape, avec les outils. Ne fais pas les suivantes.",
    phraseLangue(objectif),
    "",
    "N'INVENTE RIEN : ni un nom de fichier, de dossier ou de client, ni un montant,",
    "ni un total, ni une date. Toute valeur vient soit d'une liste que tu as obtenue,",
    "soit du contenu d'un fichier que tu as lu, soit de la demande elle-même, soit du",
    "rappel ci-dessus. Si elle te manque, va la lire. Un nom générique comme",
    "« Client1 », ou un montant plausible que tu n'as pas vu, sont toujours des",
    "erreurs : mieux vaut écrire que l'information manque.",
    "",
    "Si la demande nomme un dossier, le chemin que tu écris doit contenir ce dossier.",
    "",
    "Quand l'étape est faite, réponds en une phrase courte disant ce que tu as",
    "obtenu. Si tu as établi des noms ou des valeurs dont les étapes suivantes",
    "auront besoin, cite-les dans cette phrase : elles ne verront que ça.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Consigne d'une partie d'un texte long, sans outils. Le modèle voit le plan
 * entier (pour savoir où il en est) et la fin de ce qui est déjà écrit (pour
 * enchaîner), jamais tout le texte : c'est ce qui permet à un petit modèle
 * d'écrire un document bien plus long que ce qu'il sait tenir d'un seul jet.
 */
export function consigneDePartie(
  objectif: string,
  plan: string[],
  index: number,
  dejaEcrit: string,
): string {
  const derniere = index === plan.length - 1;
  return [
    `Document à rédiger : ${objectif}`,
    "",
    "Plan du document :",
    ...plan.map((p, i) => `${i + 1}. ${p}${i === index ? "  ← à rédiger maintenant" : ""}`),
    "",
    dejaEcrit.trim() ? `Fin de ce qui est déjà écrit :\n…${dejaEcrit.trim().slice(-1500)}\n` : "",
    `Rédige maintenant la partie ${index + 1} sur ${plan.length} : ${plan[index]}`,
    "",
    "Écris directement le texte de cette partie, précédé de son intertitre (« ## … »).",
    "Ne répète pas ce qui précède, n'annonce pas la suite, et ne commente pas ton travail.",
    derniere ? "C'est la dernière partie : tu peux conclure l'ensemble." : "Ce n'est pas la dernière partie : ne conclus pas l'ensemble.",
    "N'invente ni chiffre, ni nom, ni fait qui ne soit pas dans la demande ou dans les passages des bases de connaissances fournis plus haut : si une information manque, écris-le entre crochets.",
    // Même raison que dans consigneDePlan : la consigne est en français, la réponse suit la demande.
    phraseLangue(objectif, "Écris"),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Minuscules sans accents.
 *
 * On tape « cree un dossier » aussi souvent que « crée un dossier », surtout
 * vite fait au clavier : les comparaisons de mots se font sous cette forme.
 */
function sansAccents(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ------------------------- adaptation au modèle ---------------------------- */

/**
 * Réglages de découpage, déduits du modèle qui va travailler.
 *
 * Découper est un compromis, pas un progrès en soi. Sur un petit modèle, c'est
 * ce qui fait la différence entre une tâche finie et une tâche abandonnée à
 * mi-chemin. Sur un grand modèle, c'est du temps perdu et de la qualité en
 * moins : il tient l'ensemble en tête, voit les raccourcis, et un plan imposé
 * l'empêche de s'adapter à ce qu'il découvre en chemin.
 *
 * D'où trois régimes, choisis d'après la taille annoncée.
 */
export interface Strategie {
  /** Découper les demandes composées en étapes exécutées une à une. */
  decoupe: boolean;
  /** Appels d'outils accordés à une étape. */
  budgetParEtape: number;
  /** Appels d'outils accordés quand on ne découpe pas. */
  budgetDirect: number;
  /** Pourquoi ce régime : affiché dans le journal, utile au support. */
  raison: string;
}

/**
 * Nombre de milliards de paramètres, si le backend le dit.
 *
 * LM Studio annonce « 8B », « 70B », parfois « 30B-A3B » pour un modèle à
 * experts — on retient alors le premier nombre, le total, car c'est lui qui
 * dit ce que le modèle a vu à l'entraînement, pas le nombre d'experts actifs.
 */
function milliards(params?: string): number | null {
  if (!params) return null;
  const m = params.match(/([\d.]+)\s*([BM])/i);
  if (!m) return null;
  const valeur = Number(m[1]);
  if (!Number.isFinite(valeur)) return null;
  return m[2].toUpperCase() === "M" ? valeur / 1000 : valeur;
}

/**
 * À défaut de nombre de paramètres, la taille du fichier renseigne : un modèle
 * quantifié pèse à peu près 0,6 Go par milliard de paramètres.
 */
function milliardsApprochés(sizeBytes?: number): number | null {
  if (!sizeBytes) return null;
  return sizeBytes / 1e9 / 0.6;
}

export function strategie(model: {
  params?: string;
  sizeBytes?: number;
  backendKind?: string;
}): Strategie {
  const taille = milliards(model.params) ?? milliardsApprochés(model.sizeBytes);

  /*
   * Taille inconnue et backend distant : c'est un service qui expose un modèle
   * sans dire lequel — un fournisseur européen, un cluster interne. On suppose
   * un grand modèle, parce que c'est le cas courant et que découper à tort un
   * modèle capable coûte plus cher que l'inverse : cela le ralentit et lui
   * retire l'initiative, alors qu'il n'en avait pas besoin.
   */
  if (taille === null) {
    const local = model.backendKind === "lmstudio";
    return {
      decoupe: local,
      budgetParEtape: 8,
      // Supposé capable : autant lui accorder le budget d'un grand modèle,
      // sans quoi on l'arrêterait en pleine tâche pour rien.
      budgetDirect: local ? 30 : 50,
      raison:
        model.backendKind === "lmstudio"
          ? "taille inconnue sur moteur local : découpage proposé au modèle, par prudence"
          : "taille inconnue sur moteur distant : supposé capable, pas de découpage",
    };
  }

  // Jusqu'à 14 milliards : le fil se perd sur une tâche composée. Le modèle juge chaque demande.
  if (taille < 14) {
    return {
      decoupe: true,
      budgetParEtape: 8,
      budgetDirect: 30,
      raison: tf("{0} milliards de paramètres : le modèle juge s'il faut découper, étapes courtes", taille.toFixed(0)),
    };
  }

  /*
   * De 14 à 45 milliards : tient une tâche moyenne d'un seul tenant. Il juge
   * lui aussi, et ses étapes sont plus larges : il sait enchaîner plusieurs
   * actions sans se perdre.
   */
  if (taille < 45) {
    return {
      decoupe: true,
      budgetParEtape: 14,
      budgetDirect: 40,
      raison: tf("{0} milliards de paramètres : le modèle juge s'il faut découper, étapes larges", taille.toFixed(0)),
    };
  }

  // Au-delà : le découpage lui retirerait plus qu'il ne lui apporte.
  return {
    decoupe: false,
    budgetParEtape: 20,
    budgetDirect: 50,
    raison: tf("{0} milliards de paramètres : exécution directe", taille.toFixed(0)),
  };
}

/* ----------------------- étapes qui doivent agir --------------------------- */

/**
 * Une réplique de conversation, qu'on ne découpe jamais en plan.
 *
 * Le tri par le modèle se trompe sur les répliques courtes qui s'appuient sur
 * la conversation. Constaté le 23/09/2026 sur qwen3-8b : « non mais si je te
 * connecte » (sous-entendu : à mes mails) a reçu un plan de trois étapes, une
 * recherche dans la bibliothèque et une revue finale, au lieu d'un simple
 * « oui, voici ce que je pourrai faire ». Une question courte, ou une phrase
 * courte qui commence comme une réplique (non, oui, mais, et si, pourquoi…),
 * est donc tranchée ici, avant de demander quoi que ce soit au modèle.
 */
/**
 * Une question, sans outils : rien à découper. Au-delà des quinze mots de
 * `estReplique`, qwen3-8b découpait encore une question en deux points en deux
 * « étapes » (vu le 25/09/2026, malgré la règle de consigneDePlan), ce qui
 * donnait deux intertitres pour deux phrases. Une seule ligne, quarante mots
 * au plus, qui finit par un point d'interrogation.
 */
export function estQuestionSimple(demande: string): boolean {
  const texte = demande.trim();
  if (!/[?？]$/.test(texte) || /\n\s*\n/.test(texte)) return false;
  const ideogrammes = (texte.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latins = texte.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ").split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
  return latins + Math.ceil(ideogrammes / 2) <= 40;
}

export function estReplique(demande: string): boolean {
  const texte = sansAccents(demande).trim();
  /*
   * Le chinois s'écrit sans espaces : compter les blancs donnait « un mot »
   * pour toute phrase, et aucune réplique chinoise n'était reconnue
   * (« 不，如果我连接你呢 » repartait vers le tri, donc vers un plan possible).
   * Un mot chinois fait en moyenne deux caractères : c'est l'unité retenue.
   */
  const ideogrammes = (texte.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latins = texte.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ").split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
  const mots = latins + Math.ceil(ideogrammes / 2);
  if (mots === 0 || mots > 15) return false;
  if (/[?？]\s*$/.test(texte)) return true;
  /*
   * Trois mots au plus, sans verbe d'action : « Cool », « parfait », « super,
   * merci beaucoup ». Rien à découper, et le tri coûtait un aller-retour au
   * modèle avant chaque remerciement. « Range mes factures » garde son tri.
   */
  if (mots <= 3 && !etapeExigeAction(texte)) return true;
  if (/^(不|是的|是|好的|好|谢谢|多谢|但是|但|那|如果|为什么|怎么|可以|你|您|嗯|哦|对|行|没)/.test(texte)) return true;
  return /^(non|oui|ouais|mais|et si|et|si|ok|okay|d'accord|daccord|merci|pourquoi|comment|est-ce|tu |vous |c'est|ah|bon|bah|alors|genre|no|yes|yeah|but|and|what|why|how|can you|could you|do you|is it|thanks|thank you|sure)\b/.test(
    texte,
  );
}

/**
 * Verbes qui décrivent une modification, écrits sans accents.
 *
 * Servent à reconnaître une étape qui doit **changer quelque chose**, par
 * opposition à une étape d'observation.
 */
const VERBES_ACTION = [
  "cree", "creer", "ajoute", "ajouter", "ecris", "ecrire", "enregistre",
  "enregistrer", "deplace", "deplacer", "range", "ranger", "classe", "classer",
  "renomme", "renommer", "supprime", "supprimer", "efface", "effacer",
  "copie", "copier", "archive", "archiver", "corrige", "corriger",
  "remplace", "remplacer", "modifie", "modifier", "convertis", "convertir",
  "genere", "generer", "produis", "produire", "trie", "trier",
];

/**
 * Cette étape doit-elle modifier quelque chose ?
 *
 * Mesuré sur qwen3-8b : à l'étape « Déplacer les factures non classées », le
 * modèle a listé le dossier, constaté qu'il manquait un prérequis, puis
 * **expliqué ce qu'il faudrait faire** — et l'étape a été comptée comme
 * réussie, parce qu'il avait simplement cessé d'appeler des outils. Un agent
 * qui commente au lieu d'agir est le travers le plus coûteux d'un petit
 * modèle : il donne l'apparence du travail fait.
 *
 * D'où cette vérification : une étape d'action qui n'a produit aucune
 * modification n'est pas terminée, quoi qu'en dise sa réponse.
 */
export function etapeExigeAction(titre: string): boolean {
  const t = sansAccents(titre);
  /*
   * Le premier verbe dit la nature de l'étape. « Lire le dossier pour voir s'il
   * y a des fichiers à remplacer » est une lecture, même si « remplacer » y
   * figure. Mesuré sur qwen3-8b : cette lecture, prise pour une action, a été
   * « contrôlée », jugée incomplète et redécoupée en toute l'application.
   */
  if (etapeDeLecture(titre)) return false;
  return VERBES_ACTION.some((v) => new RegExp(`\\b${v}`).test(t));
}

const VERBES_LECTURE = [
  "lis", "lire", "liste", "lister", "verifie", "verifier", "cherche", "chercher", "releve", "relever",
  "consulte", "consulter", "examine", "examiner", "analyse", "analyser", "regarde", "regarder",
  "identifie", "identifier", "parcours", "parcourir", "recupere", "recuperer", "compte", "compter", "ouvre", "ouvrir",
];

/** Une étape qui commence par un verbe de lecture observe et ne modifie rien. */
export function etapeDeLecture(titre: string): boolean {
  const premier = sansAccents(titre).trim().split(/[^a-z]+/).find(Boolean) ?? "";
  return VERBES_LECTURE.includes(premier);
}

/** L'erreur dit-elle que la cible n'existe pas (encore) ? */
export const cibleAbsente = (erreur: string) => /ENOENT|no such file|not found|introuvable|does not exist|n'existe pas/i.test(erreur);

/**
 * Retire d'un redécoupage les étapes qui écrivent un fichier dont une étape
 * suivante du plan s'occupe déjà : sinon l'étape redécoupée refait le plan
 * entier (mesuré : « lire le dossier » redécoupée en « écrire index.html,
 * style.css, app.js », que les étapes 2 à 4 allaient écrire).
 */
export function sansDoublons(sousEtapes: string[], suivantes: string[]): string[] {
  const prevus = new Set(suivantes.flatMap((e) => fichiersDe(e)));
  return sousEtapes.filter((e) => {
    const f = fichiersDe(e);
    return f.length === 0 || !f.some((x) => prevus.has(x));
  });
}

/** Marqueur par lequel le modèle déclare qu'une étape n'a plus lieu d'être. */
export const RIEN_A_FAIRE = "RIEN A FAIRE";

/**
 * Consigne de rattrapage, quand une étape d'action n'a rien modifié.
 *
 * Elle laisse volontairement une porte de sortie. Un plan comporte souvent des
 * étapes redondantes : l'agent range les factures dès qu'il les a lues, et
 * l'étape « déplacer les factures » n'a alors plus rien à déplacer. Sans cette
 * porte, un travail correctement fait était compté comme un refus d'agir et le
 * plan s'arrêtait avant sa fin — c'est arrivé sur le banc, le rangement était
 * bon et le bilan final n'a jamais été écrit.
 */
export function consigneDeRattrapage(etape: string, erreur?: string): string {
  return [
    erreur
      ? `Des actions de cette étape ont échoué. Dernier refus de l'outil : ${erreur}`
      : "Tu n'as modifié aucun fichier au cours de cette étape.",
    erreur
      ? /edit_file|exact match/i.test(erreur)
        ? "Ta modification n'a pas retrouvé le texte à remplacer. Relis le fichier, puis réécris-le EN ENTIER avec write_file (contenu complet, corrigé), au lieu de le modifier par morceaux."
        : "Lis ce message, corrige ton appel et recommence (par exemple : donner le chemin complet du fichier, créer d'abord le dossier manquant)."
      : "",
    "",
    `Étape : ${etape}`,
    "",
    "Deux cas, et deux seulement :",
    "",
    "1. Elle reste à faire. Fais-la maintenant, avec les outils, sans la",
    "   commenter. S'il manque un prérequis (un dossier absent, par exemple),",
    "   crée-le toi-même puis poursuis. Ne demande pas la permission.",
    "",
    `2. Elle est déjà satisfaite par une étape précédente. Réponds alors par`,
    `   « ${RIEN_A_FAIRE} » suivi de la raison, en une phrase. Ne fais rien d'autre.`,
    "",
    "Vérifie d'abord l'état réel des fichiers (liste ou lis-les) avant de choisir :",
    "« RIEN A FAIRE » n'est accepté que si tu as regardé.",
  ]
    .filter((l, i, t) => l !== "" || t[i - 1] !== "")
    .join("\n");
}

/** Le modèle a-t-il déclaré l'étape sans objet ? */
export function declareRienAFaire(reponse: string): boolean {
  return sansAccents(reponse).includes(sansAccents(RIEN_A_FAIRE));
}

/** Marqueur par lequel le modèle confirme avoir contrôlé l'état réel. */
export const VERIFIE = "VERIFIE";

/**
 * Contrôle d'une étape qui a modifié quelque chose.
 *
 * Un petit modèle annonce volontiers plus qu'il n'a fait. Mesuré sur
 * qwen3-8b : vingt et un fichiers renommés sur vingt-quatre, aucune erreur
 * d'outil, et « les 24 fichiers ont été renommés ». Aucun contrôle sur les
 * retours des outils ne voit ce qui n'a pas été tenté : il faut regarder le
 * résultat. On lui demande donc de constater l'état réel, et de finir ce qui
 * manque.
 */
export function consigneDeVerification(etape: string, suivantes: string[] = []): string {
  return [
    "Contrôle avant de passer à la suite.",
    "",
    `Étape qui devait être faite : ${etape}`,
    "",
    /*
     * Juger l'étape, pas la demande entière. Mesuré sur qwen3-8b : l'étape
     * « créer le dossier » déclarée incomplète parce que l'application
     * n'était pas encore écrite ; redécoupée en toute l'application, puis
     * encore, jusqu'à l'arrêt.
     */
    "Juge UNIQUEMENT cette étape-là, pas le reste de la demande.",
    ...(suivantes.length > 0
      ? ["Ce qui suit sera fait par les étapes suivantes ; ne le compte pas comme manquant :", ...suivantes.slice(0, 12).map((e) => `- ${e}`)]
      : []),
    "",
    "Regarde l'état réel avec les outils de lecture : liste le dossier, relis le fichier.",
    "Ne te fie pas à ce que tu as annoncé : compte ce qui est vraiment fait.",
    "S'il manque quelque chose, fais-le maintenant, avec les outils. Ne refais pas ce qui est déjà fait.",
    "Puis dis en une phrase ce qui est réellement fait (avec les noms ou les nombres),",
    "et termine par une de ces deux lignes, exactement :",
    `${VERIFIE} : TOUT EST FAIT`,
    `${VERIFIE} : INCOMPLET, suivi de ce qui manque encore`,
  ].join("\n");
}

/**
 * Conclusion du contrôle : « fait », « incomplet », ou rien d'exploitable.
 * Des refus d'outils pendant le contrôle ne disent pas à eux seuls que
 * l'étape a raté : un renommage retenté sur un fichier déjà renommé est
 * refusé (« la destination existe déjà »), ce qui prouve au contraire que
 * c'est fait. Mesuré sur qwen3-8b.
 */
export function conclusionDuControle(texte: string): "fait" | "incomplet" | null {
  const t = sansAccents(texte);
  const i = t.lastIndexOf(sansAccents(VERIFIE).toLowerCase());
  if (i < 0) return null;
  const suite = t.slice(i);
  if (suite.includes("incomplet")) return "incomplet";
  if (suite.includes("tout est fait")) return "fait";
  return null;
}

/**
 * Le manque signalé par un contrôle n'est-il que le travail des étapes suivantes ?
 *
 * La consigne dit au modèle de juger l'étape seule et lui liste la suite ; un
 * 8B l'oublie quand même. Mesuré sur qwen3-8b le 23/09/2026 : « créer le
 * dossier archives » fait et relu, puis « VERIFIE : INCOMPLET, le fichier
 * facture-dupont.txt n'est pas dans le dossier archives et le fichier
 * bilan.txt n'existe pas » — exactement les étapes 2 et 3. Redécoupée, l'étape
 * recevait le même verdict, et le travail entier s'arrêtait en échec après
 * avoir réussi sa première action.
 *
 * On tranche donc sur ce que le manque désigne : s'il nomme des fichiers, ils
 * doivent tous appartenir aux étapes suivantes et aucun à l'étape jugée ;
 * sinon, ses mots significatifs doivent venir de la suite, pas de l'étape.
 * Dans le doute, le verdict « incomplet » tient.
 */
export function manqueCouvertParLaSuite(texte: string, etape: string, suivantes: string[]): boolean {
  if (suivantes.length === 0) return false;
  const t = sansAccents(texte);
  const i = t.lastIndexOf(sansAccents(VERIFIE).toLowerCase());
  if (i < 0) return false;
  const manque = t.slice(i).replace(/^verifie\s*:\s*incomplet[\s,:.-]*/, "");
  if (!manque.trim()) return false;
  const suite = suivantes.join("\n");
  const fichiers = fichiersDe(manque);
  if (fichiers.length > 0) {
    const aVenir = new Set(fichiersDe(suite));
    const ici = new Set(fichiersDe(etape));
    return fichiers.every((f) => aVenir.has(f) && !ici.has(f));
  }
  const motsDe = (x: string) => new Set(sansAccents(x).split(/[^a-z0-9]+/).filter((m) => m.length >= 5));
  const mots = [...motsDe(manque)];
  if (mots.length === 0) return false;
  const aVenir = motsDe(suite);
  const ici = motsDe(etape);
  const deLaSuite = mots.filter((m) => aVenir.has(m) && !ici.has(m)).length;
  const deLEtape = mots.filter((m) => ici.has(m) && !aVenir.has(m)).length;
  return deLEtape === 0 && deLaSuite / mots.length >= 0.5;
}

/**
 * Consigne quand une étape s'est terminée sans un mot.
 *
 * Le compte rendu d'une étape est la seule mémoire transmise aux suivantes.
 * Une étape muette laisse donc un trou, et l'étape d'après comble ce trou en
 * inventant : observé sur le banc, un bilan comptable rempli de montants
 * vraisemblables et entièrement faux.
 */
export function consigneDeCompteRendu(etape: string): string {
  return [
    "Tu n'as rien répondu à la fin de cette étape.",
    "",
    `Étape : ${etape}`,
    "",
    "Dis maintenant, en une ou deux phrases, ce que tu as obtenu : les valeurs,",
    "les noms, les totaux. N'appelle aucun outil, sauf s'il te manque une donnée",
    "que tu dois relire pour répondre. Les étapes suivantes ne verront que cette",
    "réponse : ce que tu n'écris pas est perdu.",
  ].join("\n");
}
