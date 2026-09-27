import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  User,
  Palette,
  Shield,
  Brain,
  CalendarClock,
  Blocks,
  MonitorCog,
  CodeXml,
  Activity,
  Lock,
  Download,
  FileInput,
  Search,
  Cloud,
  CreditCard,
  GraduationCap,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { features } from "@/config/branding";
import { t } from "@/lib/i18n";

interface NavEntry {
  label: string;
  path: string;
  icon: LucideIcon;
}

/** Sous-navigation « Personnel » des parametres. */
export const settingsNav: NavEntry[] = [
  { label: t("Profil"), path: "/parametres/profil", icon: User },
  { label: t("Préférences"), path: "/parametres/preferences", icon: Palette },
  { label: t("Sécurité"), path: "/parametres/securite", icon: Shield },
  { label: t("Personnalisation de l'IA"), path: "/parametres/personnalisation", icon: Brain },
  { label: t("Bot Recorder"), path: "/parametres/bot-recorder", icon: CalendarClock },
  // Le chemin reste « mcp » : c'est un lien que des postes ont pu mettre en
  // favori, et le renommer casserait ce qui marche pour un gain nul.
  // Une seule entrée pour tout ce qui se branche : courrier, agenda, services.
  // « Intégrations » a été retirée, elle menait à un second écran du même objet.
  { label: t("Connecteurs"), path: "/parametres/mcp", icon: Blocks },
  { label: t("Modèles cloud"), path: "/parametres/modeles", icon: Cloud },
  { label: t("Entraîner un modèle"), path: "/parametres/entrainement", icon: GraduationCap },
  { label: t("Contrôle de l'écran"), path: "/parametres/ecran", icon: MonitorCog },
  { label: t("API développeur"), path: "/parametres/api", icon: CodeXml },
  { label: t("Mon usage"), path: "/parametres/usage", icon: Activity },
  /*
   * Rangée juste après « Mon usage » : on regarde ce qu'on consomme, puis ce
   * que cela coûterait. Absente quand le module est éteint, ce qui est le cas
   * de toute installation en marque blanche.
   */
  ...(features.abonnement
    ? [{ label: t("Abonnement"), path: "/parametres/abonnement", icon: CreditCard }]
    : []),
  { label: t("Confidentialité"), path: "/parametres/confidentialite", icon: Lock },
  { label: t("Installer les apps"), path: "/parametres/apps", icon: Download },
  { label: t("Importer depuis d'autres IA"), path: "/parametres/importer", icon: FileInput },
  // En dernier (27/09/2026) : on y vient quand quelque chose ne va pas, pas pour régler.
  { label: t("Signaler un problème"), path: "/parametres/signaler", icon: Bug },
];

function SettingsNav() {
  // Le champ de recherche filtre la liste qu'il surmonte : sans cela, taper
  // dedans ne produisait rien, pas même un « aucun résultat ».
  const [recherche, setRecherche] = useState("");
  const terme = recherche.trim().toLowerCase();
  const visibles = terme
    ? settingsNav.filter((e) => e.label.toLowerCase().includes(terme))
    : settingsNav;

  return (
    <aside className="flex w-[248px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border px-3 py-2">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">
        <Search size={15} strokeWidth={1.75} />
        <input
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder={t("Rechercher dans les paramètres")}
          aria-label={t("Rechercher dans les paramètres")}
          value={recherche}
          onChange={(event) => setRecherche(event.target.value)}
        />
      </div>
      <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Personnel")}
      </p>
      {visibles.length === 0 && (
        <p className="px-2 py-2 text-sm text-muted-foreground">{t("Aucun réglage trouvé.")}</p>
      )}
      {visibles.map((e) => {
        const Icon = e.icon;
        return (
          <NavLink
            key={e.path}
            to={e.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )
            }
          >
            <Icon size={17} strokeWidth={1.75} />
            {e.label}
          </NavLink>
        );
      })}
    </aside>
  );
}

/** Coquille des parametres : barre « Paramètres » + nav + contenu (Outlet). */
export function SettingsLayout() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-3 pt-6">
        <h1 className="text-lg font-semibold text-foreground">{t("Paramètres")}</h1>
      </div>
      <div className="flex min-h-0 flex-1">
        <SettingsNav />
        <div className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

/* --- Briques de contenu ---------------------------------------------------- */

/** Enveloppe d'une sous-page : grand titre + sous-titre + contenu. */
export function SettingsPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      {/*
       * Conteneur de requête : les sections se mettent sur deux colonnes selon
       * la place réellement disponible, pas selon la largeur de la fenêtre (la
       * barre latérale et la navigation des paramètres en prennent déjà une part).
       */}
      <div className="mt-6 cq">{children}</div>
    </div>
  );
}

/** Section a deux colonnes : libelle + description a gauche, carte a droite. */
export function SettingsRow({
  title,
  desc,
  children,
  last,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-6 py-7 cq-lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]",
        !last && "border-b border-border",
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      <div className="min-w-0 cq">{children}</div>
    </div>
  );
}

/** Carte encadree (surface de contenu a droite d'une SettingsRow). */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      {children}
    </div>
  );
}
