import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { GlowMode } from '../shared/milestone';
import type { Point } from '../shared/types';
interface Preferences {glowMode?:GlowMode;launcher?:Point}
function readPreferences(file:string):Preferences {
  try {
    const value=JSON.parse(readFileSync(file,'utf8')),preferences:Preferences={};
    if(value?.glowMode==='always'||value?.glowMode==='needed')preferences.glowMode=value.glowMode;
    const p=value?.launcher;
    if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000)preferences.launcher={x:p.x,y:p.y};
    return preferences;
  }catch{return {};}
}
export const readLauncherPosition=(file:string)=>readPreferences(file).launcher;
export function writeLauncherPosition(file:string,launcher:Point){writePreferences(file,{...readPreferences(file),launcher});}

export function readGlowMode(file:string):GlowMode { return readPreferences(file).glowMode??'needed'; }
export function writeGlowMode(file:string,mode:GlowMode) {writePreferences(file,{...readPreferences(file),glowMode:mode});}
function writePreferences(file:string,preferences:Preferences) {
  mkdirSync(path.dirname(file),{recursive:true});
  writeFileSync(file+'.tmp',JSON.stringify(preferences),'utf8');
  renameSync(file+'.tmp',file);
}
