import { useCallback, useEffect, useState } from "react";
import {
  listerSessionsCode,
  retirerSessionCode,
  signalerSessionsCode,
  SESSIONS_CODE_CHANGEES,
  type SessionCodeResume,
} from "@/lib/code";

/**
 * Les sessions de Helix Code de la personne connectée, séparées des Chats
 * (gateway/src/sessionsCode.ts). Relues à chaque changement signalé
 * (`signalerSessionsCode`) : ouverture, demande, retrait.
 *
 * Une liste qu'on n'a pas pu lire reste la précédente, avec l'erreur : elle ne
 * devient jamais vide par accident.
 */
export function useSessionsCode(actif = true) {
  const [sessions, setSessions] = useState<SessionCodeResume[]>([]);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();

  const relire = useCallback(() => {
    listerSessionsCode()
      .then((liste) => {
        setSessions(liste);
        setErreur(undefined);
      })
      .catch((err: unknown) => setErreur(err instanceof Error ? err.message : String(err)))
      .finally(() => setCharge(true));
  }, []);

  useEffect(() => {
    if (!actif) return;
    relire();
    window.addEventListener(SESSIONS_CODE_CHANGEES, relire);
    return () => window.removeEventListener(SESSIONS_CODE_CHANGEES, relire);
  }, [actif, relire]);

  const retirer = useCallback(async (id: string) => {
    const ok = await retirerSessionCode(id);
    if (ok) signalerSessionsCode();
    return ok;
  }, []);

  return { sessions, charge, erreur, retirer };
}

/** Sessions rangées par dossier de projet, le dossier le plus récemment utilisé d'abord. */
export function parDossier(sessions: SessionCodeResume[]): { dossier: string; sessions: SessionCodeResume[] }[] {
  const groupes = new Map<string, SessionCodeResume[]>();
  for (const s of sessions) groupes.set(s.dossier, [...(groupes.get(s.dossier) ?? []), s]);
  return [...groupes.entries()]
    .map(([dossier, liste]) => ({ dossier, sessions: liste.sort((a, b) => b.maj.localeCompare(a.maj)) }))
    .sort((a, b) => b.sessions[0]!.maj.localeCompare(a.sessions[0]!.maj));
}
