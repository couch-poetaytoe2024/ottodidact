import { useState } from 'react';
import type { ImageContext } from '@shared/ai';
export function SnapshotPreview({image,caption='Image to send'}:{image:ImageContext;caption?:string}) {
  const [enlarged,setEnlarged]=useState(false);
  return <figure className={'snapshot'+(enlarged?' snapshot-enlarged':'')}>
    <div className="preview-image"><img src={image.dataUrl} alt={caption}/></div>
    <figcaption>{caption} · {image.pixelWidth} × {image.pixelHeight} px{image.pixelWidth!==image.originalPixelWidth||image.pixelHeight!==image.originalPixelHeight?' (resized)':''}</figcaption>
    <button className="preview-toggle" onClick={()=>setEnlarged(value=>!value)} aria-expanded={enlarged}>{enlarged?'Fit preview':'View full-size pixels'}</button>
  </figure>;
}
