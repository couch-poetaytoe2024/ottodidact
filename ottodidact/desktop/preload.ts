import { contextBridge, ipcRenderer } from 'electron';
import type { LightGeometry } from '../shared/ambientLight';
import type { DesktopApi, Session } from '../shared/milestone';
const api: DesktopApi = {
  getLightGeometry:()=>ipcRenderer.invoke('appearance:geometry'),
  subscribeLightGeometry:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,geometry:LightGeometry)=>callback(geometry);
    ipcRenderer.on('appearance:geometry',listener);
    return()=>ipcRenderer.removeListener('appearance:geometry',listener);
  },
  getState:()=>ipcRenderer.invoke('session:get'),
  command:command=>ipcRenderer.invoke('session:command',command),
  subscribeProgress:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,value:Parameters<typeof callback>[0])=>callback(value);
    ipcRenderer.on('tutor:progress',listener);return()=>ipcRenderer.removeListener('tutor:progress',listener);
  },
  subscribe:callback=>{
    const listener=(_event: Electron.IpcRendererEvent,state: Session)=>callback(state);
    ipcRenderer.on('session:state',listener);
    return ()=>ipcRenderer.removeListener('session:state',listener);
  },
};
contextBridge.exposeInMainWorld('ottodidact',api);
