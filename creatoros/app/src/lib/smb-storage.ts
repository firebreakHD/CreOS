import { spawn } from "node:child_process";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StorageError, MAX_UPLOAD_BYTES, type FileResult, type StorageProvider } from "@/lib/storage";
import type { NasConfig } from "@/lib/model";
import { safeRelativePath } from "@/lib/storage-paths";

type SmbEntry = { name: string; directory: boolean; size: number };
type SmbResult = { ok: boolean; error?: string; status?: number; length?: number; contentRange?: string; entries?: SmbEntry[]; created?: boolean };
type SmbCommand = { operation: string; config: NasConfig; password: string; path?: string; to?: string; size?: number; range?: string };
export type SmbRunner = (command: SmbCommand, body?: ReadableStream<Uint8Array>) => Promise<{ metadata: SmbResult; body?: ReadableStream<Uint8Array> }>;

export const runSmb: SmbRunner = async (command, body) => {
  const python = process.env.CREATOROS_SMB_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const helper = path.join(process.cwd(), "scripts", "smb-storage.py");
  const child = spawn(/* turbopackIgnore: true */ python, ["-u", helper], { shell: false, windowsHide: true, stdio: ["pipe","pipe","pipe"] });
  // Library diagnostics must never be copied into logs or HTTP responses.
  child.stderr.resume();
  const finished = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new StorageError("SMB-Laufzeit fehlt. Bitte das aktuelle Add-on installieren.")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new StorageError("SMB-Dateiübertragung wurde unterbrochen.")));
  });
  finished.catch(() => {});
  const timeout = setTimeout(() => child.kill(), command.operation === "put" || command.operation === "get" ? 15 * 60 * 1000 : 30000);
  timeout.unref(); child.once("close", () => clearTimeout(timeout));
  child.stdin.on("error", () => {});
  child.stdin.write(JSON.stringify(command) + "\n");
  const sending = body ? (async () => {
    let size = 0;
    const bounded = new Transform({ transform(chunk, _encoding, done) {
      size += chunk.length;
      done(size > (command.size || 0) || size > MAX_UPLOAD_BYTES ? new StorageError("Datei ist größer als angegeben.", 413) : null, chunk);
    }, flush(done) { done(size !== command.size ? new StorageError("Upload ist unvollständig.", 400) : null); } });
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), bounded, child.stdin);
  })() : Promise.resolve(child.stdin.end()).then(() => undefined);
  sending.catch(() => child.kill());
  const reader = (Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>).getReader();
  let header = Buffer.alloc(0); let remainder: Uint8Array = new Uint8Array(); let metadata: SmbResult;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) { await finished; throw new StorageError("SMB-Laufzeit lieferte keine Antwort."); }
      const newline = chunk.value.indexOf(10);
      if (newline >= 0) { header = Buffer.concat([header,chunk.value.slice(0,newline)]); remainder = chunk.value.slice(newline+1); break; }
      header = Buffer.concat([header,chunk.value]);
      if (header.length > 65536) throw new StorageError("SMB-Antwort ist ungültig.");
    }
    if (header.length > 65536) throw new StorageError("SMB-Antwort ist ungültig.");
    metadata = JSON.parse(header.toString("utf8"));
    if (!metadata.ok) throw new StorageError(metadata.error || "SMB-Verbindung fehlgeschlagen.", metadata.status || 503);
    await sending;
    if (command.operation !== "get") { await finished; await reader.cancel(); return { metadata }; }
    let initial = true;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (initial) { initial = false; if (remainder.length) { controller.enqueue(remainder); return; } }
          const chunk = await reader.read();
          if (chunk.done) { await finished; controller.close(); reader.releaseLock(); }
          else controller.enqueue(chunk.value);
        } catch (error) { child.kill(); controller.error(error); }
      },
      async cancel() { child.kill(); await reader.cancel().catch(() => {}); },
    });
    return { metadata, body: stream };
  } catch (error) { child.kill(); await reader.cancel().catch(() => {}); await sending.catch(() => {}); throw error instanceof StorageError ? error : new StorageError("SMB-Dateiübertragung fehlgeschlagen."); }
};

export class SmbStorageProvider implements StorageProvider {
  private config: NasConfig; private password: string; private runner: SmbRunner;
  constructor(config: NasConfig, password: string, runner: SmbRunner = runSmb) { this.config = config; this.password = password; this.runner = runner; }
  private call(operation: string, values: Partial<SmbCommand> = {}, body?: ReadableStream<Uint8Array>) {
    if (values.path) safeRelativePath(values.path); if (values.to) safeRelativePath(values.to);
    return this.runner({ operation, config: this.config, password: this.password, ...values }, body);
  }
  async test() { await this.call("test"); }
  async storeFile(relativePath: string, body: ReadableStream<Uint8Array>, size: number) { await this.call("put", { path: relativePath, size }, body); }
  async getFile(relativePath: string, range?: string): Promise<FileResult> {
    if (range && !/^bytes=\d*-\d*$/.test(range)) throw new StorageError("Ungültiger Dateibereich.", 416);
    const result = await this.call("get", { path: relativePath, range });
    if (!result.body) throw new StorageError("SMB-Datei ist nicht verfügbar.");
    return { body: result.body, length: result.metadata.length || 0, status: result.metadata.status || 200, contentRange: result.metadata.contentRange };
  }
  async deleteFile(relativePath: string) { await this.call("delete", { path: relativePath }); }
  async moveFile(from: string, to: string) { await this.call("move", { path: from, to }); }
  async listFolder(relativePath: string): Promise<SmbEntry[]> { return (await this.call("list", { path: relativePath })).metadata.entries || []; }
  async createFolder(relativePath: string) { await this.call("mkdir", { path: relativePath }); }
  async ensureFolder(relativePath: string): Promise<boolean> { return (await this.call("ensure", { path: relativePath })).metadata.created === true; }
}
