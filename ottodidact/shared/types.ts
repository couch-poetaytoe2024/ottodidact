export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

export type AnnotationKind = 'arrow' | 'circle' | 'explanation' | 'focus';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseAnnotation {
  id: string;
  kind: AnnotationKind;
  label?: string;
}

export interface ArrowAnnotation extends BaseAnnotation {
  kind: 'arrow';
  from: Point;
  to: Point;
}

export interface CircleAnnotation extends BaseAnnotation {
  kind: 'circle';
  center: Point;
  radius: number;
}

export interface ExplanationAnnotation extends BaseAnnotation {
  kind: 'explanation';
  anchor: Point;
  text: string;
}

export interface FocusAnnotation extends BaseAnnotation {
  kind: 'focus';
  target: Rect;
}

export type Annotation =
  | ArrowAnnotation
  | CircleAnnotation
  | ExplanationAnnotation
  | FocusAnnotation;

export interface BranchChat {
  annotationId: string;
  messages: ChatMessage[];
}

export interface StudySession {
  id: string;
  createdAt: number;
  updatedAt: number;
  screenshotDataUrl?: string;
  annotations: Annotation[];
  mainChat: ChatMessage[];
  branchChats: BranchChat[];
}

export interface ExplainRequest {
  sessionId: string;
  imageBase64: string;
  selection?: Rect;
  prompt?: string;
}

export interface ExplainResponse {
  summary: string;
  annotations: Annotation[];
  assistantMessage: ChatMessage;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  branchAnnotationId?: string;
}

export interface ChatResponse {
  message: ChatMessage;
}
