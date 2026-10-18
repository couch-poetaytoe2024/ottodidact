import { useLayoutEffect, useRef } from 'react';
import { SettingsPanel } from '../settings/SettingsPanel';
import { ChatHeader } from '../../components/ChatHeader';
import { useChatSettings } from './useChatSettings';
import { MainChat } from './MainChat';
import { Icon } from '../../components/Icon';
import { dispatch, useSessionStore } from '../../state/sessionStore';

export function MainPanel() {
  const {session:current,error}=useSessionStore();
  const session=current!;
  const {settingsOpen,setSettingsOpen,gear,closeSettings}=useChatSettings(!!session.presented&&(session.panelView==='main'||(session.phase!=='question'&&session.phase!=='loading')));
  const panel=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(session.mainMinimized)return;
    const element=panel.current;if(!element)return;
    let frame=0;
    const measure=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const list=element.querySelector<HTMLElement>('.message-list');
        if(!list||!list.clientHeight)return;
        const style=getComputedStyle(list),children=[...list.children];
        const content=children.reduce((sum,child)=>sum+child.getBoundingClientRect().height,0)+Math.max(0,children.length-1)*parseFloat(style.rowGap||'0')+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
        const chrome=element.getBoundingClientRect().height-list.getBoundingClientRect().height;
        dispatch({type:'mainHeight',height:Math.max(300,Math.min(900,Math.ceil(chrome+content+12)))});
      });
    };
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll('.message,.main-content,.message-list').forEach(child=>observer.observe(child));
    measure();
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[session.main.id,session.main.messages.length,session.mainMinimized]);
  const demo=session.provider?.provider==='mock',needsSetup=!session.provider?.configured;
  return <div ref={panel} className="panel main-panel" data-minimized={!!session.mainMinimized}>
    <ChatHeader demo={demo} settingsOpen={settingsOpen} settingsRef={gear} onSettings={()=>{setSettingsOpen(open=>!open);if(session.mainMinimized)dispatch({type:'minimizeMain',minimized:false});}}>
      <button className="icon-button" aria-label={session.mainMinimized?'Restore main chat':'Minimize main chat'} title={session.mainMinimized?'Restore main chat':'Minimize main chat'} onClick={()=>dispatch({type:'minimizeMain',minimized:!session.mainMinimized})}><Icon name={session.mainMinimized?'expand':'collapse'}/></button>
      <button className="icon-button" aria-label="Dismiss explanation" title="Dismiss (Escape)" onClick={()=>dispatch({type:'dismiss'})}><Icon name="close"/></button>
    </ChatHeader>
    {settingsOpen&&!session.mainMinimized&&<SettingsPanel onClose={closeSettings}/>}
    <div className="main-content" hidden={!!session.mainMinimized||settingsOpen}>
    {needsSetup&&<section className="setup-notice" aria-label="Provider setup"><strong>Connect your tutor</strong><p>{session.provider?.message||'Start the local backend with npm run dev.'}</p><button onClick={()=>dispatch({type:'refreshProvider'})}>Check connection</button></section>}
    {(error||session.error)&&<p role="alert" className="error">{error||session.error}</p>}
    {session.pending&&<div className="request-status" role="status"><span className="spinner"/><span>{demo?'Preparing demo…':'Explaining your snapshot…'}</span><button onClick={()=>dispatch({type:'cancel'})}>Cancel</button></div>}
    {!session.pending&&session.retry&&<div className="retry-row"><span>Request did not finish.</span><button onClick={()=>dispatch({type:'retry'})} disabled={needsSetup}>Retry</button></div>}
    <MainChat/>
    </div>
  </div>;
}
