import { NextResponse } from "next/server";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await readState(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "CreatorOS-Daten konnten nicht gelesen werden." }, { status: 500 });
  }
}
