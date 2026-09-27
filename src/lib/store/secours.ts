/**
 * Ce que le stockage du navigateur a refusé de garder (quota dépassé).
 *
 * Revue Linux du 27/09/2026 : sur un bureau sans trousseau, les Chats vivent
 * dans le stockage du navigateur, limité à quelques mégaoctets. Une écriture
 * refusée était abandonnée sans bruit, et rien n'était envoyé à l'instance :
 * les nouveaux Chats disparaissaient au rechargement. La valeur refusée reste
 * désormais en mémoire, c'est elle que l'écran relit et qu'on envoie à
 * l'instance ; au rechargement, c'est l'instance qui la rend.
 */
export const refuseesParLeNavigateur = new Map<string, string>();
