import type { Session, RetryRequest } from '../shared/milestone';
import type { ImageContext,TutorRequest, TutorResponse,TutorProgress } from '../shared/ai';
import { tutorRequestSchema, tutorResponseSchema } from '../shared/ai';
import { mapAnnotations } from '../shared/annotationMapping';
import { requestsOutsideFocus } from '../shared/annotationScope';
import { message, sendMessage } from '../shared/session';
import { buildLessonContext } from '../shared/lessonContext';

export function buildTutorRequest(state:Session,command:RetryRequest,requestId:string):TutorRequest {
  const branch=command.type==='send' && command.branchId ? state.branches[command.branchId] : undefined;
  if(command.type==='send' && command.branchId && !branch)throw new Error('That branch is no longer available.');
  const capture=state.capture, savedImage=branch?.image ?? state.inputImage;
  // Followups use canonical full-image target coordinates; do not resend the
  // close-up after localization, or images from unrelated conversations.
  const image=command.type==='send'&&savedImage?{...savedImage,detail:undefined}:savedImage;
  if(!capture || !image || image.captureId!==capture.id || (branch && branch.captureId!==capture.id))throw new Error('The conversation no longer matches its captured screen. Take a new capture.');
  if(branch && !branch.annotation)throw new Error('This annotation has no original screen context.');
  const conversation=branch ?? state.main;
  // Visible histories remain separate; related lesson threads travel as context only.
  const own=conversation.messages.filter(m=>m.role!=='system');
  const alreadySupplied=!branch&&own[0]?.content===state.question&&own[1]?.content===state.explanation;
  const history=command.type==='explain'?[]:own.slice(alreadySupplied?2:0).slice(-12).map(m=>({role:m.role as 'user'|'assistant',content:m.content.slice(-16000)}));
  return tutorRequestSchema.parse({
    requestId,sessionId:state.id,captureId:capture.id,conversationId:conversation.id,
    kind:command.type==='explain'?'explain':'chat',mode:command.type==='explain'?(command.mode??state.mode??'explain'):(branch?.originalMode??state.mode??'explain'),
    question:command.type==='explain'?command.question:command.text,
    originalQuestion:command.type==='explain'?command.question:branch?.originalQuestion??state.question,
    originalExplanation:command.type==='explain'?'':branch?.originalExplanation??state.explanation,
    annotation:branch?.annotation??null,image,history,
    lesson:command.type==='send'?buildLessonContext(state,command.text,conversation.id):undefined,
  });
}
export class TutorCoordinator {
  private active?:{controller:AbortController;id:string;sessionId:string};
  constructor(private get:()=>Session,private set:(state:Session)=>void,private display:()=>{width:number;height:number},private request:(r:TutorRequest,s:AbortSignal,onProgress?:(text:string)=>void)=>Promise<TutorResponse>,private prepareImage?:(image:ImageContext,signal:AbortSignal)=>Promise<ImageContext>,private events:{progress?:(value:TutorProgress)=>void;timing?:(value:Record<string,unknown>)=>void}={}){}
  cancel(keepRetry=true) {
    const active=this.active;
    this.active=undefined;
    active?.controller.abort();
    const state=this.get();
    if(state.pending)this.set({...state,pending:undefined,phase:state.explanation?'explained':'question',panelView:state.explanation?state.panelView:undefined,retry:keepRetry?state.retry:undefined,error:keepRetry?'Request cancelled. You can retry when ready.':undefined});
  }
  async run(command:RetryRequest):Promise<boolean> {
    const started=performance.now();
    if(this.active)throw new Error('A request is already running. Cancel it before submitting again.');
    const initial=this.get();
    if(command.type==='explain' && initial.phase!=='question')throw new Error('Take a capture before asking a new screen question.');
    if(command.type==='send' && initial.phase!=='explained')throw new Error('Wait for the original explanation.');
    let request=buildTutorRequest(initial,command,crypto.randomUUID());
    const built=performance.now();let prepared=built,received=built,imagePrepareMs=0,firstTextMs:number|undefined;
    const controller=new AbortController();
    const active={controller,id:request.requestId,sessionId:initial.id};
    this.active=active;
    this.set({...initial,pending:{id:active.id,kind:request.kind,conversationId:request.conversationId},retry:command,error:undefined,phase:command.type==='explain'?'loading':initial.phase,question:command.type==='explain'?command.question:initial.question,mode:request.mode,...(command.type==='explain'?{panelView:'main' as const,mainMinimized:false}:{})});
    const current=()=>this.active===active && this.get().id===active.sessionId && !controller.signal.aborted;
    try {
      if(request.kind==='explain'&&this.prepareImage&&!request.image.detail){
        const preparing=performance.now();
        request={...request,image:await this.prepareImage(request.image,controller.signal)};
        imagePrepareMs=performance.now()-preparing;
        if(!current())return false;
        // Keep completed local preparation for explicit Retry after provider
        // failure; never cache a late image into a cancelled/replaced session.
        const state=this.get();this.set({...state,inputImage:request.image,capture:{...state.capture!,image:request.image}});
      }
      prepared=performance.now();
      const response=tutorResponseSchema.parse(await this.request(request,controller.signal,this.events.progress?text=>{
        if(current()&&text.length<=16000){
          firstTextMs??=performance.now()-started;
          this.events.progress?.({requestId:request.requestId,sessionId:request.sessionId,conversationId:request.conversationId,text});
        }
      }:undefined));
      received=performance.now();
      if(!current())return false;
      if(response.requestId!==request.requestId || response.sessionId!==request.sessionId || response.captureId!==request.captureId || response.conversationId!==request.conversationId)throw new Error('The backend returned an answer for a different capture or conversation. Nothing was changed.');
      let state=this.get();
      if(command.type==='explain') {
        const annotations=mapAnnotations(response.result.annotations,request.image,this.display(),{allowOutsideFocus:requestsOutsideFocus(request.question),requireSource:response.provider==='openai'});
        state={...state,inputImage:request.image,capture:{...state.capture!,image:request.image},phase:'explained',explanation:response.result.explanation,annotations,lessonAnnotations:annotations,main:{...state.main,messages:[message('user',command.question),message('assistant',response.result.explanation)]}};
      } else state=sendMessage(state,command.text,command.branchId,response.result.explanation);
      this.set({...state,pending:undefined,retry:undefined,error:undefined,warnings:response.result.warnings,usage:response.usage,provider:{provider:response.provider,model:response.model,configured:true}});
      this.events.timing?.({event:'desktop_tutor_timing',requestId:request.requestId,conversationId:request.conversationId,kind:request.kind,contextMs:built-started,prepareMs:imagePrepareMs,requestSetupMs:prepared-built-imagePrepareMs,backendMs:received-prepared,firstTextMs,applyMs:performance.now()-received,totalMs:performance.now()-started});
      return true;
    } catch(error) {
      if(!current())return false;
      const text=error instanceof Error?error.message:'The AI request failed. Retry or check the backend.';
      const state=this.get();
      this.set({...state,pending:undefined,phase:state.explanation?'explained':'question',panelView:state.explanation?state.panelView:undefined,error:text});
      throw new Error(text);
    } finally { if(this.active===active)this.active=undefined; }
  }
}
