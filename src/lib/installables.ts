import { apiFetch } from "./endpoint";

/** Un modèle que la machine peut faire tourner et qu'on peut encore ajouter. */
export interface ModeleInstallable {
  key: string;
  label: string;
  description: string;
  downloadGb: number;
  role: "chat" | "gui";
  recommande: boolean;
  editeur: string;
  licence: string;
  /** Note ECI d'Epoch AI (gateway/src/notesModeles.ts) ; absente quand Epoch ne note pas ce modèle. */
  eci?: number;
  vision?: boolean;
  /** Essayé avec Helix (raisonnement, outils) ; sinon proposé en le disant. */
  verifie: boolean;
}

export interface EtatInstallation {
  phase: string;
  message: string;
  percent?: number;
  model?: string;
  error?: string;
}

interface Reponse {
  installables?: ModeleInstallable[];
  state?: EtatInstallation;
  managed?: boolean;
  moteurInstalle?: boolean;
}

/**
 * Modèles adaptés à la machine et pas encore installés, avec l'état de
 * l'installation en cours. Liste vide si l'intégrateur pilote les modèles
 * (profil client) ou si le moteur est absent : rien à proposer alors.
 */
export async function lireInstallables(): Promise<{ liste: ModeleInstallable[]; etat?: EtatInstallation }> {
  const res = await apiFetch("/helix/provision");
  if (!res.ok) return { liste: [] };
  const corps = (await res.json().catch(() => ({}))) as Reponse;
  if (corps.managed || corps.moteurInstalle === false) return { liste: [], etat: corps.state };
  return { liste: corps.installables ?? [], etat: corps.state };
}

/** Lance l'installation (téléchargement puis chargement) d'un modèle du catalogue. */
export async function installerModele(m: ModeleInstallable): Promise<boolean> {
  try {
    const res = await apiFetch("/helix/provision/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: m.key, role: m.role }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
