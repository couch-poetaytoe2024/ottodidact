import { modelExplanationSchema, usageSchema, type ModelExplanation, type TutorRequest, type TutorResponse } from '../../shared/ai';
import { providerStatus, type ServerConfig } from '../config';
import { TutorError } from '../errors';
import { prepareTutorContext } from './context';
import { mockTutor } from './mock';
import { TUTOR_INSTRUCTIONS, TUTOR_JSON_SCHEMA, CORE_INSTRUCTIONS, CHAT_JSON_SCHEMA } from './prompts';
import { responsePolicy } from './responsePolicy';
import { explanationPreview,readEvents } from '../../shared/stream';

export interface Completion { result: ModelExplanation; usage?: TutorResponse['usage']; model?:string; timings?:Record<string,number> }
export type TutorProvider = (request: TutorRequest, signal: AbortSignal,onProgress?:(text:string)=>void) => Promise<Completion>;
interface ResponseBody {model?:string;status?:string;output?:{type?:string;content?:{type?:string;text?:string}[]}[];usage?:{input_tokens?:number;output_tokens?:number}}
type UsageRecorder = (request:TutorRequest,usage:NonNullable<TutorResponse['usage']>,model?:string)=>void;
export function validateModelOutput(value: unknown, kind: TutorRequest['kind']): ModelExplanation {
  const parsed = modelExplanationSchema.safeParse(value);
  if (!parsed.success || (kind === 'chat' && parsed.data.annotations.length > 0)) {
    throw new TutorError(502, 'INVALID_MODEL_OUTPUT', 'The model returned invalid annotations or an invalid answer. Retry, or use a clearer capture.');
  }
  return parsed.data;
}

export function createProvider(
  config: ServerConfig,
  fetcher: typeof fetch = fetch,
  onUsage?: UsageRecorder,
): TutorProvider {
  // No automatic paid retries or fallback; explicit Retry owns the lifecycle.
  return async (request, signal,onProgress) => {
    const started=performance.now(),policy=responsePolicy(request,config.maxOutputTokens);
    if(signal.aborted)throw new TutorError(504,'REQUEST_CANCELLED','The request was cancelled or timed out. Retry when ready.');
    if (!providerStatus(config).configured) throw new TutorError(503, 'MISSING_CREDENTIALS', providerStatus(config).message!);
    if (config.provider === 'mock') return { result: mockTutor(request) };
    let prepared:ReturnType<typeof prepareTutorContext>;
    try { prepared = prepareTutorContext(request, config.contextCharLimit,config.maxOutputTokens); }
    catch { throw new TutorError(400, 'CONTEXT_TOO_LARGE', 'Question and context exceed AI_CONTEXT_CHAR_LIMIT. Shorten your question or increase the backend context limit.'); }
    let response: globalThis.Response;
    const contextReady=performance.now(),streaming=!!onProgress;
    try {
      response = await fetcher('https://api.openai.com/v1/responses', {
        method: 'POST', signal,
        headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model, store: false, instructions: request.kind==='chat'?CORE_INSTRUCTIONS:TUTOR_INSTRUCTIONS,
          max_output_tokens: policy.maxOutputTokens,...(streaming?{stream:true}:{}),
          ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
          input: [{ role: 'user', content: [
            { type: 'input_text', text: prepared.background },
            { type: 'input_image', image_url: request.image.dataUrl, detail: 'high' },
            ...(request.kind==='explain'&&request.image.detail?[
              {type:'input_text',text:'Image detail: close-up of the same capture. Coordinate mapping is in detailImage metadata.'},
              {type:'input_image',image_url:request.image.detail.dataUrl,detail:'high'},
            ]:[]),
          ] },...prepared.history.map(message=>({role:message.role,content:message.content})),
            ...(request.kind==='chat'?[{role:'user',content:request.question}]:[])],
          text: { ...(config.verbosity ? { verbosity: config.verbosity } : {}), format: { type: 'json_schema', name: 'ottodidact_explanation', strict: true, schema: request.kind==='chat'?CHAT_JSON_SCHEMA:TUTOR_JSON_SCHEMA } },
        }),
      });
    } catch {
      if (signal.aborted) throw new TutorError(504, 'REQUEST_CANCELLED', 'The request was cancelled or timed out. Retry when ready.');
      throw new TutorError(502, 'PROVIDER_UNREACHABLE', 'Could not reach OpenAI. Check your internet connection and retry.');
    }
    if (!response.ok) {
      // Do not echo upstream bodies: they may contain submitted text or credentials.
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) throw new TutorError(502, 'PROVIDER_AUTH', 'OpenAI rejected the backend credentials or model access. Check OPENAI_API_KEY and OPENAI_MODEL, then restart the backend.');
      if (response.status === 429) throw new TutorError(429, 'PROVIDER_RATE_LIMIT', 'OpenAI rate or quota limit reached. Check your API billing/limits and retry later.');
      throw new TutorError(502, 'PROVIDER_ERROR', 'OpenAI returned HTTP ' + response.status + '. Check your model configuration or retry later. No demo answer was substituted.');
    }
    let body:ResponseBody|undefined,firstTextMs:number|undefined;
    try {
      if(streaming&&response.headers.get('content-type')?.includes('text/event-stream')){
        if(!response.body)throw new Error('Missing stream');
        let json='',last='',lastAt=-Infinity;
        await readEvents(response.body,signal,value=>{
          const event=value as {type?:string;delta?:string;response?:ResponseBody};
          if(event.type==='response.output_text.delta'&&typeof event.delta==='string'){
            json+=event.delta;if(json.length>100000)throw new Error('Oversized answer');
            const preview=explanationPreview(json),now=performance.now();
            if(preview.length>16000)throw new Error('Oversized preview');
            if(preview&&preview!==last&&(now-lastAt>=100||preview.endsWith('\n'))){
              firstTextMs??=now-contextReady;last=preview;lastAt=now;onProgress?.(preview);
            }
          }
          if(event.type==='response.completed'||event.type==='response.incomplete'||event.type==='response.failed')body=event.response;
          if(event.type==='error')throw new TutorError(502,'PROVIDER_ERROR','OpenAI interrupted the reply. Retry when ready.');
        });
      }else body=await response.json() as ResponseBody;
    } catch(error) {
      if(signal.aborted)throw new TutorError(504,'REQUEST_CANCELLED','The request was cancelled or timed out. Retry when ready.');
      if(error instanceof TutorError)throw error;
      throw new TutorError(502, 'INVALID_MODEL_OUTPUT', 'OpenAI returned an unreadable or interrupted response. Please retry.');
    }
    const received=performance.now();
    if (!body || typeof body !== 'object') throw new TutorError(502, 'INVALID_MODEL_OUTPUT', 'OpenAI returned an invalid response. Please retry.');
    let usage: TutorResponse['usage'];
    if (body.usage) {
      const parsedUsage = usageSchema.safeParse({ inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens });
      if (parsedUsage.success) {
        usage = parsedUsage.data;
        if (config.inputUSDPerMillion !== undefined && config.outputUSDPerMillion !== undefined) {
          usage.estimatedCostUSD = (usage.inputTokens * config.inputUSDPerMillion + usage.outputTokens * config.outputUSDPerMillion) / 1_000_000;
        }
        // Refusals, invalid answers, and token-limit truncation still incur usage.
        if(body.model)onUsage?.(request,usage,body.model);else onUsage?.(request, usage);
      }
    }
    if (body.status !== 'completed') throw new TutorError(502, 'INCOMPLETE_MODEL_OUTPUT', 'The model did not finish its answer. Retry with a smaller question or increase AI_MAX_OUTPUT_TOKENS.');
    const content = body.output?.filter(item => item.type === 'message').flatMap(item => item.content ?? []) ?? [];
    if (content.some(item => item.type === 'refusal')) throw new TutorError(422, 'MODEL_REFUSAL', 'The model could not answer this request. Try rephrasing your study question.');
    const answer = content.filter(item => item.type === 'output_text').map(item => item.text ?? '').join('');
    let parsed: unknown;
    try { parsed = JSON.parse(answer); }
    catch { throw new TutorError(502, 'INVALID_MODEL_OUTPUT', 'The model returned malformed structured output. Retry; no annotations were applied.'); }
    const result = validateModelOutput(parsed, request.kind);
    return { result, usage, model:body.model||config.model,timings:{contextMs:contextReady-started,providerMs:received-contextReady,parseMs:performance.now()-received,contextChars:prepared.background.length+JSON.stringify(prepared.history).length,outputBudget:policy.maxOutputTokens,...(firstTextMs!==undefined?{firstTextMs}:{})} };
  };
}
