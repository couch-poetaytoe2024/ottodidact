import { describe, expect, it } from 'vitest';
import { commandSchema } from '../shared/commands';
describe('IPC command validation',()=>{
  it.each([
    {type:'select',rect:{x:NaN,y:0,width:50,height:50}},
    {type:'select',rect:{x:0,y:0,width:-1,height:50}},
    {type:'send',text:' '},
    {type:'send',text:'x'.repeat(2001)},
    {type:'quit',code:'arbitrary'},
    {type:'execute',text:'arbitrary'},
  ])('rejects invalid payload %j',payload=>expect(commandSchema.safeParse(payload).success).toBe(false));
  it('accepts a narrow branch command',()=>expect(commandSchema.parse({type:'send',branchId:'branch-1',text:' question '})).toEqual({type:'send',branchId:'branch-1',text:'question'}));
});
