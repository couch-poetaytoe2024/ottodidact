import {afterEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MAX_TASK_REFS,MAX_TASK_REF_LENGTH,modelAnnotationSchema,type ImageContext,type ModelAnnotation} from '../shared/ai';
import {mapAnnotations} from '../shared/annotationMapping';
import {capturedSession,openBranch,sendMessage} from '../shared/session';
import {buildTutorRequest} from '../desktop/tutor';
import {prepareTutorContext} from '../server/ai/context';
import {ANNOTATION_INSTRUCTIONS,CORE_INSTRUCTIONS,TUTOR_JSON_SCHEMA} from '../server/ai/prompts';
import {BranchChat} from '../src/features/chat/BranchChat';
import {useSessionStore} from '../src/state/sessionStore';
import type {Session} from '../shared/milestone';

vi.mock('../src/state/sessionStore',()=>({useSessionStore:vi.fn(),command:vi.fn(),dispatch:vi.fn()}));
vi.mock('../src/features/chat/useBranchLayout',()=>({useBranchLayout:()=>undefined}));
vi.mock('../src/features/chat/ChatPanel',()=>({ChatPanel:({introduction}:{introduction:React.ReactNode})=><section>{introduction}</section>}));
afterEach(()=>vi.clearAllMocks());

const image:ImageContext={captureId:'worksheet',dataUrl:'data:image/png;base64,AAAA',pixelWidth:600,pixelHeight:400,originalPixelWidth:600,originalPixelHeight:400,cropOffset:{x:0,y:0},displayScale:1,desktopRect:{x:0,y:0,width:600,height:400},selection:{x:0,y:0,width:1,height:1}};
const model=(id:string,taskRefs?:ModelAnnotation['taskRefs']):ModelAnnotation=>({id,kind:'underline',concept:'Supporting concept '+id,explanation:'Connect this concept to what the referenced task asks.',target:{x:.1,y:.2,width:.1,height:.05},taskRefs});
// Labels only: this fixture does not solve or reproduce a worksheet exercise.
function lesson() {
  const originals=[model('specific',['Problem 3 · Task 2']),model('other',['Problem 3 · Task 1']),model('shared',['Problem 3 · Task 1','Problem 3 · Task 2']),model('different-problem',['Problem 4 · Task 2'])];
  const annotations=mapAnnotations(originals,image,{width:600,height:400});
  let state:Session={...capturedSession({id:image.captureId,dataUrl:image.dataUrl,rect:image.desktopRect,pixelWidth:600,pixelHeight:400,scaleFactor:1,image}),question:'Explain the selected tasks.',explanation:'A main explanation organized by requested task.',phase:'explained',annotations,lessonAnnotations:annotations};
  for(const mark of annotations){
    state=openBranch(state,mark.id);
    state=sendMessage(state,'A saved question',state.activeBranch,'Saved discussion for box '+mark.number);
  }
  return {state,originals};
}

describe('source task labels without renumbering concepts',()=>{
  it('accepts absent/null labels for old or unlabeled sources and bounds new metadata',()=>{
    expect(modelAnnotationSchema.parse(model('old')).taskRefs).toBeUndefined();
    expect(modelAnnotationSchema.parse(model('unlabeled',null)).taskRefs).toBeNull();
    expect(modelAnnotationSchema.parse(model('trim',[' Task 2 '])).taskRefs).toEqual(['Task 2']);
    for(const taskRefs of [[],[' '],['Task\n2'],['x'.repeat(MAX_TASK_REF_LENGTH+1)],['Task 2','task 2'],Array.from({length:MAX_TASK_REFS+1},(_,i)=>'Task '+i)]){
      expect(modelAnnotationSchema.safeParse(model('bad',taskRefs)).success).toBe(false);
    }
    expect(TUTOR_JSON_SCHEMA.properties.annotations.items.required).toContain('taskRefs');
    expect(TUTOR_JSON_SCHEMA.properties.annotations.items.properties.taskRefs.anyOf[1]).toMatchObject({type:'array',maxItems:MAX_TASK_REFS,items:{maxLength:MAX_TASK_REF_LENGTH}});
    expect(ANNOTATION_INSTRUCTIONS).toContain('taskRefs:null instead of inventing a question number');
    expect(ANNOTATION_INSTRUCTIONS).toContain('do not duplicate the same concept once per task');
    expect(CORE_INSTRUCTIONS).toContain('latest followup remains the priority');
  });

  it('retains one shared concept, stable numbers, source targets, history and labels through reopen',()=>{
    const {state,originals}=lesson(),before=structuredClone(state);
    const mark=state.annotations[2],id=`${state.id}:branch:${mark.id}`;
    const saved={...state.branches[id],windowBounds:{x:200,y:100,width:320,height:210},expanded:true,open:false};
    const reopened=openBranch({...state,annotations:[],question:'A later draft',branches:{...state.branches,[id]:saved}},mark.id);
    expect(reopened.branches[id]).toEqual(saved);
    expect(reopened.branches[id].annotation?.taskRefs).toEqual(originals[2].taskRefs);
    expect(reopened.branches[id].number).toBe(3);
    expect(reopened.lessonAnnotations).toHaveLength(4);
    expect(mark.model?.target).toEqual(originals[2].target);
    expect(mark.model?.taskRefs).not.toBe(originals[2].taskRefs);
    expect(state).toEqual(before);
  });

  it('passes labels with the exact active annotation and lesson index without displacing latest followup/history',()=>{
    const {state}=lesson(),branch=state.branches[`${state.id}:branch:${state.annotations[0].id}`];
    const request=buildTutorRequest(state,{type:'send',branchId:branch.id,text:'Why does this help here?'},'followup');
    const before=structuredClone(request),context=prepareTutorContext({...request,originalExplanation:'Main background '.repeat(900)},8000);
    const head=JSON.parse(context.background.split('\n')[0]);
    expect(head.question).toBe('Why does this help here?');
    expect(head.annotation.taskRefs).toEqual(['Problem 3 · Task 2']);
    expect(request.lesson?.index[0]).toMatchObject({number:1,taskRefs:['Problem 3 · Task 2']});
    expect(context.history).toEqual(request.history);
    expect(context.background).toContain('Problem 3 · Task 1');
    expect(context.background.length+JSON.stringify(context.history).length).toBeLessThan(8000);
    expect(request).toEqual(before);
  });

  it('distinguishes worksheet tasks and parent problems from explicit box numbers',()=>{
    const {state}=lesson();
    const request=(text:string)=>buildTutorRequest(state,{type:'send',text},'references');
    const tasks=request('Compare the explanations for Problem 3 · Task 2');
    expect(tasks.lesson?.threads.map(t=>t.number)).toEqual([1,3]);
    expect(tasks.lesson?.threads.every(t=>t.taskRefs?.includes('Problem 3 · Task 2'))).toBe(true);
    expect(request('Compare box 2 with Problem 3 · Task 2').lesson?.threads.map(t=>t.number)).toEqual([1,2,3]);
    expect(request('Compare Problem 3 Tasks 1 and 2').lesson?.threads.map(t=>t.number)).toEqual([1,2,3]);
    expect(request('Compare boxes 2 and 4').lesson?.threads.map(t=>t.number)).toEqual([2,4]);
  });

  it('shows the task label separately from the stable card number and concept title',()=>{
    const {state}=lesson(),branch=state.branches[`${state.id}:branch:${state.annotations[0].id}`];
    vi.mocked(useSessionStore).mockReturnValue({session:state});
    const html=renderToStaticMarkup(<BranchChat branchId={branch.id}/>);
    expect(html).toContain('class="card-number">1</span>');
    expect(html).toContain('class="card-task-label" aria-label="Worksheet tasks">Problem 3 · Task 2</p>');
    expect(html).toContain('Supporting concept specific');
    const shared=state.branches[`${state.id}:branch:${state.annotations[2].id}`];
    expect(renderToStaticMarkup(<BranchChat branchId={shared.id}/>)).toContain('Problem 3 · Task 1 / Problem 3 · Task 2');
    for(const taskRefs of [undefined,null]){
      vi.mocked(useSessionStore).mockReturnValue({session:{...state,branches:{...state.branches,[branch.id]:{...branch,annotation:{...branch.annotation!,taskRefs}}}}});
      expect(renderToStaticMarkup(<BranchChat branchId={branch.id}/>)).not.toContain('card-task-label');
    }
  });
});
