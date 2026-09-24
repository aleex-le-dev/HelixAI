import { Sun, Moon } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useApparence } from "@/hooks/useApparence";
import { t } from "@/lib/i18n";

/**
 * Bascule clair / sombre, à portée de clic depuis n'importe quel écran.
 *
 * Elle fixe le thème au lieu de le laisser au soleil : quand on l'actionne,
 * c'est qu'on veut décider soi-même, généralement parce que la pièce ne
 * ressemble pas à l'heure qu'il est. Le mode automatique reste disponible dans
 * les réglages, et le libellé du bouton dit où le retrouver.
 */
export function BasculeTheme({ size = 34 }: { size?: number }) {
  const { theme, mode, basculer } = useApparence();
  const versSombre = theme === "clair";

  return (
    <IconButton
      icon={versSombre ? Moon : Sun}
      size={size}
      label={
        (versSombre ? t("Passer au thème sombre") : t("Passer au thème clair")) +
        (mode === "clair" || mode === "sombre"
          ? t(" (automatique dans Réglages, Préférences)")
          : "")
      }
      onClick={basculer}
    />
  );
}

export default BasculeTheme;
