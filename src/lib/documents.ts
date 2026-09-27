import { t, tf } from "@/lib/i18n";
/**
 * Texte des documents de bureau, extrait sur le poste.
 *
 * Le « + » du composeur n'acceptait que du texte brut et des images : un PDF,
 * un devis Word ou un tableau Excel, c'est-à-dire l'essentiel des documents
 * d'une PME, étaient refusés. On en extrait ici le texte, dans la page, sans
 * rien envoyer ailleurs.
 *
 *  - **PDF** : pdf.js (Mozilla, Apache 2.0), chargé seulement quand un PDF est
 *    joint. Il tourne dans la page elle-même (pas de Worker), ce qui évite les
 *    restrictions des workers sous `file://` dans l'application livrée.
 *  - **Word, Excel, PowerPoint, OpenDocument** : ce sont des archives zip de
 *    XML. Le navigateur sait décompresser (`DecompressionStream`) et lire le
 *    XML (`DOMParser`) : aucune bibliothèque n'est nécessaire.
 *
 * Ce qui n'est pas lu, et le dit : les PDF scannés (des images, sans texte),
 * les PDF protégés par mot de passe, les anciens formats binaires (.doc, .xls,
 * .ppt).
 */

/** Taille décompressée maximale d'un fichier d'une archive : borne les « bombes zip ». */
const DECOMPRESSE_MAX = 40 * 1024 * 1024;
/** Au-delà, on n'en lit pas plus : le texte serait de toute façon tronqué. */
const PAGES_PDF_MAX = 300;
const LIGNES_TABLEUR_MAX = 5000;

export const EXTENSIONS_DOCUMENTS = ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp"];
export const ANCIENS_FORMATS: Record<string, string> = {
  doc: "Word 97-2003",
  xls: "Excel 97-2003",
  ppt: "PowerPoint 97-2003",
};

export class DocumentIllisible extends Error {}

export async function extraireTexte(fichier: File, ext: string): Promise<string> {
  return (await extraireTexteDetaille(fichier, ext)).texte;
}

/**
 * Le texte, et si la lecture s'est arrêtée avant la fin (plus de 300 pages,
 * plus de 5 000 lignes par feuille) : la pièce jointe le montre alors comme
 * « début seulement » au lieu de « lu en entier » (27/09/2026).
 */
export async function extraireTexteDetaille(fichier: File, ext: string): Promise<{ texte: string; coupe: boolean }> {
  const etat = { coupe: false };
  const texte = await lireSelonFormat(fichier, ext, etat);
  return { texte, coupe: etat.coupe };
}

async function lireSelonFormat(fichier: File, ext: string, etat: { coupe: boolean }): Promise<string> {
  const octets = new Uint8Array(await fichier.arrayBuffer());
  switch (ext) {
    case "pdf":
      return lirePdf(octets, etat);
    case "docx":
      return lireDocx(await ouvrirZip(octets));
    case "xlsx":
      return lireXlsx(await ouvrirZip(octets), etat);
    case "pptx":
      return lirePptx(await ouvrirZip(octets));
    case "odt":
    case "ods":
    case "odp":
      return lireOpenDocument(await ouvrirZip(octets));
    default:
      throw new DocumentIllisible(t("format non pris en charge"));
  }
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

async function lirePdf(octets: Uint8Array, etat: { coupe: boolean }): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  /*
   * Sans Worker : pdf.js se rabat sur un traitement dans la page s'il trouve
   * son module de travail déjà chargé. Plus lent de quelques instants sur un
   * gros document, mais sans dépendre des règles des workers sous `file://`.
   */
  const g = globalThis as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");

  const chargement = pdfjs.getDocument({
    data: octets,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
  });
  let pdf;
  try {
    pdf = await chargement.promise;
  } catch (err) {
    const nom = (err as { name?: string }).name;
    if (nom === "PasswordException") throw new DocumentIllisible(t("PDF protégé par un mot de passe"));
    throw new DocumentIllisible(t("PDF illisible ou endommagé"));
  }

  const pages: string[] = [];
  const nombrePages = pdf.numPages;
  const total = Math.min(nombrePages, PAGES_PDF_MAX);
  for (let n = 1; n <= total; n++) {
    const page = await pdf.getPage(n);
    const contenu = await page.getTextContent();
    let texte = "";
    for (const item of contenu.items) {
      if (!("str" in item)) continue;
      texte += item.str;
      texte += item.hasEOL ? "\n" : " ";
    }
    pages.push(`## Page ${n}\n${texte.replace(/[ \t]+\n/g, "\n").trim()}`);
  }
  await chargement.destroy();

  const utile = pages.join("").replace(/## Page \d+/g, "").replace(/\s/g, "");
  if (utile.length < 20 * total) {
    throw new DocumentIllisible(
      t("PDF sans texte lisible : c'est probablement un document scanné (des images de pages), que la lecture de texte ne peut pas traiter"),
    );
  }
  if (nombrePages > PAGES_PDF_MAX) {
    etat.coupe = true;
    pages.push(tf("(Lecture arrêtée à la page {0} sur {1}.)", PAGES_PDF_MAX, nombrePages));
  }
  return pages.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Archives zip                                                        */
/* ------------------------------------------------------------------ */

type Zip = Map<string, () => Promise<string>>;

/** Lit l'annuaire central d'une archive zip ; chaque entrée se décompresse à la demande. */
async function ouvrirZip(octets: Uint8Array): Promise<Zip> {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  // Fin de l'annuaire central : signature 0x06054b50, dans les 64 Ko de fin.
  let fin = -1;
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 65_557); i--) {
    if (vue.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new DocumentIllisible(t("fichier endommagé ou qui n'est pas un document Office"));

  const nombre = vue.getUint16(fin + 10, true);
  let pos = vue.getUint32(fin + 16, true);
  const decodeur = new TextDecoder();
  const entrees: Zip = new Map();

  for (let i = 0; i < nombre && pos + 46 <= octets.length; i++) {
    if (vue.getUint32(pos, true) !== 0x02014b50) break;
    const methode = vue.getUint16(pos + 10, true);
    const tailleCompressee = vue.getUint32(pos + 20, true);
    const longueurNom = vue.getUint16(pos + 28, true);
    const longueurExtra = vue.getUint16(pos + 30, true);
    const longueurCommentaire = vue.getUint16(pos + 32, true);
    const decalageLocal = vue.getUint32(pos + 42, true);
    const nom = decodeur.decode(octets.subarray(pos + 46, pos + 46 + longueurNom));
    pos += 46 + longueurNom + longueurExtra + longueurCommentaire;

    entrees.set(nom, async () => {
      const nomLocal = vue.getUint16(decalageLocal + 26, true);
      const extraLocal = vue.getUint16(decalageLocal + 28, true);
      const debut = decalageLocal + 30 + nomLocal + extraLocal;
      const donnees = octets.subarray(debut, debut + tailleCompressee);
      if (methode === 0) return decodeur.decode(donnees);
      if (methode !== 8) throw new DocumentIllisible(t("compression non prise en charge"));
      return decodeur.decode(await inflate(donnees));
    });
  }
  return entrees;
}

async function inflate(donnees: Uint8Array): Promise<Uint8Array> {
  // `slice()` : une copie adossée à un ArrayBuffer ordinaire, ce qu'exige Blob.
  const flux = new Blob([donnees.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const lecteur = flux.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > DECOMPRESSE_MAX) {
      await lecteur.cancel();
      throw new DocumentIllisible(t("document trop volumineux une fois décompressé"));
    }
    morceaux.push(value);
  }
  const sortie = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) {
    sortie.set(m, i);
    i += m.length;
  }
  return sortie;
}

async function lireXml(zip: Zip, chemin: string): Promise<Document | null> {
  const entree = zip.get(chemin);
  if (!entree) return null;
  const doc = new DOMParser().parseFromString(await entree(), "application/xml");
  return doc.getElementsByTagName("parsererror").length > 0 ? null : doc;
}

/** Éléments par nom local, quel que soit le préfixe d'espace de noms (w:, a:, text:...). */
const parNom = (racine: Document | Element, nom: string): Element[] =>
  Array.from(racine.getElementsByTagNameNS("*", nom));

/* ------------------------------------------------------------------ */
/* Word                                                                */
/* ------------------------------------------------------------------ */

async function lireDocx(zip: Zip): Promise<string> {
  const doc = await lireXml(zip, "word/document.xml");
  if (!doc) throw new DocumentIllisible(t("ce fichier Word ne contient pas de texte lisible"));
  const corps = parNom(doc, "body")[0] ?? doc.documentElement;
  const lignes: string[] = [];

  const texteParagraphe = (p: Element) => {
    let t = "";
    const parcourir = (n: Node) => {
      if (n.nodeType !== 1) return;
      const e = n as Element;
      if (e.localName === "t") t += e.textContent ?? "";
      else if (e.localName === "tab") t += "\t";
      else if (e.localName === "br" || e.localName === "cr") t += "\n";
      else for (const enfant of Array.from(e.childNodes)) parcourir(enfant);
    };
    parcourir(p);
    return t;
  };

  /*
   * Les blocs, à toute profondeur (27/09/2026) : un document fait d'un modèle
   * range souvent son contenu dans des contrôles (`w:sdt`, page de garde,
   * table des matières, formulaires) ou des balises personnalisées. Seuls les
   * enfants directs du corps étaient lus : leur texte manquait, et un devis
   * fait d'un modèle pouvait arriver presque vide.
   */
  const lireBlocs = (parent: Element) => {
    for (const bloc of Array.from(parent.children)) {
      if (bloc.localName === "p") lignes.push(texteParagraphe(bloc));
      else if (bloc.localName === "tbl") {
        for (const ligne of parNom(bloc, "tr")) {
          const cellules = parNom(ligne, "tc").map((c) => parNom(c, "p").map(texteParagraphe).join(" ").trim());
          lignes.push(cellules.join(" | "));
        }
      } else if (bloc.localName !== "sectPr") lireBlocs(bloc);
    }
  };
  lireBlocs(corps);
  const texte = lignes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!texte) throw new DocumentIllisible(t("ce fichier Word ne contient pas de texte lisible"));
  return texte;
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

async function lireXlsx(zip: Zip, etat: { coupe: boolean }): Promise<string> {
  const partages: string[] = [];
  const ss = await lireXml(zip, "xl/sharedStrings.xml");
  if (ss) for (const si of parNom(ss, "si")) partages.push(parNom(si, "t").map((t) => t.textContent ?? "").join(""));

  // Noms des feuilles, dans l'ordre du classeur, reliés à leurs fichiers.
  const classeur = await lireXml(zip, "xl/workbook.xml");
  const liens = await lireXml(zip, "xl/_rels/workbook.xml.rels");
  const cibles = new Map<string, string>();
  if (liens) {
    for (const r of parNom(liens, "Relationship")) {
      cibles.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
    }
  }
  const feuilles = classeur
    ? parNom(classeur, "sheet").map((s) => {
        const id = s.getAttribute("r:id") ?? s.getAttributeNS("*", "id") ?? "";
        const cible = (cibles.get(id) ?? "").replace(/^\/?xl\//, "");
        return { nom: s.getAttribute("name") ?? "Feuille", chemin: `xl/${cible}` };
      })
    : [];

  const sorties: string[] = [];
  for (const feuille of feuilles) {
    const doc = await lireXml(zip, feuille.chemin);
    if (!doc) continue;
    const lignes: string[] = [];
    const toutes = parNom(doc, "row");
    for (const ligne of toutes.slice(0, LIGNES_TABLEUR_MAX)) {
      /*
       * Chaque valeur à sa colonne (27/09/2026) : Excel n'écrit pas les
       * cellules vides, et les valeurs se tassaient à gauche. Une ligne
       * « Dupont ; ; 1 200 » devenait « Dupont ; 1 200 », le montant passait
       * dans la mauvaise colonne. La référence de la cellule (« C5 ») dit où
       * elle est.
       */
      const valeurs: string[] = [];
      for (const c of parNom(ligne, "c")) {
        const type = c.getAttribute("t");
        const valeur =
          type === "s"
            ? (partages[Number(parNom(c, "v")[0]?.textContent ?? -1)] ?? "")
            : type === "inlineStr"
              ? parNom(c, "t").map((t) => t.textContent ?? "").join("")
              : (parNom(c, "v")[0]?.textContent ?? "");
        const lettres = /^([A-Z]+)\d*$/.exec(c.getAttribute("r") ?? "")?.[1];
        const colonne = lettres ? [...lettres].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1 : valeurs.length;
        if (colonne > 16_384) continue;
        while (valeurs.length < colonne) valeurs.push("");
        valeurs[colonne] = valeur;
      }
      if (valeurs.some((v) => v !== "")) lignes.push(valeurs.join(" ; "));
    }
    if (toutes.length > LIGNES_TABLEUR_MAX) etat.coupe = true;
    if (toutes.length > LIGNES_TABLEUR_MAX) lignes.push(tf("(Lecture arrêtée à la ligne {0} sur {1}.)", LIGNES_TABLEUR_MAX, toutes.length));
    sorties.push(`## Feuille « ${feuille.nom} »\n${lignes.join("\n")}`);
  }
  if (sorties.length === 0) throw new DocumentIllisible(t("ce classeur Excel ne contient pas de feuille lisible"));
  return sorties.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* PowerPoint                                                          */
/* ------------------------------------------------------------------ */

async function lirePptx(zip: Zip): Promise<string> {
  const diapositives = [...zip.keys()]
    .map((nom) => ({ nom, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(nom)?.[1]) }))
    .filter((d) => Number.isFinite(d.n))
    .sort((a, b) => a.n - b.n);
  const sorties: string[] = [];
  for (const d of diapositives) {
    const doc = await lireXml(zip, d.nom);
    if (!doc) continue;
    const paragraphes = parNom(doc, "p")
      .map((p) => parNom(p, "t").map((t) => t.textContent ?? "").join(""))
      .filter((t) => t.trim());
    sorties.push(`## Diapositive ${d.n}\n${paragraphes.join("\n")}`);
  }
  if (sorties.length === 0) throw new DocumentIllisible(t("cette présentation ne contient pas de texte lisible"));
  return sorties.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* OpenDocument (LibreOffice)                                          */
/* ------------------------------------------------------------------ */

async function lireOpenDocument(zip: Zip): Promise<string> {
  const doc = await lireXml(zip, "content.xml");
  if (!doc) throw new DocumentIllisible(t("ce document ne contient pas de texte lisible"));
  const lignes: string[] = [];
  const tableaux = parNom(doc, "table");
  if (tableaux.length > 0 && parNom(doc, "spreadsheet").length > 0) {
    for (const t of tableaux) {
      lignes.push(`## Feuille « ${t.getAttributeNS("*", "name") ?? t.getAttribute("table:name") ?? ""} »`);
      for (const r of parNom(t, "table-row").slice(0, LIGNES_TABLEUR_MAX)) {
        const v = parNom(r, "table-cell").map((c) => (c.textContent ?? "").trim());
        if (v.some((x) => x)) lignes.push(v.join(" ; "));
      }
    }
  } else {
    for (const p of [...parNom(doc, "h"), ...parNom(doc, "p")].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )) {
      lignes.push(p.textContent ?? "");
    }
  }
  const texte = lignes.join("\n").trim();
  if (!texte) throw new DocumentIllisible(t("ce document ne contient pas de texte lisible"));
  return texte;
}
