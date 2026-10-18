import { app, ipcMain, screen } from 'electron';
import type { Command, Session } from '../shared/milestone';
import { commandSchema } from '../shared/commands';
import { emptySession, capturedSession, openBranch, bringToMain } from '../shared/session';
import { captureDisplay, selectSnapshot,prepareFocusDetail } from './capture';
import { activeDisplay, useDisplay } from './displays';
import { broadcast, getWindow, hideAll, ownsWebContents, roleOf, showWindow, updateHitTesting, setPanelDismissHandler, fitDisplayWindows, resizeQuestionPanel, resizeMainPanel } from './windows';
import { CaptureQueue } from './captureQueue';
import { TutorCoordinator } from './tutor';
import { providerStatus, requestTutor } from './backend';
import path from 'node:path';
import { readGlowMode, writeGlowMode, writeLauncherPosition } from './preferences';
import { syncEffects, moveLauncher, showBranch, prepareBranchWindows, closeBranchWindows, visibleBranchIds, setBranchWindowHandler, sizeMainPanel, launcherLightGeometry } from './windows';
import { layoutCards } from '../shared/presentation';
import { resizeBranchPanel,setMainWindowHandler,setBranchFocusHandler,setBranchPresentationHandler,scheduleBranchReflow } from './windows';
import type { GlowMode } from '../shared/milestone';
import { annotationAttention } from '../shared/annotationOrganization';

let state=emptySession(crypto.randomUUID());
let previous: Session | undefined;
let previousBranches:string[]=[];
let previousDisplayId:number|undefined;
let generation=0;
const captures=new CaptureQueue();
let glowMode:GlowMode='needed';
const preferencesFile=()=>path.join(app.getPath('userData'),'appearance.json');
function publish(next: Session) { state={...next,glowMode,revision:state.revision+1}; broadcast(state); syncEffects(state); sizeMainPanel(state); }
const tutor=new TutorCoordinator(()=>state,publish,()=>activeDisplay().size,requestTutor,prepareFocusDetail,{
  progress:value=>{
    const win=getWindow(value.conversationId===state.main.id?'panel':`branch:${value.conversationId}`);
    if(win&&!win.isDestroyed())win.webContents.send('tutor:progress',value);
  },
  timing:value=>console.log(JSON.stringify(value)),
});
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function refreshProvider() {
  const provider=await providerStatus();
  publish({...state,provider});
}
function restore() {
  generation++;
  if(previousDisplayId!==undefined){useDisplay(previousDisplayId);fitDisplayWindows();previousDisplayId=undefined;}
  publish(previous ?? {...state, phase:state.capture ? (state.explanation ? 'explained':'question'):'idle'});
  previous=undefined;
  hideAll(); syncEffects(state);
  void showWindow('companion',false);
  if (state.presented && state.capture) void showWindow('panel');
  if (state.presented && state.annotations.length) void showWindow('annotations',false);
  for(const id of previousBranches)if(state.branches[id])void showBranch(state,id);
  previousBranches=[];
}
export async function runCommand(command: Command, displayId?:number, owner='desktop'): Promise<void> {
  if(process.argv.includes('--smoke-test')&&process.env.OTTODIDACT_TRACE_UI==='1')console.log('Desktop command:',command.type,'phase:',state.phase);
  try {
    switch(command.type) {
      case 'annotationAttention': {
        const next=annotationAttention(state,command.annotationId,command.channel,command.active,owner);
        if(next!==state)publish(next);return;
      }
      case 'quit': tutor.cancel(false); app.quit(); return;
      case 'refreshProvider': await refreshProvider(); return;
      case 'questionHeight': {
        if(state.panelView==='main'||(state.phase!=='question'&&state.phase!=='loading'))return;
        resizeQuestionPanel(state,command.height);return;
      }
      case 'mainHeight': resizeMainPanel(state,command.height);return;
      case 'branchLayout': {
        const branch=state.branches[command.branchId];
        if(branch&&!branch.expanded&&!branch.minimized&&!command.expanded&&!command.minimized&&command.measurements.every(m=>m.height>activeDisplay().workArea.height-12)){
          publish({...state,branches:{...state.branches,[branch.id]:{...branch,expanded:true}}});return;
        }
        resizeBranchPanel(state,command.branchId,command.measurements,command.expanded,command.minimized,command.collapsed);return;
      }
      case 'minimizeBranch': {
        const branch=state.branches[command.branchId];if(!branch)throw new Error('Unknown annotation chat');
        publish({...state,branches:{...state.branches,[branch.id]:{...branch,minimized:command.minimized}}});scheduleBranchReflow(state,branch.id);return;
      }
      case 'minimizeMain': publish({...state,mainMinimized:command.minimized});return;
      case 'settings': await showWindow('settings'); return;
      case 'closeSettings': getWindow('settings')?.hide(); return;
      case 'glowMode':
        if(!process.argv.includes('--smoke-test'))writeGlowMode(preferencesFile(),command.mode);
        glowMode=command.mode; publish(state); return;
      case 'finishLauncherMove': {
        const {x,y}=getWindow('companion')!.getBounds();
        if(!process.argv.includes('--smoke-test'))writeLauncherPosition(preferencesFile(),{x,y});
        return;
      }
      case 'moveLauncher':
        moveLauncher(command.dx,command.dy);
        if(!state.presented){useDisplay(screen.getDisplayMatching(getWindow('companion')!.getBounds()).id);fitDisplayWindows();syncEffects(state);}
        sizeMainPanel(state);
        return;
      case 'tutorMode': publish({...state,mode:command.mode});return;
      case 'questionPanel':
        if(state.phase!=='question'&&state.phase!=='loading')return;
        publish({...state,panelView:undefined,presented:true});await showWindow('panel');return;
      case 'mainChat':
        publish({...state,presented:true,mainMinimized:false,panelView:'main'});
        if(state.annotations.length)await showWindow('annotations',false);
        getWindow('settings')?.hide(); await showWindow('panel'); return;
      case 'capture': {
        if(state.phase==='selecting'||state.effectsSuspended)return;
        tutor.cancel(false);
        const token=++generation;
        previous=state;previousDisplayId=activeDisplay().id;
        previousBranches=visibleBranchIds();
        hideAll();
        const display=useDisplay(displayId??activeDisplay().id);
        fitDisplayWindows();
        publish({...state,phase:'selecting',selectionId:crypto.randomUUID(),selectionSnapshot:undefined,presented:true,effectsSuspended:true,error:undefined,retry:undefined});
        // Show dimming immediately. Windows capture exclusion keeps this protected
        // selection surface (including its glow) out of the underlying snapshot.
        await showWindow('selection');
        await pause(220);
        if(token!==generation)return;
        const exclusionSupported=process.platform==='win32'&&Number(process.getSystemVersion().split('.')[2])>=19041;
        if(!exclusionSupported){getWindow('selection')?.hide();await pause(220);if(token!==generation)return;}
        const snapshot=await captures.run(()=>captureDisplay(display),()=>token===generation);
        if(token!==generation||!snapshot)return;
        publish({...state,selectionSnapshot:snapshot,effectsSuspended:false});
        await showWindow('selection');
        return;
      }
      case 'cancel':
        if (previous) restore();
        else tutor.cancel();
        return;
      case 'dismiss':
        tutor.cancel();
        if (previous) restore();
        generation++;
        hideAll();
        publish({...state,presented:false,effectsSuspended:false,annotationAttention:undefined});
        await showWindow('companion',false);
        return;
      case 'select': {
        // A queued pointer release from an older activation must never select a new snapshot.
        if(command.selectionId!==state.selectionId||state.phase!=='selecting')return;
        const snapshot=state.selectionSnapshot;
        if(state.phase!=='selecting'||!snapshot)throw new Error('Start a new capture first.');
        const {width,height}=snapshot.desktopRect;
        if(command.rect.x+command.rect.width>width||command.rect.y+command.rect.height>height)throw new Error('Selection is outside this display.');
        const capture=selectSnapshot(snapshot,command.rect,activeDisplay().id);
        previous=undefined;previousDisplayId=undefined;previousBranches=[];
        getWindow('selection')?.hide();closeBranchWindows();
        publish({...capturedSession(capture),mode:state.mode??'explain',provider:state.provider,presented:true,effectsSuspended:false});
        await showWindow('panel');await showWindow('companion',false);
        return;
      }
      case 'explain':
      case 'send': {
        if(command.type==='explain'&&state.snapshotStale)throw new Error('Display settings changed. Retake the screen capture to continue.');
        if(command.type==='send'&&command.branchId){
          const branch=state.branches[command.branchId];
          if(!branch)throw new Error('Unknown annotation chat');
          // Expansion is a state update, not a prerequisite native-window wait.
          // The mounted card measures independently while the request starts.
          if(!state.pending){publish({...state,branches:{...state.branches,[branch.id]:{...branch,expanded:true,minimized:false}}});scheduleBranchReflow(state,branch.id);}
        }
        const applied=await tutor.run(command);
        if(applied && command.type==='explain') {
          const layoutStarted=performance.now();
          if(state.annotations.length) {
            const display=activeDisplay(),origin=display.bounds;
            const area={...display.workArea,x:display.workArea.x-origin.x,y:display.workArea.y-origin.y};
            const panel=getWindow('panel')!.getBounds();
            const placements=layoutCards(state.annotations,state.capture!.rect,area,{...panel,x:panel.x-origin.x,y:panel.y-origin.y});
            let next=state;
            for(const marker of state.annotations) {
              next=openBranch(next,marker.id);
              const id=next.activeBranch!,branch=next.branches[id];
              next={...next,branches:{...next.branches,[id]:{...branch,windowBounds:placements[marker.id],expanded:false}}};
            }
            publish({...next,activeBranch:undefined});
            prepareBranchWindows(state);
            await showWindow('annotations',false);
            const sessionId=state.id;
            for(const branch of Object.values(state.branches)) {
              if(state.id!==sessionId||!state.presented||state.phase!=='explained')break;
              await showBranch(state,branch.id,false);
            }
            console.log(JSON.stringify({event:'annotation_layout_timing',sessionId:state.id,cards:state.annotations.length,readyMs:performance.now()-layoutStarted}));
          }
        }
        return;
      }
      case 'retry': {
        const retry=state.retry;
        if(!retry)throw new Error('There is no failed or cancelled request to retry.');
        await runCommand(retry);
        return;
      }
      case 'clear':
        publish({...state,annotations:[],activeBranch:undefined,annotationAttention:undefined}); getWindow('annotations')?.hide();
        for(const id of Object.keys(state.branches))getWindow(`branch:${id}`)?.hide();
        return;
      case 'expandBranch': {
        const branch=state.branches[command.branchId];
        if(!branch)throw new Error('Unknown annotation chat');
        publish({...state,branches:{...state.branches,[branch.id]:{...branch,expanded:command.expanded,minimized:false}}});
        scheduleBranchReflow(state,branch.id);
        await showBranch(state,branch.id);return;
      }
      case 'openBranch': {
        const next=openBranch(state,command.annotationId),id=next.activeBranch!;
        publish({...next,presented:true,branches:{...next.branches,[id]:{...next.branches[id],minimized:false}}});scheduleBranchReflow(state,id);await showBranch(state,id);return;
      }
      case 'resumeBranch':
        if (!Object.hasOwn(state.branches,command.branchId)) throw new Error('Unknown branch');
        publish({...state,activeBranch:command.branchId,presented:true,branches:{...state.branches,[command.branchId]:{...state.branches[command.branchId],minimized:false}}});scheduleBranchReflow(state,command.branchId); await showBranch(state,command.branchId); return;
      case 'closeBranch': {
        const id=command.branchId??state.activeBranch;
        if(id)getWindow(`branch:${id}`)?.hide();
        publish({...state,activeBranch:state.activeBranch===id?undefined:state.activeBranch}); return;
      }
      case 'bring': publish(bringToMain(state,command.branchId,command.messageId)); return;
    }
  } catch(error) {
    if (previous) restore();
    publish({...state,error:error instanceof Error ? error.message:'Something went wrong.'});
    await showWindow('panel');
    throw error;
  }
}
export function registerIpcHandlers() {
  glowMode=process.argv.includes('--smoke-test')?'needed':readGlowMode(preferencesFile());
  publish(state);
  setPanelDismissHandler(()=>void runCommand({type:'dismiss'}).catch(()=>{}));
  setBranchPresentationHandler((id,minimized,expanded)=>{
    const branch=state.branches[id];if(!branch)return;
    publish({...state,branches:{...state.branches,[id]:{...branch,minimized,expanded}}});
  });
  setMainWindowHandler(bounds=>{
    if(JSON.stringify(state.overlayMainBounds)!==JSON.stringify(bounds))publish({...state,overlayMainBounds:bounds});
  });
  setBranchFocusHandler((id,focused)=>{
    const branch=state.branches[id];if(!branch)return;
    const owner='branch:'+id;
    let next=annotationAttention(state,branch.annotationId,'focus',focused,owner);
    if(!focused)next=annotationAttention(next,branch.annotationId,'hover',false,owner);
    if(next!==state)publish(next);
    if(focused)scheduleBranchReflow(state,id);
  });
  setBranchWindowHandler((id,bounds,open)=>{
    const branch=state.branches[id];if(!branch)return;
    if(branch.open===open&&JSON.stringify(branch.windowBounds)===JSON.stringify(bounds))return;
    publish({...state,branches:{...state.branches,[id]:{...branch,windowBounds:bounds,open}}});
    scheduleBranchReflow(state);
  });
  void refreshProvider();
  ipcMain.handle('appearance:geometry',event=>{
    if(!['companion','effects'].includes(roleOf(event.sender.id)??'')||event.senderFrame!==event.sender.mainFrame)throw new Error('Untrusted sender');
    return launcherLightGeometry();
  });
  ipcMain.handle('session:get',event=>{
    if (!ownsWebContents(event.sender.id) || event.senderFrame!==event.sender.mainFrame) throw new Error('Untrusted sender');
    return state;
  });
  ipcMain.handle('session:command',(event,payload:unknown)=>{
    if (!ownsWebContents(event.sender.id) || event.senderFrame!==event.sender.mainFrame) throw new Error('Untrusted sender');
    const command=commandSchema.parse(payload);
    const role=roleOf(event.sender.id);
    const allowed: Record<string,string[]> = {
      companion:['capture','quit','settings','moveLauncher','finishLauncherMove','mainChat'],selection:['select','cancel','quit'],
      effects:[],settings:['glowMode','tutorMode','refreshProvider','closeSettings','quit','mainChat'],
      branch:['send','closeBranch','expandBranch','minimizeBranch','branchLayout','annotationAttention','mainChat','cancel','retry','dismiss'],
      annotations:['openBranch','annotationAttention'],panel:['questionPanel','glowMode','tutorMode','questionHeight','mainHeight','minimizeMain','capture','dismiss','quit','clear','explain','openBranch','resumeBranch','closeBranch','send','bring','cancel','retry','refreshProvider','settings'],
    };
    if (!role || !allowed[role.startsWith('branch:')?'branch':role]?.includes(command.type)) throw new Error('Command not permitted in this window');
    if(role.startsWith('branch:')) {
      const id=role.slice(7);
      if(command.type==='annotationAttention'&&command.annotationId!==state.branches[id]?.annotationId)throw new Error('Annotation belongs to another chat');
      if((command.type==='send'||command.type==='closeBranch'||command.type==='expandBranch'||command.type==='minimizeBranch'||command.type==='branchLayout') && command.branchId!==id)throw new Error('Command belongs to another chat');
      if(command.type==='retry' && (state.retry?.type!=='send'||state.retry.branchId!==id))throw new Error('Retry belongs to another chat');
      if(command.type==='cancel' && state.pending?.conversationId!==id)throw new Error('Request belongs to another chat');
    }
    return runCommand(command,command.type==='capture'?screen.getDisplayMatching(getWindow(role)!.getBounds()).id:undefined,role);
  });
  const timer=setInterval(()=>updateHitTesting(state),25);
  app.on('will-quit',()=>{clearInterval(timer);tutor.cancel(false);});
  const reconfigure=()=>{
    tutor.cancel(false);generation++;
    previous=undefined;previousDisplayId=undefined;previousBranches=[];
    hideAll();useDisplay(activeDisplay().id);fitDisplayWindows();
    // Old lesson text stays available, but its targets cannot follow a changed display geometry.
    const branches=Object.fromEntries(Object.entries(state.branches).map(([id,branch])=>[id,{...branch,open:false,windowBounds:undefined}]));
    publish({...state,phase:state.capture?(state.explanation?'explained':'question'):'idle',selectionSnapshot:undefined,snapshotStale:true,annotations:[],branches,presented:false,effectsSuspended:false,pending:undefined,retry:undefined});
    void showWindow('companion',false);
  };
  screen.on('display-metrics-changed',(_event,display,metrics)=>{
    if(display.id!==activeDisplay().id||!metrics.some(metric=>['bounds','workArea','scaleFactor','rotation'].includes(metric)))return;
    reconfigure();
  });
  screen.on('display-removed',reconfigure);
}
