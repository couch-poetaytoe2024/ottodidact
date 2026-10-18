import { desktopCapturer,nativeImage, type Display, type NativeImage } from 'electron';
import { focusOnSnapshot } from '../shared/coordinates';
import type { Rect } from '../shared/types';
import type { Capture } from '../shared/milestone';
import type { ImageContext } from '../shared/ai';
import { encodeSnapshot } from './captureEncoder';
import { MAX_DETAIL_BYTES,MAX_DETAIL_EDGE } from '../shared/ai';
import { focusDetailPlan } from '../shared/targetGeometry';
export let lastCaptureTiming={sourceMs:0,encodeMs:0,bytes:0};

// Called once per activation. Controls are hidden; the visible selection overlay
// is excluded by Windows capture protection (hidden on unsupported platforms).
export async function captureDisplay(display:Display):Promise<ImageContext> {
  const started=performance.now();
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{
    width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor),
  }});
  const source=sources.find(source=>source.display_id===String(display.id));
  if(!source||source.thumbnail.isEmpty())throw new Error('Could not capture this display. Please try again.');
  const received=performance.now(),snapshot=await prepareSnapshot(source.thumbnail,display);
  lastCaptureTiming={sourceMs:received-started,encodeMs:performance.now()-received,bytes:Math.floor(snapshot.dataUrl.length*.75)};
  return snapshot;
}

export async function prepareSnapshot(image:NativeImage,display:Display):Promise<ImageContext> {
  const original=image.getSize(),encoded=await encodeSnapshot(image);
  const size=encoded;
  return {
    captureId:crypto.randomUUID(),dataUrl:encoded.dataUrl,
    pixelWidth:size.width,pixelHeight:size.height,originalPixelWidth:original.width,originalPixelHeight:original.height,
    cropOffset:{x:0,y:0},displayScale:display.scaleFactor,
    // Local DIPs; the display's global origin is applied only by native windows.
    desktopRect:{x:0,y:0,width:display.bounds.width,height:display.bounds.height},
    selection:{x:0,y:0,width:1,height:1},
  };
}

export function selectSnapshot(snapshot:ImageContext,rect:Rect,displayId:number):Capture {
  const {image,focus}=focusOnSnapshot(snapshot,rect);
  return {id:image.captureId,dataUrl:image.dataUrl,rect:focus,pixelWidth:image.pixelWidth,pixelHeight:image.pixelHeight,scaleFactor:image.displayScale,image,displayId};
}

/** Local, bounded localization assistance; no second desktop capture or API call. */
export async function prepareFocusDetail(image:ImageContext,signal:AbortSignal):Promise<ImageContext> {
  if(image.detail||signal.aborted)return image;
  const plan=focusDetailPlan(image);if(!plan)return image;
  const crop=nativeImage.createFromDataURL(image.dataUrl).crop(plan.pixels);
  const encoded=await encodeSnapshot(crop,{maxEdge:MAX_DETAIL_EDGE,maxBytes:MAX_DETAIL_BYTES});
  if(signal.aborted)return image;
  return {...image,detail:{captureId:image.captureId,dataUrl:encoded.dataUrl,pixelWidth:encoded.width,pixelHeight:encoded.height,region:plan.region}};
}
