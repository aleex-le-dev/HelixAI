/**
 * Lancer et arrêter la passerelle de ce poste, dans un `utilityProcess`.
 *
 * ── Pourquoi (28/09/2026) ──────────────────────────────────────────────────
 *
 * L'application relançait son propre binaire en mode Node
 * (`ELECTRON_RUN_AS_NODE=1`) pour faire tourner la passerelle. Cela obligeait
 * à laisser ouvert le fusible RunAsNode, et n'importe quel programme du Mac
 * pouvait alors lancer Helix avec cette variable : son JavaScript tournait
 * sous l'identité de Helix, avec les autorisations accordées à Helix
 * (accessibilité, micro, écran), sans rien demander. Vérifié ce jour-là sur le
 * paquet construit. Un `utilityProcess` est un processus Node complet que
 * seule l'application sait lancer ; le fusible est fermé (package.json,
 * `build.electronFuses` ; SECURITE.md, « RunAsNode fermé »).
 *
 * Ce qui change pour la passerelle, et ce qui ne change pas :
 *  - le canal : `process.parentPort` au lieu de `process.send`
 *    (gateway/src/canalApplication.ts) ; mêmes messages (`permission-ecran`,
 *    `arret`, et `node-prive` pour la commande `helix`) ;
 *  - l'environnement, le dossier de travail (le dossier personnel) et les
 *    journaux (stdout et stderr lus par l'application) : comme avant ;
 *  - le débogueur : `--disable-sigusr1` n'a pas d'effet ici (`execArgv` n'est
 *    que recopié dans `process.execArgv` : essayé le 28/09/2026, SIGUSR1
 *    ouvrait encore 9229 dans Electron de développement). C'est la passerelle
 *    qui écoute SIGUSR1 (gateway/src/index.ts), ce qui le retire au débogueur,
 *    et le fusible --inspect reste fermé dans le paquet ;
 *  - `disclaim` reste à faux : les demandes d'autorisation de macOS faites par
 *    la passerelle restent celles de Helix, comme avant ;
 *  - l'arrêt : SIGTERM hors de Windows (le gestionnaire de la passerelle
 *    tourne, essayé), le canal sous Windows. Electron arrête lui-même ses
 *    processus utilitaires quand l'application s'arrête, **sans** que leurs
 *    gestionnaires tournent (essayé) : l'application doit donc attendre la
 *    fin de la passerelle avant de quitter (main.cjs, `before-quit`).
 *
 * Séparé de main.cjs pour être essayé tel quel par `npm run securite`
 * (scripts/essai-passerelle-electron.cjs).
 */

const os = require("node:os");
const { spawn } = require("node:child_process");
const { utilityProcess } = require("electron");

/**
 * Lance la passerelle (`entry` : dist-gateway/index.cjs). `enfant.helixArretee`
 * dit si elle s'est arrêtée : `utilityProcess` n'a ni `exitCode` ni `connected`.
 */
function lancerPasserelle({ entry, env, nom }) {
  const propre = { ...env };
  // Reçue du terminal de VS Code, par exemple : elle n'a rien à faire chez la passerelle ni chez ce qu'elle lance.
  delete propre.ELECTRON_RUN_AS_NODE;
  const enfant = utilityProcess.fork(entry, [], {
    env: propre,
    // Sorties lues pour le journal. L'entrée n'est pas prise en charge par Electron, et la passerelle n'en lit pas.
    stdio: "pipe",
    serviceName: `${nom} passerelle`,
    /*
     * Le dossier personnel, pas celui de l'installation (audit Windows du
     * 27/09/2026) : sinon chaque programme lancé par la passerelle (dont le
     * moteur, qui survit à Helix) tenait le dossier d'installation ouvert, et
     * la désinstallation le laissait derrière elle.
     */
    cwd: os.homedir(),
  });
  enfant.helixArretee = false;
  enfant.on("exit", () => {
    enfant.helixArretee = true;
  });
  return enfant;
}

/** Un message à la passerelle ; sans effet si elle est déjà arrêtée (le canal est fermé). */
function envoyerALaPasserelle(enfant, message) {
  if (!enfant || enfant.helixArretee) return false;
  try {
    enfant.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/** Arrête la passerelle ; la promesse se résout quand elle est vraiment arrêtée (port libéré), 5 s au plus. */
function arreterPasserelle(enfant) {
  if (!enfant || enfant.helixArretee) return Promise.resolve();
  return new Promise((resolve) => {
    enfant.once("exit", () => resolve());
    if (process.platform === "win32") {
      /*
       * Sous Windows, `kill()` tue net : la passerelle n'arrêtait pas ce
       * qu'elle avait lancé (audit du 27/09/2026). On lui demande de s'arrêter
       * par le canal ; au bout de 4 s, l'arbre entier est abattu.
       */
      envoyerALaPasserelle(enfant, { type: "arret" });
      setTimeout(() => {
        if (!enfant.helixArretee && enfant.pid) {
          spawn("taskkill", ["/pid", String(enfant.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        }
      }, 4000).unref?.();
    } else {
      // SIGTERM : la passerelle arrête ce qu'elle a lancé, puis sort (essayé dans un `utilityProcess` le 28/09/2026).
      enfant.kill();
    }
    setTimeout(resolve, 5000).unref?.();
  });
}

module.exports = { lancerPasserelle, envoyerALaPasserelle, arreterPasserelle };
