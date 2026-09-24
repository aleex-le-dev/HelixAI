/**
 * Nom du produit dans les messages de la passerelle.
 *
 * Le produit est livré en marque blanche : un message qui dirait « Helix
 * refuse de continuer » chez un client qui connaît l'application sous un autre
 * nom trahirait la marque sous-jacente, et le modèle le répéterait. L'application
 * de bureau transmet son nom au lancement (`HELIX_NOM_PRODUIT`, tiré de
 * `productName`) ; sans lui, un repli neutre.
 */

const nomTransmis = (): string | undefined => process.env.HELIX_NOM_PRODUIT?.trim() || undefined;

/** Dans une phrase : « autorisez Marque dans… », « connectée à l'application ». */
export const nomProduit = (): string => nomTransmis() ?? "l'application";

/** En début de phrase : « Marque refuse… », « L'application refuse… ». */
export const NomProduit = (): string => nomTransmis() ?? "L'application";
