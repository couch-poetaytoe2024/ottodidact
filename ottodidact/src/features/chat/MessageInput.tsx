import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
interface Props { placeholder?:string; onSend:(text:string)=>void|Promise<void>; label?:string; disabled?:boolean; initialValue?:string; autoFocus?:boolean; compact?:boolean; quickAnswer?:string; footer?:ReactNode }
export function MessageInput({placeholder,onSend,label='Send message',disabled=false,initialValue='',autoFocus=false,compact=false,quickAnswer,footer}:Props) {
  const [value,setValue]=useState(initialValue),[action,setAction]=useState<'send'|'quick'|null>(null),[error,setError]=useState('');
  const busy=action!==null;
  async function submit(text:string,kind:'send'|'quick') {
    if(!text||busy||disabled)return;
    setAction(kind);setError('');
    try{await onSend(text);if(kind==='send')setValue('');}catch(err){setError(err instanceof Error?err.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,''):'Could not send. Your question is still here.');}finally{setAction(null);}
  }
  return <form className="message-input" onSubmit={event=>{event.preventDefault();void submit(value.trim(),'send');}}>
    <div className="composer"><textarea aria-label={placeholder??'Message'} value={value} autoFocus={autoFocus} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}} maxLength={2000} placeholder={placeholder} disabled={busy||disabled} rows={compact?Math.min(3,value.split('\n').length):1}/><button className="send-button" type="submit" aria-label={action==='send'?'Sending':label} title={label+' (Enter)'} disabled={busy||disabled||!value.trim()}>{action==='send'?<span className="spinner"/>:<Icon name="send"/>}</button></div>
    {quickAnswer&&<div className="question-footer">{footer}<button className="quick-answer-button" type="button" onClick={()=>void submit(quickAnswer,'quick')} disabled={busy||disabled} title="Answer the selection directly, without sending your draft">{action==='quick'?<span className="spinner"/>:<Icon name="bolt"/>}{action==='quick'?'Answering…':'Quick answer'}</button></div>}
    {error&&<p role="alert" className="error" title={error}>{compact&&error.length>150?error.slice(0,147)+'…':error}</p>}
  </form>;
}
