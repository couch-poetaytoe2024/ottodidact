import { useEffect, useState } from 'react';
import type { Session } from '@shared/milestone';
import { appearance } from '@shared/appearance';
import { OttoLogo } from '../../components/OttoLogo';
import { EdgeGlow } from './EdgeGlow';
import { AnnotationLayer } from '../annotations/AnnotationLayer';
import { emphasizedAnnotation } from '@shared/annotationOrganization';

export function DesktopEffects({session}:{session:Session}) {
  const visual=appearance(session),r=session.capture?.rect;
  const [{width,height},setSize]=useState({width:innerWidth,height:innerHeight});
  useEffect(()=>{const resize=()=>setSize({width:innerWidth,height:innerHeight});window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const left=r?Math.max(8,Math.min(width-210,r.x+r.width-32)):8;
  const top=r?Math.max(8,Math.min(height-44,r.y+r.height+8)):8;
  const imageRect=session.capture?.image?.desktopRect??{x:0,y:0,width,height};
  return <div className="desktop-effects" data-glow={visual.glow}>
    {visual.dim&&r&&session.capture&&session.phase!=='selecting'&&<div className="frozen-focus" style={{left:r.x,top:r.y,width:r.width,height:r.height}} aria-hidden="true"><img src={session.capture.dataUrl} style={{left:imageRect.x-r.x,top:imageRect.y-r.y,width:imageRect.width,height:imageRect.height}} draggable={false}/></div>}
    {visual.dim && r && <div className="screen-dimming" aria-hidden="true">
      <div style={{left:0,top:0,width,height:r.y}}/>
      <div style={{left:0,top:r.y,width:r.x,height:r.height}}/>
      <div style={{left:r.x+r.width,top:r.y,width:Math.max(0,width-r.x-r.width),height:r.height}}/>
      <div style={{left:0,top:r.y+r.height,width,height:Math.max(0,height-r.y-r.height)}}/>
    </div>}
    {session.presented&&!session.snapshotStale&&!session.effectsSuspended&&r&&(session.phase==='question'||session.phase==='loading'||visual.dim)&&<div className="focus-outline" style={{left:r.x,top:r.y,width:r.width,height:r.height}} aria-hidden="true"><i/><i/><i/><i/></div>}
    {/* Snapshot, dimming and graphics share one native compositor surface. A
        separately promoted effects window can no longer cover a pointer. */}
    {session.presented&&!session.snapshotStale&&!session.effectsSuspended&&session.phase==='explained'&&<AnnotationLayer annotations={session.annotations} branches={session.branches} activeId={emphasizedAnnotation(session)} mainBounds={session.overlayMainBounds}/>}
    {visual.glow!=='off' && session.phase!=='selecting' && <EdgeGlow strength={visual.glow} launcher/>}
    {visual.processing && <div className="otto-pointer" style={{left,top}} role="status"><span className="pointer-logo"><OttoLogo/></span><span>Explaining this snapshot</span></div>}
  </div>;
}
