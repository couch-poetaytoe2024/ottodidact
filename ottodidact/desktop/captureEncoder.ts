import { BrowserWindow, ipcMain, type NativeImage } from 'electron';
import path from 'path';
import { MAX_IMAGE_BYTES, MAX_IMAGE_EDGE } from '../shared/ai';
import type { EncodedSnapshot, PixelJob, PixelResult } from '../shared/captureEncoding';
let encoder:BrowserWindow|undefined,ready:Promise<void>|undefined;
const jobs=new Map<string,{resolve:(image:EncodedSnapshot)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function failJobs(){for(const job of jobs.values()){clearTimeout(job.timer);job.reject(new Error('Snapshot encoder stopped. Please retake.'));}jobs.clear();}
export function initializeCaptureEncoder() {
  if(encoder&&!encoder.isDestroyed())return;
  const win=encoder=new BrowserWindow({show:false,width:1,height:1,skipTaskbar:true,focusable:false,webPreferences:{preload:path.join(__dirname,'capturePreload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('render-process-gone',()=>{failJobs();if(!win.isDestroyed())win.destroy();});
  win.on('closed',()=>{encoder=undefined;ready=undefined;failJobs();});
  ready=process.argv.includes('--dev')?win.loadURL('http://127.0.0.1:5173/capture-encoder.html'):win.loadFile(path.join(__dirname,'../../dist/capture-encoder.html'));
  void ready.catch(()=>{failJobs();if(!win.isDestroyed())win.destroy();});
}
ipcMain.on('snapshot:encoded',(event,result:PixelResult)=>{
  if(!encoder||event.sender!==encoder.webContents||!result||typeof result.id!=='string')return;
  const job=jobs.get(result.id);if(!job)return;
  jobs.delete(result.id);clearTimeout(job.timer);
  const image=result.image;
  if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||Math.max(image.width,image.height)>MAX_IMAGE_EDGE||!Number.isFinite(image.bytes)||image.bytes>MAX_IMAGE_BYTES||typeof image.dataUrl!=='string'||image.dataUrl.length>Math.ceil(MAX_IMAGE_BYTES*4/3)+64||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl)) {
    job.reject(new Error(typeof result.error==='string'?result.error.slice(0,200):'Invalid snapshot encoding'));return;
  }
  job.resolve(image);
});
export async function encodeSnapshot(image:NativeImage,limits={maxEdge:MAX_IMAGE_EDGE,maxBytes:MAX_IMAGE_BYTES}):Promise<EncodedSnapshot> {
  initializeCaptureEncoder();await ready;
  const {width,height}=image.getSize(),bitmap=image.toBitmap();
  if(!width||!height||bitmap.byteLength!==width*height*4)throw new Error('Invalid screen bitmap. Please retake.');
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{jobs.delete(id);reject(new Error('Snapshot encoding timed out. Please retake.'));if(encoder&&!encoder.isDestroyed())encoder.destroy();},15000);
    jobs.set(id,{resolve,reject,timer});
    const job:PixelJob={id,width,height,bitmap,...limits};
    encoder!.webContents.send('snapshot:encode',job);
  });
}
