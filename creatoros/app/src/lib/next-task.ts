import type { CreatorState, Project } from "./model.ts";
import { createId } from "./id.ts";
export function syncNextTask(state: CreatorState, project: Project) {
  const available = state.tasks.filter((task) => task.projectId === project.id && task.status !== "done");
  const next = available.find((task) => task.id === project.nextTaskId) || available.find((task) => task.status === "doing") || available[0];
  project.nextTaskId = next?.id || ""; project.nextAction = next?.title || "";
}
export function setNextTaskText(state: CreatorState, project: Project, title: string) {
  const text = title.trim();
  if (!text) { syncNextTask(state,project); return; }
  let task = state.tasks.find((item) => item.id === project.nextTaskId && item.projectId === project.id && item.status !== "done");
  const timestamp = new Date().toISOString();
  if (task) { task.title = text; task.updatedAt = timestamp; }
  else { task = { id: createId(),projectId: project.id,title: text,description: "",status: "open",dueAt: null,createdAt: timestamp,updatedAt: timestamp }; state.tasks.push(task); }
  project.nextTaskId = task.id; syncNextTask(state,project);
}
export function migrateNextTasks(state: CreatorState) {
  for (const project of state.projects) {
    if (project.nextTaskId === undefined && project.nextAction?.trim()) {
      let task = state.tasks.find((item) => item.projectId === project.id && item.title === project.nextAction && item.status !== "done");
      if (!task) {
        let taskId = "next-" + project.id; let suffix = 0;
        while (state.tasks.some((item) => item.id === taskId)) taskId = "next-" + project.id + "-" + (++suffix);
        task = { id: taskId,projectId: project.id,title: project.nextAction,description: "",status: "open",dueAt: null,createdAt: project.createdAt,updatedAt: project.lastTouchedAt }; state.tasks.push(task);
      }
      project.nextTaskId = task.id;
    }
    syncNextTask(state,project);
  }
}
