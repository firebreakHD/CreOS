"use client";
import type { CreatorState, StructuredAction } from "@/lib/model";
export async function appRequest(url: string, body: unknown, timeout = 15000) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Das hat gerade nicht geklappt.");
  return result;
}
export async function manualAction(action: StructuredAction, onState: (state: CreatorState) => void) {
  const result = await appRequest("/api/actions", { action });
  onState(result.state); return result.result;
}
export const localDateTime = (value: string | null | undefined) => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0,16) : "";
export const isoDateTime = (value: string) => value ? new Date(value).toISOString() : null;
