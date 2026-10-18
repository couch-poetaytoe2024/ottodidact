import { describe, expect, it } from 'vitest';
import { normalizeRect, toPixelRect } from '../shared/coordinates';
describe('production capture coordinate mapping',()=>{
  it('normalizes reverse drags',()=>expect(normalizeRect({x:100,y:100},{x:50,y:80})).toEqual({x:50,y:80,width:50,height:20}));
  it.each([1,1.25,1.5,1.75,2])('maps display-local DIPs at %sx',scale=>{
    expect(toPixelRect({x:80,y:40,width:200,height:100},{width:1600,height:900},{width:1600*scale,height:900*scale}))
      .toEqual({x:80*scale,y:40*scale,width:200*scale,height:100*scale});
  });
  it('uses actual image dimensions, including thumbnail downscaling',()=>{
    expect(toPixelRect({x:100,y:50,width:200,height:100},{width:1600,height:900},{width:800,height:450})).toEqual({x:50,y:25,width:100,height:50});
  });
  it('rounds outward and clamps at the image edge',()=>{
    expect(toPixelRect({x:1590.5,y:890.5,width:50,height:50},{width:1600,height:900},{width:2000,height:1125})).toEqual({x:1988,y:1113,width:12,height:12});
  });
});
