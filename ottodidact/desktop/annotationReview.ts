// Generated desktop content and known coordinates only; never calls a live provider.
import assert from 'node:assert/strict';
import { app,nativeImage,screen,type BrowserWindow } from 'electron';
import path from 'node:path';
import { getWindow } from './windows';
import { composite } from './referenceReview';
import type { Command,Session } from '../shared/milestone';
import type { ModelAnnotation,ModelExplanation } from '../shared/ai';
import { overlap } from '../shared/presentation';
import { organizeAnnotations } from '../shared/annotationOrganization';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const state=(win:BrowserWindow):Promise<Session>=>win.webContents.executeJavaScript('window.ottodidact.getState()');
const invoke=(win:BrowserWindow,command:Command)=>win.webContents.executeJavaScript(`window.ottodidact.command(${JSON.stringify(command)})`);
async function withResponse(result:ModelExplanation,action:()=>Promise<unknown>){
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const headers=new Headers(init?.headers);headers.set('Accept','application/json');
    const response=await original(input,{...init,headers}),body=await response.json();
    assert.equal(body.provider,'mock','Annotation review must never contact a paid provider');
    body.result=result;return new Response(JSON.stringify(body),{status:response.status,headers:{'Content-Type':'application/json'}});
  };
  try{await action();}finally{globalThis.fetch=original;}
}
export async function runAnnotationReview(fixture:BrowserWindow,review:(win:BrowserWindow,name:string)=>Promise<void>) {
  const panel=getWindow('panel')!,selection=getWindow('selection')!,otto=getWindow('companion')!,effects=getWindow('effects')!,overlay=getWindow('annotations')!;
  const d=screen.getPrimaryDisplay(),w=d.bounds.width,h=d.bounds.height;
  const focus={x:w*.3,y:h*.2,width:w*.4,height:h*.5},target={x:.46,y:.4,width:.08,height:.07};
  await fixture.webContents.executeJavaScript(`document.body.innerHTML='<div style="position:absolute;inset:0;background:white"><div style="position:absolute;left:46vw;top:40vh;width:8vw;height:7vh;color:#222;font:18px Segoe UI">KNOWN TARGET</div></div>'`);
  await delay(200);await invoke(otto,{type:'capture'});
  await invoke(selection,{type:'select',selectionId:(await state(panel)).selectionId!,rect:focus});
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const response=await original(input,init),body=await response.json();
    if(body.result)body.result={explanation:'DEMO: synthetic coordinates, no image analysis.',warnings:['Generated rendering test only.'],annotations:[{id:'known',kind:'circle',concept:'Known center target',explanation:'This circle must be visible inside the selected snapshot.',target}]};
    return new Response(JSON.stringify(body),{status:response.status,headers:{'Content-Type':'application/json'}});
  };
  try{await invoke(panel,{type:'explain',question:'Rendering test only'});}finally{globalThis.fetch=original;}
  await delay(800);
  const current=await state(panel),cards=Object.values(current.branches).map(b=>getWindow(`branch:${b.id}`)!);
  // Reproduce Windows independently promoting a non-focusable effects window.
  // Even with this order, the screenshot must never paint over its own markings.
  await composite([fixture,overlay,effects,...cards,panel,otto],'annotation-stack');
  const frame=nativeImage.createFromPath(path.join(app.getAppPath(),'.ui-review/annotation-stack.png')),size=frame.getSize(),pixels=frame.toBitmap();
  const x=Math.round(target.x*size.width),y=Math.round((target.y+target.height/2)*size.height);
  let colored=0;
  for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){const i=((y+dy)*size.width+x+dx)*4;const [b,g,r]=pixels.subarray(i,i+3);if(r>180&&g>65&&g<210&&b<80)colored++;}
  console.log('Known middle-of-focus target pixels after native stacking change:',colored);
  if(process.env.OTTODIDACT_ANNOTATION_BASELINE==='1')return;
  assert.ok(colored>5,'The known target must remain visible over the frozen focus regardless of native stacking');
  await review(cards[0],'annotation-known-target-card');
  assert.equal(await effects.webContents.executeJavaScript('document.querySelectorAll(".explanation-leaders g").length'),0,'Circles do not need extra arrow connectors');

  async function lesson(annotations:ModelAnnotation[]){
    await invoke(otto,{type:'capture'});await invoke(selection,{type:'select',selectionId:(await state(panel)).selectionId!,rect:focus});
    await withResponse({explanation:'DEMO: generated rendering fixture.',warnings:['No model calls.'],annotations},()=>invoke(panel,{type:'explain',question:'Offline layout test'}));
    await delay(650);return state(panel);
  }
  // Each shape gets the same known middle target, without any model coordinates.
  for(const kind of ['arrow','underline','highlight'] as const){
    const s=await lesson([{id:'known-'+kind,kind,concept:'Known '+kind,explanation:'A short explanation.',target}]);
    const card=getWindow(`branch:${Object.keys(s.branches)[0]}`)!;
    await composite([fixture,overlay,effects,card,panel,otto],'annotation-'+kind);
    const image=nativeImage.createFromPath(path.join(app.getAppPath(),'.ui-review/annotation-'+kind+'.png')),size=image.getSize(),bitmap=image.toBitmap();
    const route=kind==='arrow'?organizeAnnotations(s.annotations,s.branches,undefined,s.overlayMainBounds).marks[0].route:undefined;
    const tip=route?.points.at(-1);
    const point=tip?{x:tip.x/w,y:tip.y/h}:kind==='underline'?{x:.5,y:.47+2/h}:{x:.46,y:.435};
    if(route?.connected){assert.ok(route.points[0].x<focus.x||route.points[0].x>focus.x+focus.width||route.points[0].y<focus.y||route.points[0].y>focus.y+focus.height);assert.ok(tip!.x>focus.x&&tip!.x<focus.x+focus.width&&tip!.y>focus.y&&tip!.y<focus.y+focus.height);}
    let color=0;const x=Math.round(point.x*size.width),y=Math.round(point.y*size.height);
    for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const offset=((y+dy)*size.width+x+dx)*4,[b,g,r]=bitmap.subarray(offset,offset+3);if(r>180&&g>65&&g<210&&b<80)color++;}
    assert.ok(color>5,kind+' must paint on its known target inside the focus');
  }
  const long='A longer explanation must remain readable at its normal font size. It grows to fit the available space and keeps each complete paragraph visible. ';
  const formatted='Use these steps:\n\n1. Find two factors.\n2. Check their sum and product.\n\n$$x^2-5x+6=(x-2)(x-3)$$\n\n```python\nfor root in [2, 3]:\n    print(root * root - 5 * root + 6)\n```';
  let mixed=await lesson([
    {id:'short',kind:'circle',concept:'Short concept',taskRefs:['Example worksheet · Task 1'],explanation:'One compact sentence.',target},
    {id:'long',kind:'underline',concept:'Long explanation',taskRefs:['Example worksheet · Task 2'],explanation:long.repeat(2)+'\n\n'+long.repeat(2),target:{...target,y:.51}},
    {id:'formatted',kind:'arrow',concept:'Equation and code',taskRefs:['Example worksheet · Task 1','Example worksheet · Task 2'],explanation:formatted,target:{...target,y:.59}},
  ]);
  const branches=Object.values(mixed.branches),wins=branches.map(b=>getWindow(`branch:${b.id}`)!);
  const boxes=wins.map(win=>win.getBounds());
  for(const [i,win] of wins.entries())assert.equal(await win.webContents.executeJavaScript('document.querySelector(".card-task-label").textContent'),branches[i].annotation!.taskRefs!.join(' / '),'Source task labels must remain separate from stable box numbers');
  console.log('Measured card dimensions:',JSON.stringify(boxes.map(b=>({width:b.width,height:b.height}))));
  assert.ok(boxes[1].height>boxes[0].height+80,'Long prose must receive more height than a short sentence');
  const globalFocus={...focus,x:focus.x+d.bounds.x,y:focus.y+d.bounds.y};
  for(const [i,box] of boxes.entries()){
    assert.ok(box.x>=d.workArea.x&&box.y>=d.workArea.y&&box.x+box.width<=d.workArea.x+d.workArea.width+1&&box.y+box.height<=d.workArea.y+d.workArea.height+1);
    assert.equal(overlap(box,globalFocus)+overlap(box,panel.getBounds()),0);
    for(const other of boxes.slice(i+1))assert.equal(overlap(box,other),0,'Measured cards should not overlap when space is available');
    const content=await wins[i].webContents.executeJavaScript(`(()=>{const list=document.querySelector('.message-list'),input=document.querySelector('.composer'),r=input.getBoundingClientRect();return {scroll:list.scrollHeight-list.clientHeight,input:r.bottom<=innerHeight-5,horizontal:document.documentElement.scrollWidth-innerWidth};})()`);
    await review(wins[i],'annotation-sized-'+i);
    console.log('Card content fit',i,JSON.stringify(content));
    assert.ok(content.scroll<=3,'Initial prose should fit without a tiny scrolling text box');assert.ok(content.input);assert.ok(content.horizontal<=1);
  }
  assert.equal(await wins[2].webContents.executeJavaScript('document.querySelectorAll(".card-explanation ol li").length'),2);
  assert.ok(await wins[2].webContents.executeJavaScript('!!document.querySelector(".card-explanation .katex-display")&&!!document.querySelector(".card-explanation pre code")'));
  const targetBefore=structuredClone(mixed.annotations[0].target),mainBefore=structuredClone(mixed.main),mainBounds=panel.getBounds(),id=branches[0].id,win=wins[0];
  await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep this draft');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();})()`);
  const before=win.getBounds();win.setPosition(before.x+8,before.y+8);await delay(250);
  assert.deepEqual((await state(panel)).annotations[0].target,targetBefore);
  assert.equal(await effects.webContents.executeJavaScript(`document.querySelectorAll('[data-route-for="${branches[0].annotationId}"]').length`),0,'Moving a circle card must not introduce a connector');
  for(let i=0;i<5;i++)await withResponse({explanation:long.repeat(4),annotations:[],warnings:[]},()=>invoke(win,{type:'send',branchId:id,text:'Followup '+i}));
  await delay(700);mixed=await state(panel);
  assert.equal(mixed.branches[id].messages.length,10);assert.deepEqual(mixed.main,mainBefore);assert.deepEqual(panel.getBounds(),mainBounds);assert.deepEqual(mixed.annotations[0].target,targetBefore);
  assert.ok(win.getBounds().height>before.height+100);
  const scrolling=await win.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.message-list');list.scrollTop=0;list.dispatchEvent(new Event('scroll'));return {overflow:list.scrollHeight>list.clientHeight+100,draft:document.querySelector('textarea').value,input:document.querySelector('.composer').getBoundingClientRect().bottom<innerHeight};})()`);
  assert.ok(scrolling.overflow&&scrolling.input);assert.equal(scrolling.draft,'Keep this draft');
  await review(win,'annotation-growing-conversation');
  await invoke(win,{type:'minimizeBranch',branchId:id,minimized:true});await delay(450);assert.ok(win.getBounds().height<100);
  await invoke(win,{type:'minimizeBranch',branchId:id,minimized:false});await delay(450);
  await invoke(win,{type:'closeBranch',branchId:id});await invoke(overlay,{type:'openBranch',annotationId:branches[0].annotationId});await delay(450);
  assert.equal(await win.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep this draft');
  assert.equal((await state(panel)).branches[id].messages.length,10);
  assert.equal(await win.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop'),0,'Reopening keeps the reading position');
  const tall=await lesson([{id:'tall',kind:'arrow',concept:'Tall code explanation',explanation:'```text\n'+Array.from({length:48},(_,i)=>'Step '+(i+1)).join('\n')+'\n```',target}]);
  const tallBranch=Object.values(tall.branches)[0],tallWindow=getWindow(`branch:${tallBranch.id}`)!;
  assert.ok(tallBranch.expanded,'Oversized initial prose should use the expanded scrolling body');
  assert.ok(tallWindow.getBounds().height<=d.workArea.height);
  const tallContent=await tallWindow.webContents.executeJavaScript('(()=>{const list=document.querySelector(".message-list");return {top:list.scrollTop,overflow:list.scrollHeight>list.clientHeight,input:document.querySelector(".composer").getBoundingClientRect().bottom<innerHeight};})()');
  assert.equal(tallContent.top,0);assert.ok(tallContent.overflow&&tallContent.input);
  const pointerless=await lesson([{id:'unknown',kind:'arrow',concept:'Unlocated concept',explanation:'Useful text with no guessed pointer.',target:null}]);
  assert.ok(pointerless.annotations[0].pointerless);assert.equal(await effects.webContents.executeJavaScript('document.querySelectorAll(".marker,.explanation-leaders g").length'),0);
  console.log('ANNOTATION REVIEW PASS: native known-target pixels for all four marks, boundary-crossing leaders, measured unequal cards, paragraphs/lists/math/code, growing chat, stable targets/main, draft/history retention, collapse/restore and pointerless text. No paid calls.');
}
