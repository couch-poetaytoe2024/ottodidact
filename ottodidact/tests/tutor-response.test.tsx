import {afterEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {responsePolicy} from '../server/ai/responsePolicy';
import {CORE_INSTRUCTIONS,TUTOR_INSTRUCTIONS,CHAT_JSON_SCHEMA,TUTOR_JSON_SCHEMA} from '../server/ai/prompts';
import {buildTutorContext} from '../server/ai/context';
import {createProvider} from '../server/ai/client';
import {createApp} from '../server/app';
import {readConfig} from '../server/config';
import {requestTutor} from '../desktop/backend';
import {TutorCoordinator,buildTutorRequest} from '../desktop/tutor';
import {capturedSession,openBranch} from '../shared/session';
import {explanationPreview,readEvents} from '../shared/stream';
import {MathText} from '../src/components/MathText';
import {MessageList} from '../src/features/chat/MessageList';
import type {TutorRequest,TutorResponse,ImageContext} from '../shared/ai';
import type {Session} from '../shared/milestone';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5qkAAAAASUVORK5CYII=';
const image:ImageContext={captureId:'capture',dataUrl:png,pixelWidth:1,pixelHeight:1,originalPixelWidth:1,originalPixelHeight:1,cropOffset:{x:0,y:0},displayScale:1,desktopRect:{x:0,y:0,width:1000,height:700},selection:{x:.1,y:.1,width:.6,height:.6}};
const annotation={id:'sign',kind:'arrow' as const,concept:'Subtracting the term',explanation:'Subtract 2 to isolate x.',target:{x:.3,y:.3,width:.02,height:.02}};
const req=(patch:Partial<TutorRequest>={}):TutorRequest=>({requestId:'request',sessionId:'lesson',captureId:'capture',conversationId:'main',kind:'chat',mode:'explain',question:'Why subtract here?',originalQuestion:'Solve x + 2 = 5',originalExplanation:'Subtract 2, so x = 3.',annotation:null,history:[],image,...patch});
const answer={explanation:'Subtracting 2 from both sides preserves equality: $x=5-2=3$.',annotations:[],warnings:[]};
const config=readConfig({AI_PROVIDER:'openai',OPENAI_API_KEY:'test-placeholder-only',OPENAI_MODEL:'keep-configured-model'});
const body=(result=answer)=>({model:config.model,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}],usage:{input_tokens:123,output_tokens:45}});
const wire=(value:unknown)=>'data: '+JSON.stringify(value)+'\n\n';
function streamed(events:unknown[],chunkSize=17){
 const bytes=new TextEncoder().encode(events.map(wire).join(''));let offset=0;
 return new Response(new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+chunkSize));offset+=chunkSize;}}),{headers:{'Content-Type':'text/event-stream'}});
}
const initial=():Session=>capturedSession({id:image.captureId,dataUrl:png,rect:image.desktopRect,pixelWidth:1,pixelHeight:1,scaleFactor:1,image});
const response=(r:TutorRequest):TutorResponse=>({requestId:r.requestId,sessionId:r.sessionId,captureId:r.captureId,conversationId:r.conversationId,provider:'mock',model:'offline',result:answer});
const servers:Server[]=[];
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})));});

describe('task-aware response styles',()=>{
 it.each([
  ['Explain this symbol','explain','structured-main'],['Solve for x','solve','structured-main'],['Just the answer','answer-only','brief'],['Give a hint','hint','structured-main'],['Explain in detail','explain','detailed'],
 ] as const)('interprets %s without a classification request',(question,intent,style)=>{
  expect(responsePolicy(req({kind:'explain',question}),1800)).toMatchObject({lessonIntent:intent,currentIntent:intent,style});
 });
 it('keeps the original solve task during a concise local why followup',()=>{
  const local=req({annotation});
  expect(responsePolicy(local,1800)).toMatchObject({lessonIntent:'solve',currentIntent:'explain',style:'focused-local',maxOutputTokens:1800});
  expect(buildTutorContext(local,24000)).toContain('Solve x + 2 = 5');
  expect(buildTutorContext(local,24000)).toContain('Subtracting the term');
  expect(responsePolicy({...local,question:'Derive this in detail'},1800).maxOutputTokens).toBe(1800);
  expect(responsePolicy({...local,question:'Briefly explain this'},1800)).toMatchObject({style:'brief',maxOutputTokens:1800});
  expect(responsePolicy({...local,question:'Just the answer'},1800)).toMatchObject({style:'brief',boxPolicy:'none',maxOutputTokens:1800});
  expect(responsePolicy({...local,kind:'explain',question:'Just the answer'},512)).toMatchObject({style:'brief',boxPolicy:'none',maxOutputTokens:512});
  expect(responsePolicy(local,512).maxOutputTokens).toBe(512);
  expect(responsePolicy(req(),1800).maxOutputTokens).toBe(1800);
  expect(responsePolicy(req({kind:'explain',question:'Explain',mode:'hint'}),1800).currentIntent).toBe('explain');
 });
 it('uses task relevance, full main reasoning, compact box instructions and one-marker defaults',()=>{
  for(const phrase of ['there is no sentence limit','originalQuestion','just-the-answer','major operations','WHY they matter','**bold**'])expect(CORE_INSTRUCTIONS).toContain(phrase);
  expect(TUTOR_INSTRUCTIONS).not.toContain('1-3');
  expect(TUTOR_INSTRUCTIONS).toContain('ONE primary marking');expect(TUTOR_INSTRUCTIONS).toContain('Generate it directly');
 });
 it('sends smaller followup instructions/schema/budget in exactly one call and never clips replies',async()=>{
  const long={...answer,explanation:'A deliberately long requested explanation. '.repeat(40)+'\n\n$$x=5-2=3$$'};
  const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify(body(long))));
  const provider=createProvider(config,fetcher),local=req({annotation});
  const result=await provider(local,new AbortController().signal);const payload=JSON.parse(fetcher.mock.calls[0][1].body);
  expect(payload.model).toBe(config.model);expect(payload.max_output_tokens).toBe(config.maxOutputTokens);expect(payload.text.format.schema).toEqual(CHAT_JSON_SCHEMA);
  expect(result.result.explanation).toBe(long.explanation);expect(fetcher).toHaveBeenCalledTimes(1);expect(payload.input[0].content.filter((p:{type:string})=>p.type==='input_image')).toHaveLength(1);
  expect(payload.instructions.length).toBeLessThan(TUTOR_INSTRUCTIONS.length);expect(JSON.stringify(CHAT_JSON_SCHEMA).length).toBeLessThan(JSON.stringify(TUTOR_JSON_SCHEMA).length/2);
  console.log('OFFLINE PAYLOAD COMPARISON',JSON.stringify({initialInstructions:TUTOR_INSTRUCTIONS.length,followupInstructions:payload.instructions.length,initialSchema:JSON.stringify(TUTOR_JSON_SCHEMA).length,followupSchema:JSON.stringify(CHAT_JSON_SCHEMA).length,defaultInitialBudget:1800,defaultBoxBudget:payload.max_output_tokens}));
 });
 it('renders structured main text and compact equations safely, including math inside bold',()=>{
  const html=renderToStaticMarkup(<MathText text={'**Result: $x=3$**\n\nSubtract the same amount on both sides.\n\n1. Start with $x+2=5$.\n2. Subtract 2.\n\n- Check the result.\n\n```js\nconst x = 3;\n```\n\n<script>alert(1)</script>'}/>);
  for(const tag of ['<strong>','<p>','<ol','<ul>','<pre>','katex'])expect(html).toContain(tag);
  expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
  const preview=renderToStaticMarkup(<MessageList messages={[]} pendingText={'**Partial** $x='}/>);expect(preview).toContain('Reply in progress');expect(preview).toContain('Partial');
 });
});

describe('progress without premature commits',()=>{
 it('decodes partial JSON escapes without leaking annotations or broken surrogate pairs',()=>{
  const json=JSON.stringify({explanation:'A "sign", $x^2$, and \uD83D\uDE00.\nNext step.',annotations:[annotation]});
  for(let i=0;i<=json.length;i++){const preview=explanationPreview(json.slice(0,i));expect(JSON.parse(json).explanation.startsWith(preview)).toBe(true);expect(preview).not.toContain('annotations');}
  expect(explanationPreview('{"explanation":"\\uD83D')).toBe('');
  expect(explanationPreview('{"explanation":"\\uD83D\\uDE00')).toBe('\uD83D\uDE00');
 });
 it.each(['chat','explain'] as const)('streams readable %s text before validating the completed response',async kind=>{
  const json=JSON.stringify(answer),progress=vi.fn();
  const fetcher=vi.fn().mockResolvedValue(streamed([{type:'response.output_text.delta',delta:json.slice(0,40)},{type:'response.output_text.delta',delta:json.slice(40)},{type:'response.completed',response:body()}]));
  const result=await createProvider(config,fetcher)(req({kind,annotation:kind==='chat'?annotation:null}),new AbortController().signal,progress);
  expect(progress).toHaveBeenCalled();expect(result.result).toEqual(answer);expect(result.usage?.inputTokens).toBe(123);expect(result.timings?.firstTextMs).toBeGreaterThanOrEqual(0);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).stream).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each(['missing','invalid','incomplete','refusal'] as const)('rejects %s final output after a preview without retrying',async failure=>{
  const final=body();if(failure==='incomplete')final.status='incomplete';
  if(failure==='invalid')final.output[0].content[0].text=JSON.stringify({...answer,annotations:[annotation]});
  if(failure==='refusal')final.output[0].content[0].type='refusal';
  const events=[{type:'response.output_text.delta',delta:'{"explanation":"Preview'}];
  const fetcher=vi.fn().mockResolvedValue(streamed([...events,...(failure==='missing'?[]:[{type:failure==='incomplete'?'response.incomplete':'response.completed',response:final}])]));
  await expect(createProvider(config,fetcher)(req(),new AbortController().signal,vi.fn())).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('aborts a stalled stream and rejects truncated framing',async()=>{
  const controller=new AbortController(),cancel=vi.fn();const stream=new ReadableStream<Uint8Array>({cancel});
  const running=readEvents(stream,controller.signal,vi.fn());controller.abort();await expect(running).rejects.toThrow('cancelled');expect(cancel).toHaveBeenCalled();
  const broken=new Response('data: {"partial":true}').body!;await expect(readEvents(broken,new AbortController().signal,vi.fn())).rejects.toThrow('mid-event');
 });
 it.each(['chat','explain'] as const)('does not commit %s previews and discards updates after cancellation',async kind=>{
  let state=(kind==='chat'?{...initial(),phase:'explained' as const,explanation:'Original'}:initial()) as Session,emit!:(text:string)=>void,finish!:(value:TutorResponse)=>void,sent!:TutorRequest;
  const preview=vi.fn(),request=vi.fn((r:TutorRequest,_s:AbortSignal,p?:(text:string)=>void)=>{sent=r;emit=p!;return new Promise<TutorResponse>(resolve=>finish=resolve);});
  const tutor=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1000,height:700}),request,undefined,{progress:preview});
  const running=tutor.run(kind==='chat'?{type:'send',text:'Why?'}:{type:'explain',question:'Why?'});emit('Partial answer');expect(preview).toHaveBeenCalledTimes(1);expect(state.main.messages).toHaveLength(0);expect(state.annotations).toHaveLength(0);
  if(kind==='explain')expect(state).toMatchObject({phase:'loading',panelView:'main',question:'Why?'});
  tutor.cancel();emit('Late answer');finish(response(sent));expect(await running).toBe(false);expect(preview).toHaveBeenCalledTimes(1);expect(state.main.messages).toHaveLength(0);expect(state.retry).toBeDefined();
  if(kind==='explain'){expect(state.phase).toBe('question');expect(state.panelView).toBeUndefined();}
 });
 it('keeps initial markings uncommitted until valid completion and returns to the draft on invalid geometry',async()=>{
  let state=initial(),finish!:(value:TutorResponse)=>void,sent!:TutorRequest;
  const preview=vi.fn();
  const tutor=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1000,height:700}),(r,_s,p)=>{
    sent=r;p?.('Readable preliminary answer');return new Promise(resolve=>finish=resolve);
  },undefined,{progress:preview});
  const running=tutor.run({type:'explain',question:'Explain my screenshot'});
  expect(preview).toHaveBeenCalledTimes(1);expect(state.main.messages).toHaveLength(0);expect(state.annotations).toHaveLength(0);
  finish({...response(sent),result:{...answer,annotations:[{...annotation,target:{...annotation.target,x:2}}]}});
  await expect(running).rejects.toThrow();expect(state.phase).toBe('question');expect(state.panelView).toBeUndefined();
  expect(state.question).toBe('Explain my screenshot');expect(state.annotations).toEqual([]);expect(state.main.messages).toEqual([]);
 });
 it('reuses prepared detail after a failed request and does not repeat the original answer in own history',async()=>{
  let state=initial(),calls=0;
  const prepare=vi.fn(async(image:ImageContext)=>({...image,detail:{captureId:image.captureId,dataUrl:png,pixelWidth:1,pixelHeight:1,region:image.selection}}));
  const tutor=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1000,height:700}),async r=>{if(++calls===1)throw new Error('Offline failure');return response(r);},prepare);
  await expect(tutor.run({type:'explain',question:'Solve this'})).rejects.toThrow('Offline failure');
  await tutor.run(state.retry!);expect(prepare).toHaveBeenCalledTimes(1);expect(calls).toBe(2);
  const followup=buildTutorRequest(state,{type:'send',text:'Why?'},'followup');expect(followup.history).toEqual([]);expect(followup.originalQuestion).toBe('Solve this');expect(followup.originalExplanation).toBe(answer.explanation);expect(followup.image.detail).toBeUndefined();
 });
 it.each(['chat','explain'] as const)('carries %s progress across local HTTP before completion without logging content',async kind=>{
  const logs=vi.fn();let release!:()=>void;
  const pause=new Promise<void>(resolve=>release=resolve);
  const server=createApp({config,logger:logs,provider:async(_r,_s,progress)=>{progress?.('Visible before completion');await pause;return {result:answer};}}).listen(0,'127.0.0.1');servers.push(server);
  await new Promise<void>(resolve=>server.once('listening',resolve));vi.stubEnv('OTTODIDACT_BACKEND_URL','http://127.0.0.1:'+(server.address() as AddressInfo).port);
  let first!:()=>void;const ready=new Promise<void>(resolve=>first=resolve),previews:string[]=[];
  const running=requestTutor(req({kind}),new AbortController().signal,text=>{previews.push(text);first();});
  await ready;expect(previews).toEqual(['Visible before completion']);release();expect((await running).result).toEqual(answer);
  const logged=JSON.stringify(logs.mock.calls);expect(logged).toContain('imageValidationMs');expect(logged).not.toContain('Visible before completion');expect(logged).not.toContain(png);expect(logged).not.toContain(config.apiKey);
 });
});
