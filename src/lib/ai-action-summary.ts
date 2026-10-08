import type { CreatorState, StructuredAction } from "./model";

const labels: Record<string, string> = {
  createTask: "Aufgabe anlegen", updateTask: "Aufgabe bearbeiten", completeTask: "Aufgabe abhaken", deleteTask: "Aufgabe löschen",
  createContent: "Projekt anlegen", updateContent: "Projekt bearbeiten", scheduleContent: "Veröffentlichung planen", deleteContent: "Projekt löschen",
  createIdea: "Idee festhalten", updateIdea: "Idee bearbeiten", deleteIdea: "Idee löschen", convertIdea: "Idee in Projekt umwandeln",
  attachMedia: "Material zuordnen", detachMedia: "Zuordnung entfernen", renameMedia: "Medium umbenennen", deleteMedia: "Datei löschen", uploadMedia: "Textdatei ablegen",
  listProjectFiles: "Projektdateien ansehen", ensureProjectFolder: "Projektordner vorbereiten", createProjectFolder: "Projektordner erstellen", renameProjectFolder: "Projektordner umbenennen", moveProjectFile: "Datei oder Ordner verschieben",
  createPlanning: "Planung anlegen", updatePlanning: "Planung bearbeiten", deletePlanning: "Planung löschen", removeMaterial: "Materialnotiz entfernen",
  startSession: "Fokus-Session starten", pauseSession: "Fokus-Session ändern", finishSession: "Fokus-Session beenden", extendSession: "Fokus-Session verlängern",
};
const fields: Record<string, string> = { title: "Text", text: "Text", summary: "Beschreibung", nextAction: "Nächste Aufgabe", body: "Skripttext", caption: "Upload-Text", filename: "Datei", name: "Name", startsAt: "Zeitpunkt", publishAt: "Veröffentlichung", status: "Status", pipeline: "Pipeline", platform: "Plattform", durationMinutes: "Dauer", minutes: "Zusatzzeit" };

export function summarizeAiAction(action: StructuredAction, state: CreatorState, outcome?: string) {
  const args = action.args;
  const projectId = typeof args.projectId === "string" ? args.projectId : typeof args.id === "string" && ["updateContent", "deleteContent", "removeMaterial"].includes(action.name) ? args.id : "";
  const project = state.projects.find((item) => item.id === projectId);
  const task = state.tasks.find((item) => item.id === args.id || item.id === args.entityId);
  const idea = state.ideas.find((item) => item.id === args.id);
  const media = state.media.find((item) => item.id === args.id || item.id === args.mediaId);
  const planning = state.planning.find((item) => item.id === args.id);
  const title = labels[action.name] || "CreatorOS-Aktion";
  let subject = "";
  if (["createTask", "updateTask", "completeTask", "deleteTask"].includes(action.name)) subject = String(args.title || task?.title || "");
  else if (["createContent", "updateContent", "deleteContent"].includes(action.name)) subject = String(args.title || project?.title || "");
  else if (["createIdea", "updateIdea"].includes(action.name)) subject = String(args.text || idea?.text || "");
  else if (["deleteIdea", "convertIdea"].includes(action.name)) subject = idea?.text || "";
  else if (["renameMedia", "deleteMedia", "attachMedia", "detachMedia"].includes(action.name)) subject = media?.displayName || String(args.name || args.filename || "");
  else if (["createPlanning", "updatePlanning", "deletePlanning"].includes(action.name)) subject = String(args.title || planning?.title || "");
  else if (action.name === "uploadMedia") subject = String(args.filename || "");
  else if (action.name === "removeMaterial") subject = project?.materials.find((item) => item.id === args.materialId)?.name || "";
  else if (action.name === "convertIdea") subject = idea?.text || "";
  else if (["startSession", "finishSession", "pauseSession", "extendSession"].includes(action.name)) subject = project?.title || state.projects.find((item) => item.id === state.activeProjectId)?.title || "";
  else if (action.name === "createProjectFolder" || action.name === "renameProjectFolder") subject = String(args.name || "");
  else if (action.name === "moveProjectFile") subject = String(args.from || "").split("/").filter(Boolean).at(-1) || "";
  const details: string[] = [];
  if (subject) details.push((action.name === "createIdea" || action.name === "updateIdea" ? "Text" : ["createTask", "createContent", "createPlanning", "createIdea"].includes(action.name) ? "Text" : "Eintrag") + ": " + subject.slice(0, 240));
  const relatedProjectId = typeof args.projectId === "string" ? args.projectId : "";
  const relatedProject = state.projects.find((item) => item.id === relatedProjectId);
  if (relatedProject && !["createContent", "updateContent", "deleteContent"].includes(action.name)) details.push("Projekt: " + relatedProject.title);
  for (const [key, value] of Object.entries(args)) {
    if (["id", "projectId", "entityId", "mediaId", "materialId", "confirm", "title", "text", "name", "filename"].includes(key) || value === undefined || value === null || value === "") continue;
    if (key === "content") { details.push("Textdatei: bereitgestellt"); continue; }
    if (Array.isArray(value)) { details.push(`${key === "scripts" ? "Skriptabschnitte" : key === "materials" ? "Materialeinträge" : key === "hooks" ? "Hooks" : "Einträge"}: ${value.length}`); continue; }
    if (typeof value === "object") continue;
    let shown = String(value);
    if (key === "projectId") shown = state.projects.find((item) => item.id === value)?.title || "Projekt";
    details.push(`${fields[key] || key}: ${shown.slice(0, 180)}`);
  }
  if (outcome === "proposal") details.push("Wartet auf deine Bestätigung");
  else if (outcome === "applied") details.push("Erledigt");
  return { title, details };
}
