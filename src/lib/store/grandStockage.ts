/**
 * Grand stockage du poste, côté interface (electron/grandStockage.cjs).
 *
 * Dans l'application de bureau, les Chats sont rangés dans un fichier chiffré
 * plutôt que dans `localStorage`, dont la limite (quelques Mo) arrêtait sans
 * le dire un import ChatGPT ou Claude. Lecture synchrone : le préchargement
 * fournit les valeurs avant le premier script, comme pour le coffre. Hors
 * application (navigateur, essai), on garde `localStorage`, et sa limite.
 */

interface PontGrand {
  disponible: boolean;
  cles: string[];
  valeurs: Record<string, string>;
  poser: (cle: string, valeur: string | null) => Promise<boolean>;
}

/*
 * Une écriture refusée (processus principal sans ce canal, disque plein) : on
 * repasse au stockage du navigateur pour le reste de la séance, où la valeur
 * est encore (voir `lireGrand`).
 */
let enPanne = false;

function pont(): PontGrand | undefined {
  if (typeof window === "undefined" || enPanne) return undefined;
  const p = (window as unknown as { helix?: { grand?: PontGrand } }).helix?.grand;
  return p?.disponible && Array.isArray(p.cles) ? p : undefined;
}

const PREFIX = "helix:";
const valeurs: Record<string, string> = { ...(pont()?.valeurs ?? {}) };

/** Cette clé (sans préfixe) passe-t-elle par le grand stockage sur ce poste ? */
export function auGrand(cle: string): boolean {
  return Boolean(pont()?.cles.includes(cle));
}

/** Le poste a-t-il un grand stockage (application de bureau) ? */
export const grandStockageDisponible = (): boolean => pont() !== undefined;

export function lireGrand(cle: string): string | null {
  const v = valeurs[cle];
  if (v !== undefined) return v;
  /*
   * Rien encore dans le fichier : un poste qui vient d'une version où les
   * Chats étaient dans localStorage. On les reprend et on les range. La copie
   * du navigateur n'est libérée qu'une fois le fichier écrit, confirmé par le
   * processus principal : l'effacer avant, c'était parier les Chats sur une
   * écriture pas encore faite.
   */
  try {
    const ancien = localStorage.getItem(PREFIX + cle);
    if (ancien !== null) {
      valeurs[cle] = ancien;
      void ecrire(cle, ancien).then((ok) => {
        // Libérée seulement si personne n'a écrit entre-temps : sinon la copie du navigateur reste, par prudence.
        if (ok && valeurs[cle] === ancien) localStorage.removeItem(PREFIX + cle);
      });
      return ancien;
    }
  } catch {
    /* stockage local indisponible */
  }
  return null;
}

async function ecrire(cle: string, json: string | null): Promise<boolean> {
  const p = pont();
  if (!p) return false;
  try {
    if (await p.poser(cle, json)) return true;
  } catch {
    /* canal absent ou écriture impossible */
  }
  basculerVersLeNavigateur(cle);
  return false;
}

/** Le fichier ne prend plus : la valeur retourne dans le stockage du navigateur, et y reste. */
function basculerVersLeNavigateur(cle: string): void {
  enPanne = true;
  const v = valeurs[cle];
  try {
    if (v !== undefined) localStorage.setItem(PREFIX + cle, v);
  } catch {
    /* quota : la valeur reste au moins en mémoire pour la séance */
  }
}

export function ecrireGrand(cle: string, json: string | null): void {
  if (json === null) delete valeurs[cle];
  else valeurs[cle] = json;
  void ecrire(cle, json);
}
