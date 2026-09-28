import { createElement, useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  MARQUES,
  type CleMarque,
  type DessinMarque,
  type Marque,
  type NoeudMarque,
} from "@/components/ui/marques";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/**
 * Tuile d'un service, dans la grille des connexions.
 *
 * L'écran précédent alignait des paragraphes : chaque service portait son
 * protocole, sa compatibilité et ses conditions en toutes lettres, avant même
 * qu'on ait choisi de le brancher. On ne lisait plus rien.
 *
 * Une tuile dit trois choses, et pas une de plus : de quel service il s'agit,
 * à quoi il sert en une ligne, et s'il est branché. Le détail n'apparaît qu'au
 * clic, quand il devient utile.
 */

export interface TuileServiceProps {
  /** Marque officielle, quand elle existe. */
  marque?: CleMarque;
  /** Icône neutre, pour les services sans marque utilisable. */
  icone?: LucideIcon;
  nom: string;
  /** Une ligne, pas deux. */
  resume: string;
  etat: "connecte" | "disponible" | "a-venir";
  /** Motif affiché au survol quand le service n'est pas encore branchable. */
  motif?: string;
  onClick?: () => void;
  actif?: boolean;
}

/**
 * Rend un nœud du dessin officiel. Les identifiants (dégradés, découpes)
 * reçoivent le préfixe du dessin : deux logos Canva sur la même page, ou le
 * même logo en clair et en sombre, se volaient sinon leurs dégradés, le
 * navigateur ne retenant que le premier `id` du document.
 */
function rendreNoeud(noeud: NoeudMarque, prefixe: string, cle: number): ReactNode {
  const [balise, attributs, enfants] = noeud;
  const props: Record<string, string | number> = { key: cle };
  for (const [nom, valeur] of Object.entries(attributs)) {
    props[nom] =
      nom === "id" ? prefixe + valeur : prefixe ? valeur.replace(/url\(#/g, `url(#${prefixe}`) : valeur;
  }
  return createElement(balise, props, enfants?.map((e, i) => rendreNoeud(e, prefixe, i)));
}

function Dessin({
  dessin,
  taille,
  classe,
}: {
  dessin: DessinMarque;
  taille: number;
  classe?: string;
}) {
  // useId donne « :r1: » : les deux-points sont valides dans un id mais pas
  // dans `url(#…)` sans échappement, d'où leur retrait.
  const prefixe = useId().replace(/:/g, "") + "-";
  return (
    <svg
      viewBox={dessin.viewBox}
      width={taille}
      height={taille}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", classe)}
    >
      {dessin.corps.map((n, i) => rendreNoeud(n, dessin.ids ? prefixe : "", i))}
    </svg>
  );
}

/**
 * Logo d'une marque, tel que la société le publie, en couleur.
 *
 * Deux dessins quand la marque en livre deux : le logo pour fond clair et
 * celui pour fond sombre (GitHub, X, Vercel, Linear… passent au blanc). Les
 * deux sont posés et le thème choisit, par CSS (`.marque-claire`,
 * `.marque-sombre` dans styles/index.css) : lire le thème en JavaScript aurait
 * laissé le mauvais logo affiché le temps d'un rendu après chaque bascule.
 *
 * Exporté : la liste des connecteurs, le sélecteur de modèles et les clés
 * d'API affichent les mêmes logos, et deux dessins du même logo finiraient par
 * diverger.
 */
export function LogoMarque({
  marque,
  icone: Icone,
  taille = 22,
}: {
  marque?: CleMarque;
  icone?: LucideIcon;
  taille?: number;
}) {
  if (marque) {
    const m: Marque = MARQUES[marque];
    if (!m.sombre) return <Dessin dessin={m.clair} taille={taille} />;
    return (
      <>
        <Dessin dessin={m.clair} taille={taille} classe="marque-claire" />
        <Dessin dessin={m.sombre} taille={taille} classe="marque-sombre" />
      </>
    );
  }
  if (Icone) {
    return <Icone size={taille} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />;
  }
  return null;
}

const PASTILLE: Record<TuileServiceProps["etat"], { texte: string; classe: string }> = {
  connecte: { texte: t("Connecté"), classe: "bg-success/15 text-foreground" },
  disponible: { texte: t("Connecter"), classe: "bg-muted text-muted-foreground" },
  "a-venir": { texte: t("À venir"), classe: "bg-muted text-muted-foreground/70" },
};

export function TuileService({
  marque,
  icone,
  nom,
  resume,
  etat,
  motif,
  onClick,
  actif,
}: TuileServiceProps) {
  const indisponible = etat === "a-venir";
  const pastille = PASTILLE[etat];

  return (
    <button
      type="button"
      onClick={indisponible ? undefined : onClick}
      disabled={indisponible}
      title={indisponible ? motif : undefined}
      aria-pressed={actif}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
        indisponible
          ? "cursor-not-allowed border-border opacity-55"
          : actif
            ? "border-accent bg-accent/10"
            : "border-border hover:bg-muted",
      )}
    >
      <LogoMarque marque={marque} icone={icone} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{nom}</span>
        <span className="block truncate text-xs text-muted-foreground">{resume}</span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
          pastille.classe,
        )}
      >
        {pastille.texte}
      </span>
    </button>
  );
}

/** Grille des tuiles : deux colonnes dès qu'il y a la place. */
export function GrilleServices({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 cq-sm:grid-cols-2">{children}</div>;
}

export default TuileService;
