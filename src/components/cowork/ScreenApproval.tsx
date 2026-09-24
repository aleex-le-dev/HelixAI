import { MousePointerClick, ShieldCheck } from "lucide-react";
import { CarteApprobation } from "@/components/cowork/CarteApprobation";
import { ToolApproval } from "@/components/cowork/ToolApproval";
import { describe, MODE_LABEL, type Action } from "@/lib/computer";
import { useComputer } from "@/hooks/useComputer";
import { t, tf } from "@/lib/i18n";

const RISQUE: Partial<Record<Action["action"], string>> = {
  saisir: t("Le texte part dans la fenêtre au premier plan, quelle qu'elle soit."),
  touche: t("Un raccourci peut déclencher une commande de l'application active."),
  glisser: t("Un glisser peut déplacer un fichier ou modifier une sélection."),
  double_cliquer: t("Un double-clic ouvre l'élément visé."),
  clic_droit: t("Un clic droit ouvre un menu contextuel."),
};

/**
 * Demande d'accord avant une action sur l'écran.
 *
 * Monté à la racine de l'application : l'agent peut travailler pendant que
 * l'utilisateur consulte un autre écran, la demande le suit. Tant que personne
 * ne répond, l'action ne part pas.
 *
 * C'est aussi le point de montage de la demande d'approbation des outils de
 * fichiers : les deux cartes occupent le même emplacement, et deux cartes
 * empilées au même endroit seraient illisibles. Une seule question à la fois
 * donc, l'écran d'abord puisqu'il agit sur la machine entière.
 */
export function ScreenApproval() {
  const { capability, pending, repondre } = useComputer();
  const demande = pending[0];

  if (!demande || !capability) return <ToolApproval />;

  const cible = capability.mode === "sandbox" ? t("la machine virtuelle") : t("votre machine");

  return (
    <CarteApprobation
      icone={<MousePointerClick size={16} strokeWidth={1.75} />}
      titre={tf("Cowork veut agir sur {0}", cible)}
      phrase={describe(demande.action)}
      note={
        // Dans la machine de l'agent, un accord couvre la demande entière (computer.ts) : on le dit avant le clic.
        capability.mode === "sandbox"
          ? t("« Autoriser » vaut pour toute cette demande, dans la machine de l'agent, isolée de votre ordinateur.")
          : RISQUE[demande.action.action]
      }
      pied={
        <>
          <ShieldCheck size={12} strokeWidth={1.75} />
          {MODE_LABEL[capability.mode]}
          {pending.length > 1 && tf(" · {0} autre(s) en attente", pending.length - 1)}
        </>
      }
      onApprouver={() => void repondre(demande.id, true)}
      onRefuser={() => void repondre(demande.id, false)}
    />
  );
}

export default ScreenApproval;
