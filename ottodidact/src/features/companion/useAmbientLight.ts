import { useLayoutEffect, type RefObject } from 'react';
import { GLASS_GRADIENT, LIGHT_PERIOD_MS, lightPhase } from '@shared/ambientLight';

/** Rejoin the same clock after mount, hide/restore or reduced-motion changes.
 * The full-screen texture stays compositor animated; there is no frame IPC. */
export function useEdgeClock(ref:RefObject<HTMLDivElement>) {
  useLayoutEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)'),element=ref.current!;
    const update=()=>{
      for(const animation of element.getAnimations({subtree:true})){
        animation.currentTime=media.matches?0:lightPhase(Date.now());
        if(document.hidden||media.matches)animation.pause();else animation.play();
      }
    };
    update();document.addEventListener('visibilitychange',update);media.addEventListener('change',update);
    return()=>{document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update);};
  },[ref]);
}

export function useLauncherLight(ref:RefObject<HTMLButtonElement>,mode:'off'|'faint'|'bright') {
  useLayoutEffect(()=>{
    const element=ref.current!,media=matchMedia('(prefers-reduced-motion: reduce)');
    element.style.setProperty('--glass-palette',GLASS_GRADIENT);
    let frame=0,last=0;
    const paint=(now:number)=>{
      element.style.setProperty('--glass-angle',`${lightPhase(now)/LIGHT_PERIOD_MS*360}deg`);
      // CSS fallback only; the WebGL body and external halo share uPhase.
      element.style.setProperty('--glass-drift',`${Math.sin(lightPhase(now)/LIGHT_PERIOD_MS*Math.PI*2)*5}deg`);
      element.dataset.lightPhase=String(lightPhase(now));
    };
    const tick=(now:number)=>{
      if(now-last>=1000/30){paint(Date.now());last=now;}
      frame=requestAnimationFrame(tick);
    };
    const update=()=>{
      cancelAnimationFrame(frame);paint(media.matches||mode==='off'?0:Date.now());
      if(!document.hidden&&!media.matches&&mode!=='off')frame=requestAnimationFrame(tick);
    };
    update();
    document.addEventListener('visibilitychange',update);media.addEventListener('change',update);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update);};
  },[ref,mode]);
}

export const edgeAnimationDuration=LIGHT_PERIOD_MS+'ms';
