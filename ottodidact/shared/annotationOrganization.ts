import type { Branch, Marker, Session } from './milestone';
import type { Point, Rect } from './types';
import { arrowTip, paddedTarget } from './targetGeometry';

const center=(r:Rect)=>({x:r.x+r.width/2,y:r.y+r.height/2});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const overlap=(a:Rect,b:Rect)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
const owner=(mark:Marker)=>mark.annotationId??mark.id;
export function annotationMarkings(annotations:Marker[]):Marker[] {
  return annotations.flatMap(a=>[a,...(a.related??[])]).filter(a=>!a.pointerless);
}
/** Geometry checks use saved feature bounds; they never change a source target. */
export function segmentHitsRect(a:Point,b:Point,r:Rect):boolean {
  let low=0,high=1;
  for(const [start,delta,min,max] of [[a.x,b.x-a.x,r.x,r.x+r.width],[a.y,b.y-a.y,r.y,r.y+r.height]]){
    if(Math.abs(delta)<.00001){if(start<min||start>max)return false;continue;}
    const t1=(min-start)/delta,t2=(max-start)/delta;
    low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));
    if(low>high)return false;
  }
  return true;
}
export function pathsCross(a:Point[],b:Point[]):boolean {
  const cross=(p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
    const p=a[i-1],q=a[i],r=b[j-1],s=b[j];
    if(Math.max(p.x,q.x)<Math.min(r.x,s.x)-2||Math.max(r.x,s.x)<Math.min(p.x,q.x)-2||Math.max(p.y,q.y)<Math.min(r.y,s.y)-2||Math.max(r.y,s.y)<Math.min(p.y,q.y)-2)continue;
    if(cross(p,q,r)*cross(p,q,s)<=0&&cross(r,s,p)*cross(r,s,q)<=0)return true;
  }
  return false;
}
export interface ArrowRoute {points:Point[];path:string;connected:boolean;shape:'straight'|'curve'|'rounded'|'local'}
const linePath=(points:Point[])=>points.map((p,i)=>(i?'L':'M')+' '+p.x+' '+p.y).join(' ');
const mix=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const pathLength=(points:Point[])=>points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
/** Reject tight reversals, including a hairpin concealed by rounded SVG corners.
 * Ordinary bends and broad curves are fine; inspect only a short local span. */
export function hasSharpReversal(points:Point[]):boolean {
  const clean=points.filter((p,i)=>!i||distance(p,points[i-1])>.01);
  const reverses=(a:Point,b:Point,c:Point)=>{
    const length=distance(a,b)*distance(b,c);
    return length>.01&&((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y))/length<Math.cos(150*Math.PI/180);
  };
  const nearby=(index:number,step:number)=>{
    let left=12,p=clean[index];
    for(let j=index+step;j>=0&&j<clean.length;j+=step){
      const next=clean[j],length=distance(p,next);
      if(length>=left)return mix(p,next,left/length);
      left-=length;p=next;
    }
    return p;
  };
  for(let i=1;i<clean.length-1;i++)if(reverses(clean[i-1],clean[i],clean[i+1])||reverses(nearby(i,-1),clean[i],nearby(i,1)))return true;
  return false;
}
function bezier(a:Point,b:Point,c:Point,d:Point):Point[] {
  const steps=Math.min(160,Math.max(12,Math.ceil((distance(a,b)+distance(b,c)+distance(c,d))/5)));
  return Array.from({length:steps+1},(_,i)=>{const t=i/steps;return mix(mix(mix(a,b,t),mix(b,c,t),t),mix(mix(b,c,t),mix(c,d,t),t),t);});
}
function rounded(points:Point[]):Pick<ArrowRoute,'path'|'points'> {
  // Remove zero-length/collinear legs before rounding; never hide a zigzag in SVG.
  const clean=points.filter((p,i)=>!i||distance(p,points[i-1])>.1);
  for(let i=1;i<clean.length-1;i++){
    const a=clean[i-1],b=clean[i],c=clean[i+1];
    if(Math.abs(distance(a,b)+distance(b,c)-distance(a,c))<.1){clean.splice(i,1);i--;}
  }
  let path='M '+clean[0].x+' '+clean[0].y;const samples=[clean[0]];
  for(let i=1;i<clean.length-1;i++){
    const a=clean[i-1],b=clean[i],c=clean[i+1],r=Math.min(12,distance(a,b)/3,distance(b,c)/3);
    const enter=mix(b,a,r/distance(a,b)),leave=mix(b,c,r/distance(b,c));
    path+=' L '+enter.x+' '+enter.y+' Q '+b.x+' '+b.y+' '+leave.x+' '+leave.y;samples.push(enter);
    for(let step=1;step<=8;step++){const t=step/8;samples.push(mix(mix(enter,b,t),mix(b,leave,t),t));}
  }
  const end=clean.at(-1)!;path+=' L '+end.x+' '+end.y;samples.push(end);return {path,points:samples};
}
/** Evaluate all four attachments before adding bends. Tips remain at the saved
 * feature boundary; collision checks follow the actual curved path samples. */
export function routeArrow(mark:Marker,card:Rect|undefined,obstacles:Rect[],routes:Point[][]=[]):ArrowRoute|undefined {
  const target=mark.target??mark.bounds,c=center(target),from=mark.from??{x:c.x-24,y:target.y-24};
  const tip=mark.to??arrowTip(target,from),length=Math.max(1,distance(from,tip));
  const direction={x:(from.x-tip.x)/length,y:(from.y-tip.y)/length};
  const own=paddedTarget(target,1),blocked=[own,...obstacles.map(r=>paddedTarget(r,3)),...(card?[card]:[])];
  const safe=(points:Point[])=>points.every((point,i)=>i===0||!blocked.some(r=>segmentHitsRect(points[i-1],point,r)))&&!routes.some(route=>pathsCross(points,route));
  if(card){
    const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
    const x=clamp(tip.x,card.x+8,card.x+card.width-8),y=clamp(tip.y,card.y+8,card.y+card.height-8);
    const exits=[{point:{x:card.x-5,y},normal:{x:-1,y:0}},{point:{x:card.x+card.width+5,y},normal:{x:1,y:0}},
      {point:{x,y:card.y-5},normal:{x:0,y:-1}},{point:{x,y:card.y+card.height+5},normal:{x:0,y:1}}];
    const maxLength=distance(center(card),tip)*1.6+60;
    const best=(choices:ArrowRoute[])=>choices.filter(r=>pathLength(r.points)<=maxLength&&!hasSharpReversal(r.points)&&safe(r.points)).sort((a,b)=>pathLength(a.points)-pathLength(b.points))[0];
    const straight=best(exits.map(({point})=>({points:[point,tip],path:linePath([point,tip]),connected:true,shape:'straight'})));
    if(straight)return straight;
    const curves=exits.map(({point,normal}):ArrowRoute=>{
      const reach=Math.min(60,distance(point,tip)/3),a={x:point.x+normal.x*reach,y:point.y+normal.y*reach},b={x:tip.x+direction.x*reach,y:tip.y+direction.y*reach};
      return {points:bezier(point,a,b,tip),path:`M ${point.x} ${point.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${tip.x} ${tip.y}`,connected:true,shape:'curve'};
    });
    const curve=best(curves);if(curve)return curve;
    const bends:ArrowRoute[]=[];
    // Bound search to nearby obstacles; short local arrows remain the fallback.
    const nearby=obstacles.slice().sort((a,b)=>distance(center(a),tip)-distance(center(b),tip)).slice(0,6);
    for(const {point:exit} of exits){
      // End bends at the exact tip directly. A compulsory approach segment can
      // add a sharp hook just before the arrowhead, especially from below.
      // Target-bound collision checks decide which approach directions fit.
      const candidates=[[exit,{x:exit.x,y:tip.y},tip],[exit,{x:tip.x,y:exit.y},tip]];
      for(const r of nearby){
        for(const y of [r.y-16,r.y+r.height+16])candidates.push([exit,{x:exit.x,y},{x:tip.x,y},tip]);
        for(const x of [r.x-16,r.x+r.width+16])candidates.push([exit,{x,y:exit.y},{x,y:tip.y},tip]);
      }
      bends.push(...candidates.filter(points=>!hasSharpReversal(points)).map(points=>({...rounded(points),connected:true,shape:'rounded' as const})));
    }
    const bend=best(bends);if(bend)return bend;
  }
  const short=[{x:tip.x+direction.x*24,y:tip.y+direction.y*24},tip];
  if(safe(short))return {points:short,path:linePath(short),connected:false,shape:'local'};
}
export interface OrganizedMark {marker:Marker;annotationId:string;primary:boolean;visible:boolean;opacity:number;route?:ArrowRoute;reason?:string}
export interface OverlayPlan {marks:OrganizedMark[];crowded:boolean}

/** One overlay-wide pass: primaries before optional detail, priority before
 * collision resolution. Hidden detail stays in lesson state and in its chat. */
export function organizeAnnotations(annotations:Marker[],branches:Record<string,Branch>,activeId?:string,main?:Rect):OverlayPlan {
  const cards=Object.values(branches).filter(b=>b.open&&b.windowBounds).map(b=>({id:b.annotationId,rect:b.windowBounds!}));
  const all=annotationMarkings(annotations),primaryIds=new Set(annotations.map(a=>all.find(m=>owner(m)===a.id)?.id));
  const ordered=all.slice().sort((a,b)=>Number(primaryIds.has(b.id))-Number(primaryIds.has(a.id))||Number(owner(b)===activeId)-Number(owner(a)===activeId)||(a.number??0)-(b.number??0));
  const visible:Rect[]=[],routes:Point[][]=[],marks:OrganizedMark[]=[];
  let crowded=false;
  for(const marker of ordered){
    const annotationId=owner(marker),primary=primaryIds.has(marker.id),target=marker.target??marker.bounds;
    const primaryMark=all.find(m=>owner(m)===annotationId&&primaryIds.has(m.id));
    const active=annotationId===activeId;
    let reason:string|undefined;
    // Extra forms require an explicit teaching purpose AND different material.
    // A circle plus arrow at the same point adds no new source information.
    if(!primary&&(!marker.purpose?.trim()||(primaryMark?.target&&overlap(target,primaryMark.target)>Math.min(target.width*target.height,primaryMark.target.width*primaryMark.target.height)*.5)))reason='redundant-secondary';
    const markBounds=marker.kind==='arrow'?paddedTarget(target,6):paddedTarget(marker.bounds,4);
    if(!reason&&(visible.some(r=>overlap(markBounds,r)>0)||cards.some(c=>overlap(markBounds,c.rect)>0)||(main&&overlap(markBounds,main)>0)))reason='crowded';
    if(!primary&&!reason&&all.some(other=>owner(other)!==annotationId&&overlap(paddedTarget(target,22),other.target??other.bounds)>0))reason='crowded-secondary';
    const card=cards.find(c=>c.id===annotationId)?.rect;
    const obstacles=[...cards.filter(c=>c.id!==annotationId).map(c=>c.rect),...(main?[main]:[]),...all.filter(m=>owner(m)!==annotationId&&overlap(m.target??m.bounds,target)===0).map(m=>m.target??m.bounds)];
    const route=!reason&&marker.kind==='arrow'?routeArrow(marker,card,obstacles,routes):undefined;
    if(!reason&&marker.kind==='arrow'&&!route)reason='blocked-route';
    if(reason&&reason!=='redundant-secondary')crowded=true;
    if(!reason){visible.push(markBounds);if(route)routes.push(route.points);}
    marks.push({marker,annotationId,primary,visible:!reason,opacity:reason?0:activeId && !active? .24:1,route,reason});
  }
  return {marks,crowded};
}

export function emphasizedAnnotation(state:Pick<Session,'annotationAttention'>):string|undefined {
  return state.annotationAttention?.hover?.annotationId??state.annotationAttention?.focus?.annotationId;
}
/** Owner-aware releases prevent an old window's mouseleave from clearing a
 * newer card's focus/hover. No messages or branch identity are touched. */
export function annotationAttention(state:Session,annotationId:string,channel:'hover'|'focus',active:boolean,owner:string):Session {
  if(!state.annotations.some(a=>a.id===annotationId))return state;
  const current=state.annotationAttention?.[channel];
  if(active&&current?.annotationId===annotationId&&current.owner===owner)return state;
  if(!active&&(current?.owner!==owner||current.annotationId!==annotationId))return state;
  return {...state,annotationAttention:{...state.annotationAttention,[channel]:active?{annotationId,owner}:undefined}};
}

/** Penalize reversed neighboring cards and leaders that would cross occupied
 * cards. Existing valid placements are retained by the measured-size solver. */
export function cardOrganizationPenalty(marker:Marker,rect:Rect,peers:{marker:Marker;rect:Rect}[]):number {
  const t=center(marker.target??marker.bounds),c=center(rect);
  let penalty=0;
  for(const peer of peers){
    const pt=center(peer.marker.target??peer.marker.bounds),pc=center(peer.rect);
    if(Math.abs(c.x-pc.x)<Math.min(rect.width,peer.rect.width)&&Math.abs(t.y-pt.y)>12&&(t.y-pt.y)*(c.y-pc.y)<0)penalty+=300;
    if(marker.kind==='arrow'&&segmentHitsRect(c,t,peer.rect))penalty+=400;
    if(peer.marker.kind==='arrow'&&segmentHitsRect(pc,pt,rect))penalty+=400;
    if(marker.kind==='arrow'&&peer.marker.kind==='arrow'&&pathsCross([c,t],[pc,pt]))penalty+=180;
  }
  return penalty;
}
