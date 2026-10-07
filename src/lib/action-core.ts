import { id, now, type AiPermission, type CreatorState, type MediaRole, type Project, type StructuredAction, type Task } from "./model.ts";
import { setNextTaskText, syncNextTask } from "./next-task.ts";

export const ACTION_PERMISSIONS: Record<string, AiPermission> = {
  createTask: "task.create", updateTask: "task.update", completeTask: "task.complete",
  createContent: "content.create", updateContent: "content.update", scheduleContent: "content.schedule",
  createIdea: "idea.create", attachMedia: "media.attach", detachMedia: "media.attach",
  uploadMedia: "media.upload",
  createPlanning: "planning.write", updatePlanning: "planning.write",
};
export const permissionLabels: Record<AiPermission, string> = {
  "task.create": "Aufgaben erstellen", "task.update": "Aufgaben ändern & verschieben", "task.complete": "Aufgaben abschließen",
  "content.create": "Content / Projekte erstellen", "content.update": "Content / Projekte bearbeiten",
  "content.schedule": "Veröffentlichungen planen", "media.upload": "Medien hochladen",
  "media.attach": "Medien zuordnen", "planning.write": "Planung erstellen & ändern", "idea.create": "Ideen erstellen",
};
export class ActionError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const text = (value: unknown, field: string, max: number, required = false) => {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new ActionError(field + " ist ungültig.");
  return value.trim();
};
const date = (value: unknown) => {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new ActionError("Datum ist ungültig.");
  return new Date(value).toISOString();
};
const choose = <T extends string>(value: unknown, values: readonly T[], field: string): T => {
  if (typeof value !== "string" || !values.includes(value as T)) throw new ActionError(field + " ist ungültig.");
  return value as T;
};
const pipelines = ["ideas", "planned", "recorded", "editing", "published"] as const;
const platforms = ["Instagram", "TikTok", "YouTube", "Other"] as const;
const roles = ["asset", "reference", "raw", "export", "other"] as const;

export function actionPermission(action: StructuredAction, state: CreatorState): AiPermission {
  if (!action || typeof action.name !== "string" || !action.args || typeof action.args !== "object" || Array.isArray(action.args)) throw new ActionError("Ungültige strukturierte Aktion.");
  if (action.name === "updateTask" && action.args.status === "done") return "task.complete";
  const permission = ACTION_PERMISSIONS[action.name];
  if (!permission) throw new ActionError("Unbekannte Aktion.");
  if (action.name === "updateContent" && Object.hasOwn(action.args, "publishAt")) return "content.schedule";
  return permission;
}

export function actionPermissions(action: StructuredAction, state: CreatorState): AiPermission[] {
  const required = [actionPermission(action, state)];
  if (action.name === "updateContent") required.push("content.update");
  if ((action.name === "updateContent" || action.name === "createContent") && action.args.nextAction) required.push(state.tasks.some((task) => task.id === state.projects.find((project) => project.id === action.args.id)?.nextTaskId) ? "task.update" : "task.create");
  if (action.name === "updateTask") required.push("task.update");
  if (action.name === "uploadMedia") required.push("media.attach");
  return [...new Set(required)];
}

export function checkAiPermission(state: CreatorState, action: StructuredAction) {
  if (!state.integrations.ai.enabled || actionPermissions(action, state).some((permission) => !state.integrations.ai.permissions.includes(permission))) throw new ActionError("Diese AI-Aktion ist nicht freigegeben.", 403);
}

export function actionFingerprint(state: CreatorState, action: StructuredAction): string {
  const targets: Record<string, unknown> = {
    updateContent: state.projects.find((item) => item.id === action.args.id),
    scheduleContent: state.projects.find((item) => item.id === action.args.id),
    updateTask: state.tasks.find((item) => item.id === action.args.id),
    completeTask: state.tasks.find((item) => item.id === action.args.id),
    attachMedia: state.media.find((item) => item.id === action.args.mediaId),
    detachMedia: state.media.find((item) => item.id === action.args.mediaId),
    updatePlanning: state.planning.find((item) => item.id === action.args.id),
    uploadMedia: action.args.entityType === "task" ? state.tasks.find((item) => item.id === action.args.entityId) : state.projects.find((item) => item.id === action.args.entityId),
  };
  return Object.hasOwn(targets, action.name) ? JSON.stringify(targets[action.name] || null) : "";
}

export function applyAction(state: CreatorState, action: StructuredAction): unknown {
  if (!action || typeof action.name !== "string" || !action.args || typeof action.args !== "object" || Array.isArray(action.args)) throw new ActionError("Ungültige strukturierte Aktion.");
  const input = action.args;
  if (action.name === "renameMedia") {
    const media = state.media.find((entry) => entry.id === input.id);
    if (!media) throw new ActionError("Medium nicht gefunden.",404);
    media.displayName = text(input.name,"Anzeigename",200,true); return media;
  }
  if (action.name === "deleteTask") {
    const task = state.tasks.find((entry) => entry.id === input.id);
    if (!task || input.confirm !== true) throw new ActionError("Aufgabenlöschung bitte bestätigen.");
    state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
    for (const media of state.media) media.links = media.links.filter((link) => !(link.entityType === "task" && link.entityId === task.id));
    for (const project of state.projects) syncNextTask(state,project); return { id: task.id };
  }
  if (["updateIdea","deleteIdea"].includes(action.name)) {
    const idea = state.ideas.find((entry) => entry.id === input.id);
    if (!idea) throw new ActionError("Idee nicht gefunden.",404);
    if (action.name === "updateIdea") idea.text = text(input.text,"Idee",2000,true);
    else { if (input.confirm !== true) throw new ActionError("Löschen bitte bestätigen."); state.ideas = state.ideas.filter((entry) => entry.id !== idea.id); }
    return idea;
  }
  if (action.name === "deletePlanning") {
    if (!state.planning.some((entry) => entry.id === input.id) || input.confirm !== true) throw new ActionError("Planungslöschung bitte bestätigen.");
    state.planning = state.planning.filter((entry) => entry.id !== input.id); return { id: input.id };
  }
  if (action.name === "uploadMedia") {
    const entityType = choose(input.entityType, ["project", "task"], "Zuordnung");
    const entityId = text(input.entityId, "Ziel", 100, true);
    if (!(entityType === "project" ? state.projects : state.tasks).some((item) => item.id === entityId)) throw new ActionError("Ziel nicht gefunden.", 404);
    const filename = text(input.filename, "Dateiname", 200, true);
    if (!/\.(txt|json)$/i.test(filename) || /[\/\\\x00-\x1f]/.test(filename)) throw new ActionError("AI-Dateien müssen lesbare TXT- oder JSON-Dateien sein.");
    text(input.content, "Dateiinhalt", 20000, true);
    const content = input.content as string;
    if (/\.json$/i.test(filename)) { try { JSON.parse(content); } catch { throw new ActionError("Die AI-Datei enthält kein gültiges JSON."); } }
    return { entityType, entityId, filename, content, role: input.role === undefined ? "export" : choose(input.role, roles, "Medienrolle") };
  }
  const project = () => {
    const found = state.projects.find((item) => item.id === input.id);
    if (!found) throw new ActionError("Projekt nicht gefunden.", 404);
    return found;
  };
  if (action.name === "removeMaterial") {
    const item = project();
    if (!item.materials.some((material) => material.id === input.materialId)) throw new ActionError("Materialnotiz nicht gefunden.", 404);
    item.materials = item.materials.filter((material) => material.id !== input.materialId);
    item.lastTouchedAt = now(); return item;
  }
  if (action.name === "deleteContent") {
    const item = project();
    if (input.confirm !== true) throw new ActionError("Projektlöschung bitte bestätigen.");
    if (state.sessions.some((session) => session.projectId === item.id && !session.endedAt)) throw new ActionError("Bitte zuerst die laufende Session abschließen.", 409);
    const taskIds = new Set(state.tasks.filter((task) => task.projectId === item.id).map((task) => task.id));
    state.projects = state.projects.filter((entry) => entry.id !== item.id);
    state.tasks = state.tasks.filter((task) => !taskIds.has(task.id));
    state.planning = state.planning.filter((entry) => entry.projectId !== item.id);
    state.ideas = state.ideas.filter((idea) => idea.projectId !== item.id);
    for (const media of state.media) media.links = media.links.filter((link) => !(link.entityType === "project" ? link.entityId === item.id : taskIds.has(link.entityId)));
    if (state.activeProjectId === item.id) state.activeProjectId = state.projects[0]?.id || "";
    return { id: item.id };
  }
  if (action.name === "createContent") {
    const timestamp = now();
    const item: Project = { id: id(), title: text(input.title, "Projektname", 100, true), summary: input.summary === undefined ? "" : text(input.summary, "Beschreibung", 500), status: "active", nextAction: typeof input.nextAction === "string" ? text(input.nextAction, "Nächster Schritt", 500) : "", lastProgress: "Projekt angelegt", lastTouchedAt: timestamp, createdAt: timestamp, pipeline: input.pipeline === undefined ? "ideas" : choose(input.pipeline, pipelines, "Pipeline"), scripts: [], materials: [] };
    state.projects.unshift(item); state.activeProjectId = item.id;
    const nextAction = item.nextAction; item.nextTaskId = ""; item.nextAction = ""; setNextTaskText(state,item,nextAction);
    return item;
  }
  if (action.name === "updateContent") {
    const item = project();
    for (const [key, max] of [["title", 100], ["summary", 500], ["lastProgress", 300], ["caption", 4000]] as const) {
      if (input[key] !== undefined) item[key] = text(input[key], key, max, key === "title");
    }
    if (input.nextAction !== undefined) setNextTaskText(state,item,text(input.nextAction,"Nächste Aufgabe",500));
    if (input.nextTaskId !== undefined) {
      const task = state.tasks.find((task) => task.id === input.nextTaskId && task.projectId === item.id && task.status !== "done");
      if (!task) throw new ActionError("Nächste Aufgabe ist nicht verfügbar.");
      item.nextTaskId = task.id; syncNextTask(state,item);
    }
    if (input.pipeline !== undefined) item.pipeline = choose(input.pipeline, pipelines, "Pipeline");
    if (input.status !== undefined) item.status = choose(input.status, ["active", "paused", "complete"], "Status");
    if (input.platform !== undefined) item.platform = choose(input.platform, platforms, "Plattform");
    if (input.publishAt !== undefined) item.publishAt = date(input.publishAt);
    if (input.hooks !== undefined) {
      if (!Array.isArray(input.hooks) || input.hooks.length > 20) throw new ActionError("Hooks sind ungültig.");
      item.hooks = input.hooks.map((value) => text(value, "Hook", 500));
    }
    if (input.scripts !== undefined) {
      if (!Array.isArray(input.scripts) || input.scripts.length > 100) throw new ActionError("Skript ist ungültig.");
      item.scripts = input.scripts.map((section) => ({ id: text(section?.id, "Abschnitt-ID", 100, true), title: text(section?.title, "Abschnitt", 200, true), body: text(section?.body, "Skripttext", 20000), done: section?.done === true }));
    }
    if (input.materials !== undefined) {
      if (!Array.isArray(input.materials) || input.materials.length > 500) throw new ActionError("Material ist ungültig.");
      item.materials = input.materials.map((material) => ({ id: text(material?.id, "Material-ID", 100, true), name: text(material?.name, "Materialname", 300, true), note: typeof material?.note === "string" ? text(material.note, "Materialnotiz", 1000) : "", kind: choose(material?.kind, ["video", "audio", "image", "note"], "Materialtyp") }));
    }
    item.lastTouchedAt = now(); if (input.active === true) state.activeProjectId = item.id;
    return item;
  }
  if (action.name === "scheduleContent") {
    const item = project(); item.publishAt = date(input.publishAt); item.lastTouchedAt = now();
    if (input.platform !== undefined) item.platform = choose(input.platform, platforms, "Plattform");
    return item;
  }
  if (action.name === "createTask") {
    if (!state.projects.some((item) => item.id === input.projectId)) throw new ActionError("Projekt nicht gefunden.", 404);
    const timestamp = now();
    const task: Task = { id: id(), projectId: input.projectId as string, title: text(input.title, "Aufgabe", 200, true), description: typeof input.description === "string" ? text(input.description, "Beschreibung", 2000) : "", status: "open", dueAt: input.dueAt === undefined ? null : date(input.dueAt), createdAt: timestamp, updatedAt: timestamp };
    state.tasks.push(task); syncNextTask(state,state.projects.find((project) => project.id === task.projectId)!); return task;
  }
  if (["updateTask", "completeTask"].includes(action.name)) {
    if (action.name === "completeTask" && Object.keys(input).some((key) => key !== "id")) throw new ActionError("Abschließen ändert nur den Aufgabenstatus.");
    const task = state.tasks.find((item) => item.id === input.id);
    if (!task) throw new ActionError("Aufgabe nicht gefunden.", 404);
    if (input.title !== undefined) task.title = text(input.title, "Aufgabe", 200, true);
    if (input.description !== undefined) task.description = text(input.description, "Beschreibung", 2000);
    if (input.dueAt !== undefined) task.dueAt = date(input.dueAt);
    if (input.projectId !== undefined) {
      if (!state.projects.some((item) => item.id === input.projectId)) throw new ActionError("Zielprojekt nicht gefunden.", 404);
      task.projectId = input.projectId as string;
    }
    if (input.status !== undefined) task.status = choose(input.status, ["open", "doing", "done"], "Status");
    if (action.name === "completeTask") task.status = "done";
    task.updatedAt = now(); for (const project of state.projects) syncNextTask(state,project); return task;
  }
  if (action.name === "createIdea") {
    const projectId = typeof input.projectId === "string" && input.projectId ? input.projectId : null;
    if (projectId && !state.projects.some((item) => item.id === projectId)) throw new ActionError("Projekt nicht gefunden.", 404);
    const ideaId = typeof input.id === "string" ? text(input.id, "Ideen-ID", 100, true) : id();
    const existing = state.ideas.find((item) => item.id === ideaId); if (existing) return existing;
    const idea = { id: ideaId, text: text(input.text, "Idee", 2000, true), projectId, createdAt: now() };
    state.ideas.unshift(idea); return idea;
  }
  if (["attachMedia", "detachMedia"].includes(action.name)) {
    const media = state.media.find((item) => item.id === input.mediaId);
    if (!media) throw new ActionError("Medium nicht gefunden.", 404);
    const entityType = choose(input.entityType, ["project", "task"], "Zuordnung");
    const entityId = text(input.entityId, "Ziel", 100, true);
    if (!(entityType === "project" ? state.projects : state.tasks).some((item) => item.id === entityId)) throw new ActionError("Ziel nicht gefunden.", 404);
    media.links = media.links.filter((link) => !(link.entityType === entityType && link.entityId === entityId));
    if (action.name === "attachMedia") media.links.push({ entityType, entityId, role: input.role === undefined ? "asset" : choose(input.role, roles, "Medienrolle") as MediaRole });
    return media;
  }
  if (action.name === "createPlanning") {
    const startsAt = date(input.startsAt); if (!startsAt) throw new ActionError("Planungszeit fehlt.");
    const projectId = typeof input.projectId === "string" && input.projectId ? input.projectId : null;
    if (projectId && !state.projects.some((item) => item.id === projectId)) throw new ActionError("Projekt nicht gefunden.", 404);
    const entry = { id: id(), title: text(input.title, "Planung", 200, true), startsAt, projectId, createdAt: now() };
    state.planning.push(entry); return entry;
  }
  if (action.name === "updatePlanning") {
    const entry = state.planning.find((item) => item.id === input.id);
    if (!entry) throw new ActionError("Planung nicht gefunden.", 404);
    if (input.title !== undefined) entry.title = text(input.title, "Planung", 200, true);
    if (input.startsAt !== undefined) { const start = date(input.startsAt); if (!start) throw new ActionError("Planungszeit fehlt."); entry.startsAt = start; }
    return entry;
  }
  throw new ActionError("Unbekannte Aktion.");
}
