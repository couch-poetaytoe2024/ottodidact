import type { CSSProperties } from 'react';
import { annotationColor } from '@shared/presentation';
import { useSessionStore, command, dispatch } from '../../state/sessionStore';
import { MathText } from '../../components/MathText';
import { Icon } from '../../components/Icon';
import { ChatPanel } from './ChatPanel';
import { useBranchLayout } from './useBranchLayout';
import { useAnnotationAttention } from '../annotations/useAnnotationAttention';
import { emphasizedAnnotation } from '@shared/annotationOrganization';
export function BranchChat({branchId}:{branchId:string}) {
  const {session,error}=useSessionStore();
  const branch=session?.branches[branchId];
  const attention=useAnnotationAttention(branch?.annotationId);
  const panel=useBranchLayout(branchId,!!branch?.expanded,!!branch?.minimized,JSON.stringify([branch?.annotation?.taskRefs,branch?.annotation?.explanation,branch?.messages,session?.pending,session?.error,error]));
  if(!branch||!session)return null;
  const pending=session.pending?.conversationId===branchId;
  const failed=session.retry?.type==='send'&&session.retry.branchId===branchId&&!session.pending;
  const demo=session.provider?.provider==='mock';
  return <main ref={panel} {...attention} className={'panel annotation-card'+(branch.expanded?' card-expanded':'')} data-emphasized={emphasizedAnnotation(session)===branch.annotationId} data-minimized={!!branch.minimized} style={{'--annotation-color':annotationColor(branch.number)} as CSSProperties}>
    <header className="titlebar card-titlebar"><span className="card-number">{branch.number}</span><h1 title={branch.title}><span className="card-title-number">{branch.number} · </span>{branch.title||branch.annotation?.concept||'Annotation'}</h1><div className="window-actions"><button className="icon-button" aria-label={branch.minimized?'Restore explanation card':'Collapse explanation card'} title={branch.minimized?'Restore explanation card':'Collapse explanation card'} onClick={()=>dispatch({type:'minimizeBranch',branchId,minimized:!branch.minimized})}><Icon name={branch.minimized?'expand':'collapse'}/></button>{!branch.minimized&&<button className="icon-button" title={branch.expanded?'Hide conversation':'Show conversation'} aria-label={branch.expanded?'Hide conversation':'Show conversation'} onClick={()=>dispatch({type:'expandBranch',branchId,expanded:!branch.expanded})}><Icon name={branch.expanded?'chevronUp':'chevronDown'}/></button>}<button className="icon-button card-close" aria-label="Dismiss annotation chat" title="Dismiss annotation chat (history is kept)" onClick={()=>dispatch({type:'closeBranch',branchId})}><Icon name="close"/></button></div></header>
    <div className="card-body" hidden={!!branch.minimized}>
    {!!branch.annotation?.taskRefs?.length&&<p className="card-task-label" aria-label="Worksheet tasks">{branch.annotation.taskRefs.join(' / ')}</p>}
    {pending&&<div className="request-status" role="status"><span className="spinner"/><span>{demo?'Preparing demo…':'Explaining…'}</span><button onClick={()=>dispatch({type:'cancel'})}>Cancel</button></div>}
    {(error||(failed&&session.error))&&<p role="alert" className="error">{error||session.error}</p>}
    {failed&&<button onClick={()=>dispatch({type:'retry'})}>Retry request</button>}
    <ChatPanel key={branch.id} branch compact={!branch.expanded} introduction={<div className="card-explanation"><MathText text={branch.annotation?.explanation??branch.originalExplanation}/></div>} conversation={branch} onSend={text=>command({type:'send',branchId,text})} disabled={!!session.pending||!session.provider?.configured} demo={demo}/>
    {branch.expanded&&<footer className="card-footer"><button className="text-button" onClick={()=>dispatch({type:'mainChat'})}>Main chat</button><span>{demo?'Demo · shared lesson':'Shared lesson context'}</span></footer>}
    </div>
  </main>;
}
