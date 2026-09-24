import { useCallback, useEffect, useState } from "react";
import { currentUser } from "@/lib/store/identity";
import {
  visibleTo,
  createTask,
  updateTask,
  deleteTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/store/tasks";
import {
  TACHES_CHANGEES,
  abonnerExecutions,
  executionsEnCours,
  interrompreTache,
  lancerLesSuites,
  lancerTache,
} from "@/lib/executions";
import { getTask } from "@/lib/store/tasks";

function notify(): void {
  window.dispatchEvent(new Event(TACHES_CHANGEES));
}

/**
 * Les tâches de la personne, et leurs exécutions. Celles-ci sont tenues par
 * `lib/executions.ts`, pour toute l'application : elles survivent au
 * changement d'écran, et une carte terminée lance les suivantes.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => visibleTo(currentUser()));
  const [runningIds, setRunningIds] = useState<string[]>(executionsEnCours);

  const refresh = useCallback(() => setTasks(visibleTo(currentUser())), []);

  useEffect(() => {
    window.addEventListener(TACHES_CHANGEES, refresh);
    const fin = abonnerExecutions(() => setRunningIds(executionsEnCours()));
    return () => {
      window.removeEventListener(TACHES_CHANGEES, refresh);
      fin();
    };
  }, [refresh]);

  const create = useCallback(
    (data: {
      title: string;
      description?: string;
      priority?: TaskPriority;
      agentId?: string;
      /* Colonne d'arrivée, quand la création part du « + » d'une colonne. */
      status?: TaskStatus;
      /* Jour d'échéance « AAAA-MM-JJ », et projet de classement. */
      dueDate?: string;
      projectId?: string;
      /* Tâches à terminer d'abord, et lancement automatique après elles. */
      dependsOn?: string[];
      autoStart?: boolean;
    }) => {
      const task = createTask(currentUser(), data);
      notify();
      return task;
    },
    [],
  );

  const update = useCallback((id: string, changes: Partial<Task>) => {
    const avant = getTask(id);
    updateTask(id, changes);
    notify();
    const apres = getTask(id);
    if (apres && avant?.status !== "terminee" && apres.status === "terminee") lancerLesSuites(apres);
  }, []);

  const remove = useCallback((id: string) => {
    interrompreTache(id);
    deleteTask(id);
    notify();
  }, []);

  /** Délègue la tâche à son agent : il travaille, la carte avance. */
  const delegate = useCallback((task: Task, modelUid?: string) => lancerTache(task, modelUid), []);

  const cancel = useCallback((id: string) => interrompreTache(id), []);

  return { tasks, create, update, remove, delegate, cancel, runningIds, refresh };
}
