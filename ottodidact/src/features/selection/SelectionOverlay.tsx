import { useEffect, useRef, useState } from 'react';
import type { Point, Rect } from '@shared/types';
import { MIN_SELECTION, selectionRect, usableSelection } from '@shared/selection';
import { command, dispatch, useSessionStore } from '../../state/sessionStore';
import { EdgeGlow } from '../companion/EdgeGlow';
export function SelectionOverlay() {
  const start=useRef<Point>(),frame=useRef(0),latest=useRef<Rect>(),sent=useRef(false),cancelled=useRef(false);
  const outline=useRef<HTMLDivElement>(null),shade=useRef<HTMLDivElement>(null);
  const [pending,setPending]=useState<{rect:Rect;id:string}>();
  const [hint,setHint]=useState('Drag a region · Escape to cancel');
  const snapshot=useSessionStore(state=>state.session?.selectionSnapshot);
  const phase=useSessionStore(state=>state.session?.phase);
  const selectionId=useSessionStore(state=>state.session?.selectionId);
  // Pointer frames touch only these five elements, never React or shared IPC state.
  const paint=(rect?:Rect)=>{
    if(!outline.current||!shade.current)return;
    outline.current.hidden=!rect;
    if(rect)Object.assign(outline.current.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});
    const r=rect??{x:0,y:0,width:0,height:0},w=innerWidth,h=innerHeight;
    const strips=[{x:0,y:0,width:w,height:r.y},{x:0,y:r.y,width:r.x,height:r.height},{x:r.x+r.width,y:r.y,width:w-r.x-r.width,height:r.height},{x:0,y:r.y+r.height,width:w,height:h-r.y-r.height}];
    strips.forEach((b,i)=>{const node=shade.current!.children[i] as HTMLElement;Object.assign(node.style,{left:b.x+'px',top:b.y+'px',width:Math.max(0,b.width)+'px',height:Math.max(0,b.height)+'px'});});
  };
  const resetDrag=()=>{cancelAnimationFrame(frame.current);frame.current=0;start.current=undefined;};
  useEffect(()=>{
    resetDrag();sent.current=false;cancelled.current=false;paint();setPending(undefined);setHint('Drag a region · Escape to cancel');
    return resetDrag;
  },[phase,selectionId]);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){cancelled.current=true;resetDrag();setPending(undefined);dispatch({type:'cancel'});}};
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[]);
  useEffect(()=>{
    if(!pending||!snapshot||phase!=='selecting'||pending.id!==selectionId||sent.current||cancelled.current)return;
    sent.current=true;
    void command({type:'select',rect:pending.rect,selectionId:pending.id}).catch(error=>{
      sent.current=false;setPending(undefined);setHint(error instanceof Error?error.message:'Please try selecting again.');
    });
  },[pending,snapshot,phase,selectionId]);
  const point=(event:React.PointerEvent):Point=>({x:event.clientX,y:event.clientY});
  const region=(event:React.PointerEvent)=>selectionRect(start.current!,point(event),{width:innerWidth,height:innerHeight});
  return <div className="selection-overlay"
    onPointerDown={event=>{if(event.button!==0||!event.isPrimary||phase!=='selecting'||pending||sent.current||cancelled.current)return;start.current=point(event);paint();event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{if(!start.current)return;latest.current=region(event);if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;paint(latest.current);});}}
    onPointerCancel={()=>{resetDrag();paint();}}
    onLostPointerCapture={()=>{if(start.current){resetDrag();paint();}}}
    onPointerUp={event=>{
      if(!start.current)return;
      const result=region(event);resetDrag();
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
      if(usableSelection(result)&&selectionId){paint(result);setPending({rect:result,id:selectionId});}
      else {paint();setHint(`Drag at least ${MIN_SELECTION} × ${MIN_SELECTION} · Escape to cancel`);}
    }}>
    {snapshot&&<img className="selection-snapshot" src={snapshot.dataUrl} draggable={false} alt="Frozen screen snapshot"/>}
    <div ref={shade} className="selection-dimming" aria-hidden="true"><div/><div/><div/><div/></div>
    <div ref={outline} className="selection-rect" hidden><i/><i/><i/><i/></div>
    {phase==='selecting'&&<EdgeGlow/>}
    <div className="selection-hint" role="status">{pending&&!snapshot?'Finishing snapshot… · Escape to cancel':hint}</div>
  </div>;
}
