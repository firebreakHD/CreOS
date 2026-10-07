import { NextResponse } from "next/server";
import { projectMediaRoot, safeRelativePath, smbExplorerPath } from "@/lib/storage-paths";
import { readState, updateState } from "@/lib/store";
import { configuredNas, StorageError } from "@/lib/storage";
import { SmbStorageProvider } from "@/lib/smb-storage";
import { rejectUntrustedRequest } from "@/lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectFor(state: Awaited<ReturnType<typeof readState>>, id: string) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) throw new StorageError("Projekt wurde nicht gefunden.", 404);
  return project;
}
async function browser(state: Awaited<ReturnType<typeof readState>>) {
  const nas = state.integrations.nas;
  if (!nas.enabled || nas.protocol !== "smb") throw new StorageError("Der Projekt-Dateibrowser benötigt eine verbundene SMB-Freigabe.", 409);
  const provider = await configuredNas(state);
  if (!(provider instanceof SmbStorageProvider)) throw new StorageError("SMB-Dateibrowser ist nicht verfügbar.", 409);
  return { provider, nas };
}
function projectPath(root: string, subpath: unknown, allowEmpty = true) {
  if (subpath === "" && allowEmpty) return root;
  if (typeof subpath !== "string") throw new StorageError("Ordnerpfad ist ungültig.", 400);
  if (subpath === root && allowEmpty) return root;
  try { safeRelativePath(subpath); } catch { throw new StorageError("Ordnerpfad ist ungültig.", 400); }
  if (!subpath.startsWith(root + "/")) throw new StorageError("Der Dateipfad liegt außerhalb dieses Projekts.", 400);
  return subpath;
}
function folderName(value: unknown) {
  if (typeof value !== "string") throw new StorageError("Ordnername ist ungültig.", 400);
  const name = value.trim();
  if (!name || name.length > 90 || name === "." || name === ".." || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)) throw new StorageError("Bitte einen gültigen Ordnernamen eingeben.", 400);
  return name;
}
function renameMediaPaths(state: Awaited<ReturnType<typeof readState>>, nasId: string, from: string, to: string) {
  for (const media of state.media) {
    if (media.storageProvider !== "nas" || media.storageId !== nasId) continue;
    if (media.relativePath === from || media.relativePath.startsWith(from + "/")) media.relativePath = to + media.relativePath.slice(from.length);
  }
}
function failure(error: unknown) {
  const e = error instanceof StorageError ? error : new StorageError("Projektordner konnten nicht bearbeitet werden.", 400);
  return NextResponse.json({ error: e.message }, { status: e.status });
}

export async function GET(request: Request) {
  try {
    const state = await readState(); const params = new URL(request.url).searchParams;
    const project = projectFor(state, params.get("projectId") || "");
    const { provider, nas } = await browser(state); const root = projectMediaRoot(project);
    const current = projectPath(root, params.get("path") || "");
    let entries: { name: string; directory: boolean; size: number }[];
    try { entries = await provider.listFolder(current); }
    catch (error) { if (error instanceof StorageError && error.status === 404 && current === root) entries = []; else throw error; }
    return NextResponse.json({ path: params.get("path") || "", root, explorerPath: smbExplorerPath(nas, current), entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const untrusted = rejectUntrustedRequest(request); if (untrusted) return untrusted;
  try {
    const body = await request.json() as Record<string, unknown>; const state = await readState();
    const project = projectFor(state, String(body.projectId || "")); const { provider, nas } = await browser(state); const root = projectMediaRoot(project);
    if (body.action === "mkdir") {
      const parent = projectPath(root, body.path);
      const folder = folderName(body.name);
      await provider.createFolder(parent === root ? root + "/" + folder : parent + "/" + folder);
    } else if (body.action === "rename") {
      const from = projectPath(root, body.from, false); const name = folderName(body.name);
      const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
      const to = parent ? parent + "/" + name : name;
      if (to === from) return NextResponse.json({ ok: true, state });
      const sourceParent = parent || root;
      const entry = (await provider.listFolder(sourceParent)).find((item) => item.name === from.slice(from.lastIndexOf("/") + 1));
      if (!entry?.directory) throw new StorageError("Ordner wurde nicht gefunden.", 404);
      await provider.moveFile(from, to);
      const { state: updated } = await updateState((current) => renameMediaPaths(current, nas.storageId, from, to));
      return NextResponse.json({ ok: true, state: updated });
    } else if (body.action === "move") {
      const from = projectPath(root, body.from, false); const destination = projectPath(root, body.to);
      if (destination === from || destination.startsWith(from + "/")) throw new StorageError("Ein Ordner kann nicht in sich selbst verschoben werden.", 400);
      const parent = from.slice(0, from.lastIndexOf("/")) || root;
      const entry = (await provider.listFolder(parent)).find((item) => item.name === from.slice(from.lastIndexOf("/") + 1));
      if (!entry) throw new StorageError("Datei oder Ordner wurde nicht gefunden.", 404);
      if (destination === parent) return NextResponse.json({ ok: true, state });
      if (destination !== root) await provider.listFolder(destination);
      const basename = from.slice(from.lastIndexOf("/") + 1); const to = destination === root ? root + "/" + basename : destination + "/" + basename;
      await provider.moveFile(from, to);
      const { state: updated } = await updateState((current) => renameMediaPaths(current, nas.storageId, from, to));
      return NextResponse.json({ ok: true, state: updated });
    } else throw new StorageError("Dateiaktion ist unbekannt.", 400);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
