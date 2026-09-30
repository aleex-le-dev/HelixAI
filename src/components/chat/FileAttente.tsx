import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Clock, Film, Image as ImageIcon, Paperclip, Pause, Pencil, X } from "lucide-react";
import type { EnvoiEnFile } from "@/hooks/useChat";
import { LIMITE_FILE, type EtatFile } from "@/lib/fileAttente";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { enumerer, t, tf } from "@/lib/i18n";

interface FileAttenteProps {
  file: EtatFile<EnvoiEnFile>;
  /** Une réponse s'écrit dans ce Chat. */
  occupe: boolean;
  /** La personne a voulu ajouter un message à une file pleine. */
  refusee: boolean;
  onRetirer: (id: string) => void;
  onCommencerEdition: (id: string) => void;
  /** `texte` absent : modification abandonnée. */
  onFinirEdition: (id: string, texte?: string) => void;
  onReprendre: () => void;
}

/**
 * La file d'attente d'un Chat (29/09/2026), en haut du composeur : les
 * messages écrits pendant une réponse, qui partiront l'un après l'autre.
 * Elle dit ce qui va se passer, et pourquoi elle attend quand elle est en
 * pause (réponse échouée ou arrêtée) : c'est alors à la personne de la
 * relancer, pour ne pas enchaîner des messages sur une erreur.
 */
export function FileAttente({
  file,
  occupe,
  refusee,
  onRetirer,
  onCommencerEdition,
  onFinirEdition,
  onReprendre,
}: FileAttenteProps) {
  const n = file.messages.length;
  if (n === 0) return null;
  const premierEnEdition = Boolean(file.messages[0]?.enEdition);

  const etat = file.pause
    ? file.pause === "erreur"
      ? t("En pause : la réponse précédente n'a pas abouti. Rien ne part tout seul.")
      : t("En pause : la réponse a été arrêtée. Rien ne part tout seul.")
    : occupe
      ? t("Ils partiront l'un après l'autre, chacun à la fin de la réponse précédente.")
      : premierEnEdition
        ? t("Le premier partira dès que vous aurez fini de le modifier.")
        : null;

  return (
    <section
      aria-label={t("Messages en attente")}
      className="cq mb-1.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          {file.pause ? (
            <Pause size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" />
          ) : (
            <Clock size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" />
          )}
          <span role="status">{n === 1 ? t("1 message en attente") : tf("{0} messages en attente", n)}</span>
        </p>
        {file.pause && (
          <Button size="sm" variant="secondary" className="ms-auto h-7 px-2.5" onClick={onReprendre}>
            {occupe ? t("Reprendre") : t("Envoyer maintenant")}
          </Button>
        )}
      </div>
      {etat && <p className="mt-0.5 text-xs text-muted-foreground">{etat}</p>}
      {file.pause && occupe && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("« Reprendre » : le premier partira à la fin de la réponse en cours.")}
        </p>
      )}
      {refusee && n >= LIMITE_FILE && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {tf("La file est pleine ({0} messages au plus). Attendez qu'un message parte, ou retirez-en un : votre texte est resté dans le champ.", LIMITE_FILE)}
        </p>
      )}
      {/* Dix messages tiennent sans pousser la conversation hors de l'écran : la liste défile. */}
      <ol className="mt-2 max-h-[30vh] space-y-1.5 overflow-y-auto overflow-x-hidden">
        {file.messages.map((m, i) => (
          <MessageEnAttente
            key={m.id}
            rang={i + 1}
            envoi={m.contenu}
            enEdition={Boolean(m.enEdition)}
            onRetirer={() => onRetirer(m.id)}
            onModifier={() => onCommencerEdition(m.id)}
            onFinir={(texte) => onFinirEdition(m.id, texte)}
          />
        ))}
      </ol>
    </section>
  );
}

function MessageEnAttente({
  rang,
  envoi,
  enEdition,
  onRetirer,
  onModifier,
  onFinir,
}: {
  rang: number;
  envoi: EnvoiEnFile;
  enEdition: boolean;
  onRetirer: () => void;
  onModifier: () => void;
  onFinir: (texte?: string) => void;
}) {
  const [brouillon, setBrouillon] = useState(envoi.texte);
  const zone = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!enEdition) return;
    setBrouillon(envoi.texte);
    requestAnimationFrame(() => {
      const el = zone.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    // Seulement à l'ouverture de la modification : la suite de la frappe appartient au brouillon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enEdition]);

  // Un message sans texte ne garde que ses pièces jointes ; une image, elle, a besoin de sa description.
  const valide = envoi.creation ? brouillon.trim().length > 0 : brouillon.trim().length > 0 || envoi.pieces.length > 0;
  const enregistrer = () => {
    if (valide) onFinir(brouillon);
  };
  const touches = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enregistrer();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onFinir(undefined);
    }
  };

  const details = [
    envoi.creation ? (envoi.creation.video ? t("Vidéo à créer") : t("Image à créer")) : null,
    envoi.pieces.length > 0
      ? envoi.pieces.length === 1
        ? tf("1 pièce jointe : {0}", envoi.pieces[0]!.nom)
        : tf("{0} pièces jointes", envoi.pieces.length)
      : null,
  ].filter(Boolean) as string[];
  const Icone = envoi.creation ? (envoi.creation.video ? Film : ImageIcon) : Paperclip;

  return (
    /*
     * Texte et boutons sur une ligne ; dans un champ étroit (375 px), les
     * boutons ne gardent que leur icône (nom au survol et pour les lecteurs
     * d'écran). Pendant une modification, les boutons passent sous le texte.
     */
    <li
      className={cn(
        "flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg bg-muted/60 px-2.5 py-1.5",
        enEdition && "ring-1 ring-foreground/20",
      )}
    >
      <div className={cn("flex min-w-0 flex-1 items-start gap-2", enEdition && "basis-full")}>
        <span aria-hidden className="mt-px w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
          {rang}
        </span>
        <div className="min-w-0 flex-1">
          {enEdition ? (
            <textarea
              ref={zone}
              dir="auto"
              value={brouillon}
              onChange={(e) => setBrouillon(e.target.value)}
              onKeyDown={touches}
              rows={Math.min(6, Math.max(2, brouillon.split("\n").length))}
              aria-label={tf("Modifier le message en attente n° {0}", rang)}
              className="block w-full resize-none rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:border-foreground/20 focus:outline-none"
            />
          ) : (
            <p dir="auto" className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-foreground">
              {envoi.texte.trim() || <span className="text-muted-foreground">{t("(sans texte)")}</span>}
            </p>
          )}
          {details.length > 0 && (
            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Icone size={12} strokeWidth={1.75} className="shrink-0" />
              <span className="truncate">{enumerer(details)}</span>
            </p>
          )}
        </div>
      </div>
      <div className="ms-auto flex shrink-0 flex-wrap justify-end gap-1">
        {enEdition ? (
          <>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onFinir(undefined)}>
              {t("Annuler")}
            </Button>
            <Button size="sm" variant="secondary" className="h-7 px-2.5" onClick={enregistrer} disabled={!valide}>
              {t("Enregistrer")}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" icon={Pencil} className="h-7 px-2" onClick={onModifier} aria-label={t("Modifier")} title={t("Modifier")}>
              <span className="hidden cq-sm:inline">{t("Modifier")}</span>
            </Button>
            <Button size="sm" variant="ghost" icon={X} className="h-7 px-2" onClick={onRetirer} aria-label={t("Retirer")} title={t("Retirer")}>
              <span className="hidden cq-sm:inline">{t("Retirer")}</span>
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export default FileAttente;
