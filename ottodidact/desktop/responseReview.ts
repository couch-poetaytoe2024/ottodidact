// Opt-in native review; the existing isolated mock backend is the only HTTP peer.
import assert from 'node:assert/strict';
import {screen,type BrowserWindow} from 'electron';
import {getWindow} from './windows';
import {composite} from './referenceReview';
import type {Command,Session} from '../shared/milestone';
import type {TutorRequest} from '../shared/ai';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const state=(win:BrowserWindow):Promise<Session>=>win.webContents.executeJavaScript('window.ottodidact.getState()');
const invoke=(win:BrowserWindow,command:Command)=>win.webContents.executeJavaScript(`window.ottodidact.command(${JSON.stringify(command)})`);
/** Hold completion after real HTTP progress so visible text cannot be mistaken
 * for a completed/validated lesson. Generated backdrop and mock backend only. */
export async function runInitialResponseReview(_fixture:BrowserWindow,review:(win:BrowserWindow,name:string)=>Promise<void>){
 const panel=getWindow('panel')!,otto=getWindow('companion')!,selection=getWindow('selection')!,originalFetch=globalThis.fetch;
 const d=screen.getPrimaryDisplay(),focus={x:d.size.width*.2,y:d.size.height*.2,width:d.size.width*.35,height:d.size.height*.35};
 const text='**DEMO: answer text arrives first.**\n\n'+Array.from({length:8},(_,i)=>`${i+1}. A generated explanation can be read while annotation coordinates finish.`).join('\n');
 let release=()=>{},failure=false,calls=0;
 const until=async(check:()=>Promise<boolean>)=>{for(let i=0;i<120;i++){if(await check())return;await delay(50);}throw new Error('Initial response review timed out');};
 globalThis.fetch=async(input,init)=>{
  if(!String(input).endsWith('/api/tutor'))return originalFetch(input,init);
  calls++;assert.equal(new Headers(init?.headers).get('Accept'),'text/event-stream');
  const r=JSON.parse(String(init?.body)) as TutorRequest;assert.equal(r.kind,'explain');
  const headers=new Headers(init?.headers);headers.set('Accept','application/json');
  const response=await originalFetch(input,{...init,headers}),body=await response.json();assert.equal(body.provider,'mock');
  body.result.explanation=text;
  const encode=(v:unknown)=>new TextEncoder().encode('data: '+JSON.stringify(v)+'\n\n');let cancelled=false;
  return new Response(new ReadableStream<Uint8Array>({start(controller){
   controller.enqueue(encode({type:'progress',requestId:r.requestId,sessionId:r.sessionId,conversationId:r.conversationId,text}));
   release=()=>{if(cancelled)return;controller.enqueue(encode(failure?{type:'error',error:'Synthetic interruption; question retained.'}:{type:'complete',response:body}));controller.close();};
  },cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
 };
 try{
  for(const outcome of ['success','failure','cancel'] as const){
   failure=outcome==='failure';await invoke(otto,{type:'capture'});await invoke(selection,{type:'select',selectionId:(await state(panel)).selectionId!,rect:focus});
   const started=performance.now(),beforeCalls=calls;
   await panel.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.question-input-panel textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep my screenshot question');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await panel.webContents.executeJavaScript(`document.querySelector('.question-input-panel form').requestSubmit()`);
   await until(()=>panel.webContents.executeJavaScript(`!!document.querySelector('.main-panel .reply-preview strong')`));
   const previewMs=performance.now()-started;
   const partial=await state(panel);assert.equal(partial.phase,'loading');assert.equal(partial.panelView,'main');assert.equal(partial.main.messages.length,0);assert.equal(partial.annotations.length,0);assert.equal(Object.keys(partial.branches).length,0);
   assert.equal(calls,beforeCalls+1);
   await panel.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.main-panel .message-list');list.dataset.retained='yes';list.scrollTop=0;list.dispatchEvent(new Event('scroll'));})()`);
   if(outcome==='success'){
    await review(panel,'initial-answer-streaming');
    console.log('INITIAL MOCK PREVIEW:',Math.round(previewMs),'ms before completion was released');
   }
   if(outcome==='cancel')await invoke(panel,{type:'cancel'});
   release();
   await until(async()=>!(await state(panel)).pending);
   if(outcome==='success'){
    await until(async()=>Object.keys((await state(panel)).branches).length>0);
    assert.equal((await state(panel)).main.messages.at(-1)?.content,text);
    assert.equal(await panel.webContents.executeJavaScript(`document.querySelector('.main-panel .message-list').dataset.retained`),'yes');
    assert.equal(await panel.webContents.executeJavaScript(`document.querySelector('.main-panel .message-list').scrollTop`),0);
    await review(panel,'initial-answer-complete');
   }else{
    const after=await state(panel);assert.equal(after.phase,'question');assert.equal(after.panelView,undefined);assert.equal(after.main.messages.length,0);assert.equal(after.annotations.length,0);
    assert.equal(await panel.webContents.executeJavaScript(`document.querySelector('.question-input-panel textarea').value`),'Keep my screenshot question');
    assert.equal(await panel.webContents.executeJavaScript(`!!document.querySelector('.reply-preview')`),false);
   }
  }
  console.log('INITIAL RESPONSE REVIEW PASS: text visible before completion; no early markers/cards; one request per submit; reading position retained; interruption/cancel restore draft. Mock timings only.');
 }finally{globalThis.fetch=originalFetch;}
}
export async function runResponseReview(fixture:BrowserWindow,review:(win:BrowserWindow,name:string)=>Promise<void>){
 const panel=getWindow('panel')!,originalFetch=globalThis.fetch;
 const initial=await state(panel),branch=Object.values(initial.branches)[0],chat=getWindow(`branch:${branch.id}`)!;
 const targets=structuredClone(initial.annotations.map(a=>a.target));
 const long='**DEMO: a structured main answer**\n\nThis generated response checks formatting and scrolling, not model knowledge.\n\n## Operations and reasons\n\n| Operation | Why it is valid |\n| --- | --- |\n| Subtract $2$ | The same change on both sides preserves equality. |\n| Substitute $x=3$ | Check the original equation. |\n\n1. Start from $x+2=5$.\n2. Subtract 2 from both sides.\n3. Check $x=3$.\n\n- Preserve equality.\n- Keep the original task in view.\n\n```python\nx = 5 - 2\n```\n\n'+('A longer requested explanation remains complete and readable.\n\n'.repeat(8));
 const short='DEMO: Subtracting the same amount on both sides preserves equality. $x=5-2=3$.';
 let full=long,fail=false,release!:()=>void;
 globalThis.fetch=async(input,init)=>{
  const r=JSON.parse(String(init?.body)) as TutorRequest;
  assert.equal(r.kind,'chat');assert.equal(r.originalQuestion,initial.question);assert.equal(r.originalExplanation,initial.explanation);assert.equal(r.image.captureId,initial.capture!.id);assert.equal(r.image.detail,undefined);
  const headers=new Headers(init?.headers);headers.set('Accept','application/json');
  const response=await originalFetch(input,{...init,headers}),body=await response.json();assert.equal(body.provider,'mock');
  body.result={explanation:full,annotations:[],warnings:['Synthetic streaming test only.']};
  const encode=(value:unknown)=>new TextEncoder().encode('data: '+JSON.stringify(value)+'\n\n');
  return new Response(new ReadableStream<Uint8Array>({start(controller){
    controller.enqueue(encode({type:'progress',requestId:r.requestId,sessionId:r.sessionId,conversationId:r.conversationId,text:full}));
    release=()=>{controller.enqueue(encode(fail?{type:'error',error:'Synthetic interrupted reply. Draft preserved.'}:{type:'complete',response:body}));controller.close();};
  }}),{headers:{'Content-Type':'text/event-stream'}});
 };
 async function pending(win:BrowserWindow){
  for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript('!!document.querySelector(".reply-preview")'))return;await delay(25);}
  throw new Error('Native streaming preview did not appear');
 }
 try{
  await panel.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep main draft');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const started=performance.now(),running=invoke(panel,{type:'send',text:'Show a detailed structured answer'});
  await pending(panel);const previewMs=performance.now()-started;
  const provisional=await state(panel);assert.equal(provisional.main.messages.length,initial.main.messages.length);assert.deepEqual(provisional.annotations.map(a=>a.target),targets);
  const format=await panel.webContents.executeJavaScript(`(()=>{const p=document.querySelector('.reply-preview');return {bold:!!p.querySelector('strong'),heading:p.querySelector('h2')?.textContent,cells:p.querySelectorAll('td').length,steps:p.querySelector('ol')?.children.length??0,bullets:p.querySelector('ul')?.children.length??0,math:!!p.querySelector('.katex'),code:!!p.querySelector('pre code')};})()`);
  assert.deepEqual(format,{bold:true,heading:'Operations and reasons',cells:4,steps:3,bullets:2,math:true,code:true});
  release();await running;await delay(200);
  assert.equal((await state(panel)).main.messages.at(-1)!.content,long);
  await panel.webContents.executeJavaScript(`document.querySelector('.message-assistant h2').scrollIntoView({block:'start'})`);
  await review(panel,'response-main-formatted');
  // Scroll-back remains anchored while a second reply is previewed and committed.
  await panel.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.message-list');list.scrollTop=0;list.dispatchEvent(new Event('scroll'));})()`);
  const next=invoke(panel,{type:'send',text:'Briefly connect that reasoning'});await pending(panel);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop'),0);
  release();await next;await delay(150);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".message-list").scrollTop'),0);
  full=short;const before=await state(panel),local=invoke(chat,{type:'send',branchId:branch.id,text:'Why subtract here?'});
  await pending(chat);assert.equal((await state(panel)).branches[branch.id].messages.length,before.branches[branch.id].messages.length);
  await review(chat,'response-box-progress');release();await local;await delay(250);
  assert.equal((await state(panel)).branches[branch.id].messages.at(-1)!.content,short);
  assert.equal(await chat.webContents.executeJavaScript('!!document.querySelector(".message-assistant .katex")'),true);
  await review(chat,'response-box-complete');
  fail=true;const beforeFailure=await state(panel),failed=invoke(panel,{type:'send',text:'Interrupted synthetic request'});void failed.catch(()=>{});
  await pending(panel);release();await assert.rejects(failed,/Synthetic interrupted/);await delay(150);
  const after=await state(panel);assert.deepEqual(after.main,beforeFailure.main);assert.deepEqual(after.annotations.map(a=>a.target),targets);
  assert.equal(await panel.webContents.executeJavaScript('!!document.querySelector(".reply-preview")'),false);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector("textarea").value'),'Keep main draft');
  await composite([fixture,getWindow('annotations')!,getWindow('effects')!,...Object.values(after.branches).filter(b=>b.open).map(b=>getWindow(`branch:${b.id}`)!),panel,getWindow('companion')!],'response-natural-routes');
  console.log('RESPONSE REVIEW PASS:',JSON.stringify({mockPreviewMs:previewMs,mainChars:long.length,boxChars:short.length}),'Native progressive formatted text before commit, concise local reply, preserved reading position/drafts/history/targets and interrupted stream cleanup. Synthetic timing is not live model latency.');
 }finally{globalThis.fetch=originalFetch;}
}
