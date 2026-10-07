import { NextResponse } from "next/server";
import { executeAction, decideProposal } from "@/lib/actions";
import { ActionError } from "@/lib/action-core";
import type { StructuredAction } from "@/lib/model";
import { assertTrustedRequest } from "@/lib/request-guard";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertTrustedRequest(request);
    const input = await request.json() as { action?: StructuredAction; proposalId?: unknown; approve?: unknown; actor?: unknown };
    if (input.actor !== undefined && input.actor !== "user") throw new ActionError("AI-Aktionen dürfen nur über die AI-Verbindung ausgeführt werden.", 403);
    const result = typeof input.proposalId === "string" && typeof input.approve === "boolean" ? await decideProposal(input.proposalId, input.approve) : await executeAction(input.action as StructuredAction);
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof ActionError ? error.message : "Aktion konnte nicht ausgeführt werden." }, { status: error instanceof ActionError ? error.status : 400 }); }
}
