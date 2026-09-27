import { useCallback, useEffect, useRef, useState } from "react";
import { actionOutil, argumentsOutil, nomOutil, type CodeEvent } from "@/lib/code";
import {
  annulerConnexionCodex,
  arreterTacheCodex,
  connecterCodex,
  lancerTacheCodex,
  lireEtatCodex,
  type EtatCodex,
  type EvenementCodex,
} from "@/lib/codex";
import { appliquerSuivi, suiviNeuf, terminerSuivi, type SuiviCode } from "@/lib/suiviCode";
import { aleatoire } from "@/lib/store/storage";
import { t } from "@/lib/i18n";
import type { Message, ToolTrace } from "./useChat";

const newId = () => aleatoire(11);

/**
 * L'écran Code avec Codex (demandé par Medhi le 27/09/2026, PROJET.md § 3.14).
 *
 * Même forme que `useCode` (messages, suivi, envoi, arrêt), pour que l'écran
 * affiche l'un ou l'autre moteur sans rien changer à son rendu ; mais un
 * cheminement bien plus court. Codex rend un flux par tâche, dans la réponse
 * même de la requête (gateway/src/codex.ts) : pas de session à ouvrir chez un
 * serveur, pas d'historique rejoué à trier. La conversation continue par
 * l'identifiant de session que Codex donne (`codex exec resume`), tant que
 * l'écran reste ouvert.
 *
 * Quitter l'écran arrête la tâche : la passerelle arrête Codex quand la
 * réponse se ferme. Les sessions de Codex ne sont pas dans la liste des
 * sessions de Code (elles restent chez Codex, sur ce poste).
 */
export function useCodex(dossier: string | undefined, actif: boolean) {
  const [etat, setEtat] = useState<EtatCodex | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suivi, setSuivi] = useState<SuiviCode>(() => suiviNeuf());
  const [session, setSession] = useState<string | null>(null);
  const [connexionRefus, setConnexionRefus] = useState<string | null>(null);
  const controleur = useRef<AbortController | null>(null);
  const dossierRef = useRef(dossier);
  dossierRef.current = dossier;

  const rafraichir = useCallback(
    (relire = false) =>
      lireEtatCodex(relire)
        .then((e) => {
          setEtat(e);
          return e;
        })
        .catch(() => {
          // Passerelle ancienne ou injoignable : Codex n'est simplement pas proposé.
          setEtat(null);
          return null;
        }),
    [],
  );

  useEffect(() => {
    void rafraichir();
  }, [rafraichir]);

  // Pendant la connexion, l'état est relu toutes les deux secondes, jusqu'à ce que `codex login` ait fini.
  useEffect(() => {
    if (!etat?.connexionEnCours) return;
    const minuterie = setInterval(() => void rafraichir(true), 2000);
    return () => clearInterval(minuterie);
  }, [etat?.connexionEnCours, rafraichir]);

  // L'écran se ferme : la tâche en cours s'arrête avec lui.
  useEffect(() => () => controleur.current?.abort(), []);

  const connecter = useCallback(async () => {
    setConnexionRefus(null);
    const refus = await connecterCodex().catch((err: unknown) => (err instanceof Error ? err.message : String(err)));
    if (refus) setConnexionRefus(refus);
    await rafraichir(true);
  }, [rafraichir]);

  const annulerConnexion = useCallback(async () => {
    await annulerConnexionCodex();
    await rafraichir(true);
  }, [rafraichir]);

  const send = useCallback(
    async (texte: string) => {
      if (!texte.trim() || busy || !actif) return;
      setError(null);
      const replyId = newId();
      const debut = Date.now();
      setMessages((m) => [
        ...m,
        { id: newId(), role: "user", content: texte },
        { id: replyId, role: "assistant", content: "", streaming: true, statut: t("Codex lit la demande…"), tools: [] },
      ]);
      setSuivi(suiviNeuf(debut));
      setBusy(true);
      const outils = new Map<string, number>();
      let dossierTache = dossierRef.current;
      let issue: "fini" | "arrete" | "echec" = "fini";

      const patch = (maj: (m: Message) => Partial<Message>) =>
        setMessages((liste) => liste.map((m) => (m.id === replyId ? { ...m, ...maj(m) } : m)));

      const appliquer = (e: EvenementCodex) => {
        const recu = Date.now();
        switch (e.kind) {
          case "debut":
            dossierTache = e.dossier;
            return;
          case "session":
            setSession(e.id);
            return;
          case "usage":
            return;
          case "reasoning":
            patch((m) => ({ statut: undefined, reasoning: m.reasoning ? `${m.reasoning}\n\n${e.text}` : e.text }));
            break;
          case "text":
            patch((m) => ({ statut: undefined, content: m.content ? `${m.content}\n\n${e.text}` : e.text }));
            break;
          case "tool_start":
            patch((m) => {
              const { libelle, cible } = actionOutil(e.tool, e.input, dossierTache);
              const traces: ToolTrace[] = [...(m.tools ?? []), { name: nomOutil(e.tool), args: argumentsOutil(e.input), running: true, libelle, cible, debut: recu }];
              outils.set(e.callID, traces.length - 1);
              return { statut: undefined, tools: traces };
            });
            break;
          case "tool_end":
            patch((m) => {
              const position = outils.get(e.callID);
              if (position === undefined) return {};
              return {
                tools: (m.tools ?? []).map((trace, i) =>
                  i === position ? { ...trace, running: false, ok: e.ok, preview: e.preview, ...(trace.debut !== undefined ? { duree: Math.max(0, recu - trace.debut) } : {}) } : trace,
                ),
              };
            });
            break;
          case "statut":
            patch(() => ({ statut: e.text }));
            break;
          case "fin":
            // Arrêtée à la demande de la personne (ou au bout d'une heure) : ce qui a été écrit reste, avec la raison.
            issue = "arrete";
            patch(() => ({ statut: e.note }));
            break;
          case "error":
            issue = "echec";
            setError(e.message);
            break;
          default:
            break;
        }
        setSuivi((s) => appliquerSuivi(s, e as CodeEvent, dossierTache, recu));
      };

      const c = new AbortController();
      controleur.current = c;
      try {
        await lancerTacheCodex(texte, { dossier: session ? undefined : dossierRef.current, session: session ?? undefined }, appliquer, c.signal);
      } catch (err) {
        if (!c.signal.aborted) {
          issue = "echec";
          setError(err instanceof Error ? err.message : String(err));
        } else issue = "arrete";
      } finally {
        if (controleur.current === c) controleur.current = null;
        patch((m) => ({ streaming: false, statut: issue === "arrete" ? m.statut : undefined }));
        setSuivi((s) => terminerSuivi(s, issue));
        setBusy(false);
        void rafraichir();
      }
    },
    [busy, actif, session, rafraichir],
  );

  const stop = useCallback(() => {
    void arreterTacheCodex();
  }, []);

  /** Une conversation neuve : la suivante ne reprend pas la session précédente. */
  const nouvelle = useCallback(() => {
    controleur.current?.abort();
    setMessages([]);
    setSession(null);
    setError(null);
    setSuivi(suiviNeuf());
  }, []);

  return { etat, messages, busy, error, suivi, session, send, stop, nouvelle, rafraichir, connecter, annulerConnexion, connexionRefus };
}
