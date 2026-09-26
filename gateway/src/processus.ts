import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";
// L'objet du module lui-même (modifiable), pas son espace de noms : c'est lui que lisent les autres modules.
import processusEnfants, { spawnSync, type ChildProcess } from "node:child_process";

/**
 * Les processus lancés par la passerelle, sous Windows.
 *
 * Pourquoi (audit Windows du 27/09/2026) :
 *  - chaque `lms`, `nvidia-smi`, `python`, `sd-cli` ouvrait une fenêtre de
 *    console noire, qui clignotait par-dessus l'application. `windowsHide`
 *    n'était posé nulle part ; plutôt que de le répéter à chacun des appels
 *    (plus de cent), il devient la valeur par défaut, une fois, au démarrage ;
 *  - `kill()` sous Windows arrête le processus lui-même, pas ceux qu'il a
 *    lancés : un outil installé par npm passe par un `.cmd`, et c'est le
 *    `cmd.exe` qui mourait, pas le programme. `arreterArbre` arrête tout
 *    l'arbre (`taskkill /T /F`).
 *
 * Sur macOS et Linux, rien ne change : ni l'un ni l'autre ne s'applique.
 */

/** Pose `windowsHide: true` par défaut sur tout ce que lance ce processus. Sans effet hors de Windows. */
export function cacherLesConsoles(): void {
  if (process.platform !== "win32") return;
  const cp = processusEnfants as unknown as Record<string, unknown>;
  if ((cp as { __helixCache?: boolean }).__helixCache) return;
  const estOptions = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
  const avecDefaut = (o: Record<string, unknown>) => ("windowsHide" in o ? o : { ...o, windowsHide: true });
  /*
   * Où sont les options : `(commande, arguments?, options?, rappel?)` pour
   * spawn, execFile et fork ; `(commande, options?, rappel?)` pour exec.
   */
  const envelopper = (nom: string, avecArguments: boolean) => {
    const original = cp[nom] as ((...a: unknown[]) => unknown) & Record<symbol, unknown>;
    if (typeof original !== "function") return;
    const corriger = (args: unknown[]): unknown[] => {
      const a = [...args];
      const i = avecArguments && Array.isArray(a[1]) ? 2 : 1;
      if (estOptions(a[i])) a[i] = avecDefaut(a[i] as Record<string, unknown>);
      else if (a[i] === undefined || a[i] === null) a[i] = { windowsHide: true };
      // Un rappel à la place des options : les options s'intercalent, le rappel suit.
      else if (typeof a[i] === "function") a.splice(i, 0, { windowsHide: true });
      return a;
    };
    const enveloppe = function (this: unknown, ...args: unknown[]) {
      return original.apply(this, corriger(args));
    } as typeof original;
    // `promisify(execFile)` rend { stdout, stderr } grâce à cette version : elle doit rester, et cacher la console elle aussi.
    const promise = original[promisify.custom] as ((...a: unknown[]) => unknown) | undefined;
    if (typeof promise === "function") {
      Object.defineProperty(enveloppe, promisify.custom, { value: (...args: unknown[]) => promise(...corriger(args)) });
    }
    cp[nom] = enveloppe;
  };
  for (const nom of ["spawn", "spawnSync", "execFile", "execFileSync", "fork"]) envelopper(nom, true);
  for (const nom of ["exec", "execSync"]) envelopper(nom, false);
  (cp as { __helixCache?: boolean }).__helixCache = true;
  // Les modules déjà écrits en `import { spawn } from "node:child_process"` voient la nouvelle version.
  syncBuiltinESMExports();
}

/**
 * Arrête un processus et tout ce qu'il a lancé. Sous Windows, `taskkill /T /F`
 * (il n'y a pas de signal à y envoyer) ; ailleurs, le signal demandé.
 */
export function arreterArbre(p: ChildProcess | null | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!p || p.exitCode !== null || p.signalCode !== null) return;
  if (process.platform === "win32" && p.pid) {
    arreterPidArbre(p.pid);
    return;
  }
  try {
    p.kill(signal);
  } catch {
    /* déjà arrêté */
  }
}

/** Même chose pour un numéro de processus seul (un employé retrouvé par son fichier de PID). */
export function arreterPidArbre(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 10_000 });
    } catch {
      /* déjà arrêté */
    }
    return;
  }
  try {
    process.kill(pid, signal);
  } catch {
    /* déjà arrêté */
  }
}

/*
 * Posé dès l'import : index.ts importe ce module en premier, avant ceux qui
 * font `promisify(execFile)` à leur chargement et garderaient sinon la version
 * qui montre la console.
 */
cacherLesConsoles();
