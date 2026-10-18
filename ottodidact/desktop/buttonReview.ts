// Opt-in native material review. No screenshots or questions are sent to a tutor.
import assert from 'node:assert/strict';
import {app,screen,type BrowserWindow} from 'electron';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {getWindow} from './windows';
import {composite} from './referenceReview';
import {checkRadianceHitTesting} from './materialReview';
import type {Command} from '../shared/milestone';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const invoke=(win:BrowserWindow,command:Command)=>win.webContents.executeJavaScript(`window.ottodidact.command(${JSON.stringify(command)})`);
const data=(win:BrowserWindow)=>win.webContents.executeJavaScript(`({...document.querySelector('.otto-liquid').dataset})`);
type Review=(win:BrowserWindow,name:string)=>Promise<void>;
/** Exercise the real launcher and selection renderers, including development
 * StrictMode. The uniform generated desktop makes captured UI leaks visible. */
export async function runLauncherFlowReview(backdrop:BrowserWindow,review:Review){
 const otto=getWindow('companion')!,selection=getWindow('selection')!,panel=getWindow('panel')!,effects=getWindow('effects')!;
 const state=()=>panel.webContents.executeJavaScript('window.ottodidact.getState()');
 const until=async(check:()=>Promise<boolean>)=>{for(let i=0;i<100;i++){if(await check())return;await delay(100);}throw new Error('Launcher flow did not settle');};
 backdrop.setAlwaysOnTop(false);
 await backdrop.loadURL('data:text/html,<style>body{margin:0;background:rgb(96,112,128)}</style>');
 await invoke(panel,{type:'glowMode',mode:'always'});await invoke(panel,{type:'dismiss'});
 const bounds=otto.getBounds();
 const visibleFace=async(name:string)=>{
  await until(async()=>otto.isVisible());otto.moveTop();await review(otto,name);
  const metrics=await otto.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.otto-button').getBoundingClientRect(),c=document.querySelector('.otto-liquid');return {viewport:[innerWidth,innerHeight],button:{x:b.x,y:b.y,width:b.width,height:b.height},material:document.querySelector('.otto-logo').dataset.material,frame:c.dataset.frame};})()`);
  console.log('LAUNCHER FRAME:',name,JSON.stringify({native:otto.getBounds(),...metrics}));
  assert.equal(metrics.button.width,76);
  assert.ok(Math.abs(otto.getBounds().x-bounds.x)<12&&Math.abs(otto.getBounds().y-bounds.y)<12,'Launcher must remain in its original corner');
  const frame=await otto.webContents.capturePage(),size=frame.getSize(),pixels=frame.toBitmap();
  let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>200)opaque++;
  assert.ok(opaque>size.width*size.height*.3,'The launcher body must actually be visible, not only its halo');
 };
 const activate=async()=>{
  otto.webContents.sendInputEvent({type:'mouseDown',x:54,y:54,button:'left',clickCount:1});
  otto.webContents.sendInputEvent({type:'mouseUp',x:54,y:54,button:'left',clickCount:1});
  await until(async()=>(await state()).phase==='selecting'&&!!(await state()).selectionSnapshot);
  assert.equal(otto.isVisible(),false);assert.equal(effects.isVisible(),false);
  assert.equal(await selection.webContents.executeJavaScript(`document.querySelectorAll('.otto-logo,.otto-liquid,.launcher-radiance').length`),0,'No launcher material belongs in selection');
  await review(selection,'launcher-flow-selection');
  const frame=await selection.webContents.capturePage(),size=frame.getSize(),pixels=frame.toBitmap();
  const at=(x:number,y:number)=>[...pixels.subarray((Math.round(y*size.height)*size.width+Math.round(x*size.width))*4,(Math.round(y*size.height)*size.width+Math.round(x*size.width))*4+4)];
  const middle=at(.5,.5);for(const [x,y] of [[.2,.2],[.4,.5],[.6,.5],[.8,.7]])at(x,y).forEach((c,i)=>assert.ok(Math.abs(c-middle[i])<=3,'Selection must have uniform dimming, without a central circle'));
 };
 const escape=(win:BrowserWindow)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});};
 await visibleFace('launcher-flow-start');
 // A discarded GPU frame still has a face underneath. Keep this separate
 // from context-loss fallback, which is handled by the WebGL lifecycle.
 await otto.webContents.executeJavaScript(`document.querySelector('.otto-liquid').style.visibility='hidden'`);
 await visibleFace('launcher-flow-buffer-fallback');
 await otto.webContents.executeJavaScript(`document.querySelector('.otto-liquid').style.visibility=''`);
 assert.equal(await effects.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.edge-space')).maskImage`),'none','No circular hole may be punched into the edge illumination');
 otto.hide();await until(async()=>!await effects.webContents.executeJavaScript(`!!document.querySelector('.launcher-radiance')`));
 otto.showInactive();await until(async()=>!!await effects.webContents.executeJavaScript(`document.querySelector('.launcher-radiance')`));
 for(let i=0;i<2;i++){await activate();escape(selection);await until(async()=>(await state()).phase!=='selecting');await visibleFace('launcher-flow-cancel-'+i);}
 await activate();
 for(const [type,x,y] of [['mouseDown',400,300],['mouseMove',250,200],['mouseUp',250,200]] as const)selection.webContents.sendInputEvent({type,x,y,button:'left',clickCount:1});
 await until(async()=>(await state()).phase==='question');await visibleFace('launcher-flow-question');
 await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Retake"]').click()`);
 await until(async()=>(await state()).phase==='selecting'&&!!(await state()).selectionSnapshot);
 escape(selection);await until(async()=>(await state()).phase==='question');await visibleFace('launcher-flow-retake-cancel');
 await invoke(panel,{type:'dismiss'});await visibleFace('launcher-flow-dismiss');
 await composite([backdrop,effects,otto],'launcher-flow-desktop');
 console.log('LAUNCHER FLOW PASS: actual button clicks, uniform selection, reverse drag, question, repeated cancel, retake/cancel and dismiss restore the same visible launcher. No tutor requests.');
}
export async function runButtonReview(backdrop:BrowserWindow,review:Review){
 const otto=getWindow('companion')!,effects=getWindow('effects')!,panel=getWindow('panel')!;
 const initialBounds=otto.getBounds();
 backdrop.setAlwaysOnTop(false);otto.moveTop();
 await invoke(panel,{type:'glowMode',mode:'needed'});await invoke(panel,{type:'dismiss'});
 await delay(600);
 console.log('BUTTON VISIBILITY:',JSON.stringify(await otto.webContents.executeJavaScript(`({hidden:document.hidden,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,material:document.querySelector('.otto-logo').dataset.material,...document.querySelector('.otto-liquid').dataset})`)));
 const before=await data(otto);await delay(400);const after=await data(otto);
 assert.equal(after.materialVersion,'glass-lens-3','Native app must load the revised material');
 assert.equal(after.running,'true','Needed-mode idle must not freeze interior color motion');
 assert.ok(Number(after.frame)>Number(before.frame));assert.equal(effects.isVisible(),false);
 const gpu=await otto.webContents.executeJavaScript(`(()=>{const gl=document.querySelector('.otto-liquid').getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()};})()`);
 assert.equal(gpu.attributes.alpha,true);assert.equal(gpu.attributes.premultipliedAlpha,true);
 console.log('BUTTON GPU:',JSON.stringify({gpu,features:app.getGPUFeatureStatus(),display:screen.getPrimaryDisplay().scaleFactor}));
 await invoke(otto,{type:'mainChat'});panel.hide();
 await backdrop.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>body{margin:0;background:#222936;color:#eee;font:16px Segoe UI}p{margin:32px}</style><p>Native Otto material review — generated dark background; no dimming.</p>'));
 await delay(700);
 const frames:Buffer[]=[];
 for(let i=0;i<3;i++){
  if(i)await delay(7000);
  await review(otto,`glass-lens-moment-${i}`);
  frames.push((await otto.webContents.capturePage()).toBitmap());
 }
 assert.ok(!frames[0].equals(frames[1])&&!frames[1].equals(frames[2]),'Color material must change over time');
 await composite([backdrop,effects,otto],'glass-lens-dark-desktop');
 await checkRadianceHitTesting(backdrop,otto,effects);
 await backdrop.webContents.executeJavaScript(`document.body.style.background='#f4f2ed';document.body.style.color='#242936';document.querySelector('p').textContent='Native Otto material review — generated light background; no dimming.'`);
 await composite([backdrop,effects,otto],'glass-lens-light-desktop');
 // Isolate the real decoration surface to measure its transparent bottom spill.
 await effects.webContents.executeJavaScript(`document.querySelector('.edge-glow').style.visibility='hidden'`);
 await review(effects,'glass-lens-halo-alpha');
 const frame=await effects.webContents.capturePage(),size=frame.getSize(),pixels=frame.toBitmap();
 const eb=effects.getBounds(),wb=otto.getBounds(),cx=wb.x+wb.width/2-eb.x;
 const at=(x:number,y:number)=>pixels[(Math.round(y*size.height/eb.height)*size.width+Math.round(x*size.width/eb.width))*4+3];
 assert.ok(at(cx,eb.height-12)>2,'Launcher light must reach the bottom illumination');
 assert.equal(at(cx-164,wb.y+wb.height/2-eb.y),0,'Halo must fade before the canvas boundary');
 await effects.webContents.executeJavaScript(`document.querySelector('.edge-glow').style.visibility=''`);
 for(const win of [otto,effects]){
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 }
 await delay(250);const stationary=await data(otto);await delay(300);
 assert.equal(stationary.running,'false');assert.equal((await data(otto)).frame,stationary.frame);
 await review(otto,'glass-lens-reduced-motion');
 for(const win of [otto,effects])win.webContents.debugger.detach();
 assert.deepEqual(otto.getBounds(),initialBounds,'Material must not move or enlarge the launcher');
 otto.hide();await delay(250);assert.equal((await data(otto)).running,'false');otto.showInactive();
 const directory=path.join(app.getAppPath(),'.ui-review');
 // The reference is cropped/scaled by CSS only; all actual images are native
 // launcher captures at the same 76-DIP body diameter, not generated artwork.
 if(process.env.OTTODIDACT_MATERIAL_REFERENCE){
  const png=(file:string)=>'data:image/png;base64,'+readFileSync(file).toString('base64');
  const reference=png(process.env.OTTODIDACT_MATERIAL_REFERENCE),scale=76/324;
  const images=[0,1,2].map(i=>png(path.join(directory,`glass-lens-moment-${i}.png`)));
  const row=(dark:boolean)=>`<div class="row ${dark?'dark':''}"><label>${dark?'Dark':'Light'}</label>${images.map((src,i)=>`<figure><img src="${src}"><figcaption>Moment ${i+1}</figcaption></figure>`).join('')}</div>`;
  const file=path.join(directory,'glass-lens-comparison.html');
  writeFileSync(file,`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:25px;background:#e6e3dc;color:#252936;font:14px Segoe UI}h1{font-size:22px}.row{display:flex;align-items:center;gap:25px;background:#f4f2ed;padding:15px;margin:15px 0;width:630px;border-radius:12px}.dark{background:#222936;color:white}label{width:65px}figure{margin:0;text-align:center}figure img,.reference{width:108px;height:108px}figcaption{font-size:12px}.reference{position:relative;overflow:hidden}.reference img{position:absolute;width:${1672*scale}px;max-width:none;left:${54-1428*scale}px;top:${54-603*scale}px}</style><h1>Actual native launcher vs reference</h1><p>Equal 76-DIP body diameter. Native Windows at 125% scaling.</p><div class="row"><label>Reference</label><div class="reference"><img src="${reference}"></div><p>Reference includes its own background.<br>Native halo extends beyond this 108-DIP crop;<br>see the full desktop screenshots.</p></div>${row(false)}${row(true)}<p>Three animation moments, 7 seconds apart. No tutoring calls.</p>`);
  effects.hide();otto.hide();await backdrop.loadFile(file);await review(backdrop,'glass-lens-comparison');
 }
 console.log('BUTTON REVIEW PASS: revised native shader, needed-mode idle animation, three moments, transparent bottom spill, no canvas cutoff, native click-through, fixed launcher bounds, hidden pause and stationary reduced motion.');
}
