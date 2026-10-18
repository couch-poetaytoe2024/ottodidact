import { MAX_ANNOTATIONS, modelAnnotationSchema, type ImageContext, type ModelAnnotation } from './ai';
import type { Marker } from './milestone';
import type { Point, Rect } from './types';
import { canonicalAnnotation,arrowTip,paddedTarget } from './targetGeometry';

interface DisplaySize { width: number; height: number }

const annotationsSchema = modelAnnotationSchema.array().max(MAX_ANNOTATIONS).refine(
  annotations => new Set(annotations.map(annotation => annotation.id)).size === annotations.length,
  'Duplicate annotation IDs',
);

const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function validateImagePosition(image: ImageContext, display: DisplaySize): void {
  const rect = image.desktopRect;
  if (![display.width, display.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Display dimensions must be finite and positive');
  }
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0
    || rect.x + rect.width > display.width + 0.000001
    || rect.y + rect.height > display.height + 0.000001) {
    throw new Error('Image desktop rectangle must lie within the display');
  }
}

function mapTarget(annotation: ModelAnnotation, image: ImageContext, display: DisplaySize): Rect {
  const source = image.desktopRect;
  const normalized = annotation.target!;
  const x = source.x + normalized.x * source.width;
  const y = source.y + normalized.y * source.height;
  // The schema tolerates floating point error at 1.0; never let that extend a marker offscreen.
  const width = Math.min(normalized.width * source.width, Math.min(display.width, source.x + source.width) - x);
  const height = Math.min(normalized.height * source.height, Math.min(display.height, source.y + source.height) - y);
  if (width <= 0 || height <= 0) throw new Error('Annotation target must occupy a nonempty part of the image');
  return { x, y, width, height };
}

function arrowGeometry(target: Rect, display: DisplaySize): Pick<Marker, 'from' | 'to' | 'bounds'> {
  let to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const margin = Math.min(14, display.width / 4, display.height / 4);
  const gap = 24;
  const corners = [
    { x: target.x - gap, y: target.y - gap },
    { x: target.x + target.width + gap, y: target.y - gap },
    { x: target.x - gap, y: target.y + target.height + gap },
    { x: target.x + target.width + gap, y: target.y + target.height + gap },
  ];
  // Prefer an origin just outside the target, but keep arrows compact for large targets.
  let from = corners.find(point => point.x >= margin && point.x <= display.width - margin
    && point.y >= margin && point.y <= display.height - margin && distance(point, to) <= 180);
  if (!from) {
    from = {
      x: clamp(to.x - 96, margin, display.width - margin),
      y: clamp(to.y - 72, margin, display.height - margin),
    };
    if (distance(from, to) < Math.min(24, display.width / 4, display.height / 4)) {
      const alternatives = [
        { x: margin, y: margin },
        { x: display.width - margin, y: margin },
        { x: margin, y: display.height - margin },
        { x: display.width - margin, y: display.height - margin },
      ];
      const furthest = alternatives.reduce((best, point) => distance(point, to) > distance(best, to) ? point : best);
      const length = distance(furthest, to);
      const fraction = Math.min(1, 120 / length);
      from = { x: to.x + (furthest.x - to.x) * fraction, y: to.y + (furthest.y - to.y) * fraction };
    }
  }
  to=arrowTip(target,from);
  const x = Math.max(0, Math.min(from.x, to.x) - margin);
  const y = Math.max(0, Math.min(from.y, to.y) - margin);
  return {
    from, to,
    bounds: {
      x, y,
      width: Math.min(display.width, Math.max(from.x, to.x) + margin) - x,
      height: Math.min(display.height, Math.max(from.y, to.y) + margin) - y,
    },
  };
}

function overlapArea(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function explanationBounds(target: Rect, display: DisplaySize, selection:Rect, occupied:Rect[]): Rect {
  const margin = Math.min(12, display.width / 4, display.height / 4);
  const width = Math.min(250, display.width - margin * 2);
  const height = Math.min(100, display.height - margin * 2);
  const gap = 16;
  const around=(r:Rect)=>[
    {x:r.x+(r.width-width)/2,y:r.y+r.height+gap},
    {x:r.x+(r.width-width)/2,y:r.y-height-gap},
    {x:r.x+r.width+gap,y:r.y+(r.height-height)/2},
    {x:r.x-width-gap,y:r.y+(r.height-height)/2},
  ];
  const candidates = [...around(target),...around(selection),...occupied.flatMap(around)].map(point => ({
    x: clamp(point.x, margin, display.width - width - margin),
    y: clamp(point.y, margin, display.height - height - margin), width, height,
  }));
  // Candidate order breaks ties: below, above, right, then left. For a full-screen target,
  // overlap is unavoidable, so use the available position with the smallest overlap.
  const score=(r:Rect)=>overlapArea(r,target)*100+overlapArea(r,selection)+occupied.reduce((sum,b)=>sum+overlapArea(r,b)*100,0);
  return candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
}

/**
 * Model targets are normalized to the exact image supplied to the provider. desktopRect
 * already locates that image in display-local DIPs, including any pixel-rounded crop.
 * Applying cropOffset, displayScale, or resized pixel dimensions again would double-scale it.
 */
export function mapAnnotations(annotations: ModelAnnotation[], image: ImageContext, display: DisplaySize, options:{allowOutsideFocus?:boolean;requireSource?:boolean}={}): Marker[] {
  const parsed = annotationsSchema.parse(annotations);
  validateImagePosition(image, display);
  const occupied:Rect[]=[];
  const mapOne=(reported:ModelAnnotation,index:number):Marker => {
    const annotation=canonicalAnnotation(reported,image,options.requireSource);
    const source=image.desktopRect,s=image.selection;
    const selection={x:source.x+s.x*source.width,y:source.y+s.y*source.height,width:s.width*source.width,height:s.height*source.height};
    const proposed=annotation.target?mapTarget(annotation,image,display):undefined;
    const inside=proposed&&proposed.x>=selection.x-.001&&proposed.y>=selection.y-.001&&proposed.x+proposed.width<=selection.x+selection.width+.001&&proposed.y+proposed.height<=selection.y+selection.height+.001;
    // Do not clamp a misplaced target into a plausible-looking but incorrect pointer.
    const target=inside||options.allowOutsideFocus?proposed:undefined;
    const explanation = annotation.explanation.trim();
    const base: Marker = {
      id: `${image.captureId}:${annotation.id}`,
      captureId: image.captureId,
      number:index+1,
      kind: annotation.kind,
      bounds: target??selection,
      pointerless:!target,
      target,
      text: explanation,
      concept: annotation.concept,
      model: annotation,
      ...(target&&reported.target?{location:{captureId:image.captureId,feature:reported.source?.feature??annotation.concept,image:reported.source?.image??'full',sourceBounds:{...reported.target},pixelBounds:{x:annotation.target!.x*image.pixelWidth,y:annotation.target!.y*image.pixelHeight,width:annotation.target!.width*image.pixelWidth,height:annotation.target!.height*image.pixelHeight}}}:{}),
    };
    if(!target)return base;
    if (annotation.kind === 'arrow') return { ...base, ...arrowGeometry(target, display) };
    if(annotation.kind==='rectangle')return {...base,bounds:paddedTarget(target)};
    if(annotation.kind==='underline')return {...base,bounds:{...target,height:target.height+2}};
    if (annotation.kind === 'explanation') {
      const bounds=explanationBounds(target, display, selection,occupied);
      occupied.push(bounds);
      return { ...base, bounds };
    }
    return base;
  };
  return parsed.map((annotation,index)=>{
    const parent=mapOne(annotation,index);
    parent.related=annotation.relatedTargets?.map((mark,i)=>({...mapOne({kind:mark.kind,target:mark.target,source:mark.source,id:annotation.id+'-'+i,concept:annotation.concept,explanation:annotation.explanation},index),id:parent.id+':mark:'+i,annotationId:parent.id,purpose:mark.purpose}));
    return parent;
  });
}

/** Flatten only the visual targets. Cards, numbering and chats stay per concept. */
export { annotationMarkings } from './annotationOrganization';
