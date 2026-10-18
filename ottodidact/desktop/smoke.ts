import { checkGlass,checkEmblems,checkLightGap } from './glassSmoke';
import assert from 'node:assert/strict';
import { app, screen, nativeImage, type BrowserWindow } from 'electron';
import type { Command, Session } from '../shared/milestone';
import { getWindow, windowReady, showWindow, hideAll } from './windows';
import { mkdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { createReviewBackdrop, reviewNativeEdges } from './nativeReview';
import { runInteractionSmoke } from './interactionSmoke';
import { captureBenchmark } from './captureBenchmark';
import { lightPhase,LIGHT_PERIOD_MS } from '../shared/ambientLight';
import { launcherButtonBounds } from '../shared/presentation';
import { encodeSnapshot } from './captureEncoder';
import { runReferenceReview } from './referenceReview';
import { runAnnotationReview } from './annotationReview';
import { runPrecisionReview } from './precisionReview';
import { runResponseReview,runInitialResponseReview } from './responseReview';
import { runMiniChatReview } from './miniChatReview';
import { runButtonReview,runLauncherFlowReview } from './buttonReview';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(win:BrowserWindow) {
  await windowReady(win);
}
async function state(win:BrowserWindow):Promise<Session> { return win.webContents.executeJavaScript('window.ottodidact.getState()'); }
async function invoke(win:BrowserWindow,command:Command) {
  await win.webContents.executeJavaScript(`window.ottodidact.command(${JSON.stringify(command)})`);
}
async function until(check:()=>Promise<boolean>) {
  for(let i=0;i<100;i++){if(await check())return;await delay(100);}
  throw new Error('Timed out waiting for desktop state');
}
// Opt-in UI review only: these windows contain demo text, with snapshot previews collapsed.
async function review(win:BrowserWindow,name:string) {
  if(process.env.OTTODIDACT_UI_REVIEW!=='1')return;
  const directory=path.join(app.getAppPath(),'.ui-review');
  mkdirSync(directory,{recursive:true});
  // Permit compositor copies of these isolated demo UI windows during opt-in review.
  // Normal application windows stay protected.
  win.setContentProtection(false);
  try {
    await delay(500);
    const frame=await win.webContents.capturePage();
    if(name==='selection-ready'){
      const size=frame.getSize(),pixels=frame.toBitmap();
      const rgb=(x:number,y:number)=>[...pixels.subarray((Math.floor(y*size.height)*size.width+Math.floor(x*size.width))*4,(Math.floor(y*size.height)*size.width+Math.floor(x*size.width))*4+3)];
      const first=rgb(.72,.72),second=rgb(.9,.84);
      first.forEach((value,index)=>assert.ok(Math.abs(value-second[index])<=2,'Selection dimming must stay uniform, including lower/right edges'));
    }
    writeFileSync(path.join(directory,name+'.png'),frame.toPNG());
  } finally {win.setContentProtection(true);}
}
export async function runSmokeTest() {
  const deadline=setTimeout(()=>{console.error('Desktop smoke test timed out');app.exit(1);},150000);
  try {
    const companion=getWindow('companion')!,selection=getWindow('selection')!,panel=getWindow('panel')!,overlay=getWindow('annotations')!;
    const effects=getWindow('effects')!,settings=getWindow('settings')!;
    console.log('Desktop smoke: waiting for renderer loads');
    await Promise.all([companion,selection,panel,overlay,effects,settings].map(ready));
    await invoke(panel,{type:'refreshProvider'});
    assert.equal((await state(panel)).provider?.provider,'mock','Native smoke test requires its isolated mock backend');
    const backdrop=await createReviewBackdrop();
    if(process.env.OTTODIDACT_INITIAL_RESPONSE_REVIEW==='1'){
      assert.ok(backdrop);await runInitialResponseReview(backdrop,review);clearTimeout(deadline);app.exit(0);return;
    }
    if(process.env.OTTODIDACT_LAUNCHER_FLOW_REVIEW==='1'){
      assert.ok(backdrop);await runLauncherFlowReview(backdrop,review);clearTimeout(deadline);app.exit(0);return;
    }
    if(process.env.OTTODIDACT_BUTTON_REVIEW==='1'){
      assert.ok(backdrop);await runButtonReview(backdrop,review);clearTimeout(deadline);app.exit(0);return;
    }
    if(process.env.OTTODIDACT_MINICHAT_REVIEW==='1'){
      assert.ok(backdrop);await runMiniChatReview(backdrop);clearTimeout(deadline);app.exit(0);return;
    }
    if(process.env.OTTODIDACT_PRECISION_REVIEW==='1'||process.env.OTTODIDACT_ORGANIZATION_REVIEW==='1'||process.env.OTTODIDACT_RESPONSE_REVIEW==='1'){
      assert.ok(backdrop);await runPrecisionReview(backdrop,review,process.env.OTTODIDACT_ORGANIZATION_REVIEW==='1'||process.env.OTTODIDACT_RESPONSE_REVIEW==='1');
      if(process.env.OTTODIDACT_RESPONSE_REVIEW==='1')await runResponseReview(backdrop,review);
      clearTimeout(deadline);app.exit(0);return;
    }
    if(process.env.OTTODIDACT_ANNOTATION_REVIEW==='1'){
      assert.ok(backdrop);await runAnnotationReview(backdrop,review);clearTimeout(deadline);app.exit(0);return;
    }
    if(process.env.OTTODIDACT_REFERENCE_REVIEW==='1'){
      assert.ok(backdrop,'Reference review requires the generated native backdrop');
      await runReferenceReview(backdrop,review);clearTimeout(deadline);app.exit(0);return;
    }
    if(process.env.OTTODIDACT_CAPTURE_BENCHMARK==='1'){
      assert.ok(backdrop,'Capture benchmarks require the generated review backdrop');
      await captureBenchmark();clearTimeout(deadline);app.exit(0);return;
    }
    if(process.env.OTTODIDACT_INTERACTION_ONLY==='1'){
      await runInteractionSmoke(review);clearTimeout(deadline);app.exit(0);return;
    }
    // Only this isolated regression fixture exercises all five shapes at once.
    // The normal demo uses two illustrative concepts, not a box-count target.
    const fixtureFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{
      if(!String(input).endsWith('/api/tutor')||typeof init?.body!=='string')return fixtureFetch(input,init);
      const headers=new Headers(init.headers);headers.set('Accept','application/json');
      const response=await fixtureFetch(input,{...init,headers});
      const request=JSON.parse(init.body),body=await response.json();
      if(request.kind==='explain'&&body.provider==='mock'&&body.result?.annotations.length){
        const area=request.image.selection,base=body.result.annotations[0];
        body.result.annotations=['arrow','circle','explanation','underline','highlight'].map((kind,index)=>({...base,id:'demo-'+kind,kind,concept:'Demo '+['starting point','detail','connection','relationship','summary'][index],target:{x:area.x+area.width*(.05+(index%3)*.3),y:area.y+area.height*(index<3?.15:.6),width:area.width*.2,height:area.height*.3}}));
      }
      return new Response(JSON.stringify(body),{status:response.status,headers:{'Content-Type':'application/json'}});
    };
    // Validate the real encoder independently of Windows capture: resize a known
    // large BGRA bitmap and verify color channels, alpha and exact output size.
    const bitmap=Buffer.alloc(4096*2048*4);
    for(let offset=0;offset<bitmap.length;offset+=4){bitmap[offset]=31;bitmap[offset+1]=129;bitmap[offset+2]=244;bitmap[offset+3]=255;}
    const encoded=await encodeSnapshot(nativeImage.createFromBitmap(bitmap,{width:4096,height:2048}));
    assert.deepEqual({width:encoded.width,height:encoded.height},{width:3072,height:1536});
    assert.deepEqual([...nativeImage.createFromDataURL(encoded.dataUrl).toBitmap().subarray(0,4)],[31,129,244,255]);
    console.log('Desktop smoke: checking preload bridges');
    for(const win of [companion,selection,panel,overlay,effects,settings]){
      assert.equal(await win.webContents.executeJavaScript('typeof window.ottodidact.command'),'function');
      assert.equal(await win.webContents.executeJavaScript('typeof require'),'undefined');
    }
    const initialBounds=companion.getBounds(),work=screen.getPrimaryDisplay().workArea,face=launcherButtonBounds(initialBounds);
    console.log('Launcher placement:',JSON.stringify({initialBounds,work,face}));
    assert.ok(work.x+work.width-face.x-face.width>=12&&work.x+work.width-face.x-face.width<=16);
    assert.ok(work.y+work.height-face.y-face.height>=12&&work.y+work.height-face.y-face.height<=16);
    assert.equal(await companion.webContents.executeJavaScript('document.querySelectorAll("button").length'),1,'Only the face belongs in the launcher');
    await companion.webContents.executeJavaScript('document.querySelector(".otto-button").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true}))');
    await until(async()=>panel.isVisible()&&await panel.webContents.executeJavaScript('!!document.querySelector(".main-panel")'));
    assert.equal((await state(panel)).phase,'idle','Restoring chat must not take a screenshot');
    await panel.webContents.executeJavaScript(`document.querySelector('.main-panel [aria-label="Otto settings"]').click()`);
    await until(async()=>await panel.webContents.executeJavaScript('!!document.querySelector(".main-panel .settings-embedded")'));
    assert.equal(settings.isVisible(),false,'Settings must live inside main chat');
    await review(panel,'settings-in-main');
    await panel.webContents.executeJavaScript('document.querySelector(".settings-embedded input[type=radio]").click()');
    await until(async()=>(await state(panel)).glowMode==='always');
    panel.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});panel.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
    await until(async()=>!await panel.webContents.executeJavaScript('!!document.querySelector(".settings-embedded")'));
    assert.equal(panel.isVisible(),true,'Escape in settings returns to chat');
    await invoke(panel,{type:'dismiss'});
    await invoke(companion,{type:'settings'});
    assert.equal(settings.isVisible(),true);
    await review(settings,'settings');
    await invoke(settings,{type:'glowMode',mode:'always'});
    await until(async()=>await effects.webContents.executeJavaScript('document.querySelector(".desktop-effects")?.dataset.glow')==='faint');
    assert.equal(effects.isVisible(),true);
    await invoke(settings,{type:'glowMode',mode:'needed'});
    assert.equal(effects.isVisible(),false);
    await until(async()=>await effects.webContents.executeJavaScript('document.documentElement.dataset.windowHidden')==='true');
    await invoke(settings,{type:'glowMode',mode:'always'});
    await invoke(settings,{type:'closeSettings'});
    const queuedWindow=showWindow('settings');
    hideAll();
    await queuedWindow;
    assert.equal(settings.isVisible(),false,'A queued window must not reappear after capture/dismiss hides it');
    await showWindow('companion',false);
    const launcherPosition=companion.getPosition();
    await invoke(companion,{type:'moveLauncher',dx:-40,dy:-40});
    assert.notDeepEqual(companion.getPosition(),launcherPosition);
    companion.setPosition(launcherPosition[0],launcherPosition[1]);
    assert.equal((await state(panel)).phase,'idle');
    await companion.webContents.executeJavaScript('document.querySelector(".otto-button").click()');
    console.log('Desktop smoke: cancelling selection');
    await until(async()=>(await state(panel)).phase==='selecting'&&selection.isVisible());
    assert.equal((await state(panel)).selectionSnapshot,undefined,'Dimming must appear before capture completes');
    assert.equal(await selection.webContents.executeJavaScript('!!document.querySelector(".selection-dimming")'),true);
    assert.equal(selection.isContentProtected(),true);
    selection.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
    selection.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
    await until(async()=>(await state(panel)).phase==='idle');
    await until(async()=>await effects.webContents.executeJavaScript('document.querySelector(".desktop-effects")?.dataset.glow')==='faint');
    await invoke(companion,{type:'capture'});
    console.log('Desktop smoke: selecting native screen region');
    const size=screen.getPrimaryDisplay().size;
    const frozenImage=(await state(panel)).selectionSnapshot!;
    assert.ok(frozenImage);
    assert.equal(await selection.webContents.executeJavaScript('document.querySelector(".selection-snapshot").src'),frozenImage.dataUrl);
    assert.equal(await selection.webContents.executeJavaScript('!!document.querySelector(".selection-dimming") && !!document.querySelector(".edge-glow")'),true);
    if(backdrop){
      const pixels=nativeImage.createFromDataURL(frozenImage.dataUrl).toBitmap();
      const offset=(Math.floor(frozenImage.pixelHeight*.4)*frozenImage.pixelWidth+Math.floor(frozenImage.pixelWidth*.72))*4;
      assert.deepEqual([...pixels.subarray(offset,offset+3)],[229,235,238],'The captured image must contain clean backdrop colors, not the dimming overlay or a black protected window');
      await review(selection,'selection-ready');
    }
    const x=Math.min(100,Math.floor(size.width/8)),y=Math.min(100,Math.floor(size.height/8));
    const width=Math.min(420,Math.floor(size.width/2)),height=Math.min(260,Math.floor(size.height/2));
    selection.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
    selection.webContents.sendInputEvent({type:'mouseMove',x:x+width,y:y+height,button:'left'});
    await until(async()=>await selection.webContents.executeJavaScript('document.querySelector(".selection-rect").getBoundingClientRect().width')===width);
    await review(selection,'selection-drag');
    selection.webContents.sendInputEvent({type:'mouseUp',x:x+width,y:y+height,button:'left',clickCount:1});
    await until(async()=>(await state(panel)).phase==='question');
    console.log('Desktop smoke: captured snapshot; requesting demo');
    let current=await state(panel);
    assert.ok(current.capture);
    assert.ok(current.capture?.dataUrl.startsWith('data:image/png;base64,'));
    assert.ok(current.capture.pixelWidth>0 && current.capture.pixelHeight>0);
    assert.ok(Math.abs(current.capture.rect.width-width)<=size.width/current.capture.pixelWidth);
    assert.equal(current.inputImage?.dataUrl,frozenImage.dataUrl,'The sent image must be the same snapshot selected against');
    assert.deepEqual(current.inputImage?.desktopRect,{x:0,y:0,...size});
    assert.ok(current.inputImage!.selection.width<1);
    await until(async()=>await panel.webContents.executeJavaScript('!!document.querySelector(".question-input-panel textarea")'));
    assert.equal(await panel.webContents.executeJavaScript('document.querySelectorAll(".question-input-panel button").length'),5);
    assert.equal(await panel.webContents.executeJavaScript('document.querySelectorAll(".question-input-panel input[type=checkbox],.question-input-panel .provider-note").length'),0);
    assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".question-input-panel .badge").textContent'),'DEMO');
    assert.ok(panel.getBounds().x<current.capture.rect.x+current.capture.rect.width+screen.getPrimaryDisplay().bounds.x,'Question panel should be near the focus');
    await until(async()=>await effects.webContents.executeJavaScript('document.querySelector(".frozen-focus img")?.complete===true'));
    assert.equal(await effects.webContents.executeJavaScript('document.querySelector(".frozen-focus img").src'),frozenImage.dataUrl,'Focus must continue showing the exact captured image');
    await review(panel,'question-input');
    await review(companion,'otto-button');
    await panel.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.question-input-panel textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep this pending question');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".question-input-panel .chat-header h1").textContent'),'Otto');
    await panel.webContents.executeJavaScript(`document.querySelector('.question-input-panel [aria-label="Otto settings"]').click()`);
    await until(async()=>await panel.webContents.executeJavaScript('!!document.querySelector(".question-input-panel .settings-embedded")')&&panel.getBounds().height>=400);
    assert.equal(settings.isVisible(),false,'Question settings must stay inside the question panel');
    await panel.webContents.executeJavaScript('document.querySelector(".question-input-panel input[type=radio]").click()');
    await until(async()=>(await state(panel)).glowMode==='always');
    await review(panel,'question-settings');
    panel.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
    panel.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
    await until(async()=>!await panel.webContents.executeJavaScript('!!document.querySelector(".question-input-panel .settings-embedded")')&&panel.getBounds().height<300);
    assert.equal((await state(panel)).phase,'question','Escape in question settings returns to the unsent question');
    assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".question-input-panel textarea").value'),'Keep this pending question');
    await companion.webContents.executeJavaScript('document.querySelector(".otto-button").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true}))');
    await until(async()=>(await state(panel)).panelView==='main');
    await panel.webContents.executeJavaScript(`document.querySelector('.main-panel [aria-label="Otto settings"]').click()`);
    await until(async()=>await panel.webContents.executeJavaScript('!!document.querySelector(".settings-embedded")'));
    await panel.webContents.executeJavaScript(`document.querySelector('.main-panel [aria-label="Close settings"]').click()`);
    await invoke(panel,{type:'questionPanel'});
    await until(async()=>!(await state(panel)).panelView);
    assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".question-input-panel textarea").value'),'Keep this pending question');
    await panel.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.question-input-panel textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const sample=()=>companion.webContents.executeJavaScript(`(()=>{const el=document.querySelector('.otto-button'),r=el.getBoundingClientRect();return {phase:Number(el.dataset.lightPhase),angle:parseFloat(getComputedStyle(el).getPropertyValue('--glass-angle')),x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const firstLight=await sample();await delay(1000);const secondLight=await sample();
    assert.notEqual(secondLight.phase,firstLight.phase);
    assert.equal(secondLight.angle,secondLight.phase/LIGHT_PERIOD_MS*360,'Surface colors must move on the same clock as the screen edge');
    const edgeClock=await effects.webContents.executeJavaScript(`(()=>{const a=document.querySelector('.edge-light').getAnimations()[0];return {phase:Number(a.currentTime)%${LIGHT_PERIOD_MS},now:Date.now()%${LIGHT_PERIOD_MS}};})()`);
    const separation=Math.abs(edgeClock.phase-edgeClock.now);
    assert.ok(Math.min(separation,LIGHT_PERIOD_MS-separation)<100,'Edge clock must stay synchronized across windows');
    assert.ok(Math.min(Math.abs(lightPhase(Date.now())-secondLight.phase),LIGHT_PERIOD_MS-Math.abs(lightPhase(Date.now())-secondLight.phase))<180);
    await checkGlass(companion);
    await review(companion,'otto-button-motion');
    await checkEmblems(companion,panel,review);
    await checkLightGap(companion,effects);
    for(const win of [companion,panel,effects]){win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});}
    await until(async()=>(await sample()).phase===0);
    assert.equal(await effects.webContents.executeJavaScript('getComputedStyle(document.querySelector(".edge-light")).animationName'),'none');
    const stationary=await sample();await delay(250);assert.equal((await sample()).angle,stationary.angle);
    assert.equal(await companion.webContents.executeJavaScript("getComputedStyle(document.querySelector('.otto-button')).getPropertyValue('--glass-angle').trim()"),'0deg');
    await checkGlass(companion);await checkGlass(panel,'.question-input-panel .chat-header .otto-logo',false);
    for(const win of [companion,panel])assert.equal(await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.otto-logo[data-idle=true] .otto-eye')).animationName"),'none');
    await review(companion,'otto-reduced-motion');
    for(const win of [companion,panel,effects])win.webContents.debugger.detach();
    await reviewNativeEdges(backdrop);
    await checkGlass(companion);
    await panel.webContents.executeJavaScript("document.querySelector('textarea').focus()");
    panel.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers:['shift']});
    panel.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers:['shift']});
    panel.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers:['shift']});
    await until(async()=>await panel.webContents.executeJavaScript('document.querySelector("textarea").value.includes("\\n")'));
    assert.equal((await state(panel)).phase,'question','Shift+Enter must not send');
    // Real renderer submission and a controlled transport failure: keep the question editable.
    const fetchBeforeFailure=globalThis.fetch;
    const failedQuestions:string[]=[];
    globalThis.fetch=async(_input,init)=>{failedQuestions.push(JSON.parse(String(init?.body)).question);throw new Error('Controlled connection failure');};
    const failedAttempt=async(count:number)=>until(async()=>failedQuestions.length===count&&await panel.webContents.executeJavaScript('!!document.querySelector(".question-input-panel [role=alert]") && !document.querySelector("textarea").disabled'));
    await panel.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');input.focus();const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(input,'Keep my question');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    panel.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
    panel.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
    await failedAttempt(1);
    assert.equal(failedQuestions[0],'Keep my question','Enter must send the typed question');
    assert.equal(await panel.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep my question');
    await panel.webContents.executeJavaScript('document.querySelector(".send-button").click()');
    await failedAttempt(2);
    assert.equal(failedQuestions[1],'Keep my question','The send arrow must send the typed question');
    await panel.webContents.executeJavaScript('document.querySelector(".quick-answer-button").click()');
    await failedAttempt(3);
    assert.match(failedQuestions[2],/Answer the question or problem in the selected area/,'Quick answer must answer the selection even with a nonempty draft');
    assert.equal(await panel.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep my question','A failed Quick answer must preserve the unsent draft');
    await review(panel,'question-error');
    await panel.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await panel.webContents.executeJavaScript('document.querySelector(".quick-answer-button").click()');
    await failedAttempt(4);
    assert.equal(failedQuestions[3],failedQuestions[2],'Quick answer must work with an empty input too');
    globalThis.fetch=fetchBeforeFailure;
    // Delay delivery only in this isolated test to inspect the real processing window.
    const originalFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{const response=await originalFetch(input,init);await delay(600);return response;};
    await panel.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep my question');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const explaining=(async()=>{await panel.webContents.executeJavaScript('document.querySelector(".quick-answer-button").click()');await until(async()=>{const value=await state(panel);return value.phase==='explained'&&Object.keys(value.branches).length===5&&Object.values(value.branches).every(branch=>branch.open);});})();
    await until(async()=>await effects.webContents.executeJavaScript('!!document.querySelector(".otto-pointer")'));
    effects.webContents.debugger.attach('1.3');
    await effects.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await effects.webContents.executeJavaScript('getComputedStyle(document.querySelector(".pointer-logo")).animationName'),'none');
    assert.equal(await effects.webContents.executeJavaScript('getComputedStyle(document.querySelector(".edge-glow")).animationName'),'none');
    effects.webContents.debugger.detach();
    await explaining;
    globalThis.fetch=originalFetch;
    await until(async()=>await effects.webContents.executeJavaScript('!document.querySelector(".otto-pointer") && !!document.querySelector(".screen-dimming")'));
    current=await state(panel);
    assert.equal(current.question,failedQuestions[2],'Quick answer must remain separate from the typed question when retried');
    assert.equal(current.main.messages.some(message=>message.content==='Keep my question'),false,'Quick answer must not insert the unsent draft into the conversation');
    assert.equal(current.annotations.length,5);
    assert.equal(current.provider?.provider,'mock');
    assert.equal(current.phase,'explained');
    assert.equal(Object.keys(current.branches).length,5);
    assert.ok(Object.values(current.branches).every(branch=>branch.open));
    await review(panel,'main-chat');
    const mainBefore=structuredClone(current.main);
    const arrow=current.annotations[0].id,circle=current.annotations[1].id;
    await overlay.webContents.executeJavaScript('document.querySelector(".marker-arrow").click()');
    await until(async()=>!!(await state(panel)).activeBranch);
    current=await state(panel);
    const branchId=current.activeBranch!;
    await until(async()=>!!getWindow(`branch:${branchId}`)?.isVisible());
    const branchWindow=getWindow(`branch:${branchId}`)!;
    await until(async()=>await branchWindow.webContents.executeJavaScript('!!document.querySelector(".annotation-card textarea")'));
    assert.equal(current.branches[branchId].expanded,false);
    await review(branchWindow,'annotation-card');
    await invoke(branchWindow,{type:'send',branchId,text:'Explore this annotation'});
    assert.equal((await state(panel)).phase,'explained','Sending in a card must keep the lesson active');
    assert.equal((await state(panel)).branches[branchId].expanded,true);
    await until(async()=>await branchWindow.webContents.executeJavaScript('document.querySelectorAll(".message").length')===2);
    assert.equal(await branchWindow.webContents.executeJavaScript('document.querySelector(".annotation-card").getBoundingClientRect().top>=0'),true,'The expanded card must stay in its viewport');
    await review(branchWindow,'expanded-chat');
    assert.equal((await state(panel)).phase,'explained','Visual review must not change the active lesson');
    const branchBounds=branchWindow.getBounds();branchWindow.setPosition(branchBounds.x,branchBounds.y+12);
    await until(async()=>Math.abs((await state(panel)).branches[branchId].windowBounds!.y-(branchWindow.getBounds().y-screen.getPrimaryDisplay().bounds.y))<=1);
    await invoke(branchWindow,{type:'closeBranch',branchId});
    assert.equal(branchWindow.isVisible(),false);
    await invoke(overlay,{type:'openBranch',annotationId:circle});
    current=await state(panel);
    assert.equal(current.branches[current.activeBranch!].messages.length,0);
    await invoke(overlay,{type:'openBranch',annotationId:arrow});
    current=await state(panel);
    assert.equal(current.activeBranch,branchId);
    assert.equal(Object.keys(current.branches).length,5);
    assert.equal(current.branches[branchId].messages.length,2);
    assert.deepEqual(current.main,mainBefore);
    assert.equal(getWindow(`branch:${branchId}`),branchWindow);
    await invoke(overlay,{type:'openBranch',annotationId:current.annotations[3].id});
    const fourth=(await state(panel)).activeBranch!;
    await invoke(getWindow(`branch:${fourth}`)!,{type:'send',branchId:fourth,text:'Explore box four'});
    assert.deepEqual((await state(panel)).main,mainBefore);
    await invoke(panel,{type:'send',text:'How does what we discussed in 1 relate to 4?'});
    current=await state(panel);
    assert.equal(current.main.messages.length,mainBefore.messages.length+2);
    assert.match(current.main.messages.at(-1)!.content,/box 1, box 4/);
    await invoke(overlay,{type:'openBranch',annotationId:current.annotations[2].id});
    assert.equal(Object.keys((await state(panel)).branches).length,5);
    await until(async()=>await overlay.webContents.executeJavaScript('document.querySelectorAll(".marker").length')===5);
    await invoke(panel,{type:'clear'});
    assert.equal((await state(panel)).annotations.length,0);
    assert.equal(overlay.isVisible(),false);
    assert.ok(Object.values((await state(panel)).branches).every(branch=>!branch.open));
    await until(async()=>await effects.webContents.executeJavaScript('!document.querySelector(".screen-dimming")'));
    await invoke(panel,{type:'resumeBranch',branchId});
    assert.equal((await state(panel)).branches[branchId].messages.length,2);
    await invoke(panel,{type:'dismiss'});
    assert.equal(panel.isVisible(),false);
    assert.equal(companion.isVisible(),true);
    await until(async()=>await effects.webContents.executeJavaScript('document.querySelector(".desktop-effects")?.dataset.glow')==='faint');
    assert.equal(branchWindow.isVisible(),false);
    await invoke(companion,{type:'settings'});
    await invoke(settings,{type:'glowMode',mode:'needed'});
    assert.equal(effects.isVisible(),false);
    const beforeDisplayChange=await state(panel);
    screen.emit('display-metrics-changed',{},screen.getPrimaryDisplay(),['scaleFactor']);
    await until(async()=>!!(await state(panel)).snapshotStale);
    assert.deepEqual((await state(panel)).main,beforeDisplayChange.main);
    assert.equal((await state(panel)).branches[branchId].messages.length,2);
    assert.deepEqual(effects.getBounds(),screen.getPrimaryDisplay().bounds);
    await invoke(companion,{type:'capture'});
    assert.ok((await state(panel)).selectionSnapshot,'A display event must not require an application restart');
    await invoke(selection,{type:'cancel'});
    await runInteractionSmoke(review);
    console.log('DESKTOP SMOKE PASS: native sandboxed windows, glow transitions, launcher movement, Escape, frozen full-display capture, immediate dimming/clean capture, compact question panel/Quick Answer/Shift+Enter/failure retention, display-change recovery, processing logo, reduced motion, dimming, five demo marker types, movable chats/reopen, shared box 1/4 context with separate transcripts, clear and dismiss.');
    clearTimeout(deadline);
    app.exit(0);
  } catch(error) {clearTimeout(deadline);console.error('DESKTOP SMOKE FAIL:',error);app.exit(1);}
}
