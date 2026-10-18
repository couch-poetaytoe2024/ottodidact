import { describe,expect,it } from 'vitest';
import { capturedSession,openBranch,sendMessage } from '../shared/session';
import { mapAnnotations } from '../shared/annotationMapping';
import { buildTutorRequest } from '../desktop/tutor';
import { buildTutorContext } from '../server/ai/context';
import { tutorRequestSchema,type ImageContext } from '../shared/ai';
import type { Session } from '../shared/milestone';

const image:ImageContext={captureId:'lesson-a',dataUrl:'data:image/png;base64,AAAA',pixelWidth:600,pixelHeight:400,originalPixelWidth:600,originalPixelHeight:400,cropOffset:{x:0,y:0},displayScale:1,desktopRect:{x:100,y:100,width:600,height:400},selection:{x:0,y:0,width:1,height:1}};
function lesson():Session {
  const annotations=mapAnnotations(['Discriminant','Roots','Vertex','Graph'].map((concept,i)=>({id:'a'+i,kind:'circle' as const,concept,explanation:'Detail '+concept,target:{x:i*.2,y:.2,width:.1,height:.1}})),image,{width:1920,height:1080});
  let state:Session={...capturedSession({id:image.captureId,dataUrl:image.dataUrl,rect:image.desktopRect,pixelWidth:600,pixelHeight:400,scaleFactor:1,image}),question:'Explain the quadratic',explanation:'Original lesson',phase:'explained',annotations,lessonAnnotations:annotations};
  for(const n of [0,1,3]) {
    state=openBranch(state,annotations[n].id);
    state=sendMessage(state,'Question in box '+(n+1),state.activeBranch,'Answer in box '+(n+1));
  }
  return state;
}
describe('shared lesson context with separate transcripts',()=>{
  it('retrieves boxes 1 and 4 automatically without copying messages to main',()=>{
    const state=lesson(),before=structuredClone(state);
    const request=buildTutorRequest(state,{type:'send',text:'How does what we discussed in 1 relate to 4?'},'request');
    expect(request.lesson?.threads.map(t=>t.number)).toEqual([1,4]);
    const context=buildTutorContext(request,24000);
    expect(context).toContain('Answer in box 1');expect(context).toContain('Answer in box 4');expect(context).not.toContain('Answer in box 2');
    expect(request.history).toEqual([]);expect(state).toEqual(before);
    const sent=sendMessage(state,request.question,undefined,'They connect through the discriminant');
    expect(sent.main.messages.map(m=>m.content)).toEqual([request.question,'They connect through the discriminant']);
    expect(sent.branches).toEqual(state.branches);
  });
  it('supports title references and another box from an active branch',()=>{
    const state=lesson(),branch=Object.values(state.branches).find(b=>b.number===4)!;
    const request=buildTutorRequest(state,{type:'send',branchId:branch.id,text:'Relate this to the Discriminant'},'request');
    expect(request.lesson?.threads.find(t=>t.number===1)?.messages.at(-1)?.content).toBe('Answer in box 1');
    expect(request.lesson?.threads.some(t=>t.conversationId===branch.id)).toBe(false);
    expect(request.history.at(-1)?.content).toBe('Answer in box 4');
  });
  it('keeps stable numbers, fixed context and messages after close, move, clear and reopen',()=>{
    const state=lesson(),id=state.annotations[3].id,branch=state.branches[state.activeBranch!]!;
    const reopened=openBranch({...state,annotations:[],activeBranch:undefined,question:'Changed',presented:false},id);
    expect(reopened.branches[reopened.activeBranch!]).toEqual(branch);
    expect(reopened.branches[reopened.activeBranch!].number).toBe(4);
    expect(Object.keys(reopened.branches)).toHaveLength(3);
    const request=buildTutorRequest(reopened,{type:'send',text:'Compare boxes 1 and 4'},'request');
    expect(request.lesson?.threads.map(t=>t.number)).toEqual([1,4]);
  });
  it('excludes stale captures and foreign sessions even if accidentally present in the record',()=>{
    const state=lesson(),branch=Object.values(state.branches)[0];
    const wrong={...branch,id:'foreign:branch:'+branch.annotationId,captureId:'old',messages:[{...branch.messages[0],content:'FOREIGN SECRET'}]};
    state.branches[wrong.id]=wrong;
    const request=buildTutorRequest(state,{type:'send',text:'Connect boxes 1 and 4'},'request');
    expect(JSON.stringify(request)).not.toContain('FOREIGN SECRET');
    expect(()=>tutorRequestSchema.parse({...request,lesson:{...request.lesson,sessionId:'foreign'}})).toThrow();
    const next=capturedSession({...state.capture!,id:'next',image:{...image,captureId:'next'}});
    expect(next.branches).toEqual({});expect(next.lessonAnnotations).toBeUndefined();
  });
  it('bounds text fairly and supplies only the one relevant image',()=>{
    let state=lesson();
    for(const branch of Object.values(state.branches))for(let i=0;i<15;i++)state=sendMessage(state,'Long question '+i,branch.id,'Large \\" answer '+i+' '+('abc\\\"'.repeat(2000)));
    const request=buildTutorRequest(state,{type:'send',text:'Compare boxes 1 and 4'},'request');
    expect(request.lesson?.threads).toHaveLength(2);
    expect(request.lesson?.threads.every(t=>t.messages.length<=6&&t.messages.reduce((sum,m)=>sum+m.content.length,0)<=2400)).toBe(true);
    expect(JSON.stringify(request).match(/data:image/g)).toHaveLength(1);
    for(const limit of [8000,10000,24000]){
      const context=buildTutorContext(request,limit);
      expect(context.length).toBeLessThanOrEqual(limit);
      expect(context).toContain('"number":1');expect(context).toContain('"number":4');
      expect(context).toContain('Compare boxes 1 and 4');
    }
  });
  it('retains part of a long latest active message within the backend budget',()=>{
    let state=lesson();
    state=sendMessage(state,'Latest question',undefined,'LATEST ANSWER '+('detail '.repeat(2200)));
    const request=buildTutorRequest(state,{type:'send',text:'Compare boxes 1 and 4'},'request');
    const context=buildTutorContext(request,8000);
    expect(context.length).toBeLessThanOrEqual(8000);
    expect(context).toContain('LATEST ANSWER');
    expect(context).toContain('Answer in box 1');expect(context).toContain('Answer in box 4');
  });
});

it('supports more than four boxes and retrieves multi-digit references without main transcript pollution',()=>{
  let state=lesson();
  const annotations=mapAnnotations(Array.from({length:12},(_,i)=>({id:'concept'+i,kind:'circle' as const,concept:'Concept '+(i+1),explanation:'Important concept '+i,target:{x:.1,y:.1,width:.1,height:.1}})),image,{width:1920,height:1080});
  state={...state,annotations,lessonAnnotations:annotations,branches:{}};
  for(const n of [0,3,9]){state=openBranch(state,annotations[n].id);state=sendMessage(state,'Question',state.activeBranch,'Discussion in box '+(n+1));}
  const before=structuredClone(state.main);
  const request=buildTutorRequest(state,{type:'send',text:'Relate boxes 4 and 10'},'request');
  expect(request.lesson!.index).toHaveLength(12);
  expect(request.lesson!.threads.map(t=>t.number)).toEqual([4,10]);
  expect(buildTutorContext(request,24000)).toContain('Discussion in box 10');
  expect(state.main).toEqual(before);
});
