"use client";
import { useState } from "react";
import type { CreatorState, Project } from "@/lib/model";
import { manualAction } from "@/lib/client-api";
import CompletionToggle from "@/components/completion-toggle";
import { EntityActions } from "@/components/entity-menu";
export default function NextTaskControl({ data,project,onState }: { data: CreatorState; project: Project; onState: (state: CreatorState) => void }) {
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState("");
  const task = data.tasks.find((item) => item.id === project.nextTaskId); const count = data.tasks.filter((item) => item.projectId === project.id && item.status !== "done").length;
  return <div className="next-task-control">{task ? <><CompletionToggle checked={false} disabled={busy} label="Aufgabe abhaken" onChange={() => { setBusy(true); setMessage(""); void manualAction({ name: "completeTask",args: { id: task.id } },onState).then(() => setMessage("Aufgabe abgeschlossen.")).catch((cause) => setMessage(cause.message)).finally(() => setBusy(false)); }}/><EntityActions name={task.title} onRename={(title) => manualAction({ name: "updateTask",args: { id: task.id,title } },onState)} onDelete={() => manualAction({ name: "deleteTask",args: { id: task.id,confirm: true } },onState)} deleteDescription="Diese Aufgabe und ihre Zuordnungen entfernen. Die nächste offene Aufgabe rückt automatisch nach."><b className="next-task-title">{task.title}</b></EntityActions><small>{count} offene {count === 1 ? "Aufgabe" : "Aufgaben"} im Projekt</small></> : <small>Keine offene Aufgabe · lege eine in „Aufgaben“ an.</small>}{message && <small role="status">{message}</small>}</div>;
}
