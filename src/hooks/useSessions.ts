import { useCallback, useEffect, useMemo, useState } from "react";
import { currentUser } from "@/lib/store/identity";
import {
  archiverSession,
  deleteSession,
  estArchivee,
  renommerSession,
  visibleTo,
  type Session,
} from "@/lib/store/sessions";

/** Événement interne émis quand une session est créée ou mise à jour. */
export const SESSIONS_CHANGED = "helix:sessions-changed";

export function notifySessionsChanged(): void {
  window.dispatchEvent(new Event(SESSIONS_CHANGED));
}

/**
 * Sessions visibles par l'utilisateur connecté (les siennes + les partagées),
 * séparées en deux listes : celles de la barre latérale, et ses archives.
 */
export function useSessions() {
  const [toutes, setToutes] = useState<Session[]>(() => visibleTo(currentUser()));

  const refresh = useCallback(() => {
    setToutes(visibleTo(currentUser()));
  }, []);

  useEffect(() => {
    window.addEventListener(SESSIONS_CHANGED, refresh);
    // Un autre onglet ou fenêtre a modifié le stockage.
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const { sessions, archivees } = useMemo(() => {
    const moi = currentUser();
    return {
      sessions: toutes.filter((s) => !estArchivee(s, moi)),
      archivees: toutes.filter((s) => estArchivee(s, moi)),
    };
  }, [toutes]);

  const remove = useCallback(
    (id: string) => {
      deleteSession(id);
      refresh();
    },
    [refresh],
  );

  const archiver = useCallback(
    (id: string, archivee: boolean) => {
      archiverSession(id, currentUser(), archivee);
      refresh();
    },
    [refresh],
  );

  const renommer = useCallback(
    (id: string, titre: string) => {
      renommerSession(id, titre);
      refresh();
    },
    [refresh],
  );

  return { sessions, archivees, refresh, remove, archiver, renommer };
}
