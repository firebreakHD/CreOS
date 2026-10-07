import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdir, chmod, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dataDirectory, readState, updateState } from "@/lib/store";
import { ActionError } from "@/lib/action-core";
import { readSecret, saveSecret, removeSecret } from "@/lib/secrets";

type Rpc = { id?: number; method?: string; params?: any; result?: any; error?: unknown };
type Login = { type: "chatgpt" | "chatgptDeviceCode"; loginId: string; authUrl?: string; verificationUrl?: string; userCode?: string; expiresAt: number };
export const codexThreadConfig = {
  web_search: "disabled", cli_auth_credentials_store: "file", agents: { enabled: false },
  features: { shell_tool: false, stable_environment_tools: false, view_image: false, multi_agent: false, multi_agent_v2: false, apps: false, plugins: false, code_mode: false },
  tools: { update_plan: { enabled: false } },
};
export class CodexClient {
  events = new EventEmitter();
  pendingLogin: Login | null = null;
  loginMessage = "";
  handlers = new Map<string, (params: any) => Promise<unknown>>();
  private process: ChildProcessWithoutNullStreams | null = null;
  private sequence = 0;
  private requests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private starting: Promise<void> | null = null;
  private root: string;
  private authHome = "";
  private credentialQueue: Promise<unknown> = Promise.resolve();
  constructor(root: string) { this.root = root; }
  async start() {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const home = await mkdtemp(path.join(os.tmpdir(),"creatoros-codex-")); this.authHome = home;
      const workspace = path.join(this.root, "codex-workspace");
      await mkdir(home, { recursive: true, mode: 0o700 }); await chmod(home, 0o700);
      await mkdir(workspace, { recursive: true, mode: 0o700 });
      const state = await readState();
      if (state.integrations.ai.provider === "codex") {
        const credential = await readSecret(state.integrations.ai.secretId);
        if (credential?.codexAuth) await writeFile(path.join(home,"auth.json"),credential.codexAuth,{ mode: 0o600 });
      }
      const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: home };
      delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
      const executable = process.env.CREATOROS_CODEX_EXECUTABLE || "codex";
      const prefix = process.env.CREATOROS_CODEX_SCRIPT ? [process.env.CREATOROS_CODEX_SCRIPT] : [];
      const child = spawn(/* turbopackIgnore: true */ executable, [...prefix, "app-server", "-c", 'cli_auth_credentials_store="file"', "-c", "analytics.enabled=false"], { cwd: workspace, env, shell: false, windowsHide: true, stdio: ["pipe","pipe","pipe"] });
      this.process = child;
      child.stderr.resume(); child.stdin.on("error", () => {});
      let buffer = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        if (buffer.length > 4 * 1024 * 1024) { child.kill(); return; }
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          try { void this.receive(JSON.parse(line)).catch(() => child.kill()); } catch { child.kill(); }
        }
      });
      const stopped = () => {
        if (this.process !== child) return;
        this.process = null; this.starting = null; this.pendingLogin = null;
        for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(new ActionError("Codex-Laufzeit ist nicht verfügbar. Bitte das aktuelle Add-on installieren oder Codex konfigurieren.", 503)); }
        this.requests.clear(); this.events.emit("stopped");
        if (path.dirname(home) === os.tmpdir() && path.basename(home).startsWith("creatoros-codex-")) void rm(home,{ recursive: true,force: true }).catch(() => {});
      };
      child.once("error", stopped); child.once("exit", stopped);
      await this.request("initialize", { clientInfo: { name: "creatoros", title: "CreatorOS", version: "1.0" }, capabilities: { experimentalApi: true } });
      this.send({ method: "initialized", params: {} });
    })();
    try { await this.starting; } catch (error) { this.process?.kill(); this.starting = null; throw error; }
  }
  private send(message: Rpc) { if (!this.process) throw new ActionError("Codex ist nicht verfügbar.", 503); this.process.stdin.write(JSON.stringify(message) + "\n"); }
  request(method: string, params: unknown = {}, timeout = 30000): Promise<any> {
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(requestId); reject(new ActionError("Codex antwortet momentan nicht. Bitte erneut versuchen.", 504)); }, timeout);
      this.requests.set(requestId, { resolve, reject, timer });
      try { this.send({ id: requestId, method, params }); } catch (error) { clearTimeout(timer); this.requests.delete(requestId); reject(error); }
    });
  }
  private async receive(message: Rpc) {
    if (message.id !== undefined && !message.method) {
      const request = this.requests.get(message.id); if (!request) return;
      this.requests.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new ActionError("Codex konnte den Aufruf nicht ausführen. Anmeldung und Modell prüfen.", 502)); else request.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      try {
        if (message.method !== "item/tool/call" || !this.handlers.has(message.params?.threadId)) throw new Error("Nicht freigegeben");
        const result = await this.handlers.get(message.params.threadId)!(message.params);
        this.send({ id: message.id, result });
      } catch { this.send({ id: message.id, error: { code: -32601, message: "CreatorOS erlaubt ausschließlich freigegebene strukturierte Aktionen." } }); }
      return;
    }
    if (message.method === "account/login/completed" && message.params?.loginId === this.pendingLogin?.loginId) {
      this.loginMessage = message.params.success ? "Codex-Anmeldung abgeschlossen." : "Anmeldung nicht abgeschlossen. Bei Device-Code die Freigabe in den ChatGPT-Sicherheitseinstellungen prüfen und erneut versuchen.";
      this.pendingLogin = null;
      if (message.params.success) await this.persistCredentials();
    }
    if (message.method) this.events.emit(message.method, message.params);
  }
  async account(refreshToken = false) { await this.start(); const result = await this.request("account/read", { refreshToken }); await this.persistCredentials(); return result.account as { type: string; email?: string; planType?: string } | null; }
  async persistCredentials() {
    const work = this.credentialQueue.then(async () => {
      let content: string;
      try { content = await readFile(path.join(this.authHome,"auth.json"),"utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      if (content.length > 128000 || !JSON.parse(content).tokens) return;
      await chmod(path.join(this.authHome,"auth.json"),0o600);
      const current = await readState(); if (current.integrations.ai.provider !== "codex") return;
      const previousId = current.integrations.ai.secretId;
      if ((await readSecret(previousId))?.codexAuth === content) return;
      const secretId = await saveSecret({ codexAuth: content }); let applied = false;
      await updateState((state) => { if (state.integrations.ai.provider === "codex" && state.integrations.ai.secretId === previousId) { state.integrations.ai.secretId = secretId; applied = true; } });
      if (applied) await removeSecret(previousId); else await removeSecret(secretId);
    });
    this.credentialQueue = work.catch(() => {}); await work;
  }
  async status() {
    const account = await this.account();
    if (this.pendingLogin && this.pendingLogin.expiresAt < Date.now()) await this.cancelLogin();
    return { connected: account?.type === "chatgpt", account: account?.type === "chatgpt" ? { email: account.email, planType: account.planType } : null, login: this.pendingLogin, message: this.loginMessage };
  }
  async login(type: "chatgpt" | "chatgptDeviceCode") {
    await this.start(); await this.cancelLogin();
    const login = await this.request("account/login/start", type === "chatgpt" ? { type, useHostedLoginSuccessPage: true, appBrand: "codex" } : { type }, 60000);
    const url = new URL(type === "chatgpt" ? login.authUrl : login.verificationUrl);
    if (url.protocol !== "https:" || url.hostname !== "auth.openai.com") throw new ActionError("Codex lieferte eine unbekannte Anmeldeadresse.", 502);
    this.pendingLogin = { ...login, expiresAt: Date.now() + 10 * 60 * 1000 }; this.loginMessage = "Anmeldung läuft …";
    return this.status();
  }
  async cancelLogin() { if (this.pendingLogin) await this.request("account/login/cancel", { loginId: this.pendingLogin.loginId }); this.pendingLogin = null; }
  async logout() { await this.start(); await this.cancelLogin(); await this.request("account/logout"); await this.credentialQueue; const { result } = await updateState((state) => { if (state.integrations.ai.provider !== "codex") return ""; const previous = state.integrations.ai.secretId; state.integrations.ai.secretId = ""; return previous; }); await removeSecret(result); this.loginMessage = "Abgemeldet."; }
  async completeBrowser(callback: string) {
    const target = validateBrowserCallback(this.pendingLogin, callback);
    const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    await response.body?.cancel();
    if (response.status >= 400) throw new ActionError("Browser-Anmeldung konnte nicht übernommen werden. Bitte erneut anmelden.");
  }
  async stop() { const child = this.process; if (!child) return; child.kill(); await Promise.race([once(child,"exit"),new Promise((resolve) => setTimeout(resolve,3000))]); }
  workspace() { return path.join(this.root, "codex-workspace"); }
}
export function validateBrowserCallback(login: Login | null, callback: string) {
  if (!login?.authUrl || login.type !== "chatgpt" || login.expiresAt < Date.now() || callback.length > 12000) throw new ActionError("Keine gültige Browser-Anmeldung aktiv.", 409);
  const auth = new URL(login.authUrl); const expected = new URL(auth.searchParams.get("redirect_uri") || ""); const supplied = new URL(callback);
  if (expected.protocol !== "http:" || !["localhost","127.0.0.1"].includes(expected.hostname) || expected.pathname !== "/auth/callback" || supplied.origin !== expected.origin || supplied.pathname !== expected.pathname || supplied.username || supplied.password || supplied.hash || supplied.searchParams.get("state") !== auth.searchParams.get("state") || !auth.searchParams.get("state") || !supplied.searchParams.get("code")) throw new ActionError("Die Rücksprungadresse passt nicht zur aktuellen Anmeldung.");
  const result = new URL("http://127.0.0.1:" + expected.port + "/auth/callback");
  result.searchParams.set("code", supplied.searchParams.get("code")!); result.searchParams.set("state", supplied.searchParams.get("state")!);
  return result;
}
const key = Symbol.for("creatoros.codex.client");
export function codexClient() {
  const globals = globalThis as any; const root = path.resolve(/* turbopackIgnore: true */ dataDirectory());
  if (!globals[key] || globals[key].root !== root) { globals[key]?.client.stop(); globals[key] = { root, client: new CodexClient(root) }; }
  return globals[key].client as CodexClient;
}
export async function codexAuthState() {
  const status = await codexClient().status();
  const { state } = await updateState((current) => {
    if (current.integrations.ai.enabled && current.integrations.ai.provider === "codex") {
      current.integrations.ai.status = status.connected ? "connected" : "incomplete";
      current.integrations.ai.message = status.connected ? "Mit Codex-Abonnement verbunden." : status.message || "Bitte mit ChatGPT / Codex anmelden.";
    }
  });
  return { ...status, state };
}
