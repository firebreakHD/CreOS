import { id, now, type MediaRecord, type MediaRole } from "@/lib/model";
import { readState, updateState } from "@/lib/store";
import { readableMediaPath } from "@/lib/storage-paths";
import { MAX_UPLOAD_BYTES, StorageError, storageProvider } from "@/lib/storage";
import { checkAiPermission } from "@/lib/action-core";

export const FILE_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg",
  pdf: "application/pdf", txt: "text/plain", json: "application/json", zip: "application/zip", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export async function uploadMedia(request: Request, actor: "user" | "ai" = "user", proposalId?: string) {
  const state = await readState(); const params = new URL(request.url).searchParams;
  const entityType = params.get("entityType") || "project"; const entityId = params.get("entityId") || "";
  const role = params.get("role") || "asset";
  if (actor === "ai") checkAiPermission(state, { name: "uploadMedia", args: {} });
  if (!["project", "task"].includes(entityType) || !["asset", "reference", "raw", "export", "other"].includes(role)) throw new StorageError("Medienzuordnung ist ungültig.", 400);
  const task = entityType === "task" ? state.tasks.find((item) => item.id === entityId) : null;
  const project = state.projects.find((item) => item.id === (task?.projectId || entityId));
  if (!project || (entityType === "task" && !task)) throw new StorageError("Projekt oder Aufgabe wurde nicht gefunden.", 404);
  const filename = decodeURIComponent(request.headers.get("x-file-name") || "").trim();
  if (!filename || filename.length > 255 || /[\/\\\x00-\x1f]/.test(filename)) throw new StorageError("Dateiname ist ungültig.", 400);
  const extension = filename.toLowerCase().split(".").pop() || ""; const mimeType = FILE_TYPES[extension];
  if (!mimeType) throw new StorageError("Dieser Dateityp wird nicht unterstützt. Nutze Bild, Video, Audio, PDF, Text, Office-Dateien oder ZIP.", 415);
  const size = Number(request.headers.get("x-file-size"));
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES || !request.body) throw new StorageError("Die Datei muss zwischen 1 Byte und 500 MB groß sein.", 413);
  if (state.media.length >= 5000) throw new StorageError("Die Medienübersicht enthält zu viele Dateien.", 409);
  const mediaId = id(); const relativePath = readableMediaPath(project, entityType === "task", filename, mimeType, mediaId, role as MediaRole);
  const provider = await storageProvider(state);
  const media: MediaRecord = { id: mediaId, originalFilename: filename, displayName: filename, mimeType, fileSize: size, storageProvider: state.integrations.nas.enabled ? "nas" : "local", storageId: state.integrations.nas.enabled ? state.integrations.nas.storageId : "local", relativePath, createdAt: now(), links: [{ entityType: entityType as "project" | "task", entityId, role: role as MediaRole }] };
  await provider.storeFile(relativePath, request.body, size, mimeType);
  try {
    const { state: next } = await updateState((current) => {
      if (current.media.length >= 5000) throw new StorageError("Die Medienübersicht enthält zu viele Dateien.", 409);
      if (actor === "ai") checkAiPermission(current, { name: "uploadMedia", args: {} });
      if (!(entityType === "task" ? current.tasks : current.projects).some((item) => item.id === entityId)) throw new StorageError("Ziel ist nicht mehr verfügbar.", 409);
      if (proposalId) {
        const proposal = current.actionProposals.find((item) => item.id === proposalId);
        if (proposal?.status !== "executing") throw new StorageError("Upload-Vorschlag ist nicht mehr verfügbar.", 409);
        proposal.status = "applied";
      }
      current.media.unshift(media);
    });
    return { state: next, media };
  } catch (error) { await provider.deleteFile(relativePath).catch(() => {}); throw error; }
}
