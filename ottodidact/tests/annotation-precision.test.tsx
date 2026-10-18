import { describe,it,expect,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnnotationLayer } from '../src/features/annotations/AnnotationLayer';
import { modelExplanationSchema,type ImageContext,type ModelAnnotation,type TargetSource,type TutorResponse } from '../shared/ai';
import { mapAnnotations,annotationMarkings } from '../shared/annotationMapping';
import { arrowTip,focusDetailPlan } from '../shared/targetGeometry';
import { annotationLeader } from '../shared/presentation';
import { capturedSession,openBranch } from '../shared/session';
import { TutorCoordinator,buildTutorRequest } from '../desktop/tutor';
import type { Session } from '../shared/milestone';
import { createProvider } from '../server/ai/client';
import { readConfig } from '../server/config';
import { mockTutor } from '../server/ai/mock';

const png='data:image/png;base64,AAAA';
const image:ImageContext={captureId:'capture-precision',dataUrl:png,pixelWidth:2000,pixelHeight:1000,originalPixelWidth:3000,originalPixelHeight:1500,cropOffset:{x:0,y:0},displayScale:1.5,desktopRect:{x:0,y:0,width:1600,height:800},selection:{x:.2,y:.2,width:.6,height:.6},detail:{captureId:'capture-precision',dataUrl:png,pixelWidth:600,pixelHeight:400,region:{x:.25,y:.25,width:.3,height:.4}}};
const source=(feature:string,text:string|null,imageId:'full'|'detail'='full'):TargetSource=>({captureId:image.captureId,image:imageId,feature,expectedText:text,observedText:text,certainty:'located'});
const annotations:ModelAnnotation[]=[
 {id:'minus',kind:'arrow',concept:'Subtraction sign',explanation:'This minus sign subtracts the next term.',target:{x:.3,y:.3,width:.007,height:.003},source:source('Minus before 5x','\u2212')},
 {id:'exponent',kind:'arrow',concept:'Exponent',explanation:'Square the base, not the coefficient.',target:{x:.4,y:.28,width:.004,height:.009},source:source('Superscript 2 on x','2')},
 {id:'word',kind:'underline',concept:'Discriminant',explanation:'Read the actual word span.',target:{x:.3,y:.4,width:.065,height:.018},source:source('Word discriminant','discriminant')},
 {id:'group',kind:'rectangle',concept:'One grouped factor',explanation:'The parentheses group this factor.',target:{x:.4,y:.5,width:.045,height:.022},source:source('First factor (x \u2212 2)','(x \u2212 2)')},
 {id:'vertex',kind:'arrow',concept:'Vertex',explanation:'The turning point of this graph.',target:{x:.3,y:.4,width:.01,height:.01},source:source('Actual vertex dot',null,'detail'),relatedTargets:[{kind:'circle',target:{x:.3,y:.4,width:.01,height:.01},source:source('Same vertex dot',null,'detail')}]},
];
const display={width:1600,height:800};
const session=()=>capturedSession({id:image.captureId,dataUrl:png,rect:{x:320,y:160,width:960,height:480},pixelWidth:2000,pixelHeight:1000,scaleFactor:1.5,image});
const explanation={explanation:'Several distinct concepts.',annotations,warnings:[]};

describe('precise features and grouped markings',()=>{
 it('keeps every distinct concept through validation, state, cards and rendering',async()=>{
  let state:Session=session();const result=modelExplanationSchema.parse(explanation);
  const tutor=new TutorCoordinator(()=>state,s=>state=s,()=>display,async request=>({requestId:request.requestId,sessionId:request.sessionId,captureId:request.captureId,conversationId:request.conversationId,provider:'openai',model:'offline',result}));
  await tutor.run({type:'explain',question:'Explain the signs and the vertex'});
  expect(state.annotations).toHaveLength(5);expect(annotationMarkings(state.annotations)).toHaveLength(6);
  for(const marker of state.annotations)state=openBranch(state,marker.id);
  expect(Object.keys(state.branches)).toHaveLength(5);
  const markup=renderToStaticMarkup(<AnnotationLayer annotations={state.annotations} branches={state.branches}/>);
  expect((markup.match(/data-marking-id=/g)??[])).toHaveLength(6);
  expect(markup).toContain('marker-rectangle');expect(markup).toContain('marker-underline');
  const vertex=state.annotations[4];expect(vertex.related![0].annotationId).toBe(vertex.id);
  const reopened=openBranch(state,vertex.related![0].annotationId!);expect(Object.keys(reopened.branches)).toHaveLength(5);
  expect(reopened.activeBranch).toBe(Object.values(state.branches).find(b=>b.annotationId===vertex.id)!.id);
  const followup=buildTutorRequest(reopened,{type:'send',branchId:reopened.activeBranch!,text:'How does this turn?'},'followup');
  expect(followup.image.detail).toBeUndefined();expect(followup.annotation?.source?.image).toBe('full');
  expect(followup.annotation?.target?.x).toBeCloseTo(.34);
 });
 it.each([1,1.25,1.5,1.75,2])('maps exact glyph and close-up bounds without double scaling at %s',scale=>{
  const mapped=mapAnnotations(annotations,{...image,displayScale:scale,desktopRect:{x:80.8,y:61.6,width:1440,height:700}},display);
  expect(mapped[0].target!.width).toBeCloseTo(.007*1440);
  expect(mapped[1].target!.height).toBeCloseTo(.009*700);
  expect(mapped[2].bounds.width).toBeCloseTo(.065*1440);
  expect(mapped[3].bounds.width-mapped[3].target!.width).toBeCloseTo(4);
  expect(mapped[3].bounds.x+mapped[3].bounds.width/2).toBeCloseTo(mapped[3].target!.x+mapped[3].target!.width/2);
  expect(mapped[4].target!.x).toBeCloseTo(80.8+.34*1440);
  expect(mapped[4].location!.pixelBounds.x).toBeCloseTo(680);
  expect(mapped[4].location!.captureId).toBe(image.captureId);
 });
 it('keeps arrowheads just outside small symbols when cards move and resize',()=>{
  const marker=mapAnnotations([annotations[0]],image,display)[0],target=marker.target!;
  const inside=(p:{x:number;y:number})=>p.x>target.x&&p.x<target.x+target.width&&p.y>target.y&&p.y<target.y+target.height;
  expect(inside(marker.to!)).toBe(false);
  for(const card of [{x:10,y:100,width:268,height:150},{x:1000,y:600,width:440,height:500}]){
   const {from,to}=annotationLeader(marker,card);expect(to).toEqual(arrowTip(target,from));expect(inside(to)).toBe(false);
  }
  expect(marker.target).toEqual(target);
 });
 it('retains text and separate concepts when source identity or recognition is uncertain',()=>{
  for(const patch of [{captureId:'other'},{certainty:'uncertain' as const},{observedText:'+'},{image:'detail' as const}]){
   const marker=mapAnnotations([{...annotations[0],source:{...annotations[0].source!,...patch}}],{...image,detail:undefined},display)[0];
   expect(marker.pointerless).toBe(true);expect(marker.target).toBeUndefined();expect(marker.text).toContain('minus sign');
  }
  const legacy={...annotations[0],source:undefined};expect(mapAnnotations([legacy],image,display,{requireSource:true})[0].pointerless).toBe(true);
 });
 it('does not merge separate concepts that point to the same symbol',()=>{
  const mapped=mapAnnotations([annotations[0],{...annotations[0],id:'different',concept:'Common sign error'}],image,display);
  expect(mapped).toHaveLength(2);expect(mapped[0].id).not.toBe(mapped[1].id);
 });
 it('prepares one pixel-aligned crop and skips redundant full-screen details',()=>{
  const plan=focusDetailPlan(image)!;expect(plan.pixels).toEqual({x:396,y:196,width:1208,height:608});
  expect(plan.region.x*image.pixelWidth).toBe(plan.pixels.x);
  expect(focusDetailPlan({...image,selection:{x:0,y:0,width:1,height:1}})).toBeUndefined();
  expect(focusDetailPlan({...image,pixelWidth:800,pixelHeight:400})).toBeUndefined();
 });
 it('sends full context and one labelled detail in one request; followups omit detail',async()=>{
  const initial=session(),request=buildTutorRequest(initial,{type:'explain',question:'Explain the exponent'},'req');
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(explanation)}]}]})));
  const provider=createProvider(readConfig({AI_PROVIDER:'openai',OPENAI_API_KEY:'test-only'}),fetcher);
  await provider(request,new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body=JSON.parse(fetcher.mock.calls[0][1].body),content=body.input[0].content;
  expect(content.filter((c:{type:string})=>c.type==='input_image')).toHaveLength(2);
  expect(content[0].text).toContain('fullImageRegion');
  expect(body.text.format.schema.properties.annotations.items.required).toContain('relatedTargets');
  expect(mockTutor({...request,mode:'hint'}).annotations.length).toBeGreaterThan(1);
 });
 it('discards cancelled close-up preparation before any backend request',async()=>{
  let state:Session=session(),finish!:(image:ImageContext)=>void;
  state={...state,inputImage:{...image,detail:undefined}};
  const prepare=()=>new Promise<ImageContext>(resolve=>finish=resolve),send=vi.fn<()=>Promise<TutorResponse>>();
  const tutor=new TutorCoordinator(()=>state,s=>state=s,()=>display,send,prepare);
  const running=tutor.run({type:'explain',question:'Read this'});tutor.cancel();finish(image);
  expect(await running).toBe(false);expect(send).not.toHaveBeenCalled();expect(state.annotations).toHaveLength(0);
 });
});
