import type { Point, Rect } from './types';
import type { ImageContext } from './ai';
export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(a.x-b.x), height: Math.abs(a.y-b.y) };
}

/** Quantize focus to the exact (possibly resized) full image sent to the provider. */
export function focusOnSnapshot(snapshot:ImageContext,rect:Rect):{image:ImageContext;focus:Rect} {
  const desktop=snapshot.desktopRect;
  const pixels=toPixelRect(rect,desktop,{width:snapshot.pixelWidth,height:snapshot.pixelHeight});
  const selection={x:pixels.x/snapshot.pixelWidth,y:pixels.y/snapshot.pixelHeight,width:pixels.width/snapshot.pixelWidth,height:pixels.height/snapshot.pixelHeight};
  return {image:{...snapshot,selection},focus:{x:selection.x*desktop.width,y:selection.y*desktop.height,width:selection.width*desktop.width,height:selection.height*desktop.height}};
}
// Overlay coordinates are display-local DIPs; use the actual thumbnail size, not an assumed scale.
export function toPixelRect(rect: Rect, display: { width: number; height: number }, image: { width: number; height: number }): Rect {
  const sx = image.width / display.width, sy = image.height / display.height;
  const x = Math.max(0, Math.min(image.width - 1, Math.floor(rect.x * sx)));
  const y = Math.max(0, Math.min(image.height - 1, Math.floor(rect.y * sy)));
  const right = Math.max(x + 1, Math.min(image.width, Math.ceil((rect.x + rect.width) * sx)));
  const bottom = Math.max(y + 1, Math.min(image.height, Math.ceil((rect.y + rect.height) * sy)));
  return { x, y, width: right-x, height: bottom-y };
}
