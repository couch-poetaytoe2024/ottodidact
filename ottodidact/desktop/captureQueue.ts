/** Serialize native captures; cancelled work cannot publish either a result or an error. */
export class CaptureQueue {
  private tail:Promise<unknown>=Promise.resolve();
  run<T>(capture:()=>Promise<T>,current:()=>boolean):Promise<T|undefined> {
    const next=this.tail.then(async()=>{
      if(!current())return;
      try { const result=await capture();return current()?result:undefined; }
      catch(error){if(current())throw error;}
    });
    this.tail=next.catch(()=>{});
    return next;
  }
}
