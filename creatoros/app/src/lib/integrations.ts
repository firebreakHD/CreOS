import { createHash } from "node:crypto";
import { initialIntegrations, type AiConfig, type AiPermission, type CreatorState, type IntegrationStatus, type NasConfig } from "@/lib/model";
import { permissionLabels } from "@/lib/action-core";
import { readSecret, removeSecret, saveSecret } from "@/lib/secrets";
import { readState, updateState } from "@/lib/store";
import { StorageError, validateNas, configuredNas } from "@/lib/storage";
import { codexClient } from "@/lib/codex";

const permissionValues = Object.keys(permissionLabels) as AiPermission[];
function permissions(value: unknown) {
  if (!Array.isArray(value) || !value.every((permission) => permissionValues.includes(permission))) throw new Error("AI-Berechtigungen sind ungültig.");
  return [...new Set(value)] as AiPermission[];
}
export async function integrationView(state: CreatorState) {
  const aiKey = state.integrations.ai.enabled && state.integrations.ai.provider === "codex" ? (await codexClient().account().catch(() => null))?.type === "chatgpt" : Boolean((await readSecret(state.integrations.ai.secretId))?.apiKey);
  const nasPassword = Boolean((await readSecret(state.integrations.nas.secretId))?.password);
  return {
    ai: { ...state.integrations.ai, secretId: undefined, credentialStored: aiKey, status: state.integrations.ai.enabled && !aiKey ? "incomplete" : state.integrations.ai.status },
    nas: { ...state.integrations.nas, secretId: undefined, credentialStored: nasPassword, status: state.integrations.nas.enabled && !nasPassword ? "incomplete" : state.integrations.nas.status },
  };
}
export async function testOpenAi(config: AiConfig, apiKey?: string) {
  const key = apiKey || (await readSecret(config.secretId))?.apiKey;
  if (!key) throw new Error("API-Schlüssel fehlt.");
  const response = await fetch("https://api.openai.com/v1/models/" + encodeURIComponent(config.model), {
    headers: { Authorization: "Bearer " + key }, cache: "no-store", signal: AbortSignal.timeout(15000),
  }).catch(() => { throw new Error("OpenAI ist momentan nicht erreichbar."); });
  if (!response.ok) throw new Error(response.status === 401 ? "OpenAI-Schlüssel ist ungültig." : response.status === 404 ? "Dieses Modell ist für die Verbindung nicht verfügbar." : "OpenAI-Verbindung konnte nicht bestätigt werden.");
  await response.body?.cancel();
}
export async function configureIntegration(kind: "ai" | "nas", input: Record<string, unknown>) {
  const current = await readState();
  let config: AiConfig | NasConfig; let secretId: string;
  if (kind === "ai") {
    const old = current.integrations.ai;
    if (typeof input.model !== "string" || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(input.model)) throw new Error("Bitte eine gültige Modell-ID eingeben.");
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (apiKey && (apiKey.length > 1000 || /\s/.test(apiKey))) throw new Error("API-Schlüssel ist ungültig.");
    const mode = input.mode;
    if (!["suggest", "confirm", "auto"].includes(String(mode))) throw new Error("AI-Modus ist ungültig.");
    const allowed = permissions(input.permissions);
    const confirmation = permissions(input.requireConfirmation);
    const provider = input.provider || "openai";
    if (!["openai","codex"].includes(String(provider))) throw new Error("AI-Anbieter ist ungültig.");
    secretId = provider === "codex" ? old.provider === "codex" ? old.secretId : "" : apiKey ? await saveSecret({ apiKey }) : old.provider === "openai" ? old.secretId : "";
    config = { enabled: true, provider: provider as AiConfig["provider"], model: input.model, secretId, mode: mode as AiConfig["mode"], permissions: allowed, requireConfirmation: confirmation, status: "incomplete", message: "Verbindung noch nicht getestet." };
  } else {
    const old = current.integrations.nas;
    const validated = validateNas({ name: typeof input.name === "string" ? input.name.trim().slice(0,100) : "NAS", host: typeof input.host === "string" ? input.host.trim() : "", port: Number(input.port), protocol: input.protocol as NasConfig["protocol"], share: typeof input.share === "string" ? input.share.trim() : "", domain: typeof input.domain === "string" ? input.domain.trim() : "", encrypt: input.encrypt === true, baseFolder: typeof input.baseFolder === "string" ? input.baseFolder : "", username: typeof input.username === "string" ? input.username.trim() : "" });
    const password = typeof input.password === "string" ? input.password : "";
    if (password.length > 2000) throw new Error("NAS-Passwort ist zu lang.");
    const loginChanged = old.enabled && (validated.host.toLowerCase() !== old.host.toLowerCase() || validated.port !== old.port || validated.protocol !== old.protocol || validated.username !== old.username || validated.domain !== old.domain);
    if (loginChanged && !password) throw new Error("Bei einer neuen NAS-Adresse oder Anmeldung bitte das Passwort erneut eingeben.");
    secretId = password ? await saveSecret({ password }) : old.secretId;
    const identity = validated.protocol === "smb" ? [validated.protocol, validated.host.toLowerCase(), validated.port, validated.share, validated.baseFolder] : [validated.protocol, validated.host.toLowerCase(), validated.port, validated.baseFolder];
    const storageId = createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0,24);
    config = { ...validated, enabled: true, secretId, storageId, status: "incomplete", message: "Verbindung noch nicht getestet." };
  }
  const previousSecret = current.integrations[kind].secretId;
  let state: CreatorState;
  try {
    ({ state } = await updateState((next) => {
      if (JSON.stringify(next.integrations[kind]) !== JSON.stringify(current.integrations[kind])) throw new Error("Die Verbindung wurde inzwischen geändert. Bitte Einstellungen neu laden.");
      if (kind === "ai") next.integrations.ai = config as AiConfig; else next.integrations.nas = config as NasConfig;
    }));
  } catch (error) { if (secretId && secretId !== previousSecret) await removeSecret(secretId); throw error; }
  if (previousSecret && previousSecret !== secretId) await removeSecret(previousSecret);
  return state;
}
export async function testIntegration(kind: "ai" | "nas") {
  const current = await readState();
  let status: IntegrationStatus = "connected"; let message = "Verbindung funktioniert.";
  let hasCredential = false;
  try {
    if (!current.integrations[kind].enabled) throw new Error("Integration ist nicht eingerichtet.");
    const credential = await readSecret(current.integrations[kind].secretId);
    hasCredential = Boolean(kind === "ai" ? credential?.apiKey : credential?.password);
    if (kind === "ai" && current.integrations.ai.provider === "codex") {
      hasCredential = (await codexClient().account(true))?.type === "chatgpt";
      if (!hasCredential) throw new Error("Bitte mit deinem Codex-Abonnement anmelden.");
      const models = await codexClient().request("model/list", {});
      if (!models.data?.some((model: { model: string }) => model.model === current.integrations.ai.model)) throw new Error("Modell ist für diese Codex-Anmeldung nicht verfügbar. Bitte Modell-ID ändern.");
      message = "Codex-Anmeldung und Modell bestätigt.";
    } else if (kind === "ai") await testOpenAi(current.integrations.ai);
    else {
      const config = validateNas(current.integrations.nas);
      const password = (await readSecret(config.secretId))?.password;
      if (!password) throw new Error("NAS-Passwort fehlt.");
      await (await configuredNas(current))!.test();
    }
  } catch (error) {
    status = !current.integrations[kind].enabled ? "not_configured" : hasCredential ? "error" : "incomplete";
    message = error instanceof Error ? error.message : "Verbindung fehlgeschlagen.";
  }
  const { state } = await updateState((next) => {
    if (JSON.stringify(next.integrations[kind]) === JSON.stringify(current.integrations[kind])) { next.integrations[kind].status = status; next.integrations[kind].message = message; }
  });
  return { state, status, message };
}
export async function disconnectIntegration(kind: "ai" | "nas") {
  if (kind === "ai" && (await readState()).integrations.ai.provider === "codex") await codexClient().logout();
  const { state, result: secretId } = await updateState((next) => {
    const previousSecret = next.integrations[kind].secretId;
    if (kind === "ai") next.integrations.ai = initialIntegrations().ai; else next.integrations.nas = initialIntegrations().nas;
    return previousSecret;
  });
  await removeSecret(secretId); return state;
}
