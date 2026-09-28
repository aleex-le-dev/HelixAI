import { inflateRawSync } from "node:zlib";

/**
 * Borne de décompression par entrée, contre les bombes ZIP (test d'intrusion du
 * 27/09/2026). Un .docx de 400 Ko dont `word/document.xml` est un long run
 * d'un même octet gonflait à des centaines de Mo (ratio ~1000:1) : `inflateRawSync`
 * allouait tout avant qu'on ne coupe à 1 000 caractères, de quoi épuiser la
 * mémoire de la passerelle. On ne lit de toute façon que le début du document ;
 * 16 Mo laissent passer un vrai document volumineux, et une entrée qui dépasse
 * fait lever `inflateRawSync` (rattrapé plus bas : l'entrée est alors ignorée).
 */
const DECOMPRESSION_MAX = 16 * 1024 * 1024;
/** Pour toute l'archive, tous noms confondus (voir `lireZip`). */
const DECOMPRESSION_TOTALE = 32 * 1024 * 1024;

/**
 * Relit un document bureautique enregistré par l'agent, sur le poste même :
 * le texte d'un .docx, les cellules d'un .xlsx (« A1=valeur », formule
 * comprise). Même sortie que le script de relecture du bureau Linux
 * (computer.ts, RELECTURE), qui tourne dans la machine avec son Python.
 *
 * Pour la machine macOS, Python n'est pas garanti (celui de macOS ouvre une
 * fenêtre d'installation dans la machine s'il manque) : le fichier est de
 * toute façon dans le dossier d'échange du poste, on le lit donc ici.
 */

/**
 * Les fichiers d'une archive ZIP (hors ZIP64 : un document de bureau n'en a pas besoin).
 * Sert aussi à lire un document Word de OneDrive ou SharePoint (natifs/microsoft.ts), même borne.
 */
export function lireZip(buf: Buffer, voulus: string[]): Map<string, string> {
  const sortie = new Map<string, string>();
  /*
   * Chaque nom voulu n'est décompressé qu'une fois, la lecture s'arrête quand
   * ils le sont tous, et la décompression est bornée au total, pas seulement
   * par entrée. Tournée des connecteurs du 28/09/2026 : un .docx de 4 Mo dont
   * le répertoire central répète 65 535 fois « word/document.xml », chaque
   * fois vers la même entrée qui gonfle à 16 Mo, faisait décompresser
   * 65 535 × 16 Mo dans le seul fil de la passerelle (une demi-heure environ,
   * estimée) ; il suffisait de le déposer dans un OneDrive ou un SharePoint
   * partagé et qu'un agent le lise.
   */
  const restants = new Set(voulus);
  let budget = DECOMPRESSION_TOTALE;
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return sortie;
  const nombre = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  for (let n = 0; n < nombre && restants.size > 0 && budget > 0 && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const methode = buf.readUInt16LE(p + 10);
    const taille = buf.readUInt32LE(p + 20);
    const lNom = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lCommentaire = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString("utf8", p + 46, p + 46 + lNom);
    p += 46 + lNom + lExtra + lCommentaire;
    if (!restants.has(nom)) continue;
    // Le premier exemplaire seulement, lisible ou non : un doublon ne se décompresse jamais.
    restants.delete(nom);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const donnees = buf.subarray(debut, debut + taille);
    const plafond = Math.min(DECOMPRESSION_MAX, budget);
    try {
      const clair = methode === 8 ? inflateRawSync(donnees, { maxOutputLength: plafond }) : donnees.subarray(0, plafond);
      budget -= clair.length;
      sortie.set(nom, clair.toString("utf8"));
    } catch {
      /* entrée illisible, ou au-delà de la borne : ignorée */
      budget -= plafond;
    }
  }
  return sortie;
}

const sansBalises = (xml: string) => xml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).join(" ");
const entites = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function relireDocument(buf: Buffer): string {
  const z = lireZip(buf, ["word/document.xml", "xl/worksheets/sheet1.xml", "xl/sharedStrings.xml"]);
  const lignes: string[] = [];
  const doc = z.get("word/document.xml");
  if (doc) lignes.push(entites(sansBalises(doc)).slice(0, 1000));
  const feuille = z.get("xl/worksheets/sheet1.xml");
  if (feuille) {
    const partages = [...(z.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      entites([...m[1]!.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join("")),
    );
    const cases: string[] = [];
    /*
     * Une cellule vide mais mise en forme s'écrit fermée sur elle-même
     * (« <c r="A1" s="1"/> »). L'ancienne expression la prenait pour une
     * ouverture et avalait la cellule suivante : « A1=valeur de B1 », et B1
     * disparaissait de la relecture. Les cellules fermées sur elles-mêmes sont
     * reconnues, et sautées (elles n'ont pas de valeur).
     */
    for (const m of feuille.matchAll(/<c r="([A-Z]+[0-9]+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, corps] = m;
      if (corps === undefined) continue;
      const f = /<f[^>]*>([^<]*)<\/f>/.exec(corps!);
      let v = /<v>([^<]*)<\/v>/.exec(corps!)?.[1] ?? "";
      if (attrs!.includes('t="s"') && v) v = partages[Number(v)] ?? v;
      cases.push(`${ref}=${f ? `=${entites(f[1]!)} -> ` : ""}${entites(v)}`);
    }
    lignes.push(cases.join("; ").slice(0, 1000));
  }
  return lignes.join("\n");
}
