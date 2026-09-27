import { useState } from "react";
import { Cpu, Globe, Loader2, LogIn, TriangleAlert, X } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Popover } from "@/components/ui/Popover";
import { Button } from "@/components/ui/Button";
import { InfoBox } from "@/components/ui/InfoBox";
import { ACopier } from "@/components/ui/ACopier";
import { branding } from "@/config/branding";
import { cn } from "@/lib/cn";
import type { EtatCodex, MoteurCode as Moteur } from "@/lib/codex";
import { t, tf } from "@/lib/i18n";

/**
 * Choix du moteur de l'écran Code (27/09/2026, PROJET.md § 3.14) : OpenCode
 * avec les modèles de l'instance, par défaut ; Codex avec le compte ChatGPT
 * de la personne, quand la passerelle le propose (propriétaire du poste,
 * installation de bureau), qu'il est installé et connecté.
 *
 * Rien n'est décidé ici : la passerelle revérifie tout à chaque demande
 * (gateway/src/codexGarde.ts). Pour un membre, sur un poste rattaché ou sur
 * une instance partagée, `propose` est faux et ce sélecteur ne s'affiche pas.
 */
export function MoteurCode({
  moteur,
  onChange,
  etat,
  onConnecter,
  onAnnulerConnexion,
  connexionRefus,
  occupe,
}: {
  moteur: Moteur;
  onChange: (m: Moteur) => void;
  etat: EtatCodex | null;
  onConnecter: () => void;
  onAnnulerConnexion: () => void;
  connexionRefus: string | null;
  /** Une demande tourne : on ne change pas de moteur en plein travail. */
  occupe: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!etat?.propose) return null;
  const pret = etat.installe && etat.connecte && etat.bac !== null;

  const ligne = (valeur: Moteur, titre: string, description: string, icone: React.ReactNode, disponible: boolean) => (
    <button
      type="button"
      disabled={!disponible || occupe}
      aria-pressed={moteur === valeur}
      onClick={() => {
        onChange(valeur);
        setOpen(false);
      }}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        !disponible || occupe ? "cursor-not-allowed opacity-45" : "hover:bg-muted",
        moteur === valeur && "bg-muted/60",
      )}
    >
      <span className="mt-0.5 shrink-0">{icone}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{titre}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      side="bottom"
      coteFixe
      width={360}
      trigger={(p) => (
        <Chip
          leading={moteur === "codex" ? <Globe size={15} strokeWidth={1.75} /> : <Cpu size={15} strokeWidth={1.75} />}
          onClick={p.onClick}
          active={open}
          aria-expanded={p["aria-expanded"]}
        >
          {moteur === "codex" ? t("Codex") : t("OpenCode")}
        </Chip>
      )}
    >
      <p className="px-2.5 pb-1 pt-1 text-sm font-semibold text-foreground">{t("Moteur de l'écran Code")}</p>
      {ligne(
        "opencode",
        tf("OpenCode (modèles de {0})", branding.name),
        t("Les modèles de cette instance. Chaque action passe par vos réglages d'approbation."),
        <Cpu size={17} strokeWidth={1.75} className="text-muted-foreground" />,
        true,
      )}
      {ligne(
        "codex",
        t("Codex (votre compte ChatGPT)"),
        etat.version ? tf("Le programme Codex d'OpenAI installé sur ce poste, version {0}.", etat.version) : t("Le programme Codex d'OpenAI, s'il est installé sur ce poste."),
        <Globe size={17} strokeWidth={1.75} className="text-muted-foreground" />,
        pret,
      )}
      <div className="border-t border-border px-2.5 pb-1 pt-2">
        <EtatCodexDetail etat={etat} onConnecter={onConnecter} onAnnulerConnexion={onAnnulerConnexion} connexionRefus={connexionRefus} />
      </div>
    </Popover>
  );
}

/** Où en est Codex sur ce poste : absent (la commande officielle), pas connecté (le bouton), connecté (comment). */
function EtatCodexDetail({
  etat,
  onConnecter,
  onAnnulerConnexion,
  connexionRefus,
}: {
  etat: EtatCodex;
  onConnecter: () => void;
  onAnnulerConnexion: () => void;
  connexionRefus: string | null;
}) {
  if (!etat.installe) {
    return (
      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          {tf(
            "Codex n'est pas installé sur ce poste. {0} ne l'installe pas pour vous : c'est le logiciel d'OpenAI, dont vous acceptez vous-même les conditions. Commande officielle :",
            branding.name,
          )}
        </p>
        {etat.installation.commandes.map((c) => (
          <ACopier key={c} valeur={c} libelle={t("la commande d'installation")} />
        ))}
        <p>{tf("Source : {0}", etat.installation.source)}</p>
      </div>
    );
  }
  if (etat.connexionEnCours) {
    return (
      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          {t("Terminez la connexion dans votre navigateur, sur la page d'OpenAI.")}
        </p>
        <Button size="sm" variant="ghost" icon={X} onClick={onAnnulerConnexion}>
          {t("Annuler")}
        </Button>
      </div>
    );
  }
  if (!etat.connecte) {
    return (
      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          {tf(
            "Codex est installé mais pas connecté. La connexion se fait chez OpenAI, dans votre navigateur ; {0} ne voit passer ni votre mot de passe ni aucun jeton.",
            branding.name,
          )}
        </p>
        <Button size="sm" variant="secondary" icon={LogIn} onClick={onConnecter}>
          {t("Se connecter avec ChatGPT")}
        </Button>
        {connexionRefus && <p className="text-warning">{connexionRefus}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
      <p>
        {etat.mode === "chatgpt"
          ? t("Connecté avec votre compte ChatGPT : l'usage compte dans les limites de votre abonnement.")
          : etat.mode === "cle"
            ? t("Codex est connecté par une clé d'API OpenAI : l'usage est facturé à cette clé, pas à un abonnement.")
            : tf("État donné par Codex : {0}", etat.detail ?? "")}
      </p>
      {etat.bac === null && (
        <p className="text-warning">
          {t("Au niveau « Demander pour tout », Codex n'est pas proposé : il lit et lance des commandes sans rien demander.")}
        </p>
      )}
    </div>
  );
}

/**
 * Ce qu'il faut savoir avant d'envoyer une demande à Codex, dit à l'écran tant
 * que Codex est le moteur choisi (règle du projet : l'écran ne promet que ce
 * qui est vérifié, et dit où part ce qu'on lui confie).
 */
export function AvisCodex({ etat, compact = false }: { etat: EtatCodex | null; compact?: boolean }) {
  const [deplie, setDeplie] = useState(false);
  if (!etat?.propose) return null;
  const bac =
    etat.bac === "workspace-write"
      ? t("Au niveau d'approbation actuel, Codex peut modifier les fichiers du dossier du projet et lancer des commandes, sans accès au réseau pour ces commandes.")
      : etat.bac === "read-only"
        ? t("Au niveau d'approbation actuel, Codex travaille en lecture seule : il ne peut ni modifier de fichier ni écrire sur le disque.")
        : t("Au niveau « Demander pour tout », Codex n'est pas proposé.");
  /*
   * Sous la barre de saisie d'une session (28/09/2026) : l'avis entier y
   * prenait la moitié d'un écran de 375 pixels à chaque tour, et la
   * conversation n'en avait plus que 200. Une ligne qui dit l'essentiel, le
   * reste d'un clic ; l'avis entier reste à l'accueil de Code.
   */
  if (compact && !deplie) {
    return (
      <InfoBox tone="warning" className="mt-3" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
        {tf("Avec Codex, votre demande part chez OpenAI, et ce que Codex fait ne passe pas par les approbations de {0}.", branding.name)}{" "}
        <button type="button" onClick={() => setDeplie(true)} className="underline underline-offset-2 hover:text-foreground">
          {t("Détails")}
        </button>
      </InfoBox>
    );
  }
  return (
    <InfoBox tone="warning" className="mt-3" leading={<TriangleAlert size={15} strokeWidth={1.75} />}>
      <span className="block">
        {t("Avec Codex, votre demande et les fichiers du projet que Codex lit partent chez OpenAI (États-Unis), sous les limites de votre abonnement ChatGPT.")}
      </span>
      <span className="mt-1 block">
        {tf(
          "Ce que Codex fait lui-même ne passe pas par les approbations de {0} : seul son bac à sable le borne, et {0} ne borne pas ce qu'il lit sur ce poste. {1}",
          branding.name,
          bac,
        )}
      </span>
    </InfoBox>
  );
}
