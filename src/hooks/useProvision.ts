import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/endpoint";
import { ouvrirFlux } from "@/lib/flux";

export interface Hardware {
  platform: string;
  arch: string;
  totalMemoryGb: number;
  cpuCount: number;
  appleSilicon: boolean;
}

export interface CatalogEntry {
  key: string;
  label: string;
  minMemoryGb: number;
  downloadGb: number;
  description: string;
}

export type ProvisionPhase =
  | "idle"
  | "checking"
  | "downloading"
  | "loading"
  | "ready"
  | "error";

export interface ProvisionState {
  phase: ProvisionPhase;
  message: string;
  percent?: number;
  model?: string;
  error?: string;
}

interface Status {
  hardware: Hardware;
  recommended: CatalogEntry;
  catalog: CatalogEntry[];
  hasChatModel: boolean;
  /** Le moteur d'exécution des modèles est-il présent sur la machine ? */
  moteurInstalle: boolean;
  state: ProvisionState;
}

/**
 * Provisionnement du modèle local : profil machine, recommandation, et suivi
 * de l'installation en direct (ARCHITECTURE.md, ADR-009).
 */
export function useProvision() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<ProvisionState>({ phase: "idle", message: "" });
  const [unreachable, setUnreachable] = useState(false);
  /** Fermeture du flux ouvert, s'il y en a un (lib/flux.ts). */
  const sourceRef = useRef<(() => void) | null>(null);

  /** `suivre`, pour `load` (défini après lui). */
  const suivreRef = useRef<() => void>(() => {});

  const load = useCallback(() => {
    apiFetch(`/helix/provision`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Status) => {
        setStatus(data);
        setState(data.state);
        setUnreachable(false);
        /*
         * Une installation en cours (écran rouvert pendant un téléchargement,
         * ou modèle enchaîné après le moteur) : on suit sa progression, sans
         * quoi l'écran reste figé sur cette photo (MacBook, 27/09/2026).
         */
        if (["checking", "downloading", "loading"].includes(data.state.phase) && !sourceRef.current) suivreRef.current();
      })
      .catch(() => setUnreachable(true));
  }, []);

  useEffect(load, [load]);

  /**
   * Ouvre le flux de progression. Moteur et modèles empruntent le même : la
   * mise en route est une seule séquence aux yeux de l'utilisateur.
   */
  const suivre = useCallback(() => {
    sourceRef.current?.();
    sourceRef.current = ouvrirFlux(
      "/helix/provision/stream",
      (donnees) => {
        try {
          const next = JSON.parse(donnees) as ProvisionState;
          setState(next);
          if (next.phase === "ready" || next.phase === "error") {
            sourceRef.current?.();
            sourceRef.current = null;
            load();
          }
        } catch {
          /* fragment ignoré */
        }
      },
      // Pas de reprise : l'installation se relance à la main, pas toute seule.
      { reprendre: false, onErreur: () => { sourceRef.current = null; } },
    );
  }, [load]);
  suivreRef.current = suivre;

  /** Lance le téléchargement d'un modèle et suit la progression. */
  const start = useCallback(
    (model?: string) => {
      suivre();
      void apiFetch(`/helix/provision/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      }).catch(() => setUnreachable(true));
    },
    [suivre],
  );

  /**
   * Installe le moteur d'exécution des modèles (LM Studio). La personne, ou
   * son organisation, en accepte les conditions : la passerelle refuse sans cet accord.
   */
  const installerMoteur = useCallback(() => {
    suivre();
    void apiFetch(`/helix/provision/moteur`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conditionsAcceptees: true }),
    }).catch(() => setUnreachable(true));
  }, [suivre]);

  useEffect(() => () => sourceRef.current?.(), []);

  return { status, state, unreachable, start, installerMoteur, refresh: load };
}
