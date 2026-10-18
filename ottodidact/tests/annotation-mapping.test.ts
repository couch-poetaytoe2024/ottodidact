import { describe, expect, it } from 'vitest';
import { mapAnnotations } from '../shared/annotationMapping';
import { requestsOutsideFocus } from '../shared/annotationScope';
import type { ImageContext, ModelAnnotation } from '../shared/ai';
import type { Rect } from '../shared/types';

const display = { width: 1600, height: 900 };
const target = { x: 0.25, y: 0.2, width: 0.5, height: 0.4 };
const annotation = (kind: ModelAnnotation['kind'] = 'circle', rect = target): ModelAnnotation => ({
  id: `model-${kind}`, kind, concept: 'The selected concept',
  explanation: 'Read this part of the captured example.', target: rect,
});
const context = (changes: Partial<ImageContext> = {}): ImageContext => ({
  captureId: 'capture-one', dataUrl: 'data:image/png;base64,AAAA',
  pixelWidth: 500, pixelHeight: 250, originalPixelWidth: 1000, originalPixelHeight: 500,
  cropOffset: { x: 250, y: 125 }, displayScale: 1.25,
  desktopRect: { x: 200, y: 100, width: 800, height: 400 },
  selection: { x: 0, y: 0, width: 1, height: 1 }, ...changes,
});

function expectOnscreen(rect: Rect, size = display): void {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
  expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y;

describe('model annotation mapping into display-local DIPs', () => {
  it.each([1, 1.25, 1.5, 1.75, 2])('accounts for crop position and image resizing at %sx', scale => {
    const image = context({
      displayScale: scale, cropOffset: { x: 200 * scale, y: 100 * scale },
      originalPixelWidth: 800 * scale, originalPixelHeight: 400 * scale,
      pixelWidth: 400, pixelHeight: 200,
    });
    const [marker] = mapAnnotations([annotation()], image, display);
    expect(marker.target).toEqual({ x: 400, y: 180, width: 400, height: 160 });
    expect(marker.bounds).toEqual(marker.target);
  });

  it('preserves pixel-rounded fractional crop coordinates instead of scaling twice', () => {
    const [marker] = mapAnnotations([annotation()], context({
      cropOffset: { x: 101, y: 77 }, originalPixelWidth: 501, originalPixelHeight: 251,
      pixelWidth: 250, pixelHeight: 125, displayScale: 1.25,
      desktopRect: { x: 80.8, y: 61.6, width: 400.8, height: 200.8 },
    }), display);
    expect(marker.target?.x).toBeCloseTo(181);
    expect(marker.target?.y).toBeCloseTo(101.76);
    expect(marker.target?.width).toBeCloseTo(200.4);
    expect(marker.target?.height).toBeCloseTo(80.32);
  });

  it('maps targets against the full supplied image when context extends beyond selection', () => {
    const [marker] = mapAnnotations([annotation()], context({
      desktopRect: { x: 0, y: 0, ...display }, cropOffset: { x: 0, y: 0 },
      pixelWidth: 800, pixelHeight: 450, originalPixelWidth: 2000, originalPixelHeight: 1125,
      selection: { x: 0.75, y: 0.75, width: 0.1, height: 0.1 },
    }), display,{allowOutsideFocus:true});
    expect(marker.target).toEqual({ x: 400, y: 180, width: 800, height: 360 });
  });

  it('gives arrows absolute endpoints and bounds enclosing the line', () => {
    const [marker] = mapAnnotations([annotation('arrow', { x: 0.25, y: 0.25, width: 0.1, height: 0.1 })], context(), display);
    expect(marker.to!.y).toBeLessThan(marker.target!.y);
    expect(marker.to).not.toEqual({x:440,y:220});
    expect(marker.from?.x).toBeLessThan(marker.target!.x);
    expect(marker.from?.y).toBeLessThan(marker.target!.y);
    for (const point of [marker.from!, marker.to!]) {
      expect(point.x).toBeGreaterThanOrEqual(marker.bounds.x);
      expect(point.x).toBeLessThanOrEqual(marker.bounds.x + marker.bounds.width);
      expect(point.y).toBeGreaterThanOrEqual(marker.bounds.y);
      expect(point.y).toBeLessThanOrEqual(marker.bounds.y + marker.bounds.height);
    }
  });

  it.each([
    { x: 0, y: 0, width: 0.03, height: 0.04 },
    { x: 0.97, y: 0, width: 0.03, height: 0.04 },
    { x: 0, y: 0.96, width: 0.03, height: 0.04 },
    { x: 0.97, y: 0.96, width: 0.03, height: 0.04 },
    { x: 0.4, y: 0, width: 0.1, height: 0.04 },
    { x: 0.4, y: 0.96, width: 0.1, height: 0.04 },
    { x: 0, y: 0.4, width: 0.03, height: 0.1 },
    { x: 0.97, y: 0.4, width: 0.03, height: 0.1 },
  ])('keeps all marker kinds onscreen near edge $x,$y', rect => {
    const markers = mapAnnotations(['arrow', 'circle', 'explanation'].map(kind => annotation(kind as ModelAnnotation['kind'], rect)),
      context({ desktopRect: { x: 0, y: 0, ...display } }), display);
    for (const marker of markers) {
      expectOnscreen(marker.bounds);
      expectOnscreen(marker.target!);
      if (marker.kind === 'explanation') expect(intersects(marker.bounds, marker.target!)).toBe(false);
    }
  });

  it('places explanation bubbles below, above, or beside targets when space permits', () => {
    const image = context({ desktopRect: { x: 0, y: 0, ...display } });
    const below = mapAnnotations([annotation('explanation', { x: 0.4, y: 0.2, width: 0.1, height: 0.1 })], image, display)[0];
    expect(below.bounds.y).toBeGreaterThan(below.target!.y + below.target!.height);
    const above = mapAnnotations([annotation('explanation', { x: 0.4, y: 0.85, width: 0.1, height: 0.1 })], image, display)[0];
    expect(above.bounds.y + above.bounds.height).toBeLessThan(above.target!.y);
    const beside = mapAnnotations([annotation('explanation', { x: 0.4, y: 0.01, width: 0.1, height: 0.98 })], image, display)[0];
    expect(beside.bounds.x).toBeGreaterThan(beside.target!.x + beside.target!.width);
  });

  it('keeps bounds valid when the target fills a small display', () => {
    const size = { width: 180, height: 120 };
    const image = context({ desktopRect: { x: 0, y: 0, ...size } });
    const markers = mapAnnotations(['arrow', 'circle', 'explanation'].map(kind => annotation(kind as ModelAnnotation['kind'], { x: 0, y: 0, width: 1, height: 1 })), image, size);
    markers.forEach(marker => expectOnscreen(marker.bounds, size));
    expect(markers[0].from).not.toEqual(markers[0].to);
  });

  it('preserves stable capture-specific IDs and an independent copy of the full model annotation', () => {
    const model = { ...annotation('explanation'), explanation: 'A lengthy explanation. '.repeat(30) };
    const first = mapAnnotations([model], context(), display)[0];
    const reopened = mapAnnotations([model], context(), display)[0];
    expect(first.id).toBe('capture-one:model-explanation');
    expect(reopened.id).toBe(first.id);
    expect(mapAnnotations([model], context({ captureId: 'capture-two' }), display)[0].id).not.toBe(first.id);
    expect(first.text).toBe(model.explanation.trim());
    expect(first.model).toEqual(model);
    expect(first.model).not.toBe(model);
    expect(first.model?.target).not.toBe(model.target);
  });

  it.each([
    { x: -0.01, y: 0, width: 0.5, height: 0.5 },
    { x: 0.9, y: 0, width: 0.2, height: 0.5 },
    { x: 0, y: 0.9, width: 0.5, height: 0.2 },
    { x: 0, y: 0, width: 0, height: 0.5 },
    { x: Number.NaN, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 0.5 },
  ])('rejects invalid normalized target $x,$y,$width,$height', rect => {
    expect(() => mapAnnotations([annotation('circle', rect)], context(), display)).toThrow();
  });

  it('rejects duplicate IDs before creating colliding marker/branch identities', () => {
    expect(() => mapAnnotations([annotation(), annotation()], context(), display)).toThrow('Duplicate annotation IDs');
  });

  it('clamps harmless normalization roundoff but rejects an empty target at the edge', () => {
    const image = context({ desktopRect: { x: 0, y: 0, ...display } });
    const [marker] = mapAnnotations([annotation('circle', { x: 0.9, y: 0.9, width: 0.1000000001, height: 0.1000000001 })], image, display);
    expectOnscreen(marker.bounds);
    expect(() => mapAnnotations([annotation('circle', { x: 1, y: 0.5, width: 0.0000001, height: 0.1 })], image, display)).toThrow('nonempty');
  });

  it('rejects invalid display/image positioning', () => {
    expect(() => mapAnnotations([annotation()], context(), { width: Number.NaN, height: 900 })).toThrow('Display dimensions');
    expect(() => mapAnnotations([annotation()], context({ desktopRect: { x: -1, y: 0, width: 200, height: 100 } }), display)).toThrow('Image desktop rectangle');
    expect(() => mapAnnotations([annotation()], context({ desktopRect: { x: 1500, y: 0, width: 200, height: 100 } }), display)).toThrow('Image desktop rectangle');
  });
});

describe('safe focus targeting',()=>{
  it('keeps text and stable card identity when a target is unknown',()=>{
    const model={...annotation(),target:null};
    const marker=mapAnnotations([model],context(),display)[0];
    expect(marker.pointerless).toBe(true);expect(marker.target).toBeUndefined();expect(marker.from).toBeUndefined();
    expect(marker.id).toBe('capture-one:model-circle');expect(marker.number).toBe(1);expect(marker.model?.explanation).toBe(model.explanation);
  });
  it('suppresses out-of-focus and partly overlapping targets instead of moving them',()=>{
    const image=context({selection:{x:.3,y:.2,width:.2,height:.3}});
    for(const rect of [target,{x:.2,y:.2,width:.2,height:.2}]){
      const marker=mapAnnotations([annotation('arrow',rect)],image,display)[0];
      expect(marker.pointerless).toBe(true);expect(marker.target).toBeUndefined();expect(marker.to).toBeUndefined();
      expect(marker.model?.target).toEqual(rect);
    }
  });
  it('retains exact targets inside focus',()=>{
    const image=context({selection:{x:.2,y:.1,width:.6,height:.6}});
    expect(mapAnnotations([annotation()],image,display)[0].target).toEqual({x:400,y:180,width:400,height:160});
  });
  it('requires an explicit request before allowing targets elsewhere',()=>{
    expect(requestsOutsideFocus('Explain the whole screen')).toBe(true);
    expect(requestsOutsideFocus('Point to the equation outside the selection')).toBe(true);
    for(const question of ['Explain this using the surrounding screen as context.','Do not annotate outside the selection','Only explain the selected area','What is this?'])expect(requestsOutsideFocus(question)).toBe(false);
  });
});
