// Only opt-in generated content, known feature bounds and local mock responses.
import assert from 'node:assert/strict';
import { app,nativeImage,screen,type BrowserWindow } from 'electron';
import path from 'node:path';
import { getWindow } from './windows';
import { composite } from './referenceReview';
import { annotationMarkings } from '../shared/annotationMapping';
import { markerBounds } from '../shared/presentation';
import { organizeAnnotations,emphasizedAnnotation } from '../shared/annotationOrganization';
import type { Command,Session } from '../shared/milestone';
import type { ModelAnnotation,TargetSource,TutorRequest } from '../shared/ai';
import type { Rect } from '../shared/types';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const state=(win:BrowserWindow):Promise<Session>=>win.webContents.executeJavaScript('window.ottodidact.getState()');
const invoke=(win:BrowserWindow,command:Command)=>win.webContents.executeJavaScript(`window.ottodidact.command(${JSON.stringify(command)})`);
export async function runPrecisionReview(fixture:BrowserWindow,review:(win:BrowserWindow,name:string)=>Promise<void>,organization=false){
 const panel=getWindow('panel')!,otto=getWindow('companion')!,selection=getWindow('selection')!,effects=getWindow('effects')!,overlay=getWindow('annotations')!;
 await fixture.webContents.executeJavaScript(`document.body.innerHTML='<svg id="focus" width="620" height="340" style="position:absolute;left:23vw;top:23vh;background:white" xmlns="http://www.w3.org/2000/svg"><g fill="#17202a" font-family="Georgia" font-size="32"><text x="45" y="70">x</text><text x="68" y="48" id="exponent" font-size="18">2</text><rect id="minus" x="100" y="55" width="17" height="3"/><text x="130" y="70">5x + 6 = 0</text><text id="word" x="45" y="135">discriminant</text><text id="group" x="45" y="210">(x \u2212 2)</text></g><path d="M350 300 Q460 20 570 300" fill="none" stroke="#17202a" stroke-width="2"/><circle id="vertex" cx="460" cy="160" r="4" fill="#17202a"/><text x="400" y="325" font-family="Georgia" font-size="18">graph vertex</text></svg>'`);
 const geometry=await fixture.webContents.executeJavaScript(`(()=>{const svg=document.querySelector('svg'),r=svg.getBoundingClientRect();const rect=id=>{const box=document.getElementById(id).getBBox();return {x:r.x+box.x,y:r.y+box.y,width:box.width,height:box.height};};return {focus:{x:r.x,y:r.y,width:r.width,height:r.height},features:['minus','exponent','word','group','vertex'].map(rect),width:innerWidth,height:innerHeight,wordAdvances:[document.getElementById('word').getSubStringLength(0,1),document.getElementById('word').getSubStringLength(1,1)]};})()`) as {focus:Rect;features:Rect[];width:number;height:number;wordAdvances:number[]};
 assert.notEqual(geometry.wordAdvances[0],geometry.wordAdvances[1],'The word fixture must have unequal character widths');
 await delay(200);await invoke(otto,{type:'capture'});
 await invoke(selection,{type:'select',selectionId:(await state(panel)).selectionId!,rect:geometry.focus});
 const original=globalThis.fetch;let request!:TutorRequest;
 globalThis.fetch=async(input,init)=>{
  request=JSON.parse(String(init?.body));const response=await original(input,init),body=await response.json();assert.equal(body.provider,'mock');
  const texts=['\u2212','2','discriminant','(x \u2212 2)',null],titles=['Minus sign','Exponent','Word span','Grouped factor','Graph vertex'];
  const kinds=['arrow','arrow','underline','rectangle','arrow'] as const;
  const annotations:ModelAnnotation[]=geometry.features.map((feature,i)=>{
   const full={x:feature.x/geometry.width,y:feature.y/geometry.height,width:feature.width/geometry.width,height:feature.height/geometry.height};
   const detail=i===4?request.image.detail:undefined,r=detail?.region;
   const target=r?{x:(full.x-r.x)/r.width,y:(full.y-r.y)/r.height,width:full.width/r.width,height:full.height/r.height}:full;
   const source:TargetSource={captureId:request.captureId,image:r?'detail':'full',feature:titles[i]+' at the known fixture location',expectedText:texts[i],observedText:texts[i],certainty:'located'};
   return {id:'feature-'+i,kind:kinds[i],concept:titles[i],explanation:i===3?'This expression is one factor. '.repeat(8):'DEMO: '+titles[i]+'. Known geometry, no image analysis.',target,source,relatedTargets:i===4?[{kind:'circle',target,source}]:[]};
  });
  if(organization)annotations.push({...annotations[2],id:'nearby-word',concept:'Word in context',explanation:'DEMO: a second discussion at the same word. Focus this card to reveal its own marker.'});
  body.result={explanation:'DEMO: distinct concepts with one redundant vertex marking supplied deliberately for suppression.',annotations,warnings:['Generated fixture only.']};
  return new Response(JSON.stringify(body),{status:response.status,headers:{'Content-Type':'application/json'}});
 };
 try{await invoke(panel,{type:'explain',question:'Explain the minus, exponent, word, grouped factor and actual vertex.'});}finally{globalThis.fetch=original;}
 await delay(700);const lesson=await state(panel);
 assert.ok(request.image.detail,'The detail must be generated from this saved snapshot');assert.equal(request.image.detail!.captureId,lesson.capture!.id);
 const conceptCount=organization?6:5;
 assert.equal(lesson.annotations.length,conceptCount);assert.equal(Object.keys(lesson.branches).length,conceptCount);
 const marks=annotationMarkings(lesson.annotations);assert.equal(marks.length,conceptCount+1);
 const planned=organizeAnnotations(lesson.annotations,lesson.branches,undefined,lesson.overlayMainBounds);
 assert.equal(planned.marks.filter(m=>m.visible).length,5,'Default shows five primary targets, not redundant forms or overlapping targets');
 const windows=Object.values(lesson.branches).map(b=>getWindow(`branch:${b.id}`)!);assert.ok(windows.every(win=>win.isVisible()));
 assert.ok(windows[3].getBounds().height>windows[0].getBounds().height,'Content-driven sizing must still work');
 for(let i=0;i<5;i++)for(const key of ['x','y','width','height'] as const)assert.ok(Math.abs(lesson.annotations[i].target![key]-geometry.features[i][key])<.01,'Feature '+i+' preserves '+key);
 // Wait for the effects renderer, not just main-process state. Cold native
 // renderer/compositor startup can outlast the window-placement completion.
 for(let i=0;i<60;i++){
  const ready=await effects.webContents.executeJavaScript(`document.querySelectorAll('[data-marking-id][data-visible="true"]').length===5 && !!document.querySelector('.screen-dimming')`);
  if(ready)break;
  if(i===59)throw new Error('Effects renderer did not present the known target markings');
  await delay(50);
 }
 await review(effects,'precision-effects');
 await composite([fixture,overlay,effects,...windows,panel,otto],'precision-desktop');
 const frame=nativeImage.createFromPath(path.join(app.getAppPath(),'.ui-review/precision-desktop.png')),size=frame.getSize(),pixels=frame.toBitmap(),sx=size.width/geometry.width,sy=size.height/geometry.height;
 const points=lesson.annotations.slice(0,5).map(mark=>{
  if(mark.kind==='arrow'){
   const tip=planned.marks.find(m=>m.marker.id===mark.id)!.route!.points.at(-1)!,t=mark.target!;
   assert.ok(!(tip.x>t.x&&tip.x<t.x+t.width&&tip.y>t.y&&tip.y<t.y+t.height),'Tip must not obscure the feature');return tip;
  }
  const b=markerBounds(mark);return mark.kind==='underline'?{x:b.x+b.width/2,y:b.y+b.height}:{x:b.x,y:b.y+b.height/2};
 });
 const counts=points.map(point=>{
  let count=0;const x=Math.round(point.x*sx),y=Math.round(point.y*sy);
  for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){const index=((y+dy)*size.width+x+dx)*4,[b,g,r]=pixels.subarray(index,index+3);if(Math.max(r,g,b)-Math.min(r,g,b)>70)count++;}
  assert.ok(count>3,'Known feature must have a colored marking in the native desktop frame');return count;
 });
 const last=lesson.annotations[4],branch=Object.values(lesson.branches).find(b=>b.annotationId===last.id)!,chat=getWindow(`branch:${branch.id}`)!;
 const targetBefore=structuredClone(last.target),bounds=chat.getBounds();chat.setPosition(bounds.x+6,bounds.y+6);await delay(200);
 assert.deepEqual((await state(panel)).annotations[4].target,targetBefore);
 await invoke(chat,{type:'closeBranch',branchId:branch.id});
 await overlay.webContents.executeJavaScript(`document.querySelector('[data-marking-id="${last.id}"]').click()`);
 assert.equal((await state(panel)).activeBranch,branch.id);assert.equal(Object.keys((await state(panel)).branches).length,conceptCount);
 await review(windows[3],'precision-long-card');
 if(organization){
   const duplicate=lesson.annotations[5],duplicateBranch=Object.values(lesson.branches).find(b=>b.annotationId===duplicate.id)!,win=getWindow(`branch:${duplicateBranch.id}`)!;
   const targetBefore=structuredClone(lesson.annotations.map(a=>a.target)),mainBefore=structuredClone(lesson.main);
   win.focus();await delay(100);
   await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep this draft');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();})()`);
   await delay(200);assert.equal(emphasizedAnnotation(await state(panel)),duplicate.id,'Keyboard focus must emphasize this card across native windows');
   const focus=await effects.webContents.executeJavaScript(`(()=>{const target=document.querySelector('[data-marking-id="${duplicate.id}"]'),other=document.querySelector('[data-marking-id="${lesson.annotations[2].id}"]'),unrelated=document.querySelector('[data-marking-id="${last.id}"]');return {visible:target.dataset.visible,other:other.dataset.visible,softened:Number(getComputedStyle(unrelated).opacity),lines:document.querySelectorAll('[data-route-for]').length};})()`);
   assert.equal(focus.visible,'true');assert.equal(focus.other,'false');assert.ok(focus.softened<.3);assert.ok(focus.lines<=3,'Only the three arrow concepts can have arrow leaders');
   await composite([fixture,overlay,effects,...windows,panel,otto],'organization-focused');
   await invoke(win,{type:'send',branchId:duplicateBranch.id,text:'A local mocked followup'});
   await delay(350);
   await invoke(win,{type:'minimizeBranch',branchId:duplicateBranch.id,minimized:true});await delay(200);
   await invoke(win,{type:'minimizeBranch',branchId:duplicateBranch.id,minimized:false});await delay(200);
   await invoke(win,{type:'closeBranch',branchId:duplicateBranch.id});await invoke(overlay,{type:'openBranch',annotationId:duplicate.id});await delay(200);
   assert.equal(await win.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep this draft');
   const after=await state(panel);assert.equal(after.branches[duplicateBranch.id].messages.length,2);assert.deepEqual(after.main,mainBefore);assert.deepEqual(after.annotations.map(a=>a.target),targetBefore);
   // Real DOM pointer entry/exit exercises the transient IPC path; an old exit
   // cannot erase focus held in the other card window.
   await windows[0].webContents.executeJavaScript(`document.querySelector('main').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
   await delay(150);assert.equal(emphasizedAnnotation(await state(panel)),lesson.annotations[0].id);
   await windows[0].webContents.executeJavaScript(`document.querySelector('main').dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}))`);
   await delay(150);assert.equal(emphasizedAnnotation(await state(panel)),duplicate.id);
   console.log('ORGANIZATION REVIEW PASS: six cards/five default target markings; redundant circle suppressed; overlapping word revealed on keyboard focus; unrelated markings softened; native hover, draft/history, minimize/reopen and exact targets preserved.');
 }
 console.log('PRECISION REVIEW PASS:',JSON.stringify({display:screen.getPrimaryDisplay().scaleFactor,concepts:conceptCount,visibleMarkings:5,targetPixels:counts,detailPixels:[request.image.detail!.pixelWidth,request.image.detail!.pixelHeight]}),'Known minus, exponent, unequal-width word, factor and actual vertex; content-sized cards and same-chat reopening. No paid requests.');
}
