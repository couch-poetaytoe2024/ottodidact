import type { LightGeometry } from './ambientLight';
import type { Rect, ChatMessage, Point } from './types';
import type { ImageContext, ModelAnnotation, ProviderStatus, TutorMode, TutorResponse,TutorProgress } from './ai';
export interface Capture { id: string; dataUrl: string; rect: Rect; pixelWidth: number; pixelHeight: number; scaleFactor: number; image?:ImageContext; displayId?:number }
export interface Marker { id: string; captureId: string; number?:number; kind: ModelAnnotation['kind']; bounds: Rect; text: string; concept?:string; model?:ModelAnnotation; target?:Rect; pointerless?:boolean; from?:Point; to?:Point;
  annotationId?:string; related?:Marker[]; purpose?:string|null;
  location?:{captureId:string;feature:string;image:'full'|'detail';sourceBounds:Rect;pixelBounds:Rect};
}
export interface Conversation { id: string; messages: ChatMessage[] }
export interface Branch extends Conversation { annotationId: string; captureId: string; number?:number; title?:string; originalQuestion: string; originalExplanation: string; originalMode?:TutorMode; annotation?:ModelAnnotation; image?:ImageContext; windowBounds?:Rect; open?:boolean; expanded?:boolean; minimized?:boolean }
export type GlowMode='always'|'needed';
export interface PendingRequest { id:string; kind:'explain'|'chat'; conversationId:string }
export type RetryRequest={type:'explain';question:string;mode?:TutorMode}|{type:'send';text:string;branchId?:string};
export interface Session {
  id: string; revision: number; phase: 'idle' | 'selecting' | 'question' | 'loading' | 'explained';
  capture?: Capture; question: string; explanation: string; annotations: Marker[];
  main: Conversation; branches: Record<string, Branch>; activeBranch?: string; error?: string;
  mode?:TutorMode; provider?:ProviderStatus; inputImage?:ImageContext; selectionSnapshot?:ImageContext;
  pending?:PendingRequest; retry?:RetryRequest; warnings?:string[]; usage?:TutorResponse['usage'];
  glowMode?:GlowMode; presented?:boolean; effectsSuspended?:boolean; lessonAnnotations?:Marker[]; snapshotStale?:boolean;
  selectionId?:string; mainMinimized?:boolean; panelView?:'main';
  overlayMainBounds?:Rect;
  annotationAttention?:Partial<Record<'hover'|'focus',{annotationId:string;owner:string}>>;
}
export type Command =
  | { type: 'capture' | 'cancel' | 'dismiss' | 'quit' | 'clear' | 'retry' | 'refreshProvider' | 'settings' | 'closeSettings' | 'mainChat' | 'finishLauncherMove' | 'questionPanel' }
  | { type:'closeBranch'; branchId?:string }
  | { type:'expandBranch'; branchId:string; expanded:boolean }
  | { type:'minimizeBranch'; branchId:string; minimized:boolean }
  | { type:'branchLayout'; branchId:string; expanded:boolean; minimized:boolean; measurements:{width:number;height:number}[]; collapsed?:{width:number;height:number} }
  | { type:'annotationAttention'; annotationId:string; channel:'hover'|'focus'; active:boolean }
  | { type:'glowMode'; mode:GlowMode }
  | { type:'moveLauncher'; dx:number; dy:number }
  | { type:'questionHeight'; height:number }
  | { type:'mainHeight'; height:number }
  | { type:'minimizeMain'; minimized:boolean }
  | { type: 'select'; rect: Rect; selectionId:string }
  | { type: 'explain'; question: string; mode?:TutorMode }
  | { type: 'tutorMode'; mode:TutorMode }
  | { type: 'openBranch'; annotationId: string }
  | { type: 'resumeBranch'; branchId: string }
  | { type: 'send'; branchId?: string; text: string }
  | { type: 'bring'; branchId: string; messageId: string };
export interface DesktopApi { getLightGeometry():Promise<LightGeometry>; subscribeLightGeometry(callback:(geometry:LightGeometry)=>void):()=>void; getState(): Promise<Session>; command(command: Command): Promise<void>; subscribe(callback: (state: Session) => void): () => void; subscribeProgress(callback:(progress:TutorProgress)=>void):()=>void }
