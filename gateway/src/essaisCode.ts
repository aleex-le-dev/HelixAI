import { execFile, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";

/**
 * Les tests du projet, lancés pour de vrai, mais dans une cage.
 *
 * Ajouté le 26/09/2026 (« Helix Code doit être bon sur tous les domaines de
 * code ») : un contrôle qui lit le texte ne voit pas qu'un programme se trompe.
 * Mesuré le jour même sur un script Python fait par Qwen3 8B : syntaxe juste,
 * imports justes, et pourtant un test sur deux échouait (`import app` ne lance
 * pas `main()`). Seul un essai le montre.
 *
 * Lancer le code que l'agent vient d'écrire, sans que la personne l'ait
 * accordé, n'est acceptable que s'il ne peut rien faire hors de l'essai. D'où :
 *  - une COPIE du projet dans un dossier temporaire (sans node_modules ni
 *    environnements Python, lus en place et en lecture seule) ;
 *  - le bac à sable de macOS (`sandbox-exec`), avec un profil qui refuse tout
 *    par défaut : lecture limitée au système, aux outils (Homebrew, Node,
 *    Xcode) et à la copie ; écriture dans la copie seulement ; aucun accès au
 *    réseau. Vérifié le 26/09/2026 : lire ~/.helix, écrire dans ~/Documents et
 *    joindre la passerelle sur 127.0.0.1 sont tous refusés ;
 *  - un environnement vide (seulement PATH, HOME dans la copie, la langue),
 *    une limite de temps, une sortie tronquée.
 * Hors macOS, pas de cage connue : aucun essai, et c'est dit.
 */

const DUREE_MAX_MS = 90_000;
const SORTIE_MAX = 6000;
const COPIE_FICHIERS_MAX = 4000;
const COPIE_OCTETS_MAX = 80 * 1024 * 1024;
const IGNORES = /^(node_modules|\.git|\.svn|\.hg|dist|build|out|target|coverage|__pycache__|\.venv|venv|env|\.next|\.nuxt|\.cache|\.pytest_cache|\.mypy_cache|\.DS_Store)$/;

export interface ResultatEssai {
  /** La commande essayée, pour le dire (« python3 -m pytest »). */
  commande: string;
  reussi: boolean;
  /** La fin de la sortie, quand ça échoue. */
  sortie: string;
  dureeMs: number;
}

const cageDisponible = () => process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");

/** Un exécutable trouvé dans le PATH de la passerelle, chemin réel. */
function trouver(nom: string, preferes: string[] = []): string | null {
  for (const c of [...preferes, ...(process.env.PATH ?? "").split(delimiter).map((d) => join(d, nom))]) {
    try {
      if (c && statSync(c).isFile()) return realpathSync(c);
    } catch {}
  }
  return null;
}

const guillemets = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function profil(copie: string, lectures: string[]): string {
  const lus = [...new Set(lectures)].map((d) => `(subpath ${guillemets(d)})`).join(" ");
  return `(version 1)
(deny default)
(allow process-exec*)
(allow process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup)
(allow ipc-posix-shm-read-data)
(allow file-read-metadata)
(allow file-read* (literal "/") (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/System") (subpath "/Library") (subpath "/opt/homebrew") (subpath "/usr/local") (subpath "/private/etc") (subpath "/private/var/db") (subpath "/dev") (subpath "/Applications/Xcode.app") ${lus} (subpath ${guillemets(copie)}))
(allow file-write* (subpath ${guillemets(copie)}) (literal "/dev/null") (literal "/dev/tty"))
(deny network*)
`;
}

/** Copie le projet (borné), sans les dossiers lourds ; les lie en lecture s'il y en a. */
function copier(dossier: string, copie: string): { lectures: string[] } {
  let fichiers = 0;
  let octets = 0;
  const lectures: string[] = [];
  const parcourir = (source: string, cible: string) => {
    let noms: string[] = [];
    try {
      noms = readdirSync(source);
    } catch {
      return;
    }
    for (const nom of noms) {
      const s = join(source, nom);
      const c = join(cible, nom);
      let st;
      try {
        st = statSync(s);
      } catch {
        continue;
      }
      if (IGNORES.test(nom)) {
        // Les dépendances installées sont lues en place (lecture seule) : un lien dans la copie.
        if (st.isDirectory() && (nom === "node_modules" || /venv$/.test(nom))) {
          try {
            symlinkSync(realpathSync(s), c);
            lectures.push(realpathSync(s));
          } catch {}
        }
        continue;
      }
      if (st.isDirectory()) {
        mkdirSync(c, { recursive: true });
        parcourir(s, c);
      } else if (st.isFile()) {
        if (++fichiers > COPIE_FICHIERS_MAX || (octets += st.size) > COPIE_OCTETS_MAX) throw new Error("projet trop gros pour un essai");
        copyFileSync(s, c);
      }
    }
  };
  parcourir(dossier, copie);
  return { lectures };
}

/** Ce qu'il y a à essayer dans ce projet, s'il y a des tests. */
function commandeDEssai(dossier: string): { exe: string; args: string[]; affichee: string; lectures: string[] } | null {
  const fichiers: string[] = [];
  const parcourir = (d: string, profondeur: number) => {
    let noms: string[] = [];
    try {
      noms = readdirSync(d);
    } catch {
      return;
    }
    for (const nom of noms) {
      if (IGNORES.test(nom) || nom.startsWith(".")) continue;
      const p = join(d, nom);
      try {
        if (statSync(p).isDirectory()) {
          if (profondeur > 0) parcourir(p, profondeur - 1);
        } else fichiers.push(relative(dossier, p));
      } catch {}
    }
  };
  parcourir(dossier, 3);

  // Node : le script « test » du projet, sinon les fichiers *.test.js pour node --test.
  let paquet: { scripts?: Record<string, string> } | null = null;
  try {
    paquet = JSON.parse(readFileSync(join(dossier, "package.json"), "utf8"));
  } catch {}
  const node = trouver("node");
  const scriptTest = paquet?.scripts?.test;
  if (node && scriptTest && !/no test specified/.test(scriptTest)) {
    const npm = trouver("npm");
    if (npm) return { exe: npm, args: ["test", "--silent"], affichee: "npm test", lectures: [dirname(dirname(node)), dirname(dirname(npm))] };
  }
  const testsJs = fichiers.filter((f) => /(^|\/)(test|tests)\/.*\.(m|c)?js$|\.test\.(m|c)?js$|\.spec\.(m|c)?js$/.test(f));
  if (node && testsJs.length > 0) return { exe: node, args: ["--test", ...testsJs.slice(0, 50)], affichee: "node --test", lectures: [dirname(dirname(node))] };

  // Python : pytest s'il est installé, sinon unittest.
  const testsPy = fichiers.filter((f) => /(^|\/)test_[^/]*\.py$|_test\.py$/.test(f));
  if (testsPy.length > 0) {
    // Le vrai Python : /usr/bin/python3 n'est qu'un relais vers Xcode.
    const python = trouver("python3", ["/opt/homebrew/bin/python3", "/usr/local/bin/python3"]);
    if (!python) return null;
    let pytest = false;
    try {
      execFileSync(python, ["-I", "-c", "import pytest"], { stdio: "ignore", timeout: 10_000 });
      pytest = true;
    } catch {}
    // Les paquets d'un environnement Python du projet (.venv) : ajoutés au chemin, sans lancer son interpréteur.
    const amorce =
      "import sys, glob, runpy; sys.path[:0] = ['.'] + glob.glob('*venv*/lib/python*/site-packages'); " +
      (pytest ? "sys.argv = ['pytest', '-q', '-p', 'no:cacheprovider']; runpy.run_module('pytest', run_name='__main__')" : "sys.argv = ['unittest', 'discover', '-v']; runpy.run_module('unittest', run_name='__main__')");
    return { exe: python, args: ["-I", "-B", "-c", amorce], affichee: pytest ? "python3 -m pytest" : "python3 -m unittest", lectures: [dirname(dirname(python))] };
  }
  return null;
}

/**
 * Essaie les tests du projet dans la cage. `null` : rien à essayer (pas de
 * tests), ou pas de cage sur ce système ; la raison est rendue à part.
 */
export async function essayerTests(dossier: string): Promise<ResultatEssai | { sans: string } | null> {
  const commande = commandeDEssai(dossier);
  if (!commande) return null;
  if (!cageDisponible()) return { sans: "pas de bac à sable sur ce système" };
  const copie = realpathSync(mkdtempSync(join(tmpdir(), "helix-essai-")));
  const debut = Date.now();
  try {
    const { lectures } = copier(dossier, copie);
    mkdirSync(join(copie, ".tmp"), { recursive: true });
    const fichierProfil = join(copie, ".tmp", "cage.sb");
    writeFileSync(fichierProfil, profil(copie, [...lectures, ...commande.lectures]));
    const env: Record<string, string> = {
      PATH: [...new Set([dirname(commande.exe), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"])].join(":"),
      HOME: copie,
      TMPDIR: join(copie, ".tmp"),
      LANG: "fr_FR.UTF-8",
      PYTHONIOENCODING: "utf-8",
      PYTHONDONTWRITEBYTECODE: "1",
      CI: "1",
      NO_COLOR: "1",
      npm_config_update_notifier: "false",
    };
    const r = await new Promise<{ code: number | null; sortie: string }>((resolve) => {
      execFile(
        "/usr/bin/sandbox-exec",
        ["-f", fichierProfil, commande.exe, ...commande.args],
        { cwd: copie, env, timeout: DUREE_MAX_MS, maxBuffer: 4_000_000, killSignal: "SIGKILL" },
        (err, stdout, stderr) => {
          const code = err && typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : err ? null : 0;
          resolve({ code, sortie: `${stdout ?? ""}${stderr ? `\n${stderr}` : ""}` });
        },
      );
    });
    const dureeMs = Date.now() - debut;
    const propre = r.sortie.split(copie).join(".").replace(/\u001b\[[0-9;]*m/g, "").trim();
    return {
      commande: commande.affichee,
      reussi: r.code === 0,
      sortie: r.code === null && dureeMs >= DUREE_MAX_MS - 500 ? `Arrêté au bout de ${DUREE_MAX_MS / 1000} s (une boucle sans fin, ou une attente de saisie ?).\n${propre.slice(-SORTIE_MAX)}` : propre.slice(-SORTIE_MAX),
      dureeMs,
    };
  } catch (err) {
    return { sans: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      rmSync(copie, { recursive: true, force: true });
    } catch {}
  }
}
