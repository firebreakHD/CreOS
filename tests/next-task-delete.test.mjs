import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile,rm,access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initialState } from "../src/lib/model.ts";
import { migrateNextTasks } from "../src/lib/next-task.ts";
import { applyAction,checkAiPermission } from "../src/lib/action-core.ts";
import { executeAction } from "@/lib/actions";
import { uploadMedia } from "@/lib/media";
import { readState,updateState,replaceState } from "@/lib/store";

test("legacy next action becomes one stable task; edits and completion share the same data", () => {
  const state = initialState(); const project = state.projects[0];
  delete project.nextTaskId; state.tasks = []; migrateNextTasks(state);
  const first = project.nextTaskId; assert.equal(state.tasks.length,1); migrateNextTasks(state); assert.equal(state.tasks.length,1); assert.equal(project.nextTaskId,first);
  const second = applyAction(state,{ name:"createTask",args:{ projectId:project.id,title:"Cut markieren" } });
  applyAction(state,{ name:"updateContent",args:{ id:project.id,nextAction:"Fundstelle suchen" } }); assert.equal(state.tasks[0].title,"Fundstelle suchen"); assert.equal(state.tasks.length,2);
  applyAction(state,{ name:"completeTask",args:{ id:first } }); assert.equal(project.nextTaskId,second.id); assert.equal(project.nextAction,second.title);
  applyAction(state,{ name:"updateTask",args:{ id:second.id,title:"Neuer Titel" } }); assert.equal(project.nextAction,"Neuer Titel");
  applyAction(state,{ name:"completeTask",args:{ id:second.id } }); assert.equal(project.nextAction,""); migrateNextTasks(state); assert.equal(state.tasks.length,2); assert.equal(project.nextTaskId,"");
  state.integrations.ai.enabled=true; state.integrations.ai.permissions=["content.update"];
  assert.throws(() => checkAiPermission(state,{name:"updateContent",args:{id:project.id,nextAction:"Neue Aufgabe"}}),/nicht freigegeben/);
});

test("manual media deletion removes the actual file and every link; project deletion preserves shared files",async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),"creatoros-delete-")); const previous=process.env.CREATOROS_DATA_DIR; process.env.CREATOROS_DATA_DIR=directory;
  try {
    const state=await readState(); const project=state.projects[0]; const body=new TextEncoder().encode("demo file");
    const upload=await uploadMedia(new Request("http://creatoros/api/media?entityId="+project.id,{method:"POST",headers:{"x-file-name":"demo.txt","x-file-size":String(body.length)},body})); const media=upload.media;
    const file=path.join(directory,"media",media.relativePath); await access(file);
    await assert.rejects(() => executeAction({name:"deleteMedia",args:{id:media.id,confirm:false}}),/bestätigen/); await access(file);
    await assert.rejects(() => executeAction({name:"deleteMedia",args:{id:media.id,confirm:true}},"ai"),/nicht freigegeben/); await access(file);
    await executeAction({name:"removeMaterial",args:{id:project.id,materialId:project.materials[0].id}}); assert.equal((await readState()).projects[0].materials.length,2);
    await executeAction({name:"deleteContent",args:{id:project.id,confirm:true}}); const removed=await readState(); assert.equal(removed.projects.length,0); assert.equal(removed.tasks.length,0); assert.equal(removed.media[0].links.length,0); await access(file);
    await executeAction({name:"deleteMedia",args:{id:media.id,confirm:true}}); assert.equal((await readState()).media.length,0); await assert.rejects(() => access(file),{code:"ENOENT"});
    await replaceState(upload.state); await executeAction({name:"deleteMedia",args:{id:media.id,confirm:true}}); assert.equal((await readState()).media.length,0); // already absent is idempotent
    await updateState((current) => {current.media=[{...media,storageProvider:"nas",storageId:"disconnected-nas"}];});
    await assert.rejects(() => executeAction({name:"deleteMedia",args:{id:media.id,confirm:true}}),/ursprüngliche/); assert.equal((await readState()).media.length,1);
    assert.ok(!(await readFile(path.join(directory,"creatoros.json"),"utf8")).includes("password"));
  } finally {process.env.CREATOROS_DATA_DIR=previous; if(previous===undefined) delete process.env.CREATOROS_DATA_DIR; assert.equal(path.dirname(directory),os.tmpdir()); await rm(directory,{recursive:true,force:true});}
});
