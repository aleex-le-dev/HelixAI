import { FileCode, FileImage, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import type { PieceMontree } from "@/hooks/useChat";
import { t, taille } from "@/lib/i18n";

/**
 * Les fichiers joints à une question, montrés dans le message de la personne.
 *
 * Demandé par Medhi le 27/09/2026 : « quand on insère un document avec un
 * message, on ne voit pas le document inséré comme une pièce jointe ». Le
 * message n'affichait que le texte tapé ; rien ne disait qu'un fichier était
 * parti avec, ni s'il avait été lu en entier. Une petite carte par fichier :
 * l'icône de son type, son nom, son poids, et « lu en entier » ou « début
 * seulement ». Gardées avec le Chat (sessions.ts), elles restent quand on le
 * rouvre.
 */

const TABLEURS = ["xlsx", "xls", "ods", "csv", "tsv"];
const PRESENTATIONS = ["pptx", "ppt", "odp"];
const CODE = ["js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "cs", "php", "sh", "sql", "json", "yaml", "yml", "xml", "html", "htm", "css", "ps1", "bat", "cmd", "lua", "swift", "dart", "scala", "toml"];

function Icone({ piece }: { piece: PieceMontree }) {
  const ext = piece.nom.split(".").pop()?.toLowerCase() ?? "";
  const props = { size: 18, strokeWidth: 1.6, className: "shrink-0 text-muted-foreground" } as const;
  if (piece.type === "image") return <FileImage {...props} />;
  if (TABLEURS.includes(ext)) return <FileSpreadsheet {...props} />;
  if (PRESENTATIONS.includes(ext)) return <Presentation {...props} />;
  if (CODE.includes(ext)) return <FileCode {...props} />;
  return <FileText {...props} />;
}

export function PiecesJointesMessage({ pieces }: { pieces: PieceMontree[] }) {
  if (pieces.length === 0) return null;
  return (
    <ul className="flex max-w-full flex-wrap justify-end gap-2" aria-label={t("Pièces jointes")}>
      {pieces.map((piece, i) => {
        const etat =
          piece.type === "image" ? t("image") : piece.tronque ? t("début seulement") : t("lu en entier");
        const details = [typeof piece.taille === "number" ? taille(piece.taille) : "", etat].filter(Boolean).join(" · ");
        return (
          <li
            key={`${piece.nom}-${i}`}
            className="flex w-[220px] max-w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2"
            title={
              piece.tronque
                ? t("Trop long pour être lu en entier : seul son début (environ 200 000 caractères) est parti avec la question. Pour un long document, déposez-le dans Fichiers : l'assistant y cherche et le lit par passages.")
                : piece.nom
            }
          >
            <Icone piece={piece} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{piece.nom}</span>
              <span className="block truncate text-xs text-muted-foreground">{details}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
