import { useEffect, useState } from "react";
import { t, tf } from "@/lib/i18n";

/*
 * Durées affichées, dans la langue de lecture.
 *
 * Demandé par Medhi le 27/09/2026 : « on voit jamais le temps que les choses
 * ont pris à être faites, comme avec Claude ou GPT ». Le Chat montre donc la
 * durée de la réflexion, de chaque outil et de la réponse entière. Une seule
 * façon de les écrire, partagée avec le panneau de suivi de Code (qui avait
 * la sienne dans lib/code.ts) : « 12 s » ici et « 12 secondes » là-bas
 * auraient l'air de deux mesures différentes.
 */

/** « 45 s », « 2 min 05 s », « 1 h 03 min ». */
export function dureeCourte(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return tf("{0} s", s);
  const m = Math.floor(s / 60);
  if (m < 60) return tf("{0} min {1} s", m, String(s % 60).padStart(2, "0"));
  return tf("{0} h {1} min", Math.floor(m / 60), String(m % 60).padStart(2, "0"));
}

/**
 * Une durée mesurée, une fois finie : comme `dureeCourte`, sauf sous la
 * seconde. Une lecture de fichier prend souvent 30 ms ; « 0 s » aurait l'air
 * d'une mesure ratée, et arrondir à « 1 s » inventerait du temps.
 */
export function dureeMesuree(ms: number): string {
  return ms < 1000 ? t("moins d'1 s") : dureeCourte(ms);
}

/**
 * L'heure, rafraîchie chaque seconde tant que `actif` : de quoi faire avancer
 * un compteur (« Réflexion en cours... 8 s ») sans que la réponse elle-même
 * ait à changer. À l'arrêt, plus de minuterie : un Chat de cent réponses
 * finies ne se redessine pas chaque seconde pour rien.
 */
export function useMaintenant(actif: boolean): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (!actif) return;
    setMaintenant(Date.now());
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(minuterie);
  }, [actif]);
  return maintenant;
}
