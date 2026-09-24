import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { ATELIER_CHANGE } from "@/hooks/useAtelier";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import {
  diagnostic as chargerDiagnostic,
  preparer as lancerPreparation,
  verifier as lancerVerification,
  type Bilan,
  type Diagnostic,
  type Progres,
  type Verification,
} from "@/lib/atelier";
import { t, tf } from "@/lib/i18n";

/**
 * Préparer Cowork.
 *
 * Cowork sait manipuler des fichiers, mais il ne sait produire ni relire un
 * document tant que la machine ne porte pas les bibliothèques adéquates. Les
 * installer est une décision qui appartient à l'utilisateur : on lui montre
 * donc ce qui manque, on annonce exactement ce que l'installation va faire, et
 * on attend un accord explicite.
 *
 * Rien de tout cela n'est décidé par le modèle : la passerelle exécute une
 * liste de paquets figée dans son code.
 */

type Etape = "diagnostic" | "confirmation" | "installation" | "bilan";

/** Issue affichée à la fin, dans les mots de l'utilisateur. */
type Issue = "pret" | "indisponible" | "refuse";

const ISSUE_LIBELLE: Record<Issue, string> = {
  pret: t("Prêt"),
  indisponible: t("Indisponible"),
  refuse: t("Refusé"),
};

/** Pastille d'état, du vert au gris, sans jamais coder une couleur en dur. */
function Pastille({ etat }: { etat: "ok" | "absent" | "option" }) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        etat === "ok" ? "bg-success" : etat === "option" ? "bg-warning" : "bg-neutral-70",
      )}
    />
  );
}

function Ligne({
  present,
  optionnel,
  titre,
  detail,
}: {
  present: boolean;
  optionnel?: boolean;
  titre: string;
  detail?: string;
}) {
  return (
    <li className="flex items-start gap-2 py-1">
      <span className="mt-1.5">
        <Pastille etat={present ? "ok" : optionnel ? "option" : "absent"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-foreground">{titre}</span>
        {detail && (
          <span className="block text-[11px] leading-snug text-muted-foreground">{detail}</span>
        )}
      </span>
    </li>
  );
}

export function PreparerCowork() {
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [injoignable, setInjoignable] = useState(false);
  const [etape, setEtape] = useState<Etape>("diagnostic");
  const [progres, setProgres] = useState<Progres | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [echec, setEchec] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifieEnCours, setVerifieEnCours] = useState(false);
  const [detailOuvert, setDetailOuvert] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [charge, setCharge] = useState(false);

  const rafraichir = useCallback(async () => {
    const resultat = await chargerDiagnostic();
    setInjoignable(resultat === null);
    setDiag(resultat);
    setCharge(true);
    /*
     * Une carte pliée sur un atelier prêt ne dérange personne ; dépliée sur un
     * atelier incomplet, elle dit ce qu'il reste à faire au moment où on ouvre
     * Cowork. C'est le seul moment où l'information est utile.
     */
    if (resultat && !resultat.pret) setOuvert(true);
  }, []);

  useEffect(() => {
    void rafraichir();
  }, [rafraichir]);

  const preparer = useCallback(async () => {
    setEtape("installation");
    setEchec(null);
    setIssue(null);
    setProgres({ phase: "verification", message: "Démarrage...", percent: 0 });
    try {
      const resultat = await lancerPreparation(setProgres);
      setBilan(resultat);
      setDiag(resultat.diagnostic);
      setIssue(resultat.ok ? "pret" : "indisponible");
    } catch (err) {
      setEchec(err instanceof Error ? err.message : String(err));
      setIssue("indisponible");
      void rafraichir();
    } finally {
      setEtape("bilan");
      /*
       * Prévient le reste de l'application. Cowork n'annonce ses outils
       * bureautiques au modèle que si l'atelier répond : sans ce signal, il
       * faudrait recharger la fenêtre pour que la préparation serve à quelque
       * chose.
       */
      window.dispatchEvent(new Event(ATELIER_CHANGE));
    }
  }, [rafraichir]);

  const verifier = useCallback(async () => {
    setVerifieEnCours(true);
    try {
      setVerification(await lancerVerification());
    } catch (err) {
      setVerification({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        epreuves: [],
      });
    } finally {
      setVerifieEnCours(false);
    }
  }, []);

  // L'état de l'atelier restait en français dans toutes les langues.
  const statut = injoignable
    ? t("Indisponible")
    : !diag
      ? "..."
      : etape === "installation"
        ? t("En cours")
        : issue
          ? ISSUE_LIBELLE[issue]
          : diag.pret
            ? t("Prêt")
            : diag.installable
              ? t("À préparer")
              : t("Indisponible");

  const manquantes = diag?.bibliotheques.filter((b) => !b.installee) ?? [];
  const total = diag?.bibliotheques.length ?? 0;

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
        aria-expanded={ouvert}
      >
        <span className="text-sm font-semibold text-foreground">{t("Préparer Cowork")}</span>
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          {!charge ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <span className="text-[11px]">{statut}</span>
          )}
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={cn("transition-transform", !ouvert && "-rotate-90")}
          />
        </span>
      </button>

      {ouvert && (
        <div className="space-y-3 px-3.5 pb-3.5 pt-0">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("Donne à Cowork de quoi produire et relire des documents Word, Excel, PowerPoint et PDF.")}
          </p>

          {injoignable && (
            <InfoBox tone="muted" leading={<CircleAlert size={15} strokeWidth={1.75} />}>
              <p className="text-xs">{t("Instance injoignable. Impossible d'inspecter la machine.")}</p>
            </InfoBox>
          )}

          {diag && (
            <>
              {/* Ce que la machine porte déjà. */}
              <ul className="border-t border-border pt-1">
                {diag.systeme
                  .filter((o) => o.id === "python3" || o.id === "npm")
                  .map((outil) => (
                    <Ligne
                      key={outil.id}
                      present={outil.present}
                      titre={t(outil.nom)}
                      detail={outil.present ? outil.version : t("Absent de cette machine")}
                    />
                  ))}
                <Ligne
                  present={diag.pret}
                  titre={t("Bibliothèques de documents")}
                  detail={
                    diag.pret
                      ? tf("{0} sur {1} installées", total, total)
                      : tf("{0} sur {1} installées", total - manquantes.length, total)
                  }
                />
              </ul>

              {manquantes.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setDetailOuvert((d) => !d)}
                    className="text-[11px] text-muted-foreground underline underline-offset-2"
                  >
                    {detailOuvert ? t("Masquer le détail") : tf("Voir les {0} manquantes", manquantes.length)}
                  </button>
                  {detailOuvert && (
                    <ul className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                      {manquantes.map((b) => (
                        <Ligne key={b.nom} present={false} titre={b.nom} detail={b.usage} />
                      ))}
                    </ul>
                  )}
                </>
              )}

              {/* Ce qui n'est jamais installé automatiquement, et pourquoi c'est utile. */}
              <ul className="border-t border-border pt-1">
                {diag.optionnels.map((outil) => (
                  <Ligne
                    key={outil.id}
                    present={outil.present}
                    optionnel
                    titre={
                      outil.present ? t(outil.nom) : tf("{0} (facultatif)", t(outil.nom))
                    }
                    detail={
                      outil.present ? t(outil.apport) : `${t(outil.apport)} ${t(outil.obtention)}`
                    }
                  />
                ))}
              </ul>

              {diag.obstacles.map((obstacle) => (
                <InfoBox
                  key={obstacle.slice(0, 24)}
                  tone="warning"
                  leading={<CircleAlert size={15} strokeWidth={1.75} />}
                >
                  <p className="text-xs leading-relaxed">{obstacle}</p>
                </InfoBox>
              ))}
            </>
          )}

          {/* Étape 1 : demander. Rien n'est installé à ce clic. */}
          {diag?.installable && !diag.pret && etape === "diagnostic" && (
            <Button size="sm" block onClick={() => setEtape("confirmation")}>
              {t("Préparer l'atelier")}
            </Button>
          )}

          {/* Étape 2 : dire exactement ce qui va se passer, puis attendre l'accord. */}
          {etape === "confirmation" && diag && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/60 p-3">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <ShieldCheck size={15} strokeWidth={1.75} />
                {t("Avant d'installer")}
              </p>
              <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <li>
                  {manquantes.length}{" "}{t("bibliothèques seront téléchargées depuis les dépôts publics Python (PyPI) et Node (npm).")}
                </li>
                <li>{t("Environ")}{" "}{diag.tailleEstimeeMo}{" "}{t("Mo d'espace disque seront occupés.")}</li>
                <li>
                  {t("Tout est déposé dans un dossier réservé, et nulle part ailleurs :")}
                  <span className="mt-0.5 block break-all text-foreground">{diag.racine}</span>
                </li>
                <li>
                  {t("Ni vos logiciels, ni vos projets, ni les réglages de votre machine ne sont modifiés.")}
                </li>
                <li>{t("Aucun mot de passe administrateur n'est demandé.")}</li>
                <li>{t("Pour tout annuler plus tard, il suffit de supprimer ce dossier.")}</li>
              </ul>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => void preparer()}>
                  {t("Je confirme")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIssue("refuse");
                    setEtape("bilan");
                  }}
                >
                  {t("Annuler")}
                </Button>
              </div>
            </div>
          )}

          {/* Étape 3 : la progression, telle que la passerelle la rapporte. */}
          {etape === "installation" && progres && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-[13px] text-foreground">
                <Loader2 size={14} className="animate-spin" />
                {progres.message}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(2, Math.min(100, progres.percent))}%` }}
                />
              </div>
              {progres.detail && (
                <p className="truncate text-[11px] text-muted-foreground" title={progres.detail}>
                  {progres.detail}
                </p>
              )}
            </div>
          )}

          {/* Étape 4 : le bilan, dans les mots de l'utilisateur. */}
          {etape === "bilan" && issue && (
            <div className="space-y-2">
              <p
                className={cn(
                  "flex items-center gap-2 text-[13px] font-semibold",
                  issue === "pret" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {issue === "pret" ? (
                  <CircleCheck size={15} strokeWidth={1.75} className="text-success" />
                ) : (
                  <CircleAlert size={15} strokeWidth={1.75} />
                )}
                {ISSUE_LIBELLE[issue]}
              </p>

              {issue === "refuse" && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("Rien n'a été installé. Vous pourrez revenir ici quand vous le souhaiterez.")}
                </p>
              )}

              {echec && <p className="text-[11px] leading-relaxed text-destructive">{echec}</p>}

              {bilan?.etapes.map((e) => (
                <p
                  key={e.id}
                  className={cn(
                    "text-[11px] leading-relaxed",
                    e.ok ? "text-muted-foreground" : "text-destructive",
                  )}
                >
                  {e.message}
                </p>
              ))}

              <Button
                size="sm"
                variant="secondary"
                icon={RefreshCw}
                onClick={() => {
                  setIssue(null);
                  setBilan(null);
                  setEchec(null);
                  setEtape("diagnostic");
                  void rafraichir();
                }}
              >
                {t("Reprendre")}
              </Button>
            </div>
          )}

          {/* Épreuves réelles : un document de chaque format, produit puis relu. */}
          {diag?.pret && etape !== "installation" && (
            <div className="space-y-2 border-t border-border pt-2.5">
              <Button
                size="sm"
                variant="secondary"
                block
                disabled={verifieEnCours}
                onClick={() => void verifier()}
              >
                {verifieEnCours ? "Vérification..." : t("Vérifier l'atelier")}
              </Button>
              {verification && (
                <>
                  <p
                    className={cn(
                      "text-[11px] leading-relaxed",
                      verification.ok ? "text-muted-foreground" : "text-destructive",
                    )}
                  >
                    {verification.message}
                  </p>
                  <ul>
                    {verification.epreuves.map((e) => (
                      <Ligne key={e.id} present={e.ok} titre={e.libelle} detail={e.detail} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default PreparerCowork;
