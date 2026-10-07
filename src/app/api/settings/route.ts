import { NextResponse } from "next/server";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ungültige JSON-Daten." }, { status: 400 }); }
  const buildDay = (body as { buildDay?: unknown })?.buildDay;
  if (typeof buildDay !== "string" || !["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].includes(buildDay)) return NextResponse.json({ error: "Unbekannter Build-Tag." }, { status: 400 });
  const { state } = await updateState((current) => { current.buildDay = buildDay; });
  return NextResponse.json({ state });
}
