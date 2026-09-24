import { Construction } from "lucide-react";
import { t } from "@/lib/i18n";

/** Page temporaire pour les ecrans construits en Phase 4. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Construction size={22} strokeWidth={1.5} className="text-muted-foreground" />
      </span>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{t("Écran en cours de construction.")}</p>
    </div>
  );
}

export default PlaceholderPage;
