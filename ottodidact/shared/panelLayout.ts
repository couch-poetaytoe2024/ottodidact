import type {Marker} from './milestone';
import type {Rect} from './types';
import {overlap,placeMeasuredCard,type CardMeasurement} from './presentation';

export interface MeasuredPanel {
  id:string; marker:Marker; bounds:Rect; measurements:CardMeasurement[];
  collapsed:CardMeasurement; minimized:boolean; expanded:boolean;
}
export interface PanelPlacement {bounds:Rect; minimized:boolean; expanded:boolean}
const padded=(r:Rect)=>({x:r.x-10,y:r.y-10,width:r.width+20,height:r.height+20});

/** One bounded layout pass for the entire overlay. Main is a hard reservation;
 * readable cards yield to compact headers if their content cannot fit. Source
 * targets are inputs only and are never changed by layout. */
export function layoutMeasuredPanels(entries:MeasuredPanel[],focus:Rect,area:Rect,main:Rect,preferredId?:string):Record<string,PanelPlacement> {
  const placed:Rect[]=[],peers:{marker:Marker;rect:Rect}[]=[],result:Record<string,PanelPlacement>={};
  const ordered=entries.slice().sort((a,b)=>Number(b.id===preferredId)-Number(a.id===preferredId)||Number(a.minimized)-Number(b.minimized));
  for(const entry of ordered){
    const place=(sizes:CardMeasurement[])=>placeMeasuredCard(entry.marker,focus,area,main,placed,sizes,entry.bounds,peers);
    let minimized=entry.minimized,expanded=entry.expanded;
    let bounds=place(minimized?[entry.collapsed]:entry.measurements);
    const collides=(r:Rect)=>[main,...placed].some(o=>overlap(r,padded(o))>0);
    if(!minimized&&(collides(bounds)||overlap(bounds,focus)>0)){
      let fallback:Rect|undefined;
      // Cap the scroll viewport, never the text or its font size.
      for(const height of [360,260,220]){
        const smaller=place(entry.measurements.map(m=>({...m,height:Math.min(m.height,height)})));
        if(!collides(smaller)){
          fallback=smaller;
          if(!overlap(smaller,focus)){bounds=smaller;expanded=true;break;}
        }
      }
      if(collides(bounds)||overlap(bounds,focus)>0){
        // In a nearly full-screen focus, permit the deliberately restored card
        // a readable scrolling viewport; keep its peers compact and accessible.
        if(entry.id===preferredId&&fallback){bounds=fallback;expanded=true;}
        else {minimized=true;bounds=place([entry.collapsed]);}
      }
    }
    result[entry.id]={bounds,minimized,expanded};placed.push(bounds);peers.push({marker:entry.marker,rect:bounds});
  }
  return result;
}
