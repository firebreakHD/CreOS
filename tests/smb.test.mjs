import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { SmbStorageProvider } from "@/lib/smb-storage";
import { validateNas } from "@/lib/storage";
import { smbExplorerPath } from "../src/lib/storage-paths.ts";
import { configureIntegration,disconnectIntegration } from "@/lib/integrations";

test("SMB ordinary share paths, bounded streams and file operations use the configured root",async () => {
  const config=validateNas({protocol:"smb",host:"192.168.1.20",port:445,share:"Medien",baseFolder:"CreatorOS",username:"creator",domain:"NAS",encrypt:true}); const calls=[];
  const provider=new SmbStorageProvider(config,"test-only",async (command,body)=>{calls.push(command); if(body) assert.equal(await new Response(body).text(),"sample");return {metadata:{ok:true,length:3,status:206,contentRange:"bytes 1-3/6"},body:new Blob(["amp"]).stream()};});
  assert.equal(smbExplorerPath(config,"Media/Projects/LEGO/Video/clip.mp4"),"\\\\192.168.1.20\\Medien\\CreatorOS\\Media\\Projects\\LEGO\\Video\\clip.mp4");
  await provider.test(); await provider.storeFile("Media/Projects/LEGO/clip.txt",new Blob(["sample"]).stream(),6,"text/plain");
  const file=await provider.getFile("Media/Projects/LEGO/clip.txt","bytes=1-3");assert.equal(await new Response(file.body).text(),"amp");assert.equal(file.contentRange,"bytes 1-3/6");
  await provider.moveFile("Media/Projects/LEGO/clip.txt","Media/Projects/LEGO/renamed.txt"); await provider.deleteFile("Media/Projects/LEGO/renamed.txt");
  assert.deepEqual(calls.map((call)=>call.operation),["test","put","get","move","delete"]);assert.ok(calls.every((call)=>call.config.share==="Medien"));
  await assert.rejects(()=>provider.getFile("../../outside")); await assert.rejects(()=>provider.getFile("clip.txt","bytes=1-2,3-4"));
  for(const share of ["../outside","folder/sub", "x\\y","C:","bad?"])assert.throws(()=>validateNas({...config,share}));
});

test("SMB credentials are separate; reconnection retains identity and another share changes it",async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),"creatoros-smb-config-")); const previous=process.env.CREATOROS_DATA_DIR;process.env.CREATOROS_DATA_DIR=directory;
  try {
    const config={name:"NAS",protocol:"smb",host:"nas.local",port:445,share:"Medien",baseFolder:"CreatorOS",username:"creator",password:"only-test",domain:"",encrypt:false};
    const first=await configureIntegration("nas",config); assert.equal(first.integrations.nas.protocol,"smb");assert.ok(first.integrations.nas.secretId); assert.equal(first.integrations.nas.password,undefined);
    await disconnectIntegration("nas"); const second=await configureIntegration("nas",config);assert.equal(second.integrations.nas.storageId,first.integrations.nas.storageId);
    const other=await configureIntegration("nas",{...config,share:"Andere Medien",password:""});assert.notEqual(other.integrations.nas.storageId,first.integrations.nas.storageId);
  } finally {if(previous===undefined)delete process.env.CREATOROS_DATA_DIR;else process.env.CREATOROS_DATA_DIR=previous;assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});}
});
