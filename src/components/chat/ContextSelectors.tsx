import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Folder, FolderMinus, Bot, Check, Settings2, Search } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Popover } from "@/components/ui/Popover";
import { useAgents } from "@/hooks/useAgents";
import { useProjects } from "@/hooks/useProjects";
import { DEFAULT_AGENT } from "@/lib/store/agents";
import { AvatarAgent } from "@/components/ui/AvatarAgent";
import { t, tf } from "@/lib/i18n";

/** Champ de recherche compact interne aux popovers. */
function PopoverSearch({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="mb-1 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
      <Search size={15} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
      <input
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

/**
 * Sélecteur de projet (barre de contexte) : range le chat en cours dans un
 * projet, ou l'en retire.
 *
 * Le menu ne propose que les projets que la personne voit (`useProjects`, qui
 * lit `visibleTo`) : on ne range pas un chat dans un projet dont on n'est pas
 * membre. Le choix est un **classement personnel** et n'ouvre la conversation
 * à personne (voir `projectId` dans lib/store/sessions.ts) ; la mention en
 * pied de menu le dit, pour que personne ne croie partager en classant.
 *
 * Composant contrôlé : c'est l'écran qui sait s'il y a une conversation en
 * cours, et donc s'il faut ranger tout de suite ou à la création.
 */
export function ProjectSelector({
  value,
  onChange,
  disabledReason,
  side = "bottom",
}: {
  /** Projet choisi, ou nul. Un identifiant inconnu est traité comme nul. */
  value: string | null;
  onChange: (projectId: string | null) => void;
  /** Motif exact quand la personne ne peut pas changer le classement. */
  disabledReason?: string;
  /*
   * Sens d'ouverture. En conversation, le composer est collé au bas de
   * l'écran : ouvert vers le bas, le menu sortait de la fenêtre et cachait
   * justement la mention « classement personnel ».
   */
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { projects } = useProjects();

  // Un projet supprimé, ou dont on a été retiré, ne s'affiche pas : on ne
  // montre jamais un nom que la personne n'a plus le droit de connaître.
  const selected = projects.find((p) => p.id === value) ?? null;

  const q = query.trim().toLowerCase();
  const list = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;

  const choisir = (projectId: string | null) => {
    onChange(projectId);
    setOpen(false);
  };

  if (disabledReason) {
    return (
      <Chip leading={<Folder size={15} strokeWidth={1.75} />} disabled title={disabledReason}>
        {selected ? selected.name : t("Projet")}
      </Chip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
      align="start"
      side={side}
      width={300}
      trigger={(p) => (
        <Chip
          leading={<Folder size={15} strokeWidth={1.75} />}
          onClick={p.onClick}
          active={open || Boolean(selected)}
          aria-expanded={p["aria-expanded"]}
          title={selected ? tf("Rangé dans le projet {0}", selected.name) : t("Ranger ce chat dans un projet")}
          /*
           * L'icône seule sous 640 px, comme les autres puces de la barre
           * (parcours du 28/09/2026) : à 375 px, quatre puces sur une ligne ne
           * laissaient à « Projet » et « Agent » que « Pr » et « A », coupés net.
           */
          compacte
        >
          <span className="inline-block max-w-[160px] truncate align-bottom">
            {selected ? selected.name : t("Projet")}
          </span>
        </Chip>
      )}
    >
      {projects.length > 0 && (
        <PopoverSearch placeholder={t("Rechercher des projets...")} value={query} onChange={setQuery} />
      )}

      {projects.length === 0 ? (
        <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">
          {t("Vous ne faites partie d'aucun projet")}
        </p>
      ) : list.length === 0 ? (
        <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">
          {t("Aucun projet trouvé")}
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {list.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => choisir(project.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              <Folder size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {project.name}
              </span>
              {project.id === selected?.id && (
                <Check size={16} strokeWidth={2} className="shrink-0 text-foreground" />
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <button
          type="button"
          onClick={() => choisir(null)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <FolderMinus size={16} strokeWidth={1.75} />
          <span>{t("Retirer du projet")}</span>
        </button>
      )}

      <p className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground">
        {t("Classement personnel : les membres du projet ne voient pas ce chat, sauf si vous le partagez avec eux.")}
      </p>

      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          navigate("/projets");
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Settings2 size={16} strokeWidth={1.75} />
        <span>{t("Gérer les projets")}</span>
      </button>
    </Popover>
  );
}

/**
 * Selecteur d'agent (barre de contexte). « Agent par défaut » = agent generaliste
 * par defaut ; les autres sont les agents crees par l'utilisateur ou publies
 * dans son organisation.
 */
export function AgentSelector({
  value,
  onChange,
  side = "bottom",
}: {
  value?: string;
  onChange?: (agentId: string) => void;
  /** Même raison que pour les projets : en conversation, le menu s'ouvre vers le haut. */
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { selectable } = useAgents();

  const selectedId = value ?? DEFAULT_AGENT.id;
  const selected = selectable.find((a) => a.id === selectedId) ?? DEFAULT_AGENT;

  const q = query.trim().toLowerCase();
  const list = q
    ? selectable.filter((a) => a.name.toLowerCase().includes(q))
    : selectable;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
      align="start"
      side={side}
      width={300}
      trigger={(p) => (
        <Chip
          // La photo de l'agent choisi, s'il en a une (27/09/2026).
          leading={selected?.photo ? <AvatarAgent photo={selected.photo} nom={selected.name} size={16} /> : <Bot size={15} strokeWidth={1.75} />}
          onClick={p.onClick}
          // Allumée quand un agent est choisi : sous 640 px, son nom ne se lit plus qu'au survol.
          active={open || selected.id !== DEFAULT_AGENT.id}
          aria-expanded={p["aria-expanded"]}
          compacte
        >
          {/* Libellé court « Agent » tant qu'on est sur l'agent par défaut. */}
          {selected.id === DEFAULT_AGENT.id ? t("Agent") : selected.name}
        </Chip>
      )}
    >
      <PopoverSearch
        placeholder={t("Rechercher des agents...")}
        value={query}
        onChange={setQuery}
      />

      {list.length === 0 ? (
        <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">
          {t("Aucun agent trouvé")}
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {list.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                onChange?.(agent.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              {agent.photo ? <AvatarAgent photo={agent.photo} nom={agent.name} size={18} /> : <Bot size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {agent.name}
              </span>
              {agent.id === selectedId && (
                <Check size={16} strokeWidth={2} className="shrink-0 text-foreground" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          navigate("/agents");
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Settings2 size={16} strokeWidth={1.75} />
        <span>{t("Gérer mes agents")}</span>
      </button>
    </Popover>
  );
}
