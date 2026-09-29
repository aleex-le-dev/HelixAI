/**
 * La réflexion d'un modèle écrite dans le texte, entre `<think>` et `</think>`,
 * séparée de la réponse au fil du flux.
 *
 * Signalé par Medhi le 29/09/2026 : sous Windows, le Chat n'affichait ni la
 * réflexion ni son temps (« Réflexion en cours... 12 s », puis « Réflexion :
 * 12 s »), alors que le Mac les affiche. L'écran ne connaît que le canal
 * séparé (`reasoning_content`, ou `reasoning`, lus par `lireDelta`,
 * modelesCloud.ts). Un moteur qui ne sépare pas la réflexion la laisse dans le
 * texte : réglage de LM Studio (« séparer reasoning_content »), moteur ou
 * version qui ne reconnaît pas le gabarit du modèle, service compatible OpenAI
 * qui rend le texte brut (DeepSeek R1 chez plusieurs hébergeurs). La réflexion
 * arrivait alors dans le texte, que l'écran retirait tout entier à l'affichage
 * (MessageList.tsx, `sansMarqueursInternes`) : ni réflexion, ni temps, une
 * attente muette puis la réponse.
 *
 * Trois formes, toutes rendues comme le canal séparé :
 *  - `<think>…</think>réponse`, en tête du texte (espaces avant permis), les
 *    balises pouvant être coupées n'importe où entre deux morceaux du flux ;
 *  - `…</think>réponse`, sans balise ouvrante : le gabarit du modèle l'a déjà
 *    posée dans la question (Qwen3.5, Qwen3 « Thinking 2507 », DeepSeek R1
 *    distillés), et le modèle ne l'écrit pas. Ce cas ne se reconnaît qu'à la
 *    balise fermante : le texte déjà envoyé à l'écran comme réponse est alors
 *    requalifié (`requalifie`, le nombre de caractères concernés), et
 *    seulement si le modèle devait réfléchir (`fermetureSeule`), pour ne
 *    jamais prendre pour de la réflexion une réponse qui cite la balise ;
 *  - aucune balise : le texte passe tel quel, sans retard, sauf un début qui
 *    pourrait être celui de `<think>` (au plus sept caractères retenus).
 *
 * Une réflexion déjà reçue par le canal séparé (`canalSepare`) dit que le
 * moteur sépare : le texte qui suit est la réponse, jamais relu comme
 * réflexion. Seule une balise fermante égarée en tête est retirée.
 *
 * Un séparateur sert un seul appel au moteur : chaque tour d'une boucle
 * d'outils en prend un neuf (le modèle réfléchit avant chaque appel).
 */

const OUVRANTE = "<think>";
const FERMANTE = "</think>";

export interface MorceauSepare {
  /** Ce qui est réponse, à envoyer comme texte. */
  texte: string;
  /** Ce qui est réflexion, à envoyer comme `reasoning_content`. */
  reflexion: string;
  /**
   * Caractères déjà rendus comme texte par ce séparateur qui étaient en fait
   * de la réflexion (balise fermante seule) : à retirer de la fin du texte
   * reçu, et à ranger dans la réflexion, avant `reflexion`.
   */
  requalifie?: number;
}

/** Longueur du plus long suffixe de `s` qui est un début (strict) de `balise`. */
function debutDeBalise(s: string, balise: string): number {
  for (let n = Math.min(balise.length - 1, s.length); n > 0; n--) {
    if (balise.startsWith(s.slice(s.length - n))) return n;
  }
  return 0;
}

export class SeparateurReflexion {
  /**
   * « debut » : rien de décidé ; « dedans » : entre les balises ; « apres » :
   * la réponse ; « reponse » : la réponse, sa tête déjà passée.
   */
  private etat: "debut" | "dedans" | "apres" | "reponse" = "debut";
  /** Ce qui est retenu faute de pouvoir trancher (un morceau de balise). */
  private retenu = "";
  /** Caractères rendus comme texte pendant « debut » : requalifiables. */
  private rendusAuDebut = 0;
  /** Un premier caractère de réflexion a été rendu (entre les balises). */
  private reflexionVue = false;
  private readonly fermetureSeule: boolean;

  constructor(options: { fermetureSeule?: boolean } = {}) {
    this.fermetureSeule = Boolean(options.fermetureSeule);
  }

  /** Le moteur a envoyé de la réflexion par son canal séparé. */
  canalSepare(): void {
    if (this.etat === "debut" && this.rendusAuDebut === 0) this.etat = "apres";
  }

  ajouter(morceau: string): MorceauSepare {
    const sortie: MorceauSepare = { texte: "", reflexion: "" };
    let reste = this.retenu + morceau;
    this.retenu = "";
    // Chaque tour consomme du texte ou avance d'un état : la boucle finit toujours.
    while (reste) {
      if (this.etat === "reponse") {
        sortie.texte += reste;
        reste = "";
      } else if (this.etat === "debut") {
        if (this.rendusAuDebut === 0) {
          const tete = reste.trimStart();
          if (!tete || (tete.length < OUVRANTE.length && OUVRANTE.startsWith(tete))) {
            this.retenu = reste;
            reste = "";
            break;
          }
          if (tete.startsWith(OUVRANTE)) {
            this.etat = "dedans";
            reste = tete.slice(OUVRANTE.length);
            continue;
          }
          // Une balise fermante d'emblée : réflexion vide (Qwen3 sans réflexion, gabarit qui a ouvert).
          if (tete.startsWith(FERMANTE)) {
            this.etat = "apres";
            reste = tete.slice(FERMANTE.length);
            continue;
          }
          if (tete.length < FERMANTE.length && FERMANTE.startsWith(tete)) {
            this.retenu = reste;
            reste = "";
            break;
          }
        }
        if (!this.fermetureSeule) {
          this.etat = "reponse";
          continue;
        }
        const i = reste.indexOf(FERMANTE);
        if (i >= 0) {
          // Tout ce qui précède était la réflexion, y compris ce qui est déjà parti comme texte.
          if (this.rendusAuDebut > 0) sortie.requalifie = this.rendusAuDebut;
          sortie.reflexion += reste.slice(0, i);
          this.rendusAuDebut = 0;
          this.etat = "apres";
          reste = reste.slice(i + FERMANTE.length);
          continue;
        }
        const n = debutDeBalise(reste, FERMANTE);
        sortie.texte += reste.slice(0, reste.length - n);
        this.rendusAuDebut += reste.length - n;
        this.retenu = reste.slice(reste.length - n);
        reste = "";
      } else if (this.etat === "dedans") {
        // Le saut de ligne qui suit `<think>` n'est pas la réflexion (le canal séparé de LM Studio ne l'a pas non plus).
        if (!this.reflexionVue) {
          reste = reste.trimStart();
          if (!reste) break;
        }
        const i = reste.indexOf(FERMANTE);
        if (i >= 0) {
          sortie.reflexion += reste.slice(0, i);
          this.etat = "apres";
          reste = reste.slice(i + FERMANTE.length);
          continue;
        }
        const n = debutDeBalise(reste, FERMANTE);
        sortie.reflexion += reste.slice(0, reste.length - n);
        if (reste.length > n) this.reflexionVue = true;
        this.retenu = reste.slice(reste.length - n);
        reste = "";
      } else {
        // « apres » : les sauts de ligne qui suivent la balise, et une balise fermante égarée, ne sont pas la réponse.
        const tete = reste.trimStart();
        if (!tete || (tete.length < FERMANTE.length && FERMANTE.startsWith(tete))) {
          this.retenu = tete;
          reste = "";
          break;
        }
        if (tete.startsWith(FERMANTE)) {
          reste = tete.slice(FERMANTE.length);
          continue;
        }
        this.etat = "reponse";
        reste = tete;
      }
    }
    return sortie;
  }

  /** Fin du flux : ce qui était retenu est rendu à sa place. */
  finir(): MorceauSepare {
    const retenu = this.retenu;
    this.retenu = "";
    if (this.etat === "dedans") return { texte: "", reflexion: retenu };
    // Des espaces seuls, ou un bout de balise jamais complété, avant toute réponse : rien à dire.
    if ((this.etat === "debut" || this.etat === "apres") && this.rendusAuDebut === 0 && (!retenu.trim() || OUVRANTE.startsWith(retenu.trim()) || FERMANTE.startsWith(retenu.trim()))) {
      return { texte: "", reflexion: "" };
    }
    return { texte: retenu, reflexion: "" };
  }
}

/** Sépare un texte entier (réponse sans flux, essais) : réflexion et réponse. */
export function separerReflexion(texte: string, options: { fermetureSeule?: boolean } = {}): { texte: string; reflexion: string } {
  const s = new SeparateurReflexion(options);
  const a = s.ajouter(texte);
  const b = s.finir();
  return { texte: a.texte + b.texte, reflexion: a.reflexion + b.reflexion };
}
