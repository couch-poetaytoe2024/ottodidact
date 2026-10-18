import { describe,it,expect } from 'vitest';
import { layoutCards,placeMeasuredCard,overlap,annotationLeader } from '../shared/presentation';
import { commandSchema } from '../shared/commands';
import type { Marker } from '../shared/milestone';
const marker:Marker={id:'known',captureId:'capture',number:1,kind:'circle',text:'Known target',bounds:{x:620,y:300,width:120,height:50},target:{x:620,y:300,width:120,height:50}};
const area={x:0,y:0,width:1536,height:816},focus={x:440,y:170,width:450,height:390},main={x:1180,y:400,width:340,height:390};
describe('measured annotation layout',()=>{
  it('uses distinct measured dimensions instead of equal card heights',()=>{
    const second={...marker,id:'long'};
    const cards=layoutCards([marker,second],focus,area,main,{known:{width:268,height:150},long:{width:380,height:390}});
    expect(cards.known.height).toBe(150);expect(cards.long.height).toBe(390);expect(cards.long.width).toBe(380);
    expect(overlap(cards.known,cards.long)).toBe(0);
  });
  it('uses wider measured prose where that removes excessive height without covering content',()=>{
    const result=placeMeasuredCard(marker,focus,area,main,[],[{width:268,height:760},{width:380,height:390}]);
    expect(result.width).toBe(380);expect(result.height).toBe(390);expect(overlap(result,focus)+overlap(result,main)).toBe(0);
  });
  it('keeps a valid previous placement stable while content grows',()=>{
    const first={x:50,y:100,width:268,height:150};
    const next=placeMeasuredCard(marker,focus,area,main,[],[{width:268,height:175},{width:320,height:155}],first);
    expect(next).toMatchObject({x:first.x,y:first.y,width:first.width,height:175});
    expect(placeMeasuredCard(marker,focus,area,main,[],[{width:268,height:175}],next)).toEqual(next);
  });
  it('moves a growing card around occupied cards without changing its target',()=>{
    const before=structuredClone(marker),previous={x:905,y:170,width:268,height:150},other={x:905,y:340,width:268,height:300};
    const next=placeMeasuredCard(marker,focus,area,main,[other],[{width:268,height:330}],previous);
    expect(overlap(next,other)+overlap(next,main)+overlap(next,focus)).toBe(0);expect(marker).toEqual(before);
    const endpoint=annotationLeader(marker,next).to;
    expect(((endpoint.x-680)/60)**2+((endpoint.y-325)/25)**2).toBeCloseTo(1);
    expect(endpoint.x).toBeGreaterThan(focus.x);expect(endpoint.x).toBeLessThan(focus.x+focus.width);
  });
  it('bounds tall content without making every other card equally short',()=>{
    const result=placeMeasuredCard(marker,area,area,main,[],[{width:380,height:2000}]);
    expect(result.width).toBe(380);expect(result.height).toBe(area.height-12);expect(result.y).toBe(6);
    expect(placeMeasuredCard(marker,focus,area,main,[],[{width:268,height:140}]).height).toBe(140);
  });
  it('validates narrow finite measurement commands',()=>{
    const command={type:'branchLayout',branchId:'branch',expanded:true,minimized:false,measurements:[{width:320,height:570}]};
    expect(commandSchema.safeParse(command).success).toBe(true);
    for(const measurements of [[],[{width:Infinity,height:150}],[{width:0,height:150}],[{width:268,height:-1}],Array(6).fill({width:268,height:150})])expect(commandSchema.safeParse({...command,measurements}).success).toBe(false);
  });
});
