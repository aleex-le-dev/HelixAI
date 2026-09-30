import { useState } from "react";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useCompetences } from "@/hooks/useCompetences";
import type { Competence, VisibiliteCompetence } from "@/lib/store/competences";
import { t, tf } from "@/lib/i18n";

/**
 * Les compétences, côté écran.
 *
 * Le bouton « Créer une compétence » existait depuis le début, grisé, avec
 * « Bientôt disponible » en infobulle. Il promettait la chose la plus demandée
 * dans une entreprise : que l'assistant sache **comment on fait ici**.
 *
 * Une compétence tient en trois champs, et pas un de plus :
 *
 *  - son **nom**, pour la retrouver ;
 *  - **quand s'en servir**, qui est le seul champ que le modèle lit pour
 *    décider s'il l'applique ;
 *  - la **procédure**, qu'il suit alors à la lettre.
 *
 * Rien d'autre n'est demandé. Un formulaire qui réclame un périmètre d'outils,
 * un modèle préféré et un format de sortie n'est plus une procédure, c'est un
 * agent — et les agents existent déjà, ailleurs.
 */
export function Competences() {
  const { competences, consignes, creer, modifier, supprimer } = useCompetences();
  const [ouverte, setOuverte] = useState<Competence | "nouvelle" | null>(null);

  return (
    <>
      {competences.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("Aucune procédure enregistrée. Écrivez une fois comment vous faites, et l'assistant le refera à chaque demande qui s'y prête.")}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {competences.map((c) => (
            <li
              key={c.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1.5 text-sm"
              title={c.quand || c.instructions.slice(0, 200)}
            >
              <Switch
                checked={c.active}
                onChange={(v) => modifier(c.id, { active: v })}
                label={tf("Activer la procédure {0}", c.nom)}
              />
              <span
                className={c.active ? "truncate text-foreground" : "truncate text-muted-foreground"}
              >
                {c.nom}
              </span>
              <button
                type="button"
                aria-label={tf("Modifier {0}", c.nom)}
                className="ms-auto shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => setOuverte(c)}
              >
                <Pencil size={13} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOuverte("nouvelle")}
        className="mt-1.5 flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus size={15} strokeWidth={1.75} />
        <span>{t("Créer une compétence")}</span>
      </button>

      {/*
        Ce que le modèle reçoit vraiment, visible d'un clic. Une procédure
        écartée faute de place doit se voir ici, sinon la personne croit son
        travail pris en compte alors qu'il ne part pas.
      */}
      {consignes && (
        <p className="mt-1 px-1 text-[11px] leading-relaxed text-muted-foreground">
          {competences.filter((c) => c.active).length}{" "}{t("active(s),")}{" "}{consignes.length}{" "}{t("caractères envoyés à chaque message.")}
        </p>
      )}

      {ouverte && (
        <EditeurCompetence
          competence={ouverte === "nouvelle" ? null : ouverte}
          onFermer={() => setOuverte(null)}
          onCreer={creer}
          onModifier={modifier}
          onSupprimer={supprimer}
        />
      )}
    </>
  );
}

function EditeurCompetence({
  competence,
  onFermer,
  onCreer,
  onModifier,
  onSupprimer,
}: {
  competence: Competence | null;
  onFermer: () => void;
  onCreer: ReturnType<typeof useCompetences>["creer"];
  onModifier: ReturnType<typeof useCompetences>["modifier"];
  onSupprimer: ReturnType<typeof useCompetences>["supprimer"];
}) {
  const [nom, setNom] = useState(competence?.nom ?? "");
  const [quand, setQuand] = useState(competence?.quand ?? "");
  const [instructions, setInstructions] = useState(competence?.instructions ?? "");
  const [visibilite, setVisibilite] = useState<VisibiliteCompetence>(
    competence?.visibilite ?? "personnel",
  );

  const valide = nom.trim().length > 0 && instructions.trim().length > 0;

  const enregistrer = () => {
    if (!valide) return;
    if (competence) onModifier(competence.id, { nom, quand, instructions, visibilite });
    else onCreer({ nom, quand, instructions, visibilite });
    onFermer();
  };

  return (
    <Modal open onClose={onFermer} size="lg">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {competence ? t("Modifier la compétence") : t("Créer une compétence")}
        </h2>
        <InfoBox tone="muted" leading={<Sparkles size={15} strokeWidth={1.75} />}>
          {t("Une compétence est une manière de faire, écrite en français. Elle ne donne aucun pouvoir nouveau à l'assistant : elle lui dit comment se servir de ceux qu'il a déjà.")}
        </InfoBox>

        <Field label={t("Nom")}>
          <Input
            autoFocus
            maxLength={80}
            placeholder={t("Compte rendu de visite client")}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        </Field>

        <Field
          label={t("Quand s'en servir")}
          hint={t("C'est la seule phrase que l'assistant lit pour décider d'appliquer cette procédure. Soyez précis sur la situation, pas sur la méthode.")}
        >
          <Input
            maxLength={200}
            placeholder={t("Quand on me demande de rédiger le compte rendu d'un rendez-vous")}
            value={quand}
            onChange={(e) => setQuand(e.target.value)}
          />
        </Field>

        <Field
          label={t("La procédure")}
          hint={t("Ce que l'assistant suivra à la lettre. Écrivez-la comme à un nouveau collègue : les étapes, dans l'ordre, et ce qu'il ne faut surtout pas faire.")}
        >
          <Textarea
            rows={10}
            maxLength={4000}
            placeholder={
              t("1. Commencer par la date, le nom du client et les personnes présentes.\n") +
              t("2. Trois parties : ce qui a été dit, ce qui a été décidé, ce qui reste à faire.\n") +
              t("3. Chaque point à faire porte un responsable et une date.\n") +
              t("4. Ne jamais inventer un chiffre : si une donnée manque, écrire « à confirmer ».")
            }
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>

        <Field
          label={t("Qui s'en sert")}
          hint={t("Une procédure d'organisation est lisible par tous vos collègues ; vous seul pouvez la modifier.")}
        >
          <Select
            value={visibilite}
            onChange={(v) => setVisibilite(v as VisibiliteCompetence)}
            options={[
              { value: "personnel", label: t("Moi seul") },
              { value: "organisation", label: t("Toute l'organisation") },
            ]}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={enregistrer} disabled={!valide}>
            {competence ? t("Enregistrer") : t("Créer")}
          </Button>
          <Button variant="ghost" onClick={onFermer}>
            {t("Annuler")}
          </Button>
          {competence && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="ms-auto text-destructive hover:text-destructive"
              onClick={() => {
                onSupprimer(competence.id);
                onFermer();
              }}
            >
              {t("Supprimer")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default Competences;
