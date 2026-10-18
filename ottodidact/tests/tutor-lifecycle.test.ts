import { describe, it, expect, vi, afterEach } from 'vitest';
import { TutorCoordinator, buildTutorRequest } from '../desktop/tutor';
import { requestTutor } from '../desktop/backend';
import { capturedSession, openBranch, sendMessage } from '../shared/session';
import { mapAnnotations } from '../shared/annotationMapping';
import type { ImageContext, TutorRequest, TutorResponse } from '../shared/ai';
import type { Session } from '../shared/milestone';

const image:ImageContext={captureId:'capture-a',dataUrl:'data:image/png;base64,AAAA',pixelWidth:600,pixelHeight:400,originalPixelWidth:900,originalPixelHeight:600,cropOffset:{x:150,y:150},displayScale:1.5,desktopRect:{x:100,y:100,width:600,height:400},selection:{x:0,y:0,width:1,height:1}};
function initial():Session{return capturedSession({id:image.captureId,dataUrl:image.dataUrl,rect:image.desktopRect,pixelWidth:600,pixelHeight:400,scaleFactor:1.5,image});}
function result(r:TutorRequest):TutorResponse{return {requestId:r.requestId,sessionId:r.sessionId,captureId:r.captureId,conversationId:r.conversationId,provider:'mock',model:'test',result:{explanation:'A validated answer',annotations:[{id:'equation',kind:'circle',concept:'equation',explanation:'Original detail',target:{x:.2,y:.2,width:.3,height:.2}}],warnings:[]}};}
function deferred<T>(){let resolve!:(v:T)=>void;let reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
describe('request lifecycle and branch capture binding',()=>{
  it.each(['mock','openai'] as const)('ignores a cancelled %s response, preserves the question and permits retry',async provider=>{
    let state=initial();const wait=deferred<TutorResponse>();let sent!:TutorRequest;let signal!:AbortSignal;
    const coordinator=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1920,height:1080}),(r,s)=>{sent=r;signal=s;return wait.promise;});
    const running=coordinator.run({type:'explain',question:'Why?'});
    coordinator.cancel();expect(signal.aborted).toBe(true);expect(state.retry?.type).toBe('explain');
    wait.resolve({...result(sent),provider});expect(await running).toBe(false);expect(state.annotations).toEqual([]);expect(state.main.messages).toEqual([]);expect(state.phase).toBe('question');
  });
  it.each(['mock','openai'] as const)('ignores a %s response after the session has been replaced',async provider=>{
    let state=initial();const wait=deferred<TutorResponse>();let sent!:TutorRequest;
    const coordinator=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1920,height:1080}),r=>{sent=r;return wait.promise;});
    const running=coordinator.run({type:'explain',question:'Old capture'});
    state={...initial(),id:'new-session'};
    wait.resolve({...result(sent),provider});expect(await running).toBe(false);expect(state.id).toBe('new-session');expect(state.explanation).toBe('');
  });
  it('rejects duplicate submissions while a request is in flight',async()=>{
    let state=initial();const wait=deferred<TutorResponse>();let calls=0;
    const coordinator=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1920,height:1080}),()=>{calls++;return wait.promise;});
    const running=coordinator.run({type:'explain',question:'One'});
    await expect(coordinator.run({type:'explain',question:'Two'})).rejects.toThrow('already running');
    expect(calls).toBe(1);coordinator.cancel();wait.reject(new Error('Aborted'));await running;
  });
  it('never substitutes a demo answer after backend failure; a retry adds only one turn',async()=>{
    let state=initial();let fail=true;
    const coordinator=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1920,height:1080}),async r=>{if(fail)throw new Error('Provider unavailable');return result(r);});
    await expect(coordinator.run({type:'explain',question:'Question'})).rejects.toThrow('Provider unavailable');
    expect(state.main.messages).toEqual([]);expect(state.pending).toBeUndefined();expect(state.retry).toBeDefined();
    fail=false;await coordinator.run(state.retry!);expect(state.main.messages).toHaveLength(2);expect(state.retry).toBeUndefined();
  });
  it('rejects response identifiers for a different capture before applying text',async()=>{
    let state=initial();
    const coordinator=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1920,height:1080}),async r=>({...result(r),captureId:'other'}));
    await expect(coordinator.run({type:'explain',question:'Question'})).rejects.toThrow('different capture');expect(state.explanation).toBe('');
  });
  it('keeps active branch history separate and bound to its original image',()=>{
    const original=initial();const answer=result(buildTutorRequest(original,{type:'explain',question:'Original'},'req'));
    let state:Session={...original,question:'Original',explanation:'Original explanation',phase:'explained',annotations:mapAnnotations(answer.result.annotations,image,{width:1920,height:1080})};
    state=openBranch(state,state.annotations[0].id);const branchId=state.activeBranch!;
    state=sendMessage(state,'Branch question',branchId,'Branch answer');
    state=sendMessage(state,'Unrelated main question',undefined,'Unrelated main answer');
    const request=buildTutorRequest(state,{type:'send',branchId,text:'Followup'},'followup');
    expect(request.history.map(m=>m.content)).toEqual(['Branch question','Branch answer']);
    expect(request.originalQuestion).toBe('Original');expect(request.image.captureId).toBe('capture-a');expect(request.annotation?.concept).toBe('equation');
    expect(()=>buildTutorRequest({...state,capture:{...state.capture!,id:'new'}},{type:'send',branchId,text:'Wrong image'},'wrong')).toThrow('no longer matches');
  });
});
describe('desktop backend errors',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('surfaces backend setup errors without fallback',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Set OPENAI_API_KEY in backend .env'}),{status:503})));
    await expect(requestTutor(buildTutorRequest(initial(),{type:'explain',question:'Help'},'id'),new AbortController().signal)).rejects.toThrow('Set OPENAI_API_KEY');
  });
  it('rejects invalid model coordinates before rendering',async()=>{
    const request=buildTutorRequest(initial(),{type:'explain',question:'Help'},'id');const response=result(request);response.result.annotations[0].target!.x=2;
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(response))));
    await expect(requestTutor(request,new AbortController().signal)).rejects.toThrow('invalid annotations');
  });
});
