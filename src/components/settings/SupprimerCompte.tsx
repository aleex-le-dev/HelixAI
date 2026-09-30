import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { useUtilisateurCourant, clearCurrentUser } from "@/lib/store/identity";
import { apercuEffacement, effacerMonCompte, oublierSurCePoste, type Apercu } from "@/lib/effacement";
import { t, tf, lister } from "@/lib/i18n";

/**
 * « Supprimer mon compte » : le seul geste vraiment irréversible de la zone de
 * danger. L'écran dit avant la confirmation ce qui disparaît, ce qui est
 * confié à un collègue et ce qui reste (le journal d'audit), puis demande le
 * mot de passe, et un code si le second facteur est actif.
 *
 * Chaque nombre a sa phrase entière, au singulier et au pluriel, plutôt qu'un
 * mot accolé au chiffre. Jusqu'au 28/09/2026, l'aperçu se composait de
 * morceaux (« documents », « et », « projets ou partages ») écrits sans
 * `t()` : ils restaient en français dans toutes les langues.
 */

export function SupprimerCompte() {
  const utilisateur = useUtilisateurCourant();
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
  const [compris, setCompris] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();

  const ouvrir = async () => {
    setErreur(undefined);
    setOuvert(true);
    try {
      setApercu(await apercuEffacement());
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  };

  const fermer = () => {
    setOuvert(false);
    setMotDePasse("");
    setCode("");
    setCompris(false);
    setErreur(undefined);
  };

  const supprimer = async () => {
    setOccupe(true);
    setErreur(undefined);
    try {
      await effacerMonCompte(motDePasse, code.trim());
      oublierSurCePoste(utilisateur.id);
      await clearCurrentUser().catch(() => {});
      window.location.reload();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
      setOccupe(false);
    }
  };

  if (!ouvert) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-destructive/40 bg-destructive/[0.04] p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("Supprimer mon compte")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Votre compte et vos données disparaissent de l'instance. Il n'y a pas de retour.")}
          </p>
        </div>
        <Button variant="destructive" icon={Trash2} onClick={() => void ouvrir()}>
          {t("Supprimer…")}
        </Button>
      </div>
    );
  }

  const pret = Boolean(apercu) && motDePasse !== "" && compris && (!apercu?.deuxFacteurs || code.trim() !== "");

  return (
    <div className="space-y-4 rounded-2xl border border-destructive/40 bg-destructive/[0.04] p-4">
      <p className="text-sm font-semibold text-foreground">{t("Supprimer mon compte")}</p>
      {!apercu && !erreur && <p className="text-sm text-muted-foreground">{t("Calcul de ce qui sera supprimé…")}</p>}
      {apercu && (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("Seront supprimés définitivement :")}</p>
          <ul className="space-y-0.5">
            <li>
              {tf(
                "• {0}, {1}, {2}",
                apercu.conversations === 1 ? t("1 conversation") : tf("{0} conversations", apercu.conversations),
                apercu.taches === 1 ? t("1 tâche") : tf("{0} tâches", apercu.taches),
                apercu.agents === 1 ? t("1 agent") : tf("{0} agents", apercu.agents),
              )}
            </li>
            <li>{t("• votre profil : instructions et mémoire personnelles")}</li>
            <li>{t("• votre consommation des modèles et vos postes connectés")}</li>
            <li>{t("• vos conversations avec les agents de l'équipe")}</li>
            {(apercu.employes?.length ?? 0) > 0 && (
              <li>
                {apercu.employes?.length === 1
                  ? tf("• l'agent que vous avez mis en service : {0}", lister(apercu.employes))
                  : tf("• les agents que vous avez mis en service : {0}", lister(apercu.employes ?? []))}
              </li>
            )}
            {(apercu.clesModeles?.length ?? 0) > 0 && (
              <li>{t("• vos clés de modèles cloud :")}{" "}{lister(apercu.clesModeles ?? [])}</li>
            )}
            {apercu.bibliotheque && apercu.bibliotheque.documents + apercu.bibliotheque.dossiers > 0 && (
              <li>
                {tf(
                  "• dans la bibliothèque : {0} et {1} (ce que des collègues avaient déposé dans vos dossiers leur reste)",
                  apercu.bibliotheque.documents === 1 ? t("1 document") : tf("{0} documents", apercu.bibliotheque.documents),
                  apercu.bibliotheque.dossiers === 1 ? t("1 dossier") : tf("{0} dossiers", apercu.bibliotheque.dossiers),
                )}
              </li>
            )}
            {(apercu.reunions ?? 0) > 0 && (
              <li>
                {apercu.reunions === 1
                  ? t("• 1 réunion enregistrée, avec compte rendu et transcription")
                  : tf("• {0} réunions enregistrées, avec compte rendu et transcription", apercu.reunions ?? 0)}
              </li>
            )}
            {apercu.projetsSupprimes.length > 0 && (
              <li>{t("• les projets sans autre membre :")}{" "}{lister(apercu.projetsSupprimes)}</li>
            )}
            {apercu.mentionsRetirees > 0 && (
              <li>
                {apercu.mentionsRetirees === 1
                  ? t("• votre place dans 1 projet ou partage de collègues")
                  : tf("• votre place dans {0} projets ou partages de collègues", apercu.mentionsRetirees)}
              </li>
            )}
          </ul>
          {apercu.projetsConfies.length > 0 && (
            <>
              <p className="font-medium text-foreground">{t("Confiés à un collègue, pour ne pas perdre le travail commun :")}</p>
              <ul className="space-y-0.5">
                {apercu.projetsConfies.map((c) => (
                  <li key={c.projet}>{tf("• « {0} » à {1}", c.projet, c.a)}</li>
                ))}
              </ul>
            </>
          )}
          <p>
            {t("Reste le journal d'audit : il est scellé, et sert à établir qui a fait quoi sur les données de l'entreprise. Il garde votre identifiant et l'adresse notée à la création du compte.")}
          </p>
        </div>
      )}
      <Field label={t("Votre mot de passe")}>
        <Input
          type="password"
          value={motDePasse}
          autoComplete="current-password"
          onChange={(e) => setMotDePasse(e.target.value)}
        />
      </Field>
      {apercu?.deuxFacteurs && (
        <Field label={t("Code de vérification")} hint={t("Celui de l'application, ou un code de secours.")}>
          <Input
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={32}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
      )}
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={compris}
          onChange={(e) => setCompris(e.target.checked)}
        />
        <span>{t("Je comprends que la suppression est définitive.")}</span>
      </label>
      {erreur && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" icon={Trash2} disabled={!pret || occupe} onClick={() => void supprimer()}>
          {occupe ? t("Suppression…") : t("Supprimer définitivement")}
        </Button>
        <Button variant="ghost" onClick={fermer} disabled={occupe}>
          {t("Annuler")}
        </Button>
      </div>
    </div>
  );
}

export default SupprimerCompte;
