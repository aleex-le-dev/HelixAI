import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
  /** Réglage affiché mais sans effet possible pour l'instant : il doit se montrer inactif. */
  disabled?: boolean;
}

/** Interrupteur (toggle) accessible. */
export function Switch({ checked, onChange, label, id, disabled }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-neutral-80",
      )}
    >
      {/*
        La pastille prend `popover` (blanc pur en clair, comme avant) plutot
        qu'un blanc en dur : en theme sombre le rail actif devient lui-meme
        clair, une pastille blanche y disparaissait purement et simplement.
      */}
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-popover shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export default Switch;
