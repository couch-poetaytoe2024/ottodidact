// Opt-in native Windows review against a generated backdrop, never the user's documents.
import { app, BrowserWindow, screen } from 'electron';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { getWindow } from './windows';
import { referenceBackdrop } from './referenceReview';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

export async function createReviewBackdrop():Promise<BrowserWindow|undefined> {
  if(process.env.OTTODIDACT_UI_REVIEW!=='1'||process.platform!=='win32')return;
  const display=screen.getPrimaryDisplay();
  console.log('Native review display:',JSON.stringify({bounds:display.bounds,workArea:display.workArea,scale:display.scaleFactor}));
  const fixture=new BrowserWindow({...display.bounds,frame:false,thickFrame:false,roundedCorners:false,show:false,skipTaskbar:true,alwaysOnTop:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  await fixture.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(process.env.OTTODIDACT_REFERENCE_REVIEW==='1'?referenceBackdrop:`<!doctype html><html><head><style>
  *{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;background:#eeebe5;color:#343941;font:16px Segoe UI,sans-serif;padding:70px}
  body:before{content:'';position:absolute;inset:0;background-image:linear-gradient(#363c4810 1px,transparent 1px),linear-gradient(90deg,#363c4810 1px,transparent 1px);background-size:80px 80px;pointer-events:none}
  h1{font:36px Georgia,serif}p{max-width:650px;line-height:1.7}article{padding:30px;background:#fffdf9;border-radius:18px;width:650px}
  button{position:absolute;left:45%;top:55%;width:180px;height:64px;border:1px solid #a6aab5;border-radius:12px;background:#fff;font:16px Segoe UI;color:#202636}
  footer{position:absolute;bottom:45px;left:70px;color:#747984;font-size:13px}</style></head><body>
  <h1>Ottodidact native display review</h1><article><h2>A captured lesson</h2><p>This generated page is a safe backdrop for inspecting the real Windows overlay. The screen perimeter includes the taskbar area.</p><p>Selection is the focus. One full-display snapshot supplies the context.</p></article>
  <button onclick="this.textContent='Click passed through';document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1)">Test click-through</button>
  <footer>Generated test content &middot; no user documents &middot; no model calls</footer></body></html>`));
  fixture.show();fixture.setBounds(display.bounds);
  // Cover other applications with generated content before the clean-capture check.
  const handle=fixture.getNativeWindowHandle().readBigUInt64LE().toString();
  const placement=`Add-Type @'
using System;
using System.Runtime.InteropServices;
public class BackdropPlacement { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags); }
'@
[void][BackdropPlacement]::SetWindowPos([IntPtr]${handle},[IntPtr](-1),0,0,0,0,0x53)`;
  await new Promise<void>((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(placement,'utf16le').toString('base64')],{windowsHide:true,timeout:10000},error=>error?reject(error):resolve()));
  await delay(250);
  return fixture;
}

export async function reviewNativeEdges(fixture:BrowserWindow|undefined) {
  if(!fixture)return;
  const display=screen.getPrimaryDisplay(),effects=getWindow('effects')!,panel=getWindow('panel')!,companion=getWindow('companion')!;
  assert.deepEqual(effects.getBounds(),display.bounds,'Native effects window must cover full display, including taskbar');
  const geometry=await effects.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.edge-glow').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  assert.deepEqual(geometry,{x:0,y:0,width:display.bounds.width,height:display.bounds.height});
  const first=await effects.webContents.executeJavaScript('getComputedStyle(document.querySelector(".edge-light")).transform');
  await delay(650);
  assert.notEqual(await effects.webContents.executeJavaScript('getComputedStyle(document.querySelector(".edge-light")).transform'),first,'Color must travel, not merely pulse opacity');
  fixture.focus();effects.showInactive();effects.moveTop();panel.moveTop();companion.moveTop();
  const directory=path.join(app.getAppPath(),'.ui-review');mkdirSync(directory,{recursive:true});
  const at=screen.dipToScreenPoint({x:Math.round(display.bounds.x+display.bounds.width*.45+90),y:Math.round(display.bounds.y+display.bounds.height*.55+32)});
  const origin=screen.dipToScreenPoint({x:display.bounds.x,y:display.bounds.y});
  const physical={width:Math.round(display.bounds.width*display.scaleFactor),height:Math.round(display.bounds.height*display.scaleFactor)};
  const handle=fixture.getNativeWindowHandle().readBigUInt64LE().toString();
  const literal=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
  const script=`$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;

public class NativeReview {
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr handle,uint flags);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",SetLastError=true)] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int attribute,out int value,int size);
 [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr window);
 [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr window,IntPtr dc);
 [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr dest,int x,int y,int width,int height,IntPtr src,int sx,int sy,uint op);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
[void][NativeReview]::SetThreadDpiAwarenessContext([IntPtr](-4))
$point=New-Object NativeReview+POINT
$point.X=${at.x};$point.Y=${at.y}
$cloaked=0
[void][NativeReview]::DwmGetWindowAttribute([IntPtr]${handle},14,[ref]$cloaked,4)
if($cloaked -ne 0){throw ('Native review backdrop is cloaked by Windows: '+$cloaked)}
$foreground=[NativeReview]::GetForegroundWindow()
# Place only this review's own windows, without activating any of them.
foreach($owned in @(${handle},${effects.getNativeWindowHandle().readBigUInt64LE().toString()},${panel.getNativeWindowHandle().readBigUInt64LE().toString()},${companion.getNativeWindowHandle().readBigUInt64LE().toString()})){
 if(-not [NativeReview]::SetWindowPos([IntPtr]$owned,[IntPtr](-1),0,0,0,0,0x53)){throw 'Could not place native review windows'}
}
Start-Sleep -Milliseconds 300
$target=[NativeReview]::GetAncestor([NativeReview]::WindowFromPoint($point),2)
if($target.ToInt64() -ne ${handle}){throw 'The generated backdrop is not at the test point. No click was sent.'}
if([NativeReview]::GetForegroundWindow() -ne $foreground){throw 'Decorative overlay changed keyboard focus.'}
$saved=New-Object NativeReview+POINT
[void][NativeReview]::GetCursorPos([ref]$saved)
try {
 [void][NativeReview]::SetCursorPos(${at.x},${at.y})
 [NativeReview]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 [NativeReview]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
} finally {[void][NativeReview]::SetCursorPos($saved.X,$saved.Y)}
# The test backdrop is itself topmost so it safely covers other applications.
# Clicking it raises it; restore decoration above this test-only backdrop for screenshots.
foreach($owned in @(${effects.getNativeWindowHandle().readBigUInt64LE().toString()},${panel.getNativeWindowHandle().readBigUInt64LE().toString()},${companion.getNativeWindowHandle().readBigUInt64LE().toString()})){
 [void][NativeReview]::SetWindowPos([IntPtr]$owned,[IntPtr](-1),0,0,0,0,0x53)
}
foreach($frame in 1..2){
 Start-Sleep -Milliseconds 1500
 $bitmap=New-Object System.Drawing.Bitmap(${physical.width},${physical.height})
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 try {
  $dest=$graphics.GetHdc()
  $source=[NativeReview]::GetDC([IntPtr]::Zero)
  try {
   if(-not [NativeReview]::BitBlt($dest,0,0,${physical.width},${physical.height},$source,${origin.x},${origin.y},0x40CC0020)){throw 'Desktop compositor capture failed'}
  } finally {$graphics.ReleaseHdc($dest);[void][NativeReview]::ReleaseDC([IntPtr]::Zero,$source)}
  $bitmap.Save((Join-Path ${literal(directory)} ('native-edges-'+$frame+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
 } finally {$graphics.Dispose();$bitmap.Dispose()}
}
Write-Output 'Native OS hit testing, click-through, focus, and screen captures passed.'`;
  for(const win of [effects,panel,companion])win.setContentProtection(false);
  try {
    await delay(350);
    const output=await new Promise<string>((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:20000},(error,stdout,stderr)=>error?reject(new Error(stdout+'\n'+(stderr||error.message))):resolve(stdout)));
    console.log(output.trim());
    assert.equal(await fixture.webContents.executeJavaScript('document.body.dataset.clicks'),'1','A physical mouse click must reach the backdrop');
  } finally {for(const win of [effects,panel,companion])win.setContentProtection(true);panel.focus();}
}
