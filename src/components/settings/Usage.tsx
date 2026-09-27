import { useCallback, useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/settings/SettingsShell";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import {
  PERIODES,
  definirTarif,
  euros,
  jetons,
  lireRapport,
  type Cout,
  type ModeleDistant,
  type Periode,
  type Rapport,
} from "@/lib/usage";
import { cn } from "@/lib/cn";
import { formaterDate } from "@/lib/formats";
import { t, tf } from "@/lib/i18n";

/**
 * Consommation réelle, mesurée par l'instance.
 *
 * Cet écran affichait un budget, une courbe de coûts et un modèle qui
 * n'existaient pas. Tout vient maintenant de la passerelle, qui lit les jetons
 * dans la réponse de chaque moteur. Là où une valeur manque, l'écran le dit :
 * un tarif non renseigné ne devient jamais un zéro.
 */

/** Libellé du coût d'un modèle, sans jamais combler un manque par un chiffre. */
function libelleCout(cout: Cout): { texte: string; aide?: string; atenue?: boolean } {
  if (cout.statut === "gratuit") {
    return { texte: "Gratuit", aide: t("Calculé sur votre machine : aucun frais d'API.") };
  }
  if (cout.statut === "non-renseigne") {
    return {
      texte: t("Tarif non renseigné"),
      aide: t("Renseignez le tarif de ce modèle plus bas pour voir son coût."),
      atenue: true,
    };
  }
  return {
    texte: euros(cout.montant) + (cout.estime ? ` ${t("(estimé)")}` : ""),
    aide: cout.estime ? t("Une partie des jetons a été estimée : le moteur ne les a pas rapportés.") : undefined,
  };
}

/** Courbe des jetons par jour. Rien n'est tracé tant qu'il n'y a rien à tracer. */
function Courbe({ jours }: { jours: Rapport["jours"] }) {
  const points = jours.map((j) => j.entree + j.sortie);
  if (points.length === 0 || points.every((p) => p === 0)) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("Aucune consommation sur cette période.")}
      </p>
    );
  }

  const w = 620;
  const h = 180;
  const pad = { l: 44, r: 14, t: 12, b: 24 };
  const max = Math.max(...points) * 1.1;
  const x = (i: number) =>
    points.length === 1
      ? (pad.l + w - pad.r) / 2
      : pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const ligne = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const aire = `${ligne} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const graduations = [0, max / 2, max];
  // Les jours du rapport sont des dates sans heure : midi évite qu'un
  // fuseau les fasse glisser au jour précédent.
  const jourCourt = (iso: string) => formaterDate(`${iso}T12:00:00`);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full text-foreground" role="img" aria-label={t("Jetons consommés par jour")}>
      <defs>
        <linearGradient id="usageDegrade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.14" />
          <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {graduations.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground" fontSize="10">
            {jetons(Math.round(t))}
          </text>
        </g>
      ))}
      <path d={aire} fill="url(#usageDegrade)" />
      <path d={ligne} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.length === 1 && <circle cx={x(0)} cy={y(points[0])} r="3.5" fill="currentColor" />}
      <text x={pad.l} y={h - 6} className="fill-muted-foreground" fontSize="10">
        {jourCourt(jours[0].jour)}
      </text>
      {jours.length > 1 && (
        <text x={w - pad.r} y={h - 6} textAnchor="end" className="fill-muted-foreground" fontSize="10">
          {jourCourt(jours[jours.length - 1].jour)}
        </text>
      )}
    </svg>
  );
}

/** Saisie du tarif d'un modèle distant. */
function LigneTarif({ modele, onChange }: { modele: ModeleDistant; onChange: () => void }) {
  const [entree, setEntree] = useState(modele.tarif ? String(modele.tarif.entree) : "");
  const [sortie, setSortie] = useState(modele.tarif ? String(modele.tarif.sortie) : "");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const enregistrer = async (retirer = false) => {
    setEnCours(true);
    setMessage(null);
    const lire = (v: string) => Number(v.replace(",", "."));
    const res = retirer
      ? await definirTarif(modele.uid, null, null)
      : await definirTarif(modele.uid, lire(entree), lire(sortie));
    setEnCours(false);
    if (!res.ok) {
      setMessage(res.raison ?? t("Tarif refusé."));
      return;
    }
    if (retirer) {
      setEntree("");
      setSortie("");
    }
    onChange();
  };

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-border py-3 last:border-b-0">
      <p className="min-w-40 flex-1 truncate font-mono text-xs text-foreground">{modele.uid}</p>
      <label className="w-28 text-xs text-muted-foreground">
        {t("Entrée")}
        <Input value={entree} onChange={(e) => setEntree(e.target.value)} inputMode="decimal" placeholder={t("€ / M")} />
      </label>
      <label className="w-28 text-xs text-muted-foreground">
        {t("Sortie")}
        <Input value={sortie} onChange={(e) => setSortie(e.target.value)} inputMode="decimal" placeholder={t("€ / M")} />
      </label>
      <Button size="sm" variant="secondary" disabled={enCours || !entree || !sortie} onClick={() => void enregistrer()}>
        {t("Enregistrer")}
      </Button>
      {modele.tarif && (
        <Button size="sm" variant="ghost" disabled={enCours} onClick={() => void enregistrer(true)}>
          {t("Retirer")}
        </Button>
      )}
      {message && <p className="w-full text-xs text-foreground">{message}</p>}
    </div>
  );
}

export function Usage() {
  const [periode, setPeriode] = useState<Periode>("semaine");
  const [rapport, setRapport] = useState<Rapport | null | undefined>(undefined);

  const relire = useCallback(() => {
    void lireRapport(periode).then(setRapport);
  }, [periode]);
  useEffect(relire, [relire]);

  const onglets = (
    <SegmentedTabs
      options={PERIODES.map((p) => ({ id: p.valeur, label: p.nom }))}
      value={periode}
      onChange={(id) => setPeriode(id as Periode)}
      size="sm"
    />
  );

  if (rapport === undefined) {
    return (
      <Card className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />{" "}{t("Lecture de la consommation...")}
      </Card>
    );
  }

  if (rapport === null) {
    return (
      <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
        {t("La consommation ne peut pas être lue : l'instance ne répond pas, ou votre séance a expiré.")}
      </InfoBox>
    );
  }

  const { totaux } = rapport;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{onglets}</div>

      <div className="grid gap-3 cq-sm:grid-cols-2 cq-lg:grid-cols-4">
        {[
          { nom: t("Requêtes"), valeur: totaux.requetes.toLocaleString("fr-FR") },
          { nom: t("Jetons en entrée"), valeur: jetons(totaux.entree) },
          { nom: t("Jetons en sortie"), valeur: jetons(totaux.sortie) },
          {
            nom: t("Coût"),
            valeur: totaux.cout > 0 ? euros(totaux.cout) : totaux.sansTarif > 0 ? "Incomplet" : "0 €",
          },
        ].map((t) => (
          <Card key={t.nom}>
            <p className="text-xs text-muted-foreground">{t.nom}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{t.valeur}</p>
          </Card>
        ))}
      </div>

      {totaux.sansTarif > 0 && (
        <InfoBox tone="muted" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {totaux.sansTarif === 1 ? t("Un modèle distant utilisé") : tf("{0} modèles distants utilisés", totaux.sansTarif)}{" "}{t("sur cette période n'a pas de tarif : son coût n'est pas compté. Renseignez-le plus bas.")}
        </InfoBox>
      )}

      <Card>
        <p className="mb-3 text-sm font-semibold text-foreground">{t("Jetons par jour")}</p>
        <Courbe jours={rapport.jours} />
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-foreground">{t("Par modèle")}</p>
        {rapport.modeles.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t("Aucun modèle utilisé sur cette période.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{t("Modèle")}</th>
                  <th className="pb-2 font-medium">{t("Où")}</th>
                  <th className="pb-2 text-right font-medium">{t("Requêtes")}</th>
                  <th className="pb-2 text-right font-medium">{t("Entrée")}</th>
                  <th className="pb-2 text-right font-medium">{t("Sortie")}</th>
                  <th className="pb-2 text-right font-medium">{t("Coût")}</th>
                </tr>
              </thead>
              <tbody>
                {rapport.modeles.map((m) => {
                  const cout = libelleCout(m.cout);
                  return (
                    <tr key={m.uid} className="border-t border-border">
                      <td className="py-2 font-mono text-xs text-foreground">{m.uid}</td>
                      <td className="py-2 text-xs text-muted-foreground">{m.local ? "Local" : "Distant"}</td>
                      <td className="py-2 text-right tabular-nums">{m.requetes.toLocaleString("fr-FR")}</td>
                      <td className="py-2 text-right tabular-nums">{jetons(m.entree)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {jetons(m.sortie)}
                        {m.raisonnement > 0 && (
                          <span
                            className="block text-[11px] text-muted-foreground"
                            title={t("Part de la sortie passée à raisonner avant de répondre")}
                          >
                            dont {jetons(m.raisonnement)}{" "}{t("de réflexion")}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn("py-2 text-right", cout.atenue ? "text-muted-foreground" : "text-foreground")}
                        title={cout.aide}
                      >
                        {cout.texte}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rapport.modeles.some((m) => m.requetesEstimees > 0) && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("Certains moteurs ne rapportent pas leur consommation : pour eux, les jetons sont estimés à partir de la longueur des échanges.")}
          </p>
        )}
      </Card>

      {rapport.distants.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-foreground">{t("Tarifs des modèles distants")}</p>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("En euros par million de jetons, selon le tarif de votre hébergeur. Il change : aucun prix n'est proposé par défaut.")}
          </p>
          {rapport.distants.map((d) => (
            <LigneTarif key={d.uid} modele={d} onChange={relire} />
          ))}
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {t("Chiffres propres à votre compte. Les modèles locaux sont gratuits en frais d'API : le calcul se fait sur votre machine. Conservation :")}{" "}{tf("{0} mois.", Math.round(rapport.conservationJours / 30))}
      </p>
    </div>
  );
}

export default Usage;
