import type {ModelAnnotation,ModelExplanation} from '../../shared/ai';

// Hand-authored offline expectations, not evidence of live-model recognition.
export const teachingCaptureId='teaching-snapshot';
const card=(id:string,concept:string,explanation:string,feature:string,text:string|null,x:number,kind:ModelAnnotation['kind']='arrow'):ModelAnnotation=>({
  id,concept,explanation,kind,target:{x,y:.3,width:.04,height:.03},relatedTargets:[],
  source:{captureId:teachingCaptureId,image:'full',feature,expectedText:text,observedText:text,certainty:'located'},
});
export const teachingFixtures:{name:string;question:string;focus:string;result:ModelExplanation}[]=[{
  name:'why',question:"Why is this parabola's vertex a maximum?",focus:'causes-and-relationships',result:{
    explanation:'**The vertex is a maximum because the parabola opens downward.**\n\n## Why that happens\n\nThe negative quadratic coefficient makes $a(x-h)^2$ nonpositive. In $y=a(x-h)^2+k$, every value is therefore at most $k$, reached at $x=h$.\n\n| Position | Behavior |\n| --- | --- |\n| Before the vertex | The graph rises toward its maximum. |\n| After the vertex | The graph falls away from its maximum. |',warnings:[],annotations:[
      card('coefficient','Negative coefficient','The quadratic coefficient is negative, so the parabola opens downward. In vertex form, $y=a(x-h)^2+k$, the squared term is nonnegative. Multiplying it by $a<0$ makes it nonpositive. Thus $y$ cannot exceed $k$. At the vertex the squared term is zero, so the maximum $k$ is reached. This sign explains why the turning point is the highest point, not just where it is.','negative quadratic coefficient in the displayed equation','-2',.25),
      card('vertex','Change at the vertex','The graph rises toward this vertex and falls after it. That change makes the vertex the highest point on this downward-opening parabola, supporting the maximum identified in the main answer.','plotted vertex dot',null,.6),
    ],
  },
},{
  name:'solve',question:'How do I solve x^2 - 5x + 6 = 0?',focus:'operations-and-justification',result:{
    explanation:'**The solutions are $x=2$ and $x=3$.**\n\n## Solve by factoring\n\n1. Find two numbers with product $6$ and sum $-5$: $-2$ and $-3$.\n2. Rewrite as $(x-2)(x-3)=0$. Expanding gives the original expression.\n3. Apply the zero-product rule: $x-2=0$ or $x-3=0$, hence $x=2$ or $x=3$.\n\nBoth values satisfy the original equation.',warnings:[],annotations:[
      card('factors','Choosing the factors','The middle coefficient $-5$ fixes the sum of the factor constants. Together with their product $6$, this selects $-2$ and $-3$. Replacing the polynomial by $(x-2)(x-3)$ keeps the equation equivalent and exposes the two factors needed for the solution.','middle term minus five x','-5x',.25,'underline'),
      card('zero','Why a factor must vanish','The product equals zero, so at least one factor is zero. Setting $x-2=0$ or $x-3=0$ yields the two solutions. This step is valid because the right-hand side is zero; it would not be valid for an arbitrary nonzero product.','zero on the right-hand side','0',.6),
    ],
  },
},{
  name:'feature',question:'What does this exponent 2 mean in x^2 here?',focus:'feature-in-context',result:{
    explanation:'**The exponent means $x$ is multiplied by itself:** $x^2=x\\cdot x$, not $2x$.\n\nIn this quadratic term, squaring makes negative and positive inputs of the same magnitude contribute equally. For example, $(-3)^2=3^2=9$. This is the squared dependence that produces the parabola.',warnings:[],annotations:[
      card('exponent','Squaring the input','This superscript 2 applies to $x$, so the term is $x\\cdot x$. For example, $(-3)^2=9$, while $2(-3)=-6$. That difference explains how this term represents a quadratic dependence rather than multiplying the input by two.','superscript two on x','2',.4),
    ],
  },
}];
