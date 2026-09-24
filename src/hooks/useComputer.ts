import { useEffect, useState, useCallback } from "react";
import {
  capability,
  subscribe,
  answer,
  type Action,
  type Capability,
} from "@/lib/computer";

export interface PendingAction {
  id: string;
  action: Action;
}

/**
 * Contrôle de l'écran : état des autorisations et demandes d'approbation.
 *
 * L'état est **partagé par toute l'application** : sonder l'instance revient à
 * prendre une capture d'écran, et il n'y a aucune raison de le faire une fois
 * par composant monté. Un seul flux d'événements est ouvert, quel que soit le
 * nombre d'écrans qui l'observent.
 */

interface Store {
  capability: Capability | null;
  pending: PendingAction[];
  journal: { texte: string; ok: boolean }[];
}

let store: Store = { capability: null, pending: [], journal: [] };
const abonnes = new Set<(s: Store) => void>();
let flux: (() => void) | null = null;
let sondageEnCours: Promise<void> | null = null;

function publier(next: Partial<Store>): void {
  store = { ...store, ...next };
  for (const fn of abonnes) fn(store);
}

/** Sonde l'instance. Les appels concurrents partagent la même requête. */
function sonder(): Promise<void> {
  if (sondageEnCours) return sondageEnCours;
  sondageEnCours = capability()
    .then((c) => {
      publier({
        capability: c,
        pending: c.enAttente.map(({ id, action }) => ({ id, action })),
      });
      ouvrirFlux(c);
    })
    .finally(() => {
      sondageEnCours = null;
    });
  return sondageEnCours;
}

/** Ouvre le flux d'approbations, une seule fois et seulement s'il sert. */
function ouvrirFlux(c: Capability): void {
  if (flux || c.mode === "desactive") return;

  flux = subscribe((event) => {
    if (event.type === "approbation_demandee") {
      publier({
        pending: store.pending.some((p) => p.id === event.id)
          ? store.pending
          : [...store.pending, { id: event.id, action: event.action }],
      });
    } else if (event.type === "approbation_resolue" || event.type === "approbation_expiree") {
      publier({ pending: store.pending.filter((p) => p.id !== event.id) });
    } else if (event.type === "action_fin") {
      publier({
        journal: [{ texte: event.message, ok: event.ok }, ...store.journal].slice(0, 30),
      });
    }
  });
}

export function useComputer() {
  const [state, setState] = useState<Store>(store);

  useEffect(() => {
    abonnes.add(setState);
    if (!store.capability) void sonder();
    return () => {
      abonnes.delete(setState);
    };
  }, []);

  const repondre = useCallback(async (id: string, accord: boolean) => {
    publier({ pending: store.pending.filter((p) => p.id !== id) });
    await answer(id, accord);
  }, []);

  return {
    capability: state.capability,
    disponible: Boolean(state.capability?.disponible),
    pending: state.pending,
    journal: state.journal,
    repondre,
    refresh: sonder,
  };
}
