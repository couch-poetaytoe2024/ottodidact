// Opt-in visual snapshots of the existing mock reference flow; no provider calls.
import assert from 'node:assert/strict';
import {app,screen,type BrowserWindow} from 'electron';
import {execFile} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {getWindow} from './windows';
import {checkGlass,checkLightGap} from './glassSmoke';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export async function checkRadianceHitTesting(backdrop:BrowserWindow,otto:BrowserWindow,effects:BrowserWindow){
 const wb=otto.getBounds(),eb=effects.getBounds();
 const points=[{x:wb.x-6,y:wb.y+wb.height/2},{x:eb.x+2,y:eb.y+120}].map(point=>screen.dipToScreenPoint(point));
 const handle=backdrop.getNativeWindowHandle().readBigUInt64LE().toString();
 const script=`$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class RadianceHitTest {
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr handle,uint flags);
}
'@
[void][RadianceHitTest]::SetThreadDpiAwarenessContext([IntPtr](-4))
${points.map(point=>`$at=New-Object RadianceHitTest+POINT
$at.X=${point.x};$at.Y=${point.y}
if([RadianceHitTest]::GetAncestor([RadianceHitTest]::WindowFromPoint($at),2).ToInt64() -ne ${handle}){throw 'Radiance intercepted native desktop hit testing.'}`).join('\n')}`;
 await new Promise<void>((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000},(error,_stdout,stderr)=>error?reject(new Error(stderr||error.message)):resolve()));
}
type Review=(win:BrowserWindow,name:string)=>Promise<void>;
export const materialReview=process.env.OTTODIDACT_MATERIAL_REVIEW==='1';
export async function materialFrame(name:string,review:Review){
 if(!materialReview)return;
 const otto=getWindow('companion')!;
 await review(otto,'material-'+name+'-launcher');await checkGlass(otto);
}
export async function finishMaterialReview(review:Review,backdrop:BrowserWindow,desktopFrame:(name:string)=>Promise<void>){
 if(!materialReview)return;
 const otto=getWindow('companion')!,panel=getWindow('panel')!,effects=getWindow('effects')!;
 await checkGlass(panel,'.main-panel .chat-header .otto-logo',false);
 await checkLightGap(otto,effects);
 assert.equal(await otto.webContents.executeJavaScript(`document.querySelector('.otto-logo').dataset.material`),'webgl');
 const gpu=await otto.webContents.executeJavaScript(`(()=>{const gl=document.querySelector('.otto-liquid').getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()};})()`);
 console.log('Native liquid GPU:',JSON.stringify({gpu,features:app.getGPUFeatureStatus()}));
 assert.equal(gpu.attributes.alpha,true);assert.equal(gpu.attributes.premultipliedAlpha,true);
 const frames:Buffer[]=[];
 for(let i=0;i<3;i++){
  if(i)await delay(7000);
  await review(otto,'liquid-moment-'+i);await checkGlass(otto);
  frames.push((await otto.webContents.capturePage()).toBitmap());
 }
 assert.notDeepEqual(frames[0],frames[1],'The actual liquid pixels must move');
 const edgeFrame=await effects.webContents.capturePage(),edgeSize=edgeFrame.getSize(),edgePixels=edgeFrame.toBitmap(),scale=edgeSize.width/effects.getBounds().width;
 const blueAt=(x:number,y:number)=>{const offset=(Math.round(y)*edgeSize.width+Math.round(x))*4;const [b,g,r]=edgePixels.subarray(offset,offset+3);return b>r*1.3&&b>100&&g>50;};
 const edgeColors:boolean[]=[];
 const inset=Math.round(1.6*scale),step=Math.max(1,Math.round(4*scale));
 for(let x=inset;x<edgeSize.width-inset;x+=step)edgeColors.push(blueAt(x,inset));
 for(let y=inset;y<edgeSize.height-inset;y+=step)edgeColors.push(blueAt(edgeSize.width-1-inset,y));
 for(let x=edgeSize.width-1-inset;x>=inset;x-=step)edgeColors.push(blueAt(x,edgeSize.height-1-inset));
 for(let y=edgeSize.height-1-inset;y>=inset;y-=step)edgeColors.push(blueAt(inset,y));
 assert.equal(edgeColors.filter((value,i)=>value&&!edgeColors[(i+edgeColors.length-1)%edgeColors.length]).length,2,'Native screen perimeter must show two distinct blue pools');
 // The wider launcher light must actually extend beyond the small input window.
 const wb=otto.getBounds(),eb=effects.getBounds(),sampleX=Math.round((wb.x-eb.x-6)*scale),sampleY=Math.round((wb.y-eb.y+wb.height/2)*scale);
 assert.ok(edgePixels[(sampleY*edgeSize.width+sampleX)*4+3]>82,'Wide halo must survive outside the launcher native bounds');
 // Judge light on an undimmed desktop, rather than manufacturing contrast.
 await effects.webContents.executeJavaScript(`document.querySelector('.screen-dimming')?.style.setProperty('visibility','hidden')`);
 for(const [name,color] of [['light','#f3f1eb'],['dark','#111825']]){
  await backdrop.webContents.executeJavaScript(`document.body.style.background=${JSON.stringify(color)}`);
  await desktopFrame('radiance-desktop-'+name);
 }
 await checkRadianceHitTesting(backdrop,otto,effects);
 await effects.webContents.executeJavaScript(`document.querySelector('.screen-dimming')?.style.removeProperty('visibility')`);
 await panel.webContents.executeJavaScript(`window.ottodidact.command({type:'dismiss'})`);
 await otto.webContents.executeJavaScript(`window.ottodidact.command({type:'mainChat'})`);
 await delay(250);await materialFrame('reopened',review);
 await review(panel,'material-header-reopened');
 // A driver/context interruption must retain the face and recover without IPC.
 await otto.webContents.executeJavaScript(`window.__ottoReviewLoss=document.querySelector('.otto-liquid').getContext('webgl').getExtension('WEBGL_lose_context');window.__ottoReviewLoss.loseContext()`);
 await delay(200);assert.equal(await otto.webContents.executeJavaScript(`document.querySelector('.otto-logo').dataset.material`),'fallback');
 await review(otto,'liquid-fallback');
 await otto.webContents.executeJavaScript(`window.__ottoReviewLoss.restoreContext();delete window.__ottoReviewLoss`);
 await delay(350);assert.equal(await otto.webContents.executeJavaScript(`document.querySelector('.otto-logo').dataset.material`),'webgl');
 for(const win of [otto,panel,effects]){
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 }
 await delay(200);
 assert.equal(await otto.webContents.executeJavaScript(`document.querySelector('.otto-liquid').dataset.running`),'false');
 const staticFrame=await otto.webContents.executeJavaScript(`document.querySelector('.otto-liquid').dataset.frame`);
 await delay(250);assert.equal(await otto.webContents.executeJavaScript(`document.querySelector('.otto-liquid').dataset.frame`),staticFrame);
 assert.equal(await effects.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.edge-light')).animationName`),'none');
 await checkGlass(otto);await checkGlass(panel,'.main-panel .chat-header .otto-logo',false);
 await review(otto,'material-reduced-motion');await review(effects,'material-edge-reduced');
 for(const win of [otto,panel,effects])win.webContents.debugger.detach();
 // Same visible body size: native 76-DIP globe vs the reference's 104-pixel globe.
 // CSS crops/scales the reference for comparison; the original file is unchanged.
 if(process.env.OTTODIDACT_MATERIAL_REFERENCE){
  const png=(file:string)=>'data:image/png;base64,'+readFileSync(file).toString('base64');
  const reference=png(process.env.OTTODIDACT_MATERIAL_REFERENCE);
  const images=[0,1,2].map(i=>png(path.join(app.getAppPath(),'.ui-review',`liquid-moment-${i}.png`)));
  const scale=76/104;
  const row=(dark:boolean)=>`<div class="row ${dark?'dark':''}"><div class="label">${dark?'Dark':'Light'} desktop</div>${images.map((src,i)=>`<figure><img src="${src}"><figcaption>Moment ${i+1}</figcaption></figure>`).join('')}</div>`;
  const comparisonPath=path.join(app.getAppPath(),'.ui-review','liquid-comparison.html');writeFileSync(comparisonPath,`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#e5e3dd;font:14px Segoe UI;color:#272832;padding:30px}h1{font-size:23px;margin:0 0 10px}p{max-width:800px;line-height:1.5}.row{display:flex;align-items:center;width:690px;background:#f3f1eb;border-radius:14px;margin:15px 0;padding:10px 20px;gap:35px}.dark{background:#111825;color:#eee}.label{width:100px}figure{margin:0;text-align:center}figure>img,.reference{width:108px;height:108px}.reference{position:relative;overflow:hidden;flex-shrink:0}.reference img{position:absolute;width:${1672*scale}px;max-width:none;left:${54-1600*scale}px;top:${54-835*scale}px}figcaption{font-size:12px;padding:5px}footer{font-size:12px;color:#555}</style><h1>Otto liquid material · native Windows comparison</h1><p>Equal visible body size. Three real Electron launcher captures, composited over light and dark surfaces. The reference already includes its own background.</p><div class="row"><div class="label">Reference</div><div class="reference"><img src="${reference}"></div><div>104 reference pixels scaled to 76 DIPs.<br>Native review: 125% display scaling.</div></div>${row(false)}${row(true)}<footer>Generated review only · no tutoring API calls · screenshot comparison, not a live fluid simulation.</footer>`);
  backdrop.setSize(780,700);await backdrop.loadFile(comparisonPath);
  await review(backdrop,'liquid-comparison');
 }
 console.log('MATERIAL REVIEW PASS: native shader/alpha, moving pixels at three moments, two blue perimeter pools, wider halo outside launcher bounds, native click-through, undimmed light/dark desktop frames, context loss/recovery, separate halo gap, welcome/processing/reply/reopen and stationary reduced-motion material.');
}
