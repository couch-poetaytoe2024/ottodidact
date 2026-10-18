import { describe, expect, it } from 'vitest';
import { capturedSession, openBranch, sendMessage, bringToMain } from '../shared/session';
import { mockExplanation } from '../shared/mockProvider';
import type { Capture } from '../shared/milestone';
const capture:Capture={id:'capture-1',dataUrl:'data:image/png;base64,demo',rect:{x:100,y:100,width:500,height:300},pixelWidth:750,pixelHeight:450,scaleFactor:1.5};
function fixture(){
  return {...capturedSession(capture),...mockExplanation(capture),question:'Original question',phase:'explained' as const};
}
describe('annotation conversation lifecycle',()=>{
  it('isolates branch messages from main and other branches',()=>{
    const initial=fixture();
    const a=openBranch(initial,initial.annotations[0].id);
    const b=openBranch(a,initial.annotations[1].id);
    const result=sendMessage(b,'Only A',a.activeBranch,'Test answer');
    expect(result.main).toEqual(initial.main);
    expect(result.branches[b.activeBranch!].messages).toEqual([]);
    expect(result.branches[a.activeBranch!].messages.map(m=>m.role)).toEqual(['user','assistant']);
    expect(b.branches[a.activeBranch!].messages).toEqual([]);
  });
  it('reopens the same branch without losing messages or creating duplicates',()=>{
    const initial=fixture();
    const opened=openBranch(initial,initial.annotations[0].id);
    const sent=sendMessage(opened,'Remember this',opened.activeBranch,'Test answer');
    const closed={...sent,activeBranch:undefined};
    const reopened=openBranch(closed,initial.annotations[0].id);
    expect(Object.keys(reopened.branches)).toHaveLength(1);
    expect(reopened.activeBranch).toBe(opened.activeBranch);
    expect(reopened.branches[opened.activeBranch!]).toEqual(sent.branches[opened.activeBranch!]);
  });
  it('keeps a fixed copy of original context and capture reference',()=>{
    const initial=fixture();
    const opened=openBranch(initial,initial.annotations[0].id);
    const changed=openBranch({...opened,question:'Changed',explanation:'Changed'},initial.annotations[0].id);
    const branch=changed.branches[changed.activeBranch!];
    expect(branch.originalQuestion).toBe(initial.question);
    expect(branch.originalExplanation).toBe(initial.explanation);
    expect(branch.captureId).toBe(capture.id);
  });
  it('copies only the explicitly chosen answer to main',()=>{
    const initial=fixture();
    const opened=openBranch(initial,initial.annotations[0].id);
    const sent=sendMessage(opened,'A question',opened.activeBranch,'Test answer');
    const branch=sent.branches[sent.activeBranch!];
    const copied=bringToMain(sent,branch.id,branch.messages[1].id);
    expect(copied.main.messages).toHaveLength(1);
    expect(copied.main.messages[0].content).toContain(branch.messages[1].content);
    expect(copied.branches).toEqual(sent.branches);
    expect(()=>bringToMain(sent,branch.id,branch.messages[0].id)).toThrow();
  });
  it('rejects unknown annotations and branches',()=>{
    expect(()=>openBranch(fixture(),'missing')).toThrow();
    expect(()=>sendMessage(fixture(),'hello','missing','Test answer')).toThrow();
  });
  it('new capture starts a separate session',()=>{
    const initial=fixture(), opened=openBranch(initial,initial.annotations[0].id);
    const next=capturedSession({...capture,id:'next'});
    expect(next.branches).toEqual({});
    expect(next.main.messages).toEqual([]);
    expect(next.id).not.toBe(opened.id);
  });
});
