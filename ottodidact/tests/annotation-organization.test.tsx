import { describe,it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnnotationLayer } from '../src/features/annotations/AnnotationLayer';
import { organizeAnnotations,routeArrow,hasSharpReversal,pathsCross,segmentHitsRect,annotationAttention,emphasizedAnnotation,cardOrganizationPenalty } from '../shared/annotationOrganization';
import { emptySession,openBranch,sendMessage } from '../shared/session';
import { commandSchema } from '../shared/commands';
import { mapAnnotations } from '../shared/annotationMapping';
import { placeMeasuredCard } from '../shared/presentation';
import { modelExplanationSchema,type ImageContext } from '../shared/ai';
import type { Marker,Branch } from '../shared/milestone';
import type { Rect } from '../shared/types';
import { arrowTip } from '../shared/targetGeometry';

const marker=(id:string,kind:Marker['kind']='underline',x=400,y=200):Marker=>({id,captureId:'snapshot',number:Number(id.replace(/\D/g,''))||1,kind,text:'Explanation '+id,concept:'Concept '+id,target:{x,y,width:50,height:18},bounds:{x,y,width:50,height:20}});
const branch=(mark:Marker,rect:Rect):Branch=>({id:'branch-'+mark.id,annotationId:mark.id,captureId:'snapshot',number:mark.number,title:mark.concept,originalQuestion:'Question',originalExplanation:mark.text,messages:[],open:true,windowBounds:rect});
const image:ImageContext={captureId:'snapshot',dataUrl:'data:image/png;base64,AAAA',pixelWidth:1600,pixelHeight:900,originalPixelWidth:2000,originalPixelHeight:1125,displayScale:1.25,desktopRect:{x:0,y:0,width:1280,height:720},selection:{x:.1,y:.1,width:.7,height:.7},cropOffset:{x:0,y:0}};

describe('one primary marking per concept',()=>{
 it('does not add connector arrows to underlines, circles or rectangles',()=>{
  const marks=[marker('1'),marker('2','circle',550),marker('3','rectangle',700)];
  const branches=Object.fromEntries(marks.map((m,i)=>['branch-'+m.id,branch(m,{x:80+i*300,y:440,width:268,height:160})]));
  const plan=organizeAnnotations(marks,branches),html=renderToStaticMarkup(<AnnotationLayer annotations={marks} branches={branches}/>);
  expect(plan.marks.filter(m=>m.visible)).toHaveLength(3);expect(plan.marks.every(m=>!m.route)).toBe(true);
  expect(html).not.toContain('marker-end');expect(html).not.toContain('data-route-for');
 });
 it('suppresses redundant shapes while preserving all source geometry and card identities',()=>{
  const first=marker('1','arrow');first.related=['circle','underline','rectangle'].map((kind,i)=>({...marker('extra-'+i,kind as Marker['kind']),annotationId:first.id,purpose:'Emphasize this same source'}));
  const before=structuredClone(first),plan=organizeAnnotations([first],{});
  expect(plan.marks.filter(m=>m.visible)).toHaveLength(1);expect(plan.marks.filter(m=>!m.primary).every(m=>m.reason==='redundant-secondary')).toBe(true);expect(first).toEqual(before);
 });
 it('requires a teaching purpose and room for exceptional different source markings',()=>{
  const primary=marker('1');primary.related=[{...marker('extra','circle',800,400),annotationId:'1'}];
  expect(organizeAnnotations([primary],{}).marks.filter(m=>m.visible)).toHaveLength(1);
  primary.related[0].purpose='Compare this separate turning point with the labelled interval.';
  expect(organizeAnnotations([primary],{}).marks.filter(m=>m.visible)).toHaveLength(2);
  const neighbor=marker('2','underline',805,425);
  const crowded=organizeAnnotations([primary,neighbor],{});
  expect(crowded.marks.find(m=>m.marker.id==='extra')?.visible).toBe(false);
  expect(crowded.marks.filter(m=>m.primary&&m.visible)).toHaveLength(2);
  const focused=organizeAnnotations([primary,neighbor],{},primary.id);
  expect(focused.marks.map(m=>m.marker.id)).toEqual(['1','2','extra']);
  expect(focused.marks.find(m=>m.marker.id==='extra')?.visible).toBe(false);
 });
 it('validates and preserves several concepts, including nearby ones, through mapping and rendering',()=>{
  const response=modelExplanationSchema.parse({explanation:'A whole lesson',warnings:[],annotations:Array.from({length:5},(_,i)=>({id:'concept-'+i,kind:i%2?'circle':'underline',concept:'Step '+i,explanation:'A distinct explanation.',target:{x:.2+i*.08,y:.3,width:.04,height:.03},relatedTargets:[]}))});
  const marks=mapAnnotations(response.annotations,image,{width:1280,height:720});
  const plan=organizeAnnotations(marks,{}),html=renderToStaticMarkup(<AnnotationLayer annotations={marks} branches={{}}/>);
  expect(marks).toHaveLength(5);expect(plan.marks.filter(m=>m.visible)).toHaveLength(5);expect((html.match(/data-visible="true"/g)??[])).toHaveLength(5);
 });
});
describe('overlay-wide routing and detail on demand',()=>{
 it('allows useful bends but rejects near-180 degree reversals, even when rounded',()=>{
  expect(hasSharpReversal([{x:0,y:0},{x:40,y:0},{x:40,y:40}])).toBe(false);
  expect(hasSharpReversal([{x:0,y:0},{x:40,y:0},{x:2,y:4}])).toBe(true);
  const hairpin=[{x:0,y:0},{x:40,y:0},...Array.from({length:25},(_,i)=>{const t=i/24*Math.PI;return {x:40+2*Math.sin(t),y:2-2*Math.cos(t)};}),{x:0,y:4}];
  expect(hasSharpReversal(hairpin)).toBe(true);
  const gentle=Array.from({length:25},(_,i)=>{const t=i/24*Math.PI/2;return {x:80*Math.sin(t),y:80-80*Math.cos(t)};});
  expect(hasSharpReversal(gentle)).toBe(false);
 });
 it.each([{x:100,y:300,side:'left'},{x:900,y:300,side:'right'},{x:500,y:80,side:'top'},{x:500,y:650,side:'bottom'}])('uses a direct $side attachment without forced elbows',({x,y,side})=>{
  const card={x:400,y:250,width:240,height:180},mark=marker('1','arrow',x,y),from={x:520,y:340};
  mark.from=from;mark.to=arrowTip(mark.target!,from);
  const route=routeArrow(mark,card,[])!;expect(route.shape).toBe('straight');expect(route.points).toHaveLength(2);expect(route.path).not.toContain('Q');expect(route.points.at(-1)).toEqual(mark.to);
  const start=route.points[0];if(side==='left')expect(start.x).toBeLessThan(card.x);if(side==='right')expect(start.x).toBeGreaterThan(card.x+card.width);if(side==='top')expect(start.y).toBeLessThan(card.y);if(side==='bottom')expect(start.y).toBeGreaterThan(card.y+card.height);
 });
 it('removes the forced approach elbow when a saved tip can be reached directly',()=>{
  const mark={...marker('1','arrow',700,300),from:{x:650,y:270},to:{x:697,y:299}},card={x:300,y:200,width:240,height:180};
  const route=routeArrow(mark,card,[])!;expect(route.shape).toBe('straight');expect(route.points.length).toBe(2);
  console.log('OFFLINE ROUTE COMPARISON: clear connector uses 2 endpoints; former mandatory approach used at least 3.');
 });
 it('checks sampled curves and rounded bends against source bounds and panels',()=>{
  const mark={...marker('1','arrow',200,300),from:{x:160,y:270},to:{x:197,y:299}},obstacle={x:330,y:200,width:180,height:180};
  const route=routeArrow(mark,{x:650,y:250,width:268,height:180},[obstacle])!;
  expect(route.points.at(-1)).toEqual(mark.to);
  expect(hasSharpReversal(route.points)).toBe(false);
  expect(route.points.slice(1).some((p,i)=>segmentHitsRect(route.points[i],p,obstacle))).toBe(false);
  if(route.shape==='curve')expect(route.path).toContain(' C ');
  if(route.shape==='rounded')expect(route.path).toContain(' Q ');
 });
 it('reroutes around occupied panels and leaves the tip fixed during card movement',()=>{
  const mark={...marker('1','arrow',200,300),from:{x:160,y:270},to:{x:197,y:299}},obstacle={x:330,y:200,width:180,height:180};
  const before=structuredClone(mark);
  for(const card of [{x:650,y:250,width:268,height:180},{x:650,y:480,width:320,height:210}]){
   const route=routeArrow(mark,card,[obstacle])!;expect(route).toBeDefined();expect(route.points.at(-1)).toEqual(mark.to);
   expect(route.points.slice(1).some((p,i)=>segmentHitsRect(route.points[i],p,obstacle))).toBe(false);
  }
  expect(mark).toEqual(before);
 });
 it('avoids crossing accepted connectors and uses a short arrow when a long route is blocked',()=>{
  const mark={...marker('1','arrow',220,400),from:{x:180,y:370},to:{x:217,y:399}};
  const existing=[{x:500,y:0},{x:500,y:700}];
  const route=routeArrow(mark,{x:650,y:300,width:268,height:180},[],[existing])!;
  expect(route.connected).toBe(false);expect(pathsCross(route.points,existing)).toBe(false);expect(route.points.at(-1)).toEqual(mark.to);
 });
 it('reveals an overlapping concept on focus without moving or deleting any target',()=>{
  const marks=[marker('1'),marker('2','underline',410,202),marker('3','circle',650,330)],before=structuredClone(marks);
  const normal=organizeAnnotations(marks,{}),focused=organizeAnnotations(marks,{},'2');
  expect(normal.crowded).toBe(true);expect(normal.marks.find(m=>m.marker.id==='1')?.visible).toBe(true);expect(normal.marks.find(m=>m.marker.id==='2')?.visible).toBe(false);
  expect(focused.marks.find(m=>m.marker.id==='2')).toMatchObject({visible:true,opacity:1});expect(focused.marks.find(m=>m.marker.id==='1')?.visible).toBe(false);
  expect(focused.marks.find(m=>m.marker.id==='3')?.opacity).toBe(.24);expect(marks).toEqual(before);
  expect(organizeAnnotations(marks,{})).toEqual(normal);
 });
 it('focus/hover releases from old windows cannot clear newer emphasis or edit messages',()=>{
  let state={...emptySession('lesson'),capture:{id:'snapshot',dataUrl:'data:image/png;base64,AAAA',rect:{x:0,y:0,width:1000,height:700},pixelWidth:1000,pixelHeight:700,scaleFactor:1},annotations:[marker('1'),marker('2')]};
  state=openBranch(state,'1') as typeof state;const id=state.activeBranch!;
  state=sendMessage(state,'Keep my question',id,'Keep my answer') as typeof state;
  const main=structuredClone(state.main),branches=structuredClone(state.branches);
  state=annotationAttention(state,'1','focus',true,'branch:1') as typeof state;
  state=annotationAttention(state,'2','hover',true,'annotations') as typeof state;expect(emphasizedAnnotation(state)).toBe('2');
  state=annotationAttention(state,'1','hover',false,'branch:1') as typeof state;expect(emphasizedAnnotation(state)).toBe('2');
  state=annotationAttention(state,'2','hover',false,'annotations') as typeof state;expect(emphasizedAnnotation(state)).toBe('1');
  state=annotationAttention(state,'1','focus',false,'branch:1') as typeof state;expect(emphasizedAnnotation(state)).toBeUndefined();
  expect(state.main).toEqual(main);expect(state.branches).toEqual(branches);expect(openBranch(state,'1').branches[id].messages).toHaveLength(2);
 });
 it('retains valid measured dimensions and discourages reversed reading order',()=>{
  const first=marker('1','underline',400,200),second=marker('2','underline',400,330),rect={x:700,y:100,width:320,height:190};
  const peers=[{marker:second,rect:{x:700,y:310,width:320,height:170}}];
  expect(cardOrganizationPenalty(first,rect,peers)).toBe(0);
  expect(cardOrganizationPenalty(first,{...rect,y:500},peers)).toBeGreaterThan(0);
  expect(placeMeasuredCard(first,{x:350,y:170,width:250,height:330},{x:0,y:0,width:1536,height:816},{x:1150,y:390,width:340,height:400},[peers[0].rect],[{width:320,height:200}],rect,peers)).toEqual({...rect,height:200});
 });
 it('validates only bounded transient attention messages',()=>{
  expect(commandSchema.safeParse({type:'annotationAttention',annotationId:'one',channel:'focus',active:true}).success).toBe(true);
  for(const patch of [{annotationId:''},{channel:'any'},{active:'yes'},{unexpected:true}])expect(commandSchema.safeParse({type:'annotationAttention',annotationId:'one',channel:'hover',active:true,...patch}).success).toBe(false);
 });
});
