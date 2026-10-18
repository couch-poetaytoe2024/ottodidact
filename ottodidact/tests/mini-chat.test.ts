import {expect,it,vi} from 'vitest';
import {buildTutorRequest,TutorCoordinator} from '../desktop/tutor';
import {capturedSession,openBranch,sendMessage} from '../shared/session';
import {mapAnnotations} from '../shared/annotationMapping';
import {createProvider} from '../server/ai/client';
import {prepareTutorContext} from '../server/ai/context';
import {readConfig} from '../server/config';
import type {ImageContext} from '../shared/ai';
import type {Session} from '../shared/milestone';

const image:ImageContext={captureId:'chemistry',dataUrl:'data:image/png;base64,AAAA',pixelWidth:600,pixelHeight:400,originalPixelWidth:600,originalPixelHeight:400,cropOffset:{x:0,y:0},displayScale:1,desktopRect:{x:0,y:0,width:600,height:400},selection:{x:0,y:0,width:1,height:1}};
const original='Explain Ag(s) + CN⁻(aq) + O₂(g) → [Ag(CN)₂]⁻(aq)';
const followup='Why isn’t the silver/CN part a complete half-reaction, and how does oxygen fit?';
// Hand-written expected response, never a paid model evaluation.
const answer='The silver/CN skeleton is missing the second cyanide and the electron. **Ag + 2CN⁻ → [Ag(CN)₂]⁻ + e⁻ is a complete, balanced oxidation half-reaction.** Oxygen accepts electrons in a separate reduction half-reaction. Combining the two, with equal electron counts, gives the overall redox reaction.';
function lesson(){
 const annotations=mapAnnotations(['Silver/CN balancing','Oxygen reduction'].map((concept,i)=>({id:'part'+i,concept,kind:'arrow' as const,explanation:i?'Oxygen accepts electrons.':'The skeleton needs atom and charge balancing.',target:{x:.1+i*.4,y:.3,width:.2,height:.05}})),image,{width:600,height:400});
 let state:Session={...capturedSession({id:image.captureId,dataUrl:image.dataUrl,rect:image.desktopRect,pixelWidth:600,pixelHeight:400,scaleFactor:1,image}),phase:'explained',question:original,explanation:'Separate oxidation and reduction, balance atoms and charge, then combine.',annotations};
 for(const mark of annotations)state=openBranch(state,mark.id);
 const [box,other]=Object.values(state.branches);
 state=sendMessage(state,'Where is the electron?',box.id,'Add an electron on the product side.');
 state=sendMessage(state,'Unrelated sibling discussion',other.id,'SIBLING HISTORY');
 return {state,box,other};
}
it('sends the chemistry followup last, with its own ordered history and exact target; one request only',async()=>{
 const {state,box}=lesson(),request=buildTutorRequest(state,{type:'send',branchId:box.id,text:followup},'local');
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({explanation:answer,annotations:[],warnings:[]})}]}]})));
 const config=readConfig({AI_PROVIDER:'openai',OPENAI_API_KEY:'offline-test',OPENAI_MODEL:'unchanged-model'});
 const result=await createProvider(config,fetcher)(request,new AbortController().signal);
 const payload=JSON.parse((fetcher.mock.calls as unknown as [unknown,RequestInit][])[0][1].body as string);
 expect(payload.input.at(-1)).toEqual({role:'user',content:followup});
 expect(payload.input.slice(1,-1)).toEqual(request.history);
 expect(payload.input[0].content[0].text).toContain('The skeleton needs atom and charge balancing.');
 expect(payload.input[0].content[0].text).toContain(original);
 expect(payload.input[0].content[0].text).not.toContain('SIBLING HISTORY');
 expect(payload.instructions).toContain('check the premise');
 expect(payload.model).toBe('unchanged-model');expect(result.result.explanation).toBe(answer);expect(result.result.annotations).toEqual([]);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.stringify(payload).match(/data:image/g)).toHaveLength(1);
 const mock=await createProvider(readConfig({AI_PROVIDER:'mock'}))(request,new AbortController().signal);
 expect(mock.result.explanation).toContain(followup);expect(mock.result.explanation).toContain('Demo content');
});
it('keeps active history ahead of large background and still retrieves explicitly named siblings',()=>{
 const {state,box}=lesson();
 const request=buildTutorRequest(state,{type:'send',branchId:box.id,text:followup},'bounded');
 const context=prepareTutorContext({...request,originalExplanation:'Background '.repeat(1400)},8000);
 expect(context.history).toEqual(request.history);expect(context.background).toContain(followup);
 const related=buildTutorRequest(state,{type:'send',branchId:box.id,text:'How does box 2 fit?'},'related');
 expect(related.lesson!.threads[0].messages.at(-1)!.content).toBe('SIBLING HISTORY');
});
it('does not prepare images or submit twice for local replies, keeps main unchanged, and logs first text',async()=>{
 let {state,box,other}=lesson();const main=structuredClone(state.main),targets=structuredClone(state.annotations);
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),prepare=vi.fn(),timing=vi.fn();
 const transport=vi.fn(async(r:ReturnType<typeof buildTutorRequest>,_s:AbortSignal,progress?:((s:string)=>void))=>{
  progress?.('The skeleton is missing');await gate;
  return {requestId:r.requestId,sessionId:r.sessionId,captureId:r.captureId,conversationId:r.conversationId,provider:'mock' as const,model:'offline',result:{explanation:answer,annotations:[],warnings:[]}};
 });
 const coordinator=new TutorCoordinator(()=>state,s=>state=s,()=>({width:600,height:400}),transport,prepare,{progress:vi.fn(),timing});
 const running=coordinator.run({type:'send',branchId:box.id,text:followup});
 await expect(coordinator.run({type:'send',branchId:box.id,text:followup})).rejects.toThrow('already running');
 release();await running;expect(transport).toHaveBeenCalledTimes(1);expect(prepare).not.toHaveBeenCalled();
 expect(state.main).toEqual(main);expect(state.annotations).toEqual(targets);expect(timing.mock.calls[0][0].firstTextMs).toBeGreaterThanOrEqual(0);
 const second=buildTutorRequest(state,{type:'send',branchId:other.id,text:'Where do the electrons go?'},'second');
 expect(second.conversationId).not.toBe(transport.mock.calls[0][0].conversationId);expect(second.question).not.toBe(followup);
});
