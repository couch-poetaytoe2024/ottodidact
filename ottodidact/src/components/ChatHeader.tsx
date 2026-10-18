import type { ReactNode, RefObject } from 'react';
import { OttoLogo } from './OttoLogo';
import { Icon } from './Icon';

export function ChatHeader({demo, context, settingsOpen, settingsRef, onSettings, children}: {
  demo:boolean; context?:string; settingsOpen:boolean; settingsRef:RefObject<HTMLButtonElement>;
  onSettings:()=>void; children:ReactNode;
}) {
  return <header className="titlebar chat-header">
    <div className="panel-heading"><OttoLogo glass idle/><h1>Otto</h1>{context&&<span className="chat-kind">{context}</span>}{demo&&<span className="badge" title="Demo content: the captured image is not analyzed">DEMO</span>}</div>
    <div className="window-actions"><button ref={settingsRef} className="icon-button" aria-label="Otto settings" aria-expanded={settingsOpen} title="Settings and quit" onClick={onSettings}><Icon name="settings"/></button>{children}</div>
  </header>;
}
