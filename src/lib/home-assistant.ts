import type { CreatorState } from "@/lib/model";

export async function emitHomeAssistantEvent(event: string, data: Record<string, unknown>) {
  const base = process.env.HOME_ASSISTANT_URL || (process.env.SUPERVISOR_TOKEN ? "http://supervisor" : "");
  const token = process.env.SUPERVISOR_TOKEN || process.env.HOME_ASSISTANT_TOKEN;
  if (!base || !token) return { configured: false };
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/core/api/events/${encodeURIComponent(event)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(data),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    return { configured: true, ok: response.ok };
  } catch {
    return { configured: true, ok: false };
  }
}

export function getHaStatus(state: CreatorState) {
  const activeSession = state.sessions.find((session) => !session.endedAt) || null;
  const project = state.projects.find((item) => item.id === (activeSession?.projectId || state.activeProjectId)) || null;
  const elapsedSeconds = activeSession ? Math.max(0, Math.floor(activeSession.elapsedSeconds + (activeSession.isPaused || !activeSession.runSegmentStartedAt ? 0 : (Date.now() - Date.parse(activeSession.runSegmentStartedAt)) / 1000))) : 0;
  return {
    build_day: state.buildDay,
    session_active: Boolean(activeSession),
    current_project: project?.title || "",
    next_action: project?.nextAction || "",
    session_elapsed: elapsedSeconds,
    last_session: state.sessions.find((session) => session.endedAt)?.endedAt || null,
    focus_url: "/?mode=focus",
    updated_at: state.updatedAt,
  };
}

export function haEnabled() {
  return Boolean(process.env.SUPERVISOR_TOKEN || (process.env.HOME_ASSISTANT_URL && process.env.HOME_ASSISTANT_TOKEN));
}
