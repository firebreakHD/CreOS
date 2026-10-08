import { ActionError, actionFingerprint, actionPermissions, applyAction, checkAiPermission } from "@/lib/action-core";
import { id, now, type StructuredAction } from "@/lib/model";
import { readState, updateState } from "@/lib/store";
import { uploadMedia } from "@/lib/media";
import { storageProvider } from "@/lib/storage";
import { runProjectFileAction } from "@/lib/project-file-actions";

const projectFileActions = ["listProjectFiles", "ensureProjectFolder", "createProjectFolder", "renameProjectFolder", "moveProjectFile"];
async function executeProjectFileAction(action: StructuredAction, actor: "user" | "ai") {
  if (!action || typeof action.name !== "string" || !action.args || typeof action.args !== "object" || Array.isArray(action.args)) throw new ActionError("Ungültige strukturierte Aktion.");
  const permissionState = await readState();
  if (actor === "ai") checkAiPermission(permissionState, action);
  if (action.name === "listProjectFiles") {
    const value = await runProjectFileAction(permissionState, action);
    return { state: permissionState, result: { outcome: "applied", value } };
  }
  if (actor === "ai") {
    const permission = actionPermissions(action, permissionState);
    const alwaysConfirm = ["renameProjectFolder", "moveProjectFile"].includes(action.name);
    const current = permissionState.integrations.ai;
    if (alwaysConfirm || current.mode !== "auto" || permission.some((item) => current.requireConfirmation.includes(item))) {
      return updateState((state) => {
        checkAiPermission(state, action);
        if (!state.projects.some((project) => project.id === action.args.projectId)) throw new ActionError("Projekt wurde nicht gefunden.", 404);
        const proposal = { id: id(), action, createdAt: now(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), status: "pending" as const, baseFingerprint: actionFingerprint(state, action) };
        state.actionProposals = [...state.actionProposals.filter((item) => Date.parse(item.expiresAt) > Date.now()).slice(-99), proposal];
        return { outcome: "proposal", proposal, value: null };
      });
    }
  }
  return updateState(async (state) => {
    if (actor === "ai") checkAiPermission(state, action);
    const value = await runProjectFileAction(state, action);
    return { outcome: "applied", value };
  });
}

async function performTextUpload(args: unknown, actor: "user" | "ai", proposalId?: string) {
  const file = args as { entityType: string; entityId: string; filename: string; content: string; role: string };
  const body = new TextEncoder().encode(file.content);
  const params = new URLSearchParams({ entityType: file.entityType, entityId: file.entityId, role: file.role });
  const request = new Request("http://creatoros/api/media?" + params, { method: "POST", headers: { "x-file-name": encodeURIComponent(file.filename), "x-file-size": String(body.byteLength) }, body });
  const result = await uploadMedia(request, actor, proposalId);
  return { state: result.state, result: { outcome: "applied", value: result.media } };
}

export async function executeAction(action: StructuredAction, actor: "user" | "ai" = "user") {
  if (projectFileActions.includes(action?.name)) return executeProjectFileAction(action, actor);
  if (action?.name === "deleteMedia") {
    if (actor === "ai") return updateState((current) => {
      checkAiPermission(current, action);
      applyAction(structuredClone(current), action);
      const proposal = { id: id(), action, createdAt: now(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), status: "pending" as const, baseFingerprint: actionFingerprint(current, action) };
      current.actionProposals = [...current.actionProposals.filter((item) => Date.parse(item.expiresAt) > Date.now()).slice(-99), proposal];
      return { outcome: "proposal", proposal, value: null };
    });
    if (!action.args || action.args.confirm !== true || typeof action.args.id !== "string") throw new ActionError("Dateilöschung bitte bestätigen.");
    return performMediaDelete(action.args.id);
  }
  const execution = await updateState((current) => {
    if (actor === "ai") {
      checkAiPermission(current, action);
      const permissions = actionPermissions(action, current);
      const preview = structuredClone(current);
      applyAction(preview, action);
      const destructive = ["deleteMedia", "deleteContent", "deleteTask", "deleteIdea", "deletePlanning"].includes(action.name);
      if (destructive || current.integrations.ai.mode !== "auto" || permissions.some((permission) => current.integrations.ai.requireConfirmation.includes(permission))) {
        const proposal = { id: id(), action, createdAt: now(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), status: "pending" as const, baseFingerprint: actionFingerprint(current, action) };
        current.actionProposals = [...current.actionProposals.filter((item) => Date.parse(item.expiresAt) > Date.now()).slice(-99), proposal];
        return { outcome: "proposal", proposal, value: null };
      }
    }
    if (action.name === "uploadMedia") return { outcome: "upload_ready", value: applyAction(current, action) };
    return { outcome: "applied", value: applyAction(current, action) };
  });
  if (execution.result.outcome === "upload_ready") return performTextUpload(execution.result.value, actor);
  return execution;
}

async function performMediaDelete(mediaId: string, proposalId?: string) {
  return updateState(async (current) => {
    const media = current.media.find((item) => item.id === mediaId);
    if (!media) throw new ActionError("Medium nicht gefunden.", 404);
    const provider = await storageProvider(current, media);
    await provider.deleteFile(media.relativePath);
    current.media = current.media.filter((item) => item.id !== media.id);
    if (proposalId) {
      const proposal = current.actionProposals.find((item) => item.id === proposalId);
      if (!proposal || proposal.status !== "executing") throw new ActionError("Vorschlag ist nicht mehr verfügbar.", 409);
      proposal.status = "applied";
    }
    return { outcome: "applied", value: { id: media.id } };
  });
}

export async function decideProposal(proposalId: string, approve: boolean) {
  const execution = await updateState((current) => {
    const proposal = current.actionProposals.find((item) => item.id === proposalId);
    if (!proposal || proposal.status !== "pending" || Date.parse(proposal.expiresAt) < Date.now()) throw new ActionError("Vorschlag ist nicht mehr verfügbar.", 409);
    if (!approve) { proposal.status = "rejected"; return { outcome: "rejected" }; }
    checkAiPermission(current, proposal.action);
    if (proposal.baseFingerprint !== actionFingerprint(current, proposal.action)) throw new ActionError("Der Eintrag wurde inzwischen geändert. Lass einen neuen Vorschlag erstellen.", 409);
    if (projectFileActions.includes(proposal.action.name)) { proposal.status = "executing"; return { outcome: "project_file_ready", value: null }; }
    const value = applyAction(current, proposal.action);
    if (proposal.action.name === "uploadMedia") { proposal.status = "executing"; return { outcome: "upload_ready", value }; }
    if (proposal.action.name === "deleteMedia") { proposal.status = "executing"; return { outcome: "media_delete_ready", value }; }
    proposal.status = "applied";
    return { outcome: "applied", value };
  });
  if (execution.result.outcome === "media_delete_ready") {
    try { return await performMediaDelete((execution.result.value as { id: string }).id, proposalId); }
    catch (error) {
      await updateState((current) => { const proposal = current.actionProposals.find((item) => item.id === proposalId); if (proposal?.status === "executing") proposal.status = "pending"; });
      throw error;
    }
  }
  if (execution.result.outcome === "project_file_ready") {
    try {
      const result = await executeProjectFileAction(execution.state.actionProposals.find((item) => item.id === proposalId)!.action, "user");
      return updateState((current) => {
        const proposal = current.actionProposals.find((item) => item.id === proposalId);
        if (!proposal || proposal.status !== "executing") throw new ActionError("Vorschlag ist nicht mehr verfügbar.", 409);
        proposal.status = "applied";
        return { outcome: "applied", value: result.result.value };
      });
    } catch (error) {
      await updateState((current) => { const proposal = current.actionProposals.find((item) => item.id === proposalId); if (proposal?.status === "executing") proposal.status = "pending"; });
      throw error;
    }
  }
  if (execution.result.outcome !== "upload_ready") return execution;
  try {
    return await performTextUpload(execution.result.value, "ai", proposalId);
  } catch (error) {
    await updateState((current) => { const proposal = current.actionProposals.find((item) => item.id === proposalId); if (proposal?.status === "executing") proposal.status = "pending"; });
    throw error;
  }
}
