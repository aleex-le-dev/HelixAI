import { t } from "@/lib/i18n";

/**
 * Réduit une image à un carré de 256 pixels (recadrage au centre), en JPEG :
 * quelques dizaines de Ko. Sert à la photo de profil d'un compte
 * (ParametresPages.tsx) et, depuis le 27/09/2026, à celle d'un agent.
 */
export function reduirePhoto(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      const cote = Math.min(image.naturalWidth, image.naturalHeight);
      const toile = document.createElement("canvas");
      toile.width = 256;
      toile.height = 256;
      const ctx = toile.getContext("2d");
      if (!ctx) return reject(new Error("Image illisible."));
      ctx.drawImage(image, (image.naturalWidth - cote) / 2, (image.naturalHeight - cote) / 2, cote, cote, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      resolve(toile.toDataURL("image/jpeg", 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t("Ce fichier n'est pas une image lisible.")));
    };
    image.src = url;
  });
}

/** Une photo acceptable : une image intégrée, JPEG, PNG ou WebP, de taille raisonnable. */
export const photoValide = (v: unknown): v is string =>
  typeof v === "string" && v.length < 200_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
