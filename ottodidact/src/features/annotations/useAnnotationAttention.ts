// Transient decoration must not clear a failed-request message or a draft.
export function attendAnnotation(annotationId:string,channel:'hover'|'focus',active:boolean) {
  void window.ottodidact?.command({type:'annotationAttention',annotationId,channel,active}).catch(()=>{});
}
export function useAnnotationAttention(annotationId?:string) {
  // Native focus/blur/hide owns window lifecycle. Avoid sending cleanup IPC
  // from a renderer after its BrowserWindow has already been destroyed.
  return {
    onMouseEnter:()=>annotationId&&attendAnnotation(annotationId,'hover',true),
    onMouseLeave:()=>annotationId&&attendAnnotation(annotationId,'hover',false),
    onFocusCapture:()=>annotationId&&attendAnnotation(annotationId,'focus',true),
  };
}
