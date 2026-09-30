import { useState } from "react";
import { Mail, Check, Clock, Trash2, TriangleAlert, Users, Users2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { Avatar } from "@/components/ui/Avatar";
import {
  shareSession,
  shareWithGroup,
  unshareGroup,
  unshareSession,
  getSession,
  type Session,
} from "@/lib/store/sessions";
import { Select } from "@/components/ui/Select";
import { useGroupes } from "@/lib/groupes";
import { currentUser } from "@/lib/store/identity";
import { cn } from "@/lib/cn";
import { t, tf } from "@/lib/i18n";

/**
 * Partage d'une conversation, à la manière d'un lien de conversation partagée :
 * on invite une personne par son adresse, elle retrouve la conversation dans sa
 * propre barre latérale.
 */
export function ShareSessionModal({
  sessionId,
  onClose,
  onChanged,
}: {
  sessionId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [session, setSession] = useState<Session | undefined>(() => getSession(sessionId));
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const { etat: groupes } = useGroupes();
  const [groupe, setGroupe] = useState<string | undefined>();

  if (!session) return null;

  const isOwner = session.ownerId === currentUser().id;
  const shares = session.sharedWith ?? [];
  const groupesPartages = (session.sharedGroupIds ?? []).map(
    (id) => groupes?.groupes.find((g) => g.id === id) ?? { id, nom: t("Groupe supprimé"), membres: [] },
  );
  // On partage aux groupes dont on est membre : ceux des autres ne sont pas à soi.
  const groupesProposes = (groupes?.groupes ?? []).filter(
    (g) => g.estMembre && !(session.sharedGroupIds ?? []).includes(g.id),
  );

  const refresh = () => {
    setSession(getSession(sessionId));
    onChanged();
  };

  const send = () => {
    const result = shareSession(sessionId, email);
    if (result.ok) {
      setFeedback({
        ok: true,
        text: result.immediate
          ? tf("{0} a maintenant accès à cette conversation.", email)
          : tf("Invitation enregistrée pour {0}. La conversation apparaîtra chez cette personne dès la création de son compte.", email),
      });
      setEmail("");
      refresh();
    } else {
      setFeedback({ ok: false, text: result.reason ?? t("Partage impossible.") });
    }
  };

  return (
    <Modal open onClose={onClose} size="md">
      <h2 className="flex items-center gap-2 pe-8 text-lg font-semibold text-foreground">
        <Users2 size={19} strokeWidth={1.75} />{" "}{t("Partager la conversation")}
      </h2>
      <p className="mt-1 truncate text-sm text-muted-foreground" title={session.title}>
        {session.title}
      </p>

      {isOwner ? (
        <div className="mt-5">
          <Field label={t("Inviter une personne")}>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder={t("collegue@entreprise.fr")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim()) send();
                }}
                autoFocus
              />
              <Button icon={Mail} className="shrink-0" disabled={!email.trim()} onClick={send}>
                {t("Partager")}
              </Button>
            </div>
          </Field>
          {groupesProposes.length > 0 && (
            <Field label={t("Ou partager avec un groupe")} className="mt-4">
              <div className="flex gap-2">
                <Select
                  value={groupe}
                  onChange={setGroupe}
                  placeholder={t("Choisir un groupe")}
                  options={groupesProposes.map((g) => ({
                    value: g.id,
                    label: `${g.nom} (${(g.membres.length === 1 ? t("1 membre") : tf("{0} membres", g.membres.length))})`,
                  }))}
                />
                <Button
                  variant="secondary"
                  icon={Users}
                  className="shrink-0"
                  disabled={!groupe}
                  onClick={() => {
                    if (!groupe) return;
                    const g = groupesProposes.find((x) => x.id === groupe);
                    shareWithGroup(sessionId, groupe);
                    setGroupe(undefined);
                    setFeedback({ ok: true, text: tf("Les membres de « {0} » ont maintenant accès à cette conversation.", g?.nom ?? t("ce groupe")) });
                    refresh();
                  }}
                >
                  {t("Partager")}
                </Button>
              </div>
            </Field>
          )}
          {feedback && (
            <InfoBox
              tone={feedback.ok ? "info" : "warning"}
              className="mt-2"
              leading={
                feedback.ok ? (
                  <Check size={15} strokeWidth={2.5} />
                ) : (
                  <TriangleAlert size={15} strokeWidth={1.75} />
                )
              }
            >
              {feedback.text}
            </InfoBox>
          )}
        </div>
      ) : (
        <InfoBox tone="muted" className="mt-5">
          {t("Cette conversation vous a été partagée. Seul son propriétaire peut inviter d'autres personnes.")}
        </InfoBox>
      )}

      {groupesPartages.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {groupesPartages.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Users size={14} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {g.nom}
                <span className="text-muted-foreground">
                  {" "}
                  · {(g.membres.length === 1 ? t("1 membre") : tf("{0} membres", g.membres.length))}
                </span>
              </span>
              {isOwner && (
                <button
                  type="button"
                  aria-label={tf("Ne plus partager avec {0}", g.nom)}
                  onClick={() => {
                    unshareGroup(sessionId, g.id);
                    refresh();
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {shares.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {shares.map((person) => (
            <li
              key={person.email}
              className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
            >
              <Avatar size={28} initials={person.email.slice(0, 2).toUpperCase()} nom={person.email} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {person.email}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  person.status === "actif"
                    ? "bg-success/15 text-success"
                    : "bg-warning/15 text-warning",
                )}
              >
                {person.status === "actif" ? (
                  <>
                    <Check size={10} strokeWidth={3} />{" "}{t("Actif")}
                  </>
                ) : (
                  <>
                    <Clock size={10} strokeWidth={2.5} />{" "}{t("Invité")}
                  </>
                )}
              </span>
              {isOwner && (
                <button
                  type="button"
                  aria-label={tf("Retirer {0}", person.email)}
                  onClick={() => {
                    unshareSession(sessionId, person.email);
                    refresh();
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <InfoBox tone="muted" className="mt-5">
        {t("Le partage vaut pour cette installation. Pour collaborer depuis plusieurs postes, une instance partagée est nécessaire.")}
      </InfoBox>

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t("Fermer")}
        </Button>
      </div>
    </Modal>
  );
}

export default ShareSessionModal;
