import { useCallback, useEffect, useMemo, useState } from "react";
import { currentUser } from "@/lib/store/identity";
import {
  competencesVisibles,
  consignesDesCompetences,
  creerCompetence,
  modifierCompetence,
  supprimerCompetence,
  type Competence,
} from "@/lib/store/competences";

const CHANGE = "helix:competences-changed";

function prevenir(): void {
  window.dispatchEvent(new Event(CHANGE));
}

/**
 * Compétences visibles, et le bloc de consignes qui en découle.
 *
 * Le même événement sert aux écritures locales et à la synchronisation
 * (`sync.ts`) : une compétence écrite par un collègue sur un autre poste
 * rafraîchit cet écran sans qu'il ait à savoir d'où elle vient.
 */
export function useCompetences() {
  const [liste, setListe] = useState<Competence[]>(() => competencesVisibles(currentUser()));

  const relire = useCallback(() => setListe(competencesVisibles(currentUser())), []);

  useEffect(() => {
    window.addEventListener(CHANGE, relire);
    return () => window.removeEventListener(CHANGE, relire);
  }, [relire]);

  const creer = useCallback((donnees: Parameters<typeof creerCompetence>[1]) => {
    const c = creerCompetence(currentUser(), donnees);
    prevenir();
    return c;
  }, []);

  const modifier = useCallback((id: string, changements: Partial<Competence>) => {
    modifierCompetence(id, changements);
    prevenir();
  }, []);

  const supprimer = useCallback((id: string) => {
    supprimerCompetence(id);
    prevenir();
  }, []);

  /** Ce qui partira dans les consignes du modèle, ou null s'il n'y a rien. */
  const consignes = useMemo(() => consignesDesCompetences(liste), [liste]);

  return { competences: liste, consignes, creer, modifier, supprimer, relire };
}
