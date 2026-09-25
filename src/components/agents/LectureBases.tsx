import { useEffect, useState } from "react";
import { BookOpenText, Loader2 } from "lucide-react";
import { LIBELLE_FAMILLE, lectureDesBases, type Employe, type LectureDesBases, type RaisonEquipeSeulement } from "@/lib/employes";
import { t, tf } from "@/lib/i18n";

const RAISON: Record<Exclude<RaisonEquipeSeulement, "outils">, () => string> = {
  organisation: () => t("il est ouvert à toute l'organisation : plusieurs personnes lui parlent ;"),
  messagerie: () => t("on peut lui écrire sur une messagerie ;"),
  "mission-mail": () => t("une de ses missions part à chaque mail reçu ;"),
  liberte: () => t("sa liberté va au-delà d'« Encadré » (web, messages, commandes) ;"),
};

function etatBase(b: LectureDesBases["bases"][number]): string {
  if (b.lue) return tf("lue : {0} document(s) sur {1}", b.documentsLus, b.documents);
  switch (b.raison) {
    case "prive":
      return t("non lue : base privée");
    case "groupes-equipe":
      return t("non lue : partagée à des groupes");
    case "groupes-autres":
      return t("non lue : partagée à des groupes dont vous n'êtes pas membre");
    case "documents":
      return t("non lue : aucun de ses documents ne lui est ouvert");
    case "inconnue":
      return t("non lue");
    default:
      return t("rien à lire pour l'instant : aucun document prêt");
  }
}

/**
 * Ce que l'agent toujours actif (l'employé OpenClaw) lira réellement dans les
 * bases qu'on est en train de lui choisir, et pourquoi pas dans les autres.
 *
 * Rien n'est deviné ici : l'instance fait le calcul de son outil
 * `connaissances__chercher` (gateway/src/employes.ts, `lectureDesBases`) et le
 * rend base par base. Dans le Chat, la règle est autre (chacun lit ce qu'il
 * voit) : c'est dit juste au-dessus, dans la fenêtre.
 */
export function LectureBases({ employe, bases }: { employe?: Employe; bases: string[] }) {
  const [lecture, setLecture] = useState<LectureDesBases | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = [...bases].sort().join(",");
  const id = employe?.id;

  useEffect(() => {
    if (!id) return;
    let fini = false;
    // Une case cochée après l'autre : on attend un instant avant de redemander.
    const minuteur = setTimeout(() => {
      lectureDesBases(id, cle ? cle.split(",") : [])
        .then((l) => {
          if (fini) return;
          setLecture(l);
          setErreur(null);
        })
        .catch((err: unknown) => {
          if (fini) return;
          setLecture(null);
          setErreur(err instanceof Error ? err.message : String(err));
        });
    }, 250);
    return () => {
      fini = true;
      clearTimeout(minuteur);
    };
  }, [id, cle]);

  if (!employe) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Cet agent n'est pas encore en service : ce qu'il lira depuis sa fiche et ses missions sera dit ici une fois qu'il le sera.")}
      </p>
    );
  }
  if (erreur) {
    return <p className="text-sm text-muted-foreground">{tf("Impossible de dire ici ce qu'il lira : {0}", erreur)}</p>;
  }
  if (!lecture) return <Loader2 size={15} className="animate-spin text-muted-foreground" />;

  const autres = lecture.raisons.filter((r): r is Exclude<RaisonEquipeSeulement, "outils"> => r !== "outils");
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      {lecture.groupes ? (
        <p>
          {t("Depuis sa fiche et ses missions, cet agent ne travaille que pour vous : il lit ce qui est ouvert à toute l'équipe et ce qui est partagé aux groupes dont vous êtes membre, jamais vos documents privés.")}
        </p>
      ) : (
        <>
          <p>{t("Depuis sa fiche, ses missions et ses messageries, il ne lit que ce qui est ouvert à toute l'équipe, parce que :")}</p>
          <ul className="space-y-0.5 pl-4">
            {autres.map((r) => (
              <li key={r}>{`• ${RAISON[r]()}`}</li>
            ))}
            {lecture.raisons.includes("outils") && (
              <li>
                {`• ${tf("il a des outils qui écrivent ou envoient là où d'autres les lisent : {0}.", lecture.outilsQuiSortent.map((f) => LIBELLE_FAMILLE[f]).join(", "))}`}
              </li>
            )}
          </ul>
          <p>
            {t("Il lirait aussi les bases de vos groupes si tout ce qu'il produit ne revenait qu'à vous : un agent personnel, sans messagerie ni mission à chaque mail, en liberté « Encadré », sans ces outils.")}
          </p>
        </>
      )}
      {lecture.bases.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-border p-2">
          {lecture.bases.map((b) => (
            <li key={b.id} className="flex items-center gap-2">
              <BookOpenText size={14} strokeWidth={1.75} className={b.lue ? "shrink-0 text-info" : "shrink-0 text-muted-foreground"} />
              <span className="min-w-0 flex-1 truncate text-foreground">{b.nom ?? t("Base que vous ne voyez pas, ou supprimée")}</span>
              <span className="shrink-0 text-xs">{etatBase(b)}</span>
            </li>
          ))}
        </ul>
      )}
      {lecture.groupes && (
        <p className="text-xs">
          {t("S'il est ensuite ouvert à l'équipe, joint sur une messagerie ou doté d'outils qui écrivent, il cesse aussitôt de lire les bases de vos groupes. Ce qu'il en a déjà noté dans sa mémoire peut y rester.")}
        </p>
      )}
    </div>
  );
}
