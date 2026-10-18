import {expect,it} from 'vitest';
import {layoutMeasuredPanels,type MeasuredPanel} from '../shared/panelLayout';
import {overlap,placeMainPanel} from '../shared/presentation';
const area={x:0,y:0,width:1536,height:816},focus={x:420,y:240,width:460,height:300};
const main=placeMainPanel(area,{x:1444,y:724,width:76,height:76},580,focus);
const entries:MeasuredPanel[]=Array.from({length:4},(_,i)=>({id:'card'+i,marker:{id:'mark'+i,number:i+1,captureId:'snapshot',kind:'arrow',text:'Explanation',bounds:{x:460+i*60,y:330,width:15,height:20},target:{x:460+i*60,y:330,width:15,height:20}},bounds:{x:10,y:10+i*180,width:268,height:170},measurements:[{width:268,height:170},{width:320,height:150}],collapsed:{width:240,height:58},expanded:false,minimized:false}));
const assertClear=(plan:ReturnType<typeof layoutMeasuredPanels>,bounds=area,reserved=main)=>{
 const cards=Object.values(plan).map(p=>p.bounds);
 for(const [i,r] of cards.entries()){
  expect(r.x).toBeGreaterThanOrEqual(bounds.x);expect(r.y).toBeGreaterThanOrEqual(bounds.y);
  expect(r.x+r.width).toBeLessThanOrEqual(bounds.x+bounds.width);expect(r.y+r.height).toBeLessThanOrEqual(bounds.y+bounds.height);
  expect(overlap(r,reserved)).toBe(0);for(const other of cards.slice(i+1))expect(overlap(r,other)).toBe(0);
 }
};
it('reserves a side for main and reflows measured growing panels without touching targets',()=>{
 expect(main.x>=focus.x+focus.width+10||main.x+main.width<=focus.x-10).toBe(true);
 const before=structuredClone(entries),first=layoutMeasuredPanels(entries,focus,area,main);assertClear(first);
 const grown=entries.map((e,i)=>({...e,bounds:first[e.id].bounds,measurements:i===1?[{width:320,height:680},{width:380,height:560}]:e.measurements}));
 const next=layoutMeasuredPanels(grown,focus,area,main,'card1');assertClear(next);expect(entries).toEqual(before);
 for(const card of Object.values(next))expect(overlap(card.bounds,focus)).toBe(0);
 const again=layoutMeasuredPanels(grown.map(e=>({...e,...next[e.id]})),focus,area,main,'card1');expect(again).toEqual(next);
});
it('uses compact measured headers/scrolling in crowded layouts and restores the same cards',()=>{
 const tight={x:-1000,y:100,width:1000,height:700},reserved={x:-340,y:110,width:320,height:560},selection={...tight};
 let current=entries.map(e=>({...e,bounds:{...e.bounds,x:e.bounds.x-1000,y:e.bounds.y+100},measurements:[{width:320,height:1200}]}));
 const full=layoutMeasuredPanels(current,selection,tight,reserved,'card0');assertClear(full,tight,reserved);
 expect(Object.values(full).some(p=>p.minimized||p.expanded)).toBe(true);
 for(let i=0;i<3;i++){
  current=current.map(e=>({...e,...full[e.id],minimized:e.id==='card0',measurements:e.measurements}));
  const collapsed=layoutMeasuredPanels(current,selection,tight,reserved,'card0');assertClear(collapsed,tight,reserved);
  expect(collapsed.card0.bounds.height).toBe(58);
  const restored=layoutMeasuredPanels(current.map(e=>({...e,bounds:collapsed[e.id].bounds,minimized:false})),selection,tight,reserved,'card0');assertClear(restored,tight,reserved);
  expect(Object.keys(restored)).toEqual(Object.keys(full));
 }
});
