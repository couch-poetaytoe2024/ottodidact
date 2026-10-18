import { z } from 'zod';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 3072;
// Resource ceiling, not a requested annotation count. Most answers need only a few concepts.
export const MAX_ANNOTATIONS = 16;
export const MAX_RELATED_TARGETS = 5;
export const MAX_TASK_REFS = 8;
export const MAX_TASK_REF_LENGTH = 80;
export const MAX_DETAIL_BYTES = 768 * 1024;
export const MAX_DETAIL_EDGE = 1536;
const id = z.string().min(1).max(240);
const normalized = z.number().finite().min(0).max(1);
export const normalizedRectSchema = z.object({ x: normalized, y: normalized, width: normalized.positive(), height: normalized.positive() }).strict().refine(r => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001, 'Target extends outside the supplied image');
export const markingKindSchema=z.enum(['arrow','circle','explanation','underline','highlight','rectangle']);
export const targetSourceSchema=z.object({
  captureId:id,image:z.enum(['full','detail']),feature:z.string().min(1).max(240),
  expectedText:z.string().max(240).nullable(),observedText:z.string().max(240).nullable(),
  certainty:z.enum(['located','uncertain']),
}).strict();
export const modelMarkingSchema=z.object({kind:markingKindSchema,target:normalizedRectSchema.nullable(),source:targetSourceSchema,purpose:z.string().trim().min(1).max(240).nullable().optional()}).strict();
// Source question/subtask labels, independent of the app's stable card numbers.
// Null means the source does not establish a reliable task label.
export const taskRefsSchema=z.array(z.string().trim().min(1).max(MAX_TASK_REF_LENGTH).regex(/^[^\r\n]+$/)).min(1).max(MAX_TASK_REFS)
  .refine(refs=>new Set(refs.map(ref=>ref.toLocaleLowerCase())).size===refs.length,'Duplicate task references').nullable();
export const modelAnnotationSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/), kind: markingKindSchema,
  concept: z.string().min(1).max(240), explanation: z.string().min(1).max(1200),
  target: normalizedRectSchema.nullable(),
  // Optional for existing lessons; new provider output requires a list or null.
  taskRefs:taskRefsSchema.optional(),
  // Optional only for existing in-memory lessons and older offline fixtures.
  // New provider structured output requires both fields.
  source:targetSourceSchema.optional(),
  relatedTargets:z.array(modelMarkingSchema).max(MAX_RELATED_TARGETS).optional(),
}).strict();
export const modelExplanationSchema = z.object({
  explanation: z.string().min(1).max(16000),
  annotations: z.array(modelAnnotationSchema).max(MAX_ANNOTATIONS),
  warnings: z.array(z.string().max(500)).max(4),
}).strict().refine(r => new Set(r.annotations.map(a => a.id)).size === r.annotations.length, 'Duplicate annotation IDs');
const rect = z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().finite().positive(),height:z.number().finite().positive()}).strict();
export const imageContextSchema = z.object({
  captureId: id,
  dataUrl: z.string().max(Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 64).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/),
  pixelWidth: z.number().int().positive().max(MAX_IMAGE_EDGE), pixelHeight: z.number().int().positive().max(MAX_IMAGE_EDGE),
  originalPixelWidth:z.number().int().positive().max(32768), originalPixelHeight:z.number().int().positive().max(32768),
  cropOffset:z.object({x:z.number().finite().nonnegative(),y:z.number().finite().nonnegative()}).strict(),
  displayScale:z.number().finite().positive().max(8), desktopRect:rect,
  selection: normalizedRectSchema,
  detail:z.object({captureId:id,dataUrl:z.string().max(Math.ceil(MAX_DETAIL_BYTES*4/3)+64).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/),
    pixelWidth:z.number().int().positive().max(MAX_DETAIL_EDGE),pixelHeight:z.number().int().positive().max(MAX_DETAIL_EDGE),
    region:normalizedRectSchema,
  }).strict().optional(),
}).strict();
const lessonSchema=z.object({
  sessionId:id,captureId:id,
  index:z.array(z.object({annotationId:id,number:z.number().int().min(1).max(MAX_ANNOTATIONS),title:z.string().max(240),explanation:z.string().max(1200),taskRefs:taskRefsSchema.optional()}).strict()).max(MAX_ANNOTATIONS),
  threads:z.array(z.object({conversationId:id,annotationId:id.nullable(),number:z.number().int().min(1).max(MAX_ANNOTATIONS).nullable(),title:z.string().max(240),taskRefs:taskRefsSchema.optional(),messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(1200)}).strict()).max(6)}).strict()).max(MAX_ANNOTATIONS+1),
}).strict();
export type LessonContext=z.infer<typeof lessonSchema>;
export const tutorRequestSchema = z.object({
  requestId:id, sessionId:id, captureId:id, conversationId:id,
  kind:z.enum(['explain','chat']), mode:z.enum(['hint','explain']),
  question:z.string().trim().min(1).max(2000),
  originalQuestion:z.string().max(2000), originalExplanation:z.string().max(16000),
  annotation:modelAnnotationSchema.nullable(), image:imageContextSchema,
  history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(16000)}).strict()).max(12),
  lesson:lessonSchema.optional(),
}).strict().superRefine((r,ctx)=>{
  if(r.captureId!==r.image.captureId)ctx.addIssue({code:'custom',message:'Capture and image IDs do not match'});
  if(r.image.detail&&r.image.detail.captureId!==r.captureId)ctx.addIssue({code:'custom',message:'Detail belongs to another capture'});
  if(r.kind==='explain' && (r.annotation || r.history.length))ctx.addIssue({code:'custom',message:'Initial explanations cannot include chat history'});
  if(r.lesson) {
    const lesson=r.lesson;
    if(r.kind==='explain' || lesson.sessionId!==r.sessionId || lesson.captureId!==r.captureId)ctx.addIssue({code:'custom',message:'Lesson must belong to this chat session and capture'});
    if(new Set(lesson.index.map(a=>a.number)).size!==lesson.index.length || new Set(lesson.index.map(a=>a.annotationId)).size!==lesson.index.length || new Set(lesson.threads.map(t=>t.conversationId)).size!==lesson.threads.length)ctx.addIssue({code:'custom',message:'Duplicate lesson identities'});
    if(lesson.index.some(a=>!a.annotationId.startsWith(r.captureId+':')))ctx.addIssue({code:'custom',message:'Annotation index belongs to another capture'});
    for(const thread of lesson.threads) {
      const entry=lesson.index.find(a=>a.annotationId===thread.annotationId);
      const expected=thread.annotationId?`${r.sessionId}:branch:${thread.annotationId}`:`${r.sessionId}:main`;
      if(thread.conversationId===r.conversationId || thread.conversationId!==expected || (thread.annotationId?(!entry || entry.number!==thread.number):thread.number!==null))ctx.addIssue({code:'custom',message:'Invalid related thread identity'});
    }
  }
});
export const usageSchema=z.object({inputTokens:z.number().nonnegative(),outputTokens:z.number().nonnegative(),cacheReadInputTokens:z.number().nonnegative().optional(),cacheCreationInputTokens:z.number().nonnegative().optional(),estimatedCostUSD:z.number().nonnegative().optional()});
export const tutorResponseSchema=z.object({
  requestId:id,sessionId:id,captureId:id,conversationId:id,
  provider:z.enum(['openai','mock']),model:z.string(),
  result:modelExplanationSchema, usage:usageSchema.optional(),
}).strict();
export const tutorProgressSchema=z.object({requestId:id,sessionId:id,conversationId:id,text:z.string().max(16000)}).strict();
export type TutorProgress=z.infer<typeof tutorProgressSchema>;
export type ModelAnnotation=z.infer<typeof modelAnnotationSchema>;
export type ModelMarking=z.infer<typeof modelMarkingSchema>;
export type TargetSource=z.infer<typeof targetSourceSchema>;
export type ModelExplanation=z.infer<typeof modelExplanationSchema>;
export type ImageContext=z.infer<typeof imageContextSchema>;
export type TutorRequest=z.infer<typeof tutorRequestSchema>;
export type TutorResponse=z.infer<typeof tutorResponseSchema>;
export type TutorMode='hint'|'explain';
export interface ProviderStatus { provider:'openai'|'mock'; model:string; configured:boolean; message?:string }
