import { app, globalShortcut, screen } from 'electron';
import { initializeWindows, markQuitting, showWindow } from './windows';
import { registerIpcHandlers, runCommand } from './ipc';
import { runSmokeTest } from './smoke';
import { initializeCaptureEncoder } from './captureEncoder';
app.whenReady().then(async()=>{
  initializeCaptureEncoder();
  initializeWindows();
  registerIpcHandlers();
  if(!process.argv.includes('--smoke-test'))globalShortcut.register('CommandOrControl+Shift+O',()=>void runCommand({type:'capture'},screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id).catch(()=>{}));
  if(!process.argv.includes('--smoke-test'))globalShortcut.register('CommandOrControl+Shift+M',()=>void runCommand({type:'mainChat'}).catch(()=>{}));
  app.on('before-quit',markQuitting);
  app.on('will-quit',()=>globalShortcut.unregisterAll());
  await showWindow('companion',false);
  if(process.argv.includes('--smoke-test')) await runSmokeTest();
}).catch(error=>{console.error(error);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
