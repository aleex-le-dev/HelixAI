import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Mail, TriangleAlert, X } from "lucide-react";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { ACopier } from "@/components/ui/ACopier";
import { branding } from "@/config/branding";
import { formaterDate } from "@/lib/formats";
import {
  annulerInvitation,
  inviter,
  invitationsEnAttente,
  type Invitation,
  type InvitationCreee,
} from "@/lib/invitations";
import { t } from "@/lib/i18n";

/**
 * Inviter un collègue sur l'instance.
 *
 * ── Ce que cet écran remplace ───────────────────────────────────────────────
 *
 * Rien. C'est le trou du parcours : pour qu'un collègue rejoigne l'instance,
 * il lui fallait le **jeton d'instance**, qu'aucun écran ne montrait — il
 * fallait aller le lire dans un fichier, en ligne de commande, sur la machine
 * hôte. Puis un compte, qu'il ne pouvait pas ouvrir lui-même.
 *
 * ── Ce qu'il fait ───────────────────────────────────────────────────────────
 *
 * Une adresse, un bouton. L'instance crée un code lié à cette adresse et le lui
 * envoie par mail, avec l'adresse de l'instance et la marche à suivre. Le
 * collègue saisit ces deux lignes, choisit **son** mot de passe, et c'est tout.
 *
 * Sans boîte aux lettres branchée, l'écran ne prétend pas avoir envoyé : il
 * affiche les deux lignes à transmettre de vive voix.
 */
export function InviterCollegue() {
  const [email, setEmail] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [attente, setAttente] = useState<Invitation[]>([]);
  const [creee, setCreee] = useState<InvitationCreee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(() => {
    void invitationsEnAttente().then(setAttente);
  }, []);
  useEffect(recharger, [recharger]);

  const envoyer = async () => {
    setOccupe(true);
    setErreur(null);
    setCreee(null);
    const r = await inviter(email);
    setOccupe(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    setCreee(r.valeur);
    setEmail("");
    recharger();
  };

  const retirer = async (adresse: string) => {
    await annulerInvitation(adresse);
    recharger();
  };

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Mail size={18} strokeWidth={1.75} />{" "}{t("Inviter un collègue")}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Il recevra un code par mail. Avec lui, il rattache son poste et ouvre son compte en choisissant son propre mot de passe : vous ne le connaîtrez pas, et il n'a rien d'autre à vous demander.")}
      </p>

      <div className="mt-4">
        <Field label={t("Adresse email")}>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder={t("collegue@entreprise.fr")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !occupe && email.trim()) void envoyer();
              }}
            />
            <Button
              icon={occupe ? Loader2 : Mail}
              className="shrink-0"
              disabled={occupe || !email.trim()}
              onClick={() => void envoyer()}
            >
              {occupe ? t("Envoi...") : t("Inviter")}
            </Button>
          </div>
        </Field>
      </div>

      {erreur && (
        <InfoBox tone="warning" className="mt-3" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}

      {creee && (
        <InfoBox
          tone={creee.envoye ? "info" : "warning"}
          className="mt-3"
          leading={
            creee.envoye ? (
              <Check size={15} strokeWidth={2.5} />
            ) : (
              <TriangleAlert size={15} strokeWidth={1.75} />
            )
          }
        >
          {creee.envoye ? (
            <>
              {t("Invitation envoyée à")}{" "}{creee.email}{t(". Le mail porte un lien qui la connecte en un clic, et un code valable sept jours, pour un seul usage. Ils ne s'affichent pas ici : c'est ce qui prouve que la personne lit bien cette adresse.")}
            </>
          ) : (
            <>{creee.motif}{" "}{t("Transmettez-lui ce lien :")}</>
          )}
          {/*
            Le lien d'abord : cliqué, il remplit les deux champs tout seul, et
            collé, il fait la même chose. L'adresse et le code restent dessous,
            parce qu'ils se dictent au téléphone, ce qu'un lien ne fait pas.
          */}
          {creee.lien && creee.code && (
            <div className="mt-2 space-y-1.5">
              <ACopier
                valeur={creee.lien}
                libelle={t("le lien")}
                note={t("Un clic suffit si l'application est installée.")}
              />
              <ACopier valeur={creee.adresse} libelle={t("l'adresse")} note={t("À saisir à la main.")} />
              <ACopier valeur={creee.code} libelle={t("le code")} note={t("Sept jours, un seul usage.")} />
            </div>
          )}
        </InfoBox>
      )}

      {attente.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium text-foreground">{t("Invitations en attente")}</p>
          <ul className="mt-2 space-y-1.5">
            {attente.map((i) => (
              <li
                key={i.email}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{i.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("Valable jusqu'au")}{" "}{formaterDate(i.expire)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={X}
                  onClick={() => void retirer(i.email)}
                >
                  {t("Annuler")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {t("Le code ne quitte pas votre organisation : c'est votre instance qui l'envoie, depuis la boîte aux lettres que vous y avez branchée.")}{" "}{branding.name}{" "}{t("ne contacte aucun service tiers pour cela.")}
      </p>
    </Card>
  );
}

export default InviterCollegue;
