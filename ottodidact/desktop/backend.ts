import { z } from 'zod';
import { tutorResponseSchema,tutorProgressSchema, type TutorRequest, type TutorResponse, type ProviderStatus } from '../shared/ai';
import { readEvents } from '../shared/stream';

export function backendUrl(): string {
  const url=new URL(process.env.OTTODIDACT_BACKEND_URL ?? 'http://127.0.0.1:8787');
  if(url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password || url.pathname!=='/') throw new Error('OTTODIDACT_BACKEND_URL must be a local HTTP backend, e.g. http://127.0.0.1:8787.');
  return url.origin;
}
const statusSchema=z.object({provider:z.enum(['openai','mock']),model:z.string(),configured:z.boolean(),message:z.string().optional()});
export async function providerStatus():Promise<ProviderStatus> {
  try {
    const response=await fetch(`${backendUrl()}/health`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('Backend health check failed.');
    return statusSchema.parse(await response.json());
  } catch {
    return {provider:'openai',model:'not connected',configured:false,message:'Start the local backend with npm run dev (or npm run dev:server), then select Check connection.'};
  }
}
export async function requestTutor(request:TutorRequest,signal:AbortSignal,onProgress?:(text:string)=>void):Promise<TutorResponse> {
  const timeout=AbortSignal.timeout(110000);
  try {
    const response=await fetch(`${backendUrl()}/api/tutor`,{
      method:'POST',headers:{'Content-Type':'application/json',...(onProgress?{Accept:'text/event-stream'}:{})},body:JSON.stringify(request),
      signal:AbortSignal.any([signal,timeout]),
    });
    if(!response.ok){
      const body=await response.json().catch(()=>null) as {error?:unknown}|null;
      throw new Error(typeof body?.error==='string'?body.error:`Backend request failed (${response.status}). Check the backend terminal and retry.`);
    }
    if(response.headers.get('content-type')?.includes('text/event-stream')){
      if(!response.body)throw new Error('The reply stream is missing. Retry when ready.');
      let completed:TutorResponse|undefined;
      await readEvents(response.body,AbortSignal.any([signal,timeout]),value=>{
        const event=value as {type?:string;response?:unknown;error?:unknown};
        if(event.type==='progress'){
          const {type:_,...payload}=value as Record<string,unknown>;
          const p=tutorProgressSchema.parse(payload);
          if(p.requestId!==request.requestId||p.sessionId!==request.sessionId||p.conversationId!==request.conversationId)throw new Error('Reply stream belongs to a different conversation.');
          onProgress?.(p.text);
        }else if(event.type==='complete')completed=tutorResponseSchema.parse(event.response);
        else if(event.type==='error')throw new Error(typeof event.error==='string'?event.error:'The reply was interrupted. Retry when ready.');
      },4_000_000);
      if(!completed)throw new Error('The reply ended before validation. Your draft is preserved; retry when ready.');
      return completed;
    }
    const raw=await response.text();
    if(raw.length>100000)throw new Error('The backend returned an oversized answer. Please retry.');
    const parsed=tutorResponseSchema.safeParse(JSON.parse(raw));
    if(!parsed.success)throw new Error('The model returned invalid annotations or text. Nothing was rendered. Retry or take a clearer capture.');
    return parsed.data;
  } catch(error) {
    if(signal.aborted)throw new Error('Request cancelled.');
    if(timeout.aborted)throw new Error('The backend timed out. Retry with a smaller capture or check the provider configuration.');
    if(error instanceof TypeError)throw new Error('Cannot reach the local backend. Run npm run dev:server, then retry.');
    throw error;
  }
}
