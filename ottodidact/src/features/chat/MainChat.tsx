import { type CSSProperties } from 'react';
import { annotationColor } from '@shared/presentation';
import { useSessionStore, command, dispatch } from '../../state/sessionStore';
import { ChatPanel } from './ChatPanel';
export function MainChat() {
  const session=useSessionStore(state=>state.session)!;
  const pending=!!session.pending,ready=!!session.provider?.configured,demo=session.provider?.provider==='mock';
  // The submitted question is provisional until the initial response validates.
  // Keep it visible while text streams without committing a partial lesson.
  const loading=session.phase==='loading';
  const conversation=loading?{...session.main,messages:[{id:'pending-question',role:'user' as const,content:session.question,createdAt:0}]}:session.main;
  const annotations=session.lessonAnnotations??session.annotations;
  const chips=<div className="annotation-links" aria-label="Annotation chats">{annotations.map(annotation=><button key={annotation.id} style={{'--annotation-color':annotationColor(annotation.number)} as CSSProperties} onClick={()=>dispatch({type:'openBranch',annotationId:annotation.id})} title={annotation.text}><span className="chip-number">{annotation.number}</span>{annotation.concept||annotation.kind}</button>)}</div>;
  return <main className="chat-panel">
    {session.phase==='idle'&&<div className="empty-state"><h2>What are you working on?</h2><p>Click Otto or press Ctrl+Shift+O to select something you want to understand.</p></div>}
    {(loading||session.phase==='explained')&&<>
      <ChatPanel key={session.main.id} conversation={conversation} onSend={text=>command({type:'send',text})} disabled={pending||!ready||loading} demo={demo} references={chips}/>
    </>}
  </main>;
}
