import type { PixelJob, PixelResult } from '@shared/captureEncoding';
const bridge=(window as unknown as {snapshotEncoder:{receive(callback:(job:PixelJob)=>void):void;complete(result:PixelResult):void}}).snapshotEncoder;
// This hidden, sandboxed renderer is separate from the selector and Electron main.
// Chromium performs resizing/PNG compression here, so neither can stall pointer input.
bridge.receive(async job=>{
  try {
    const rgba=new Uint8ClampedArray(job.bitmap.length);
    // NativeImage.toBitmap uses BGRA on Windows. Desktop snapshots are opaque.
    for(let i=0;i<rgba.length;i+=4){rgba[i]=job.bitmap[i+2];rgba[i+1]=job.bitmap[i+1];rgba[i+2]=job.bitmap[i];rgba[i+3]=255;}
    const original=await createImageBitmap(new ImageData(rgba,job.width,job.height));
    try {
      let ratio=Math.min(1,job.maxEdge/job.width,job.maxEdge/job.height);
      for(;;) {
        const width=Math.max(1,Math.round(job.width*ratio)),height=Math.max(1,Math.round(job.height*ratio));
        const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d')!;
        context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
        context.drawImage(original,0,0,width,height);
        const blob=await canvas.convertToBlob({type:'image/png'});
        if(blob.size<=job.maxBytes) {
          const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Snapshot encoding failed'));reader.readAsDataURL(blob);});
          bridge.complete({id:job.id,image:{dataUrl,width,height,bytes:blob.size}});return;
        }
        if(Math.max(width,height)<=800)throw new Error('Snapshot is too large. Try a lower display resolution.');
        ratio*=.85;
      }
    } finally {original.close();}
  } catch(error) {bridge.complete({id:job.id,error:error instanceof Error?error.message:'Snapshot encoding failed'});}
});
