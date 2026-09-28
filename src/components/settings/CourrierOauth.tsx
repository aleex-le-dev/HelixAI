import { useState } from "react";
import { ExternalLink, Info, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { ACopier } from "@/components/ui/ACopier";
import { branding } from "@/config/branding";
import { connecterAvec } from "@/lib/courrier";
import { instance } from "@/lib/instance";
import { t, tf } from "@/lib/i18n";

/**
 * Brancher une boîte Google ou Microsoft en cliquant.
 *
 * ── Ce que cet écran doit dire honnêtement ──────────────────────────────────
 *
 * Que ce chemin demande **une chose à son administrateur**, une seule fois.
 * Google et Microsoft ne distribuent pas d'identifiant d'application
 * automatiquement, contrairement aux trente-trois autres services branchés en
 * un clic : il faut qu'une organisation déclare celle-ci chez elle. Cinq
 * minutes, et aucune vérification à passer puisque l'application reste
 * interne.
 *
 * Cacher cette étape derrière un bouton qui échouerait ensuite serait le
 * contraire de rendre service. On la montre, on donne l'adresse de retour à
 * recopier, et on dit qui peut la faire.
 *
 * Pour un compte personnel, l'écran dit franchement que ce chemin n'existe
 * pas, et renvoie au mot de passe d'application.
 */
export function CourrierOauth({
  adresse,
  fournisseur,
  onBranche,
}: {
  adresse: string;
  fournisseur: "google" | "microsoft";
  /** La boîte a été branchée au retour : l'écran parent relit son état. */
  onBranche: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenant, setTenant] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [attente, setAttente] = useState(false);

  const nom = fournisseur === "google" ? "Google" : "Microsoft";
  const retour = `${instanceVue()}/helix/oauth/retour`;

  const lancer = async () => {
    setOccupe(true);
    setErreur(null);
    const r = await connecterAvec(adresse, {
      fournisseur,
      clientId,
      ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
      ...(tenant.trim() ? { tenant: tenant.trim() } : {}),
    });
    setOccupe(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    /*
     * La fenêtre s'ouvre à part : la personne s'authentifie chez son
     * fournisseur, pas dans cet écran, et revient ici quand c'est fait. On
     * n'attend pas d'événement — le retour se fait dans l'autre fenêtre, et
     * c'est elle qui confirme. Le bouton « J'ai terminé » relit l'état.
     */
    window.open(r.url, "_blank", "noopener,noreferrer");
    setAttente(true);
  };

  return (
    <div className="space-y-4">
      <InfoBox leading={<Info size={15} strokeWidth={1.75} />}>
        {/*
         * Une phrase entière (28/09/2026) : faite de six morceaux, elle
         * gardait « interne » en français dans toutes les langues, et l'ordre
         * des morceaux ne tenait ni en japonais ni en chinois.
         */}
        {tf(
          "Ce chemin demande une préparation, une fois, par la personne qui administre votre {0} d'entreprise : déclarer {1} comme application interne à votre organisation. Cinq minutes, et aucune vérification à passer chez {0}, puisque l'application ne sort pas de chez vous. Ensuite, chacun se connecte en un clic.",
          nom,
          branding.name,
        )}
      </InfoBox>

      <div>
        <p className="text-sm font-medium text-foreground">
          {t("À donner à votre administrateur")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("L'adresse de retour doit être inscrite à l'identique dans l'application qu'il déclare, sinon")}{" "}{nom}{" "}{t("refusera la connexion.")}
        </p>
        <ACopier
          className="mt-2"
          valeur={retour}
          libelle={t("l'adresse de retour")}
          note={t("« URI de redirection autorisé » dans la console du fournisseur.")}
        />
      </div>

      <Field
        label={t("Identifiant d'application (« client ID ») fourni par votre administrateur")}
      >
        <Input
          value={clientId}
          placeholder={
            fournisseur === "google"
              ? "000000000000-xxxxxxxx.apps.googleusercontent.com"
              : "00000000-0000-0000-0000-000000000000"
          }
          onChange={(e) => setClientId(e.target.value)}
        />
      </Field>

      <Field
        label={t("Secret d'application, si votre administrateur en a créé un")}
        hint={t("Facultatif : une application déclarée « publique » n'en a pas besoin, la sécurité étant assurée autrement (PKCE).")}
      >
        <Input
          type="password"
          autoComplete="off"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
        />
      </Field>

      {fournisseur === "microsoft" && (
        <Field
          label={t("Domaine ou identifiant de votre organisation")}
          hint={t("Laissé vide, tout compte professionnel Microsoft est accepté. Rempli, seuls les comptes de votre organisation le sont.")}
        >
          <Input
            value={tenant}
            placeholder="entreprise.fr"
            onChange={(e) => setTenant(e.target.value)}
          />
        </Field>
      )}

      {erreur && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={occupe ? Loader2 : ExternalLink}
          disabled={occupe || !clientId.trim() || !adresse.includes("@")}
          onClick={() => void lancer()}
        >
          {occupe ? t("Préparation...") : tf("Se connecter avec {0}", nom)}
        </Button>
        {attente && (
          <Button variant="ghost" onClick={onBranche}>
            {t("J'ai terminé dans l'autre fenêtre")}
          </Button>
        )}
      </div>

      {attente && (
        <InfoBox tone="muted">
          {t("Une fenêtre s'est ouverte chez")}{" "}{nom}{t(". Vous y saisissez votre mot de passe, chez eux :")}{" "}{branding.name}{" "}{t("ne le voit pas, et ne le conserve pas. Revenez ici quand la page vous dit que la boîte est branchée.")}
        </InfoBox>
      )}
    </div>
  );
}

/**
 * Adresse par laquelle ce poste atteint l'instance.
 *
 * C'est elle que le fournisseur doit connaître, parce que c'est là que le
 * navigateur reviendra. Sur un poste rattaché, ce n'est pas « localhost ».
 *
 * Lue par `instance()`, comme toutes les requêtes de l'écran. Tournée des
 * connecteurs du 28/09/2026 : elle était lue dans le stockage local, où
 * l'adresse ne se trouve plus depuis qu'elle vit dans le coffre du poste
 * (lib/coffre.ts) ; l'écran retombait alors sur l'origine de la page, et
 * l'application de bureau demandait de déclarer « helix://app/helix/oauth/retour »
 * chez Google ou Microsoft, qui refusaient ensuite la connexion.
 */
function instanceVue(): string {
  try {
    return instance().url.replace(/\/+$/, "");
  } catch {
    return window.location.origin;
  }
}

export default CourrierOauth;
