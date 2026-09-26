import { useCallback, useEffect, useState } from "react";
import { Check, Info, Loader2, Terminal, Trash2 } from "lucide-react";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { t, tf } from "@/lib/i18n";

/**
 * La ligne de commande `helix`, livrée avec l'application de bureau.
 *
 * Le bouton pose un lanceur dans ~/.local/bin (electron/ligneDeCommande.cjs),
 * sans droit d'administrateur, et ajoute ce dossier au PATH du shell s'il n'y
 * est pas. Hors de l'application de bureau (navigateur, poste sans pont), il
 * n'y a rien à poser : l'écran le dit au lieu d'offrir un bouton mort.
 */

interface EtatCli {
  disponible: boolean;
  installe: boolean;
  aJour: boolean;
  /** Un autre programme occupe déjà ~/.local/bin/helix : il n'est jamais remplacé. */
  etranger?: boolean;
  dansLePath: boolean;
  chemin: string;
  profil: string;
  ligneAjoutee: boolean;
}

interface PontCli {
  etat: () => Promise<EtatCli>;
  installer: () => Promise<EtatCli>;
  retirer: () => Promise<EtatCli>;
}

const pont = (): PontCli | undefined =>
  (window as unknown as { helix?: { ligneDeCommande?: PontCli } }).helix?.ligneDeCommande;

/** Relu à chaque affichage : les rôles suivent la langue choisie. */
const commandes = (): { commande: string; role: string }[] => [
  { commande: "helix connexion", role: t("Se connecter une fois avec son compte de l'instance.") },
  { commande: "helix chat", role: t("Un Chat dans le terminal, avec les modèles de l'instance.") },
  { commande: "helix chat --outils", role: t("Le même Chat, avec vos connecteurs et la barrière d'approbation.") },
  { commande: "helix code", role: t("L'agent de code sur le dossier courant.") },
  { commande: "helix --aide", role: t("Toutes les commandes et options.") },
];

export function LigneDeCommande() {
  const [etat, setEtat] = useState<EtatCli | null | undefined>(undefined);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const relire = useCallback(() => {
    const p = pont();
    if (!p) return setEtat(null);
    void p.etat().then(setEtat, () => setEtat(null));
  }, []);
  useEffect(relire, [relire]);

  const agir = async (f: (p: PontCli) => Promise<EtatCli>) => {
    const p = pont();
    if (!p) return;
    setOccupe(true);
    setErreur(null);
    try {
      setEtat(await f(p));
    } catch (err) {
      setErreur(tf("La mise en place a échoué : {0}", err instanceof Error ? err.message : String(err)));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Terminal size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-foreground" />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{t("Ligne de commande")}</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {t(
              "Le Chat et l'agent de code dans un terminal, avec les mêmes modèles, les mêmes règles et la même barrière d'approbation que l'application. Elle est livrée avec l'application : rien à installer d'autre.",
            )}
          </p>
        </div>
      </div>

      {etat === undefined ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> {t("Lecture...")}
        </p>
      ) : etat === null || !etat.disponible ? (
        <InfoBox className="mt-4" leading={<Info size={15} strokeWidth={1.75} />}>
          {etat === null
            ? t("La commande se met en place depuis l'application de bureau de cet ordinateur, dans ce même écran.")
            : t("La ligne de commande n'est pas encore prise en charge sur ce système.")}
        </InfoBox>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                {etat.etranger
                  ? t("Un autre programme nommé helix est déjà installé à cet endroit : il n'est pas remplacé.")
                  : etat.installe && etat.aJour
                  ? t("La commande helix est en place.")
                  : etat.installe
                    ? t("La commande helix vise une autre copie de l'application : mettez-la à jour.")
                    : t("La commande helix n'est pas encore en place.")}
              </span>
              <span className="block break-all text-xs text-muted-foreground">{etat.chemin}</span>
            </span>
            {etat.installe && (
              <Button variant="secondary" icon={Trash2} disabled={occupe} onClick={() => void agir((p) => p.retirer())}>
                {t("Retirer")}
              </Button>
            )}
            {!etat.etranger && !(etat.installe && etat.aJour) && (
              <Button icon={occupe ? Loader2 : Check} disabled={occupe} onClick={() => void agir((p) => p.installer())}>
                {etat.installe ? t("Mettre à jour") : t("Mettre en place")}
              </Button>
            )}
          </div>

          {etat.etranger && (
            <p className="text-xs text-muted-foreground">
              {tf("Renommez ou retirez vous-même {0} si vous voulez le remplacer par la commande de l'application, puis revenez ici.", etat.chemin)}
            </p>
          )}
          {!etat.installe && !etat.etranger && (
            <p className="text-xs text-muted-foreground">
              {tf(
                "Un petit lanceur est posé dans {0}, sans droit d'administrateur. Si ce dossier n'est pas dans le PATH de votre terminal, une ligne marquée est ajoutée à {1} ; « Retirer » enlève les deux.",
                "~/.local/bin",
                etat.profil.replace(/^.*\//, "~/"),
              )}
            </p>
          )}
          {etat.installe && etat.ligneAjoutee && (
            <p className="text-xs text-muted-foreground">
              {tf("Ouvrez un nouveau terminal : la ligne ajoutée à {0} ne vaut que pour les terminaux ouverts ensuite.", etat.profil.replace(/^.*\//, "~/"))}
            </p>
          )}

          {erreur && (
            <InfoBox tone="warning" leading={<Info size={15} strokeWidth={1.75} />}>
              {erreur}
            </InfoBox>
          )}

          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-sm font-medium text-foreground">{t("Pour commencer")}</p>
            <dl className="mt-2 space-y-1.5">
              {commandes().map((c) => (
                <div key={c.commande} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <dt>
                    <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-foreground">{c.commande}</code>
                  </dt>
                  <dd className="text-xs text-muted-foreground">{c.role}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </Card>
  );
}

export default LigneDeCommande;
