import assert from 'node:assert/strict';
import { screen,type BrowserWindow } from 'electron';
import { EDGE_CORE_WIDTH,LIGHT_SOURCE_GAP } from '../shared/ambientLight';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

/** Inspect rendered native pixels, including transparency at the window boundary. */
export async function checkGlass(win:BrowserWindow,selector='.otto-logo',checkBoundary=true) {
  const rect=await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};})()`);
  const frame=await win.webContents.capturePage(),{width,height}=frame.getSize(),pixels=frame.toBitmap();
  const scale=width/win.getContentBounds().width,cx=(rect.x+rect.width/2)*scale,cy=(rect.y+rect.width/2)*scale,radius=rect.width/2*scale;
  let yellow=0,warm=0,blue=0,total=0,boundaryAlpha=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const offset=(y*width+x)*4,[b,g,r,a]=pixels.subarray(offset,offset+4);
    if(x===0||y===0||x===width-1||y===height-1)boundaryAlpha=Math.max(boundaryAlpha,a);
    if(Math.hypot(x-cx,y-cy)>radius*.93||a<200)continue;
    total++;
    if(r>175&&g>145&&b<110)yellow++;
    // Include saturated orange, not just red. A moving warm pool can shift
    // toward orange without disappearing or becoming a single-color surface.
    if(r>175&&g<185&&b<120&&r>g*1.3)warm++;
    if(b>140&&b>r*1.2&&g>65)blue++;
  }
  assert.ok(yellow/total>.15,'Glass must show yellow on its surface');
  assert.ok(warm/total>.15,'Glass must show orange/red at the same time');
  assert.ok(blue/total>.015&&blue/total<.25,'Glass must retain a smaller, visible blue accent');
  if(checkBoundary)assert.ok(boundaryAlpha<=8,'The halo must fade to transparent before the native window edge');
  console.log('Native glass pixels:',JSON.stringify({yellow:yellow/total,warm:warm/total,blue:blue/total,boundaryAlpha}));
}

export async function checkLightGap(companion:BrowserWindow,effects:BrowserWindow) {
  const button=await companion.webContents.executeJavaScript(`(()=>{const el=document.querySelector('.otto-button'),r=el.getBoundingClientRect();return {x:r.x+r.width,y:r.y+r.height/2,halo:-parseFloat(getComputedStyle(el,'::before').left)};})()`);
  const window=companion.getBounds(),display=screen.getDisplayMatching(window);
  // The default right corner has a genuine transparent interval between sources.
  const edgeEnd=display.bounds.x+display.bounds.width-EDGE_CORE_WIDTH,haloEnd=edgeEnd-LIGHT_SOURCE_GAP;
  assert.ok(edgeEnd-haloEnd>=1.5,'Contained halo must leave a gap from the screen light');
  const frame=await companion.webContents.capturePage(),size=frame.getSize(),pixels=frame.toBitmap(),scale=size.width/window.width;
  const x=Math.floor((edgeEnd+haloEnd)/2-window.x),y=Math.floor(button.y);
  const alpha=pixels[(Math.round(y*scale)*size.width+Math.round(x*scale))*4+3];
  assert.equal(alpha,0,'No launcher plume may fill the gap');
  const edge=await effects.webContents.capturePage(),e=edge.getSize(),bitmap=edge.toBitmap(),sx=e.width/display.bounds.width;
  const px=Math.round(((edgeEnd+haloEnd)/2-display.bounds.x)*sx),py=Math.round((window.y+y-display.bounds.y)*sx);
  assert.ok(Math.abs(bitmap[(py*e.width+px)*4+3]-76.5)<=1,'Only the neutral study dimming should remain in the gap');
}

export async function checkEmblems(companion:BrowserWindow,panel:BrowserWindow,review:(win:BrowserWindow,name:string)=>Promise<void>) {
  const emblems=[{win:companion,selector:'.otto-button .otto-logo',name:'launcher'},{win:panel,selector:'.question-input-panel .chat-header .otto-logo',name:'header'}];
  for(const {win,selector,name} of emblems){
    await checkGlass(win,selector,name==='launcher');
    const result=await win.webContents.executeJavaScript(`(()=>{
      const face=document.querySelector(${JSON.stringify(selector)}),eyes=face.querySelectorAll('.otto-eye');
      const glance=face.querySelector('.otto-eyes').getAnimations()[0],blink=eyes[0].getAnimations()[0];
      const inside=()=>[...eyes].every(e=>{const r=e.getBoundingClientRect(),f=face.getBoundingClientRect();return r.left>f.left&&r.right<f.right&&r.top>f.top&&r.bottom<f.bottom;});
      glance.pause();glance.currentTime=0;const neutral=eyes[0].getBoundingClientRect().x;
      glance.currentTime=4730;
      const dx=eyes[0].getBoundingClientRect().x-neutral;
      return {count:eyes.length,inside:inside(),dx,glanceDuration:glance.effect.getTiming().duration,blinkDuration:blink.effect.getTiming().duration,visible:face.dataset.motionVisible};
    })()`);
    assert.equal(result.count,2);assert.equal(result.inside,true);assert.ok(result.dx>.2&&result.dx<2);
    assert.equal(result.visible,'true');assert.equal(result.glanceDuration,43000);assert.equal(result.blinkDuration,19000);
    await review(win,`eyes-${name}-glance`);
    const blink=await win.webContents.executeJavaScript(`(()=>{
      const face=document.querySelector(${JSON.stringify(selector)}),eyes=[...face.querySelectorAll('.otto-eye')];
      for(const eye of eyes){const a=eye.getAnimations()[0];a.pause();a.currentTime=0;}
      const open=eyes[0].getBoundingClientRect().height;
      for(const eye of eyes)eye.getAnimations()[0].currentTime=3534;
      return eyes[0].getBoundingClientRect().height/open;
    })()`);
    assert.ok(blink>.08&&blink<.16,'Blink is a short lid motion, not a disappearing face');
    await review(win,`eyes-${name}-blink`);
    await win.webContents.executeJavaScript(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const a of f.getAnimations({subtree:true}))if(a.animationName!=='otto-color-flow'){a.currentTime=0;a.play();}})()`);
  }
  companion.hide();await delay(200);
  assert.equal(await companion.webContents.executeJavaScript('document.querySelector(".otto-logo").dataset.motionVisible'),'false');
  assert.equal(await companion.webContents.executeJavaScript('getComputedStyle(document.querySelector(".otto-eyes")).animationPlayState'),'paused');
  companion.showInactive();await delay(200);
  assert.equal(await companion.webContents.executeJavaScript('document.querySelector(".otto-logo").dataset.motionVisible'),'true');
  assert.equal(await panel.webContents.executeJavaScript('document.querySelector(".main-panel .otto-logo").dataset.motionVisible'),'false','The mounted but hidden main header must not animate');
}
