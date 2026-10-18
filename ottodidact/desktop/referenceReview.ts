// Opt-in native visual fixture. Never used by the production tutor or renderer.
import assert from 'node:assert/strict';
import { app,screen,type BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { getWindow } from './windows';
import type { Command,Session } from '../shared/milestone';
import type { Rect } from '../shared/types';
import { overlap } from '../shared/presentation';
import {materialReview,materialFrame,finishMaterialReview} from './materialReview';

export const referenceBackdrop=`<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;background:linear-gradient(120deg,#f5df9c,#9cbada 70%,#d7a9aa);color:#141a26}
.browser{position:absolute;inset:23px 9% 45px 26px;border:1px solid #c0c0c5;border-radius:13px;overflow:hidden;background:#fff}
.tabs{height:40px;padding:12px 23px;background:#ececf0;font:13px Segoe UI,sans-serif}.address{padding:12px 40px;background:#e4e5e9;color:#505762;font:13px Segoe UI,sans-serif}
.page{padding:35px 70px;font:21px Georgia,serif}h1{font-size:38px;margin:12px 0 20px}p{margin:12px 0}.eyebrow{font-size:18px;letter-spacing:1px;color:#59616a}
#focus{position:absolute;left:6.5vw;top:32.7vh;width:35vw;height:29vh;padding:20px 24px;background:white;font:italic 34px Georgia,serif;display:flex;flex-direction:column;justify-content:space-between}
.equation{white-space:nowrap}.plain{font-style:normal}.solution{padding-left:125px;font-size:32px}.key{position:absolute;left:61%;top:17%;width:25%;padding:20px;border:1px solid #d6d6da;font:19px/1.5 Georgia,serif}.key strong{font-size:23px}.key ul{padding-left:20px}.remaining{position:absolute;left:8%;top:65%;font:31px/2.6 Georgia,serif}.methods{top:72%;left:60%;font-size:18px}
.fixture-note{position:absolute;bottom:10px;left:30px;font:11px Segoe UI,sans-serif;color:#28384d}
</style></head><body><div class="browser"><div class="tabs">▧ &nbsp; Quadratic equations · Worksheet</div><div class="address">← &nbsp; → &nbsp; ↻ &nbsp;&nbsp;&nbsp; example.com / math / worksheets / quadratic-equations</div><div class="page"><span class="eyebrow">Algebra</span><h1>Quadratic equations</h1><p>Solve each quadratic equation. Show all working.</p></div></div>
<div id="focus"><div class="equation"><span class="plain">1. &nbsp; Solve &nbsp;</span> x² <span id="factoring-target">− 5x</span> + 6 = 0</div><div class="equation" style="padding-left:112px"><span id="zero-target">(x − 2)</span>(x − 3) = 0</div><div class="solution">x = 2 &nbsp; <span class="plain">or</span> &nbsp; x = 3</div></div>
<div class="key"><strong>Key points</strong><ul><li>A quadratic equation has the form ax² + bx + c = 0.</li><li>It can be solved by factoring, completing the square, or using the quadratic formula.</li><li>The solutions are called roots or zeros.</li></ul></div>
<div class="remaining">2. &nbsp; Solve &nbsp; x² + 7x + 12 = 0<br>3. &nbsp; Solve &nbsp; 2x² − 5x − 3 = 0<br>4. &nbsp; Solve &nbsp; x² − 9 = 0</div><div class="key methods"><strong>Common methods</strong><br>• &nbsp; Factoring<br>• &nbsp; Completing the square</div><div class="fixture-note">Generated visual test fixture · labelled mock tutor · no model calls</div></body></html>`;

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const state=(win:BrowserWindow):Promise<Session>=>win.webContents.executeJavaScript('window.ottodidact.getState()');
const invoke=(win:BrowserWindow,command:Command)=>win.webContents.executeJavaScript(`window.ottodidact.command(${JSON.stringify(command)})`);

export async function composite(windows:BrowserWindow[],name:string) {
  const display=screen.getPrimaryDisplay(),origin=screen.dipToScreenPoint(display.bounds);
  const width=Math.round(display.bounds.width*display.scaleFactor),height=Math.round(display.bounds.height*display.scaleFactor);
  const directory=path.join(app.getAppPath(),'.ui-review');mkdirSync(directory,{recursive:true});
  const destination="'"+path.join(directory,name+'.png').replace(/'/g,"''")+"'";
  const script=`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ReferenceFrame {
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr v);
 [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr w);
 [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr w,IntPtr dc);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr d,int x,int y,int w,int h,IntPtr s,int sx,int sy,uint op);
}
'@
[void][ReferenceFrame]::SetThreadDpiAwarenessContext([IntPtr](-4))
# The generated worksheet stands in for a normal application. Leaving it
# topmost can place it above a non-activating decoration window on Windows.
[void][ReferenceFrame]::SetWindowPos([IntPtr]${windows[0].getNativeWindowHandle().readBigUInt64LE().toString()},[IntPtr](-2),0,0,0,0,0x53)
foreach($owned in @(${windows.slice(1).map(win=>win.getNativeWindowHandle().readBigUInt64LE().toString()).join(',')})){
 [void][ReferenceFrame]::SetWindowPos([IntPtr]$owned,[IntPtr](-1),0,0,0,0,0x53)
}
Start-Sleep -Milliseconds 250
$bitmap=New-Object System.Drawing.Bitmap(${width},${height})
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
try {
 $dest=$graphics.GetHdc();$source=[ReferenceFrame]::GetDC([IntPtr]::Zero)
 try {if(-not [ReferenceFrame]::BitBlt($dest,0,0,${width},${height},$source,${origin.x},${origin.y},0x40CC0020)){throw 'Native compositor capture failed'}}
 finally {$graphics.ReleaseHdc($dest);[void][ReferenceFrame]::ReleaseDC([IntPtr]::Zero,$source)}
 $bitmap.Save(${destination},[System.Drawing.Imaging.ImageFormat]::Png)
} finally {$graphics.Dispose();$bitmap.Dispose()}`;
  for(const win of windows)win.setContentProtection(false);
  try {await new Promise<void>((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:30000},(error,_out,err)=>error?reject(new Error(error.message+'\n'+err)):resolve()));}
  finally {for(const win of windows.slice(1))win.setContentProtection(true);}
}

export async function runReferenceReview(fixture:BrowserWindow,review:(win:BrowserWindow,name:string)=>Promise<void>) {
  const panel=getWindow('panel')!,selection=getWindow('selection')!,otto=getWindow('companion')!,effects=getWindow('effects')!,overlay=getWindow('annotations')!;
  if(materialReview){await invoke(otto,{type:'mainChat'});await materialFrame('welcome',review);await invoke(panel,{type:'dismiss'});}
  const geometry=await fixture.webContents.executeJavaScript(`(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {focus:rect('focus'),factoring:rect('factoring-target'),zero:rect('zero-target'),width:innerWidth,height:innerHeight};})()`) as {focus:Rect;factoring:Rect;zero:Rect;width:number;height:number};
  await invoke(otto,{type:'capture'});
  await invoke(selection,{type:'select',selectionId:(await state(panel)).selectionId!,rect:geometry.focus});
  // Export only in this explicitly enabled generated-content review. The live
  // provider check can reuse the exact clean snapshot without user documents.
  const snapshot=(await state(panel)).inputImage!;
  const directory=path.join(app.getAppPath(),'.ui-review');mkdirSync(directory,{recursive:true});
  writeFileSync(path.join(directory,'reference-snapshot.json'),JSON.stringify({source:'generated-reference-fixture',createdAt:Date.now(),image:snapshot}));
  await review(panel,'reference-question');
  await materialFrame('question',review);
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    await materialFrame('processing',review);
    const response=await original(input,init),body=await response.json();
    if(body.result){
      const normalized=(r:Rect)=>({x:r.x/geometry.width,y:r.y/geometry.height,width:r.width/geometry.width,height:r.height/geometry.height});
      body.result={explanation:'Box 1 finds the factors. Box 2 explains why setting each factor to zero gives $x = 2$ or $x = 3$.',annotations:[
        {id:'factoring',kind:'underline',concept:'Factoring',explanation:'$-2$ and $-3$ multiply to $6$ and add to $-5$.',target:normalized(geometry.factoring)},
        {id:'zero-product',kind:'circle',concept:'Zero-product rule',explanation:'If either factor is zero, the product is zero.',target:normalized(geometry.zero)},
      ],warnings:['DEMO: predetermined factoring fixture. No image analysis was performed.']};
    }
    return new Response(JSON.stringify(body),{status:response.status,headers:{'Content-Type':'application/json'}});
  };
  try {await invoke(panel,{type:'explain',question:'How do boxes 1 and 2 connect?'});}finally{globalThis.fetch=original;}
  await delay(700);
  const current=await state(panel),branches=Object.values(current.branches),cards=branches.map(branch=>getWindow(`branch:${branch.id}`)!);
  const display=screen.getPrimaryDisplay();
  const focus={...current.capture!.rect,x:current.capture!.rect.x+display.bounds.x,y:current.capture!.rect.y+display.bounds.y};
  assert.equal(overlap(panel.getBounds(),focus),0,'Reference chat must leave the selected equation clear');
  for(const card of cards)assert.equal(overlap(card.getBounds(),focus),0,'Reference cards must leave the equation clear');
  assert.equal(await panel.webContents.executeJavaScript('document.querySelectorAll(".main-panel .message-avatar,.main-panel .lesson-controls").length'),0);
  assert.equal(await panel.webContents.executeJavaScript('document.querySelectorAll(".main-panel .annotation-links button").length'),2);
  await review(panel,'reference-main');for(const [i,card] of cards.entries())await review(card,'reference-card-'+(i+1));
  await composite([fixture,effects,overlay,...cards,panel,otto],'reference-desktop-1');
  await delay(1800);await composite([fixture,effects,overlay,...cards,panel,otto],'reference-desktop-2');
  await panel.webContents.executeJavaScript(`document.querySelector('.main-panel [aria-label="Otto settings"]').click()`);
  await delay(150);
  assert.ok(await panel.webContents.executeJavaScript('!!document.querySelector(".settings-embedded .lesson-controls")'));
  assert.ok(await panel.webContents.executeJavaScript('!!document.querySelector(".settings-embedded .snapshot-context")'));
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".provider-setting code").textContent'),'deterministic-demo');
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".provider-setting strong").textContent'),'Demo provider');
  await review(panel,'reference-settings');
  if(materialReview){
    await panel.webContents.executeJavaScript(`document.querySelector('.main-panel [aria-label="Otto settings"]').click()`);
    await materialFrame('reply',review);await finishMaterialReview(review,fixture,name=>composite([fixture,effects,overlay,...cards,panel,otto],name));
  }
  console.log('REFERENCE REVIEW PASS: native factoring fixture, clear focus, two linked ivory cards, numbered chips, branded settings and full-desktop compositor frames.');
}
