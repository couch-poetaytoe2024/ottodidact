import { useEffect } from 'react';
import { OttoButton } from './features/companion/OttoButton';
import { SelectionOverlay } from './features/selection/SelectionOverlay';
import { AnnotationLayer } from './features/annotations/AnnotationLayer';
import { MainPanel } from './features/chat/MainPanel';
import { BranchChat } from './features/chat/BranchChat';
import { dispatch, connectSession, useSessionStore } from './state/sessionStore';
import { DesktopEffects } from './features/companion/DesktopEffects';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { QuestionPanel } from './features/chat/QuestionPanel';
import { emphasizedAnnotation } from '@shared/annotationOrganization';

export default function App() {
  const {session}=useSessionStore();
  const route=location.hash.slice(2),branchId=route.startsWith('branch:')?route.slice(7):undefined;
  useEffect(connectSession,[]);
  useEffect(()=>{
    const update=()=>{document.documentElement.dataset.windowHidden=String(document.hidden);};
    update();document.addEventListener('visibilitychange',update);
    return()=>document.removeEventListener('visibilitychange',update);
  },[]);
  useEffect(()=>{
    if(route!=='panel'&&!branchId&&route!=='settings')return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')dispatch(branchId?{type:'closeBranch',branchId}:route==='settings'?{type:'closeSettings'}:{type:'dismiss'});};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[route,branchId]);
  if(!window.ottodidact)return <div className="panel"><h1>Ottodidact desktop</h1><p>Launch with npm run dev to use native capture and overlays.</p></div>;
  if(route==='companion')return <OttoButton/>;
  if(route==='selection')return <SelectionOverlay/>;
  if(!session)return null;
  if(route==='effects')return <DesktopEffects session={session}/>;
  if(route==='settings')return <SettingsPanel/>;
  if(route==='annotations')return <AnnotationLayer annotations={session.annotations} branches={session.branches} activeId={emphasizedAnnotation(session)} mainBounds={session.overlayMainBounds} controlsOnly/>;
  if(branchId)return <BranchChat branchId={branchId}/>;
  const asking=session.phase==='question'||session.phase==='loading';
  // Keep main mounted when provisional text becomes the validated answer, so
  // streaming completion doesn't reset its draft or the reader's scroll position.
  return <>{asking&&<div className="panel-view" hidden={session.panelView==='main'}><QuestionPanel/></div>}<div className="panel-view" hidden={asking&&session.panelView!=='main'}><MainPanel/></div></>;
}
