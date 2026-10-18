import { dispatch, useSessionStore } from '../../state/sessionStore';
import { appearance } from '@shared/appearance';
import { useRef } from 'react';
import { useLauncherLight } from './useAmbientLight';
import { OttoLogo } from '../../components/OttoLogo';
export function OttoButton() {
  const gesture=useRef({x:0,y:0,dragging:false,down:false});
  const state=useSessionStore(store=>store.session);
  const button=useRef<HTMLButtonElement>(null),glow=state?appearance(state).glow:'off';
  useLauncherLight(button,glow);
  const finish=()=>{const g=gesture.current;g.down=false;if(g.dragging)dispatch({type:'finishLauncherMove'});};
  return <div className="otto-companion" data-glow={glow}>
    <button ref={button} className="otto-button" title="Click to select · drag to move · right-click for chat/settings · Ctrl+Shift+M to restore chat" aria-label="Capture a region with Otto"
      onContextMenu={event=>{event.preventDefault();dispatch({type:'mainChat'});}}
      onPointerDown={event=>{if(event.button!==0)return;gesture.current={x:event.screenX,y:event.screenY,dragging:false,down:true};event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{
        const g=gesture.current;if(!g.down)return;
        const dx=event.screenX-g.x,dy=event.screenY-g.y;
        if(!g.dragging&&Math.hypot(dx,dy)<5)return;
        g.dragging=true;g.x=event.screenX;g.y=event.screenY;dispatch({type:'moveLauncher',dx,dy});
      }}
      onPointerUp={finish}
      onPointerCancel={()=>{finish();gesture.current.dragging=true;}}
      onClick={event=>{if(event.detail===0||!gesture.current.dragging)dispatch({type:'capture'});}}><OttoLogo glass idle haloStrength={0}/></button>
  </div>;
}
