import { NextResponse } from "next/server";
import { codexAuthState, codexClient } from "@/lib/codex";
import { assertTrustedRequest } from "@/lib/request-guard";
import { ActionError } from "@/lib/action-core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) { return NextResponse.json({ error: error instanceof ActionError ? error.message : "Codex-Anmeldung konnte nicht verarbeitet werden." }, { status: error instanceof ActionError ? error.status : 502 }); }
export async function GET() { try { return NextResponse.json(await codexAuthState(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return failure(error); } }
export async function POST(request: Request) {
  try {
    assertTrustedRequest(request); const input = await request.json(); const client = codexClient();
    if (input.operation === "login" && ["chatgpt","chatgptDeviceCode"].includes(input.type)) await client.login(input.type);
    else if (input.operation === "cancel") await client.cancelLogin();
    else if (input.operation === "logout") await client.logout();
    else if (input.operation === "completeBrowser" && typeof input.callback === "string") await client.completeBrowser(input.callback);
    else throw new ActionError("Unbekannte Codex-Anmeldeaktion.");
    return NextResponse.json(await codexAuthState());
  } catch (error) { return failure(error); }
}
