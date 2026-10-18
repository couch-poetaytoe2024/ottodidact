import { describe,it,expect } from 'vitest';
import { LIGHT_PERIOD_MS,lightPhase,lightColorAt,LIGHT_STOPS } from '../shared/ambientLight';
import { LAUNCHER_SIZE,launcherButtonBounds,restoreLauncherBounds } from '../shared/presentation';
import { readGlowMode,writeGlowMode,readLauncherPosition,writeLauncherPosition } from '../desktop/preferences';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('one ambient color field',()=>{
  const display={x:0,y:0,width:1536,height:864};
  it('agrees at the north edge with the CSS stops and wraps without a seam',()=>{
    expect(lightColorAt(display,{x:768,y:0},0)).toEqual(LIGHT_STOPS[0][1]);
    expect(lightColorAt(display,{x:768,y:0},LIGHT_PERIOD_MS)).toEqual(LIGHT_STOPS[0][1]);
    expect(lightPhase(-1)).toBe(LIGHT_PERIOD_MS-1);
  });
  it('retains two separated blue pools as the perimeter palette travels',()=>{
    for(const time of [0,6000,12000,18000]){
      const blue=Array.from({length:360},(_,angle)=>{
        const radians=angle*Math.PI/180;
        const [r,g,b]=lightColorAt(display,{x:768+400*Math.sin(radians),y:432-400*Math.cos(radians)},time);
        return b>r*1.3&&g>65;
      });
      expect(blue.filter((value,i)=>value&&!blue[(i+359)%360])).toHaveLength(2);
      expect(blue.filter(Boolean).length).toBeGreaterThan(40);
      expect(blue.filter(Boolean).length).toBeLessThan(130);
    }
  });
  it('is independent of monitor origin and display scaling',()=>{
    const original=lightColorAt(display,{x:1400,y:780},2100);
    for(const scale of [1,1.25,1.5,1.75,2])expect(lightColorAt({x:-1920,y:150,width:display.width*scale,height:display.height*scale},{x:-1920+1400*scale,y:150+780*scale},2100)).toEqual(original);
  });
  it('changes continuously and has no large brightness flash at the loop seam',()=>{
    let previous=lightColorAt(display,{x:1490,y:780},-16);
    for(let time=0;time<=LIGHT_PERIOD_MS;time+=16){
      const color=lightColorAt(display,{x:1490,y:780},time);
      color.forEach((value,i)=>expect(Math.abs(value-previous[i])).toBeLessThan(4));previous=color;
    }
  });
});

describe('compact persistent launcher placement',()=>{
  const primary={x:0,y:0,width:1536,height:816},left={x:-1600,y:-120,width:1600,height:900};
  it('places the visible body sixteen logical pixels from usable right/bottom edges',()=>{
    for(const area of [primary,left]){
      const bounds=restoreLauncherBounds([area],area),body=launcherButtonBounds(bounds);
      expect(bounds.width).toBe(LAUNCHER_SIZE.width);expect(body.width).toBe(76);
      expect(area.x+area.width-body.x-body.width).toBe(16);expect(area.y+area.height-body.y-body.height).toBe(16);
    }
  });
  it('preserves a deliberate placement on another monitor, but recovers removed/invalid positions',()=>{
    expect(restoreLauncherBounds([primary,left],primary,{x:-900,y:200})).toEqual({x:-900,y:200,...LAUNCHER_SIZE});
    for(const point of [{x:99999,y:0},{x:NaN,y:0},{x:-900,y:200}])expect(restoreLauncherBounds([primary],primary,point)).toEqual(restoreLauncherBounds([primary],primary));
  });
  it('retains position when glow changes and validates persisted data',()=>{
    const folder=mkdtempSync(path.join(tmpdir(),'otto-placement-')),file=path.join(folder,'appearance.json');
    try {
      writeGlowMode(file,'always');writeLauncherPosition(file,{x:-900,y:200});
      expect(readGlowMode(file)).toBe('always');expect(readLauncherPosition(file)).toEqual({x:-900,y:200});
      writeGlowMode(file,'needed');expect(readLauncherPosition(file)).toEqual({x:-900,y:200});
      writeFileSync(file,JSON.stringify({glowMode:'always',launcher:{x:'bad',y:0}}));
      expect(readLauncherPosition(file)).toBeUndefined();expect(readGlowMode(file)).toBe('always');
    } finally {rmSync(folder,{recursive:true,force:true});}
  });
});
