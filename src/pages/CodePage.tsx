import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PanelRight, TriangleAlert } from "lucide-react";
import { SessionsRecentes } from "@/components/code/SessionsCode";
import { useSessionsCode } from "@/hooks/useSessionsCode";
import { signalerSessionsCode } from "@/lib/code";
import { LogoMark } from "@/components/ui/Logo";
import { IconButton } from "@/components/ui/IconButton";
import { SuiviCodePanel } from "@/components/code/SuiviCode";
import { Composer } from "@/components/chat/Composer";
import { DossierTravailChip } from "@/components/chat/DossierTravailChip";
import { MessageList } from "@/components/chat/MessageList";
import { InfoBox } from "@/components/ui/InfoBox";
import { useCode } from "@/hooks/useCode";
import { useProfile } from "@/hooks/useProfile";
import { currentUser, prenom } from "@/lib/store/identity";
import type { NiveauRaisonnement } from "@/lib/store/profile";
import { t } from "@/lib/i18n";

/** Ecran Code (capture 9), adossé au moteur OpenCode via la passerelle. */
export function CodePage() {
  const [draft, setDraft] = useState("");
  /*
   * Panneau de suivi ouvert d'office sur un écran large ; sur un écran étroit,
   * il couvrirait la conversation : on l'ouvre à la demande.
   */
  const [suiviOuvert, setSuiviOuvert] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches,
  );
  const { profile, update } = useProfile();
  /*
   * Dossier choisi pour cette session. Il n'est transmis qu'à l'ouverture de la
   * session côté moteur : en changer relance donc une session propre, comme
   * quand on ouvre un autre projet.
   */
  const [dossier, setDossier] = useState<string | undefined>();
  /*
   * Le modèle et le niveau affichés dans la saisie partent avec chaque
   * demande : ils n'étaient transmis nulle part, et l'agent de code tournait
   * toujours sur le modèle par défaut, quel que soit le choix affiché.
   */
  const code = useCode(dossier, {
    model: profile.preferredModelUid,
    effort: profile.preferredEffort ?? "moyen",
  });

  /*
   * L'adresse dit quelle session est affichée : `/code?s=<id>` une session de
   * la liste, `/code` l'accueil. Ouvrir Code ne reprend donc plus la dernière
   * session (demandé par Medhi le 25/09/2026, comme dans Claude Code) : on la
   * rouvre depuis la liste. Revenir à l'accueil n'arrête pas une session qui
   * travaille : elle continue, et se rouvre depuis la liste (`nouvelle`).
   */
  const [params, setParams] = useSearchParams();
  const demandee = params.get("s");
  const { sessions } = useSessionsCode();
  const { ouvrir, nouvelle, sessionId } = code;
  useEffect(() => {
    // La liste se relit à chaque passage : une session ouverte ailleurs (ligne de commande, extension) y apparaît.
    signalerSessionsCode();
    if (demandee) {
      void ouvrir(demandee).then((h) => {
        if (h) setDossier(h.session.dossier);
      });
    } else if (sessionId) {
      nouvelle();
    }
    // Seule l'adresse décide ; `sessionId` est lu tel qu'il est à ce moment.
  }, [demandee]);
  /*
   * Une session vient de naître (première demande) ou d'être relancée par
   * l'instance : l'adresse la désigne, pour qu'un rechargement ou la barre
   * latérale la retrouvent. Seulement quand elle change depuis rien ou depuis
   * celle de l'adresse : au retour sur l'accueil, l'ancienne ne doit pas
   * revenir.
   */
  const precedente = useRef(sessionId);
  useEffect(() => {
    const avant = precedente.current;
    precedente.current = sessionId;
    if (sessionId && sessionId !== avant && sessionId !== demandee && (avant === null || avant === demandee)) {
      setParams({ s: sessionId }, { replace: true });
    }
  }, [sessionId, demandee, setParams]);
  const navigate = useNavigate();
  // Le dossier de la session affichée ; sur l'accueil, celui qu'on a choisi pour la prochaine.
  const dossierAffiche = (sessionId && sessions.find((s) => s.id === sessionId)?.dossier) || dossier || code.status?.projectDir;

  const submit = () => {
    const text = draft;
    setDraft("");
    void code.send(text);
  };

  const unavailable = code.status && !code.status.available;

  const composer = (
    <Composer
      placeholder={t("Que voulez-vous implémenter ?")}
      value={draft}
      onChange={setDraft}
      onSubmit={submit}
      busy={code.busy}
      onStop={code.stop}
      modelUid={profile.preferredModelUid}
      onModelChange={(uid) => update({ preferredModelUid: uid })}
      effort={profile.preferredEffort ?? "moyen"}
      onEffortChange={(e) =>
        update({ preferredEffort: e as NiveauRaisonnement })
      }
      contextBar={
        <DossierTravailChip
          dossier={dossierAffiche}
          onChange={(chemin) => {
            setDossier(chemin);
            /*
             * Changer de projet, c'est une nouvelle session dans ce dossier.
             * Celle qu'on quitte n'est plus arrêtée : elle reste dans la liste.
             */
            if (sessionId || demandee) navigate("/code");
          }}
        />
      }
    />
  );

  if (unavailable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <TriangleAlert size={26} strokeWidth={1.5} className="text-muted-foreground" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">{t("Moteur de code absent")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("L'écran Code s'appuie sur un moteur d'agent installé sur cette machine. Il n'a pas été trouvé.")}
        </p>
        <code className="rounded-lg bg-muted px-3 py-1.5 text-xs text-foreground">
          {t("curl -fsSL https://opencode.ai/install | bash")}
        </code>
      </div>
    );
  }

  /* --- Session en cours ------------------------------------------------- */
  if (code.messages.length > 0) {
    return (
      <div className="relative flex h-full min-w-0">
        {!suiviOuvert && (
          <IconButton
            icon={PanelRight}
            label={t("Afficher le suivi")}
            onClick={() => setSuiviOuvert(true)}
            className="absolute right-4 top-4 z-20"
          />
        )}
        <section className="flex min-w-0 flex-1 flex-col bg-dotted">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[760px] px-6 py-8">
              <MessageList messages={code.messages} />
              {code.error && (
                <InfoBox
                  tone="warning"
                  className="mt-4"
                  leading={<TriangleAlert size={15} strokeWidth={1.75} />}
                >
                  {code.error}
                </InfoBox>
              )}
            </div>
          </div>
          <div className="shrink-0 px-6 pb-5">
            <div className="mx-auto w-full max-w-[760px]">{composer}</div>
          </div>
        </section>
        {/*
          Le suivi, à droite comme dans Cowork. Sur un écran étroit, il passe
          par-dessus tout l'écran, bord droit, au lieu de tasser la
          conversation (vu à 375 px le 25/09/2026 : dans la colonne, il n'avait
          plus que 100 px) ; on le referme d'un clic.
        */}
        {suiviOuvert && (
          <SuiviCodePanel
            suivi={code.suivi}
            dossier={dossierAffiche}
            onArreter={code.arreterAction}
            onFermer={() => setSuiviOuvert(false)}
            className="fixed inset-y-0 right-0 z-40 shadow-lg lg:static lg:z-auto lg:shadow-none"
          />
        )}
      </div>
    );
  }

  /* --- Accueil ---------------------------------------------------------- */
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-dotted">
      <div className="flex flex-1 items-center justify-center px-6 pb-24 pt-10">
        <div className="w-full max-w-[680px]">
          <div className="mb-7 flex items-center justify-center gap-3">
            <LogoMark size={38} animated />
            <h1 className="text-3xl font-medium tracking-tight text-foreground">
              {t("Bonjour,")}{" "}{prenom(currentUser())}
            </h1>
          </div>

          {composer}

          {code.error && (
            <InfoBox
              tone="warning"
              className="mt-4"
              leading={<TriangleAlert size={15} strokeWidth={1.75} />}
            >
              {code.error}
            </InfoBox>
          )}

          {/* Une session demandée par l'adresse se charge : pas de liste en attendant. */}
          {!demandee && <SessionsRecentes />}
        </div>
      </div>
    </div>
  );
}

export default CodePage;
