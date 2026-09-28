import { useMemo, useState } from "react";
import { ExternalLink, Table2, ChartScatter, Cpu } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { LogoMarque } from "@/components/settings/TuileService";
import { marqueDuModele } from "@/components/settings/marquesConnecteurs";
import {
  MODELES_NOTES,
  SOURCE_NOTES,
  noteDuModeleServi,
  prixDeLEditeur,
  type ModeleNote,
} from "../../../gateway/src/notesModeles.ts";
import type { GatewayModel } from "@/lib/gateway";
import { lieuDuModele } from "@/lib/fournisseurs";
import { formaterDate } from "@/lib/formats";
import { cn } from "@/lib/cn";
import { t, tf, locale } from "@/lib/i18n";

/**
 * Comparer les modèles : la note ECI d'Epoch AI face au prix de l'éditeur.
 *
 * ── Ce que l'écran montre, et ce qu'il refuse de montrer ────────────────────
 *
 * Deux axes, une question : pour ce que ça coûte, qu'est-ce que ça vaut ? Le
 * coin en haut à gauche est le bon. Les notes sont l'indice ECI d'Epoch AI
 * (CC BY 4.0, gateway/src/notesModeles.ts) ; les prix, ceux que l'éditeur du
 * modèle publie, en dollars par million de jetons de sortie
 * (gateway/src/prixPublies.ts). Les deux sources sont nommées sous le
 * graphique, avec la date du relevé.
 *
 * **Tous les modèles de la personne y figurent** (Medhi, 27/09/2026 : « quel
 * que soit le modèle cloud choisi, il n'apparaissait pas ») :
 *  - un modèle cloud noté et dont l'éditeur publie un prix : un point du nuage ;
 *  - un modèle cloud noté sans prix relevé : la bande de droite, à sa note ;
 *  - un modèle de la machine noté : la bande de gauche, à sa note (il ne
 *    coûte aucun frais d'API, et « rien » n'a pas de place sur une échelle
 *    logarithmique) ;
 *  - un modèle qu'Epoch ne note pas : listé sous le graphique, sans position.
 *    Une hauteur sur un axe gradué est une affirmation ; le client y avait lu
 *    des notes (« qwen3-8b-dwq vaut 27 ? ») quand on les empilait le long de
 *    l'axe.
 * Les autres modèles notés et tarifés sont là comme repères, en gris.
 */

/** Un nom trop long déborderait de la bande : on le coupe plutôt que de l'étaler. */
const nomCourt = (id: string) => (id.length > 22 ? `${id.slice(0, 21)}…` : id);

/** Échelle logarithmique : les prix vont de quelques centimes à plus de cent dollars. */
function echelleX(prix: number, min: number, max: number): number {
  return (Math.log10(prix) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
}

/*
 * Marges. La gauche est large : l'étiquette de prix la plus basse est écrite
 * sous le premier trait vertical, et dépassait du cadre — « 0,10 $US » se
 * lisait « 10 $US », soit cent fois le prix annoncé.
 */
const MARGE = { gauche: 58, droite: 26, haut: 26, bas: 52 };

/*
 * 128 px : la largeur d'un nom de modèle. « deepseek-v4.1-flash » fait dix-neuf
 * caractères, soit un peu plus de cent pixels ; une bande plus étroite laissait
 * les noms déborder sur l'échelle des prix, de l'autre côté du trait.
 */
const BANDE = 128;
const ECART_BANDE = 18;
const LARGEUR = 760;
const HAUTEUR = 380;

interface Place {
  modele: GatewayModel;
  note: ModeleNote;
  py: number;
  yNom: number;
}

/** Descend chaque nom jusqu'à ce qu'il ait sa place, sans bouger le point, qui dit quelque chose de vrai. */
function empiler(entrees: { modele: GatewayModel; note: ModeleNote }[], hauteurDe: (n: number) => number): Place[] {
  const poses: Place[] = [];
  let precedent = -Infinity;
  for (const e of [...entrees].sort((a, b) => b.note.eci - a.note.eci)) {
    const py = hauteurDe(e.note.eci);
    const yNom = Math.max(py - 10, precedent + 16);
    precedent = yNom;
    poses.push({ ...e, py, yNom });
  }
  return poses;
}

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
  /** Cliquer un modèle de la personne le choisit et ferme la fenêtre. */
  onChoisir?: (uid: string) => void;
}) {
  const [vue, setVue] = useState<"nuage" | "tableau">("nuage");

  /** Chaque modèle de la personne, sa note et le prix de son éditeur. */
  const siens = useMemo(
    () =>
      modeles.map((m) => {
        const note = noteDuModeleServi(m);
        return { modele: m, local: lieuDuModele(m) === null, note, prix: note ? prixDeLEditeur(note) : undefined };
      }),
    [modeles],
  );

  /** Les repères : tout modèle noté dont l'éditeur publie un prix. */
  const tarifes = useMemo(
    () =>
      MODELES_NOTES.flatMap((n) => {
        const p = prixDeLEditeur(n);
        return p ? [{ note: n, entree: p.tarif.entree, sortie: p.tarif.sortie }] : [];
      }),
    [],
  );

  /** Quel modèle cloud de la personne correspond à quelle entrée notée. */
  const servis = useMemo(() => {
    const table = new Map<string, GatewayModel>();
    for (const s of siens) if (!s.local && s.note && !table.has(s.note.nom)) table.set(s.note.nom, s.modele);
    return table;
  }, [siens]);

  const machine = siens.filter((s) => s.local && s.note) as { modele: GatewayModel; note: ModeleNote }[];
  const sansPrix = siens.filter((s) => !s.local && s.note && !s.prix) as { modele: GatewayModel; note: ModeleNote }[];
  const sansNote = siens.filter((s) => !s.note);
  const dansLeNuage = siens.filter((s) => !s.local && s.note && s.prix).length;

  const avecGauche = machine.length > 0;
  const avecDroite = sansPrix.length > 0;
  const debutEchelle = MARGE.gauche + (avecGauche ? BANDE + ECART_BANDE : 0);
  const finEchelle = LARGEUR - MARGE.droite - (avecDroite ? BANDE + ECART_BANDE : 0);

  // Axe des notes : de la dizaine sous la plus basse à la dizaine au-dessus de la plus haute.
  const toutesNotes = [...tarifes.map((r) => r.note.eci), ...machine.map((e) => e.note.eci), ...sansPrix.map((e) => e.note.eci)];
  const minY = Math.floor((Math.min(...toutesNotes) - 2) / 10) * 10;
  const maxY = Math.ceil((Math.max(...toutesNotes) + 2) / 10) * 10;
  const hauteurDe = (note: number) => MARGE.haut + (1 - (note - minY) / (maxY - minY)) * (HAUTEUR - MARGE.haut - MARGE.bas);
  const reperesY: number[] = [];
  for (let v = minY; v <= maxY; v += 10) reperesY.push(v);

  const sorties = tarifes.map((r) => r.sortie);
  const minX = Math.min(...sorties) * 0.7;
  const maxX = Math.max(...sorties) * 1.4;
  const x = (prix: number) => debutEchelle + echelleX(prix, minX, maxX) * (finEchelle - debutEchelle);
  const reperesX = [0.01, 0.1, 1, 10, 100, 1000].filter((v) => v >= minX && v <= maxX);

  const gauche = empiler(machine, hauteurDe);
  const droite = empiler(sansPrix, hauteurDe);
  const xGauche = MARGE.gauche + BANDE / 2;
  const xDroite = LARGEUR - MARGE.droite - BANDE / 2;

  /** Le modèle en cours, sa note et son rang parmi les modèles notés. */
  const actuel = siens.find((s) => s.modele.uid === choisi);
  const rang = actuel?.note
    ? [...MODELES_NOTES].sort((a, b) => b.eci - a.eci).findIndex((m) => m.nom === actuel.note?.nom) + 1
    : 0;

  /*
   * Où poser chaque nom sans qu'ils se marchent dessus : au-dessus du point,
   * sinon dessous, sinon pas du tout, dans l'ordre d'importance, pour que ce
   * soit toujours un repère lointain qui cède la place, jamais le modèle en
   * cours. Six pixels par caractère : une approximation, pour espacer.
   */
  const etiquetes = useMemo(() => {
    const importance = (n: ModeleNote) => {
      const servi = servis.get(n.nom);
      if (servi && servi.uid === choisi) return 0;
      return servi ? 1 : 2;
    };
    const ordre = [...tarifes].sort((a, b) => importance(a.note) - importance(b.note));
    const prises: { x1: number; x2: number; y: number }[] = [];
    const libre = (px: number, largeur: number, py: number) =>
      !prises.some((b) => Math.abs(b.y - py) < 12 && px - largeur / 2 < b.x2 && px + largeur / 2 > b.x1);
    const pose = new Map<string, { dessus: boolean }>();
    // Les points des modèles de la personne sont plus gros : aucun nom de repère ne passe dessous.
    for (const r of tarifes) {
      if (!servis.has(r.note.nom)) continue;
      const px = x(r.sortie);
      const py = hauteurDe(r.note.eci) + 4;
      prises.push({ x1: px - 9, x2: px + 9, y: py });
    }
    for (const r of ordre) {
      const servi = servis.get(r.note.nom);
      const largeur = (servi ? nomCourt(servi.id) : r.note.nom).length * 6;
      const px = x(r.sortie);
      const py = hauteurDe(r.note.eci);
      if (libre(px, largeur, py - 11)) {
        prises.push({ x1: px - largeur / 2, x2: px + largeur / 2, y: py - 11 });
        pose.set(r.note.nom, { dessus: true });
      } else if (libre(px, largeur, py + 17)) {
        prises.push({ x1: px - largeur / 2, x2: px + largeur / 2, y: py + 17 });
        pose.set(r.note.nom, { dessus: false });
      }
    }
    // Les modèles de la personne par-dessus les repères.
    return [...tarifes]
      .sort((a, b) => importance(b.note) - importance(a.note))
      .map((r) => ({ ...r, px: x(r.sortie), py: hauteurDe(r.note.eci), etiquette: pose.get(r.note.nom) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarifes, servis, choisi, minX, maxX, minY, maxY, debutEchelle, finEchelle]);

  const dollars = (v: number) =>
    v.toLocaleString(locale(), { style: "currency", currency: "USD", maximumFractionDigits: v < 0.1 ? 3 : 2 });
  const nombre = (v: number) => v.toLocaleString(locale(), { maximumFractionDigits: 2 });

  /** Un modèle de la personne dans une bande : point plein, nom au-dessus. */
  const pointDeBande = (p: Place, cx: number) => {
    const actif = p.modele.uid === choisi;
    return (
      <g key={p.modele.uid}>
        <text
          x={cx}
          y={p.yNom}
          textAnchor="middle"
          className={cn("fill-foreground text-[11px]", actif ? "font-semibold" : "font-medium")}
        >
          {nomCourt(p.modele.id)}
        </text>
        <circle
          cx={cx}
          cy={p.py}
          r={actif ? 7 : 6}
          className={actif ? "fill-info" : "fill-accent"}
          onClick={onChoisir ? () => onChoisir(p.modele.uid) : undefined}
          style={onChoisir ? { cursor: "pointer" } : undefined}
        >
          <title>{`${p.modele.id} · ${p.note.nom} · ECI ${nombre(p.note.eci)}`}</title>
        </circle>
      </g>
    );
  };

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("Comparer les modèles")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Note face au prix. Plus haut et plus à gauche : plus capable pour moins cher.")}{" "}
            {siens.length === 0
              ? t("Aucun modèle n'est servi par votre instance pour l'instant.")
              : sansNote.length === 0
                ? tf("Vos {0} modèles y figurent.", siens.length)
                : tf(
                    "Vos {0} modèles y figurent, dont {1} sans note publiée : ils sont listés sous le graphique, sans position sur l'axe.",
                    siens.length,
                    sansNote.length,
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
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-info" />
              {t("Modèle en cours")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              {t("Vos modèles")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
              {t("Repère")}
            </span>
          </div>

          <div className="mt-2 overflow-x-auto">
            <svg
              viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
              className="w-full min-w-[560px]"
              role="img"
              aria-label={t("Note ECI face au prix, par modèle")}
            >
              {reperesY.map((v) => {
                const py = hauteurDe(v);
                return (
                  <g key={v}>
                    <line x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={py} y2={py} className="stroke-border" strokeWidth={1} />
                    <text x={MARGE.gauche - 8} y={py + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                      {v}
                    </text>
                  </g>
                );
              })}
              {reperesX.map((v) => {
                const px = x(v);
                return (
                  <g key={v}>
                    <line x1={px} x2={px} y1={MARGE.haut} y2={HAUTEUR - MARGE.bas} className="stroke-border" strokeWidth={1} />
                    <text x={px} y={HAUTEUR - MARGE.bas + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                      {dollars(v)}
                    </text>
                  </g>
                );
              })}
              <text
                x={(debutEchelle + finEchelle) / 2}
                y={HAUTEUR - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {t("Prix de sortie chez l'éditeur, par million de jetons (échelle logarithmique)")}
              </text>
              <text
                x={14}
                y={HAUTEUR / 2}
                textAnchor="middle"
                transform={`rotate(-90 14 ${HAUTEUR / 2})`}
                className="fill-muted-foreground text-[11px]"
              >
                {t("Note ECI")}
              </text>

              {avecGauche && (
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
                  <text x={xGauche} y={MARGE.haut - 12} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {t("Sur votre machine")}
                  </text>
                  <text x={xGauche} y={HAUTEUR - MARGE.bas + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {t("sans frais d'API")}
                  </text>
                  {gauche.map((p) => pointDeBande(p, xGauche))}
                </g>
              )}

              {avecDroite && (
                <g>
                  <line
                    x1={LARGEUR - MARGE.droite - BANDE - ECART_BANDE / 2}
                    x2={LARGEUR - MARGE.droite - BANDE - ECART_BANDE / 2}
                    y1={MARGE.haut - 8}
                    y2={HAUTEUR - MARGE.bas}
                    className="stroke-border"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <text x={xDroite} y={MARGE.haut - 12} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {t("Cloud, prix non relevé")}
                  </text>
                  {droite.map((p) => pointDeBande(p, xDroite))}
                </g>
              )}

              {etiquetes.map(({ note, px, py, sortie, entree, etiquette }) => {
                const servi = servis.get(note.nom);
                const actif = Boolean(servi && servi.uid === choisi);
                return (
                  <g key={note.nom}>
                    {etiquette && (
                      <text
                        x={px}
                        y={etiquette.dessus ? py - 11 : py + 17}
                        textAnchor="middle"
                        className={cn(
                          "text-[11px]",
                          actif ? "fill-foreground font-semibold" : servi ? "fill-foreground font-medium" : "fill-muted-foreground",
                        )}
                      >
                        {servi ? nomCourt(servi.id) : note.nom}
                      </text>
                    )}
                    <circle
                      cx={px}
                      cy={py}
                      r={actif ? 7 : servi ? 6 : 4}
                      className={actif ? "fill-info" : servi ? "fill-accent" : "fill-muted-foreground opacity-50"}
                      onClick={servi && onChoisir ? () => onChoisir(servi.uid) : undefined}
                      style={servi && onChoisir ? { cursor: "pointer" } : undefined}
                    >
                      <title>
                        {`${note.nom} · ECI ${nombre(note.eci)} · ${tf("{0} en entrée, {1} en sortie", dollars(entree), dollars(sortie))}`}
                      </title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          </div>

          {sansNote.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="text-muted-foreground">{t("Pas de note publiée par Epoch AI pour :")}</span>
              {sansNote.map(({ modele, local }) => {
                const actif = modele.uid === choisi;
                return (
                  <button
                    key={modele.uid}
                    type="button"
                    onClick={onChoisir ? () => onChoisir(modele.uid) : undefined}
                    disabled={!onChoisir}
                    title={local ? t("Sur votre machine") : (lieuDuModele(modele) ?? undefined)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors",
                      actif ? "border-info/40 bg-info/10 font-medium text-foreground" : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full border-[1.5px] border-dashed", actif ? "border-info" : "border-accent")} />
                    {nomCourt(modele.id)}
                  </button>
                );
              })}
            </div>
          )}

          {/*
           * Le bandeau du modèle en cours : un nuage répond à « où se situent
           * les modèles », pas à « et le mien, alors ? ». Quand le modèle n'est
           * pas noté, le bandeau le dit au lieu de disparaître.
           */}
          {actuel && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-muted px-3.5 py-2.5 text-sm">
              <span className="inline-flex items-center gap-2 font-medium text-foreground">
                <LogoMarque marque={marqueDuModele(actuel.modele.id)} icone={Cpu} taille={16} />
                {actuel.modele.id}
              </span>
              {actuel.note ? (
                <>
                  {actuel.note.nom !== actuel.modele.id && (
                    <span className="text-muted-foreground">{tf("noté comme « {0} »", actuel.note.nom)}</span>
                  )}
                  <span className="text-muted-foreground">
                    {t("Note ECI")} <span className="tabular-nums text-foreground">{nombre(actuel.note.eci)}</span>
                  </span>
                  <span className="text-muted-foreground">{tf("{0}e sur {1}", rang, MODELES_NOTES.length)}</span>
                  {actuel.local ? (
                    <span className="text-muted-foreground">{t("Sur votre machine : aucun frais d'API.")}</span>
                  ) : actuel.prix ? (
                    <span className="text-muted-foreground">
                      {tf(
                        "Prix de {0} : {1} en entrée, {2} en sortie",
                        actuel.prix.fournisseur.nom,
                        dollars(actuel.prix.tarif.entree),
                        dollars(actuel.prix.tarif.sortie),
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("Prix de l'éditeur non relevé.")}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {t("Pas de note publiée par Epoch AI pour ce modèle : il est listé sous le graphique, sans position.")}
                </span>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {tf(
              "Repères : {0} modèles notés dont l'éditeur publie un prix ({1} des vôtres parmi eux). Le tableau donne les {2} modèles notés.",
              tarifes.length,
              dansLeNuage,
              MODELES_NOTES.length,
            )}
          </p>
        </>
      ) : (
        <div className="mt-4 max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">{t("Modèle")}</th>
                <th className="py-2 pr-3 font-semibold">{t("Éditeur")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("Note ECI")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("Entrée")}</th>
                <th className="py-2 text-right font-semibold">{t("Sortie")}</th>
              </tr>
            </thead>
            <tbody>
              {MODELES_NOTES.map((m) => {
                const servi = servis.get(m.nom) ?? siens.find((s) => s.local && s.note === m)?.modele;
                const p = prixDeLEditeur(m);
                return (
                  <tr key={m.nom} className={cn("border-b border-border/60", servi && "bg-muted/60")}>
                    <td className="py-2 pr-3 text-foreground">
                      <span className="mr-2 inline-flex align-[-3px]">
                        <LogoMarque marque={marqueDuModele(m.nom)} icone={Cpu} taille={16} />
                      </span>
                      {m.nom}
                      {servi && (
                        <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                          {t("chez vous")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{m.editeur || "?"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{nombre(m.eci)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{p ? dollars(p.tarif.entree) : "?"}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{p ? dollars(p.tarif.sortie) : "?"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Prix par million de jetons, chez l'éditeur ; « ? » : non relevé.")}
          </p>
        </div>
      )}

      {/* Attribution exigée par la licence CC BY 4.0 d'Epoch AI : la source, l'auteur, la licence, le lien, et ce qui a été modifié (section 3(a)(1)(B) de la licence ; détail dans THIRD_PARTY_NOTICES.md § 3). */}
      <p className="mt-4 text-xs text-muted-foreground">
        {t("Notes :")}{" "}
        <a
          href={SOURCE_NOTES.page}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
        >
          {tf("{0}, « {1} »", SOURCE_NOTES.nom, SOURCE_NOTES.titre)}
          <ExternalLink size={11} strokeWidth={1.75} />
        </a>{" "}
        {tf("· indice {0}, licence", SOURCE_NOTES.indice)}{" "}
        <a href={SOURCE_NOTES.licenceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
          {SOURCE_NOTES.licence}
        </a>
        {tf(", relevé le {0} ; extrait (modèles sortis depuis 2024) et rapproché des noms de modèles, notes inchangées.", formaterDate(`${SOURCE_NOTES.releveLe}T12:00:00`))}{" "}
        {tf("Prix : pages de prix des éditeurs, relevées le {0}.", formaterDate(`${SOURCE_NOTES.releveLe}T12:00:00`))}
      </p>
    </Modal>
  );
}

export default ComparerModeles;
