import { cn } from "@/lib/cn";
import { useUtilisateurCourant } from "@/lib/store/identity";

interface AvatarProps {
  size?: number;
  className?: string;
  /** Avatar d'une autre personne : ses initiales… */
  initials?: string;
  /** …sa photo, si son compte en a une… */
  photo?: string;
  /** …et son nom, lu par les lecteurs d'écran. */
  nom?: string;
}

/**
 * Avatar de l'utilisateur, replié sur ses initiales.
 *
 * Lit l'identité réellement connectée : le produit gère plusieurs comptes sur
 * un même poste, afficher les initiales d'un autre serait trompeur. Et il se
 * redessine quand ce compte change de nom : l'avatar de la barre latérale ne
 * se démonte jamais, il aurait sinon gardé les anciennes initiales.
 */
export function Avatar({ size = 32, className, initials, photo, nom }: AvatarProps) {
  const utilisateur = useUtilisateurCourant();
  // Sans initiales, c'est l'avatar de la personne connectée ; avec, celui d'une autre.
  const autre = initials !== undefined;
  const label = autre ? initials : utilisateur.initials;
  const image = autre ? photo : utilisateur.photo;
  const nomLu = autre ? (nom ?? initials) : utilisateur.fullName;
  if (image) {
    return (
      <img
        src={image}
        alt={nomLu}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-15 font-medium text-primary-foreground",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      role="img"
      aria-label={nomLu}
    >
      {label}
    </span>
  );
}

export default Avatar;
