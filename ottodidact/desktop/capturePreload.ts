import { contextBridge, ipcRenderer } from 'electron';
import type { PixelJob, PixelResult } from '../shared/captureEncoding';
contextBridge.exposeInMainWorld('snapshotEncoder', {
  receive:(callback:(job:PixelJob)=>void)=>ipcRenderer.on('snapshot:encode',(_event,job:PixelJob)=>callback(job)),
  complete:(result:PixelResult)=>ipcRenderer.send('snapshot:encoded',result),
});
