import { inflateRawSync } from "node:zlib";

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

/** Les fichiers d'une archive ZIP (hors ZIP64 : un document de bureau n'en a pas besoin). */
function lireZip(buf: Buffer, voulus: string[]): Map<string, string> {
  const sortie = new Map<string, string>();
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
  for (let n = 0; n < nombre && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const methode = buf.readUInt16LE(p + 10);
    const taille = buf.readUInt32LE(p + 20);
    const lNom = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lCommentaire = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString("utf8", p + 46, p + 46 + lNom);
    p += 46 + lNom + lExtra + lCommentaire;
    if (!voulus.includes(nom) || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const donnees = buf.subarray(debut, debut + taille);
    try {
      sortie.set(nom, (methode === 8 ? inflateRawSync(donnees) : donnees).toString("utf8"));
    } catch {
      /* entrée illisible : ignorée */
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
    for (const m of feuille.matchAll(/<c r="([A-Z]+[0-9]+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const [, ref, attrs, corps] = m;
      const f = /<f[^>]*>([^<]*)<\/f>/.exec(corps!);
      let v = /<v>([^<]*)<\/v>/.exec(corps!)?.[1] ?? "";
      if (attrs!.includes('t="s"') && v) v = partages[Number(v)] ?? v;
      cases.push(`${ref}=${f ? `=${entites(f[1]!)} -> ` : ""}${entites(v)}`);
    }
    lignes.push(cases.join("; ").slice(0, 1000));
  }
  return lignes.join("\n");
}
