import { useCallback, useEffect, useState } from "react";
import { fetchModels, type GatewayModel } from "@/lib/gateway";

interface State {
  models: GatewayModel[];
  loading: boolean;
  error?: string;
}

/**
 * Modèles réellement disponibles, vus par la passerelle.
 * Ne conserve que ceux utilisables en conversation (les modèles
 * d'embeddings ou de contrôle d'écran ne sont pas proposés à l'utilisateur).
 */
export function useModels() {
  const [state, setState] = useState<State>({ models: [], loading: true });

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    fetchModels()
      .then((all) => {
        setState({
          models: all.filter((m) => m.roles.includes("chat") || m.roles.includes("code")),
          loading: false,
        });
      })
      .catch((err: unknown) => {
        setState({
          models: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }, []);

  useEffect(refresh, [refresh]);

  return { ...state, refresh };
}
