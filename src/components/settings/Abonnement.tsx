import { Check, Cpu, Mail, MapPin, TriangleAlert } from "lucide-react";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { branding } from "@/config/branding";
import {
  FORMULES,
  MODELES_INCLUS,
  echangesPour,
  jetonsInclus,
  pagesPour,
  type Formule,
} from "@/config/offre";
import { t, tf } from "@/lib/i18n";

/**
 * L'offre d'abonnement.
 *
 * ── Ce que cet écran doit faire comprendre en dix secondes ──────────────────
 *
 * Que le logiciel reste gratuit. C'est contre-intuitif, et si ce n'est pas dit
 * en premier, tout le reste se lit comme un logiciel qu'on essaie de vendre
 * après l'avoir donné. Ce qui est vendu, c'est le **calcul** : des modèles
 * puissants qui tournent sur des cartes en Europe, pour qui n'a pas envie
 * d'acheter la carte.
 *
 * ── Ce qu'il ne fait pas, et le dit ─────────────────────────────────────────
 *
 * Rien n'est branché à un système de paiement. Un bouton « S'abonner » qui
 * n'encaisse rien serait exactement le genre de promesse que ce produit
 * s'interdit. L'écran présente donc une offre, annonce qu'elle n'est pas
 * ouverte, et propose d'écrire — ce qui, lui, fonctionne vraiment.
 *
 * Les chiffres viennent tous de `src/config/offre.ts`, avec leur mode de
 * calcul : coût de revient, part du prix qui paie le calcul, jetons qui en
 * découlent. Aucun nombre n'est écrit à la main dans cet écran.
 */
export function Abonnement() {
  return (
    <>
      <Card>
        <h3 className="text-lg font-semibold text-foreground">
          {t("Le logiciel est gratuit. Ce qui se paie, c'est le calcul.")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {branding.name}{" "}{t("est un logiciel libre : vous pouvez l'installer sur vos machines, gratuitement et pour toujours, et y faire tourner vos propres modèles. C'est le cas aujourd'hui sur ce poste, et rien ne vous oblige à en changer.")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("Un modèle vraiment puissant demande une carte graphique à plusieurs milliers d'euros, et quelqu'un pour l'entretenir. L'abonnement vous donne accès à ces modèles sans acheter la carte : ils tournent sur des serveurs loués en Europe, et vos données ne quittent pas l'Union.")}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {MODELES_INCLUS.map((m) => (
            <div key={m.id} className="rounded-xl border border-border p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Cpu size={15} strokeWidth={1.75} /> {m.nom}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {m.description}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin size={13} strokeWidth={1.75} />{" "}{t("Hébergé en")}{" "}{m.heberge}, {m.origine}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t("Les modèles sont à poids ouverts, d'où qu'ils viennent. C'est ce qui permet de les faire tourner sur des machines européennes plutôt que d'envoyer vos documents chez leur éditeur : le pays du modèle compte moins que le pays de la machine qui le fait tourner.")}
        </p>
      </Card>

      <Card className="mt-6">
        <h3 className="text-lg font-semibold text-foreground">{t("Les formules")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Chaque formule comprend une réserve de jetons par mois. Un jeton est un morceau de mot : ce que le modèle lit et écrit se compte ainsi.")}
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {FORMULES.map((f) => (
            <CarteFormule key={f.id} formule={f} />
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {t("Au-delà de la réserve, rien ne s'arrête : vos modèles installés sur vos machines continuent de répondre, gratuitement, comme aujourd'hui. Vous choisissez le modèle à chaque conversation, et son pays reste affiché.")}
        </p>
      </Card>

      <Card className="mt-6">
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          <span className="font-medium text-foreground">
            {t("Ces formules ne sont pas encore ouvertes.")}
          </span>{" "}
          {t("Aucun paiement n'est possible depuis cet écran, et les prix affichés sont une proposition : ils reposent sur des coûts relevés chez les éditeurs et sur un devis d'hébergement encore à confirmer. Ils peuvent changer avant l'ouverture.")}
        </InfoBox>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            icon={Mail}
            onClick={() => {
              window.location.href = `mailto:${branding.urls.supportEmail}?subject=${encodeURIComponent(
                tf("Intérêt pour un abonnement {0}", branding.name),
              )}`;
            }}
          >
            {t("Écrire pour être prévenu")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("Votre message part de votre messagerie, vers")}{" "}{branding.urls.supportEmail}.
          </span>
        </div>
      </Card>
    </>
  );
}

function CarteFormule({ formule }: { formule: Formule }) {
  const rapide = MODELES_INCLUS.find((m) => m.role === "rapide");
  const expert = MODELES_INCLUS.find((m) => m.role === "expert");
  const millionsRapide = rapide ? jetonsInclus(formule, rapide) : 0;
  const millionsExpert = expert ? jetonsInclus(formule, expert) : 0;
  const nombre = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="flex flex-col rounded-xl border border-border p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold text-foreground">{formule.nom}</span>
        <span className="ml-auto text-lg font-semibold tabular-nums text-foreground">
          {formule.prix} €
        </span>
        <span className="text-xs text-muted-foreground">{t("par mois")}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{formule.pour}</p>

      <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
        <p className="text-foreground">
          <span className="font-medium tabular-nums">{tf("{0} millions", millionsRapide)}</span>{" "}{t("de jetons sur le modèle rapide")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("Environ")}{" "}{nombre(echangesPour(millionsRapide))}{" "}{t("échanges, ou")}{" "}
          {nombre(pagesPour(millionsRapide))}{" "}{t("pages lues et écrites.")}
        </p>
        {formule.prix >= 20 && (
          <p className="mt-2 text-foreground">
            <span className="font-medium tabular-nums">{tf("{0} millions", millionsExpert)}</span>{" "}{t("si vous les dépensez sur le modèle expert")}
          </p>
        )}
      </div>

      <ul className="mt-3 space-y-1.5">
        <li className="flex items-start gap-2 text-sm text-muted-foreground">
          <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-success" />
          {formule.postes === 1
            ? t("Un poste")
            : tf("Jusqu'à {0} postes, jetons partagés", formule.postes)}
        </li>
        {formule.enPlus.map((ligne) => (
          <li key={ligne} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-success" />
            {ligne}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Abonnement;
