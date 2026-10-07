import { NextResponse } from "next/server";
import { runAi } from "@/lib/ai";
import { ActionError } from "@/lib/action-core";
import { assertTrustedRequest } from "@/lib/request-guard";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertTrustedRequest(request);
    const input = await request.json() as { question?: unknown; projectId?: unknown; imageIds?: unknown };
    if (typeof input.question !== "string" || !input.question.trim() || input.question.length > 4000) throw new ActionError("Bitte eine Anfrage mit 1 bis 4000 Zeichen eingeben.");
    if (input.imageIds !== undefined && (!Array.isArray(input.imageIds) || input.imageIds.length > 3 || !input.imageIds.every((id) => typeof id === "string"))) throw new ActionError("Referenzbilder sind ungültig.");
    return NextResponse.json(await runAi(input.question.trim(), typeof input.projectId === "string" && input.projectId ? input.projectId : null, input.imageIds as string[] | undefined));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "AI-Anfrage fehlgeschlagen." }, { status: error instanceof ActionError ? error.status : 502 }); }
}
