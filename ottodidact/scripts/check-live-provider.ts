// Explicit opt-in, paid provider check. Uses only the generated native review
// snapshot, never a fresh capture or the user's desktop. Not part of npm test.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import dotenv from 'dotenv';
import { createApp } from '../server/app';
import { providerStatus,readConfig } from '../server/config';
import { imageContextSchema,tutorResponseSchema,type TutorResponse } from '../shared/ai';
import { capturedSession,openBranch } from '../shared/session';
import { TutorCoordinator } from '../desktop/tutor';

async function main() {
  if(!process.argv.includes('--confirm-live'))throw new Error('Add --confirm-live to authorize up to three paid requests using the generated review snapshot.');
  dotenv.config();
  const config=readConfig();
  assert.notEqual(config.provider,'mock','Select a real provider in backend .env first.');
  assert.ok(providerStatus(config).configured,'Configure the selected provider key privately in .env.');
  const fixture=JSON.parse(readFileSync('.ui-review/reference-snapshot.json','utf8'));
  assert.equal(fixture.source,'generated-reference-fixture');
  assert.ok(Date.now()-fixture.createdAt<24*60*60*1000,'Run the native reference review first to create a recent generated snapshot.');
  const image=imageContextSchema.parse(fixture.image),focus=image.selection,display=image.desktopRect;
  let state=capturedSession({id:image.captureId,dataUrl:image.dataUrl,pixelWidth:image.pixelWidth,pixelHeight:image.pixelHeight,scaleFactor:image.displayScale,image,
    rect:{x:display.x+focus.x*display.width,y:display.y+focus.y*display.height,width:focus.width*display.width,height:focus.height*display.height}});
  const server=createApp({config}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const responses:TutorResponse[]=[];
  console.log(JSON.stringify({event:'live_check_start',provider:config.provider,model:config.model,snapshot:'generated study worksheet',pixelWidth:image.pixelWidth,pixelHeight:image.pixelHeight}));
  try {
    const coordinator=new TutorCoordinator(()=>state,s=>state=s,()=>display,async(request,signal)=>{
      const response=await fetch('http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/tutor',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
      const body=await response.json();
      if(!response.ok)throw new Error(body.code+': '+body.error); // Sanitized local backend error only.
      const parsed=tutorResponseSchema.parse(body);responses.push(parsed);return parsed;
    });
    await coordinator.run({type:'explain',question:'Explain how the highlighted first quadratic is factored and why its factors give the two roots. Add only important concept annotations with precise targets in the selected equation.'});
    assert.ok(state.annotations.length,'Live explanation had no annotation to exercise a branch.');
    state=openBranch(state,state.annotations[0].id);
    const branchId=state.activeBranch!,beforeMain=JSON.stringify(state.main.messages);
    await coordinator.run({type:'send',branchId,text:'Explain this step in one short sentence. How can I check it?'});
    assert.equal(JSON.stringify(state.main.messages),beforeMain,'Branch messages must stay out of the visible main transcript.');
    assert.equal(state.branches[branchId].messages.length,2);
    await coordinator.run({type:'send',text:'Use what we just discussed in box 1 to explain why both roots are positive.'});
    assert.equal(state.main.messages.length,4);assert.equal(state.branches[branchId].messages.length,2);
    writeFileSync('.ui-review/live-provider-result.json',JSON.stringify({provider:config.provider,configuredModel:config.model,responses},null,2));
    console.log(JSON.stringify({event:'live_check_pass',provider:config.provider,model:state.provider?.model,requests:responses.length,annotations:state.annotations.length,branchMessages:state.branches[branchId].messages.length,mainMessages:state.main.messages.length}));
  } finally {
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}
main().catch(error=>{console.error('Live check failed:',error instanceof Error?error.message:'Unknown failure');process.exitCode=1;});
