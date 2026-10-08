import { ActionError } from "@/lib/action-core";
import { projectMediaFolders, projectMediaRoot, safeRelativePath } from "@/lib/storage-paths";
import { configuredNas, StorageError } from "@/lib/storage";
import { SmbStorageProvider } from "@/lib/smb-storage";
import type { CreatorState, StructuredAction } from "@/lib/model";

function text(value: unknown, label: string, required = false) {
  if (typeof value !== "string" || value.length > 500 || (required && !value.trim())) throw new ActionError(`${label} ist ungültig.`);
  return value.trim();
}
function safePath(root: string, value: unknown, allowRoot = true) {
  const candidate = text(value, "Ordnerpfad", !allowRoot);
  if (!candidate && allowRoot) return root;
  try { safeRelativePath(candidate); } catch { throw new ActionError("Ordnerpfad ist ungültig."); }
  if (candidate === root || candidate.startsWith(root + "/")) return candidate;
  return root + "/" + candidate;
}
function safeFolderName(value: unknown) {
  const name = text(value, "Ordnername", true);
  if (name.length > 90 || name === "." || name === ".." || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)) throw new ActionError("Bitte einen gültigen Ordnernamen eingeben.");
  return name;
}
function updateMediaPaths(state: CreatorState, nasId: string, from: string, to: string) {
  for (const media of state.media) if (media.storageProvider === "nas" && media.storageId === nasId && (media.relativePath === from || media.relativePath.startsWith(from + "/"))) media.relativePath = to + media.relativePath.slice(from.length);
}

export async function runProjectFileAction(state: CreatorState, action: StructuredAction) {
  const args = action.args; const projectId = text(args.projectId, "Projekt", true);
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) throw new ActionError("Projekt wurde nicht gefunden.", 404);
  const nas = state.integrations.nas;
  if (!nas.enabled || nas.protocol !== "smb") throw new ActionError("Der Projekt-Dateibrowser benötigt eine verbundene SMB-Freigabe.", 409);
  const provider = await configuredNas(state);
  if (!(provider instanceof SmbStorageProvider)) throw new ActionError("SMB-Dateibrowser ist nicht verfügbar.", 409);
  const root = projectMediaRoot(project);
  if (action.name === "listProjectFiles") {
    const path = safePath(root, args.path);
    let entries: { name: string; directory: boolean; size: number }[];
    try { entries = await provider.listFolder(path); }
    catch (error) { if (error instanceof StorageError && error.status === 404 && path === root) entries = []; else throw error; }
    return { path: args.path || "", entries };
  }
  if (action.name === "ensureProjectFolder") return { createdPaths: await provider.ensureFolders(projectMediaFolders(project)) };
  if (action.name === "createProjectFolder") {
    const parent = safePath(root, args.path); const name = safeFolderName(args.name);
    await provider.createFolder(parent === root ? root + "/" + name : parent + "/" + name);
    return { created: name };
  }
  if (action.name === "renameProjectFolder") {
    const from = safePath(root, args.from, false); const name = safeFolderName(args.name);
    const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
    const to = parent ? parent + "/" + name : name;
    if (to === from) return { renamed: name };
    const sourceParent = parent || root;
    const entry = (await provider.listFolder(sourceParent)).find((item) => item.name === from.slice(from.lastIndexOf("/") + 1));
    if (!entry?.directory) throw new ActionError("Ordner wurde nicht gefunden.", 404);
    await provider.moveFile(from, to); updateMediaPaths(state, nas.storageId, from, to);
    return { renamed: name };
  }
  if (action.name === "moveProjectFile") {
    const from = safePath(root, args.from, false); const destination = safePath(root, args.to);
    if (destination === from || destination.startsWith(from + "/")) throw new ActionError("Ein Ordner kann nicht in sich selbst verschoben werden.");
    const parent = from.slice(0, from.lastIndexOf("/")) || root;
    const entry = (await provider.listFolder(parent)).find((item) => item.name === from.slice(from.lastIndexOf("/") + 1));
    if (!entry) throw new ActionError("Datei oder Ordner wurde nicht gefunden.", 404);
    if (destination === parent) return { moved: false };
    if (destination !== root) await provider.listFolder(destination);
    const basename = from.slice(from.lastIndexOf("/") + 1); const to = destination === root ? root + "/" + basename : destination + "/" + basename;
    await provider.moveFile(from, to); updateMediaPaths(state, nas.storageId, from, to);
    return { moved: true, name: basename };
  }
  throw new ActionError("Unbekannte Dateiaktion.");
}
