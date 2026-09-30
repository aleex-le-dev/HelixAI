import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, MessageCircle, Plus, RefreshCw, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { InfoBox } from "@/components/ui/InfoBox";
import { Switch } from "@/components/ui/Switch";
import { ConfirmationMemoire } from "@/components/agents/ConfirmationMemoire";
import { cn } from "@/lib/cn";
import { branding } from "@/config/branding";
import {
  accepterDemande,
  brancherCanal,
  estRefusMemoire,
  etatCanaux,
  type RaisonElargissement,
  liaisonWhatsApp,
  lireDemandes,
  retirerCanal,
  type DemandeAcces,
  type Employe,
  type EtatEmployes,
  type TypeCanal,
} from "@/lib/employes";
import { t, tf, lister } from "@/lib/i18n";
import { LogoMarque } from "@/components/settings/TuileService";
import type { CleMarquePetite } from "@/components/ui/marques";

/** Le logo de chaque messagerie (troisième tournée des logos, 28/09/2026, décision de Medhi). */
const MARQUE_DU_CANAL: Partial<Record<TypeCanal, CleMarquePetite>> = {
  telegram: "telegram",
  whatsapp: "whatsapp",
  discord: "discord",
  slack: "slack",
  mattermost: "mattermost",
};

/**
 * Les messageries où l'on peut écrire à un employé : Telegram, WhatsApp,
 * Discord, Slack, Mattermost. Les jetons partent une fois vers l'instance et
 * n'en reviennent jamais. Seul le propriétaire de l'employé gère ses canaux.
 */

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Où trouver l'identifiant d'une personne, pour la liste des autorisés. */
const AIDE_AUTORISES: Record<TypeCanal, string> = {
  telegram: t("Identifiants numériques Telegram, un par ligne (le bot @userinfobot les donne)."),
  whatsapp: t("Numéros au format international, un par ligne (+33612345678)."),
  discord: t("Identifiants d'utilisateur Discord, un par ligne (mode développeur, « Copier l'identifiant »)."),
  slack: t("Identifiants de membre Slack, un par ligne (U0123ABCD)."),
  mattermost: t("Noms d'utilisateur Mattermost, un par ligne."),
};

export function CanauxEmploye({
  employe,
  etat,
  onChange,
}: {
  employe: Employe;
  etat: EtatEmployes;
  onChange: () => Promise<void>;
}) {
  const [etats, setEtats] = useState<Record<string, { enMarche: boolean; detail?: string }>>({});
  const [demandes, setDemandes] = useState<DemandeAcces[]>([]);
  const [ajout, setAjout] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const canaux = employe.canaux ?? [];

  const recharger = useCallback(() => {
    if (!employe.estProprietaire || canaux.length === 0) return;
    void etatCanaux(employe.id).then(setEtats).catch(() => setEtats({}));
    void lireDemandes(employe.id).then(setDemandes).catch(() => setDemandes([]));
  }, [employe.id, employe.estProprietaire, canaux.length]);
  useEffect(recharger, [recharger]);

  if (!employe.estProprietaire) {
    return (
      <p className="pt-10 text-center text-sm text-muted-foreground">
        {canaux.length === 0
          ? tf("{0} n'est joignable que depuis {1}.", employe.nom, branding.name)
          : tf("On peut aussi écrire à {0} sur {1}. Seule la personne qui l'a créé gère ses canaux.", employe.nom, lister(canaux.map((c) => c.nom)))}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("Les personnes qui lui écrivent sur ces messageries ont chacune leur conversation avec lui. Sans votre accord, personne d'inconnu ne peut lui parler.")}
      </p>

      {canaux.map((c) => (
        <LigneCanal
          key={c.type}
          employe={employe}
          type={c.type}
          etatCanal={etats[c.type]}
          onChange={async () => {
            await onChange();
            recharger();
          }}
        />
      ))}

      {demandes.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-sm font-medium text-foreground">{t("Demandent à lui parler")}</p>
          <ul className="space-y-1.5">
            {demandes.map((d) => (
              <li key={`${d.canal}-${d.code}`} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {d.expediteur} <span className="text-muted-foreground">· {etat.catalogueCanaux[d.canal]?.nom}</span>
                </span>
                <Button
                  size="sm"
                  icon={Check}
                  onClick={() =>
                    void accepterDemande(employe.id, d.canal, d.code)
                      .then(recharger)
                      .catch((err) => setErreur(message(err)))
                  }
                >
                  {t("Accepter")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erreur && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}

      {ajout ? (
        <AjoutCanal
          employe={employe}
          etat={etat}
          dejaLa={canaux.map((c) => c.type)}
          onFini={async (ok) => {
            setAjout(false);
            if (ok) {
              await onChange();
              recharger();
            }
          }}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" icon={Plus} onClick={() => setAjout(true)}>
            {t("Brancher une messagerie")}
          </Button>
          {canaux.length > 0 && (
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={recharger}>
              {t("Actualiser")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function LigneCanal({
  employe,
  type,
  etatCanal,
  onChange,
}: {
  employe: Employe;
  type: TypeCanal;
  etatCanal?: { enMarche: boolean; detail?: string };
  onChange: () => Promise<void>;
}) {
  const c = (employe.canaux ?? []).find((x) => x.type === type);
  const [confirmer, setConfirmer] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  if (!c) return null;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* gap-2 et p-3 : 8 px libres autour du logo. */}
        <LogoMarque marque={MARQUE_DU_CANAL[type]} icone={MessageCircle} taille={16} degagement={8} />
        <span className="font-medium text-foreground">{c.nom}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            etatCanal?.enMarche ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {etatCanal === undefined ? t("État inconnu") : etatCanal.enMarche ? t("Connecté") : type === "whatsapp" ? t("À lier") : t("Arrêté")}
        </span>
        <span className="ms-auto text-xs text-muted-foreground">
          {c.acces === "liste" ? tf("{0} personne(s) autorisée(s)", c.autorises?.length ?? 0) : t("Sur acceptation")}
          {c.outilsEntreprise ? t(" · outils de l'entreprise ouverts") : ""}
        </span>
      </div>
      {etatCanal?.detail && <p className="mt-1.5 text-xs text-muted-foreground">{etatCanal.detail}</p>}
      {type === "whatsapp" && !etatCanal?.enMarche && <LiaisonWhatsApp employe={employe} onLie={onChange} />}
      {erreur && <p className="mt-1.5 text-xs text-destructive">{erreur}</p>}
      <div className="mt-2 flex justify-end">
        {confirmer ? (
          <span className="flex items-center gap-2">
            <span className="text-sm text-foreground">{t("Retirer")}{" "}{c.nom} ?</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={occupe}
              onClick={() => {
                setOccupe(true);
                void retirerCanal(employe.id, type)
                  .then(onChange)
                  .catch((err) => setErreur(message(err)))
                  .finally(() => setOccupe(false));
              }}
            >
              {occupe ? "Retrait…" : t("Retirer")}
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
    </div>
  );
}

/** QR code de liaison, renouvelé tant que le téléphone ne l'a pas scanné. */
function LiaisonWhatsApp({ employe, onLie }: { employe: Employe; onLie: () => Promise<void> }) {
  const [qr, setQr] = useState<string | null>(null);
  const [etape, setEtape] = useState<"repos" | "attente" | "lie">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const actif = useRef(true);
  useEffect(() => {
    actif.current = true;
    return () => {
      actif.current = false;
    };
  }, []);

  const lier = async () => {
    setErreur(null);
    setEtape("attente");
    try {
      const r = await liaisonWhatsApp(employe.id, false);
      if (r.connecte) {
        setEtape("lie");
        await onLie();
        return;
      }
      if (!r.qr) throw new Error(r.message || t("Pas de QR code reçu."));
      setQr(r.qr);
      // Attente de la liaison : chaque appel patiente jusqu'à 25 secondes, et rend un QR frais s'il a changé.
      for (let i = 0; i < 12 && actif.current; i++) {
        const w = await liaisonWhatsApp(employe.id, true);
        if (w.connecte) {
          setEtape("lie");
          setQr(null);
          await onLie();
          return;
        }
        if (w.qr) setQr(w.qr);
      }
      if (actif.current) {
        setEtape("repos");
        setQr(null);
        setErreur(t("Le QR code a expiré sans être scanné. Recommencez quand le téléphone est prêt."));
      }
    } catch (err) {
      setEtape("repos");
      setErreur(message(err));
    }
  };

  if (etape === "lie") return <p className="mt-2 text-sm text-success">{t("Téléphone lié.")}</p>;
  return (
    <div className="mt-2 space-y-2">
      {qr ? (
        <div className="flex flex-wrap items-start gap-4">
          <img src={qr} alt={t("QR code de liaison WhatsApp")} className="h-48 w-48 rounded-lg bg-white p-2" />
          <ol className="max-w-xs space-y-1 text-sm text-muted-foreground">
            <li>{t("1. Sur le téléphone de ce numéro, ouvrez WhatsApp.")}</li>
            <li>{t("2. Réglages, Appareils connectés, Connecter un appareil.")}</li>
            <li>{t("3. Scannez ce code. Il se renouvelle tout seul.")}</li>
          </ol>
        </div>
      ) : (
        <Button size="sm" icon={Smartphone} disabled={etape === "attente"} onClick={() => void lier()}>
          {etape === "attente" ? t("Préparation du QR code…") : t("Lier le téléphone")}
        </Button>
      )}
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}

function AjoutCanal({
  employe,
  etat,
  dejaLa,
  onFini,
}: {
  employe: Employe;
  etat: EtatEmployes;
  dejaLa: TypeCanal[];
  onFini: (ok: boolean) => Promise<void>;
}) {
  const [type, setType] = useState<TypeCanal | null>(null);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [acces, setAcces] = useState<"appairage" | "liste">("appairage");
  const [autorises, setAutorises] = useState("");
  const [outilsEntreprise, setOutilsEntreprise] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [memoire, setMemoire] = useState<RaisonElargissement[] | null>(null);
  const types = (Object.keys(etat.catalogueCanaux) as TypeCanal[]).filter((t) => !dejaLa.includes(t));
  const def = type ? etat.catalogueCanaux[type] : null;

  if (!type || !def) {
    return (
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-sm font-medium text-foreground">{t("Quelle messagerie ?")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-start text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {/* gap-2.5 et py-2.5 : 10 px libres autour du logo. */}
              <LogoMarque marque={MARQUE_DU_CANAL[t]} icone={MessageCircle} taille={18} degagement={10} />
              {etat.catalogueCanaux[t].nom}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" onClick={() => void onFini(false)}>
            {t("Annuler")}
          </Button>
        </div>
      </div>
    );
  }

  const brancher = async (viderMemoire = false) => {
    setOccupe(true);
    setErreur(null);
    try {
      await brancherCanal(employe.id, {
        type,
        champs,
        acces,
        autorises: autorises.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean),
        outilsEntreprise,
        ...(viderMemoire ? { viderMemoire: true } : {}),
      });
      setMemoire(null);
      await onFini(true);
    } catch (err) {
      // Des gens sans compte lui écriraient : sa mémoire d'abord, sur confirmation (ConfirmationMemoire).
      if (estRefusMemoire(err)) setMemoire((err.details?.raisons as RaisonElargissement[] | undefined) ?? ["messagerie"]);
      else setErreur(message(err));
      setOccupe(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="font-medium text-foreground">{def.nom}</p>
      {type === "whatsapp" && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {t("WhatsApp passe par WhatsApp Web, sans l'accord de Meta : le numéro peut être suspendu. Prenez un numéro dédié à l'employé, pas le vôtre. Le téléphone se lie à l'étape suivante, par QR code.")}
        </InfoBox>
      )}
      {def.champs.map((ch) => (
        <Field key={ch.cle} label={t(ch.libelle)} hint={ch.aide && t(ch.aide)}>
          <Input
            type={ch.secret ? "password" : "text"}
            autoComplete="off"
            value={champs[ch.cle] ?? ""}
            onChange={(e) => setChamps((c) => ({ ...c, [ch.cle]: e.target.value }))}
          />
        </Field>
      ))}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{t("Qui peut lui écrire ?")}</p>
        <div className="flex flex-wrap gap-2">
          {(["appairage", "liste"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAcces(a)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                acces === a ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {a === "appairage" ? t("Ceux que j'accepte") : t("Une liste fixe")}
            </button>
          ))}
        </div>
        {acces === "appairage" ? (
          <p className="text-xs text-muted-foreground">
            {t("Une personne inconnue qui lui écrit reçoit un code ; sa demande apparaît ici, et vous l'acceptez ou non.")}
          </p>
        ) : (
          <Field label={t("Personnes autorisées")} hint={AIDE_AUTORISES[type]}>
            <Textarea rows={3} value={autorises} onChange={(e) => setAutorises(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">{t("Ouvrir ses outils de l'entreprise sur ce canal")}</p>
          <p className="text-xs text-muted-foreground">
            {outilsEntreprise
              ? t("Les personnes acceptées pourront lui faire lire les mails, fichiers et agendas qu'on lui a confiés.")
              : t("Sur ce canal, il converse et cherche sur le web s'il en a le droit, mais ne touche ni aux mails, ni aux fichiers, ni aux agendas de l'entreprise.")}
          </p>
        </div>
        <Switch checked={outilsEntreprise} onChange={setOutilsEntreprise} label={t("Ouvrir ses outils de l'entreprise")} />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Brancher un canal redémarre les employés quelques secondes.")}
      </p>
      {erreur && (
        <InfoBox tone="warning" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
          {erreur}
        </InfoBox>
      )}
      {memoire && (
        <ConfirmationMemoire
          nom={employe.nom}
          raisons={memoire}
          occupe={occupe}
          onConfirmer={() => void brancher(true)}
          onAnnuler={() => setMemoire(null)}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={occupe} onClick={() => setType(null)}>
          {t("Retour")}
        </Button>
        <Button disabled={occupe || memoire !== null || def.champs.some((ch) => !(champs[ch.cle] ?? "").trim())} onClick={() => void brancher()}>
          {occupe ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" />{" "}{t("Branchement…")}
            </span>
          ) : (
            "Brancher"
          )}
        </Button>
      </div>
    </div>
  );
}

export default CanauxEmploye;
