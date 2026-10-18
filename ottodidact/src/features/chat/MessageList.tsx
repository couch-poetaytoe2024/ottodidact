import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ChatMessage } from '@shared/types';
import { MathText } from '../../components/MathText';
export function MessageList({messages,demo=false,references,introduction,compact=false,pendingText}:{messages:ChatMessage[];demo?:boolean;references?:ReactNode;introduction?:ReactNode;compact?:boolean;pendingText?:string}) {
  const list=useRef<HTMLUListElement>(null);
  const following=useRef(true),position=useRef<{id:string;offset:number}>(),top=useRef(0),expectedScroll=useRef<number>();
  const lastAnswer=[...messages].reverse().find(m=>m.role==='assistant')?.id;
  const remember=()=>{
    const node=list.current;if(!node||!node.clientHeight)return;
    // Ignore only the exact scroll we requested. A real user scroll in the same
    // animation frame must still change follow mode and the reading anchor.
    if(expectedScroll.current!==undefined&&Math.abs(node.scrollTop-expectedScroll.current)<1)return;
    expectedScroll.current=undefined;
    following.current=node.scrollHeight-node.clientHeight-node.scrollTop<48;top.current=node.scrollTop;
    const first=[...node.children].find(child=>child.getBoundingClientRect().bottom>node.getBoundingClientRect().top);
    if(first)position.current={id:(first as HTMLElement).dataset.messageId??'',offset:first.getBoundingClientRect().top-node.getBoundingClientRect().top};
  };
  useLayoutEffect(()=>{
    const node=list.current;if(!node)return;
    const restore=()=>{
      if(!node.clientHeight)return;
      if(introduction&&!messages.length&&!pendingText)node.scrollTop=0;
      else if(following.current)node.scrollTop=node.scrollHeight;
      else {
        const anchor=[...node.children].find(child=>(child as HTMLElement).dataset.messageId===position.current?.id);
        node.scrollTop=anchor?node.scrollTop+anchor.getBoundingClientRect().top-node.getBoundingClientRect().top-position.current!.offset:top.current;
      }
      expectedScroll.current=node.scrollTop;
    };
    restore();
    const observer=new ResizeObserver(restore);observer.observe(node);
    [...node.children].forEach(child=>observer.observe(child));
    return()=>observer.disconnect();
  },[messages,compact,!!pendingText]);
  return <ul ref={list} className={'message-list'+(compact?' history-compact':'')} aria-live="polite" onScroll={remember}>
    {introduction&&<li className="conversation-introduction" data-message-id="lesson-introduction">{introduction}</li>}
    {!messages.length&&!introduction&&<li className="empty-state">Explore this step, or connect it to another numbered box.</li>}
    {messages.map(message=><li key={message.id} hidden={compact} data-message-id={message.id} className={'message message-'+message.role}>
      <div className="message-body"><span className="sr-only">{message.role==='assistant'?(demo?'Otto demo':'Otto'):message.role==='user'?'You':'Context'}</span><div className="message-content"><MathText text={message.content}/></div>{message.id===lastAnswer&&references}</div>
    </li>)}
    {pendingText&&!compact&&<li className="message message-assistant reply-preview" data-message-id="reply-preview"><div className="message-body"><small>Reply in progress</small><div className="message-content"><MathText text={pendingText}/></div></div></li>}
  </ul>;
}
