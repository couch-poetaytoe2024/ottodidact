import { describe,expect,it } from 'vitest';
import { mkdtempSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appearance } from '../shared/appearance';
import { emptySession } from '../shared/session';
import { readGlowMode,writeGlowMode } from '../desktop/preferences';
import type { Session } from '../shared/milestone';
describe('availability glow and processing lifecycle',()=>{
  for(const mode of ['always','needed'] as const)it('transitions through selection, capture, processing and dismissal in '+mode,()=>{
    const idle={...emptySession('session'),glowMode:mode};
    expect(appearance(idle).glow).toBe(mode==='always'?'faint':'off');
    const selection:Session={...idle,presented:true,phase:'selecting'};
    expect(appearance(selection)).toEqual({glow:'bright',dim:false,processing:false});
    expect(appearance({...selection,effectsSuspended:true})).toEqual({glow:'off',dim:false,processing:false});
    const loading:Session={...selection,phase:'loading',capture:{id:'capture',dataUrl:'',rect:{x:0,y:0,width:100,height:100},pixelWidth:100,pixelHeight:100,scaleFactor:1},pending:{id:'request',kind:'explain',conversationId:'session:main'}};
    expect(appearance(loading).processing).toBe(true);
    expect(appearance(loading).dim).toBe(true);
    expect(appearance({...loading,phase:'question',pending:undefined}).dim).toBe(true);
    const complete:Session={...loading,phase:'explained',pending:undefined,annotations:[{id:'a',captureId:'capture',kind:'circle',text:'Detail',bounds:{x:1,y:1,width:10,height:10}}]};
    expect(appearance(complete)).toEqual({glow:'bright',dim:true,processing:false});
    expect(appearance({...complete,annotations:[]}).dim).toBe(false);
    expect(appearance({...complete,presented:false})).toEqual({glow:mode==='always'?'faint':'off',dim:false,processing:false});
    for(const error of ['Cancelled','Request failed'])expect(appearance({...loading,phase:'question',pending:undefined,error}).processing).toBe(false);
  });
  it('persists only the preference and safely defaults malformed files',()=>{
    const directory=mkdtempSync(path.join(tmpdir(),'otto-preferences-')),file=path.join(directory,'appearance.json');
    try {
      expect(readGlowMode(file)).toBe('needed');
      for(const mode of ['always','needed'] as const){writeGlowMode(file,mode);expect(readGlowMode(file)).toBe(mode);expect(JSON.parse(readFileSync(file,'utf8'))).toEqual({glowMode:mode});}
      writeFileSync(file,'invalid json');expect(readGlowMode(file)).toBe('needed');
    } finally {rmSync(directory,{recursive:true,force:true});}
  });
});

it('does not present old snapshot geometry after a display change',()=>{
  const state:Session={...emptySession('lesson'),presented:true,snapshotStale:true,phase:'loading',capture:{id:'c',dataUrl:'',rect:{x:100,y:100,width:300,height:200},pixelWidth:1000,pixelHeight:600,scaleFactor:1},pending:{id:'request',kind:'chat',conversationId:'lesson:main'}};
  expect(appearance(state)).toEqual({glow:'bright',dim:false,processing:false});
});
