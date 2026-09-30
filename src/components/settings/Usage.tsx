import { useCallback, useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/settings/SettingsShell";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { InfoBox } from "@/components/ui/InfoBox";
import {
  PERIODES,
  definirTarif,
  jetons,
  lireRapport,
  montant,
  montants,
  type Cout,
  type Devise,
  type ModeleDistant,
  type Periode,
  type Rapport,
} from "@/lib/usage";
import { cn } from "@/lib/cn";
import { formaterDate } from "@/lib/formats";
import { locale, t, tf } from "@/lib/i18n";

/**
 * Consommation réelle, mesurée par l'instance.
 *
 * Cet écran affichait un budget, une courbe de coûts et un modèle qui
 * n'existaient pas. Tout vient maintenant de la passerelle, qui lit les jetons
 * dans la réponse de chaque moteur. Là où une valeur manque, l'écran le dit :
 * un tarif non renseigné ne devient jamais un zéro.
 *
 * Depuis le 27/09/2026 (demandé par Medhi), un modèle cloud sans tarif saisi
 * prend le prix publié par son fournisseur (gateway/src/usage.ts) : l'écran le
 * cite, avec la date du relevé et le lien, et dit le coût estimé. Chaque coût
 * reste dans sa devise ; rien n'est converti.
 */

/** La date d'un relevé (AAAA-MM-JJ), à midi pour qu'aucun fuseau ne la fasse glisser. */
const jourCourt = (iso: string) => formaterDate(`${iso}T12:00:00`);

/** Libellé du coût d'un modèle, sans jamais combler un manque par un chiffre. */
function libelleCout(cout: Cout): {
  texte: string;
  aide?: string;
  atenue?: boolean;
  source?: { texte: string; lien?: string };
} {
  if (cout.statut === "gratuit") {
    return { texte: t("Gratuit"), aide: t("Calculé sur votre machine : aucun frais d'API.") };
  }
  if (cout.statut === "non-renseigne") {
    return {
      texte: t("Tarif non renseigné"),
      aide: t("Aucun prix publié connu pour ce modèle chez ce fournisseur : renseignez son tarif plus bas pour voir son coût."),
      atenue: true,
    };
  }
  const texte = montant(cout.montant, cout.devise) + (cout.estime ? ` ${t("(estimé)")}` : "");
  if (cout.source === "publie" && cout.publie) {
    return {
      texte,
      aide: t("Estimé avec le prix publié : le cache, les lots et les paliers gratuits n'y sont pas."),
      source: {
        texte: tf("prix publié par {0}, relevé du {1}", cout.publie.fournisseur, jourCourt(cout.publie.releveLe)),
        lien: cout.publie.page,
      },
    };
  }
  return {
    texte,
    aide: cout.estime ? t("Une partie des jetons a été estimée : le moteur ne les a pas rapportés.") : undefined,
    source: { texte: t("tarif saisi") },
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

/**
 * Le nom du modèle, et le service qui le sert (28/09/2026) : l'écran montrait
 * l'identifiant technique (« cle-3f9a…/gpt-4o-mini »). L'identifiant reste au
 * survol.
 */
function NomModele({ modele }: { modele: { uid: string; nom?: string; service?: string } }) {
  return (
    <span className="block min-w-0" title={modele.uid}>
      <span className="block truncate text-xs text-foreground">{modele.nom ?? modele.uid}</span>
      {modele.service && <span className="block truncate text-[11px] text-muted-foreground">{modele.service}</span>}
    </span>
  );
}

/** Saisie du tarif d'un modèle distant, avec le prix publié quand il est connu. */
function LigneTarif({ modele, onChange }: { modele: ModeleDistant; onChange: () => void }) {
  const [entree, setEntree] = useState(modele.tarif ? String(modele.tarif.entree) : "");
  const [sortie, setSortie] = useState(modele.tarif ? String(modele.tarif.sortie) : "");
  const [devise, setDevise] = useState<Devise>(modele.tarif?.devise ?? modele.publie?.devise ?? "EUR");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const symbole = devise === "USD" ? "$" : "€";

  const enregistrer = async (retirer = false) => {
    setEnCours(true);
    setMessage(null);
    const lire = (v: string) => Number(v.replace(",", "."));
    const res = retirer
      ? await definirTarif(modele.uid, null, null)
      : await definirTarif(modele.uid, lire(entree), lire(sortie), devise);
    setEnCours(false);
    if (!res.ok) {
      setMessage(res.raison ?? t("Tarif refusé."));
      return;
    }
    if (retirer) {
      setEntree("");
      setSortie("");
      // Le prix publié s'applique de nouveau : sa devise revient, et non celle du tarif retiré.
      setDevise(modele.publie?.devise ?? "EUR");
    }
    onChange();
  };

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-40 flex-1">
        <NomModele modele={modele} />
        {modele.tarif ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("Tarif saisi : il l'emporte sur le prix publié.")}</p>
        ) : modele.publie ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {tf(
              "Prix publié par {0}, relevé du {1} : {2} en entrée, {3} en sortie, par million de jetons.",
              modele.publie.fournisseur,
              jourCourt(modele.publie.releveLe),
              montant(modele.publie.entree, modele.publie.devise),
              montant(modele.publie.sortie, modele.publie.devise),
            )}{" "}
            <a href={modele.publie.page} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              {t("Voir la page")}
            </a>
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("Aucun prix publié connu : sans tarif saisi, son coût n'est pas compté.")}</p>
        )}
      </div>
      <label className="w-28 text-xs text-muted-foreground">
        {t("Entrée")}
        <Input value={entree} onChange={(e) => setEntree(e.target.value)} inputMode="decimal" placeholder={tf("{0} / M", symbole)} />
      </label>
      <label className="w-28 text-xs text-muted-foreground">
        {t("Sortie")}
        <Input value={sortie} onChange={(e) => setSortie(e.target.value)} inputMode="decimal" placeholder={tf("{0} / M", symbole)} />
      </label>
      <label className="w-32 text-xs text-muted-foreground">
        {t("Devise")}
        <Select
          value={devise}
          onChange={(v) => setDevise(v as Devise)}
          options={[
            { value: "EUR", label: t("Euro (€)") },
            { value: "USD", label: t("Dollar ($)") },
          ]}
        />
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
          { nom: t("Requêtes"), valeur: totaux.requetes.toLocaleString(locale()) },
          { nom: t("Jetons en entrée"), valeur: jetons(totaux.entree) },
          { nom: t("Jetons en sortie"), valeur: jetons(totaux.sortie) },
          {
            nom: totaux.coutEstime ? t("Coût (estimé)") : t("Coût"),
            // Par devise, sans conversion : aucun taux n'est inventé.
            valeur:
              totaux.couts.length > 0
                ? montants(totaux.couts) + (totaux.sansTarif > 0 ? ` (${t("incomplet")})` : "")
                : totaux.sansTarif > 0
                  ? t("Incomplet")
                  : montant(0),
          },
        ].map((t) => (
          <Card key={t.nom}>
            <p className="text-xs text-muted-foreground">{t.nom}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{t.valeur}</p>
          </Card>
        ))}
      </div>

      {rapport.tarifsIllisibles && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {t("Les tarifs enregistrés sur cette instance ne peuvent pas être lus : aucun coût distant n'est calculé, et rien n'est réécrit par-dessus.")}
        </InfoBox>
      )}

      {totaux.sansTarif > 0 && (
        <InfoBox tone="muted" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {/* Une phrase entière par nombre (27/09/2026) : la fin restait au singulier, « 2 modèles … n'a pas de tarif ». */}
          {totaux.sansTarif === 1
            ? t("Un modèle distant utilisé sur cette période n'a ni tarif saisi ni prix publié connu : son coût n'est pas compté. Renseignez-le plus bas.")
            : tf(
                "{0} modèles distants utilisés sur cette période n'ont ni tarif saisi ni prix publié connu : leur coût n'est pas compté. Renseignez-les plus bas.",
                totaux.sansTarif,
              )}
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
                <tr className="text-start text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{t("Modèle")}</th>
                  <th className="pb-2 font-medium">{t("Où")}</th>
                  <th className="pb-2 text-end font-medium">{t("Requêtes")}</th>
                  <th className="pb-2 text-end font-medium">{t("Entrée")}</th>
                  <th className="pb-2 text-end font-medium">{t("Sortie")}</th>
                  <th className="pb-2 text-end font-medium">{t("Coût")}</th>
                </tr>
              </thead>
              <tbody>
                {rapport.modeles.map((m) => {
                  const cout = libelleCout(m.cout);
                  return (
                    <tr key={m.uid} className="border-t border-border">
                      <td className="max-w-[14rem] py-2 pe-2">
                        <NomModele modele={m} />
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{m.local ? t("Local") : t("Distant")}</td>
                      <td className="py-2 text-end tabular-nums">{m.requetes.toLocaleString(locale())}</td>
                      <td className="py-2 text-end tabular-nums">{jetons(m.entree)}</td>
                      <td className="py-2 text-end tabular-nums">
                        {jetons(m.sortie)}
                        {m.raisonnement > 0 && (
                          <span
                            className="block text-[11px] text-muted-foreground"
                            title={t("Part de la sortie passée à raisonner avant de répondre")}
                          >
                            {tf("dont {0} de réflexion", jetons(m.raisonnement))}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn("py-2 text-end", cout.atenue ? "text-muted-foreground" : "text-foreground")}
                        title={cout.aide}
                      >
                        {cout.texte}
                        {cout.source && (
                          <span className="block text-[11px] text-muted-foreground">
                            {cout.source.lien ? (
                              <a href={cout.source.lien} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                                {cout.source.texte}
                              </a>
                            ) : (
                              cout.source.texte
                            )}
                          </span>
                        )}
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
            {t("Par million de jetons, dans la devise choisie. Sans tarif saisi, le prix publié par le fournisseur s'applique, avec sa date de relevé : il peut avoir changé depuis. Un tarif saisi l'emporte toujours.")}
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
