import type { Point,Rect } from './types';
import { normalizeRect } from './coordinates';
export const MIN_SELECTION=6;
export function selectionRect(start:Point,end:Point,size:{width:number;height:number}):Rect {
  const clamp=(p:Point)=>({x:Math.max(0,Math.min(size.width,p.x)),y:Math.max(0,Math.min(size.height,p.y))});
  return normalizeRect(clamp(start),clamp(end));
}
export function usableSelection(rect:Rect){return rect.width>=MIN_SELECTION&&rect.height>=MIN_SELECTION;}
