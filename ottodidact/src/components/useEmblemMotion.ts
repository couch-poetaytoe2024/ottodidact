import { useLayoutEffect, type RefObject } from 'react';
import { lightPhase } from '@shared/ambientLight';

/** Decorative motion only: no capture, pointer tracking, session or model state. */
export function useEmblemMotion(ref:RefObject<HTMLSpanElement>,enabled:boolean,colorMotion:boolean) {
  useLayoutEffect(()=>{
    if(!enabled)return;
    const element=ref.current!,media=matchMedia('(prefers-reduced-motion: reduce)');
    let intersects=false,frame=0;
    const update=()=>{
      const visible=intersects&&!document.hidden;
      element.dataset.motionVisible=String(visible);
      element.dataset.colorMotion=String(colorMotion);
      const lights=element.querySelector('.otto-glass-light')?.getAnimations({subtree:true})??[];
      for(const light of lights){
        light.currentTime=colorMotion&&!media.matches?lightPhase(Date.now()):0;
        if(visible&&colorMotion&&!media.matches)light.play();else light.pause();
      }
    };
    const mediaChanged=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
    const observer=new IntersectionObserver(entries=>{intersects=entries[0]?.isIntersecting??false;update();});
    observer.observe(element);update();
    document.addEventListener('visibilitychange',update);media.addEventListener('change',mediaChanged);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',update);media.removeEventListener('change',mediaChanged);};
  },[ref,enabled,colorMotion]);
}
