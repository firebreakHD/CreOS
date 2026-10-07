import { ActionError } from "@/lib/action-core";
export function assertTrustedRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  try { if (new URL(origin).host === host) return; } catch {}
  throw new ActionError("Diese Anfrage stammt nicht aus deiner CreatorOS-Ansicht.", 403);
}

export function rejectUntrustedRequest(request: Request): Response | null {
  try { assertTrustedRequest(request); return null; }
  catch (error) { return Response.json({ error: error instanceof ActionError ? error.message : "Anfrage ist nicht erlaubt." }, { status: 403 }); }
}
