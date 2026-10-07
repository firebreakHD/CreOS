import { ActionError, actionFingerprint, actionPermissions, applyAction, checkAiPermission } from "@/lib/action-core";
import { id, now, type StructuredAction } from "@/lib/model";
import { updateState } from "@/lib/store";
import { uploadMedia } from "@/lib/media";

async function performTextUpload(args: unknown, actor: "user" | "ai", proposalId?: string) {
  const file = args as { entityType: string; entityId: string; filename: string; content: string; role: string };
  const body = new TextEncoder().encode(file.content);
  const params = new URLSearchParams({ entityType: file.entityType, entityId: file.entityId, role: file.role });
  const request = new Request("http://creatoros/api/media?" + params, { method: "POST", headers: { "x-file-name": encodeURIComponent(file.filename), "x-file-size": String(body.byteLength) }, body });
  const result = await uploadMedia(request, actor, proposalId);
  return { state: result.state, result: { outcome: "applied", value: result.media } };
}

export async function executeAction(action: StructuredAction, actor: "user" | "ai" = "user") {
  const execution = await updateState((current) => {
    if (actor === "ai") {
      checkAiPermission(current, action);
      const permissions = actionPermissions(action, current);
      const preview = structuredClone(current);
      applyAction(preview, action);
      if (current.integrations.ai.mode !== "auto" || permissions.some((permission) => current.integrations.ai.requireConfirmation.includes(permission))) {
        const proposal = { id: id(), action, createdAt: now(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), status: "pending" as const, baseFingerprint: actionFingerprint(current, action) };
        current.actionProposals = [...current.actionProposals.filter((item) => Date.parse(item.expiresAt) > Date.now()).slice(-99), proposal];
        return { outcome: "proposal", proposal };
      }
    }
    if (action.name === "uploadMedia") return { outcome: "upload_ready", value: applyAction(current, action) };
    return { outcome: "applied", value: applyAction(current, action) };
  });
  if (execution.result.outcome === "upload_ready") return performTextUpload(execution.result.value, actor);
  return execution;
}

export async function decideProposal(proposalId: string, approve: boolean) {
  const execution = await updateState((current) => {
    const proposal = current.actionProposals.find((item) => item.id === proposalId);
    if (!proposal || proposal.status !== "pending" || Date.parse(proposal.expiresAt) < Date.now()) throw new ActionError("Vorschlag ist nicht mehr verfügbar.", 409);
    if (!approve) { proposal.status = "rejected"; return { outcome: "rejected" }; }
    checkAiPermission(current, proposal.action);
    if (proposal.baseFingerprint !== actionFingerprint(current, proposal.action)) throw new ActionError("Der Eintrag wurde inzwischen geändert. Lass einen neuen Vorschlag erstellen.", 409);
    const value = applyAction(current, proposal.action);
    if (proposal.action.name === "uploadMedia") { proposal.status = "executing"; return { outcome: "upload_ready", value }; }
    proposal.status = "applied";
    return { outcome: "applied", value };
  });
  if (execution.result.outcome !== "upload_ready") return execution;
  try {
    return await performTextUpload(execution.result.value, "ai", proposalId);
  } catch (error) {
    await updateState((current) => { const proposal = current.actionProposals.find((item) => item.id === proposalId); if (proposal?.status === "executing") proposal.status = "pending"; });
    throw error;
  }
}
