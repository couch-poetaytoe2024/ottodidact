import { describe,it,expect,vi } from 'vitest';
import { CaptureQueue } from '../desktop/captureQueue';
const deferred=()=>{let resolve!:(value:string)=>void,reject!:(error:Error)=>void;const promise=new Promise<string>((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
describe('cancelled and replacement native captures',()=>{
  it('serializes native work and discards a late result after cancellation',async()=>{
    const queue=new CaptureQueue(),gate=deferred();let generation=1;
    const first=queue.run(()=>gate.promise,()=>generation===1);await Promise.resolve();generation=2;
    const capture=vi.fn(async()=>'replacement');const second=queue.run(capture,()=>generation===2);
    await Promise.resolve();expect(capture).not.toHaveBeenCalled();gate.resolve('obsolete screenshot');
    expect(await first).toBeUndefined();expect(await second).toBe('replacement');expect(capture).toHaveBeenCalledTimes(1);
  });
  it('ignores late failure without damaging a newer activation',async()=>{
    const queue=new CaptureQueue(),gate=deferred();let active=true;
    const first=queue.run(()=>gate.promise,()=>active);await Promise.resolve();active=false;
    const second=queue.run(async()=>'new capture',()=>true);gate.reject(new Error('obsolete failure'));
    expect(await first).toBeUndefined();expect(await second).toBe('new capture');
  });
  it('skips a queued capture cancelled before it starts',async()=>{
    const queue=new CaptureQueue(),gate=deferred();let active=true;
    const first=queue.run(()=>gate.promise,()=>true);const capture=vi.fn(async()=>'unused');
    const second=queue.run(capture,()=>active);active=false;gate.resolve('first');await first;await second;
    expect(capture).not.toHaveBeenCalled();
  });
  it('surfaces current failures and remains usable for a retry',async()=>{
    const queue=new CaptureQueue();await expect(queue.run(async()=>{throw new Error('failure');},()=>true)).rejects.toThrow('failure');
    expect(await queue.run(async()=>'retry',()=>true)).toBe('retry');
  });
});
