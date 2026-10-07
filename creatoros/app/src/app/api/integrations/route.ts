import { NextResponse } from "next/server";
import { configureIntegration, disconnectIntegration, integrationView, testIntegration } from "@/lib/integrations";
import { readState } from "@/lib/store";
import { assertTrustedRequest } from "@/lib/request-guard";
import { ActionError } from "@/lib/action-core";
import { StorageError } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await integrationView(await readState()), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Integrationen konnten nicht gelesen werden." }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequest(request);
    const input = await request.json() as { kind?: unknown; operation?: unknown; config?: Record<string, unknown> };
    if (!["ai", "nas"].includes(String(input.kind))) throw new Error("Unbekannte Integration.");
    const kind = input.kind as "ai" | "nas";
    if (input.operation === "test") return NextResponse.json(await testIntegration(kind));
    const state = input.operation === "disconnect" ? await disconnectIntegration(kind) : input.operation === "save" && input.config ? await configureIntegration(kind, input.config) : null;
    if (!state) throw new Error("Unbekannte Integrationsaktion.");
    return NextResponse.json({ state, integrations: await integrationView(state) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Integration konnte nicht gespeichert werden." }, { status: error instanceof ActionError || error instanceof StorageError ? error.status : 400 }); }
}
