import { connect as connecterTls, type TLSSocket } from "node:tls";
import { connect as connecterTcp, type Socket } from "node:net";
import { NomProduit } from "./marque.ts";

/**
 * Client SMTP minimal, pour envoyer un mail que la personne a autorisé.
 *
 * Écrit à la main, comme le client IMAP (courrier.ts) : une bibliothèque
 * d'envoi tierce, c'est un arbre de dépendances qui tient le mot de passe de la
 * boîte de l'entreprise. Il ne sait faire qu'une chose : se connecter en TLS
 * (direct, port 465, ou STARTTLS, port 587), s'authentifier, remettre un
 * message déjà composé à une liste de destinataires, et partir.
 *
 * Certificat vérifié, sans réglage pour s'en passer : même raison que pour
 * IMAP, une option « pour le développement » finit en production et offre le
 * mot de passe au premier réseau hostile venu. Jamais de session en clair : un
 * serveur qui n'annonce pas STARTTLS sur le port 587 est refusé.
 */

export type ChiffrementSmtp = "tls" | "starttls";

export interface ServeurSmtp {
  serveur: string;
  port: number;
  chiffrement: ChiffrementSmtp;
  identifiant: string;
  motDePasse: string;
  /**
   * Jeton d'accès OAuth, quand la boîte est branchée par « Se connecter avec
   * Google / Microsoft ». Présent, il remplace le mot de passe : on
   * s'authentifie en XOAUTH2. Le jeton est résolu et renouvelé par
   * `courrierOauth.ts` avant d'arriver ici — ce module ne fait que le
   * présenter.
   */
  acces?: string;
}

export class ErreurSmtp extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurSmtp";
  }
}

const DELAI_MS = 30_000;
const LIGNE_MAX = 16 * 1024;

interface Reponse {
  code: number;
  lignes: string[];
}

class Session {
  private socket: TLSSocket | Socket;
  private tampon = "";
  private attente: ((r: Reponse) => void) | null = null;
  private echec: ((e: Error) => void) | null = null;
  private lignes: string[] = [];
  /** Réponses arrivées avant qu'on les attende (l'accueil du serveur, souvent). */
  private recues: Reponse[] = [];
  private fin: Error | null = null;

  constructor(socket: TLSSocket | Socket) {
    this.socket = socket;
    this.brancher(socket);
  }

  private brancher(socket: TLSSocket | Socket): void {
    socket.setTimeout(DELAI_MS);
    socket.on("data", (b: Buffer) => this.recevoir(b.toString("latin1")));
    socket.on("timeout", () => this.terminer(new ErreurSmtp("Le serveur d'envoi a cessé de répondre.")));
    socket.on("error", () => this.terminer(new ErreurSmtp("La connexion au serveur d'envoi a été interrompue.")));
    socket.on("close", () => this.terminer(new ErreurSmtp("Le serveur d'envoi a fermé la connexion.")));
  }

  private detacher(): void {
    for (const e of ["data", "timeout", "error", "close"]) this.socket.removeAllListeners(e);
  }

  private terminer(e: Error): void {
    if (!this.fin) this.fin = e;
    const echec = this.echec;
    this.attente = null;
    this.echec = null;
    echec?.(e);
  }

  private recevoir(texte: string): void {
    this.tampon += texte;
    if (this.tampon.length > LIGNE_MAX * 8) return this.terminer(new ErreurSmtp("Réponse du serveur d'envoi illisible."));
    let i: number;
    while ((i = this.tampon.indexOf("\r\n")) >= 0) {
      const ligne = this.tampon.slice(0, i);
      this.tampon = this.tampon.slice(i + 2);
      this.lignes.push(ligne);
      // « 250-… » annonce une suite ; « 250 … » (ou « 250 » seul) conclut.
      if (/^\d{3}(?: |$)/.test(ligne)) {
        const r: Reponse = { code: Number(ligne.slice(0, 3)), lignes: this.lignes.map((l) => l.slice(4)) };
        this.lignes = [];
        const attente = this.attente;
        this.attente = null;
        this.echec = null;
        if (attente) attente(r);
        else this.recues.push(r);
      }
    }
  }

  lire(): Promise<Reponse> {
    const deja = this.recues.shift();
    if (deja) return Promise.resolve(deja);
    if (this.fin) return Promise.reject(this.fin);
    return new Promise((ok, ko) => {
      this.attente = ok;
      this.echec = ko;
    });
  }

  /** Écrit une ligne de protocole. Jamais de retour à la ligne venu de l'extérieur. */
  async commande(ligne: string): Promise<Reponse> {
    if (/[\r\n]/.test(ligne)) throw new ErreurSmtp("Commande d'envoi mal formée.");
    const r = this.lire();
    this.socket.write(`${ligne}\r\n`);
    return r;
  }

  async donnees(message: string): Promise<Reponse> {
    // Transparence (RFC 5321, 4.5.2) : une ligne qui commence par un point en reçoit un second.
    const corps = message.replace(/\r?\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");
    const r = this.lire();
    this.socket.write(`${corps}${corps.endsWith("\r\n") ? "" : "\r\n"}.\r\n`);
    return r;
  }

  async passerEnTls(serveur: string): Promise<void> {
    this.detacher();
    const brut = this.socket as Socket;
    const securise = await new Promise<TLSSocket>((ok, ko) => {
      const s = connecterTls({ socket: brut, servername: serveur, rejectUnauthorized: true, minVersion: "TLSv1.2" });
      s.once("secureConnect", () => ok(s));
      s.once("error", (e) => ko(traduire(e)));
    });
    this.socket = securise;
    this.tampon = "";
    this.lignes = [];
    this.brancher(securise);
  }

  fermer(): void {
    try {
      if (!this.fin && this.socket.writable) this.socket.write("QUIT\r\n");
    } catch {
      /* la politesse n'est pas une garantie */
    }
    this.socket.destroy();
  }
}

function traduire(e: Error): ErreurSmtp {
  const code = (e as NodeJS.ErrnoException).code ?? "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new ErreurSmtp("Serveur d'envoi introuvable : vérifiez son nom.");
  if (code === "ECONNREFUSED") return new ErreurSmtp("Connexion refusée par le serveur d'envoi : vérifiez le serveur et le port.");
  if (/certificat|certificate|self.signed|CERT_|DEPTH_ZERO|ERR_TLS/i.test(`${code} ${e.message}`)) {
    return new ErreurSmtp(
      `Le certificat du serveur d'envoi n'est pas reconnu. ${NomProduit()} refuse de continuer plutôt que d'exposer votre mot de passe.`,
    );
  }
  return new ErreurSmtp("La connexion au serveur d'envoi a échoué.");
}

function ouvrir(s: ServeurSmtp): Promise<TLSSocket | Socket> {
  return new Promise((ok, ko) => {
    const socket =
      s.chiffrement === "tls"
        ? connecterTls({ host: s.serveur, port: s.port, servername: s.serveur, rejectUnauthorized: true, minVersion: "TLSv1.2" })
        : connecterTcp({ host: s.serveur, port: s.port });
    const minuteur = setTimeout(() => {
      socket.destroy();
      ko(new ErreurSmtp("Le serveur d'envoi n'a pas répondu à temps."));
    }, 15_000);
    socket.once(s.chiffrement === "tls" ? "secureConnect" : "connect", () => {
      clearTimeout(minuteur);
      ok(socket);
    });
    socket.once("error", (e: Error) => {
      clearTimeout(minuteur);
      ko(traduire(e));
    });
  });
}

const attendu = (r: Reponse, codes: number[], message: string) => {
  if (!codes.includes(r.code)) throw new ErreurSmtp(message);
};

/** Ouvre, salue, chiffre, s'authentifie. La session rendue est prête à envoyer. */
async function session(s: ServeurSmtp, domaine: string): Promise<Session> {
  const sess = new Session(await ouvrir(s));
  try {
    attendu(await sess.lire(), [220], "Le serveur d'envoi a refusé la connexion.");
    let ehlo = await sess.commande(`EHLO ${domaine}`);
    attendu(ehlo, [250], "Le serveur d'envoi ne répond pas comme un serveur SMTP.");
    if (s.chiffrement === "starttls") {
      if (!ehlo.lignes.some((l) => /^STARTTLS\b/i.test(l))) {
        throw new ErreurSmtp(
          "Ce serveur n'annonce pas STARTTLS sur ce port : le mot de passe partirait en clair. Choisissez le TLS direct (port 465).",
        );
      }
      attendu(await sess.commande("STARTTLS"), [220], "Le serveur d'envoi a refusé de passer en TLS.");
      await sess.passerEnTls(s.serveur);
      // Tout ce qui a été annoncé en clair est oublié et redemandé (RFC 3207).
      ehlo = await sess.commande(`EHLO ${domaine}`);
      attendu(ehlo, [250], "Le serveur d'envoi ne répond plus après le passage en TLS.");
    }
    const auth = ehlo.lignes.find((l) => /^AUTH\b/i.test(l))?.toUpperCase() ?? "";
    const refus =
      "Identifiant ou mot de passe refusé par le serveur d'envoi. Avec la validation en deux étapes, il faut un mot de passe d'application.";
    /*
     * XOAUTH2 d'abord quand un jeton est là. On ne vérifie pas que le serveur
     * l'annonce : Office 365 ne le liste pas toujours dans sa réponse EHLO
     * alors qu'il l'accepte. Un refus rend un message clair, ce qui vaut mieux
     * qu'un repli silencieux sur un mot de passe absent.
     */
    if (s.acces) {
      const jeton = Buffer.from(
        `user=${s.identifiant}\u0001auth=Bearer ${s.acces}\u0001\u0001`,
        "utf8",
      ).toString("base64");
      attendu(
        await sess.commande(`AUTH XOAUTH2 ${jeton}`),
        [235],
        "Le serveur d'envoi a refusé l'autorisation. Elle a peut-être été retirée : " +
          "rebranchez la boîte dans Réglages, Connecteurs.",
      );
    } else if (/\bPLAIN\b/.test(auth)) {
      const jeton = Buffer.from(`\u0000${s.identifiant}\u0000${s.motDePasse}`, "utf8").toString("base64");
      attendu(await sess.commande(`AUTH PLAIN ${jeton}`), [235], refus);
    } else if (/\bLOGIN\b/.test(auth)) {
      attendu(await sess.commande("AUTH LOGIN"), [334], refus);
      attendu(await sess.commande(Buffer.from(s.identifiant, "utf8").toString("base64")), [334], refus);
      attendu(await sess.commande(Buffer.from(s.motDePasse, "utf8").toString("base64")), [235], refus);
    } else {
      throw new ErreurSmtp("Ce serveur d'envoi n'accepte pas d'authentification par mot de passe sur cette connexion.");
    }
    return sess;
  } catch (err) {
    sess.fermer();
    throw err instanceof ErreurSmtp ? err : new ErreurSmtp("La connexion au serveur d'envoi a échoué.");
  }
}

/** Adresse utilisable dans une commande SMTP : ASCII visible, sans chevron. */
const adresseSmtp = (a: string) => /^[\x21-\x7e]+@[\x21-\x7e]+$/.test(a) && !/[<>]/.test(a);

/** Essaie la connexion et l'authentification, sans rien envoyer. */
export async function verifierSmtp(s: ServeurSmtp, de: string): Promise<void> {
  const sess = await session(s, domaineDe(de));
  sess.fermer();
}

/** Nom annoncé au serveur (EHLO) : le domaine de l'adresse, s'il est présentable. */
const domaineDe = (adresse: string) => {
  const d = adresse.split("@")[1] ?? "";
  return /^[a-z0-9.-]{1,253}$/i.test(d) ? d : "localhost";
};

/** Remet un message composé à ses destinataires. Rend le numéro de file du serveur, s'il en donne un. */
export async function envoyerSmtp(s: ServeurSmtp, de: string, destinataires: string[], message: string): Promise<string> {
  if (!adresseSmtp(de)) throw new ErreurSmtp("L'adresse d'envoi ne peut pas servir en SMTP.");
  const refusee = destinataires.find((d) => !adresseSmtp(d));
  if (refusee) throw new ErreurSmtp(`L'adresse « ${refusee.slice(0, 80)} » ne peut pas recevoir de mail par ce serveur.`);
  const sess = await session(s, domaineDe(de));
  try {
    attendu(await sess.commande(`MAIL FROM:<${de}>`), [250], "Le serveur d'envoi a refusé l'expéditeur : l'adresse ne correspond peut-être pas au compte.");
    for (const d of destinataires) {
      const r = await sess.commande(`RCPT TO:<${d}>`);
      attendu(r, [250, 251], `Le serveur d'envoi a refusé le destinataire ${d}.`);
    }
    attendu(await sess.commande("DATA"), [354], "Le serveur d'envoi a refusé le message.");
    const fin = await sess.donnees(message);
    attendu(fin, [250], "Le serveur d'envoi n'a pas accepté le message.");
    return fin.lignes.join(" ").slice(0, 200);
  } finally {
    sess.fermer();
  }
}
