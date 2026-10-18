import { useEffect, useRef } from 'react';
import { ChatHeader } from '../../components/ChatHeader';
import { SettingsPanel } from '../settings/SettingsPanel';
import { useChatSettings } from './useChatSettings';
import { Icon } from '../../components/Icon';
import { command, dispatch, useSessionStore } from '../../state/sessionStore';
import { MessageInput } from './MessageInput';

export function QuestionPanel() {
  const session=useSessionStore(state=>state.session)!;
  const {settingsOpen,setSettingsOpen,gear,closeSettings}=useChatSettings(!!session.presented&&session.panelView!=='main');
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const measure=()=>{
      if(panel.current&&session.panelView!=='main')dispatch({type:'questionHeight',height:settingsOpen?420:Math.max(150,Math.min(300,Math.ceil(panel.current.getBoundingClientRect().height)+12))});
    };
    const observer=new ResizeObserver(measure);
    if(panel.current)observer.observe(panel.current);
    measure();return()=>observer.disconnect();
  },[settingsOpen,session.panelView]);
  useEffect(()=>{if(session.panelView!=='main'&&session.presented)panel.current?.querySelector('textarea')?.focus();},[session.panelView,session.presented]);
  return <div ref={panel} className="question-input-panel" aria-label="Ask about the selected snapshot" data-settings-open={settingsOpen}>
    <ChatHeader demo={session.provider?.provider==='mock'} settingsOpen={settingsOpen} settingsRef={gear} onSettings={()=>setSettingsOpen(open=>!open)}>
      <button type="button" className="icon-button" title="Retake" aria-label="Retake" onClick={()=>dispatch({type:'capture'})}><Icon name="retake"/></button>
      <button type="button" className="icon-button" title="Dismiss (Escape)" aria-label="Dismiss question" onClick={()=>dispatch({type:'dismiss'})}><Icon name="close"/></button>
    </ChatHeader>
    {settingsOpen&&<SettingsPanel onClose={closeSettings} returnLabel="Back to question"/>}
    <div className="question-content" hidden={settingsOpen}>
    <MessageInput key={session.capture?.id} placeholder="Ask Otto…" label="Send question" initialValue={session.question}
      autoFocus compact quickAnswer="Answer the question or problem in the selected area. If there is no explicit question, explain the key idea in that area. Use the surrounding screen only as context."
      footer={<span/>}
      onSend={async question=>{
        if(!session.provider?.configured)throw new Error('Tutor is not connected. Check the connection in Otto settings.');
        await command({type:'explain',question,mode:session.mode});
        // Cancellation returns without applying a lesson. Keep the mounted
        // composer's draft rather than treating that return as a successful send.
        const current=useSessionStore.getState().session;
        if(current?.id===session.id&&!current.explanation)throw new Error(current.error||'Request cancelled. Your question is preserved.');
      }}/>
    </div>
  </div>;
}
