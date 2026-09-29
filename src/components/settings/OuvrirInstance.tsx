import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Loader2,
  Network,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Wifi,
} from "lucide-react";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { Switch } from "@/components/ui/Switch";
import { branding } from "@/config/branding";
import { ACopier } from "@/components/ui/ACopier";
import { etatReseau, reglerReseau, type EtatReseau, type Proposition } from "@/lib/reseau";
import { t, tf } from "@/lib/i18n";

/**
 * Ouvrir son instance à ses collègues.
 *
 * Le produit sert trois situations. Un particulier seul n'a rien à ouvrir. Une
 * entreprise règle tout dans son profil de déploiement, et l'interrupteur est
 * alors inerte, ce que l'écran dit. Reste le cas du milieu, le plus courant et
 * le seul qui n'était pas servi : quelqu'un a {branding} sur son PC et veut
 * inviter une personne à travailler avec lui. Jusqu'ici, cela demandait
 * d'éditer un fichier JSON à la main.
 *
 * Ce que l'écran doit dire sans détour : ouvrir change la surface de la
 * machine. Le chiffrement devient automatique, le mot de passe est redemandé,
 * et l'adresse à transmettre s'affiche.
 */
export function OuvrirInstance() {
  const [etat, setEtat] = useState<EtatReseau | null | undefined>(undefined);
  const [confirmation, setConfirmation] = useState<boolean | null>(null);
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const recharger = useCallback(() => {
    void etatReseau().then(setEtat);
  }, []);
  useEffect(recharger, [recharger]);

  if (etat === undefined) {
    return (
      <Card className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />{" "}{t("Lecture de l'instance...")}
      </Card>
    );
  }
  if (etat === null) return null;

  const appliquer = async (ouverte: boolean) => {
    setOccupe(true);
    setMessage(null);
    const r = await reglerReseau(ouverte, { motDePasse, code: code.trim() || undefined });
    setOccupe(false);
    if (!r.ok) {
      setMessage({ ok: false, texte: r.message ?? t("Réglage refusé.") });
      return;
    }
    setMotDePasse("");
    setCode("");
    setConfirmation(null);
    setMessage({
      ok: true,
      texte: ouverte
        ? tf("Instance ouverte. Donnez cette adresse à vos collègues : {0}", r.adresse ?? "")
        : t("Instance refermée : elle n'est de nouveau joignable que depuis cette machine."),
    });
    // La passerelle vient de redémarrer : on relit après un court instant.
    setTimeout(recharger, 3000);
  };

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Network size={18} strokeWidth={1.75} />{" "}{t("Ouvrir l'instance à mes collègues")}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Tant qu'elle est fermée,")}{" "}{branding.name}{" "}{t("ne répond qu'à cette machine. Ouverte, vos collègues peuvent y rattacher leur poste et travailler avec vous, sans rien installer d'autre.")}
      </p>

      {/*
        Les chemins valent aussi pour une instance réglée par son profil de
        déploiement : l'interrupteur lui est inerte, mais la personne qui
        invite un collègue a le même besoin d'une adresse à donner.
      */}
      {etat.parLeProfil ? (
        <>
          <InfoBox className="mt-4" leading={<Check size={15} strokeWidth={2.5} />}>
            {t("Cette instance est réglée par son profil de déploiement")}
            {etat.ouverte ? " et ouverte aux autres postes." : t(" et fermée.")}{" "}{t("Ce réglage ne se change pas depuis cet écran.")}
          </InfoBox>
          {etat.ouverte && <Chemins etat={etat} />}
        </>
      ) : (
        <>
          <label className="mt-4 flex items-center gap-3">
            <Switch
              checked={etat.ouverte}
              disabled={occupe || !etat.administrateur}
              onChange={(v) => {
                setMessage(null);
                setConfirmation(v);
              }}
              label={t("Ouvrir l'instance à mes collègues")}
            />
            <span className="text-sm text-foreground">
              {etat.ouverte ? t("Ouverte") : t("Fermée")}
            </span>
          </label>

          {!etat.administrateur && (
            <InfoBox tone="muted" className="mt-3">
              {t("Seule la personne qui administre cette instance peut l'ouvrir.")}
            </InfoBox>
          )}

          {etat.ouverte && <Chemins etat={etat} />}

          {confirmation !== null && (
            <div className="mt-4 space-y-3 rounded-xl border border-border p-3">
              {confirmation ? (
                <InfoBox tone="warning" leading={<ShieldAlert size={15} strokeWidth={1.75} />}>
                  {t("Votre machine va répondre sur le réseau local.")}{" "}{branding.name}{" "}{t("chiffrera alors ses échanges : son adresse passe en https, pour vous comme pour vos collègues, et votre système vous demandera peut-être d'autoriser la connexion. Le jeton d'instance reste exigé : ouvrir l'écoute n'ouvre pas l'accès.")}
                </InfoBox>
              ) : (
                <InfoBox tone="muted">
                  {t("L'instance ne répondra plus qu'à cette machine. Les postes de vos collègues perdront l'accès jusqu'à ce que vous la rouvriez.")}
                </InfoBox>
              )}
              <Field label={t("Votre mot de passe")}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                />
              </Field>
              <Field label={t("Code de vérification (si la double authentification est active)")}>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={32}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  icon={occupe ? Loader2 : Check}
                  disabled={occupe || !motDePasse}
                  onClick={() => void appliquer(confirmation)}
                >
                  {occupe
                    ? t("Application...")
                    : confirmation
                      ? t("Ouvrir l'instance")
                      : t("Refermer l'instance")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmation(null)}>
                  {t("Annuler")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {message && (
        <InfoBox
          tone={message.ok ? "info" : "warning"}
          className="mt-3"
          leading={
            message.ok ? (
              <Check size={15} strokeWidth={2.5} />
            ) : (
              <TriangleAlert size={15} strokeWidth={1.75} />
            )
          }
        >
          {message.texte}
        </InfoBox>
      )}
    </Card>
  );
}

/**
 * Par où un collègue vous rejoint, selon où il se trouve.
 *
 * Trois chemins, et un seul à choisir : celui qui correspond à la situation.
 * Les deux premiers, le produit les fournit tels quels ; le troisième
 * n'appartient pas à un logiciel installé sur un poste, et le dire vaut mieux
 * que le laisser espérer.
 *
 *  1. **Le même réseau.** Même Wi-Fi, même bureau, même câble. Rien à
 *     installer, rien à régler : l'adresse suffit. C'est le cas courant.
 *  2. **Un réseau privé.** VPN d'entreprise, Tailscale, WireGuard : le
 *     collègue est ailleurs, mais les deux machines se voient comme si elles
 *     étaient côte à côte. Si un tunnel est monté sur cette machine, son
 *     adresse apparaît ici, et elle est déjà couverte par le certificat.
 *  3. **Joignable en permanence.** Une instance sur un poste s'éteint avec le
 *     poste. Pour que des collègues travaillent à toute heure, il faut une
 *     machine qui ne dort pas.
 *
 * Ce que cet écran ne fera pas : installer un réseau privé à votre place. Cela
 * demanderait un service extérieur entre vous et vos collègues, ce qui est
 * exactement ce que le produit existe pour éviter. On détecte, on nomme, on
 * explique. Le tunnel reste votre choix, et votre propriété.
 */
function Chemins({ etat }: { etat: EtatReseau }) {
  /*
   * Repli sur `adresses` : une instance ouverte par un profil de déploiement
   * plus ancien que cette version répond sans `propositions`. Une adresse non
   * classée vaut mieux qu'un écran vide.
   */
  const liste: Proposition[] = etat.propositions?.length
    ? etat.propositions
    : etat.adresses.map((url) => ({ url, genre: "local" as const }));
  const locales = liste.filter((p) => p.genre === "local");
  const privees = liste.filter((p) => p.genre === "prive");

  if (liste.length === 0) {
    return (
      <InfoBox tone="warning" className="mt-3" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
        {t("Cette machine n'a aucune adresse réseau utilisable : elle n'est connectée à rien. Branchez-la au réseau, ou activez le Wi-Fi, puis revenez.")}
      </InfoBox>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {locales.length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Wifi size={15} strokeWidth={1.75} />{" "}{t("Vos collègues sont sur le même réseau")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Même Wi-Fi ou même câble que cette machine. Donnez-leur cette adresse : la première est la plus durable, les suivantes servent de secours.")}
          </p>
          <div className="mt-2 space-y-1.5">
            {locales.map((p) => (
              <ACopier key={p.url} valeur={p.url} libelle={t("l'adresse")} />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck size={15} strokeWidth={1.75} />{" "}{t("Vos collègues sont ailleurs")}
        </p>
        {privees.length > 0 ? (
          <>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Un réseau privé est actif sur cette machine. Un collègue qui y est raccordé vous rejoint de n'importe où, par cette adresse.")}
            </p>
            <div className="mt-2 space-y-1.5">
              {privees.map((p) => (
                <ACopier key={p.url} valeur={p.url} libelle={t("l'adresse")} />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Il leur faut alors un lien privé entre vos deux réseaux : le VPN de votre entreprise, ou un réseau privé que vous montez entre vos machines.")}{" "}
            {branding.name}{" "}{t("le détectera tout seul et affichera l'adresse ici, sans réglage de votre part. N'ouvrez pas de port sur votre box pour y arriver plus vite : vous exposeriez votre poste à tout Internet.")}
          </p>
        )}
      </div>

      <InfoBox tone="muted">
        {t("Dans les deux cas, cette machine doit être allumée et")}{" "}{branding.name}{" "}{t("ouvert : c'est elle qui répond. Pour une équipe qui travaille à toute heure, installez l'instance sur une machine qui ne s'éteint pas.")}
      </InfoBox>
    </div>
  );
}

export default OuvrirInstance;
