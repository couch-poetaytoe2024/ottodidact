import assert from 'node:assert/strict';
import { desktopCapturer,screen,type BrowserWindow } from 'electron';
import type { Command,Session } from '../shared/milestone';
import { getWindow,sizeMainPanel,resizeMainPanel } from './windows';
import { overlap,placeMainPanel,launcherButtonBounds } from '../shared/presentation';
import { runCommand } from './ipc';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const state=(win:BrowserWindow):Promise<Session>=>win.webContents.executeJavaScript('window.ottodidact.getState()');
const invoke=(win:BrowserWindow,command:Command)=>win.webContents.executeJavaScript(`window.ottodidact.command(${JSON.stringify(command)})`);
async function until(check:()=>Promise<boolean>){for(let i=0;i<120;i++){if(await check())return;await delay(50);}throw new Error('Interaction check timed out');}
function pointer(win:BrowserWindow,type:'mouseDown'|'mouseMove'|'mouseUp',x:number,y:number){win.webContents.sendInputEvent({type,x,y,button:'left',clickCount:1});}
async function draft(win:BrowserWindow,text:string){await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);}

export async function runInteractionSmoke(review:(win:BrowserWindow,name:string)=>Promise<void>){
  const panel=getWindow('panel')!,otto=getWindow('companion')!,selection=getWindow('selection')!;
  const area=screen.getPrimaryDisplay().workArea;
  console.log('Interaction smoke: immediate drag, duplicate activation and cancelled capture replacement');
  const original=desktopCapturer.getSources.bind(desktopCapturer);
  let release!:()=>void,count=0,active=0,maxActive=0;
  const gate=new Promise<void>(resolve=>release=resolve);
  desktopCapturer.getSources=async options=>{count++;const index=count;active++;maxActive=Math.max(maxActive,active);try{const result=await original(options);if(index===1)await gate;return result;}finally{active--;}};
  try {
    const old=invoke(otto,{type:'capture'});
    await until(async()=>count===1);
    const first=(await state(panel)).selectionId!;
    await Promise.all([invoke(otto,{type:'capture'}),invoke(otto,{type:'capture'})]);
    assert.equal(count,1);assert.equal((await state(panel)).selectionId,first);
    pointer(selection,'mouseDown',300,300);pointer(selection,'mouseMove',200,220);
    await until(async()=>await selection.webContents.executeJavaScript('document.querySelector(".selection-rect")?.getBoundingClientRect().width===100'));
    assert.equal((await state(panel)).selectionSnapshot,undefined,'Pointer feedback must not wait for capture processing');
    selection.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});selection.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
    await until(async()=>(await state(panel)).phase!=='selecting');
    pointer(selection,'mouseUp',200,220);
    const replacement=invoke(otto,{type:'capture'});
    await until(async()=>(await state(panel)).phase==='selecting'&&(await state(panel)).selectionId!==first);
    const nextId=(await state(panel)).selectionId!;
    await invoke(selection,{type:'select',selectionId:first,rect:{x:30,y:30,width:30,height:30}});
    assert.equal((await state(panel)).selectionId,nextId,'A stale selection must not commit to the replacement');
    pointer(selection,'mouseDown',240,240);pointer(selection,'mouseMove',232,232);
    await until(async()=>await selection.webContents.executeJavaScript('document.querySelector(".selection-rect")?.getBoundingClientRect().width===8'));
    pointer(selection,'mouseUp',232,232);
    assert.equal(count,1,'The replacement must wait for the cancelled native operation');
    release();await old;await replacement;
    await until(async()=>(await state(panel)).phase==='question');
    assert.equal(count,2);assert.equal(maxActive,1);
    assert.ok((await state(panel)).capture!.rect.width>=8);
    assert.equal((await state(panel)).error,undefined);
  } finally {release();desktopCapturer.getSources=original;}

  console.log('Interaction smoke: retake, small clicks, four drag directions and boundary release');
  for(const [dx,dy] of [[8,8],[-8,8],[8,-8],[-8,-8]]){
    await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Retake"]').click()`);
    await until(async()=>(await state(panel)).phase==='selecting'&&!!(await state(panel)).selectionSnapshot);
    pointer(selection,'mouseDown',200,200);pointer(selection,'mouseUp',201,201);
    await until(async()=>await selection.webContents.executeJavaScript('document.querySelector(".selection-hint").textContent.includes("at least")'));
    assert.equal((await state(panel)).phase,'selecting','A click must not create a useless capture');
    pointer(selection,'mouseDown',200,200);pointer(selection,'mouseMove',200+dx,200+dy);pointer(selection,'mouseUp',200+dx,200+dy);
    await until(async()=>(await state(panel)).phase==='question');
    const focus=(await state(panel)).capture!.rect;
    assert.ok(Math.abs(focus.width-8)<=2&&Math.abs(focus.height-8)<=2);
  }
  await invoke(otto,{type:'capture'});
  pointer(selection,'mouseDown',20,20);pointer(selection,'mouseMove',0,60);pointer(selection,'mouseUp',0,60);
  await until(async()=>(await state(panel)).phase==='question');
  assert.equal((await state(panel)).capture!.rect.x,0,'Captured pointer release is clamped to the display edge');

  console.log('Interaction smoke: short/long main chat, anchored growth, reading position and minimize');
  const savedFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const response=await savedFetch(input,init),body=await response.json();
    if(body.result){body.result.explanation='Demo content: a short explanation.';body.result.annotations=[];}
    return new Response(JSON.stringify(body),{status:response.status,headers:{'Content-Type':'application/json'}});
  };
  try {await invoke(panel,{type:'explain',question:'A short demo'});}finally{globalThis.fetch=savedFetch;}
  await until(async()=>await panel.webContents.executeJavaScript('!!document.querySelector(".main-panel .message-list")'));
  await delay(250);
  const short=panel.getBounds(),launcher=otto.getBounds();
  console.log('Main anchor review:',JSON.stringify({short,launcher,button:launcherButtonBounds(launcher)}));
  await review(panel,'main-short');
  assert.ok(Math.abs(short.y+short.height-(launcherButtonBounds(launcher).y-10))<=1.5);
  await invoke(panel,{type:'send',text:'Explain this demo in detail. '.repeat(22)});
  await until(async()=>panel.getBounds().height>short.height);
  const long=panel.getBounds();
  assert.ok(Math.abs(long.y+long.height-short.y-short.height)<=1);assert.deepEqual(otto.getBounds(),launcher);
  await until(async()=>await panel.webContents.executeJavaScript('(()=>{const e=document.querySelector(".message-list");return e.scrollHeight>e.clientHeight&&e.scrollHeight-e.scrollTop-e.clientHeight<3;})()'));
  await draft(panel,'Keep this unsent draft');
  await panel.webContents.executeJavaScript('(()=>{const e=document.querySelector(".message-list");e.scrollTop=20;e.dispatchEvent(new Event("scroll"));})()');
  await delay(100);
  const reading=await panel.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop');
  const beforeSettings=panel.getBounds();
  await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Otto settings"]').click()`);
  await until(async()=>await panel.webContents.executeJavaScript('!!document.querySelector(".settings-embedded")'));
  await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Close settings"]').click()`);
  await until(async()=>!await panel.webContents.executeJavaScript('!!document.querySelector(".settings-embedded")'));
  await delay(100);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep this unsent draft');
  assert.ok(Math.abs(await panel.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop')-reading)<3);
  assert.deepEqual(panel.getBounds(),beforeSettings,'Settings must not move or resize main chat');
  await invoke(panel,{type:'send',text:'Another demo answer while reading earlier messages.'});await delay(150);
  assert.ok(Math.abs(await panel.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop')-reading)<3,'New replies must not pull a reader to the bottom');
  const stable=panel.getBounds();
  await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Minimize main chat"]').click()`);
  await until(async()=>!!(await state(panel)).mainMinimized);
  console.log('Minimized main bounds:',JSON.stringify(panel.getBounds()));
  await review(panel,'main-minimized');
  assert.ok(panel.getBounds().height<=58,'Minimized main should contain only its header');
  await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Restore main chat"]').click()`);
  await until(async()=>panel.getBounds().height===stable.height);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep this unsent draft');
  assert.ok(Math.abs(await panel.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop')-reading)<3);
  // Changing corners moves the main window independently, without recreating its renderer.
  otto.setPosition(area.x+16,launcher.y);sizeMainPanel(await state(panel));await delay(100);
  assert.ok(panel.getBounds().x<area.x+200);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep this unsent draft');
  assert.ok(Math.abs(await panel.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop')-reading)<3);
  otto.setBounds(launcher);sizeMainPanel(await state(panel));
  await panel.webContents.executeJavaScript('(()=>{const e=document.querySelector(".message-list");e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event("scroll"));})()');await delay(100);
  await invoke(panel,{type:'send',text:'Follow this new message at the bottom.'});
  await until(async()=>await panel.webContents.executeJavaScript('(()=>{const e=document.querySelector(".message-list");return e.scrollHeight-e.scrollTop-e.clientHeight<3;})()'));
  await review(panel,'main-long');

  console.log('Interaction smoke: focus avoidance on growth and default position on dismissal');
  await invoke(otto,{type:'capture'});
  const id=(await state(panel)).selectionId!;
  const focus={x:Math.max(0,area.width-420),y:100,width:400,height:Math.min(510,area.height-170)};
  await invoke(selection,{type:'select',selectionId:id,rect:focus});
  await invoke(panel,{type:'explain',question:'Explain this corner focus in demo mode.'});
  await delay(250);
  assert.equal(overlap(panel.getBounds(),{...focus,x:focus.x+area.x,y:focus.y+area.y}),0);
  resizeMainPanel(await state(panel),680);await delay(100);
  assert.equal(overlap(panel.getBounds(),{...focus,x:focus.x+area.x,y:focus.y+area.y}),0);
  const afterGrowth=panel.getBounds(),branch=Object.values((await state(panel)).branches)[0];
  await invoke(panel,{type:'openBranch',annotationId:branch.annotationId});
  assert.deepEqual(panel.getBounds(),afterGrowth,'Opening an individual chat must not move main');
  const branchWindow=getWindow(`branch:${branch.id}`)!;
  branchWindow.setPosition(area.x+area.width-branchWindow.getBounds().width,area.y+area.height-branchWindow.getBounds().height);
  await invoke(branchWindow,{type:'expandBranch',branchId:branch.id,expanded:true});
  const expanded=branchWindow.getBounds();assert.ok(expanded.y>=area.y&&expanded.y+expanded.height<=area.y+area.height);
  await review(panel,'main-focus-avoidance');
  await invoke(panel,{type:'dismiss'});
  const reset=placeMainPanel(area,launcherButtonBounds(otto.getBounds()),680),actual=panel.getBounds();
  for(const key of ['x','y','width','height'] as const)assert.ok(Math.abs(actual[key]-reset[key])<=1);
  assert.equal((await state(panel)).presented,false);
  console.log('Interaction smoke: nearly full-screen focus, compact scrolling, focus and minimize/restore');
  await invoke(otto,{type:'capture'});
  const nearFull={x:12,y:12,width:area.width-24,height:area.height-24};
  await invoke(selection,{type:'select',selectionId:(await state(panel)).selectionId!,rect:nearFull});
  await invoke(panel,{type:'explain',question:'Explain this nearly full-screen demo.'});
  await until(async()=>await panel.webContents.executeJavaScript('!!document.querySelector(".main-panel textarea")'));
  await delay(150);
  await draft(panel,'Keep this tight-layout draft');
  await panel.webContents.executeJavaScript('document.querySelector(".main-panel textarea").focus()');
  const focusBefore=structuredClone((await state(panel)).capture!.rect),launcherBefore=otto.getBounds();
  resizeMainPanel(await state(panel),680);await delay(150);
  const tight=panel.getBounds();
  assert.ok(tight.width>=300&&tight.width<=302&&tight.height>=300&&tight.height<=302,'No free space: reduce main to readable limits');
  assert.equal(await panel.webContents.executeJavaScript('document.activeElement===document.querySelector(".main-panel textarea")'),true);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".main-panel textarea").value'),'Keep this tight-layout draft');
  assert.deepEqual(otto.getBounds(),launcherBefore);assert.deepEqual((await state(panel)).capture!.rect,focusBefore);
  const tightLayout=await panel.webContents.executeJavaScript(`(()=>{const send=document.querySelector('.main-panel .send-button').getBoundingClientRect(),chat=document.querySelector('.main-panel .chat-panel').getBoundingClientRect();return {sendBottom:send.bottom,chatBottom:chat.bottom,listHeight:document.querySelector('.main-panel .message-list').clientHeight};})()`);
  console.log('Tight composer layout:',JSON.stringify(tightLayout));
  await review(panel,'main-nearly-full');
  assert.ok(tightLayout.sendBottom<=tightLayout.chatBottom+1&&tightLayout.listHeight>=40,'Tight layouts must keep the whole composer visible');
  await invoke(panel,{type:'minimizeMain',minimized:true});await delay(100);
  assert.ok(panel.getBounds().height<=58);
  await review(panel,'main-nearly-full-minimized');
  await invoke(panel,{type:'minimizeMain',minimized:false});await delay(150);
  assert.deepEqual(panel.getBounds(),tight);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".main-panel textarea").value'),'Keep this tight-layout draft');
  await invoke(panel,{type:'dismiss'});
  const defaultAgain=placeMainPanel(area,launcherButtonBounds(otto.getBounds()),680);
  for(const key of ['x','y','width','height'] as const)assert.ok(Math.abs(panel.getBounds()[key]-defaultAgain[key])<=1);
  // A native display notification already has coverage in the main smoke suite.
  await runCommand({type:'glowMode',mode:'needed'});
  console.log('INTERACTION SMOKE PASS: pending-capture drags, serial replacement, stale selection rejection, four small-drag directions, edge release, upward growth, internal scrolling, reading/draft retention, corner movement, minimize/restore, focus avoidance, branch stability.');
}
