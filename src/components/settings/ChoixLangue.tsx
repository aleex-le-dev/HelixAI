import { Check, Languages } from "lucide-react";
import { cn } from "@/lib/cn";
import { LANGUES, changerLangue, langue, t } from "@/lib/i18n";

/**
 * Choisir la langue de l'interface.
 *
 * ── Ce que l'écran dit, et qui n'est pas cosmétique ─────────────────────────
 *
 * Chaque langue porte son nom **dans cette langue** : quelqu'un qui ne lit pas
 * le français doit pouvoir trouver la sienne. « English » et « 中文 » se
 * reconnaissent sans traduction ; « Anglais » et « Chinois » ne servent qu'à
 * celui qui lit déjà le français.
 *
 * L'écran annonce aussi que **le choix recharge la page**. Le rechargement est
 * assumé (voir `src/lib/i18n.ts`) : il garantit qu'aucun morceau d'écran ne
 * reste dans l'ancienne langue. Le dire avant vaut mieux que de le faire
 * subir.
 *
 * ── Ce qu'il ne promet pas ──────────────────────────────────────────────────
 *
 * Que tout soit traduit. Ce qui vient de l'instance — messages d'erreur de la
 * passerelle, résultats d'outils — reste en français quand il ne figure pas au
 * catalogue, et le contenu écrit par les utilisateurs n'est évidemment jamais
 * touché.
 *
 * Plus de ligne sous chaque langue (« 100 % de l'interface traduite »,
 * « Langue d'origine du logiciel ») : retirée à la demande de Medhi le
 * 25/09/2026, qui la jugeait inutile, celui qui choisit sa langue s'attend à
 * la lire partout.
 */
export function ChoixLangue() {
  const courante = langue();

  return (
    <div className="mt-7 space-y-3 border-b border-border pb-7">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Languages size={17} strokeWidth={1.75} /> {t("Langue")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Le choix vaut pour ce poste. La page se recharge pour que tout l'écran change d'un coup.")}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {LANGUES.map((l) => {
          const active = l.code === courante;
          return (
            <button
              key={l.code}
              type="button"
              lang={l.code}
              aria-current={active}
              onClick={() => {
                if (!active) changerLangue(l.code);
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-foreground/40 bg-muted"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{l.natif}</span>
              {active && <Check size={15} strokeWidth={2.5} className="shrink-0 text-foreground" />}
            </button>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("Ce que vous écrivez (Chats, documents, procédures) n'est jamais traduit. Certains messages venus de l'instance peuvent rester en français.")}
      </p>
    </div>
  );
}

export default ChoixLangue;
