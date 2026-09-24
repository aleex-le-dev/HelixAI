import { useMemo, useState } from "react";
import { ExternalLink, Table2, ChartScatter } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  MODELES_REFERENCE,
  RELEVE_LE,
  SOURCE,
  VERSION_INDICE,
  referenceDuModele,
  type ModeleReference,
} from "@/data/artificialAnalysis";
import type { GatewayModel } from "@/lib/gateway";
import { lieuDuModele } from "@/lib/fournisseurs";
import { formaterDate } from "@/lib/formats";
import { cn } from "@/lib/cn";
import { t, tf, locale } from "@/lib/i18n";

/**
 * Comparer les modèles : intelligence face au coût.
 *
 * ── Ce que l'écran montre, et ce qu'il refuse de montrer ────────────────────
 *
 * Deux axes, et une seule question : pour ce que ça coûte, qu'est-ce que ça
 * vaut ? Le coin en haut à gauche est le bon. Les modèles que l'instance sert
 * vraiment sont marqués ; les autres sont là comme repères, parce qu'un point
 * seul dans un graphique ne dit rien.
 *
 * Le relevé ne publie en clair le coût que pour une partie des modèles. Ceux
 * qui n'en ont pas ne sont **pas placés** sur le graphique : ils sont listés
 * dessous avec leur seule note. Inventer une abscisse pour remplir le nuage
 * aurait été plus joli et faux.
 *
 * De même, un modèle de la machine — un Qwen 8B sur un portable — n'a
 * généralement aucune entrée dans le relevé. L'écran le dit plutôt que de lui
 * prêter la note de son grand frère hébergé.
 */

/** Un nom trop long déborderait de la bande : on le coupe plutôt que de l'étaler. */
const nomCourt = (id: string) => (id.length > 22 ? `${id.slice(0, 21)}…` : id);

/** Échelle logarithmique : les prix vont de quelques centimes à dix dollars. */
function echelleX(cout: number, min: number, max: number): number {
  const l = Math.log10(cout);
  return (l - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
}

/*
 * Marges. La gauche est large : l'étiquette de prix la plus basse est écrite
 * sous le premier trait vertical, et dépassait du cadre — « 0,10 $US » se
 * lisait « 10 $US », soit cent fois le prix annoncé.
 */
const MARGE = { gauche: 58, droite: 34, haut: 26, bas: 52 };

/**
 * Largeur de la bande réservée aux modèles de la machine, à gauche de l'échelle.
 *
 * ── Pourquoi une bande à part, et pas un point comme les autres ─────────────
 *
 * Un modèle qui tourne sur la machine ne coûte rien par tâche. Sur une échelle
 * logarithmique, « rien » n'a pas de place : log(0) n'existe pas, et le poser
 * à la valeur la plus basse du graphique reviendrait à lui inventer un prix.
 * Il a donc sa colonne, avant que l'échelle ne commence, séparée par un trait.
 *
 * Sa hauteur, en revanche, reste honnête : la note du relevé quand le modèle y
 * figure, et sinon une place explicitement marquée « note non relevée », en
 * cercle creux, en bas de la bande. C'est le cas courant — un Qwen 8B sur un
 * portable n'est mesuré par personne — et c'était jusqu'ici la raison pour
 * laquelle l'écran affichait « aucun de vos modèles n'y figure » à quelqu'un
 * qui en avait un sous les yeux.
 */
/*
 * 128 px : la largeur d'un nom de modèle. « deepseek-v4.1-flash » fait dix-neuf
 * caractères, soit un peu plus de cent pixels ; une bande plus étroite laissait
 * les noms déborder sur l'échelle des prix, de l'autre côté du trait.
 */
const BANDE = 128;
const ECART_BANDE = 18;
const LARGEUR = 720;
const HAUTEUR = 360;

export function ComparerModeles({
  open,
  onClose,
  modeles,
  choisi,
  onChoisir,
}: {
  open: boolean;
  onClose: () => void;
  /** Les modèles que l'instance sert réellement. */
  modeles: GatewayModel[];
  /** uid du modèle en cours : c'est lui que le graphique met en avant. */
  choisi?: string;
  /** Cliquer un point servi choisit ce modèle et ferme la fenêtre. */
  onChoisir?: (uid: string) => void;
}) {
  const [vue, setVue] = useState<"nuage" | "tableau">("nuage");

  /**
   * Quel modèle **hébergé** de l'instance correspond à quelle entrée du relevé.
   *
   * Hébergé seulement : un modèle qui tourne sur la machine ne paie pas le
   * prix du service, il a sa bande à gauche. Le compter ici l'aurait affiché
   * deux fois, dont une au prix de quelqu'un d'autre.
   */
  const correspondances = useMemo(() => {
    const table = new Map<string, GatewayModel>();
    for (const m of modeles) {
      if (lieuDuModele(m) === null) continue;
      const ref = referenceDuModele(m.id);
      if (ref && !table.has(ref.nom)) table.set(ref.nom, m);
    }
    return table;
  }, [modeles]);

  const places = MODELES_REFERENCE.filter((m) => typeof m.coutParTache === "number");
  /** Ceux des vôtres que le graphique peut réellement placer. */
  const servisPlaces = places.filter((m) => correspondances.has(m.nom)).length;

  /** Le modèle en cours, et son entrée au relevé si elle existe. */
  const modeleChoisi = modeles.find((m) => m.uid === choisi);
  const refChoisie = modeleChoisi ? referenceDuModele(modeleChoisi.id) : undefined;
  /**
   * Son rang, sur les vingt-cinq modèles notés. Le rang se calcule sur la
   * note seule : c'est la seule valeur que le relevé donne pour tous.
   */
  const rangChoisi = refChoisie
    ? [...MODELES_REFERENCE].sort((a, b) => b.intelligence - a.intelligence).findIndex((m) => m.nom === refChoisie.nom) + 1
    : 0;
  const sansCout = MODELES_REFERENCE.filter((m) => typeof m.coutParTache !== "number");

  const couts = places.map((m) => m.coutParTache as number);
  // Le premier repère (0,10 $US) doit tomber dans le cadre, pas à sa gauche.
  const minX = Math.min(Math.min(...couts) * 0.7, 0.08);
  const maxX = Math.max(...couts) * 1.4;
  const maxY = 60;

  /** L'échelle des prix commence après la bande de la machine. */
  // La bande n'a lieu d'être que si un modèle de la machine a une note à y poser.
  const avecBande = modeles.some((m) => lieuDuModele(m) === null && referenceDuModele(m.id));
  const debutEchelle = MARGE.gauche + (avecBande ? BANDE + ECART_BANDE : 0);
  const x = (m: ModeleReference) =>
    debutEchelle + echelleX(m.coutParTache as number, minX, maxX) * (LARGEUR - debutEchelle - MARGE.droite);
  const hauteurDe = (note: number) =>
    MARGE.haut + (1 - note / maxY) * (HAUTEUR - MARGE.haut - MARGE.bas);
  const y = (m: ModeleReference) => hauteurDe(m.intelligence);

  /** Le milieu de la bande, et la ligne des notes non relevées. */
  const xBande = MARGE.gauche + BANDE / 2;

  /**
   * Les modèles de la machine, avec leur note quand le relevé en donne une.
   *
   * `lieuDuModele` rend null pour ce qui tourne ici : c'est déjà la définition
   * qu'emploie le sélecteur, autant s'en servir plutôt que d'en écrire une
   * seconde qui finirait par diverger.
   */
  const surLaMachineTout = useMemo(() => {
    const liste = modeles
      .filter((m) => lieuDuModele(m) === null)
      .map((m) => ({ modele: m, reference: referenceDuModele(m.id) }));

    /*
     * La hauteur d'un point est sa note ; celle de son nom peut s'en écarter.
     * Deux modèles de force voisine posaient sinon leurs noms l'un sur
     * l'autre, ce qui arrive vite : c'est souvent la même famille déclinée en
     * plusieurs tailles. On descend donc chaque nom jusqu'à ce qu'il ait sa
     * place, sans bouger le point, qui, lui, dit quelque chose de vrai.
     */
    const sansNoteListe = liste.filter((e) => !e.reference);
    const avecNote = liste.filter((e) => e.reference);
    const posees: { modele: GatewayModel; reference?: ModeleReference; py: number; yNom: number }[] = [];
    let precedent = -Infinity;
    for (const entree of [...avecNote].sort(
      (a, b) => (b.reference?.intelligence ?? 0) - (a.reference?.intelligence ?? 0),
    )) {
      const py = hauteurDe(entree.reference?.intelligence ?? 0);
      const yNom = Math.max(py - 10, precedent + 16);
      precedent = yNom;
      posees.push({ ...entree, py, yNom });
    }
    /*
     * Les modèles sans note ne sont PAS posés sur l'axe. Ils l'étaient, empilés
     * de bas en haut pour ne pas se chevaucher : le client y a lu des notes
     * (« qwen3-8b-dwq vaut 27 ? »). Une hauteur sur un axe gradué est une
     * affirmation ; ils sont donc listés sous le graphique, à part.
     */
    return { posees, sansNoteListe };
  }, [modeles, hauteurDe]);
  const { posees: surLaMachine, sansNoteListe: machineSansNote } = surLaMachineTout;

  /** Ce que le graphique montre de vous : la machine, plus les correspondances. */
  const montres = surLaMachine.length + machineSansNote.length + servisPlaces;
  const sansNote = machineSansNote.length;

  /*
   * Où poser chaque nom sans qu'ils se marchent dessus.
   *
   * Un nuage de points sans noms ne dit rien : on voit des ronds. Mais onze
   * noms écrits au même endroit ne disent rien non plus. On place donc chaque
   * étiquette au-dessus de son point, sinon dessous, et on la renonce si les
   * deux places sont prises — dans l'ordre d'importance, pour que ce soit
   * toujours un repère lointain qui cède la place, jamais le modèle en cours.
   *
   * La largeur d'un nom est estimée à six pixels par caractère : c'est une
   * approximation, elle sert à espacer, pas à mesurer.
   */
  const etiquetes = useMemo(() => {
    const importance = (m: ModeleReference) => {
      const servi = correspondances.get(m.nom);
      if (servi && servi.uid === choisi) return 0;
      if (servi) return 1;
      return 2;
    };
    const ordre = [...places].sort((a, b) => importance(a) - importance(b));
    const prises: { x1: number; x2: number; y: number }[] = [];
    const libre = (px: number, largeur: number, py: number) =>
      !prises.some(
        (b) => Math.abs(b.y - py) < 12 && px - largeur / 2 < b.x2 && px + largeur / 2 > b.x1,
      );

    const pose = new Map<string, { dessus: boolean; texte: string }>();
    for (const m of ordre) {
      const texte = m.nom.replace(/\s*\([^)]*\)\s*$/, "");
      const largeur = texte.length * 6;
      const px = x(m);
      const py = y(m);
      const hautEtiquette = py - 11;
      const basEtiquette = py + 17;
      if (libre(px, largeur, hautEtiquette)) {
        prises.push({ x1: px - largeur / 2, x2: px + largeur / 2, y: hautEtiquette });
        pose.set(m.nom, { dessus: true, texte });
      } else if (libre(px, largeur, basEtiquette)) {
        prises.push({ x1: px - largeur / 2, x2: px + largeur / 2, y: basEtiquette });
        pose.set(m.nom, { dessus: false, texte });
      }
    }
    return places.map((m) => ({ modele: m, px: x(m), py: y(m), etiquette: pose.get(m.nom) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, correspondances, choisi, minX, maxX]);

  const dollars = (v: number) =>
    v.toLocaleString(locale(), { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("Comparer les modèles")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Intelligence face au coût. Plus haut et plus à gauche : plus capable pour moins cher.")}{" "}
            {montres === 0
              ? t("Aucun de vos modèles n'est placé : ni le relevé ni votre machine n'en donnent de quoi le situer.")
              : sansNote === 0
                ? tf("{0} de vos modèles y figurent.", montres)
                : tf(
                    "{0} de vos modèles y figurent, dont {1} sans note publiée : ils sont listés sous le graphique, sans position sur l'axe.",
                    montres,
                    sansNote,
                  )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVue((v) => (v === "nuage" ? "tableau" : "nuage"))}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {vue === "nuage" ? <Table2 size={15} strokeWidth={1.75} /> : <ChartScatter size={15} strokeWidth={1.75} />}
          {vue === "nuage" ? t("Voir le tableau") : t("Voir le graphique")}
        </button>
      </div>

      {vue === "nuage" ? (
        <>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-info" />
              {t("Modèle en cours")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              {t("Servi par votre instance")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-neutral-70" />
              {t("Repère")}
            </span>
            {machineSansNote.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-accent" />
                {t("Note non relevée")}
              </span>
            )}
          </div>

          <div className="mt-2 overflow-x-auto">
            <svg
              viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
              className="w-full min-w-[520px]"
              role="img"
              aria-label={t("Intelligence face au coût, par modèle")}
            >
              {/* Repères horizontaux : l'indice va de 0 à 60. */}
              {[0, 15, 30, 45, 60].map((v) => {
                const py = MARGE.haut + (1 - v / maxY) * (HAUTEUR - MARGE.haut - MARGE.bas);
                return (
                  <g key={v}>
                    <line
                      x1={MARGE.gauche}
                      x2={LARGEUR - MARGE.droite}
                      y1={py}
                      y2={py}
                      className="stroke-border"
                      strokeWidth={1}
                    />
                    <text x={MARGE.gauche - 8} y={py + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                      {v}
                    </text>
                  </g>
                );
              })}
              {/* Repères verticaux : puissances de dix, échelle logarithmique. */}
              {[0.1, 1, 10].map((v) => {
                const px = debutEchelle + echelleX(v, minX, maxX) * (LARGEUR - debutEchelle - MARGE.droite);
                return (
                  <g key={v}>
                    <line
                      x1={px}
                      x2={px}
                      y1={MARGE.haut}
                      y2={HAUTEUR - MARGE.bas}
                      className="stroke-border"
                      strokeWidth={1}
                    />
                    <text
                      x={px}
                      y={HAUTEUR - MARGE.bas + 16}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {dollars(v)}
                    </text>
                  </g>
                );
              })}
              <text
                x={(LARGEUR + debutEchelle) / 2}
                y={HAUTEUR - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {t("Coût moyen par tâche (échelle logarithmique)")}
              </text>
              <text
                x={14}
                y={HAUTEUR / 2}
                textAnchor="middle"
                transform={`rotate(-90 14 ${HAUTEUR / 2})`}
                className="fill-muted-foreground text-[11px]"
              >
                {t("Intelligence")}
              </text>

              {/*
               * La bande de la machine : son titre, son trait de séparation,
               * et ses modèles. Dessinée avant les autres points pour que le
               * trait passe dessous et non dessus.
               */}
              {surLaMachine.length > 0 && (
                <g>
                  <line
                    x1={MARGE.gauche + BANDE + ECART_BANDE / 2}
                    x2={MARGE.gauche + BANDE + ECART_BANDE / 2}
                    y1={MARGE.haut - 8}
                    y2={HAUTEUR - MARGE.bas}
                    className="stroke-border"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={xBande}
                    y={MARGE.haut - 12}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {t("Sur votre machine")}
                  </text>
                  <text
                    x={xBande}
                    y={HAUTEUR - MARGE.bas + 16}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {t("sans coût")}
                  </text>
                  {surLaMachine.map(({ modele, reference, py, yNom }) => {
                    const actif = modele.uid === choisi;
                    return (
                      <g key={modele.uid}>
                        <text
                          x={xBande}
                          y={yNom}
                          textAnchor="middle"
                          className={cn(
                            "text-[11px]",
                            actif ? "fill-foreground font-semibold" : "fill-foreground font-medium",
                          )}
                        >
                          {nomCourt(modele.id)}
                        </text>
                        <circle
                          cx={xBande}
                          cy={py}
                          r={actif ? 7 : 6}
                          className={cn(
                            actif ? "stroke-info" : "stroke-accent",
                            reference ? (actif ? "fill-info" : "fill-accent") : "fill-transparent",
                          )}
                          strokeWidth={2}
                          strokeDasharray={reference ? undefined : "3 2"}
                          onClick={onChoisir ? () => onChoisir(modele.uid) : undefined}
                          style={onChoisir ? { cursor: "pointer" } : undefined}
                        >
                          <title>
                            {reference
                              ? `${modele.id} · ${reference.intelligence}`
                              : `${modele.id} · ${t("note non relevée")}`}
                          </title>
                        </circle>
                      </g>
                    );
                  })}
                </g>
              )}

              {etiquetes.map(({ modele: m, px, py, etiquette }) => {
                const servi = correspondances.get(m.nom);
                const actif = Boolean(servi && servi.uid === choisi);
                return (
                  <g key={m.nom}>
                    {etiquette && (
                      <text
                        x={px}
                        y={etiquette.dessus ? py - 11 : py + 17}
                        textAnchor="middle"
                        className={cn(
                          "text-[11px]",
                          actif
                            ? "fill-foreground font-semibold"
                            : servi
                              ? "fill-foreground font-medium"
                              : "fill-muted-foreground",
                        )}
                      >
                        {etiquette.texte}
                      </text>
                    )}
                    <circle
                      cx={px}
                      cy={py}
                      r={actif ? 7 : servi ? 6 : 4}
                      className={actif ? "fill-info" : servi ? "fill-accent" : "fill-neutral-70"}
                      onClick={servi && onChoisir ? () => onChoisir(servi.uid) : undefined}
                      style={servi && onChoisir ? { cursor: "pointer" } : undefined}
                    >
                      <title>
                        {`${m.nom} · ${m.intelligence} · ${dollars(m.coutParTache as number)}`}
                      </title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          </div>

          {machineSansNote.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="text-muted-foreground">{t("Sur votre machine, sans note publiée :")}</span>
              {machineSansNote.map(({ modele }) => {
                const actif = modele.uid === choisi;
                return (
                  <button
                    key={modele.uid}
                    type="button"
                    onClick={onChoisir ? () => onChoisir(modele.uid) : undefined}
                    disabled={!onChoisir}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors",
                      actif
                        ? "border-info/40 bg-info/10 font-medium text-foreground"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full border-[1.5px] border-dashed",
                        actif ? "border-info" : "border-accent",
                      )}
                    />
                    {nomCourt(modele.id)}
                  </button>
                );
              })}
            </div>
          )}

          {/*
           * Le bandeau du modèle en cours.
           *
           * Un nuage répond à « où se situent les modèles » ; il ne répond pas
           * à « et le mien, alors ? ». Cette ligne-là le dit en toutes lettres,
           * et suit le modèle choisi. Quand il n'est pas au relevé — un modèle
           * de la machine, le plus souvent — elle le dit aussi, plutôt que de
           * disparaître et de laisser croire à un oubli.
           */}
          {modeleChoisi && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-muted px-3.5 py-2.5 text-sm">
              <span className="font-medium text-foreground">{modeleChoisi.id}</span>
              {refChoisie ? (
                <>
                  <span className="text-muted-foreground">
                    {t("Intelligence")}{" "}
                    <span className="tabular-nums text-foreground">{refChoisie.intelligence}</span>
                  </span>
                  {refChoisie.coutParTache !== undefined && (
                    <span className="text-muted-foreground">
                      {tf("{0} par tâche", dollars(refChoisie.coutParTache))}
                    </span>
                  )}
                  {refChoisie.vitesse !== undefined && (
                    <span className="text-muted-foreground">
                      {tf("{0} jetons par seconde", refChoisie.vitesse)}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {tf("{0}e sur {1}", rangChoisi, MODELES_REFERENCE.length)}
                  </span>
                </>
              ) : lieuDuModele(modeleChoisi) === null ? (
                <span className="text-muted-foreground">
                  {t("Sur votre machine : aucun coût par tâche, et pas de note à ce relevé.")}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("Pas mesuré par ce relevé : il ne figure donc pas sur le graphique.")}
                </span>
              )}
            </div>
          )}

          {sansCout.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {tf(
                "{0} autres modèles sont notés mais sans coût publié en clair : ils figurent dans le tableau, pas sur le graphique.",
                sansCout.length,
              )}
            </p>
          )}
        </>
      ) : (
        <div className="mt-4 max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">{t("Modèle")}</th>
                <th className="py-2 pr-3 font-semibold">{t("Éditeur")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("Intelligence")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("Coût par tâche")}</th>
                <th className="py-2 text-right font-semibold">{t("Jetons par seconde")}</th>
              </tr>
            </thead>
            <tbody>
              {MODELES_REFERENCE.map((m) => {
                const servi = correspondances.get(m.nom);
                return (
                  <tr
                    key={m.nom}
                    className={cn("border-b border-border/60", servi && "bg-muted/60")}
                  >
                    <td className="py-2 pr-3 text-foreground">
                      {m.nom}
                      {servi && (
                        <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                          {t("chez vous")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{m.editeur}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{m.intelligence}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {m.coutParTache === undefined ? "—" : dollars(m.coutParTache)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {m.vitesse === undefined ? "—" : m.vitesse}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        {t("Source :")}{" "}
        <a
          href={SOURCE}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
        >
          Artificial Analysis
          <ExternalLink size={11} strokeWidth={1.75} />
        </a>{" "}
        {tf("· indice {0}, relevé le {1}.", VERSION_INDICE, formaterDate(new Date(RELEVE_LE)))}
      </p>
    </Modal>
  );
}

export default ComparerModeles;
