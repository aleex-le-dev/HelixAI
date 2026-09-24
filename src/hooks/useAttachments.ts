import { useCallback, useState } from "react";
import { lireFichiers, type Attachment, type AttachmentError } from "@/lib/attachments";
import { useModels } from "@/hooks/useModels";
import { t, tf } from "@/lib/i18n";

/**
 * Pièces jointes en attente d'envoi.
 *
 * Le point délicat est l'image : seul un modèle de vision sait la lire. Joindre
 * une capture à un modèle de conversation ne produit pas d'erreur — il répond à
 * côté, ce qui est pire. On le dit avant l'envoi.
 */
export function useAttachments(modelUid?: string) {
  const [pieces, setPieces] = useState<Attachment[]>([]);
  const [erreurs, setErreurs] = useState<AttachmentError[]>([]);
  const { models } = useModels();

  const ajouter = useCallback(async (fichiers: File[]) => {
    const { pieces: lues, erreurs: refus } = await lireFichiers(fichiers);
    setPieces((actuelles) => [...actuelles, ...lues]);
    setErreurs(refus);
  }, []);

  const retirer = useCallback((index: number) => {
    setPieces((actuelles) => actuelles.filter((_, i) => i !== index));
  }, []);

  const vider = useCallback(() => {
    setPieces([]);
    setErreurs([]);
  }, []);

  /*
   * Le modèle courant sait-il lire une image ? Sans modèle choisi, la
   * passerelle décidera : on ne prétend rien.
   */
  const modele = models.find((m) => m.uid === modelUid);
  const voitLesImages =
    !modelUid || !modele
      ? true
      : modele.roles.includes("vision") || modele.roles.includes("gui");

  const avertissementImage =
    !voitLesImages && pieces.some((p) => p.type === "image")
      ? tf("{0} ne sait pas lire les images. Choisissez un modèle de vision, ", modele?.id ?? "Ce modèle") +
        t("sinon il répondra sans avoir vu la vôtre.")
      : null;

  return { pieces, erreurs, avertissementImage, ajouter, retirer, vider };
}
