import { describe,it,expect } from 'vitest';
import { selectionRect,usableSelection } from '../shared/selection';
import { commandSchema } from '../shared/commands';
describe('precise selection gestures',()=>{
  it.each([[1,1],[-1,1],[1,-1],[-1,-1]])('normalizes drag direction %s,%s',(x,y)=>{
    const rect=selectionRect({x:100,y:100},{x:100+x*6,y:100+y*8},{width:800,height:600});
    expect(rect.width).toBe(6);expect(rect.height).toBe(8);expect(usableSelection(rect)).toBe(true);
    expect(commandSchema.safeParse({type:'select',rect,selectionId:'activation-1'}).success).toBe(true);
  });
  it('clamps release outside the display and rejects clicks and tiny jitters',()=>{
    expect(selectionRect({x:10,y:10},{x:-80,y:900},{width:800,height:600})).toEqual({x:0,y:10,width:10,height:590});
    expect(usableSelection({x:0,y:0,width:1,height:1})).toBe(false);
    expect(usableSelection({x:0,y:0,width:5,height:50})).toBe(false);
    expect(commandSchema.safeParse({type:'select',rect:{x:0,y:0,width:6,height:6}}).success).toBe(false);
  });
});
