import { useRef, type CSSProperties } from 'react';
import { GLASS_GRADIENT, LIGHT_PERIOD_MS } from '@shared/ambientLight';
import { useEmblemMotion } from './useEmblemMotion';
import { LiquidGlass } from './LiquidGlass';

/** One face at both sizes; only the two emblems opt into decorative eye motion. */
export function OttoLogo({glass=false,idle=false,colorMotion=true,haloStrength=.6}:{glass?:boolean;idle?:boolean;colorMotion?:boolean;haloStrength?:number}={}) {
  const face=useRef<HTMLSpanElement>(null);
  useEmblemMotion(face,glass||idle,colorMotion);
  return <span ref={face} className={'otto-logo'+(glass?' otto-glass':'')} data-idle={idle} data-motion-visible="false" aria-hidden="true" style={glass?{'--glass-palette':GLASS_GRADIENT,'--glass-duration':LIGHT_PERIOD_MS+'ms'} as CSSProperties:undefined}>
  {glass&&<><span className="otto-glass-light"><i className="otto-glass-pool glass-gold"/><i className="otto-glass-pool glass-warm"/><i className="otto-glass-pool glass-cool"/></span><span className="otto-glass-depth"/>
    <svg className="otto-reflections" viewBox="0 0 62 62" fill="none">
      <path d="M 3 33 C 1 17 13 3 29 2" stroke="#ffffed" strokeWidth="1.35" strokeLinecap="round"/>
      <path d="M 43 4 C 54 8 60 18 60 29" stroke="#fff0fa" strokeOpacity=".9" strokeWidth=".9" strokeLinecap="round"/>
      <path d="M 58 42 C 52 57 38 63 25 58" stroke="#ceffff" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M 8 24 C 8 17 13 10 20 7" stroke="#fffef3" strokeOpacity=".9" strokeWidth="1.15" strokeLinecap="round"/>
      <ellipse cx="16" cy="13.5" rx="7.2" ry="3.2" transform="rotate(-45 16 13.5)" fill="#fffff5" fillOpacity=".97"/>
      <path d="M 48 44 C 45 50 40 53 34 54" stroke="#d8ffff" strokeOpacity=".78" strokeWidth="1.15" strokeLinecap="round"/>
    </svg><LiquidGlass motion={colorMotion} halo={haloStrength}/></>}
  <span className="otto-eyes"><span className="otto-eye"/><span className="otto-eye"/></span>
</span>; }
