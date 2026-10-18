// Start an isolated mock backend: native smoke tests must never send a screen to a real provider.
const { spawn }=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const cwd=path.resolve(__dirname,'..');
let backend,desktop;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  const probe=net.createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  const env={...process.env,AI_PROVIDER:'mock',PORT:String(port),OTTODIDACT_BACKEND_URL:`http://127.0.0.1:${port}`};
  for(const key of Object.keys(env))if(/_API_KEY$/.test(key))delete env[key];
  delete env.ELECTRON_RUN_AS_NODE;
  backend=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd,env,stdio:'inherit',windowsHide:true});
  backend.on('error',error=>console.error(error));
  let ready=false;
  // A cold tsx/SDK import can take longer on Windows/OneDrive. Bound startup
  // by wall time; this changes no provider-request retry or timeout behavior.
  const startupDeadline=Date.now()+60000;
  while(Date.now()<startupDeadline){
    if(backend.exitCode!==null)throw new Error('Mock backend exited before startup.');
    try{const status=await fetch(env.OTTODIDACT_BACKEND_URL+'/health',{signal:AbortSignal.timeout(1000)}).then(r=>r.json());if(status.provider==='mock' && status.configured){ready=true;break;}}catch{}
    await wait(100);
  }
  if(!ready)throw new Error('Mock backend did not become ready.');
  desktop=spawn(process.execPath,['scripts/electron.cjs','--smoke-test',...process.argv.slice(2)],{cwd,env,stdio:'inherit',windowsHide:true});
  const code=await new Promise((resolve,reject)=>{desktop.on('exit',resolve);desktop.on('error',reject);});
  process.exitCode=code??1;
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{backend?.kill();});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{desktop?.kill();backend?.kill();process.exitCode=1;});
