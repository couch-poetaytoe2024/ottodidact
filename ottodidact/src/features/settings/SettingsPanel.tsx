import { command, dispatch, useSessionStore } from '../../state/sessionStore';
import { OttoLogo } from '../../components/OttoLogo';
import { Icon } from '../../components/Icon';
import { SnapshotPreview } from '../chat/SnapshotPreview';
export function SettingsPanel({onClose,returnLabel='Main chat'}:{onClose?:()=>void;returnLabel?:string}={}) {
  const {session,error}=useSessionStore();
  const image=session?.inputImage??session?.capture?.image;
  return <div className={onClose?"settings-panel settings-embedded":"panel settings-panel"}>
    <header className="titlebar"><div className="panel-heading">{onClose?<strong>Settings</strong>:<><OttoLogo/><strong>Ottodidact</strong></>}</div><div className="window-actions">{!onClose&&<span className="settings-symbol"><Icon name="settings"/></span>}<button className="icon-button" aria-label="Close settings" onClick={()=>onClose?onClose():dispatch({type:'closeSettings'})}><Icon name="close"/></button></div></header>
    <div className="provider-setting" aria-label="Active tutor provider"><div><strong>{session?.provider?.provider==='mock'?'Demo provider':'OpenAI'}</strong><code>{session?.provider?.model||'Not connected'}</code><small>{session?.provider?.provider==='mock'?'Demo content · image not analyzed':session?.provider?.configured?'Backend credentials configured':'Backend setup required'}</small></div><button className="text-button" onClick={()=>dispatch({type:'refreshProvider'})}>Check connection</button></div>
    {onClose&&<nav className="lesson-controls" aria-label="Screen controls">{session?.panelView==='main'&&(session.phase==='question'||session.phase==='loading')&&<button onClick={()=>dispatch({type:'questionPanel'})}>Return to question</button>}<button onClick={()=>dispatch({type:'capture'})}><Icon name="plus"/>New capture</button><button onClick={()=>dispatch({type:'clear'})} disabled={!session?.annotations.length}>Clear annotations</button></nav>}
    {onClose&&session?.phase==='explained'&&<button className="text-button" disabled={!!session.pending||!session.provider?.configured} onClick={()=>{onClose?.();void command({type:'send',text:'Please explain this in more detail, showing the reasoning step by step.'}).catch(()=>{/* Shared request state presents retry and error feedback. */});}}>Explain in more detail</button>}
    <fieldset className="availability"><legend className="sr-only">Availability and edge glow</legend>
      <label><input type="radio" name="glow" checked={session?.glowMode==='always'} onChange={()=>dispatch({type:'glowMode',mode:'always'})}/><span><strong>Always on</strong><small>Faint glow when idle</small></span></label>
      <label><input type="radio" name="glow" checked={session?.glowMode!=='always'} onChange={()=>dispatch({type:'glowMode',mode:'needed'})}/><span><strong>Only when needed</strong><small>Glow only during use</small></span></label>
    </fieldset>
    <p className="settings-note">Captures only when you ask.<br/><span>Ctrl+Shift+O to capture. Right-click Otto or Ctrl+Shift+M to restore chat.</span></p>
    <fieldset className="mode-picker"><legend className="sr-only">Response style</legend>{(['hint','explain'] as const).map(mode=><label key={mode} className={(session?.mode??'explain')===mode?'active':''}><input type="radio" name="tutor-mode" checked={(session?.mode??'explain')===mode} onChange={()=>dispatch({type:'tutorMode',mode})}/>{mode==='hint'?'Hint':'Explain'}</label>)}</fieldset>
    <p className="disclosure">The full display supplies context; your selection is the focus. Sending shares that snapshot with the configured tutor.</p>
    {image&&<details className="snapshot-context"><summary>Snapshot & lesson context</summary><p className="disclosure">Numbered chats share this lesson automatically. Their transcripts remain separate; annotations do not follow scrolling.</p><SnapshotPreview image={image} caption="Original snapshot"/></details>}
    {!session?.provider?.configured&&<p className="disclosure">{session?.provider?.message||'Start the local backend with npm run dev.'}</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {!!session?.warnings?.length&&<details className="response-notes"><summary>Response notes</summary>{session.warnings.map((warning,index)=><p key={index}>{warning}</p>)}</details>}
    <div className="settings-actions"><button className="text-button" onClick={()=>onClose?onClose():dispatch({type:'mainChat'})}>{returnLabel}</button><button className="text-button" onClick={()=>dispatch({type:'quit'})}>Quit Otto</button></div>
  </div>;
}
