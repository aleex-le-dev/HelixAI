import { useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, ExternalLink, KeyRound, Loader2, Plus, Trash2, TriangleAlert, Users, User } from "lucide-react";
import { Card } from "@/components/settings/SettingsShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import {
  ajouterCle,
  chargerFournisseurs,
  essayerCle,
  modifierCle,
  retirerCle,
  type CleModele,
  type Fournisseur,
} from "@/lib/fournisseurs";
import { t } from "@/lib/i18n";

/**
 * Modèles cloud branchés par une clé : pour soi, ou pour toute l'équipe.
 *
 * Les modèles fournis par l'agence (profil de déploiement) n'apparaissent pas
 * ici : ils sont déjà dans le sélecteur de modèle de chacun. Un modèle branché
 * par une clé n'est jamais choisi d'office : il faut le prendre dans le
 * sélecteur, parce qu'il coûte à quelqu'un.
 */

const UE = new Set([t("France"), "Allemagne", "Pays-Bas", "Belgique", "Italie", "Espagne", "Irlande", "Suède", "Finlande"]);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function ModelesCloud() {
  const [catalogue, setCatalogue] = useState<Fournisseur[]>([]);
  const [cles, setCles] = useState<CleModele[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);

  const charger = useCallback(() => {
    void chargerFournisseurs()
      .then((r) => {
        setCatalogue(r.catalogue);
        setCles(r.cles);
      })
      .catch((err) => setErreur(message(err)));
  }, []);
  useEffect(charger, [charger]);

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-2xl gap-3">
            <Cloud size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("Branchez la clé d'un fournisseur pour vous servir de ses modèles dans le Chat et pour vos employés. Vos messages à ces modèles partent chez le fournisseur : chaque modèle dit où il tourne. Ceux fournis par votre prestataire sont déjà dans le sélecteur.")}
            </p>
          </div>
          {!ajout && (
            <Button icon={Plus} onClick={() => setAjout(true)}>
              {t("Brancher une clé")}
            </Button>
          )}
        </div>
        {erreur && (
          <InfoBox tone="warning" className="mt-3" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
            {erreur}
          </InfoBox>
        )}
        {ajout && (
          <AjoutCle
            catalogue={catalogue}
            onFini={() => {
              setAjout(false);
              charger();
            }}
          />
        )}
      </Card>

      {cles === null ? (
        <Loader2 size={18} strokeWidth={1.75} className="mx-auto animate-spin text-muted-foreground" />
      ) : cles.length === 0 ? (
        !ajout && <p className="px-1 text-sm text-muted-foreground">{t("Aucune clé branchée pour l'instant.")}</p>
      ) : (
        <ul className="space-y-2">
          {cles.map((c) => (
            <LigneCle key={c.id} cle={c} onChange={charger} />
          ))}
        </ul>
      )}
    </>
  );
}

function Pays({ pays }: { pays: string }) {
  const horsUE = !UE.has(pays);
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        horsUE ? "bg-warning/15 text-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {pays}
    </span>
  );
}

function LigneCle({ cle, onChange }: { cle: CleModele; onChange: () => void }) {
  const [occupe, setOccupe] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const agir = async (f: () => Promise<void>) => {
    setOccupe(true);
    setErreur(null);
    try {
      await f();
      onChange();
    } catch (err) {
      setErreur(message(err));
    } finally {
      setOccupe(false);
    }
  };
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound size={16} strokeWidth={1.75} className="text-muted-foreground" />
        <span className="font-medium text-foreground">{cle.nom}</span>
        <Pays pays={cle.pays} />
        <span className="text-xs text-muted-foreground">•••• {cle.fin}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          {cle.portee === "equipe" ? <Users size={13} strokeWidth={1.75} /> : <User size={13} strokeWidth={1.75} />}
          {cle.portee === "equipe" ? t("Pour toute l'équipe") : t("Pour vous seulement")}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{cle.modeles.join(", ")}</p>
      {cle.estProprietaire ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch
              checked={cle.portee === "equipe"}
              label={t("Partager avec toute l'équipe")}
              onChange={(v) => void agir(() => modifierCle(cle.id, { portee: v ? "equipe" : "moi" }))}
            />
            {t("Partager avec toute l'équipe")}
          </label>
          {confirmer ? (
            <span className="flex items-center gap-2">
              <span className="text-sm text-foreground">{t("Retirer cette clé ?")}</span>
              <Button variant="destructive" size="sm" disabled={occupe} onClick={() => void agir(() => retirerCle(cle.id))}>
                {t("Retirer")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmer(false)}>
                {t("Annuler")}
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmer(true)}>
              {t("Retirer")}
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t("Partagée par un collègue : lui seul peut la retirer.")}</p>
      )}
      {erreur && (
        <InfoBox tone="warning" className="mt-2" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}
    </li>
  );
}

function AjoutCle({ catalogue, onFini }: { catalogue: Fournisseur[]; onFini: () => void }) {
  const [choix, setChoix] = useState<Fournisseur | null>(null);
  const [cle, setCle] = useState("");
  const [adresse, setAdresse] = useState("");
  const [nom, setNom] = useState("");
  const [pays, setPays] = useState("");
  const [disponibles, setDisponibles] = useState<string[] | null>(null);
  const [retenus, setRetenus] = useState<string[]>([]);
  const [filtre, setFiltre] = useState("");
  const [portee, setPortee] = useState<"moi" | "equipe">("moi");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const t = filtre.trim().toLowerCase();
    return (disponibles ?? []).filter((m) => !t || m.toLowerCase().includes(t));
  }, [disponibles, filtre]);

  const essayer = async () => {
    if (!choix) return;
    setOccupe(true);
    setErreur(null);
    try {
      const m = await essayerCle(choix.id, cle, choix.adresseLibre ? adresse : undefined);
      setDisponibles(m);
      setRetenus(m.length <= 3 ? m : []);
    } catch (err) {
      setErreur(message(err));
    } finally {
      setOccupe(false);
    }
  };

  const brancher = async () => {
    if (!choix) return;
    setOccupe(true);
    setErreur(null);
    try {
      await ajouterCle({
        fournisseur: choix.id,
        cle,
        portee,
        modeles: retenus,
        ...(choix.adresseLibre ? { adresse, nom, pays } : {}),
      });
      onFini();
    } catch (err) {
      setErreur(message(err));
      setOccupe(false);
    }
  };

  if (!choix) {
    return (
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-foreground">{t("Quel fournisseur ?")}</p>
        <div className="grid gap-2 cq-md:grid-cols-3">
          {catalogue.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setChoix(f)}
              className="flex flex-col items-start gap-1 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted"
            >
              <span className="text-sm font-medium text-foreground">{f.nom}</span>
              {!f.adresseLibre && <Pays pays={f.pays} />}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" onClick={onFini}>
            {t("Annuler")}
          </Button>
        </div>
      </div>
    );
  }

  const horsUE = !choix.adresseLibre && !UE.has(choix.pays);

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{choix.nom}</span>
        {!choix.adresseLibre && <Pays pays={choix.pays} />}
        {choix.cles && (
          <a
            href={choix.cles}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
          >
            {t("Où créer une clé")}{" "}<ExternalLink size={12} strokeWidth={1.75} />
          </a>
        )}
      </div>
      {horsUE && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {t("Les messages envoyés à ces modèles partent chez")}{" "}{choix.nom}{t(", hors de l'Union européenne (")}{choix.pays}{t("), et y sont traités selon ses conditions.")}
        </InfoBox>
      )}
      {choix.adresseLibre && (
        <div className="grid gap-3 cq-md:grid-cols-3">
          <Field label={t("Adresse de l'API")}>
            <Input placeholder="https://exemple.fr/v1" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </Field>
          <Field label={t("Nom affiché")}>
            <Input placeholder={t("Mon fournisseur")} value={nom} maxLength={60} onChange={(e) => setNom(e.target.value)} />
          </Field>
          <Field label={t("Pays du service")}>
            <Input placeholder={t("France")} value={pays} maxLength={40} onChange={(e) => setPays(e.target.value)} />
          </Field>
        </div>
      )}
      <Field label={t("Clé")} hint={t("Elle est gardée chiffrée par l'instance et ne s'affiche plus ensuite.")}>
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            value={cle}
            onChange={(e) => {
              setCle(e.target.value);
              setDisponibles(null);
            }}
          />
          <Button variant="secondary" disabled={occupe || !cle.trim() || (choix.adresseLibre && !adresse.trim())} onClick={() => void essayer()}>
            {occupe && !disponibles ? "Vérification…" : t("Vérifier")}
          </Button>
        </div>
      </Field>

      {disponibles && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {t("Modèles à proposer (")}{retenus.length} sur {disponibles.length})
              </p>
              {disponibles.length > 8 && (
                <Input
                  className="max-w-[220px] py-1.5"
                  placeholder={t("Filtrer…")}
                  value={filtre}
                  onChange={(e) => setFiltre(e.target.value)}
                />
              )}
            </div>
            <div className="grid max-h-60 gap-1 overflow-y-auto rounded-xl border border-border p-2 cq-sm:grid-cols-2">
              {visibles.map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="accent-current"
                    checked={retenus.includes(m)}
                    onChange={() => setRetenus((r) => (r.includes(m) ? r.filter((x) => x !== m) : [...r, m]))}
                  />
                  <span className="truncate text-foreground">{m}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["moi", "equipe"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPortee(p)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  portee === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {p === "moi" ? <User size={14} strokeWidth={1.75} /> : <Users size={14} strokeWidth={1.75} />}
                {p === "moi" ? t("Pour moi seulement") : t("Pour toute l'équipe")}
              </button>
            ))}
          </div>
          {portee === "equipe" && (
            <p className="text-xs text-muted-foreground">
              {t("Chacun pourra choisir ces modèles, et leur consommation sera facturée sur cette clé.")}
            </p>
          )}
        </>
      )}

      {erreur && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={occupe} onClick={() => (disponibles ? setDisponibles(null) : setChoix(null))}>
          {t("Retour")}
        </Button>
        <Button disabled={occupe || !disponibles || retenus.length === 0} onClick={() => void brancher()}>
          {occupe && disponibles ? t("Branchement…") : "Brancher"}
        </Button>
      </div>
    </div>
  );
}

export default ModelesCloud;
