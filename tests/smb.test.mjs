import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { SmbStorageProvider } from "@/lib/smb-storage";
import { validateNas } from "@/lib/storage";
import { projectMediaRoot, smbExplorerPath } from "../src/lib/storage-paths.ts";
import { configureIntegration,disconnectIntegration } from "@/lib/integrations";

test("SMB ordinary share paths, bounded streams and file operations use the configured root",async () => {
  const config=validateNas({protocol:"smb",host:"192.168.1.20",port:445,share:"Medien",baseFolder:"CreatorOS",username:"creator",domain:"NAS",encrypt:true}); const calls=[];
  const provider=new SmbStorageProvider(config,"test-only",async (command,body)=>{calls.push(command); if(body) assert.equal(await new Response(body).text(),"sample");return {metadata:{ok:true,length:3,status:206,contentRange:"bytes 1-3/6",...(command.operation==="list"?{entries:[{name:"CapCut",directory:true,size:0},{name:"clip.mp4",directory:false,size:2048}]}:{}),...(command.operation==="ensure"?{created:command.path.endsWith("/Neu")}: {})},body:new Blob(["amp"]).stream()};});
  assert.equal(smbExplorerPath(config,"Media/Projects/LEGO/Video/clip.mp4"),"\\\\192.168.1.20\\Medien\\CreatorOS\\Media\\Projects\\LEGO\\Video\\clip.mp4");
  await provider.test(); await provider.storeFile("Media/Projects/LEGO/clip.txt",new Blob(["sample"]).stream(),6,"text/plain");
  const file=await provider.getFile("Media/Projects/LEGO/clip.txt","bytes=1-3");assert.equal(await new Response(file.body).text(),"amp");assert.equal(file.contentRange,"bytes 1-3/6");
  await provider.moveFile("Media/Projects/LEGO/clip.txt","Media/Projects/LEGO/renamed.txt"); await provider.deleteFile("Media/Projects/LEGO/renamed.txt");
  assert.deepEqual(await provider.listFolder("Media/Projects/LEGO"),[{name:"CapCut",directory:true,size:0},{name:"clip.mp4",directory:false,size:2048}]); await provider.createFolder("Media/Projects/LEGO/CapCut");
  assert.equal(await provider.ensureFolder("Media/Projects/LEGO/Vorhanden"),false); assert.equal(await provider.ensureFolder("Media/Projects/LEGO/Neu"),true);
  assert.deepEqual(calls.map((call)=>call.operation),["test","put","get","move","delete","list","mkdir","ensure","ensure"]);assert.ok(calls.every((call)=>call.config.share==="Medien"));
  const project={id:"project-123456",title:"Vorheriger Name",storageFolder:"Vorheriger Name_123456"}; assert.equal(projectMediaRoot({...project,title:"Nach dem Umbenennen"}),"Media/Projects/Vorheriger Name_123456");
  await assert.rejects(()=>provider.getFile("../../outside")); await assert.rejects(()=>provider.getFile("clip.txt","bytes=1-2,3-4"));
  for(const share of ["../outside","folder/sub", "x\\y","C:","bad?"])assert.throws(()=>validateNas({...config,share}));
});

test("SMB helper lists project files and creates folders",() => {
  const python = String.raw`import io, json, os, runpy, stat, sys
from types import SimpleNamespace

class Entry:
    def __init__(self, name, attrs, size, directory=False):
        self.name = name
        self.smb_info = SimpleNamespace(file_attributes=attrs)
        self.size = size
        self.directory = directory
    def is_symlink(self): return False
    def stat(self, follow_symlinks=False): return SimpleNamespace(st_size=self.size)
    def is_dir(self, follow_symlinks=False): return self.directory

class Entries:
    def __enter__(self): return iter([Entry("clip.mp4", 0, 2048), Entry("CapCut", 0x10, 0, True), Entry("junction", 0x400, 0)])
    def __exit__(self, *args): pass

class Client:
    def __init__(self): self.created = []
    def register_session(self, *args, **kwargs): pass
    def lstat(self, *args, **kwargs): return SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_file_attributes=0)
    def stat(self, *args, **kwargs): return SimpleNamespace(st_mode=stat.S_IFDIR | 0o755)
    def scandir(self, *args, **kwargs): return Entries()
    def mkdir(self, path, **kwargs): self.created.append(path)

module = runpy.run_path(sys.argv[1])
config = {"host":"nas", "share":"Medien", "baseFolder":"CreatorOS", "username":"creator", "port":445, "encrypt":False}
client = Client()
listed = module["operate"]({"config":config, "password":"test", "path":"Media/Projects/Test", "operation":"list"}, io.BytesIO(), io.BytesIO(), client)
module["operate"]({"config":config, "password":"test", "path":"Media/Projects/Test/Neu", "operation":"mkdir"}, io.BytesIO(), io.BytesIO(), client)
print(json.dumps({"listed":listed, "created":client.created}))`;
  const result = spawnSync(process.env.CREATOROS_SMB_PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-c", python, path.resolve("scripts/smb-storage.py")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.deepEqual(JSON.parse(result.stdout), {
    listed: { ok: true, entries: [{ name: "clip.mp4", directory: false, size: 2048 }, { name: "CapCut", directory: true, size: 0 }] },
    created: ["\\\\nas\\Medien\\CreatorOS\\Media\\Projects\\Test\\Neu"],
  });
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
