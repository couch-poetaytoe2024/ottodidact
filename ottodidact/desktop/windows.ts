import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import type { Session } from '../shared/milestone';
import { appearance } from '../shared/appearance';
import { CARD_SIZE, clampPanel, markerBounds, placeMainPanel, placeQuestionPanel, placeMeasuredCard, LAUNCHER_SIZE, launcherButtonBounds, restoreLauncherBounds, type CardMeasurement } from '../shared/presentation';
import type { Rect } from '../shared/types';
import { activeDisplay, useDisplay } from './displays';
import { readLauncherPosition } from './preferences';
import type { LightGeometry } from '../shared/ambientLight';
import { organizeAnnotations,emphasizedAnnotation } from '../shared/annotationOrganization';
import { layoutMeasuredPanels,type MeasuredPanel } from '../shared/panelLayout';

type WindowRole = 'companion' | 'selection' | 'annotations' | 'panel' | 'effects' | 'settings' | `branch:${string}`;
const windows = new Map<WindowRole, BrowserWindow>();
const loads = new Map<BrowserWindow, Promise<void>>();
let dismissPanel: (()=>void) | undefined;
let branchChanged:((id:string,bounds:Rect,open:boolean)=>void)|undefined;
let branchFocusChanged:((id:string,focused:boolean)=>void)|undefined;
let branchPresentationChanged:((id:string,minimized:boolean,expanded:boolean)=>void)|undefined;
export function setBranchPresentationHandler(handler:typeof branchPresentationChanged){branchPresentationChanged=handler;}
export function setBranchFocusHandler(handler:typeof branchFocusChanged) { branchFocusChanged=handler; }
let mainChanged:((bounds:Rect)=>void)|undefined;
export function setMainWindowHandler(handler:typeof mainChanged) { mainChanged=handler; }
export function setBranchWindowHandler(handler:typeof branchChanged) { branchChanged=handler; }
export function setPanelDismissHandler(handler: ()=>void) { dismissPanel=handler; }
export function windowReady(win: BrowserWindow): Promise<void> { return loads.get(win) ?? Promise.resolve(); }
export function getWindow(role: WindowRole) { return windows.get(role); }
export function ownsWebContents(id: number): boolean { return [...windows.values()].some(w => !w.isDestroyed() && w.webContents.id === id); }
export function roleOf(id: number): WindowRole | undefined { return [...windows.entries()].find(([,w]) => w.webContents.id === id)?.[0]; }

export function launcherLightGeometry():LightGeometry {
  const win=windows.get('companion')!;
  return {window:win.getBounds(),display:screen.getDisplayMatching(win.getBounds()).bounds,visible:win.isVisible()};
}
function syncLauncherLight(){
  const win=windows.get('companion');
  if(win&&!win.isDestroyed())for(const role of ['companion','effects'] as const){
    const target=windows.get(role);
    if(target&&!target.isDestroyed())target.webContents.send('appearance:geometry',launcherLightGeometry());
  }
}
export function createWindow(role: WindowRole): BrowserWindow {
  const existing = windows.get(role);
  if (existing) return existing;
  const saved=role==='companion'&&!process.argv.includes('--smoke-test')?readLauncherPosition(path.join(app.getPath('userData'),'appearance.json')):undefined;
  const launcher=role==='companion'?restoreLauncherBounds(screen.getAllDisplays().map(d=>d.workArea),activeDisplay().workArea,saved):undefined;
  if(launcher)useDisplay(screen.getDisplayMatching(launcher).id);
  const display = activeDisplay();
  const { workArea, bounds } = display;
  const full = role === 'selection' || role === 'annotations' || role==='effects';
  const width = role === 'companion' ? LAUNCHER_SIZE.width : Math.min(role==='settings'?320:role.startsWith('branch:')?CARD_SIZE.width:340,workArea.width);
  const height = role === 'companion' ? LAUNCHER_SIZE.height : Math.min(role==='settings'?430:role.startsWith('branch:')?CARD_SIZE.height:700,workArea.height);
  const win = new BrowserWindow({
    ...(full ? bounds : launcher??{ x:workArea.x+Math.max(0,workArea.width-width-16), y:workArea.y+Math.max(0,workArea.height-height-16), width,height }),
    frame:false, thickFrame:false, ...(full?{roundedCorners:false}:{}), transparent:true, backgroundColor:'#00000000',
    show:false, alwaysOnTop:true, resizable:false, skipTaskbar:role!=='panel',
    hasShadow:role==='panel'||role.startsWith('branch:'), focusable:role!=='annotations'&&role!=='effects',
    // Transparent full-display layers can be considered occluded by one another
    // on Windows. Keep visible snapshot/mark frames painting together.
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:true, backgroundThrottling:role!=='selection' },
  });
  windows.set(role,win);
  if(full||role==='companion'){
    // A transparent decoration window can make Chromium classify the small
    // launcher beneath it as occluded. Keep the face painting while shown;
    // real hide events still pause it and remove its separate halo.
    win.on('show',()=>win.webContents.setBackgroundThrottling(false));
    // Restore native visibility notifications when actually hidden, so the
    // existing reduced-motion/hidden-animation behavior continues to work.
    win.on('hide',()=>win.webContents.setBackgroundThrottling(true));
  }
  win.webContents.on('did-fail-load',(_event,code,description)=>console.error(`Window ${role} failed to load: ${code} ${description}`));
  win.webContents.on('render-process-gone',(_event,details)=>console.error(`Window ${role} renderer exited: ${details.reason}`));
  win.setAlwaysOnTop(true,'screen-saver');
  if(role==='effects')win.setIgnoreMouseEvents(true);
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.on('closed',()=>{windows.delete(role);loads.delete(win);});
  win.on('close',event=>{
    if (role==='panel' && !quitting) { event.preventDefault(); dismissPanel?.(); }
    if ((role==='settings'||role.startsWith('branch:')) && !quitting) { event.preventDefault(); win.hide(); }
  });
  if(!full)win.on('moved',()=>{
    const b=win.getBounds(),area=(role==='companion'?screen.getDisplayMatching(b):activeDisplay()).workArea;
    const x=Math.max(area.x,Math.min(area.x+area.width-b.width,b.x));
    const y=Math.max(area.y,Math.min(area.y+area.height-b.height,b.y));
    if(x!==b.x||y!==b.y)win.setPosition(x,y);
  });
  if(role==='companion'){win.on('move',syncLauncherLight);win.on('resize',syncLauncherLight);win.on('show',syncLauncherLight);win.on('hide',syncLauncherLight);win.webContents.on('did-finish-load',syncLauncherLight);}
  if(role==='effects')win.webContents.on('did-finish-load',syncLauncherLight);
  if(role==='panel'){
    const changed=()=>{if(!win.isDestroyed()){const b=win.getBounds(),origin=activeDisplay().bounds;mainChanged?.({...b,x:b.x-origin.x,y:b.y-origin.y});}};
    win.on('move',changed);win.on('resize',changed);
  }
  if(role.startsWith('branch:')) {
    win.on('focus',()=>branchFocusChanged?.(role.slice(7),true));
    win.on('blur',()=>branchFocusChanged?.(role.slice(7),false));
    win.on('hide',()=>branchFocusChanged?.(role.slice(7),false));
    const changed=()=>{
      if(win.isDestroyed())return;
      const b=win.getBounds(),origin=activeDisplay().bounds;
      branchChanged?.(role.slice(7),{...b,x:b.x-origin.x,y:b.y-origin.y},win.isVisible());
    };
    win.on('move',changed);win.on('resize',changed);win.on('moved',changed);win.on('resized',changed);win.on('show',changed);win.on('hide',changed);
  }
  if (process.argv.includes('--dev')) {
    loads.set(win,win.loadURL(`http://127.0.0.1:5173/#/${role}`));
  } else {
    loads.set(win,win.loadFile(path.join(__dirname,'../../dist/index.html'),{hash:`/${role}`}));
  }
  void windowReady(win).catch(error=>console.error(`Cannot load ${role}:`,error));
  win.setContentProtection(true);
  // Automated runs inject input through webContents; avoid intercepting the user's desktop clicks.
  if(process.argv.includes('--smoke-test'))win.setIgnoreMouseEvents(true);
  return win;
}
let quitting = false;
let visibilityVersion=0;
export function markQuitting() { quitting=true; }
export async function showWindow(role: WindowRole, focus = true) {
  const version=visibilityVersion;
  const win = createWindow(role);
  await windowReady(win);
  if (win.isDestroyed() || version!==visibilityVersion) return;
  if (focus && role!=='annotations'&&role!=='effects') { win.show(); win.focus(); }
  else win.showInactive();
  if (role==='annotations')for(const [name,control] of windows)if(name!=='annotations'&&name!=='effects'&&control.isVisible())control.moveTop();
}
let effectsVersion=0;
export function hideAll() { visibilityVersion++; effectsVersion++; for (const win of windows.values()) win.hide(); }
export function syncEffects(state:Session) {
  const token=++effectsVersion,visual=appearance(state),win=createWindow('effects');
  if(state.phase==='selecting'||(visual.glow==='off'&&!visual.dim&&!visual.processing)){win.hide();return;}
  void windowReady(win).then(()=>{
    if(token!==effectsVersion||win.isDestroyed())return;
    if(win.isVisible())return;
    win.showInactive();
    // Keep decoration behind every actual control, including an active selection.
    for(const [role,control] of windows)if(role!=='effects'&&control.isVisible())control.moveTop();
  });
}
export function closeBranchWindows() {
  clearTimeout(reflowTimer);layoutState=undefined;preferredPanel=undefined;
  branchMeasurements.clear();
  for(const [role,win] of windows)if(role.startsWith('branch:'))win.destroy();
}
const branchMeasurements=new Map<string,{measurements:CardMeasurement[];collapsed:CardMeasurement;expanded:boolean;minimized:boolean}>();
let reflowTimer:ReturnType<typeof setTimeout>|undefined,layoutState:Session|undefined,preferredPanel:string|undefined,inReflow=false;
export function scheduleBranchReflow(state:Session,preferredId?:string){
  layoutState=state;
  if(inReflow)return;
  if(preferredId)preferredPanel=preferredId;
  clearTimeout(reflowTimer);
  reflowTimer=setTimeout(()=>{
    const latest=layoutState,preferred=preferredPanel;
    if(latest)reflowBranches(latest,preferred);
  },140);
}
function setBranchBounds(win:BrowserWindow,next:Rect){
  const old=win.getBounds();
  // Windows rounds DIP bounds at fractional scales; don't feed that rounding
  // back into a resize loop and gradually grow the window.
  if(['x','y','width','height'].some(key=>Math.abs(old[key as keyof Rect]-next[key as keyof Rect])>1))win.setBounds(next);
}
export function resizeBranchPanel(state:Session,id:string,measurements:CardMeasurement[],expanded:boolean,minimized:boolean,collapsed:CardMeasurement={width:240,height:64}){
  const branch=state.branches[id],win=getWindow(`branch:${id}`);
  if(!branch||!win||expanded!==!!branch.expanded||minimized!==!!branch.minimized)return;
  const prior=branchMeasurements.get(id);branchMeasurements.set(id,{measurements,expanded,minimized,collapsed});
  if(win.isVisible()){scheduleBranchReflow(state);return;}
  const d=activeDisplay(),origin=d.bounds,area={...d.workArea,x:d.workArea.x-origin.x,y:d.workArea.y-origin.y};
  const panel=getWindow('panel')!.getBounds(),main={...panel,x:panel.x-origin.x,y:panel.y-origin.y};
  const marker=(state.lessonAnnotations??state.annotations).find(a=>a.id===branch.annotationId);
  if(!marker||!state.capture)return;
  const others=Object.values(state.branches).filter(b=>b.id!==id&&b.open&&b.windowBounds).map(b=>{
    const bounds=getWindow(`branch:${b.id}`)?.getBounds();
    return bounds?{...bounds,x:bounds.x-origin.x,y:bounds.y-origin.y}:b.windowBounds!;
  });
  const focus=state.presented&&!state.snapshotStale?state.capture.rect:{x:0,y:0,width:0,height:0};
  const bounds=win.getBounds();
  const previous=prior?{...bounds,x:bounds.x-origin.x,y:bounds.y-origin.y}:undefined;
  const peers=Object.values(state.branches).filter(b=>b.id!==id&&b.open&&b.windowBounds).flatMap(b=>{
    const m=state.annotations.find(a=>a.id===b.annotationId),native=getWindow(`branch:${b.id}`)?.getBounds();
    return m?[{marker:m,rect:native?{...native,x:native.x-origin.x,y:native.y-origin.y}:b.windowBounds!}]:[];
  });
  const next=placeMeasuredCard(marker,focus,area,main,others,measurements,previous,peers);
  setBranchBounds(win,{...next,x:next.x+origin.x,y:next.y+origin.y});
}
function reflowBranches(state:Session,preferredId?:string){
  if(inReflow||!state.presented||state.phase==='selecting'||!state.capture)return;
  const d=activeDisplay(),origin=d.bounds,local=(r:Rect)=>({...r,x:r.x-origin.x,y:r.y-origin.y});
  const main=local(getWindow('panel')!.getBounds()),area=local(d.workArea),entries:MeasuredPanel[]=[];
  for(const branch of Object.values(state.branches)){
    const measured=branchMeasurements.get(branch.id),win=getWindow(`branch:${branch.id}`);
    const marker=(state.lessonAnnotations??state.annotations).find(a=>a.id===branch.annotationId);
    if(!win?.isVisible()||!measured||!marker)continue;
    // Don't apply measurements from before an expand/restore transition.
    if(measured.expanded!==!!branch.expanded||measured.minimized!==!!branch.minimized)return;
    entries.push({id:branch.id,marker,bounds:local(win.getBounds()),...measured});
  }
  const focus=state.snapshotStale?{x:0,y:0,width:0,height:0}:state.capture.rect;
  const plan=layoutMeasuredPanels(entries,focus,area,main,preferredId);
  inReflow=true;
  try{
    for(const entry of entries){
      const next=plan[entry.id],win=getWindow(`branch:${entry.id}`)!;
      if(next.minimized!==entry.minimized||next.expanded!==entry.expanded)branchPresentationChanged?.(entry.id,next.minimized,next.expanded);
      setBranchBounds(win,{...next.bounds,x:next.bounds.x+origin.x,y:next.bounds.y+origin.y});
    }
  }finally{inReflow=false;}
}
export function visibleBranchIds() { return [...windows.entries()].filter(([role,win])=>role.startsWith('branch:')&&win.isVisible()).map(([role])=>role.slice(7)); }
/** Load the needed renderers together, without displaying or focusing them.
 * Each card is still placed against already shown peers just before reveal. */
export function prepareBranchWindows(state:Session) {
  for(const branch of Object.values(state.branches))createWindow(`branch:${branch.id}`);
}
export async function showBranch(state:Session,id:string,focus=true) {
  const visibility=visibilityVersion;
  const role=`branch:${id}` as const,win=createWindow(role);
  const branch=state.branches[id];
  if(branch?.windowBounds) {
    const display=activeDisplay(),r=branch.windowBounds;
    setBranchBounds(win,clampPanel({...r,x:r.x+display.bounds.x,y:r.y+display.bounds.y},display.workArea));
  } else if(state.capture) {
    const display=activeDisplay(),area=display.workArea,b=win.getBounds(),r=state.capture.rect;
    const candidates=[{x:display.bounds.x+r.x+r.width+18,y:display.bounds.y+r.y},{x:display.bounds.x+r.x-b.width-18,y:display.bounds.y+r.y},{x:area.x,y:area.y}];
    const best=candidates.find(p=>p.x>=area.x&&p.x+b.width<=area.x+area.width)??candidates[2];
    win.setPosition(Math.round(best.x),Math.round(Math.max(area.y,Math.min(area.y+area.height-b.height,best.y))));
  }
  await windowReady(win);
  // Initial content is measured while hidden, so the first visible card already
  // has its own readable dimensions. Don't destroy/remount chats to resize them.
  for(let i=0;i<30&&!win.isDestroyed();i++){
    const measured=branchMeasurements.get(id);
    if(measured&&measured.expanded===!!branch?.expanded&&measured.minimized===!!branch?.minimized)break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(win.isDestroyed()||visibility!==visibilityVersion)return;
  // A renderer may have measured while its peers were still hidden. Recheck
  // against their current native bounds before revealing this card. Valid
  // positions and dimensions remain stable when reopening an existing chat.
  const measured=branchMeasurements.get(id);
  if(measured)resizeBranchPanel(state,id,measured.measurements,measured.expanded,measured.minimized,measured.collapsed);
  await showWindow(role,focus);
}
let panelLayoutKey='';
let questionAnchor:Rect|undefined;
let questionDragged=false;
let mainSession='',mainContext='',mainHeight=300;
let mainAnchor:Rect|undefined;
export function sizeMainPanel(state:Session) {
  if(state.phase==='selecting'||state.effectsSuspended)return;
  if(mainSession!==state.id){mainSession=state.id;mainHeight=300;mainAnchor=undefined;mainContext='';}
  const asking=!!state.presented&&state.panelView!=='main'&&(state.phase==='question'||state.phase==='loading');
  const d=activeDisplay(),launcher=windows.get('companion')?.getBounds();
  if(!launcher)return;
  const a=screen.getDisplayMatching(launcher).workArea,r=state.capture?.rect;
  const selection=r?{...r,x:r.x+d.bounds.x,y:r.y+d.bounds.y}:undefined;
  const focus=state.presented&&!state.snapshotStale?selection:undefined;
  const context=JSON.stringify([state.id,asking,a,launcher,focus]);
  const key=context+':'+(asking?'':mainHeight+':'+!!state.mainMinimized);
  if(key===panelLayoutKey)return;
  panelLayoutKey=key;
  const win=windows.get('panel');if(!win)return;
  if(asking&&selection){questionDragged=false;questionAnchor=placeQuestionPanel(selection,d.workArea);win.setBounds(questionAnchor);return;}
  const cards=state.presented?Object.values(state.branches).filter(b=>b.open&&b.windowBounds).map(b=>({...b.windowBounds!,x:b.windowBounds!.x+d.bounds.x,y:b.windowBounds!.y+d.bounds.y})):[];
  mainAnchor=placeMainPanel(a,launcherButtonBounds(launcher),mainHeight,focus,context===mainContext?mainAnchor:undefined,cards,!!state.mainMinimized);
  mainContext=context;
  win.setBounds(mainAnchor);
  scheduleBranchReflow(state);
  // Retain the logical anchor: feeding rounded native bounds back can accumulate pixel drift.
}
export function resizeMainPanel(state:Session,height:number) {
  if(state.phase!=='explained'||!state.presented||state.mainMinimized)return;
  // Grow with content; shrinking on a transient loading row would make the panel jump.
  mainHeight=Math.max(mainHeight,Math.min(680,height));sizeMainPanel(state);
}
export function resizeQuestionPanel(state:Session,height:number) {
  const win=windows.get('panel');if(!win||!state.capture)return;
  const b=win.getBounds(),d=activeDisplay();
  if(questionAnchor&&(Math.abs(b.x-questionAnchor.x)>1||Math.abs(b.y-questionAnchor.y)>1))questionDragged=true;
  const selection={...state.capture.rect,x:state.capture.rect.x+d.bounds.x,y:state.capture.rect.y+d.bounds.y};
  const next=questionDragged?clampPanel({...b,height},d.workArea):placeQuestionPanel(selection,d.workArea,{width:400,height});
  questionAnchor=next;win.setBounds(next);
}
export function moveLauncher(dx:number,dy:number) {
  const win=windows.get('companion');if(!win)return;
  const b=win.getBounds(),a=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  win.setPosition(Math.round(Math.max(a.x,Math.min(a.x+a.width-b.width,b.x+dx))),Math.round(Math.max(a.y,Math.min(a.y+a.height-b.height,b.y+dy))));
}
export function broadcast(state: Session) {
  for (const win of windows.values()) if (!win.isDestroyed()) win.webContents.send('session:state',state);
}

// Native cursor hit testing also detects entry while the window ignores mouse events.
// Only annotation control rectangles intercept the desktop, never the whole overlay.
let lastInteractive = false;
let hitState:Session|undefined,hitMarkers:Session['annotations']=[];
export function updateHitTesting(state: Session) {
  if(process.argv.includes('--smoke-test'))return;
  const win = windows.get('annotations');
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) {
    if (lastInteractive) win.setIgnoreMouseEvents(true);
    lastInteractive=false;
    return;
  }
  const cursor = screen.getCursorScreenPoint(), origin = win.getBounds();
  const x=cursor.x-origin.x, y=cursor.y-origin.y;
  if(hitState!==state){hitState=state;hitMarkers=organizeAnnotations(state.annotations,state.branches,emphasizedAnnotation(state),state.overlayMainBounds).marks.filter(mark=>mark.visible).map(mark=>mark.marker);}
  const interactive=win.isVisible() && hitMarkers.some(a=>{
    const b=a.kind==='arrow'?(a.target??a.bounds):markerBounds(a), padding=10;
    return x>=b.x-padding && x<=b.x+b.width+padding && y>=b.y-padding && y<=b.y+b.height+padding;
  });
  if (interactive!==lastInteractive) {
    win.setIgnoreMouseEvents(!interactive);
    lastInteractive=interactive;
  }
}
export function initializeWindows() {
  createWindow('companion');
  createWindow('panel');
  const annotations=createWindow('annotations');
  annotations.setIgnoreMouseEvents(true);
  createWindow('selection');
  createWindow('effects');
  createWindow('settings');
}


// All decoration uses full display bounds, including the taskbar. Controls use workArea.
export function fitDisplayWindows() {
  const display=activeDisplay();
  syncLauncherLight();
  panelLayoutKey='';mainContext='';mainAnchor=undefined;
  for(const [role,win] of windows) {
    if(role==='effects'||role==='selection'||role==='annotations')win.setBounds(display.bounds);
    else if(!role.startsWith('branch:')){
      const before=win.getBounds(),next=clampPanel(before,display.workArea);
      // Reapplying identical DIP bounds at fractional scaling can round outward repeatedly.
      if(JSON.stringify(before)!==JSON.stringify(next))win.setBounds(next);
    }
  }
}
