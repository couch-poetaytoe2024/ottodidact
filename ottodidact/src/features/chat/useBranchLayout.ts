import { useLayoutEffect,useRef } from 'react';
import { CARD_WIDTHS } from '@shared/presentation';
import { dispatch } from '../../state/sessionStore';

/** Measure actual safe-rendered prose/math at a few readable widths. The clone
 * is invisible and has no handlers; the mounted conversation/draft never moves
 * between React trees. Report once layout settles, not on each resize frame. */
export function useBranchLayout(branchId:string,expanded:boolean,minimized:boolean,contentKey:unknown) {
  const ref=useRef<HTMLElement>(null),last=useRef('');
  useLayoutEffect(()=>{
    const element=ref.current;if(!element)return;
    let timer=0,disposed=false;
    const measure=()=>{
      if(disposed)return;
      const widths=[...new Set((minimized?[240]:CARD_WIDTHS).map(width=>Math.max(100,Math.min(width,screen.availWidth-12))))];
      const clone=element.cloneNode(true) as HTMLElement;
      clone.classList.add('card-measure');clone.setAttribute('aria-hidden','true');clone.inert=true;
      document.body.appendChild(clone);
      const measurements=widths.map(width=>{
        clone.style.width=(width-12)+'px';
        // A fractional Windows scale can round the native client area down by
        // a DIP. Leave two pixels of breathing room instead of triggering a
        // scrollbar that changes wrapping and hides another line of prose.
        return {width,height:Math.max(45,Math.min(100000,Math.ceil(clone.getBoundingClientRect().height+14)))};
      });
      clone.dataset.minimized='true';
      const body=clone.querySelector<HTMLElement>('.card-body');if(body)body.hidden=true;
      const width=Math.max(100,Math.min(240,screen.availWidth-12));clone.style.width=(width-12)+'px';
      const collapsed={width,height:Math.max(45,Math.min(160,Math.ceil(clone.getBoundingClientRect().height+14)))};
      clone.remove();
      const message={type:'branchLayout' as const,branchId,expanded,minimized,measurements,collapsed},key=JSON.stringify(message);
      if(key!==last.current){last.current=key;dispatch(message);}
    };
    const schedule=()=>{window.clearTimeout(timer);timer=window.setTimeout(measure,100);};
    const observer=new ResizeObserver(schedule);observer.observe(element);
    element.querySelectorAll('.message,.card-explanation,.titlebar,.message-input,.request-status,.error').forEach(node=>observer.observe(node));
    schedule();void document.fonts.ready.then(schedule);
    return()=>{disposed=true;observer.disconnect();window.clearTimeout(timer);};
  },[branchId,expanded,minimized,contentKey]);
  return ref;
}
