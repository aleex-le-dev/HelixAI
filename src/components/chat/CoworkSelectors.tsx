import { useState } from "react";
import { ShieldCheck, Hand, CircleAlert, ShieldAlert } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Popover } from "@/components/ui/Popover";
import { useApprobation } from "@/hooks/useApprobation";
import type { NiveauApprobation } from "@/lib/gateway";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/** Ligne d'option (icone + titre + description) commune aux popovers Cowork. */
function OptionRow({
  icon,
  title,
  description,
  selected,
  onClick,
  disabled,
  titre,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected?: boolean;
  onClick?: () => void;
  /** Option affichée mais non disponible : elle doit le montrer, pas le taire. */
  disabled?: boolean;
  /** Raison de l'indisponibilité, en infobulle. */
  titre?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titre}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-45" : "hover:bg-muted",
        selected && "bg-muted/60",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

/**
 * Niveau d'approbation des actions de Cowork.
 *
 * Le sélecteur a longtemps montré trois options cliquables dont aucune
 * n'agissait, « Approuver pour moi » coché en dur : sur un réglage de sécurité,
 * c'est la pire des illusions. Les trois niveaux existent maintenant pour de
 * bon, et ce composant ne fait que les afficher et les changer.
 *
 * La barrière, elle, est dans la passerelle : c'est elle qui garde le niveau et
 * qui met les actions en attente. Un contrôle posé ici ne protégerait de rien,
 * puisqu'il suffirait d'appeler la route de conversation en direct pour le
 * contourner.
 */
const NIVEAUX: {
  valeur: NiveauApprobation;
  titre: string;
  resume: string;
  description: string;
  icone: React.ReactNode;
}[] = [
  {
    valeur: "tout",
    titre: t("Tout approuver"),
    resume: t("Sans approbation"),
    description: t("L'agent agit sans vous demander, sauf pour ce qui se confirme toujours (supprimer un événement, par exemple)."),
    icone: <CircleAlert size={17} strokeWidth={1.75} className="text-warning" />,
  },
  {
    valeur: "modifications",
    titre: t("Demander avant de modifier"),
    resume: t("Approbation avant modification"),
    description:
      t("Il lit et explore librement. Écrire, déplacer ou créer vous est soumis."),
    icone: <Hand size={17} strokeWidth={1.75} className="text-muted-foreground" />,
  },
  {
    valeur: "chaque",
    titre: t("Demander pour tout"),
    resume: t("Approbation systématique"),
    description: t("Chaque appel d'outil vous est soumis, lectures comprises."),
    icone: <ShieldAlert size={17} strokeWidth={1.75} className="text-muted-foreground" />,
  },
];

export function ApprovalSelector() {
  const [open, setOpen] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const { niveau, modifiable, changerNiveau } = useApprobation();

  // Tant que l'instance n'a pas répondu, on n'affiche aucun niveau : annoncer
  // une protection qu'on n'a pas vérifiée serait revenir au défaut d'origine.
  if (!niveau) return null;

  const courant = NIVEAUX.find((n) => n.valeur === niveau) ?? NIVEAUX[1];

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      side="bottom"
      coteFixe
      width={340}
      trigger={(p) => (
        <Chip
          leading={<ShieldCheck size={15} strokeWidth={1.75} />}
          onClick={p.onClick}
          active={open}
          aria-expanded={p["aria-expanded"]}
        >
          {courant.resume}
        </Chip>
      )}
    >
      <p className="px-2.5 pb-1 pt-1 text-sm font-semibold text-foreground">
        {t("Ce que l'agent peut faire sans vous")}
      </p>
      {NIVEAUX.map((option) => (
        <OptionRow
          key={option.valeur}
          icon={option.icone}
          title={option.titre}
          description={option.description}
          selected={option.valeur === niveau}
          disabled={!modifiable && option.valeur !== niveau}
          onClick={() => {
            if (!modifiable) return;
            void changerNiveau(option.valeur).then((m) => {
              setRefus(m);
              if (!m) setOpen(false);
            });
          }}
        />
      ))}
      {(!modifiable || refus) && (
        <p className="px-2.5 pt-1 text-xs leading-relaxed text-warning">
          {refus ?? t("Seul l'administrateur de l'instance peut changer ce niveau : il vaut pour les agents de tous ses membres.")}
        </p>
      )}
      <p className="border-t border-border px-2.5 pb-1 pt-2 text-xs leading-relaxed text-muted-foreground">
        {t("Vaut pour toute l'instance, et reste après un redémarrage.")}
      </p>
    </Popover>
  );
}
