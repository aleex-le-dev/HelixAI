import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Le moteur ouvert (llama.cpp) : ce que la configuration doit savoir de lui
 * dès son chargement, sans rien importer du reste de la passerelle.
 *
 * Module feuille, comme commerceRegles.ts : config.ts le lit pour déclarer la
 * source de modèles, et un import de llamaCpp.ts depuis config.ts refermerait
 * un cycle (langue, pythonPrive, deployment), avec les erreurs d'ordre de
 * chargement déjà vues à la fusion du 28/09/2026.
 */

/**
 * Le moteur ouvert sert-il sur cette machine ?
 *
 *  - Mac à processeur Intel : oui, d'office. LM Studio n'y existe plus
 *    (engine.ts, relevé du 27/09/2026) et ces Mac restaient sans aucun modèle
 *    local ; demandé par Medhi le 28/09/2026 (« un moteur automatique pour
 *    les Mac Intel, avec llama.cpp : go »).
 *  - Ailleurs : seulement si `HELIX_MOTEUR=llamacpp`, sur un système dont
 *    l'archive est épinglée (llamaCpp.ts). C'est ce qui a permis de
 *    l'essayer sur un Mac à puce Apple, où Rosetta n'était pas installée
 *    (le binaire Intel y refuse de démarrer, « Bad CPU type »).
 *
 * Quand il sert, LM Studio est coupé pour cette instance (config.ts) : deux
 * moteurs locaux se disputeraient la mémoire, et l'essai sur le Mac de Medhi
 * ne devait pas toucher à son LM Studio.
 */
export function moteurOuvert(): boolean {
  const voulu = (process.env.HELIX_MOTEUR ?? "").trim().toLowerCase();
  if (voulu === "lmstudio") return false;
  if (process.platform !== "darwin") return false;
  if (voulu === "llamacpp") return process.arch === "x64" || process.arch === "arm64";
  return process.arch === "x64";
}

/** Le dossier du moteur ouvert : `<données>/llamacpp`. */
export const racineLlamaCpp = (): string =>
  join(process.env.HELIX_DATA_DIR ?? join(homedir(), ".helix", "data"), "llamacpp");

/**
 * Port d'écoute du serveur, sur 127.0.0.1 seulement. 8795 : libre à côté de
 * la passerelle (8787), de LM Studio (1234) et des OpenClaw (18789, 18800).
 * `HELIX_LLAMACPP_PORT` pour un autre, et pour les essais.
 */
export function portLlamaCpp(): number {
  const n = Number(process.env.HELIX_LLAMACPP_PORT);
  return Number.isInteger(n) && n > 1024 && n < 65536 ? n : 8795;
}

export const urlLlamaCpp = (): string => `http://127.0.0.1:${portLlamaCpp()}/v1`;

/**
 * La clé que le serveur exige à chaque requête (`--api-key-file`).
 *
 * Sans elle, n'importe quel programme de la machine (une page web aussi, par
 * une requête vers 127.0.0.1) pourrait se servir du modèle, ou charger et
 * décharger des modèles par l'API du routeur. Tirée au hasard une fois,
 * gardée dans un fichier lisible par ce compte seul (0600), à côté du moteur.
 */
export function cleLlamaCpp(): string {
  const fichier = join(racineLlamaCpp(), "cle");
  try {
    const lue = readFileSync(fichier, "utf8").trim();
    if (/^[a-f0-9]{64}$/.test(lue)) return lue;
  } catch {
    /* pas encore tirée */
  }
  const cle = randomBytes(32).toString("hex");
  try {
    mkdirSync(racineLlamaCpp(), { recursive: true, mode: 0o700 });
    writeFileSync(fichier, `${cle}\n`, { mode: 0o600 });
    chmodSync(fichier, 0o600);
  } catch {
    /* dossier en lecture seule : le serveur ne démarrera pas, et l'écran le dira */
  }
  return cle;
}

export const fichierCleLlamaCpp = (): string => join(racineLlamaCpp(), "cle");

/** La clé existe-t-elle déjà (sans la tirer) ? */
export const cleLlamaCppPresente = (): boolean => existsSync(fichierCleLlamaCpp());
