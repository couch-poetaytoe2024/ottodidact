import type { ImageContext,ModelAnnotation,TargetSource } from './ai';
import type { Point,Rect } from './types';

export const MARK_PADDING=2;
export function paddedTarget(rect:Rect,padding=MARK_PADDING):Rect {
  return {x:rect.x-padding,y:rect.y-padding,width:rect.width+padding*2,height:rect.height+padding*2};
}
/** Intersect a ray with the tight feature box, then stop just outside it.
 * This uses real bounds, never estimates of character width or a selection edge. */
export function arrowTip(target:Rect,from:Point,gap=3):Point {
  const center={x:target.x+target.width/2,y:target.y+target.height/2};
  let dx=from.x-center.x,dy=from.y-center.y;
  if(Math.hypot(dx,dy)<.001){dx=0;dy=-1;}
  const fraction=1/Math.max(Math.abs(dx)/(target.width/2),Math.abs(dy)/(target.height/2));
  const length=Math.hypot(dx,dy);
  return {x:center.x+dx*fraction+dx/length*gap,y:center.y+dy*fraction+dy/length*gap};
}
const normalizeText=(value:string)=>value.normalize('NFC').trim().replace(/\u2212/g,'-').replace(/\s+/g,' ');
export function resolveTarget(target:Rect|null,source:TargetSource|undefined,image:ImageContext,requireSource=false):Rect|undefined {
  if(!target||(!source&&requireSource))return;
  if(source){
    if(source.captureId!==image.captureId||source.certainty!=='located'||!source.feature.trim())return;
    if(source.expectedText!==null&&(!source.observedText||normalizeText(source.expectedText)!==normalizeText(source.observedText)))return;
    if(source.image==='detail'){
      const detail=image.detail;if(!detail||detail.captureId!==source.captureId)return;
      const r=detail.region;
      return {x:r.x+target.x*r.width,y:r.y+target.y*r.height,width:target.width*r.width,height:target.height*r.height};
    }
  }
  return {...target};
}
export function canonicalAnnotation(annotation:ModelAnnotation,image:ImageContext,requireSource=false):ModelAnnotation {
  const normalize=(mark:Pick<ModelAnnotation,'kind'|'target'|'source'>)=>({...mark,
    target:resolveTarget(mark.target,mark.source,image,requireSource)??null,
    ...(mark.source?{source:{...mark.source,image:'full' as const}}:{}),
  });
  return {...annotation,...normalize(annotation),relatedTargets:annotation.relatedTargets?.map(mark=>({...mark,...normalize(mark),source:{...mark.source,image:'full'}}))};
}
/** One focus crop per initial explanation, derived from the exact saved image.
 * Avoid a redundant image for already-small snapshots or nearly full focus. */
export function focusDetailPlan(image:ImageContext):{pixels:Rect;region:Rect}|undefined {
  const {pixelWidth:w,pixelHeight:h,selection:s}=image;
  if(Math.max(w,h)<=1200||s.width*s.height>.65)return;
  const x=Math.max(0,Math.floor(s.x*w)-4),y=Math.max(0,Math.floor(s.y*h)-4);
  const right=Math.min(w,Math.ceil((s.x+s.width)*w)+4),bottom=Math.min(h,Math.ceil((s.y+s.height)*h)+4);
  const pixels={x,y,width:right-x,height:bottom-y};
  return {pixels,region:{x:x/w,y:y/h,width:pixels.width/w,height:pixels.height/h}};
}
