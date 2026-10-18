import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {teachingCaptureId,teachingFixtures} from './fixtures/teaching';
import {capturedSession,openBranch,sendMessage} from '../shared/session';
import {TutorCoordinator,buildTutorRequest} from '../desktop/tutor';
import {buildTutorContext} from '../server/ai/context';
import {createProvider} from '../server/ai/client';
import {readConfig} from '../server/config';
import {ANNOTATION_INSTRUCTIONS} from '../server/ai/prompts';
import {responsePolicy} from '../server/ai/responsePolicy';
import {MathText} from '../src/components/MathText';
import type {ImageContext,TutorRequest} from '../shared/ai';
import type {Session} from '../shared/milestone';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5qkAAAAASUVORK5CYII=';
const image:ImageContext={captureId:teachingCaptureId,dataUrl:png,pixelWidth:1,pixelHeight:1,originalPixelWidth:1,originalPixelHeight:1,cropOffset:{x:0,y:0},displayScale:1,desktopRect:{x:0,y:0,width:1000,height:700},selection:{x:0,y:0,width:1,height:1}};
const fresh=()=>capturedSession({id:teachingCaptureId,dataUrl:png,rect:image.desktopRect,pixelWidth:1,pixelHeight:1,scaleFactor:1,image});
const config=readConfig({AI_PROVIDER:'openai',OPENAI_API_KEY:'offline-placeholder-only',OPENAI_MODEL:'unchanged-model'});

describe('one coherent inquiry across main and cards',()=>{
 it.each(teachingFixtures)('$name: retains inquiry, main reasoning and source through delayed loading and followups',async fixture=>{
  let state:Session=fresh();const sent:TutorRequest[]=[];
  const fetcher=vi.fn(async(_input:Parameters<typeof fetch>[0],_init?:RequestInit)=>new Response(JSON.stringify({model:config.model,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fixture.result)}]}]})));
  const provider=createProvider(config,fetcher);
  const tutor=new TutorCoordinator(()=>state,s=>state=s,()=>({width:1000,height:700}),async(r,signal)=>{
    sent.push(r);const completion=await provider(r,signal);
    return {requestId:r.requestId,sessionId:r.sessionId,captureId:r.captureId,conversationId:r.conversationId,provider:'openai',model:config.model,result:completion.result};
  });
  await tutor.run({type:'explain',question:fixture.question,mode:'explain'});
  expect(sent[0].originalQuestion).toBe(fixture.question);expect(sent[0].originalExplanation).toBe('');
  const payload=JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  const prepared=JSON.parse(payload.input[0].content[0].text.split('\n')[0]);
  expect(prepared.originalQuestion).toBe(fixture.question);expect(prepared.responsePreferences.lessonFocus).toBe(fixture.focus);
  expect(payload.instructions).toContain('ONE coherent explanation');expect(payload.instructions).toContain('what the target shows, why it matters HERE, and how it supports the main answer');
  expect(state.annotations).toHaveLength(fixture.result.annotations.length);expect(state.explanation).toBe(fixture.result.explanation);
  const main=structuredClone(state.main);
  // Renderer creation order/timing is separate from model generation. Delay and
  // reverse the loading order; every branch must receive the same fixed lesson.
  for(const mark of state.annotations.slice().reverse()){
    await Promise.resolve();state=openBranch(state,mark.id);
    const branch=state.branches[state.activeBranch!];
    expect(branch.originalQuestion).toBe(fixture.question);expect(branch.originalExplanation).toBe(fixture.result.explanation);
    expect(branch.image?.dataUrl).toBe(image.dataUrl);expect(branch.captureId).toBe(teachingCaptureId);
    const followup=buildTutorRequest(state,{type:'send',branchId:branch.id,text:'Why is that valid here?'},'followup-'+branch.number);
    const context=buildTutorContext(followup,24000),head=JSON.parse(context.split('\n')[0]);
    expect(head.originalQuestion).toBe(fixture.question);expect(head.question).toBe('Why is that valid here?');
    expect(head.annotation.source.feature).toBe(branch.annotation!.source!.feature);
    expect(head.annotation.explanation).toBe(branch.annotation!.explanation);
    expect(head.responsePreferences.lessonFocus).toBe(fixture.focus);
    expect(context).toContain(JSON.stringify(fixture.result.explanation));
    expect(followup.image.detail).toBeUndefined();expect(JSON.stringify(followup).match(/data:image/g)).toHaveLength(1);
    const html=renderToStaticMarkup(<MathText text={branch.annotation!.explanation}/>);
    expect(html).toContain('<p>');if(branch.annotation!.explanation.includes('$'))expect(html).toContain('katex');
    state=sendMessage(state,'A local followup',branch.id,'A saved answer');
    const saved=structuredClone(state.branches[branch.id]);
    const reopened=openBranch({...state,mode:'hint',question:'A different unsent draft',explanation:'Not this lesson'},mark.id);
    expect(reopened.branches[branch.id]).toEqual(saved);
    const resumed=buildTutorRequest(reopened,{type:'send',branchId:branch.id,text:'Continue'},'resumed');
    expect(resumed.originalQuestion).toBe(fixture.question);expect(resumed.originalExplanation).toBe(fixture.result.explanation);expect(resumed.mode).toBe('explain');
    expect(resumed.history.at(-1)?.content).toBe('A saved answer');
  }
  expect(state.main).toEqual(main);expect(fetcher).toHaveBeenCalledTimes(1);
 });

 it('prioritizes the original main reasoning over optional repeated index text',()=>{
  const fixture=teachingFixtures[0];let state:Session={...fresh(),question:fixture.question,explanation:'MAIN REASONING '+('necessary reasoning. '.repeat(300))+' FINAL CONCLUSION',phase:'explained'};
  // A deliberately busy related thread used to reduce the main answer first.
  const request=buildTutorRequest(state,{type:'send',text:'How does this support the maximum?'},'bounded');
  request.lesson={sessionId:state.id,captureId:image.captureId,index:Array.from({length:8},(_,i)=>({annotationId:image.captureId+':a'+i,number:i+1,title:'Relevant concept '+i,explanation:'Index detail '.repeat(80)})),threads:[{conversationId:state.id+':branch:'+image.captureId+':a0',annotationId:image.captureId+':a0',number:1,title:'Related discussion',messages:Array.from({length:6},()=>({role:'assistant' as const,content:'Earlier discussion '.repeat(60)}))}]};
  const before=structuredClone(request),context=buildTutorContext(request,12000);
  expect(context.length).toBeLessThanOrEqual(12000);expect(context).toContain(JSON.stringify(state.explanation));expect(context).toContain('Original explanation shortened: false');expect(request).toEqual(before);
  const small=buildTutorContext({...request,originalExplanation:'MAIN START '+('larger reasoning '.repeat(900))},8000);
  expect(small.length).toBeLessThanOrEqual(8000);expect(small).toContain('MAIN START');expect(small).toContain('Original explanation shortened: true');
 });

 it('keeps why inquiries causal even when their wording mentions finding a result',()=>{
  const request=buildTutorRequest(fresh(),{type:'explain',question:'Why do we find the vertex this way?'},'why');
  expect(responsePolicy(request,1800)).toMatchObject({lessonIntent:'explain',lessonFocus:'causes-and-relationships'});
  expect(ANNOTATION_INSTRUCTIONS).toContain('generic definition of coefficient or unrelated instructions for finding roots do not answer this inquiry');
  expect(ANNOTATION_INSTRUCTIONS).not.toContain('1-3');
 });
});
