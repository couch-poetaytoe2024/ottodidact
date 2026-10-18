/** Bounded SSE reader shared by the existing fetch adapters. Only JSON data
 * events are delivered. Cancellation also interrupts a stalled body read. */
export async function readEvents(body:ReadableStream<Uint8Array>,signal:AbortSignal,onEvent:(value:unknown)=>void,maxBytes=1_000_000) {
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try {
    while(!signal.aborted){
      const {value,done}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>maxBytes)throw new Error('Response stream exceeds its size limit.');
      buffer+=decoder.decode(value,{stream:true});
      // Normalize only complete line endings; CR/LF may cross network chunks.
      let match:RegExpExecArray|null;
      while((match=/\r?\n\r?\n/.exec(buffer))){
        const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
        const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(data&&data!=='[DONE]')onEvent(JSON.parse(data));
      }
    }
    if(signal.aborted)throw new Error('Request cancelled.');
    if(buffer.trim())throw new Error('Response stream ended mid-event.');
  } finally {signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** Preview only the first JSON string, never annotation fragments. Escaped or
 * split Unicode sequences wait for completion; final schema validation owns commit. */
export function explanationPreview(json:string):string {
  const start=/^\s*\{\s*"explanation"\s*:\s*"/.exec(json);if(!start)return '';
  let encoded='';
  for(let i=start[0].length;i<json.length;i++){
    const c=json[i];if(c==='"')break;
    if(c==='\\'){
      const escape=json[i+1];if(!escape)break;
      const size=escape==='u'?6:2;if(i+size>json.length)break;
      encoded+=json.slice(i,i+size);i+=size-1;
    }else encoded+=c;
  }
  try {const text=JSON.parse('"'+encoded+'"') as string;return text.replace(/[\uD800-\uDBFF]$/,'');}catch{return '';}
}
