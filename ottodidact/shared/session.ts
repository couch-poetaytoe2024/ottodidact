import type { Session, Capture } from './milestone';
import type { ChatMessage } from './types';
export function emptySession(id: string): Session { return { id, revision:0, phase:'idle', question:'', explanation:'', annotations:[], main:{id:`${id}:main`,messages:[]}, branches:{} }; }
export function capturedSession(capture: Capture): Session { return { ...emptySession(capture.id), capture, inputImage:capture.image, mode:'explain', phase:'question' }; }
export function message(role: ChatMessage['role'], content: string): ChatMessage { return { id:crypto.randomUUID(), role, content, createdAt:Date.now() }; }
export function openBranch(state: Session, annotationId: string): Session {
  const annotation = (state.lessonAnnotations??state.annotations).find(a => a.id === annotationId);
  if (!annotation || !state.capture) throw new Error('Annotation is no longer available.');
  const id = `${state.id}:branch:${annotationId}`;
  const branch = state.branches[id] ?? { id, annotationId, captureId:state.capture.id, number:annotation.number??state.annotations.indexOf(annotation)+1, title:annotation.concept??annotation.kind, originalQuestion:state.question, originalExplanation:state.explanation, originalMode:state.mode, annotation:annotation.model, image:state.inputImage, messages:[] };
  return { ...state, activeBranch:id, branches:{...state.branches,[id]:branch} };
}
export function sendMessage(state: Session, text: string, branchId: string | undefined, answer: string): Session {
  const messages = [message('user',text),message('assistant',answer)];
  if (!branchId) return {...state, main:{...state.main,messages:[...state.main.messages,...messages]}};
  const branch = state.branches[branchId];
  if (!branch) throw new Error('Unknown branch');
  return {...state,branches:{...state.branches,[branchId]:{...branch,messages:[...branch.messages,...messages]}}};
}
export function bringToMain(state: Session, branchId: string, messageId: string): Session {
  const branch = state.branches[branchId];
  const answer = branch?.messages.find(m=>m.id===messageId && m.role==='assistant');
  if (!answer) throw new Error('Choose a branch answer to copy.');
  return {...state,main:{...state.main,messages:[...state.main.messages,message('assistant',`From ${branch.annotationId}:\n${answer.content}`)]}};
}
