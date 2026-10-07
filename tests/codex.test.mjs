import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,writeFile,readFile,rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { CodexClient,codexClient,validateBrowserCallback } from "@/lib/codex";
import { updateState,readState,exportBackup } from "@/lib/store";
import { readSecret } from "@/lib/secrets";
import { runAi } from "@/lib/ai";

test("browser callback accepts only the current localhost endpoint, state and one-time code",() => {
  const login={type:"chatgpt",expiresAt:Date.now()+60000,loginId:"test",authUrl:"https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=nonce"};
  const target=validateBrowserCallback(login,"http://localhost:1455/auth/callback?state=nonce&code=one-time&next=https://evil.test");
  assert.equal(target.origin,"http://127.0.0.1:1455"); assert.equal(target.searchParams.get("code"),"one-time"); assert.equal(target.searchParams.has("next"),false);
  for(const url of ["http://localhost:1456/auth/callback?state=nonce&code=x","http://192.168.1.2:1455/auth/callback?state=nonce&code=x","http://localhost:1455/admin?state=nonce&code=x","http://localhost:1455/auth/callback?state=wrong&code=x","http://localhost:1455/auth/callback?state=nonce"]) assert.throws(()=>validateBrowserCallback(login,url));
  assert.throws(()=>validateBrowserCallback({...login,expiresAt:0},"http://localhost:1455/auth/callback?state=nonce&code=x"));
});

test("Codex device/browser login, encrypted subscription persistence and shared action permissions",async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),"creatoros-codex-test-"));
  const previous={data:process.env.CREATOROS_DATA_DIR,exe:process.env.CREATOROS_CODEX_EXECUTABLE,script:process.env.CREATOROS_CODEX_SCRIPT};
  process.env.CREATOROS_DATA_DIR=directory; process.env.CREATOROS_CODEX_EXECUTABLE=process.execPath;
  const script=path.join(directory,"fake-codex.cjs"); process.env.CREATOROS_CODEX_SCRIPT=script;
  await writeFile(script,`
const readline=require('node:readline'),fs=require('node:fs'),path=require('node:path');
let account=null,tools=[],phase=0;const send=(x)=>process.stdout.write(JSON.stringify(x)+'\\n');
readline.createInterface({input:process.stdin}).on('line',(line)=>{const x=JSON.parse(line);const reply=(result)=>send({id:x.id,result});
 if(x.method==='initialize') return reply({});
 if(x.method==='account/read') return reply({account,requiresOpenaiAuth:true});
 if(x.method==='model/list') return reply({data:[{model:'gpt-5.4',displayName:'GPT-5.4',isDefault:true}]});
 if(x.method==='account/login/start') {reply(x.params.type==='chatgptDeviceCode'?{type:x.params.type,loginId:'test-login',verificationUrl:'https://auth.openai.com/codex/device',userCode:'ABCD-1234'}:{type:x.params.type,loginId:'test-login',authUrl:'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=nonce'}); setTimeout(()=>{account={type:'chatgpt',email:'test@example.test',planType:'plus'};fs.writeFileSync(path.join(process.env.CODEX_HOME,'auth.json'),JSON.stringify({tokens:{access_token:'only-test-token',refresh_token:'only-test-refresh'}}));send({method:'account/login/completed',params:{loginId:'test-login',success:true}});},30);return;}
 if(x.method==='account/login/cancel') return reply({status:'canceled'});
 if(x.method==='account/logout') {account=null;fs.rmSync(path.join(process.env.CODEX_HOME,'auth.json'),{force:true});return reply({});}
 if(x.method==='thread/start') {if(x.params.environments.length!==0||x.params.config.features.shell_tool!==false||x.params.config.features.stable_environment_tools!==false||x.params.sandbox!=='read-only') return send({id:x.id,error:{code:-1,message:'Unsafe configuration'}});tools=x.params.dynamicTools;return reply({thread:{id:'thread-test'}});}
 if(x.method==='turn/start') {reply({turn:{id:'turn-test'}});setTimeout(()=>send({id:200,method:'item/commandExecution/requestApproval',params:{threadId:'thread-test'}}),20);return;}
 if(x.id===200&&!x.method) {if(!x.error)process.exit(9);send({id:201,method:'item/tool/call',params:{threadId:'thread-test',turnId:'turn-test',tool:'createTask',arguments:{projectId:'lego-october-comeback',title:'Codex next action'}}});return;}
 if(x.id===201&&!x.method){if(!x.result?.success)process.exit(8);send({method:'item/agentMessage/delta',params:{threadId:'thread-test',delta:'Die Aufgabe liegt als Vorschlag vor.'}});send({method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}});return;}
 if(x.method==='thread/unsubscribe') return reply({});
});
`);
  let client;
  try {
    await updateState((state)=>{state.integrations.ai={...state.integrations.ai,enabled:true,provider:"codex",model:"gpt-5.4",permissions:["task.create"],mode:"suggest"};});
    client=codexClient(); assert.equal(await client.account(),null);
    const completed=once(client.events,"account/login/completed");
    const login=await client.login("chatgptDeviceCode"); assert.equal(login.login.userCode,"ABCD-1234"); await completed;
    assert.equal((await client.status()).connected,true);
    assert.equal((await client.request('model/list',{})).data[0].model,'gpt-5.4');
    const state=await readState(); assert.ok(state.integrations.ai.secretId);
    assert.equal(JSON.parse((await readSecret(state.integrations.ai.secretId)).codexAuth).tokens.access_token,"only-test-token");
    assert.ok(!(await readFile(path.join(directory,"integrations.vault.json"),"utf8")).includes("only-test-token"));
    assert.ok(!JSON.stringify(exportBackup(state)).includes("only-test-token"));
    const result=await runAi("Bitte eine Aufgabe als Vorschlag anlegen",state.activeProjectId);
    assert.match(result.answer,/Vorschlag/); assert.equal(result.outcomes[0].outcome,"proposal"); assert.equal(result.state.tasks.length,state.tasks.length); assert.equal(result.state.actionProposals.length,1);
    const browserDone=once(client.events,"account/login/completed"); const browser=await client.login("chatgpt"); assert.match(browser.login.authUrl,/auth.openai.com/); await browserDone;
    await client.logout(); assert.equal((await client.status()).connected,false); assert.equal((await readState()).integrations.ai.secretId,"");
  } finally {
    await client?.stop(); for(const [key,value] of Object.entries({CREATOROS_DATA_DIR:previous.data,CREATOROS_CODEX_EXECUTABLE:previous.exe,CREATOROS_CODEX_SCRIPT:previous.script})) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
    assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});
  }
});
