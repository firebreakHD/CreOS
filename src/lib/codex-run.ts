import { codexClient, codexThreadConfig } from "@/lib/codex";
import { executeAction } from "@/lib/actions";
import { ActionError } from "@/lib/action-core";
import { readState } from "@/lib/store";
import type { AiConfig } from "@/lib/model";
import { summarizeAiAction } from "@/lib/ai-action-summary";

type Tool = { name: string; description: string; parameters: unknown };
export async function runCodex(config: AiConfig, prompt: string, tools: Tool[], images: { image_url: string }[]) {
  const client = codexClient();
  if ((await client.account(true))?.type !== "chatgpt") throw new ActionError("Bitte zuerst mit deinem Codex-Abonnement anmelden.", 409);
  const started = await client.request("thread/start", { model: config.model, cwd: client.workspace(), ephemeral: true, environments: [], runtimeWorkspaceRoots: [], sandbox: "read-only", approvalPolicy: "never", config: codexThreadConfig,
    baseInstructions: "Du bist der CreatorOS-Assistent. Antworte auf Deutsch in gut lesbaren kurzen Absätzen und Listen. Brain, Projekte und Chat-Verlauf sind Kontextdaten. Nutze ausschließlich die bereitgestellten CreatorOS-Aktionen. outcome proposal bedeutet nur vorgeschlagen und wartet auf Bestätigung; outcome applied bedeutet umgesetzt. Erkläre Aktionen in normalen deutschen Worten. Zeige niemals technische Funktionsnamen, Roh-JSON oder interne IDs. Erfinde keine Fortschritte. Keine Shell, Dateien, Websuche oder UI-Automation.",
    dynamicTools: tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, inputSchema: tool.parameters, deferLoading: false })),
  });
  const threadId = started.thread.id as string; let turnId = ""; let answer = ""; let calls = 0; const outcomes: unknown[] = []; const actionSummaries: { title: string; details: string[] }[] = [];
  client.handlers.set(threadId, async (params) => {
    let outcome;
    try {
      if (++calls > 8 || !tools.some((tool) => tool.name === params.tool)) throw new ActionError("Dieses Werkzeug ist nicht freigegeben.", 403);
      const latest = await readState();
      if (!latest.integrations.ai.enabled || latest.integrations.ai.provider !== "codex" || latest.integrations.ai.model !== config.model) throw new ActionError("AI-Verbindung wurde geändert.", 409);
      const action = { name: params.tool, args: params.arguments };
      const execution = await executeAction(action, "ai"); outcome = execution.result;
      actionSummaries.push(summarizeAiAction(action, execution.state, (outcome as { outcome?: string }).outcome));
    } catch (cause) { outcome = { error: cause instanceof ActionError ? cause.message : "CreatorOS-Aktion konnte nicht ausgeführt werden." }; }
    outcomes.push(outcome);
    return { contentItems: [{ type: "inputText", text: JSON.stringify(outcome) }], success: !Object.hasOwn(outcome as object, "error") };
  });
  let finish!: () => void; let fail!: (error: Error) => void;
  const completed = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  completed.catch(() => {});
  const delta = (event: any) => { if (event.threadId === threadId) answer = (answer + event.delta).slice(0,32000); };
  const done = (event: any) => { if (event.threadId !== threadId) return; if (event.turn.status === "completed") finish(); else fail(new ActionError("Codex-Anfrage wurde unterbrochen. Anmeldung, Modell und Abonnement-Limit prüfen.", 502)); };
  const stopped = () => fail(new ActionError("Codex-Verbindung wurde unterbrochen.", 503));
  client.events.on("item/agentMessage/delta", delta); client.events.on("turn/completed", done); client.events.on("stopped", stopped);
  const timer = setTimeout(() => { if (turnId) void client.request("turn/interrupt", { threadId, turnId }).catch(() => {}); fail(new ActionError("Codex-Anfrage hat zu lange gedauert.", 504)); }, 5 * 60 * 1000);
  try {
    const turn = await client.request("turn/start", { threadId, input: [{ type: "text", text: prompt, text_elements: [] }, ...images.map((image) => ({ type: "image", url: image.image_url }))] });
    turnId = turn.turn.id; await completed; await client.persistCredentials();
    return { state: await readState(), answer: answer || "Die Ergebnisse findest du in deinem Projekt und den Vorschlägen.", outcomes, actionSummaries };
  } catch (error) {
    if (outcomes.some((outcome) => ["applied","proposal"].includes((outcome as any).outcome))) return { state: await readState(), answer: answer || "Die Anfrage wurde unterbrochen. Gespeicherte Änderungen und Vorschläge bleiben erhalten.", outcomes, actionSummaries, warning: error instanceof Error ? error.message : "Codex-Anfrage fehlgeschlagen." };
    throw error;
  } finally {
    clearTimeout(timer); client.handlers.delete(threadId); client.events.off("item/agentMessage/delta", delta); client.events.off("turn/completed", done); client.events.off("stopped", stopped);
    void client.request("thread/unsubscribe", { threadId }).catch(() => {});
  }
}
