import { create } from 'zustand';
import type { Command, Session } from '@shared/milestone';
import type { TutorProgress } from '@shared/ai';
export const useSessionStore=create<{session?:Session;error?:string;progress?:TutorProgress}>(()=>({}));
export function usePendingReply(conversationId:string) {
  return useSessionStore(({session,progress})=>progress&&session?.id===progress.sessionId&&session.pending?.id===progress.requestId&&progress.conversationId===conversationId?progress.text:undefined);
}
export async function command(value: Command) {
  const sessionId=useSessionStore.getState().session?.id;
  try {
    if (!window.ottodidact) throw new Error('Launch the Electron app with npm run dev.');
    useSessionStore.setState({error:undefined});
    await window.ottodidact.command(value);
  } catch(error) {
    // A failure from an old conversation must not add an error to a newer capture.
    if(sessionId===useSessionStore.getState().session?.id)
      useSessionStore.setState({error:error instanceof Error?error.message:'Desktop command failed.'});
    throw error;
  }
}
/** Button actions report errors through the shared store without unhandled rejections. */
export function dispatch(value: Command) { void command(value).catch(()=>{}); }
export function connectSession() {
  const api=window.ottodidact;
  if (!api) return ()=>{};
  const update=(session:Session)=>useSessionStore.setState(current=>!current.session || session.revision>=current.session.revision?{session,error:undefined,progress:session.pending?.id===current.progress?.requestId?current.progress:undefined}:current);
  const unsubscribe=api.subscribe(update);
  const stopProgress=api.subscribeProgress(progress=>{
    const {session}=useSessionStore.getState();
    if(session?.id===progress.sessionId&&session.pending?.id===progress.requestId&&session.pending.conversationId===progress.conversationId&&typeof progress.text==='string'&&progress.text.length<=16000)useSessionStore.setState({progress});
  });
  void api.getState().then(update).catch(error=>useSessionStore.setState({error:String(error)}));
  return ()=>{unsubscribe();stopProgress();};
}
