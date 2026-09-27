import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent } from "@/lib/store/agents";
import {
  RefusInstance,
  assurerOpenClaw,
  deployerEmploye,
  envoyerDocument,
  modifierEmploye,
  prendreFichiers,
  type EtatEmployes,
} from "@/lib/employes";
import { t, tf } from "@/lib/i18n";

/**
 * Mise en service automatique des agents.
 *
 * Un agent créé dans l'interface est déployé tout seul sur l'instance
 * OpenClaw de l'entreprise : OpenClaw s'installe s'il manque, puis l'agent
 * devient un employé toujours actif (missions, messageries, mémoire). La
 * personne n'a rien d'autre à faire que créer son agent.
 *
 * Seul le propriétaire d'un agent le met en service, un agent à la fois : le
 * premier déclenche l'installation, les suivants attendent qu'elle soit finie.
 */

export interface EtatMiseEnService {
  etape: "attente" | "installation" | "deploiement" | "erreur";
  message: string;
  /**
   * Le modèle choisi à la création n'est plus servi à cette personne
   * (28/09/2026) : l'instance le refuse (400) sans en prendre un autre, et
   * « Réessayer » redemandait le même, sans fin. La carte propose alors d'en
   * choisir un autre.
   */
  modeleIndisponible?: string;
}

/** Fiche de poste tirée de l'agent : ses instructions, à défaut sa description. */
function posteDe(agent: Agent): string {
  const texte = [agent.instructions, agent.description].map((t) => t.trim()).find(Boolean);
  return texte ?? tf("Tu es {0}, un agent de l'équipe. Tu aides les personnes qui te parlent.", agent.name);
}

export function useMiseEnService(
  agents: Agent[],
  moi: string,
  etat: EtatEmployes | null,
  recharger: () => Promise<void>,
) {
  const [etats, setEtats] = useState<Record<string, EtatMiseEnService>>({});
  const enCours = useRef(false);
  const echecs = useRef(new Set<string>());

  const deployer = useCallback(
    async (agent: Agent, modeles: EtatEmployes["modeles"]) => {
      const maj = (e: EtatMiseEnService) => setEtats((s) => ({ ...s, [agent.id]: e }));
      /*
       * Son modèle, tel que l'instance le sert à cette personne. Choisi à la
       * création et disparu depuis (désinstallé, clé retirée) : on ne le
       * redemande pas, on le dit. `modelUid` (le modèle du Chat, gardé par
       * d'anciens agents) n'est pas un choix pour l'employé : il ne part que
       * s'il est encore servi, sinon l'instance propose le sien.
       */
      const servi = (uid: string | undefined) => Boolean(uid && modeles.some((m) => m.uid === uid));
      if (agent.modeleEmploye && !servi(agent.modeleEmploye)) {
        echecs.current.add(agent.id);
        maj({
          etape: "erreur",
          message: tf("son modèle ({0}) n'est plus disponible pour vous. Choisissez-en un autre.", agent.modeleEmploye.split("/").slice(1).join("/") || agent.modeleEmploye),
          modeleIndisponible: agent.modeleEmploye,
        });
        return;
      }
      const modele = agent.modeleEmploye ?? (servi(agent.modelUid) ? agent.modelUid : undefined);
      try {
        maj({ etape: "installation", message: t("Préparation…") });
        await assurerOpenClaw((i) =>
          maj({
            etape: "installation",
            message: `${i.message}${i.etape === "node" && i.avancement !== undefined ? ` ${i.avancement} %` : ""}`,
          }),
        );
        maj({ etape: "deploiement", message: t("Mise en service…") });
        const { employe } = await deployerEmploye({
          nom: agent.name,
          poste: posteDe(agent),
          description: agent.description,
          outils: [],
          toutesLesFamilles: agent.toolsEnabled,
          missions: [],
          autonome: false,
          liberte: "encadre",
          agentId: agent.id,
          visibilite: agent.visibility,
          ...(agent.visibility === "groupes" ? { groupes: agent.groupIds ?? [] } : {}),
          connaissances: agent.connaissances ?? [],
          // Le modèle choisi à la création ; l'instance refuse un modèle qu'elle ne sert pas à cette personne, sans en prendre un autre.
          ...(modele ? { modele } : {}),
        });
        // Les documents choisis à la création partent maintenant que son espace existe.
        const fichiers = prendreFichiers(agent.id);
        for (const [i, f] of fichiers.entries()) {
          maj({ etape: "deploiement", message: tf("Dépôt des documents ({0} sur {1})…", i + 1, fichiers.length) });
          await envoyerDocument(employe.id, f);
        }
        setEtats((s) => {
          const { [agent.id]: _fini, ...reste } = s;
          return reste;
        });
        await recharger();
      } catch (err) {
        echecs.current.add(agent.id);
        // Disparu entre la dernière liste et la mise en service : même issue que ci-dessus.
        const indisponible = err instanceof RefusInstance && err.code === "modele_indisponible" && modele;
        maj({
          etape: "erreur",
          message: err instanceof Error ? err.message : String(err),
          ...(indisponible ? { modeleIndisponible: modele } : {}),
        });
      }
    },
    [recharger],
  );

  // Les agents de cette personne qui n'ont pas encore d'employé, l'un après l'autre.
  useEffect(() => {
    if (!etat || enCours.current) return;
    const lies = new Set(etat.employes.map((e) => e.agentId).filter(Boolean));
    const suivant = agents.find((a) => a.ownerId === moi && !lies.has(a.id) && !echecs.current.has(a.id));
    if (!suivant) return;
    enCours.current = true;
    void deployer(suivant, etat.modeles).finally(() => {
      enCours.current = false;
      // Le rechargement relance cet effet pour l'agent suivant.
      void recharger();
    });
  }, [agents, moi, etat, deployer, recharger]);

  /*
   * Agents mis en service avant que la description ne rejoigne la fiche de
   * poste : on la leur donne, une fois.
   */
  const synchronises = useRef(new Set<string>());
  useEffect(() => {
    if (!etat) return;
    for (const e of etat.employes) {
      const agent = agents.find((a) => a.id === e.agentId);
      if (!agent || !e.estProprietaire || synchronises.current.has(e.id)) continue;
      if ((e.description ?? "") === agent.description.trim()) continue;
      synchronises.current.add(e.id);
      void modifierEmploye(e.id, { description: agent.description.trim() }).catch(() => undefined);
    }
  }, [agents, etat]);

  /*
   * Bases de connaissances de l'agent : son employé les suit. Le propriétaire
   * les change sur la carte de l'agent (AgentsPage) ; on les recopie ici,
   * chaque fois qu'elles diffèrent. L'instance décide de ce qu'il y lit
   * (employes.ts, `lectureDesBases`). La visibilité, elle, ne se recopie pas
   * d'ici : elle change dans les réglages de l'employé, qui peut demander de
   * vider sa mémoire avant qu'elle s'élargisse (Employes.tsx, `Reglages`).
   */
  const basesEnvoyees = useRef(new Map<string, string>());
  useEffect(() => {
    if (!etat) return;
    for (const e of etat.employes) {
      const agent = agents.find((a) => a.id === e.agentId);
      if (!agent || !e.estProprietaire) continue;
      const voulues = [...(agent.connaissances ?? [])].sort().join(",");
      if ([...(e.connaissances ?? [])].sort().join(",") === voulues || basesEnvoyees.current.get(e.id) === voulues) continue;
      basesEnvoyees.current.set(e.id, voulues);
      void modifierEmploye(e.id, { connaissances: agent.connaissances ?? [] })
        .then(() => recharger())
        .catch(() => basesEnvoyees.current.delete(e.id));
    }
  }, [agents, etat, recharger]);

  /** Nouvel essai après une erreur (réseau coupé pendant l'installation, par exemple). */
  const reessayer = useCallback(
    (agentId: string) => {
      echecs.current.delete(agentId);
      setEtats((s) => {
        const { [agentId]: _erreur, ...reste } = s;
        return reste;
      });
      void recharger();
    },
    [recharger],
  );

  return { etats, reessayer };
}
