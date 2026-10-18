import type { Capture, Marker } from './milestone';
export const demoExplanation = 'Demo content: these sample markers illustrate a study workflow. The arrow marks a starting point; the circle highlights a detail. No image analysis was performed.';
export function mockExplanation(capture: Capture): { explanation: string; annotations: Marker[] } {
  const { x, y, width, height } = capture.rect;
  return { explanation: demoExplanation, annotations: [
    { id: `${capture.id}:arrow`, captureId: capture.id, kind: 'arrow', bounds: { x: x+width*.1, y:y+height*.1, width: Math.min(90,width*.35), height: Math.min(65,height*.35) }, text: 'Demo starting point' },
    { id: `${capture.id}:circle`, captureId: capture.id, kind: 'circle', bounds: { x:x+width*.55, y:y+height*.2, width: Math.min(100,width*.4), height: Math.min(100,height*.4) }, text: 'Demo detail' },
    { id: `${capture.id}:explanation`, captureId: capture.id, kind: 'explanation', bounds: { x, y:y+height+10, width:250, height:76 }, text: 'Demo: break a topic into small steps. Click to explore this sample.' },
  ] };
}
export function mockFollowup(text: string, branch: boolean): string {
  return `Demo ${branch ? 'annotation' : 'main'} reply to “${text}”: try describing one detail in your own words, then ask what connects it to the next step. This is a fixed sample, not an interpretation of your screenshot.`;
}
