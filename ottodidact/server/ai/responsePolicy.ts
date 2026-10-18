import type { TutorRequest } from '../../shared/ai';

/** Lightweight preferences, not an extra model/classification call. The prompt
 * still asks the model to interpret the actual question, including exceptions. */
export function responsePolicy(request:Pick<TutorRequest,'kind'|'question'|'originalQuestion'|'mode'|'annotation'>,ceiling:number) {
  const intent=(text:string)=>/\b(?:just|only)\s+(?:give\s+(?:me\s+)?)?(?:the\s+)?(?:answer|result)\b|\bno (?:explanation|working)\b/i.test(text)?'answer-only':
    /\b(?:hint|nudge)\b|\bdo(?:n't| not) (?:give|reveal).*answer/i.test(text)?'hint':
    /\bwhy\b/i.test(text)?'explain':
    /\b(?:solve|calculate|compute|find the|answer the|what is the (?:answer|result))\b/i.test(text)?'solve':
    /\b(?:explain|why|understand|meaning|symbol)\b/i.test(text)?'explain':undefined;
  const lessonIntent=intent(request.kind==='explain'?request.question:request.originalQuestion)??(request.mode==='hint'?'hint':'explain');
  const currentIntent=intent(request.question)??(request.kind==='explain'?lessonIntent:'followup');
  const detailed=/\b(?:in detail|detailed|thorough|fully|step.by.step|derive|derivation|proof|prove|all (?:the )?steps)\b/i.test(request.question);
  const brief=/\b(?:brief|briefly|concise|short answer|one sentence|1 sentence)\b/i.test(request.question)||currentIntent==='answer-only';
  const local=request.kind==='chat'&&!!request.annotation;
  const style=brief?'brief':detailed?'detailed':local?'focused-local':'structured-main';
  // The Responses output budget includes reasoning as well as visible text.
  // Keep its headroom for brief answers too; style/verbosity controls their length.
  const inquiry=request.kind==='explain'?request.question:request.originalQuestion;
  const lessonFocus=/\bwhy\b/i.test(inquiry)?'causes-and-relationships':lessonIntent==='solve'?'operations-and-justification':/\b(?:symbol|sign|coefficient|vertex|exponent|feature|charge|bond|word)\b/i.test(inquiry)?'feature-in-context':'reasoning-and-connections';
  return {lessonIntent,lessonFocus,currentIntent,style,boxPolicy:currentIntent==='answer-only'?'none':'distinct-task-relevant',maxOutputTokens:ceiling};
}
