/**
 * Fichiers joints à une question.
 *
 * Le fichier est lu **sur le poste** et son contenu part avec la question :
 * rien n'est déposé sur un serveur tiers, ce qui est tout l'intérêt d'une
 * plateforme locale.
 *
 * Deux natures très différentes :
 *  - un document (texte brut, PDF, Word, Excel, PowerPoint, OpenDocument)
 *    devient du contexte, ajouté à la question : son texte est extrait sur le
 *    poste (`documents.ts`) ;
 *  - une image doit être *vue*, ce que seul un modèle de vision sait faire.
 */

import { extraireTexteDetaille, DocumentIllisible, EXTENSIONS_DOCUMENTS, ANCIENS_FORMATS } from "./documents";
import { decoderTexte, ressembleATexte } from "./decodage";
import { EXTRACTION_MAX } from "./televersement";
import { t, tf, taille } from "@/lib/i18n";

/*
 * Ce qui borne vraiment une pièce jointe, ce n'est pas la taille du fichier,
 * c'est ce que le modèle peut lire d'un coup. L'écran en garde au plus
 * `CARACTERES_MAX` ; l'instance mesure ensuite la place du modèle chargé et
 * lit en parties ce qui ne tient pas (gateway/src/documentsJoints.ts,
 * 27/09/2026). Un fichier texte se lit donc quelle que soit sa taille (seul
 * son début est pris, et l'écran le dit) ; une photo trop grande est réduite,
 * pas refusée.
 */
/** Photo de téléphone, capture d'écran 5K : acceptées, puis réduites. */
const IMAGE_MAX = 50 * 1024 * 1024;
/** Côté le plus long d'une image envoyée au modèle : bien assez pour lire une capture. */
const IMAGE_COTE_MAX = 2048;
/** En deçà (poids et dimensions), l'image part telle quelle. */
const IMAGE_TELLE_QUELLE = 2 * 1024 * 1024;
/**
 * Documents de bureau : un PDF de 10 Mo peut ne contenir que quelques pages
 * de texte (images, polices). La limite qui compte est celle du texte extrait,
 * `CARACTERES_MAX` ; celle-ci ne borne que le temps de lecture sur le poste.
 */
const TAILLE_MAX_DOCUMENT = EXTRACTION_MAX;
/** Nombre de caractères repris d'un document : ~50 000 mots suffisent largement. */
const CARACTERES_MAX = 200_000;

const EXTENSIONS_TEXTE = [
  "txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "xml", "html",
  "htm", "css", "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "c",
  "h", "cpp", "cs", "php", "sh", "sql", "log", "ini", "conf", "env",
  // Ajoutées le 27/09/2026 : sous-titres, courriels enregistrés, LaTeX, scripts Windows, réglages.
  "srt", "vtt", "eml", "tex", "rtf", "toml", "bat", "cmd", "ps1", "vb", "lua", "r", "swift", "dart",
  "scala", "pl", "properties", "cfg", "gradle", "svg", "ics", "vcf", "jsonl", "ndjson",
];

export type Attachment =
  | { type: "texte"; nom: string; contenu: string; tronque: boolean; taille: number }
  | { type: "image"; nom: string; dataUrl: string; taille: number };

export interface AttachmentError {
  nom: string;
  raison: string;
}

const extension = (nom: string) => nom.split(".").pop()?.toLowerCase() ?? "";

/** Formats acceptés par le sélecteur de fichiers. */
export const ACCEPT = [
  ...EXTENSIONS_TEXTE.map((e) => `.${e}`),
  ...EXTENSIONS_DOCUMENTS.map((e) => `.${e}`),
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/*",
].join(",");

/** Un RTF est du texte balisé : on retire les commandes, il reste ce qu'on lit. */
function texteDuRtf(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, h: string) => new TextDecoder("windows-1252").decode(new Uint8Array([parseInt(h, 16)])))
    .replace(/\\u(-?\d+)\??/g, (_, n: string) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\\(par|line)\b ?/g, "\n")
    .replace(/\\tab\b ?/g, "\t")
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Lit les fichiers choisis. Les refus sont renvoyés à part : dire *pourquoi*
 * un fichier n'a pas été pris vaut mieux que de l'ignorer en silence.
 */
export async function lireFichiers(
  fichiers: File[],
): Promise<{ pieces: Attachment[]; erreurs: AttachmentError[] }> {
  const pieces: Attachment[] = [];
  const erreurs: AttachmentError[] = [];

  for (const fichier of fichiers) {
    const ext = extension(fichier.name);

    if (ANCIENS_FORMATS[ext]) {
      erreurs.push({
        nom: fichier.name,
        raison: tf("ancien format {0}, non lu : enregistrez-le au format actuel (.{1}x) puis rejoignez-le", ANCIENS_FORMATS[ext], ext),
      });
      continue;
    }

    if (EXTENSIONS_DOCUMENTS.includes(ext) || fichier.type === "application/pdf") {
      if (fichier.size > TAILLE_MAX_DOCUMENT) {
        erreurs.push({
          nom: fichier.name,
          raison: tf("trop volumineux ({0}, maximum {1})", taille(fichier.size), taille(TAILLE_MAX_DOCUMENT)),
        });
        continue;
      }
      try {
        const { texte: brut, coupe } = await extraireTexteDetaille(fichier, ext || "pdf");
        pieces.push({
          type: "texte",
          nom: fichier.name,
          contenu: brut.slice(0, CARACTERES_MAX),
          tronque: coupe || brut.length > CARACTERES_MAX,
          taille: fichier.size,
        });
      } catch (err) {
        erreurs.push({
          nom: fichier.name,
          raison: err instanceof DocumentIllisible ? err.message : t("document illisible"),
        });
      }
      continue;
    }

    // Par le type, ou par l'extension quand le système n'en donne pas (fréquent sous Windows).
    const image = (fichier.type.startsWith("image/") && !/svg/.test(fichier.type)) || (!fichier.type && ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext));
    if (image) {
      if (fichier.size > IMAGE_MAX) {
        erreurs.push({
          nom: fichier.name,
          raison: tf("image trop lourde ({0}, maximum {1})", taille(fichier.size), taille(IMAGE_MAX)),
        });
        continue;
      }
      try {
        pieces.push({ type: "image", nom: fichier.name, dataUrl: await imagePourLeModele(fichier), taille: fichier.size });
      } catch {
        erreurs.push({
          nom: fichier.name,
          raison: t("image illisible (formats lus : PNG, JPEG, WebP, GIF). Une photo HEIC d'iPhone se convertit en JPEG avant d'être jointe."),
        });
      }
      continue;
    }

    try {
      // Seul le début est lu : un journal de 2 Go n'a pas à passer par la mémoire pour en garder 200 000 caractères.
      const debut = fichier.slice(0, CARACTERES_MAX * 4);
      const octets = new Uint8Array(await debut.arrayBuffer());
      /*
       * Extension inconnue, ou rien que Windows ne sache nommer (il donne
       * souvent un type vide) : on regarde les octets. Du texte est pris,
       * quel que soit son nom ; un binaire est refusé en le disant.
       */
      const connu = EXTENSIONS_TEXTE.includes(ext) || fichier.type.startsWith("text/");
      if (!connu && !ressembleATexte(octets)) {
        erreurs.push({
          nom: fichier.name,
          raison: t("format non pris en charge (texte, PDF, Word, Excel, PowerPoint, OpenDocument et images)"),
        });
        continue;
      }
      const coupe = fichier.size > debut.size;
      let brut = decoderTexte(octets, coupe);
      if (ext === "rtf" || brut.startsWith("{\\rtf")) brut = texteDuRtf(brut);
      if (!brut.trim()) {
        erreurs.push({ nom: fichier.name, raison: t("fichier vide") });
        continue;
      }
      pieces.push({
        type: "texte",
        nom: fichier.name,
        contenu: brut.slice(0, CARACTERES_MAX),
        tronque: brut.length > CARACTERES_MAX || coupe,
        taille: fichier.size,
      });
    } catch {
      erreurs.push({ nom: fichier.name, raison: t("fichier illisible") });
    }
  }

  return { pieces, erreurs };
}

/**
 * L'image telle que le modèle la verra : inchangée si elle est raisonnable,
 * sinon réduite à 2048 pixels de côté et réencodée en JPEG. Une photo de 12 Mo
 * était refusée ; elle part désormais en quelques centaines de kilo-octets,
 * sans perte visible pour la lecture d'un document ou d'une capture.
 */
async function imagePourLeModele(fichier: File): Promise<string> {
  const image = await createImageBitmap(fichier);
  try {
    const plusGrand = Math.max(image.width, image.height);
    if (fichier.size <= IMAGE_TELLE_QUELLE && plusGrand <= IMAGE_COTE_MAX) return await enDataUrl(fichier);
    const echelle = Math.min(1, IMAGE_COTE_MAX / plusGrand);
    const largeur = Math.max(1, Math.round(image.width * echelle));
    const hauteur = Math.max(1, Math.round(image.height * echelle));
    const toile = document.createElement("canvas");
    toile.width = largeur;
    toile.height = hauteur;
    const ctx = toile.getContext("2d");
    if (!ctx) throw new Error("dessin impossible");
    // Le JPEG n'a pas de transparence : fond blanc, comme sur une page.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.drawImage(image, 0, 0, largeur, hauteur);
    return toile.toDataURL("image/jpeg", 0.85);
  } finally {
    image.close();
  }
}

function enDataUrl(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(new Error("lecture impossible"));
    lecteur.readAsDataURL(fichier);
  });
}

/** Un document tel qu'il part avec la question, et tel que l'écran le garde pour les questions suivantes. */
export interface DocumentEnvoye {
  nom: string;
  contenu: string;
  tronque: boolean;
}

/**
 * Un document dans sa balise, longueur écrite (27/09/2026). L'instance le
 * reconnaît sans ambiguïté, même quand le fichier contient lui-même
 * « </document> », mesure la place qu'il prendra et le lit en parties s'il ne
 * tient pas (gateway/src/documentsJoints.ts). Une instance plus ancienne le
 * transmet tel quel : balisé, avec son nom, le modèle le lit aussi.
 */
export function enveloppe(d: DocumentEnvoye): string {
  const nom = d.nom.replace(/["<>\n\r]/g, "'").slice(0, 300);
  return `<document nom="${nom}" caracteres="${d.contenu.length}"${d.tronque ? ` coupe="oui"` : ""}>\n${d.contenu}\n</document>`;
}

/** Les documents texte des pièces jointes. */
export function documentsDe(pieces: Attachment[]): DocumentEnvoye[] {
  return pieces
    .filter((p): p is Extract<Attachment, { type: "texte" }> => p.type === "texte")
    .map((d) => ({ nom: d.nom, contenu: d.contenu, tronque: d.tronque }));
}

/** Les documents, mis en forme pour être ajoutés à la question. */
export function contexteTexte(documents: DocumentEnvoye[]): string {
  return documents.map(enveloppe).join("\n\n");
}

export const images = (pieces: Attachment[]) =>
  pieces.filter((p): p is Extract<Attachment, { type: "image" }> => p.type === "image");
