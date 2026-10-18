import { MAX_ANNOTATIONS, type LessonContext } from './ai';
import type { Session } from './milestone';

/** Select text from this snapshot only. No renderer transcript is mutated. */
export function buildLessonContext(state:Session,question:string,activeId:string):LessonContext {
  const captureId=state.capture!.id;
  const index=(state.lessonAnnotations??state.annotations).filter(a=>a.captureId===captureId).slice(0,MAX_ANNOTATIONS).map((a,i)=>({annotationId:a.id,number:a.number??i+1,title:a.concept??a.kind,explanation:a.model?.explanation??a.text,...(a.model?.taskRefs?{taskRefs:[...a.model.taskRefs]}:{})}));
  const query=question.toLowerCase();
  const conversational=/\b(box(?:es)?|annotation|thread|chat|discuss\w*|relate|compare|connection|connect)\b/.test(query);
  const normalize=(label:string)=>' '+label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
  const sourceMentions=new Set<string>();
  // Source task numbers and app box numbers are separate namespaces. Keep
  // "compare Task 2 with box 4" from accidentally retrieving box 2 as well.
  const boxQuery=query.replace(/\b(problems?|questions?|tasks?|exercises?|parts?)\s+((?:\d+[a-z]?|\([a-z0-9]+\)|[a-z]\b)(?:\s*(?:,|and|&)\s*(?:\d+[a-z]?|\([a-z0-9]+\)|[a-z]\b))*)/g,(_match,kind:string,labels:string)=>{
    for(const label of labels.match(/\d+[a-z]?|\([a-z0-9]+\)|\b[a-z]\b/g)??[])sourceMentions.add(normalize(kind.replace(/s$/,'')+' '+label));
    return '';
  });
  const numbers=new Set(Array.from(boxQuery.matchAll(/(?:#\s*|\b)([1-9][0-9]?)\b/g),m=>Number(m[1])));
  const taskQuery=normalize(query),parts=(label:string)=>label.split(/\s*[·›>]\s*/);
  const mentions=(label:string)=>taskQuery.includes(normalize(label))||sourceMentions.has(normalize(label));
  const namedParents=new Set(index.flatMap(a=>(a.taskRefs??[]).flatMap(ref=>parts(ref).slice(0,-1))).filter(mentions));
  const matchesTask=(ref:string)=>{
    const labels=parts(ref),leaf=labels.at(-1)!;
    return mentions(ref) || (mentions(leaf) && (!namedParents.size || labels.slice(0,-1).every(parent=>namedParents.has(parent))));
  };
  const referenced=index.filter(a=>(conversational && numbers.has(a.number)) || (boxQuery.includes('#') && numbers.has(a.number)) || query.includes(a.title.toLowerCase()) || a.taskRefs?.some(matchesTask));
  const candidates=Object.values(state.branches).filter(b=>b.id!==activeId && b.captureId===captureId && b.id===`${state.id}:branch:${b.annotationId}` && (!b.image || b.image.captureId===captureId) && b.messages.length && index.some(a=>a.annotationId===b.annotationId));
  // Explicit references win; otherwise recent discussions provide modest continuity.
  const selected=referenced.length?candidates.filter(b=>referenced.some(a=>a.annotationId===b.annotationId)):
    activeId===state.main.id?candidates.sort((a,b)=>(b.messages.at(-1)?.createdAt??0)-(a.messages.at(-1)?.createdAt??0)).slice(0,2):[];
  const threads:LessonContext['threads']=selected.map(b=>{
    const entry=index.find(a=>a.annotationId===b.annotationId)!;
    return {conversationId:b.id,annotationId:b.annotationId,number:entry.number,title:entry.title,...(entry.taskRefs?{taskRefs:[...entry.taskRefs]}:{}),messages:[]};
  });
  if(activeId!==state.main.id && state.main.messages.length)threads.push({conversationId:state.main.id,annotationId:null,number:null,title:'Main chat',messages:[]});
  // Fair per-thread allocation keeps both ends of a cross-box question available.
  const budget=Math.min(2400,Math.floor(7200/Math.max(1,threads.length)));
  for(const thread of threads) {
    const conversation=thread.annotationId?state.branches[thread.conversationId]:state.main;
    let remaining=budget;
    const messages=conversation.messages.filter(m=>m.role!=='system');
    // Original main question/answer are already supplied as fixed background.
    const duplicate=!thread.annotationId&&messages[0]?.content===state.question&&messages[1]?.content===state.explanation;
    for(const message of messages.slice(duplicate?2:0).slice(-6).reverse()) {
      if(remaining<=0)break;
      const content=message.content.slice(-Math.min(remaining,1200));
      thread.messages.unshift({role:message.role as 'user'|'assistant',content});
      remaining-=content.length;
    }
  }
  return {sessionId:state.id,captureId,index,threads:threads.filter(t=>t.messages.length)};
}
