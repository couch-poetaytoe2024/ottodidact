// Small opt-in Windows regression: generated content and loopback mock only.
import assert from 'node:assert/strict';
import type {BrowserWindow} from 'electron';
import {getWindow} from './windows';
import {composite} from './referenceReview';
import {overlap} from '../shared/presentation';
import type {Command,Session} from '../shared/milestone';
import type {TutorRequest} from '../shared/ai';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const state=(w:BrowserWindow):Promise<Session>=>w.webContents.executeJavaScript('window.ottodidact.getState()');
const invoke=(w:BrowserWindow,c:Command)=>w.webContents.executeJavaScript(`window.ottodidact.command(${JSON.stringify(c)})`);
export async function runMiniChatReview(fixture:BrowserWindow){
 const panel=getWindow('panel')!,otto=getWindow('companion')!,selection=getWindow('selection')!,overlay=getWindow('annotations')!;
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{
  const request=JSON.parse(String(init?.body)) as TutorRequest;calls++;
  const headers=new Headers(init?.headers);headers.set('Accept','application/json');
  const response=await original(input,{...init,headers}),body=await response.json();assert.equal(body.provider,'mock');
  body.result=request.kind==='explain'?{explanation:'DEMO: generated card layout fixture.',warnings:[],annotations:[0,1,2].map(i=>({id:'step'+i,kind:'arrow',concept:'Measured step '+(i+1),explanation:i?'DEMO: a focused explanation.':'DEMO: the original explanation stays with this conversation.',target:{x:.33+i*.08,y:.37,width:.02,height:.02}}))}:
   {explanation:'DEMO: this reply tests long local conversations.\n\n'+('A focused reason with readable text and an equation $x+2=5$.\n\n'.repeat(15)),annotations:[],warnings:[]};
  return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 };
 try{
  await invoke(otto,{type:'capture'});const snapshot=(await state(panel)).selectionSnapshot!;
  const focus={x:Math.round(snapshot.desktopRect.width*.28),y:190,width:480,height:330};
  await invoke(selection,{type:'select',selectionId:(await state(panel)).selectionId!,rect:focus});
  await invoke(panel,{type:'explain',question:'Explain these three marked steps'});await delay(600);
  const initial=await state(panel),ids=Object.keys(initial.branches),targets=structuredClone(initial.annotations.map(a=>a.target));
  const windows=ids.map(id=>getWindow(`branch:${id}`)!);
  const check=()=>{
   const main=panel.getBounds();assert.ok(main.x>=focus.x+focus.width||main.x+main.width<=focus.x);
   const rects=[main,...windows.filter(w=>w.isVisible()).map(w=>w.getBounds())];
   for(const rect of rects)assert.equal(overlap(rect,focus),0,'Use scrolling space outside the selected focus');
   for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)assert.equal(overlap(rects[i],rects[j]),0,'Measured panels must not collide');
  };
  check();
  for(let i=0;i<ids.length;i++){
   await invoke(overlay,{type:'openBranch',annotationId:initial.branches[ids[i]].annotationId});
   await invoke(windows[i],{type:'send',branchId:ids[i],text:'Why is this step valid?'});await delay(650);check();
  }
  const id=ids[0],win=windows[0];await invoke(overlay,{type:'openBranch',annotationId:initial.branches[id].annotationId});await delay(650);
  win.setPosition(panel.getBounds().x,panel.getBounds().y);await delay(650);check();
  await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep this local draft');input.dispatchEvent(new Event('input',{bubbles:true}));const list=document.querySelector('.message-list');list.scrollTop=40;list.dispatchEvent(new Event('scroll'));})()`);
  const scroll=await win.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop'),before=await state(panel),requests=calls;
  for(let i=0;i<2;i++){
   await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Collapse explanation card"]').click()`);await delay(400);check();
   assert.ok(win.getBounds().height<100);assert.equal((await state(panel)).branches[id].minimized,true);
   // Use the marker command path, not a new conversation or model call.
   await invoke(overlay,{type:'openBranch',annotationId:initial.branches[id].annotationId});await delay(650);check();
   assert.equal((await state(panel)).branches[id].minimized,false);
   assert.equal(await win.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep this local draft');
   assert.ok(Math.abs(await win.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop')-scroll)<2,'Restoring keeps the reading anchor');
  }
  const after=await state(panel);assert.equal(calls,requests);assert.deepEqual(after.main,before.main);
  for(const id of ids)assert.deepEqual(after.branches[id].messages,before.branches[id].messages);
  assert.deepEqual(after.annotations.map(a=>a.target),targets);
  await composite([fixture,overlay,getWindow('effects')!,...windows,panel,otto],'minichat-layout');
  console.log('MINICHAT REVIEW PASS: three long replies; reserved side chat; no panel collisions; repeated collapse/marker restore keeps drafts, scroll, histories and targets; four mock requests total, zero on restore.');
 }finally{globalThis.fetch=original;}
}
