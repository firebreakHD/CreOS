import type { MediaRecord, Project, NasConfig } from "./model.ts";
export function smbExplorerPath(config: NasConfig, relativePath = "") {
  if (config.protocol !== "smb" || !config.host || !config.share) return "";
  if (relativePath) safeRelativePath(relativePath);
  const base = config.baseFolder.replace(/^\/+|\/+$/g, "");
  return "\\\\" + config.host + "\\" + config.share + [base,relativePath].filter(Boolean).map((part) => "\\" + part.replaceAll("/", "\\")).join("");
}
export function safeRelativePath(value: string) {
  if (!value || value.length > 1400 || value.includes("\\") || value.includes("\0") || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === ".." || /[:\x00-\x1f]/.test(part))) throw new Error("Ungültiger Speicherpfad.");
  return value;
}
export function safeName(value: string, max = 90) {
  const safe = value.normalize("NFKC").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, " ").replace(/^\.+|[. ]+$/g, "").slice(0, max).trim();
  return safe || "Datei";
}
export function readableMediaPath(project: Project | null, task: boolean, filename: string, mimeType: string, mediaId: string) {
  const folder = mimeType.startsWith("image/") ? "Images" : mimeType.startsWith("video/") ? "Video" : mimeType.startsWith("audio/") ? "Audio" : "Documents";
  const date = new Date().toISOString().slice(0, 10);
  const base = project ? "Media/Projects/" + safeName(project.title) + "_" + project.id.replace(/[^a-zA-Z0-9]/g, "").slice(-6) : "Media/Tasks/Attachments";
  const clean = safeName(filename, 140); const dot = clean.lastIndexOf(".");
  const name = dot > 0 ? clean.slice(0, dot) : clean; const extension = dot > 0 ? clean.slice(dot) : "";
  return safeRelativePath(base + "/" + (task ? "Tasks/" : "") + folder + "/" + date + "_" + name + "_" + mediaId.slice(0, 8) + extension);
}
export const mediaUrl = (media: Pick<MediaRecord, "id">) => "/api/media/" + encodeURIComponent(media.id) + "/file";
