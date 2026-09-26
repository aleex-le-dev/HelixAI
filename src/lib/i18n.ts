import en from "@/i18n/en.json";
import zh from "@/i18n/zh.json";

/**
 * La langue de l'interface.
 *
 * ── Le choix de méthode, et pourquoi celui-là ───────────────────────────────
 *
 * La clé de traduction **est la phrase française**. Pas un identifiant
 * (`chat.nouveau.bouton`), la phrase elle-même. C'est inhabituel, et c'est
 * délibéré :
 *
 *  - le code reste lisible. `t("Nouveau Chat")` se comprend sans aller
 *    chercher ce que contient `nav.newChat` ;
 *  - une phrase sans traduction s'affiche **en français**, pas en
 *    `nav.newChat`. Une traduction manquante dégrade, elle ne casse pas ;
 *  - le français n'a pas de catalogue à tenir : il est dans le code, et ne
 *    peut donc jamais être en retard sur lui.
 *
 * Le prix : changer un mot français change la clé, et la traduction retombe
 * en français jusqu'à ce qu'on la reporte. Le relevé (`npm run i18n`) dit
 * lesquelles manquent, et c'est ce qui rend ce prix payable.
 *
 * ── Pourquoi la page se recharge au changement de langue ────────────────────
 *
 * `t()` est une fonction ordinaire, pas un crochet React : elle est appelée
 * dans des tableaux constants, au chargement des modules, hors de tout
 * composant. Rien ne redessine l'écran quand la langue change. Plutôt que de
 * faire semblant, on recharge : c'est immédiat, total, et sans écran à moitié
 * traduit. Un changement de langue est rare ; un rendu faux ne doit jamais
 * arriver.
 *
 * ── Ce qui n'est pas traduit, et qui doit se savoir ─────────────────────────
 *
 * Les messages venus de l'instance (erreurs de la passerelle, résultats
 * d'outils) sont écrits en français dans `gateway/`. Ceux qui figurent aussi
 * dans le catalogue sont traduits au passage, les autres restent en français.
 * Le contenu écrit par les utilisateurs — chats, documents, procédures — n'est
 * évidemment jamais touché.
 */

/*
 * L'anglais d'abord : c'est la langue de référence du logiciel, celle qu'il
 * prend par défaut (décision de la 0.26.0, rappelée par le client le
 * 25/09/2026). Les phrases françaises restent les clés du catalogue : c'est
 * une affaire de code, pas ce que l'écran présente.
 */
export const LANGUES = [
  { code: "en", nom: "Anglais", natif: "English" },
  { code: "fr", nom: "Français", natif: "Français" },
  { code: "zh", nom: "Chinois", natif: "中文" },
] as const;

export type Langue = (typeof LANGUES)[number]["code"];

const CLE = "helix:langue";

/** Catalogues embarqués : `t()` doit répondre dès le premier rendu. */
const CATALOGUES: Record<Exclude<Langue, "fr">, Record<string, string>> = {
  en: en as Record<string, string>,
  zh: zh as Record<string, string>,
};

function langueEnregistree(): Langue | null {
  try {
    const brut = localStorage.getItem(CLE);
    return brut === "fr" || brut === "en" || brut === "zh" ? brut : null;
  } catch {
    return null;
  }
}

/**
 * Langue par défaut, quand le système n'en dit rien d'exploitable.
 *
 * L'anglais, et non le français, bien que le produit soit écrit en français :
 * c'est la langue que le plus grand nombre de gens peut lire, et un logiciel
 * qui s'ouvre dans une langue qu'on ne lit pas ne s'explore pas. Le français
 * reste la langue **source** — les clés du catalogue sont des phrases
 * françaises — ce qui est une autre question que la langue affichée.
 */
const PAR_DEFAUT: Langue = "en";

/**
 * Langue du système, quand rien n'a été choisi.
 *
 * On ne devine que ce qu'on sait servir. Un poste en espagnol s'ouvre en
 * anglais plutôt que de tomber dans une langue au hasard, et la personne
 * choisit elle-même.
 */
function langueDuSysteme(): Langue {
  try {
    for (const etiquette of navigator.languages ?? [navigator.language]) {
      const base = etiquette.toLowerCase().split("-")[0];
      if (base === "en") return "en";
      if (base === "zh") return "zh";
      if (base === "fr") return "fr";
    }
  } catch {
    /* pas de navigateur : la langue par défaut */
  }
  return PAR_DEFAUT;
}

const courante: Langue = langueEnregistree() ?? langueDuSysteme();

/** La langue en cours d'affichage. */
export const langue = (): Langue => courante;

/** Une langue a-t-elle été choisie, ou suit-on encore le système ? */
export const langueChoisie = (): boolean => langueEnregistree() !== null;

const table: Record<string, string> = courante === "fr" ? {} : CATALOGUES[courante];

/**
 * Traduit une phrase française. Sans traduction, rend la phrase telle quelle.
 *
 * Appelée partout, y compris au chargement des modules : elle est donc
 * volontairement triviale, sans effet de bord et sans dépendance à React.
 */
export function t(fr: string): string {
  if (courante === "fr") return fr;
  return table[fr] ?? fr;
}

/**
 * Étiquette de locale, pour ce qui se formate plutôt que se traduit :
 * nombres, dates, tailles de fichiers.
 */
export function locale(): string {
  return { fr: "fr-FR", en: "en-US", zh: "zh-CN" }[courante];
}

/**
 * Une taille de fichier dans la langue de lecture : « 1,2 Mo », « 1.2 MB ».
 *
 * Les unités étaient écrites en dur, en français, à plusieurs endroits du
 * code : l'écran passait en anglais en continuant d'annoncer « 1 Go ». Les
 * unités françaises (o, Ko, Mo, Go) n'ont pas cours ailleurs, l'anglais comme
 * le chinois disant B, KB, MB, GB. La virgule décimale suit elle aussi la
 * langue.
 */
export function taille(octets: number): string {
  const unites = courante === "fr" ? ["o", "Ko", "Mo", "Go"] : ["B", "KB", "MB", "GB"];
  const nombre = (valeur: number, decimales: number) =>
    valeur.toLocaleString(locale(), { maximumFractionDigits: decimales });
  if (octets < 1024) return `${octets} ${unites[0]}`;
  if (octets < 1024 ** 2) return `${Math.max(1, Math.round(octets / 1024))} ${unites[1]}`;
  if (octets < 1024 ** 3) return `${nombre(octets / 1024 ** 2, 1)} ${unites[2]}`;
  return `${nombre(octets / 1024 ** 3, 2)} ${unites[3]}`;
}

/**
 * Change la langue et recharge.
 *
 * Le rechargement fait partie du contrat (voir en tête de fichier) : sans lui,
 * la moitié de l'écran resterait dans l'ancienne langue jusqu'au prochain
 * rendu de chaque composant.
 */
export function changerLangue(nouvelle: Langue): void {
  try {
    localStorage.setItem(CLE, nouvelle);
  } catch {
    /* stockage indisponible : le choix vaudra pour cette session */
  }
  try {
    document.documentElement.lang = nouvelle;
  } catch {
    /* pas de document */
  }
  window.location.reload();
}

/**
 * Traduit une phrase **à trous**, du genre « Écrire à {0} ».
 *
 * Une phrase qui contient une valeur ne peut pas être une clé telle quelle :
 * « Écrire à Marie » et « Écrire à Paul » seraient deux entrées de catalogue,
 * et aucune des deux ne se retrouverait. On numérote donc les trous, et la
 * traduction peut les remettre dans un autre ordre — ce qui est exactement le
 * besoin : le chinois et l'anglais ne placent pas les compléments comme le
 * français.
 */
export function tf(modele: string, ...valeurs: unknown[]): string {
  return t(modele).replace(/\{(\d+)\}/g, (_, i: string) => {
    const v = valeurs[Number(i)];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Combien de phrases ce catalogue couvre-t-il ? Affiché dans les réglages. */
export function couverture(code: Langue): { traduites: number; total: number } {
  if (code === "fr") return { traduites: 0, total: 0 };
  const cat = CATALOGUES[code];
  const traduites = Object.values(cat).filter((v) => typeof v === "string" && v.length > 0).length;
  return { traduites, total: Object.keys(cat).length };
}

/*
 * L'attribut `lang` du document suit la langue affichée : il décide de la
 * coupure des mots, de la police par défaut des idéogrammes, et de ce
 * qu'annonce un lecteur d'écran.
 */
try {
  document.documentElement.lang = courante;
} catch {
  /* rendu hors navigateur */
}

// L'application de bureau suit la même langue pour ses propres textes (zone de notification, menu de Windows et Linux).
try {
  (window as unknown as { helix?: { langue?: (code: string) => void } }).helix?.langue?.(courante);
} catch {
  /* navigateur, ou application d'une version antérieure */
}
