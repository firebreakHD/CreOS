import { NextResponse } from "next/server";
import { getHaStatus, haEnabled } from "@/lib/home-assistant";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const state = await readState();
    return NextResponse.json({ ...getHaStatus(state), integration_configured: haEnabled() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "CreatorOS-Status momentan nicht verfügbar." }, { status: 503 });
  }
}
