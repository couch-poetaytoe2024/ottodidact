import { describe, expect, it, vi } from 'vitest';
import type { Display, NativeImage } from 'electron';
const sources=vi.hoisted(()=>vi.fn());
vi.mock('electron',()=>({desktopCapturer:{getSources:sources}}));
vi.mock('../desktop/captureEncoder',()=>({encodeSnapshot:async(image:NativeImage)=>{const size=image.getSize(),ratio=Math.min(1,3072/size.width,3072/size.height);return {dataUrl:'data:image/png;base64,AAAA',width:Math.round(size.width*ratio),height:Math.round(size.height*ratio),bytes:3};}}));
import { captureDisplay, selectSnapshot } from '../desktop/capture';
import { mapAnnotations } from '../shared/annotationMapping';

function image(width:number,height:number):NativeImage {
  return {getSize:()=>({width,height}),isEmpty:()=>false,toPNG:()=>Buffer.from('full-screen-pixels'),resize:(size:{width:number;height:number})=>image(size.width,size.height)} as NativeImage;
}
describe('one full active-display snapshot, then focus selection',()=>{
  it.each([1,1.25,1.5,1.75,2])('keeps focus and targets aligned at %sx after resizing on a negative-origin display',async scale=>{
    const bounds={x:-2048,y:-180,width:2048,height:1152};
    const display={id:42,bounds,size:{width:bounds.width,height:bounds.height},scaleFactor:scale} as Display;
    sources.mockReset().mockResolvedValue([{display_id:'1',thumbnail:image(800,600)},{display_id:'42',thumbnail:image(2048*scale,1152*scale)}]);
    const snapshot=await captureDisplay(display);
    expect(sources).toHaveBeenCalledTimes(1);
    expect(sources.mock.calls[0][0].thumbnailSize).toEqual({width:2048*scale,height:1152*scale});
    expect(snapshot.pixelWidth).toBeLessThanOrEqual(3072);
    expect(snapshot.originalPixelWidth).toBe(2048*scale);
    expect(snapshot.desktopRect).toEqual({x:0,y:0,width:2048,height:1152});
    const focus={x:153.25,y:92.75,width:401.5,height:203.5};
    const capture=selectSnapshot(snapshot,focus,display.id);
    expect(sources).toHaveBeenCalledTimes(1);
    expect(capture.image!.dataUrl).toBe(snapshot.dataUrl);
    expect(capture.image!.captureId).toBe(snapshot.captureId);
    expect(capture.image!.cropOffset).toEqual({x:0,y:0});
    expect(capture.displayId).toBe(42);
    const [marker]=mapAnnotations([{id:'focus',kind:'circle',concept:'Focus',explanation:'At the selected content',target:capture.image!.selection}],capture.image!,display.size);
    expect(marker.target).toEqual(capture.rect);
    expect(Math.abs(bounds.x+marker.target!.x-(bounds.x+focus.x))).toBeLessThanOrEqual(bounds.width/snapshot.pixelWidth);
    expect(Math.abs(marker.target!.height-focus.height)).toBeLessThanOrEqual(2*bounds.height/snapshot.pixelHeight);
  });
  it('fails if the chosen display is missing instead of capturing another monitor',async()=>{
    sources.mockResolvedValue([{display_id:'1',thumbnail:image(1920,1080)}]);
    await expect(captureDisplay({id:42,size:{width:1920,height:1080},scaleFactor:1} as Display)).rejects.toThrow('this display');
  });
});
