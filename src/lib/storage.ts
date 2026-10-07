import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, realpath, rename, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CreatorState, MediaRecord, NasConfig } from "@/lib/model";
import { dataDirectory } from "@/lib/store";
import { readSecret } from "@/lib/secrets";
import { safeRelativePath } from "@/lib/storage-paths";
import { SmbStorageProvider } from "@/lib/smb-storage";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export class StorageError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}
export type FileResult = { body: ReadableStream<Uint8Array>; length: number; status: number; contentRange?: string };
export interface StorageProvider {
  storeFile(relativePath: string, body: ReadableStream<Uint8Array>, size: number, mimeType: string): Promise<void>;
  getFile(relativePath: string, range?: string): Promise<FileResult>;
  deleteFile(relativePath: string): Promise<void>;
  moveFile(from: string, to: string): Promise<void>;
}

function limitStream(size: number) {
  let received = 0;
  return new Transform({ transform(chunk, _encoding, done) {
    received += chunk.length;
    done(received > size || received > MAX_UPLOAD_BYTES ? new StorageError("Datei ist größer als angegeben.", 413) : null, chunk);
  }, flush(done) { done(received !== size ? new StorageError("Upload ist unvollständig.", 400) : null); } });
}

export class LocalStorageProvider implements StorageProvider {
  readonly root: string;
  // This is persistent runtime storage, never an asset to include in the application bundle.
  constructor(root = path.join(dataDirectory(), "media")) { this.root = path.resolve(/* turbopackIgnore: true */ root); }
  private async location(relativePath: string, create = false) {
    safeRelativePath(relativePath);
    await mkdir(this.root, { recursive: true });
    if (path.resolve(await realpath(this.root)) !== this.root) throw new StorageError("Speicherordner darf keine Verknüpfung sein.", 400);
    let current = this.root; const parts = relativePath.split("/");
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      try { if ((await lstat(current)).isSymbolicLink()) throw new StorageError("Dateiverknüpfungen sind nicht erlaubt.", 400); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (create && index < parts.length - 1) {
          try { await mkdir(current); } catch (createError) { if ((createError as NodeJS.ErrnoException).code !== "EEXIST") throw createError; }
          const directory = await lstat(current);
          if (!directory.isDirectory() || directory.isSymbolicLink()) throw new StorageError("Ungültiger Speicherordner.", 400);
        }
      }
    }
    const relative = path.relative(this.root, current);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new StorageError("Datei liegt außerhalb des Speichers.", 400);
    return current;
  }
  async storeFile(relativePath: string, body: ReadableStream<Uint8Array>, size: number) {
    const destination = await this.location(relativePath, true);
    const temporary = await this.location(relativePath + "." + randomUUID() + ".upload");
    try {
      await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), limitStream(size), createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      try { await lstat(destination); throw new StorageError("Dateiname existiert bereits.", 409); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
  async getFile(relativePath: string, range?: string): Promise<FileResult> {
    const file = await this.location(relativePath); let info;
    try { info = await stat(file); } catch { throw new StorageError("Datei ist nicht verfügbar.", 404); }
    if (!info.isFile()) throw new StorageError("Keine Mediendatei.", 404);
    let start = 0; let end = info.size - 1; let status = 200;
    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match || (!match[1] && !match[2])) throw new StorageError("Ungültiger Dateibereich.", 416);
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (start > end || start >= info.size) throw new StorageError("Dateibereich nicht verfügbar.", 416);
      status = 206;
    }
    return { body: Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>, length: end - start + 1, status, ...(status === 206 ? { contentRange: "bytes " + start + "-" + end + "/" + info.size } : {}) };
  }
  async deleteFile(relativePath: string) {
    await rm(await this.location(relativePath), { force: true });
    if (/^Media\/(Projects|Tasks)\//.test(relativePath)) {
      const parts = relativePath.split("/").slice(0,-1);
      while (parts.length > 2) {
        const folder = await this.location(parts.join("/"));
        try { await rmdir(folder); } catch { break; } // empty folders only; never recursive
        parts.pop();
      }
    }
  }
  async moveFile(from: string, to: string) {
    const destination = await this.location(to, true);
    try { await lstat(destination); throw new StorageError("Zielname existiert bereits.", 409); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await rename(await this.location(from), destination);
  }
}

export function validateNas(input: Partial<NasConfig>): NasConfig {
  if (!input.host || !/^[a-zA-Z0-9.:[\]-]+$/.test(input.host) || input.host.length > 253 || /^(localhost|127\.|169\.254\.|0\.|::1$|\[::1\])/i.test(input.host)) throw new StorageError("Bitte einen gültigen NAS-Host oder eine LAN-IP eingeben.", 400);
  if (!Number.isInteger(input.port) || input.port! < 1 || input.port! > 65535) throw new StorageError("NAS-Port ist ungültig.", 400);
  if (!["smb", "webdav-https", "webdav-http"].includes(input.protocol || "")) throw new StorageError("NAS-Verbindungstyp ist ungültig.", 400);
  if (input.protocol === "smb") {
    if (!/^[a-zA-Z0-9.-]+$/.test(input.host)) throw new StorageError("Für SMB bitte einen DNS-Namen oder eine IPv4-Adresse eingeben.", 400);
    if (!input.share || input.share.length > 100 || /[\\/<>:"|?*\x00-\x1f]/.test(input.share) || [".",".."].includes(input.share) || /[. ]$/.test(input.share)) throw new StorageError("Bitte einen gültigen SMB-Freigabenamen eingeben, z. B. Medien.", 400);
    if (input.domain && (input.domain.length > 100 || /[\\/\x00-\x1f]/.test(input.domain))) throw new StorageError("SMB-Domäne ist ungültig.", 400);
  }
  if (!input.username || input.username.length > 200 || /[:\r\n]/.test(input.username)) throw new StorageError("NAS-Benutzername fehlt oder ist ungültig.", 400);
  const folder = input.baseFolder?.replace(/^\/+|\/+$/g, "") || "";
  if (folder) safeRelativePath(folder);
  return { ...input, baseFolder: (input.protocol === "smb" ? "" : "/") + folder } as NasConfig;
}

export class WebDavStorageProvider implements StorageProvider {
  readonly config: NasConfig;
  private password: string;
  constructor(config: NasConfig, password: string) { this.config = config; this.password = password; }
  private url(relativePath = "") {
    if (relativePath) safeRelativePath(relativePath);
    const protocol = this.config.protocol === "webdav-https" ? "https" : "http";
    const base = this.config.baseFolder.replace(/^\/+|\/+$/g, "");
    return new URL(protocol + "://" + this.config.host + ":" + this.config.port + "/" + [base, relativePath].filter(Boolean).join("/").split("/").map(encodeURIComponent).join("/"));
  }
  private async call(relative: string, method: string, body?: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
    try {
      const response = await fetch(this.url(relative), {
        method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(method === "PUT" ? 15 * 60 * 1000 : 20000),
        headers: { Authorization: "Basic " + Buffer.from(this.config.username + ":" + this.password).toString("base64"), ...headers },
        ...(body ? { body, duplex: "half" } : {}),
      } as RequestInit);
      if ([401, 403].includes(response.status)) throw new StorageError("NAS-Anmeldung fehlgeschlagen.", 502);
      if (response.status >= 300 && response.status < 400) throw new StorageError("NAS leitet auf eine andere Adresse um. Bitte den direkten WebDAV-Endpunkt konfigurieren.", 502);
      return response;
    } catch (error) { if (error instanceof StorageError) throw error; throw new StorageError("NAS ist nicht erreichbar oder das TLS-Zertifikat konnte nicht geprüft werden."); }
  }
  async test() {
    const response = await this.call("", "PROPFIND", undefined, { Depth: "0" });
    if (response.status === 404) throw new StorageError("NAS-Basisordner ist nicht verfügbar. Bitte den WebDAV-Ordner prüfen.");
    if (![200, 207].includes(response.status)) throw new StorageError("WebDAV-Verbindung konnte nicht bestätigt werden.");
    await response.body?.cancel();
  }
  private async directories(relative: string) {
    const baseParts = this.config.baseFolder.split("/").filter(Boolean);
    const parts = relative.split("/").slice(0, -1);
    const origin = this.url(); origin.pathname = "/";
    const complete = [...baseParts, ...parts]; let directory = "";
    for (const part of complete) {
      directory += "/" + encodeURIComponent(part);
      const target = new URL(directory, origin);
      const response = await fetch(target, { method: "MKCOL", redirect: "manual", signal: AbortSignal.timeout(20000), headers: { Authorization: "Basic " + Buffer.from(this.config.username + ":" + this.password).toString("base64") } }).catch(() => { throw new StorageError("NAS-Ordner konnte nicht angelegt werden."); });
      await response.body?.cancel();
      if (![201, 200, 204, 405].includes(response.status)) throw new StorageError([401,403].includes(response.status) ? "NAS-Anmeldung oder Schreibberechtigung fehlt." : "NAS-Ordner konnte nicht angelegt werden.");
    }
  }
  async storeFile(relativePath: string, body: ReadableStream<Uint8Array>, size: number, mimeType: string) {
    safeRelativePath(relativePath); await this.directories(relativePath);
    let received = 0;
    const bounded = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { received += chunk.byteLength; if (received > size || received > MAX_UPLOAD_BYTES) throw new StorageError("Datei ist größer als angegeben.", 413); controller.enqueue(chunk); },
      flush() { if (received !== size) throw new StorageError("Upload ist unvollständig.", 400); },
    }));
    const response = await this.call(relativePath, "PUT", bounded, { "Content-Type": mimeType, "Content-Length": String(size), "If-None-Match": "*" });
    await response.body?.cancel();
    if (![200,201,204].includes(response.status)) throw new StorageError(response.status === 412 ? "Dateiname existiert bereits." : "NAS-Upload fehlgeschlagen.");
  }
  async getFile(relativePath: string, range?: string): Promise<FileResult> {
    const response = await this.call(relativePath, "GET", undefined, range ? { Range: range } : {});
    if (!response.ok || !response.body) throw new StorageError("Datei auf der NAS ist momentan nicht verfügbar.", response.status === 404 ? 404 : 503);
    return { body: response.body, length: Number(response.headers.get("content-length") || 0), status: response.status, contentRange: response.headers.get("content-range") || undefined };
  }
  async deleteFile(relativePath: string) { const response = await this.call(relativePath, "DELETE"); await response.body?.cancel(); if (!response.ok && response.status !== 404) throw new StorageError("Datei konnte nicht entfernt werden."); }
  async moveFile(from: string, to: string) { const response = await this.call(from, "MOVE", undefined, { Destination: this.url(to).toString(), Overwrite: "F" }); await response.body?.cancel(); if (!response.ok) throw new StorageError("Datei konnte nicht verschoben werden."); }
}

export async function configuredNas(state: CreatorState) {
  const config = state.integrations.nas;
  if (!config.enabled) return null;
  const secret = await readSecret(config.secretId);
  if (!secret?.password) throw new StorageError("NAS-Konfiguration ist unvollständig. Bitte die Verbindung neu einrichten.", 409);
  return config.protocol === "smb" ? new SmbStorageProvider(validateNas(config), secret.password) : new WebDavStorageProvider(validateNas(config), secret.password);
}
export async function storageProvider(state: CreatorState, media?: MediaRecord): Promise<StorageProvider> {
  if (media?.storageProvider === "local") return new LocalStorageProvider();
  if (media && media.storageId !== state.integrations.nas.storageId) throw new StorageError("Der ursprüngliche NAS-Speicher ist nicht verbunden.", 409);
  const nas = await configuredNas(state);
  if (media && !nas) throw new StorageError("NAS ist nicht verbunden. Die Datei bleibt referenziert.", 409);
  return nas || new LocalStorageProvider();
}
