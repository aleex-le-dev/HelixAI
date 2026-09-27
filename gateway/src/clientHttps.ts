import https from "node:https";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

/**
 * Client HTTPS minimal des connecteurs Google Drive et Slack.
 *
 * Pourquoi pas `fetch` : il ne permet ni de fixer la version minimale de TLS,
 * ni de couper une réponse au-delà d'une taille donnée avant de l'avoir reçue
 * en entier, ni de refuser de suivre une redirection sans lire la suite. Ce
 * client fait ces trois choses, sur la seule bibliothèque standard de Node,
 * comme les clients IMAP et CalDAV de la passerelle.
 *
 * Trois règles, qui ne se négocient pas :
 *
 * 1. **Le certificat est toujours vérifié.** `rejectUnauthorized: true`, et il
 *    n'existe aucun paramètre pour l'assouplir. Ces connexions portent un jeton
 *    qui ouvre le Drive ou le Slack de l'entreprise : une option « pour le
 *    développement » qui couperait la vérification finirait en production et
 *    offrirait ce jeton au premier réseau hostile venu.
 * 2. **Aucune redirection n'est suivie.** Une redirection emporterait l'en-tête
 *    d'autorisation vers une adresse que nous n'avons pas choisie. Un 3xx est
 *    rendu tel quel à l'appelant, qui le traite comme une erreur.
 * 3. **Tout est borné** : la taille de la réponse, l'inactivité de la
 *    connexion, et la durée totale de l'échange. Un serveur qui envoie sans fin
 *    ou goutte à goutte ne retient pas la passerelle.
 *
 * L'hôte est toujours une constante du module appelant (`www.googleapis.com`,
 * `slack.com`...), jamais une valeur reçue d'une requête ou du modèle : ce
 * client ne sait pas aller ailleurs que là où le code l'envoie.
 */

export interface DemandeHttps {
  methode: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Nom d'hôte, constante du module appelant. */
  hote: string;
  /** Chemin et paramètres, déjà encodés par `URLSearchParams`. */
  chemin: string;
  entetes?: Record<string, string>;
  /** Texte (JSON, formulaire), ou octets bruts : l'envoi d'une vidéo à TikTok (outilsNatifs.ts, 28/09/2026). */
  corps?: string | Buffer;
  /** Octets conservés au plus. */
  limiteOctets: number;
  /**
   * Au-delà de la limite : `refuser` abandonne l'échange (une réponse JSON
   * coupée ne se lit pas), `tronquer` garde le début (un document long se lit
   * en partie, et on le dit).
   */
  auDela: "refuser" | "tronquer";
  /** Inactivité tolérée, en millisecondes. */
  delaiMs: number;
  /** Durée totale de l'échange, en millisecondes. */
  delaiTotalMs: number;
  /** Identifie le connecteur auprès du service, sans rien dire de plus. */
  agentUtilisateur: string;
}

export interface ReponseHttps {
  statut: number;
  entetes: IncomingHttpHeaders;
  corps: Buffer;
  /** Vrai si la réponse a été coupée à `limiteOctets` (mode `tronquer`). */
  tronque: boolean;
}

/**
 * Erreur de transport. Son message est destiné à l'utilisateur : il ne cite
 * jamais la réponse du serveur, ni l'adresse complète, ni un en-tête.
 */
export class ErreurTransport extends Error {
  readonly categorie: "reseau" | "certificat" | "delai" | "taille";
  constructor(categorie: ErreurTransport["categorie"], message: string) {
    super(message);
    this.name = "ErreurTransport";
    this.categorie = categorie;
  }
}

function traduire(e: Error, service: string): ErreurTransport {
  const code = (e as NodeJS.ErrnoException).code ?? "";
  if (/certificat|certificate|self.signed|CERT_|DEPTH_ZERO|ERR_TLS|UNABLE_TO_VERIFY/i.test(`${code} ${e.message}`)) {
    return new ErreurTransport(
      "certificat",
      `Le certificat présenté au nom de ${service} n'est pas reconnu. La connexion est refusée ` +
        "plutôt que d'y envoyer un jeton d'accès. Si votre réseau intercepte le trafic chiffré, " +
        "l'autorité de votre entreprise doit être installée dans le magasin de confiance de cette machine.",
    );
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new ErreurTransport("reseau", `${service} est injoignable : pas de réseau, ou nom introuvable.`);
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EPIPE") {
    return new ErreurTransport("reseau", `La connexion à ${service} a été interrompue.`);
  }
  if (code === "ETIMEDOUT") {
    return new ErreurTransport("delai", `${service} n'a pas répondu dans le temps imparti.`);
  }
  return new ErreurTransport("reseau", `La connexion à ${service} a échoué.`);
}

/** Un échange complet, sans jamais laisser de connexion ouverte derrière lui. */
export function requeteHttps(demande: DemandeHttps, service: string): Promise<ReponseHttps> {
  return new Promise<ReponseHttps>((ok, ko) => {
    const charge = demande.corps === undefined ? null : Buffer.isBuffer(demande.corps) ? demande.corps : Buffer.from(demande.corps, "utf8");
    let termine = false;
    let minuterieTotale: ReturnType<typeof setTimeout> | undefined;
    const finir = (fn: () => void) => {
      if (termine) return;
      termine = true;
      clearTimeout(minuterieTotale);
      fn();
    };

    const req = https.request(
      {
        host: demande.hote,
        port: 443,
        path: demande.chemin,
        method: demande.methode,
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        // Pas de mise en commun : la socket est refermée à chaque réponse.
        agent: false,
        headers: {
          ...(demande.entetes ?? {}),
          ...(charge ? { "Content-Length": String(charge.length) } : {}),
          Connection: "close",
          "User-Agent": demande.agentUtilisateur,
        },
      },
      (res: IncomingMessage) => {
        const statut = res.statusCode ?? 0;
        if (statut >= 300 && statut < 400) {
          // Redirection : on ne la suit pas, et son corps ne sert à rien.
          res.resume();
          const conclure = () =>
            finir(() => ok({ statut, entetes: res.headers, corps: Buffer.alloc(0), tronque: false }));
          res.on("end", conclure);
          res.on("close", conclure);
          return;
        }

        const morceaux: Buffer[] = [];
        let taille = 0;
        res.on("data", (bloc: Buffer) => {
          if (termine) return;
          if (taille + bloc.length > demande.limiteOctets) {
            if (demande.auDela === "tronquer") {
              morceaux.push(bloc.subarray(0, demande.limiteOctets - taille));
              taille = demande.limiteOctets;
              res.destroy();
              finir(() =>
                ok({ statut, entetes: res.headers, corps: Buffer.concat(morceaux), tronque: true }),
              );
              return;
            }
            res.destroy();
            finir(() =>
              ko(
                new ErreurTransport(
                  "taille",
                  `La réponse de ${service} dépasse la taille autorisée. Demandez moins d'éléments à la fois.`,
                ),
              ),
            );
            return;
          }
          taille += bloc.length;
          morceaux.push(bloc);
        });
        const livrer = () =>
          finir(() => ok({ statut, entetes: res.headers, corps: Buffer.concat(morceaux), tronque: false }));
        res.on("end", livrer);
        res.on("error", (e: Error) => finir(() => ko(traduire(e, service))));
        /*
         * Une socket fermée avant la fin du corps n'est pas une réponse
         * complète : la livrer ferait lire un JSON coupé comme s'il était
         * entier. `complete` distingue les deux cas.
         */
        res.on("close", () => {
          if (res.complete) livrer();
          else finir(() => ko(new ErreurTransport("reseau", `La réponse de ${service} a été interrompue.`)));
        });
      },
    );

    req.setTimeout(demande.delaiMs, () => {
      req.destroy();
      finir(() => ko(new ErreurTransport("delai", `${service} n'a pas répondu dans le temps imparti.`)));
    });
    minuterieTotale = setTimeout(() => {
      req.destroy();
      finir(() => ko(new ErreurTransport("delai", `L'échange avec ${service} a pris trop de temps.`)));
    }, demande.delaiTotalMs);
    req.on("error", (e: Error) => finir(() => ko(traduire(e, service))));
    req.end(charge ?? undefined);
  });
}

/* ------------------------- utilitaires communs ------------------------------- */

/**
 * Chaîne venue du modèle, donc d'une source non fiable.
 *
 * Les caractères de contrôle sont refusés plutôt que filtrés : ils n'ont aucun
 * sens dans un critère de recherche, et un refus net vaut mieux qu'un
 * nettoyage silencieux dont personne ne connaît la règle. Même règle que le
 * connecteur d'agenda.
 */
export function critereSur(valeur: unknown, longueurMax: number): string | null {
  if (typeof valeur !== "string") return null;
  const t = valeur.trim();
  if (t.length === 0) return null;
  if (/[\u0000-\u001F\u007F-\u009F\uFFFE\uFFFF]/.test(t)) return null;
  return t.slice(0, longueurMax);
}

/** Borne un nombre venu du modèle, qui écrit parfois « 3650 » sans y penser. */
export function borner(valeur: unknown, defaut: number, max: number): number {
  const n = Math.trunc(Number(valeur));
  if (!Number.isFinite(n) || n <= 0) return defaut;
  return Math.min(n, max);
}

/**
 * Traduit une date AAAA-MM-JJ en minuit local du poste. La date n'est jamais
 * recopiée : on en extrait trois nombres et on reconstruit un instant. Le
 * 31 février est refusé plutôt que replié sur le 3 mars.
 */
export function minuitLocal(valeur: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur.trim());
  if (!m) return null;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const d = new Date(annee, mois - 1, jour, 0, 0, 0, 0);
  if (d.getFullYear() !== annee || d.getMonth() !== mois - 1 || d.getDate() !== jour) return null;
  return d.getTime();
}

/** Comparaison insensible à la casse et aux accents, pour un public francophone. */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const FORMAT_JOUR_HEURE = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Date et heure en français, dans le fuseau de ce poste : « lun. 8 septembre
 * 2026 à 14:32 ». Le modèle la recopie telle quelle, il n'a rien à recalculer.
 */
export function dateFrancaise(ms: number): string {
  if (!Number.isFinite(ms)) return "date inconnue";
  return FORMAT_JOUR_HEURE.format(new Date(ms));
}
