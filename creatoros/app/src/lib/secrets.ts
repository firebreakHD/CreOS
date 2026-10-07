import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory } from "@/lib/store";

type Envelope = { iv: string; tag: string; data: string };
let queue: Promise<unknown> = Promise.resolve();
async function key() {
  const directory = dataDirectory();
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, "integrations.key");
  try { await writeFile(filename, randomBytes(32), { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const value = await readFile(filename);
  if (value.length !== 32) throw new Error("Credential-Schlüssel ist ungültig.");
  return value;
}
async function vault(): Promise<Record<string, Envelope>> {
  try { return JSON.parse(await readFile(path.join(dataDirectory(), "integrations.vault.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}
async function writeVault(value: Record<string, Envelope>) {
  const file = path.join(dataDirectory(), "integrations.vault.json");
  const temporary = file + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  await rename(temporary, file);
}
export async function saveSecret(value: Record<string, string>): Promise<string> {
  const work = queue.then(async () => {
    const cipherKey = await key();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", cipherKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const all = await vault(); const secretId = randomUUID();
    all[secretId] = { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
    await writeVault(all); return secretId;
  });
  queue = work.then(() => undefined, () => undefined); return work;
}
export async function readSecret(secretId: string): Promise<Record<string, string> | null> {
  if (!secretId) return null;
  const envelope = (await vault())[secretId];
  if (!envelope) return null;
  const decipher = createDecipheriv("aes-256-gcm", await key(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8"));
}
export async function removeSecret(secretId: string) {
  if (!secretId) return;
  const work = queue.then(async () => { const all = await vault(); delete all[secretId]; await writeVault(all); });
  queue = work.then(() => undefined, () => undefined); await work;
}
