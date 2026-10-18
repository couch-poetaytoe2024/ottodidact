import type { Point, Rect } from './types';

export const LIGHT_PERIOD_MS=24000;
export const EDGE_CORE_WIDTH=3;
export const LIGHT_SOURCE_GAP=3;
// Decorative surface only; the clickable face stays 76 DIPs.
export const LAUNCHER_HALO_EXTENT=320/76;
// One palette for the screen texture and the launcher. Alpha never oscillates.
export const LIGHT_STOPS:[number,[number,number,number]][]=[
  [0,[255,219,35]],[40,[255,135,18]],[65,[255,55,40]],
  [85,[30,100,255]],[100,[28,220,255]],[115,[30,100,255]],[140,[255,55,40]],
  [180,[255,219,35]],[220,[255,135,18]],[245,[255,55,40]],
  [265,[30,100,255]],[280,[28,220,255]],[295,[30,100,255]],[320,[255,55,40]],[360,[255,219,35]],
];
export const LIGHT_GRADIENT='conic-gradient(in srgb,'+LIGHT_STOPS.map(([angle,rgb])=>`rgb(${rgb.join(' ')}) ${angle}deg`).join(',')+')';
// Static gradient fallback for devices without WebGL. The full liquid material
// moves independent pools; neither material uses a conic/rainbow wheel.
export const GLASS_GRADIENT='radial-gradient(ellipse at 80% 85%,#24eeff 0%,#0084ff 16%,#6230ed 25%,transparent 48%),radial-gradient(ellipse at 78% 26%,#ff255c 0%,#ff4d19 28%,transparent 60%),linear-gradient(135deg,#fff05b 6%,#ffd00b 30%,#ff8e0b 55%,#fa3063 80%,#7138e7)';
export const lightPhase=(time:number)=>((time%LIGHT_PERIOD_MS)+LIGHT_PERIOD_MS)%LIGHT_PERIOD_MS;
export interface LightGeometry { display:Rect; window:Rect; visible:boolean }

/** CSS conic gradients start at twelve o'clock and rotate clockwise. Global DIPs
 * keep this field independent of monitor origin, resolution and display scale. */
export function lightColorAt(display:Rect,point:Point,time:number):[number,number,number] {
  const angle=Math.atan2(point.x-display.x-display.width/2,-(point.y-display.y-display.height/2))*180/Math.PI;
  const position=((angle-lightPhase(time)/LIGHT_PERIOD_MS*360)%360+360)%360;
  const end=LIGHT_STOPS.findIndex(([stop])=>stop>=position),[a,from]=LIGHT_STOPS[Math.max(0,end-1)],[b,to]=LIGHT_STOPS[end];
  const fraction=b===a?0:(position-a)/(b-a);
  return from.map((channel,i)=>Math.round(channel+(to[i]-channel)*fraction)) as [number,number,number];
}
