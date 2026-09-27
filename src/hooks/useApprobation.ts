import { useCallback, useEffect, useState } from "react";
import {
  fetchApprobation,
  repondreApprobation,
  setNiveauApprobation,
  subscribeApprobation,
  type DemandeApprobation,
  type NiveauApprobation,
} from "@/lib/gateway";

/**
 * Approbation des actions de l'agent, côté interface.
 *
 * L'état est **partagé par toute l'application**, comme celui du contrôle de
 * l'écran : un seul flux d'évènements est ouvert quel que soit le nombre
 * d'écrans qui l'observent. La barre du composer, la carte d'approbation et
 * les réglages parlent ainsi de la même chose au même instant.
 *
 * Ce que garde ce module n'a aucune autorité : le niveau qui compte est celui
 * de la passerelle, et c'est elle qui met les actions en attente. Ici on
 * affiche, et on transmet la réponse.
 */

interface Magasin {
  niveau: NiveauApprobation | null;
  /** Faux : le niveau se lit, mais seul l'administrateur le change (index.ts). */
  modifiable: boolean;
  enAttente: DemandeApprobation[];
  /** Délai avant qu'une demande sans réponse soit considérée comme refusée. */
  delaiMs: number;
}

let magasin: Magasin = { niveau: null, modifiable: false, enAttente: [], delaiMs: 120_000 };
const abonnes = new Set<(m: Magasin) => void>();
let flux: (() => void) | null = null;
let sondageEnCours: Promise<void> | null = null;

function publier(suite: Partial<Magasin>): void {
  magasin = { ...magasin, ...suite };
  for (const fn of abonnes) fn(magasin);
}

/** Interroge l'instance. Les appels concurrents partagent la même requête. */
function sonder(): Promise<void> {
  if (sondageEnCours) return sondageEnCours;
  sondageEnCours = fetchApprobation()
    .then((etat) => {
      publier({
        niveau: etat.niveau,
        modifiable: etat.modifiable !== false,
        enAttente: etat.enAttente,
        delaiMs: etat.delaiMs,
      });
      ouvrirFlux();
    })
    .catch(() => {
      /* passerelle injoignable : le sélecteur reste muet plutôt que menteur */
    })
    .finally(() => {
      sondageEnCours = null;
    });
  return sondageEnCours;
}

function ouvrirFlux(): void {
  if (flux) return;
  /*
   * Relu à chaque reprise du flux (27/09/2026). Vu en essayant l'écran Code :
   * la passerelle redémarrée pendant qu'une carte attendait, la carte restait
   * affichée pour une demande qui n'existait plus ; « Autoriser » n'y faisait
   * rien, sans le dire. Une coupure ne transmet ni la réponse donnée ailleurs
   * ni l'oubli : seul l'état relu le dit. La première ouverture suit déjà une
   * lecture (`sonder`).
   */
  let premiere = true;
  flux = subscribeApprobation(
    (evenement) => {
      if (evenement.type === "approbation_demandee") {
        const { type: _type, ...demande } = evenement;
        publier({
          enAttente: magasin.enAttente.some((d) => d.id === demande.id)
            ? magasin.enAttente
            : [...magasin.enAttente, demande],
        });
        return;
      }
      publier({ enAttente: magasin.enAttente.filter((d) => d.id !== evenement.id) });
    },
    () => {
      if (premiere) {
        premiere = false;
        return;
      }
      void sonder();
    },
  );
}

export function useApprobation() {
  const [etat, setEtat] = useState<Magasin>(magasin);

  useEffect(() => {
    abonnes.add(setEtat);
    if (!magasin.niveau) void sonder();
    return () => {
      abonnes.delete(setEtat);
    };
  }, []);

  /*
   * La demande disparaît de l'écran avant que la passerelle ait confirmé :
   * l'utilisateur a répondu, laisser la carte sous ses yeux l'inviterait à
   * cliquer une seconde fois sur une demande déjà tranchée.
   */
  const repondre = useCallback(async (id: string, accord: boolean) => {
    publier({ enAttente: magasin.enAttente.filter((d) => d.id !== id) });
    // Réponse perdue (instance injoignable) : la demande attend toujours là-bas, la carte revient si elle y est encore.
    if (!(await repondreApprobation(id, accord))) await sonder();
  }, []);

  /** Rend le message de refus, s'il y en a un (réservé à l'administrateur). */
  const changerNiveau = useCallback(async (niveau: NiveauApprobation): Promise<string | null> => {
    let refus: string | null = null;
    try {
      await setNiveauApprobation(niveau);
    } catch (err) {
      refus = err instanceof Error ? err.message : String(err);
    }
    // On relit plutôt que de croire : c'est la passerelle qui fait foi.
    publier({ niveau: null });
    await sonder();
    return refus;
  }, []);

  return {
    niveau: etat.niveau,
    modifiable: etat.modifiable,
    enAttente: etat.enAttente,
    delaiMs: etat.delaiMs,
    repondre,
    changerNiveau,
    rafraichir: sonder,
  };
}
