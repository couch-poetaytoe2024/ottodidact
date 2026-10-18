import type { TutorRequest } from '../../shared/ai';
import { requestsOutsideFocus } from '../../shared/annotationScope';
import { responsePolicy } from './responsePolicy';

// The main process supplies bounded related discussions from this lesson only.
// Budget serialized text, including JSON escaping, before calling the provider.
export function prepareTutorContext(request: TutorRequest, charLimit: number,maxOutputTokens=1800) {
  const head = JSON.stringify({
    task: request.kind, mode: request.mode,
    responsePreferences:responsePolicy(request,maxOutputTokens),
    conversation: request.annotation ? 'annotation branch' : 'main',
    sessionId: request.sessionId, conversationId: request.conversationId, captureId: request.captureId,
    annotationScope: requestsOutsideFocus(request.question)?'outside-focus-allowed':'focus-only',
    screenContext:'One full-display snapshot; no page text beyond the viewport',
    suppliedImage: { id:'full',width: request.image.pixelWidth, height: request.image.pixelHeight, selection: request.image.selection },
    ...(request.kind==='explain'&&request.image.detail?{detailImage:{id:'detail',captureId:request.captureId,width:request.image.detail.pixelWidth,height:request.image.detail.pixelHeight,fullImageRegion:request.image.detail.region}}:{}),
    originalQuestion: request.kind==='explain'?request.question:request.originalQuestion,
    annotation: request.annotation,
    question: request.question,
  });
  // Budget serialized text, because JSON escaping can expand its input.
  let remaining = Math.max(0, charLimit - head.length - 320 - JSON.stringify(request.question).length);
  const history: TutorRequest['history'] = [];
  const takeHistory=(budget:number)=>{
    for(const message of [...request.history].reverse()){
      let recent={...message};
      if(JSON.stringify(recent).length+1>budget){
        if(history.length)break;
        while(recent.content.length&&JSON.stringify(recent).length+1>budget)recent.content=recent.content.slice(0,Math.floor(recent.content.length*.8));
      }
      if(!recent.content)break;
      history.unshift(recent);budget-=JSON.stringify(recent).length+1;
    }
  };
  // The active box's conversation outranks optional background. Previously it
  // received only the leftovers after the full main answer and sibling chats.
  if(request.annotation){
    takeHistory(Math.min(6000,Math.floor(remaining*.45)));
    remaining-=JSON.stringify(history).length;
  }
  // The main reasoning belongs to every card. Reserve it before optional
  // related discussions, while leaving space for the active followup history.
  // Keep it whole when it fits; shrinking context never edits stored messages.
  const originalBudget=remaining-(request.lesson||request.history.length?Math.min(4800,Math.floor(remaining*.4)):0);
  let originalExplanation=request.originalExplanation;
  while(JSON.stringify(originalExplanation).length>originalBudget&&originalExplanation.length){
    originalExplanation=originalExplanation.slice(0,Math.floor(originalExplanation.length*.8));
  }
  const originalShortened=originalExplanation.length<request.originalExplanation.length;
  remaining-=JSON.stringify(originalExplanation).length;
  const lesson=request.lesson?structuredClone(request.lesson):undefined;
  let lessonText='';
  if(lesson) {
    lesson.index=lesson.index.map(a=>({...a,explanation:a.explanation.slice(0,240)}));
    const budget=Math.floor(remaining*.5);
    lessonText=JSON.stringify(lesson);
    // Preserve discussions before repeating lengthy index summaries; numbers,
    // titles and identities remain available for cross-box references.
    while(lessonText.length>budget&&lesson.index.some(a=>a.explanation.length)){
      lesson.index=lesson.index.map(a=>({...a,explanation:a.explanation.slice(0,Math.floor(a.explanation.length*.5))}));
      lessonText=JSON.stringify(lesson);
    }
    // Trim all discussions fairly; never discard one referenced box to fit another.
    while(lessonText.length>budget && lesson.threads.some(t=>t.messages.some(m=>m.content.length))) {
      for(const thread of lesson.threads)for(const message of thread.messages) {
        const length=Math.floor(message.content.length*.75);
        message.content=length?message.content.slice(-length):'';
      }
      lessonText=JSON.stringify(lesson);
    }
    remaining-=lessonText.length;
  }
  if(!request.annotation)takeHistory(remaining);
  const background = head + '\nOriginal explanation: ' + JSON.stringify(originalExplanation)
    + '\nOriginal explanation shortened: '+originalShortened
    + (lesson?'\nShared lesson context (separate transcripts): '+lessonText:'');
  if (background.length+JSON.stringify(history).length+JSON.stringify(request.question).length+128 > charLimit) throw new Error('Context exceeds configured AI_CONTEXT_CHAR_LIMIT.');
  return {background,history};
}
export function buildTutorContext(request:TutorRequest,charLimit:number,maxOutputTokens=1800):string {
  const {background,history}=prepareTutorContext(request,charLimit,maxOutputTokens);
  return background+'\nOwn conversation history: '+JSON.stringify(history);
}
