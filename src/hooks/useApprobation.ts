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
/*
 * Ce que le flux a dit pendant qu'une lecture était en route (28/09/2026).
 * La lecture rend l'état d'avant sa réponse : appliquée telle quelle, elle
 * effaçait une demande arrivée par le flux entre-temps (la carte ne venait
 * jamais), ou remettait une demande à laquelle la personne venait de répondre.
 */
let pendantLecture: { ajoutees: DemandeApprobation[]; retirees: Set<string> } | null = null;
/** Nouvelle lecture après un échec : sans elle, une instance injoignable au démarrage ne rouvrait jamais le flux. */
let reessai: ReturnType<typeof setTimeout> | null = null;
let delaiReessai = 2_000;

function publier(suite: Partial<Magasin>): void {
  magasin = { ...magasin, ...suite };
  for (const fn of abonnes) fn(magasin);
}

/** Interroge l'instance. Les appels concurrents partagent la même requête. */
function sonder(): Promise<void> {
  if (sondageEnCours) return sondageEnCours;
  if (reessai) {
    clearTimeout(reessai);
    reessai = null;
  }
  const notes = { ajoutees: [] as DemandeApprobation[], retirees: new Set<string>() };
  pendantLecture = notes;
  sondageEnCours = fetchApprobation()
    .then((etat) => {
      const lues = etat.enAttente.filter((d) => !notes.retirees.has(d.id));
      const venues = notes.ajoutees.filter((d) => !notes.retirees.has(d.id) && !lues.some((l) => l.id === d.id));
      publier({
        niveau: etat.niveau,
        modifiable: etat.modifiable !== false,
        enAttente: [...lues, ...venues],
        delaiMs: etat.delaiMs,
      });
      delaiReessai = 2_000;
      ouvrirFlux();
    })
    .catch(() => {
      /*
       * Passerelle injoignable : le sélecteur reste muet plutôt que menteur,
       * et on relit un peu plus tard tant qu'un écran l'observe. Avant le
       * 28/09/2026, rien ne relisait : ouverte avant que l'instance réponde
       * (démarrage, instance redémarrée), l'application n'ouvrait jamais le
       * flux, et aucune carte d'accord n'apparaissait sur cet écran.
       */
      if (abonnes.size > 0 && !flux && !reessai) {
        reessai = setTimeout(() => {
          reessai = null;
          void sonder();
        }, delaiReessai);
        delaiReessai = Math.min(delaiReessai * 2, 30_000);
      }
    })
    .finally(() => {
      sondageEnCours = null;
      if (pendantLecture === notes) pendantLecture = null;
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
        pendantLecture?.ajoutees.push(demande);
        publier({
          enAttente: magasin.enAttente.some((d) => d.id === demande.id)
            ? magasin.enAttente
            : [...magasin.enAttente, demande],
        });
        return;
      }
      pendantLecture?.retirees.add(evenement.id);
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
    pendantLecture?.retirees.add(id);
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
