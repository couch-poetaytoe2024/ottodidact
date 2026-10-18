import type { ReactNode } from 'react';
import type { Conversation } from '@shared/milestone';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { usePendingReply } from '../../state/sessionStore';
interface Props { conversation:Conversation; onSend:(text:string)=>Promise<void>; branch?:boolean; compact?:boolean; disabled?:boolean; demo?:boolean; references?:ReactNode; introduction?:ReactNode }
export function ChatPanel({conversation,onSend,branch=false,compact=false,disabled=false,demo=false,references,introduction}:Props) {
  const pendingText=usePendingReply(conversation.id);
  return <section className={'conversation'+(compact?' conversation-compact':'')} aria-label={branch?'Annotation conversation':'Main conversation'} aria-busy={disabled}>
    {(!compact||introduction)&&<MessageList messages={conversation.messages} demo={demo} references={references} introduction={introduction} compact={compact} pendingText={pendingText}/>}
    <MessageInput key={conversation.id} onSend={onSend} disabled={disabled} placeholder={branch?'Ask about this…':'Ask Otto…'}/>
  </section>;
}
