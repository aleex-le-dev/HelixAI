import { createElement, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  MARQUES,
  type CleMarqueGrande,
  type CleMarquePetite,
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
  /** Marque officielle, quand elle existe (jamais une marque « grande »). */
  marque?: CleMarquePetite;
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
  largeur = taille,
  classe,
}: {
  dessin: DessinMarque;
  /** Hauteur, et largeur quand elle n'est pas donnée (logos carrés des listes). */
  taille: number;
  largeur?: number;
  classe?: string;
}) {
  // useId donne « :r1: » : les deux-points sont valides dans un id mais pas
  // dans `url(#…)` sans échappement, d'où leur retrait.
  const prefixe = useId().replace(/:/g, "") + "-";
  if (dessin.image) {
    // object-contain : quelques PNG officiels ne sont pas tout à fait carrés (HubSpot, 267 × 269) ; ils gardent leurs proportions.
    return <img src={dessin.image} width={taille} height={taille} alt="" aria-hidden="true" className={cn("shrink-0 object-contain", classe)} />;
  }
  return (
    <svg
      viewBox={dessin.viewBox}
      width={largeur}
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
 *
 * Taille minimale et zone de protection (seconde tournée du 28/09/2026) :
 * quand la charte les chiffre (`tailleMin`, `marge` dans marques.ts), elles
 * s'appliquent ici. Sous la taille minimale, c'est l'icône neutre qui paraît.
 * `degagement` est l'espace que l'écran laisse déjà autour du logo (l'écart
 * de la ligne, sa marge intérieure) ; il ne manque que la différence, posée
 * en marge autour du dessin. Sans `degagement`, toute la zone est ajoutée.
 *
 * Troisième tournée (28/09/2026, décision de Medhi : « mets les vrais ») :
 * chaque service et chaque fournisseur affiché a son logo, et `pastille`
 * pose un fond clair derrière un logo sombre qui n'a pas de version pour fond
 * sombre (Square, OVHcloud, PayPal), pour qu'il reste lisible.
 */
export function LogoMarque({
  marque,
  icone: Icone,
  taille = 22,
  degagement = 0,
}: {
  /** Jamais une marque « grande » (le logo complet de YouTube) : en petit, c'est `youtubeIcone`. */
  marque?: CleMarquePetite;
  icone?: LucideIcon;
  taille?: number;
  /** Espace libre, en pixels, que la mise en page garantit de chaque côté du logo. */
  degagement?: number;
}) {
  const m: Marque | undefined = marque ? MARQUES[marque] : undefined;
  if (m && !(m.tailleMin && taille < m.tailleMin)) {
    const zone = m.marge ? Math.max(m.marge.part * taille, m.marge.px) : 0;
    const manque = Math.max(0, Math.ceil(zone - degagement));
    const dessins = m.pastille ? (
      // Logo sombre sans version pour fond sombre : un fond clair derrière lui, en thème sombre seulement (styles/index.css).
      <span className="marque-pastille inline-flex shrink-0">
        <Dessin dessin={m.clair} taille={taille} />
      </span>
    ) : !m.sombre ? (
      <Dessin dessin={m.clair} taille={taille} />
    ) : (
      <>
        <Dessin dessin={m.clair} taille={taille} classe="marque-claire" />
        <Dessin dessin={m.sombre} taille={taille} classe="marque-sombre" />
      </>
    );
    if (!manque) return dessins;
    return (
      <span className="inline-flex shrink-0" style={{ margin: manque }}>
        {dessins}
      </span>
    );
  }
  if (Icone) {
    return <Icone size={taille} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />;
  }
  return null;
}

/**
 * Logo complet d'une marque, en grand, en tête de son panneau (28/09/2026) :
 * YouTube, à 100 px au moins, comme sa charte le demande
 * (https://brand.youtube/youtube-logo/). Depuis la troisième tournée du même
 * jour, la liste des connecteurs montre aussi l'icône de YouTube en petit
 * (clé `youtubeIcone`, décision de Medhi) ; le logo complet reste ici.
 *
 * `hauteur` est celle du logo lui-même. Le dessin garde tout le plan de
 * travail du kit : la marge vide que YouTube livre autour du logo est plus
 * large que la zone de protection de sa charte (la taille du triangle), elle
 * vient donc avec le dessin, sans dépendre des marges de l'écran. Une hauteur
 * sous le minimum de la charte est ramenée au minimum ; `shrink-0` empêche la
 * mise en page de la réduire.
 *
 * Sans la place, rien : la charte veut le logo entier et jamais couvert. Dans
 * une fenêtre étroite (820 px, vu à l'écran le 28/09/2026), le panneau n'a que
 * 350 px pour un dessin de 595 : le logo sortait coupé après « You ». On mesure
 * donc la largeur offerte, et le logo ne paraît que s'il y tient en entier.
 */
export function LogoMarqueGrand({
  marque,
  hauteur = 0,
  lien,
  libelle,
}: {
  marque: CleMarqueGrande;
  hauteur?: number;
  /** Adresse où mène le logo (YouTube demande qu'il soit cliquable). */
  lien?: string;
  libelle?: string;
}) {
  const m = MARQUES[marque];
  const [, , largeurCadre, hauteurCadre] = m.clair.viewBox.split(" ").map(Number);
  const logo = Math.max(hauteur, m.grand.hauteurMin);
  const h = Math.ceil((logo * hauteurCadre) / m.grand.hauteurLogo);
  const l = Math.ceil((h * largeurCadre) / hauteurCadre);
  const cadre = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    setPlace(el.clientWidth);
    const o = new ResizeObserver(() => setPlace(el.clientWidth));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const dessins = (
    <>
      <Dessin dessin={m.clair} taille={h} largeur={l} classe="marque-claire" />
      <Dessin dessin={m.sombre} taille={h} largeur={l} classe="marque-sombre" />
    </>
  );
  return (
    <div ref={cadre} className="w-full">
      {place !== null && place >= l &&
        (lien ? (
          <a href={lien} target="_blank" rel="noreferrer noopener" aria-label={libelle} title={libelle} className="flex w-fit rounded-lg">
            {dessins}
          </a>
        ) : (
          <div className="flex w-fit">{dessins}</div>
        ))}
    </div>
  );
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
      {/* gap-3 et py-3 : 12 px libres autour du logo. */}
      <LogoMarque marque={marque} icone={icone} degagement={12} />
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
