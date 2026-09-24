import { db } from "./db.ts";
import { deployment, champImpose, type ComputerUseConfig } from "./deployment.ts";
import { journaliser } from "./audit.ts";
import { t } from "./langue.ts";

/**
 * D'où vient le mode du contrôle de l'écran, et qui peut le changer.
 *
 * Jusqu'ici, seul le profil de déploiement l'activait : sur un poste autonome,
 * la personne qui est aussi l'administratrice de son Mac devait éditer un
 * fichier JSON. Désormais, dans l'ordre :
 *
 *  1. **le profil de déploiement**, s'il écrit `computerUse` : il fait foi, et
 *     l'interface ne peut pas le changer (un intégrateur qui l'a fixé pour tout
 *     un parc ne doit pas être contredit depuis un poste) ;
 *  2. **le choix fait dans l'interface**, rangé dans la collection interne
 *     `reglages` ;
 *  3. sinon, **désactivé**.
 *
 * Activer depuis l'interface n'est permis que sur une instance **non partagée**,
 * c'est-à-dire un poste où la personne connectée est devant l'écran piloté. Sur
 * une instance partagée, n'importe quel collègue ferait sinon piloter l'écran du
 * serveur. Deux modes proposés, toujours avec approbation (l'interface ne sait
 * pas la retirer) : `sandbox`, la machine de l'agent (machine.ts), et `hote`,
 * l'écran de la personne.
 */

export type SourceEcran = "profil" | "interface" | "defaut";
export type ModeInterface = "hote" | "sandbox" | "desactive";

let choix: { mode: ModeInterface; par: string; le: string } | null = null;

/** Relit le choix enregistré. Appelé une fois, avant que l'instance n'écoute. */
export async function chargerReglagesEcran(): Promise<void> {
  try {
    const brut = (await db().read("reglages")) as { ecran?: typeof choix } | null;
    const ecran = brut?.ecran;
    choix = ecran && (ecran.mode === "hote" || ecran.mode === "sandbox" || ecran.mode === "desactive") ? ecran : null;
  } catch {
    choix = null;
  }
}

export function configEcran(): ComputerUseConfig & { source: SourceEcran } {
  if (champImpose("computerUse")) {
    const imposee = deployment().computerUse ?? { mode: "desactive" as const, requireApproval: true };
    return { ...imposee, source: "profil" };
  }
  if (choix) return { mode: choix.mode, requireApproval: true, source: "interface" };
  return { mode: "desactive", requireApproval: true, source: "defaut" };
}

/** Peut-on changer le mode depuis l'interface ? Sinon, pourquoi, en clair. */
export function modeModifiable(mode?: ModeInterface): { ok: true } | { ok: false; raison: string } {
  if (champImpose("computerUse")) {
    return { ok: false, raison: t("Réglé par votre prestataire dans le profil de déploiement.") };
  }
  if (deployment().share === true) {
    return {
      ok: false,
      raison:
        t("Instance partagée : le contrôle de l'écran de la machine qui l'héberge se règle dans son profil de déploiement."),
    };
  }
  // Piloter l'écran de la personne passe par macOS ; la machine de l'agent, elle, tourne partout où Docker tourne.
  if (mode === "hote" && process.platform !== "darwin") {
    return { ok: false, raison: t("Le contrôle de cette machine n'est disponible que sur macOS.") };
  }
  return { ok: true };
}

export async function definirModeEcran(mode: ModeInterface, qui: string): Promise<void> {
  const avant = configEcran().mode;
  choix = { mode, par: qui, le: new Date().toISOString() };
  const brut = ((await db().read("reglages")) as Record<string, unknown> | null) ?? {};
  await db().write("reglages", { ...brut, ecran: choix });
  journaliser("ecran.mode_modifie", qui, { avant, apres: mode });
}
