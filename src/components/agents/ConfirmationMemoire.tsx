import { Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { branding } from "@/config/branding";
import type { RaisonElargissement } from "@/lib/employes";
import { t, tf } from "@/lib/i18n";

const RAISON: Record<RaisonElargissement, () => string> = {
  visibilite: () => t("sa visibilité s'élargit"),
  groupes: () => t("des groupes s'ajoutent"),
  messagerie: () => t("on pourra lui écrire sur une messagerie"),
  "mission-mail": () => t("une mission partira à chaque mail reçu"),
  liberte: () => t("sa liberté va au-delà d'« Encadré »"),
  outils: () => t("il aura des outils qui écrivent ou envoient là où d'autres lisent"),
};

/**
 * Confirmation demandée avant qu'un changement élargisse l'audience d'un
 * agent qui a pu lire des documents non ouverts à toute l'équipe
 * (gateway/src/employes.ts, `viderMemoire`). Rien n'est fait avant le clic :
 * l'instance a refusé le changement et attend cette confirmation.
 */
export function ConfirmationMemoire({
  nom,
  raisons,
  occupe,
  onConfirmer,
  onAnnuler,
}: {
  nom: string;
  raisons: RaisonElargissement[];
  occupe: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const liste = raisons.map((r) => RAISON[r]?.() ?? r).join(", ");
  return (
    <InfoBox tone="warning" leading={<Eraser size={16} strokeWidth={1.75} />}>
      <p className="font-medium">{t("Vider sa mémoire d'abord")}</p>
      <p className="mt-1">
        {tf("{0} a pu lire des documents qui ne sont pas ouverts à toute l'équipe, et sa mémoire peut en garder la trace. Avec ce changement ({1}), d'autres personnes pourraient la lui faire répéter.", nom, liste)}
      </p>
      <p className="mt-1">
        {t("Avant qu'il prenne effet,")}{" "}{branding.name}{" "}
        {t("met ses notes de côté (une copie chiffrée, que vous pourrez restaurer s'il redevient aussi fermé qu'aujourd'hui), puis vide sa mémoire : ses notes, les conversations de chacun avec lui chez l'agent, et l'index de sa mémoire. Les échanges affichés dans l'onglet Discuter restent.")}
      </p>
      <p className="mt-1">{t("Si sa mémoire ne peut pas être vidée entièrement, le changement n'est pas fait, et c'est dit ici.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="destructive" disabled={occupe} icon={occupe ? Loader2 : undefined} onClick={onConfirmer}>
          {occupe ? t("Mise de côté…") : t("Vider sa mémoire et continuer")}
        </Button>
        <Button size="sm" variant="ghost" disabled={occupe} onClick={onAnnuler}>
          {t("Annuler")}
        </Button>
      </div>
    </InfoBox>
  );
}
