import { useEffect, useRef, useState } from 'react';

/** Settings replace only the visible content; the mounted composer keeps its draft. */
export function useChatSettings(visible:boolean) {
  const [settingsOpen,setSettingsOpen]=useState(false),gear=useRef<HTMLButtonElement>(null);
  const closeSettings=()=>{setSettingsOpen(false);gear.current?.focus();};
  useEffect(()=>{if(!visible)setSettingsOpen(false);},[visible]);
  useEffect(()=>{
    if(!visible||!settingsOpen)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.stopImmediatePropagation();event.preventDefault();closeSettings();}
    };
    window.addEventListener('keydown',onKey,true);
    return()=>window.removeEventListener('keydown',onKey,true);
  },[visible,settingsOpen]);
  return {settingsOpen,setSettingsOpen,gear,closeSettings};
}
