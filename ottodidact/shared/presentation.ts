import type { Marker } from './milestone';
import type { Rect } from './types';
import { arrowTip } from './targetGeometry';
import { cardOrganizationPenalty } from './annotationOrganization';

const colors=['#f59b08','#1685ff','#ef4d46','#9853d8','#168e87'];
export const CARD_SIZE={width:268,height:164};
export const CARD_WIDTHS=[268,320,380,440] as const;
export interface CardMeasurement { width:number; height:number }
export const LAUNCHER_SIZE={width:108,height:108};
export const LAUNCHER_INSET=16;
// A 76px face and 16px native padding for transparent light; no separate control strip.
export function launcherButtonBounds(window:Rect):Rect {
  return {x:window.x+(window.width-76)/2,y:window.y+(window.height-76)/2,width:76,height:76};
}
/** Retain a deliberate position if the whole compact launcher still fits a monitor. */
export function restoreLauncherBounds(areas:Rect[],primary:Rect,saved?:{x:number;y:number}):Rect {
  if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){
    const candidate={...saved,...LAUNCHER_SIZE};
    if(areas.some(a=>candidate.x>=a.x&&candidate.y>=a.y&&candidate.x+candidate.width<=a.x+a.width&&candidate.y+candidate.height<=a.y+a.height))return candidate;
  }
  // Centering the face in this window places its body 16 DIPs from right/bottom.
  return clampPanel({x:primary.x+primary.width-LAUNCHER_SIZE.width,y:primary.y+primary.height-LAUNCHER_SIZE.height,...LAUNCHER_SIZE},primary);
}
export const annotationColor=(number=1)=>colors[(Math.max(1,number)-1)%colors.length];
export const markerBounds=(marker:Marker)=>marker.kind==='explanation'?(marker.target??marker.bounds):marker.bounds;
/** Stop the leader at the referenced shape, rather than drawing through its text. */
export function annotationLeader(marker:Marker,card:Rect) {
  const target=marker.kind==='rectangle'?marker.bounds:(marker.target??marker.bounds);
  const center={x:target.x+target.width/2,y:target.y+target.height/2};
  const beside=center.x<card.x||center.x>card.x+card.width;
  const from={x:Math.max(card.x,Math.min(card.x+card.width,center.x)),y:beside?card.y+card.height*.35:Math.max(card.y+12,Math.min(card.y+card.height-12,center.y))};
  const dx=from.x-center.x,dy=from.y-center.y;
  const rx=Math.max(1,target.width/2),ry=Math.max(1,target.height/2);
  const distance=marker.kind==='circle'?Math.hypot(dx/rx,dy/ry):Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);
  const to=marker.kind==='arrow'?arrowTip(target,from):marker.kind==='underline'?{x:center.x,y:Math.max(0,target.y-3)}:distance>1?{x:center.x+dx/distance,y:center.y+dy/distance}:center;
  const horizontal=Math.abs(to.x-from.x)>Math.abs(to.y-from.y);
  const approachY=marker.kind==='underline'?Math.max(0,to.y-Math.min(24,Math.abs(to.x-from.x)*.08)):to.y;
  const path=horizontal?`M ${from.x} ${from.y} C ${from.x+(to.x-from.x)*.48} ${from.y}, ${to.x-(to.x-from.x)*.35} ${approachY}, ${to.x} ${to.y}`:`M ${from.x} ${from.y} C ${from.x} ${from.y+(to.y-from.y)*.48}, ${to.x} ${to.y-(to.y-from.y)*.35}, ${to.x} ${to.y}`;
  return {from,to,path};
}
export function overlap(a:Rect,b:Rect) {
  return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
}
export function clampPanel(rect:Rect,area:Rect):Rect {
  const width=Math.min(rect.width,area.width),height=Math.min(rect.height,area.height);
  return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,rect.x))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,rect.y))),width:Math.round(width),height:Math.round(height)};
}

/** All coordinates are global DIPs. Keep the bottom anchor until focus/geometry requires a move. */
export function placeMainPanel(area:Rect,launcher:Rect,height:number,focus?:Rect,previous?:Rect,cards:Rect[]=[],minimized=false):Rect {
  const margin=8,gap=10;
  const usable={x:area.x+margin,y:area.y+margin,width:Math.max(1,area.width-margin*2),height:Math.max(1,area.height-margin*2)};
  const minWidth=Math.min(300,usable.width),minHeight=Math.min(minimized?56:300,usable.height);
  const width=Math.min(340,usable.width),wanted=Math.max(minHeight,Math.min(minimized?56:height,680,usable.height));
  const above=launcher.y-gap-usable.y;
  const below=usable.y+usable.height-launcher.y-launcher.height-gap;
  const dock=clampPanel({x:launcher.x+launcher.width-width,y:above>=minHeight?launcher.y-gap-Math.min(wanted,above):launcher.y+launcher.height+gap,width,height:above>=minHeight?Math.min(wanted,above):below>=minHeight?Math.min(wanted,below):wanted},usable);
  const inside=(r:Rect)=>r.x>=usable.x&&r.y>=usable.y&&r.x+r.width<=usable.x+usable.width&&r.y+r.height<=usable.y+usable.height;
  const clear=(r:Rect)=>!focus||overlap(r,focus)===0;
  // During a lesson reserve a side rail for main before placing any cards.
  // The snapshot fills the display; only the selected focus is an obstacle.
  const sideSpaces=focus?[
    {x:usable.x,y:usable.y,width:focus.x-gap-usable.x,height:usable.height},
    {x:focus.x+focus.width+gap,y:usable.y,width:usable.x+usable.width-focus.x-focus.width-gap,height:usable.height},
  ].filter(s=>s.width>=minWidth):[];
  const beside=(r:Rect)=>!focus||r.x+r.width<=focus.x-gap||r.x>=focus.x+focus.width+gap;
  if(previous){
    const bottom=previous.y+previous.height;
    const h=Math.min(wanted,bottom-usable.y);
    const stable={...previous,y:bottom-h,height:h};
    if(h>=minHeight&&inside(stable)&&clear(stable)&&(!sideSpaces.length||beside(stable))&&overlap(stable,launcher)===0){
      // Prefer internal scrolling to growing over an existing explanation card.
      if(previous.height>=minHeight&&cards.some(card=>overlap(stable,card)>overlap(previous,card))&&inside(previous)&&clear(previous))return previous;
      return stable;
    }
  }
  const sideCandidates=sideSpaces.flatMap(space=>{
    const w=Math.min(width,space.width),h=Math.min(wanted,space.height);
    return [dock,{x:space.x,y:space.y},{x:space.x+space.width-w,y:space.y}].map(p=>clampPanel({...p,width:w,height:h},space));
  }).filter(r=>inside(r)&&clear(r)&&overlap(r,launcher)===0);
  if(sideCandidates.length)return sideCandidates.reduce((a,b)=>Math.hypot(a.x-dock.x,a.y+a.height-dock.y-dock.height)<=Math.hypot(b.x-dock.x,b.y+b.height-dock.y-dock.height)?a:b);
  if(clear(dock)&&overlap(dock,launcher)===0&&!cards.some(card=>overlap(card,dock)>0))return dock;
  const spaces=[usable];
  for(const obstacle of focus?[focus,launcher]:[launcher])spaces.push(
    {x:usable.x,y:usable.y,width:obstacle.x-gap-usable.x,height:usable.height},
    {x:obstacle.x+obstacle.width+gap,y:usable.y,width:usable.x+usable.width-obstacle.x-obstacle.width-gap,height:usable.height},
    {x:usable.x,y:usable.y,width:usable.width,height:obstacle.y-gap-usable.y},
    {x:usable.x,y:obstacle.y+obstacle.height+gap,width:usable.width,height:usable.y+usable.height-obstacle.y-obstacle.height-gap},
  );
  const candidates=[dock];
  // If the focus fills nearly everything, keep a readable compact panel and
  // internal scrolling instead of covering it with the entire grown transcript.
  if(focus)candidates.push(clampPanel({x:dock.x+dock.width-minWidth,y:dock.y+dock.height-minHeight,width:minWidth,height:minHeight},usable));
  for(const space of spaces){
    // Intersect strips with the actual work area (taskbars and nonzero origins included).
    const x=Math.max(space.x,usable.x),y=Math.max(space.y,usable.y);
    const w=Math.min(space.x+space.width,usable.x+usable.width)-x,h=Math.min(space.y+space.height,usable.y+usable.height)-y;
    if(w<minWidth||h<minHeight)continue;
    const box={x,y,width:w,height:h};
    const size={width:Math.min(width,w),height:Math.min(wanted,h)};
    for(const point of [dock,{x,y},{x:x+w-size.width,y},{x,y:y+h-size.height},{x:x+w-size.width,y:y+h-size.height}])candidates.push(clampPanel({...point,...size},box));
  }
  const score=(r:Rect)=>(focus?overlap(r,focus)*100000:0)+overlap(r,launcher)*10000+cards.reduce((sum,card)=>sum+overlap(r,card),0)*2+(width-r.width)*12+(wanted-r.height)*3+Math.hypot(r.x-dock.x,r.y+r.height-dock.y-dock.height);
  return candidates.reduce((best,next)=>score(next)<score(best)?next:best);
}

/** Keep the question beside its selection, not detached at a distant screen edge. */
export function placeQuestionPanel(selection:Rect,workArea:Rect,size={width:400,height:150}):Rect {
  const margin=Math.min(12,workArea.width/4,workArea.height/4),gap=14;
  const area={x:workArea.x+margin,y:workArea.y+margin,width:workArea.width-margin*2,height:workArea.height-margin*2};
  const width=Math.min(size.width,area.width),height=Math.min(size.height,area.height);
  const cx=selection.x+selection.width/2,cy=selection.y+selection.height/2;
  const candidates=[
    {x:cx-width/2,y:selection.y+selection.height+gap},
    {x:cx-width/2,y:selection.y-height-gap},
    {x:selection.x+selection.width+gap,y:cy-height/2},
    {x:selection.x-width-gap,y:cy-height/2},
  ].map((point,index)=>{
    const rect=clampPanel({...point,width,height},area);
    return {rect,score:overlap(rect,selection)*10000+Math.hypot(rect.x-point.x,rect.y-point.y)*10+index};
  });
  return candidates.reduce((best,next)=>next.score<best.score?next:best).rect;
}
/** Place native cards near their targets, prioritizing clear content and readable panels. */
export function layoutCards(markers:Marker[],selection:Rect,area:Rect,main:Rect,sizes:Record<string,CardMeasurement>={}):Record<string,Rect> {
  const placed:Rect[]=[],result:Record<string,Rect>={};
  const peers:{marker:Marker;rect:Rect}[]=[];
  for(const marker of markers) {
    const size=sizes[marker.id]??CARD_SIZE;
    const width=Math.min(size.width,area.width),height=Math.min(size.height,area.height),gap=16;
    const t=marker.target??marker.bounds,cx=t.x+t.width/2,cy=t.y+t.height/2;
    const candidates=[
      {x:cx-width/2,y:selection.y-height-gap}, {x:cx-width/2,y:selection.y+selection.height+gap},
      {x:selection.x-width-gap,y:cy-height/2}, {x:selection.x+selection.width+gap,y:cy-height/2},
    ];
    // Build a tidy rail beside the focus when there is room. Neighboring cards
    // contribute new slots so their order doesn't depend on a coarse screen grid.
    for(const x of [selection.x+selection.width+gap,selection.x-width-gap])for(const other of placed)candidates.push({x,y:other.y+other.height+gap},{x,y:other.y-height-gap});
    for(let y=area.y+12;y<area.y+area.height;y+=height+gap)for(let x=area.x+12;x<area.x+area.width;x+=width+gap)candidates.push({x,y});
    const boxes=candidates.map(p=>clampPanel({...p,width,height},area));
    const score=(r:Rect)=>overlap(r,main)*10000+placed.reduce((sum,b)=>sum+overlap(r,b)*10000,0)+overlap(r,selection)*1000+Math.hypot(r.x+width/2-cx,r.y+height/2-cy)+(r.x>=selection.x+selection.width?0:r.x+r.width<=selection.x?30:350)+cardOrganizationPenalty(marker,r,peers);
    const best=boxes.reduce((a,b)=>score(b)<score(a)?b:a);
    placed.push(best);result[marker.id]=best;peers.push({marker,rect:best});
  }
  return result;
}

/** Use measured CSS layout sizes, never estimated characters or equal heights.
 * Coordinates stay display-local DIPs, independently of marker geometry. */
export function placeMeasuredCard(marker:Marker,focus:Rect,area:Rect,main:Rect,others:Rect[],measurements:CardMeasurement[],previous?:Rect,peers:{marker:Marker;rect:Rect}[]=[]):Rect {
  const margin=6,gap=12;
  const usable={x:area.x+margin,y:area.y+margin,width:Math.max(1,area.width-2*margin),height:Math.max(1,area.height-2*margin)};
  const obstacles=[main,...others],target=marker.target??focus;
  const padded=(r:Rect)=>({x:r.x-gap,y:r.y-gap,width:r.width+2*gap,height:r.height+2*gap});
  const clear=(r:Rect)=>overlap(r,focus)===0&&obstacles.every(o=>overlap(r,padded(o))===0);
  const fits=(r:Rect)=>r.x>=usable.x&&r.y>=usable.y&&r.x+r.width<=usable.x+usable.width&&r.y+r.height<=usable.y+usable.height;
  if(previous){
    const measurement=measurements.find(m=>Math.abs(m.width-previous.width)<=3);
    if(measurement){
      const stable={...previous,height:Math.min(measurement.height,usable.height)};
      if(fits(stable)&&clear(stable))return stable;
    }
  }
  const candidates:{rect:Rect;score:number}[]=[];
  for(const size of measurements){
    if(size.width>usable.width&&measurements.some(m=>m.width<=usable.width))continue;
    const width=Math.min(size.width,usable.width),height=Math.min(size.height,usable.height);
    const cx=target.x+target.width/2,cy=target.y+target.height/2;
    const xs=[usable.x,usable.x+usable.width-width,cx-width/2],ys=[usable.y,usable.y+usable.height-height,cy-height/2];
    for(const o of [focus,...obstacles]){xs.push(o.x-width-gap,o.x+o.width+gap);ys.push(o.y-height-gap,o.y+o.height+gap);}
    if(previous){xs.push(previous.x);ys.push(previous.y,previous.y+previous.height-height);}
    for(const x of xs)for(const y of ys){
      const r=clampPanel({x,y,width,height},usable);
      const collision=obstacles.reduce((sum,o)=>sum+overlap(r,padded(o)),0);
      const score=collision*100000+overlap(r,focus)*10000+(size.height-height)*2+height*.7+(width-CARD_SIZE.width)*.5+
        Math.hypot(r.x+width/2-cx,r.y+height/2-cy)*.2+(previous?Math.hypot(r.x-previous.x,r.y-previous.y)*.3:0)+cardOrganizationPenalty(marker,r,peers);
      candidates.push({rect:r,score});
    }
  }
  return candidates.reduce((a,b)=>a.score<=b.score?a:b).rect;
}
