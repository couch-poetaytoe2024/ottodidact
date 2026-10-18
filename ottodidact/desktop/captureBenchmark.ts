import assert from 'node:assert/strict';
import { getWindow } from './windows';
import { lastCaptureTiming } from './capture';
import { runCommand } from './ipc';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

/** Synthetic native input on the generated review backdrop; logs timings only. */
export async function captureBenchmark() {
  const selection=getWindow('selection')!;
  const metrics=[];
  for(let attempt=0;attempt<3;attempt++){
    const started=performance.now();
    await runCommand({type:'capture'});
    const readyMs=performance.now()-started;
    await selection.webContents.executeJavaScript(`(()=>{
      window.frameSamples=[];window.recordFrames=true;
      let last=performance.now();function tick(now){if(!window.recordFrames)return;window.frameSamples.push(now-last);last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
    })()`);
    const before=await selection.webContents.executeJavaScript('window.ottodidact.getState().then(s=>s.revision)');
    selection.webContents.sendInputEvent({type:'mouseDown',x:180,y:150,button:'left',clickCount:1});
    for(let index=0;index<90;index++){
      selection.webContents.sendInputEvent({type:'mouseMove',x:220+index*4,y:190+index*2,button:'left'});
      await delay(8);
    }
    const samples:number[]=await selection.webContents.executeJavaScript('window.recordFrames=false;window.frameSamples');
    const after=await selection.webContents.executeJavaScript('window.ottodidact.getState().then(s=>s.revision)');
    assert.equal(after,before,'Drag updates must not broadcast session state');
    samples.sort((a,b)=>a-b);
    metrics.push({readyMs,...lastCaptureTiming,frames:samples.length,frameP95Ms:samples[Math.floor(samples.length*.95)],frameMaxMs:samples.at(-1),visible:selection.isVisible(),hidden:await selection.webContents.executeJavaScript('document.hidden')});
    await runCommand({type:'cancel'});
    selection.webContents.sendInputEvent({type:'mouseUp',x:576,y:368,button:'left',clickCount:1});
  }
  console.log('CAPTURE BENCHMARK:',JSON.stringify(metrics));
}
