import { describe,it,expect } from 'vitest';
import { layoutCards,clampPanel,overlap,annotationColor,placeQuestionPanel,placeMainPanel,annotationLeader } from '../shared/presentation';
import type { Marker } from '../shared/milestone';
const annotations:Marker[]=Array.from({length:5},(_,i)=>({id:'annotation-'+i,captureId:'capture',number:i+1,kind:'circle',bounds:{x:500+i*60,y:350,width:40,height:30},target:{x:500+i*60,y:350,width:40,height:30},text:'Detail'}));
describe('annotation card placement',()=>{
  it('forms a readable rail alongside a two-concept lesson',()=>{
    const focus={x:100,y:280,width:536,height:250},area={x:0,y:0,width:1536,height:816},main={x:1180,y:384,width:340,height:340};
    const markers=annotations.slice(0,2).map((a,i)=>({...a,target:{x:300,y:320+i*80,width:100,height:25}}));
    const [first,second]=Object.values(layoutCards(markers,focus,area,main));
    expect(first.x).toBe(focus.x+focus.width+16);expect(second.x).toBe(first.x);
    expect(overlap(first,second)).toBe(0);expect(overlap(first,focus)+overlap(second,focus)).toBe(0);
  });
  it('keeps cards, main chat and selected content separate when there is room',()=>{
    const selection={x:480,y:300,width:500,height:330},area={x:0,y:0,width:1920,height:1080},main={x:1560,y:20,width:340,height:730};
    const before=structuredClone(annotations),cards=Object.values(layoutCards(annotations,selection,area,main));
    for(const [index,card] of cards.entries()) {
      expect(overlap(card,selection)).toBe(0);expect(overlap(card,main)).toBe(0);
      for(const other of cards.slice(index+1))expect(overlap(card,other)).toBe(0);
    }
    expect(annotations).toEqual(before);
  });
  it.each([{width:640,height:480},{width:1280,height:720},{width:1536,height:864}])('keeps every card inside a constrained work area $width x $height',size=>{
    const area={x:0,y:0,...size},main={x:size.width-300,y:0,width:300,height:size.height};
    for(const card of Object.values(layoutCards(annotations,area,area,main))){
      expect(card.x).toBeGreaterThanOrEqual(0);expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x+card.width).toBeLessThanOrEqual(size.width);expect(card.y+card.height).toBeLessThanOrEqual(size.height);
    }
  });
  it('clamps expansion and gives numbers stable distinct colors',()=>{
    expect(clampPanel({x:900,y:700,width:280,height:440},{x:0,y:0,width:1024,height:768})).toEqual({x:744,y:328,width:280,height:440});
    expect(new Set(annotations.map(a=>annotationColor(a.number))).size).toBe(5);
    expect(annotationColor(1)).toBe(annotationColor(1));
  });
});

describe('content-connected annotation leaders',()=>{
  const marker:Marker={id:'circle',captureId:'snapshot',kind:'circle',bounds:{x:200,y:200,width:120,height:40},target:{x:200,y:200,width:120,height:40},text:'A factor'};
  it('stops at the circle rim instead of crossing its text',()=>{
    const {from,to}=annotationLeader(marker,{x:500,y:150,width:268,height:200});
    expect(from).toEqual({x:500,y:220});expect(to).toEqual({x:320,y:220});
  });
  it('reconnects when a card moves while keeping the target on the same ellipse',()=>{
    for(const card of [{x:30,y:10,width:100,height:80},{x:500,y:500,width:268,height:184}]){
      const {to}=annotationLeader(marker,card);
      expect(((to.x-260)/60)**2+((to.y-220)/20)**2).toBeCloseTo(1);
    }
  });
  it('keeps arrow tips outside the feature instead of covering its center',()=>{
    const arrow={...marker,kind:'arrow' as const,to:{x:233,y:217}};
    const tip=annotationLeader(arrow,{x:500,y:20,width:268,height:184}).to;
    expect(tip.y).toBeLessThan(arrow.target!.y);
    expect(arrow.target).toEqual(marker.target);
  });
});

describe('question panel stays beside the focus',()=>{
  it('sits directly below the selection instead of at the far edge',()=>{
    const focus={x:100,y:100,width:420,height:260};
    const panel=placeQuestionPanel(focus,{x:0,y:0,width:1536,height:816});
    expect(panel).toEqual({x:110,y:374,width:400,height:150});
    expect(overlap(panel,focus)).toBe(0);
  });
  it('moves above a bottom-edge focus and allows space for an error',()=>{
    const focus={x:700,y:600,width:420,height:190};
    const panel=placeQuestionPanel(focus,{x:0,y:0,width:1536,height:816},{width:400,height:230});
    expect(panel.y+panel.height).toBeLessThan(focus.y);
    expect(overlap(panel,focus)).toBe(0);
  });
  it('keeps expanded question settings outside a bottom-edge focus and inside usable bounds',()=>{
    const area={x:-1536,y:120,width:1536,height:816},focus={x:-500,y:760,width:420,height:150};
    const panel=placeQuestionPanel(focus,area,{width:400,height:420});
    expect(overlap(panel,focus)).toBe(0);
    expect(panel.y).toBeGreaterThanOrEqual(area.y);
    expect(panel.y+panel.height).toBeLessThanOrEqual(area.y+area.height);
    expect(panel.x).toBeGreaterThanOrEqual(area.x);
    expect(panel.x+panel.width).toBeLessThanOrEqual(0);
  });
  it.each([{x:-1600,y:-120,width:1600,height:850},{x:1920,y:200,width:800,height:600}])('stays inside a monitor with origin $x,$y',area=>{
    const focus={x:area.x+area.width-160,y:area.y+area.height-180,width:150,height:150};
    const panel=placeQuestionPanel(focus,area);
    expect(panel.x).toBeGreaterThanOrEqual(area.x);expect(panel.y).toBeGreaterThanOrEqual(area.y);
    expect(panel.x+panel.width).toBeLessThanOrEqual(area.x+area.width);expect(panel.y+panel.height).toBeLessThanOrEqual(area.y+area.height);
    expect(overlap(panel,focus)).toBe(0);
  });
});

describe('main chat anchors and focus avoidance',()=>{
  const area={x:0,y:0,width:1536,height:816},otto={x:1408,y:668,width:112,height:132};
  it('grows upward with a fixed bottom gap without moving Otto',()=>{
    const before={...otto},short=placeMainPanel(area,otto,340),long=placeMainPanel(area,otto,680,undefined,short);
    expect(short.y+short.height).toBe(otto.y-10);
    expect(long.y+long.height).toBe(short.y+short.height);
    expect(long.y).toBeLessThan(short.y);expect(long.x).toBe(short.x);expect(otto).toEqual(before);
  });
  it('moves off a corner focus and keeps the new anchor on later growth',()=>{
    const focus={x:1130,y:250,width:390,height:400};
    const first=placeMainPanel(area,otto,340,focus),grown=placeMainPanel(area,otto,500,focus,first);
    expect(overlap(first,focus)).toBe(0);expect(overlap(grown,focus)).toBe(0);
    expect(grown.x).toBe(first.x);expect(grown.y+grown.height).toBe(first.y+first.height);
    expect(placeMainPanel(area,otto,500,focus,grown)).toEqual(grown);
  });
  it('rechecks the focus when growth would cover it',()=>{
    const focus={x:1150,y:180,width:378,height:110};
    const first=placeMainPanel(area,otto,340,focus),grown=placeMainPanel(area,otto,680,focus,first);
    expect(overlap(first,focus)).toBe(0);expect(overlap(grown,focus)).toBe(0);
  });
  it('uses readable smaller space when a full-sized chat will not fit',()=>{
    const focus={x:0,y:0,width:1218,height:816};
    const panel=placeMainPanel(area,otto,680,focus);
    expect(overlap(panel,focus)).toBe(0);expect(panel.width).toBe(300);
  });
  it('does not jump when a branch opens and offers compact minimize/restore',()=>{
    const before=placeMainPanel(area,otto,500);
    expect(placeMainPanel(area,otto,500,undefined,before,[before])).toEqual(before);
    const small=placeMainPanel(area,otto,500,undefined,before,[],true);
    expect(small.height).toBe(56);expect(small.y+small.height).toBe(before.y+before.height);
    expect(placeMainPanel(area,otto,500,undefined,small)).toEqual(before);
  });
  it.each([1,1.25,1.5,1.75,2])('stays on a negative-origin display at %sx',scale=>{
    const work={x:-1920/scale,y:-120,width:1920/scale,height:1040/scale};
    const launcher={x:work.x+16,y:work.y+work.height-148,width:112,height:132};
    const panel=placeMainPanel(work,launcher,680);
    expect(panel).toEqual(clampPanel(panel,work));
    expect(panel.x).toBeLessThan(work.x+200);expect(overlap(panel,launcher)).toBe(0);
  });
  it('handles a top corner and a focus occupying the entire display',()=>{
    const launcher={...otto,x:8,y:8},panel=placeMainPanel(area,launcher,680,area);
    expect(panel).toEqual(clampPanel(panel,area));expect(panel.height).toBeGreaterThanOrEqual(300);
    const minimized=placeMainPanel(area,launcher,680,area,panel,[],true);
    expect(minimized.height).toBe(56);
  });
  it('uses a stable readable compact panel when a nearly full-screen focus leaves no free space',()=>{
    const focus={x:12,y:12,width:area.width-24,height:area.height-24};
    const launcher={x:1461,y:741,width:62,height:62},before={...launcher};
    const panel=placeMainPanel(area,launcher,680,focus);
    expect(panel.width).toBe(300);expect(panel.height).toBe(300);
    expect(panel).toEqual(clampPanel(panel,area));expect(overlap(panel,launcher)).toBe(0);
    expect(placeMainPanel(area,launcher,680,focus,panel)).toEqual(panel);
    expect(launcher).toEqual(before);
    const minimized=placeMainPanel(area,launcher,680,focus,panel,[],true);
    expect(minimized.height).toBe(56);
    expect(placeMainPanel(area,launcher,680,focus,minimized)).toEqual(panel);
  });
  it('grows below a top-corner launcher without covering the button',()=>{
    const launcher={x:16,y:12,width:62,height:62},short=placeMainPanel(area,launcher,340);
    const long=placeMainPanel(area,launcher,680,undefined,short);
    expect(overlap(long,launcher)).toBe(0);expect(long).toEqual(clampPanel(long,area));expect(long.height).toBeGreaterThan(short.height);
  });
});
