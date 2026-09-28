import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  HardDrive,
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
  // Le moteur et les modèles de la machine : où ils sont, la place qu'il reste (28/09/2026).
  { label: t("Modèles locaux"), path: "/parametres/modeles-locaux", icon: HardDrive },
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

  /*
   * Fenêtre étroite (27/09/2026) : la liste de 248 px laissait 40 px aux
   * réglages à 375 px de large. Sous 768 px, elle devient une rangée qui
   * défile au-dessus de la page, et la page ouverte y reste en vue.
   */
  const { pathname } = useLocation();
  const liste = useRef<HTMLElement>(null);
  useEffect(() => {
    liste.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <aside
      ref={liste}
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2 md:w-[248px] md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r"
    >
      <div className="mb-2 hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground md:flex">
        <Search size={15} strokeWidth={1.75} />
        {/* Libellé court : « Rechercher dans les paramètres » était coupé à « …les para » dans cette colonne (vu le 28/09/2026). */}
        <input
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder={t("Rechercher un réglage")}
          aria-label={t("Rechercher un réglage")}
          value={recherche}
          onChange={(event) => setRecherche(event.target.value)}
        />
      </div>
      <p className="hidden px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:block">
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
                "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors md:whitespace-normal",
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
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
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
