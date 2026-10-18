import { afterEach,describe,it,expect,vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createProvider } from '../server/ai/client';
import { readConfig,providerStatus } from '../server/config';
import { createApp } from '../server/app';
import { TUTOR_JSON_SCHEMA } from '../server/ai/prompts';
import { buildTutorContext } from '../server/ai/context';
import { tutorResponseSchema,type TutorRequest } from '../shared/ai';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5qkAAAAASUVORK5CYII=';
const key='test-anthropic-key-not-a-credential';
const config=readConfig({AI_PROVIDER:'anthropic',ANTHROPIC_API_KEY:key});
const result={explanation:'Both factors multiply to zero.',annotations:[{id:'factor',kind:'circle',concept:'Factor',explanation:'Set this factor to zero.',target:{x:.2,y:.2,width:.2,height:.2}}],warnings:[]};
function request(overrides:Partial<TutorRequest>={}):TutorRequest {
  return {requestId:'r1',sessionId:'lesson',captureId:'screen',conversationId:'lesson:main',kind:'explain',mode:'explain',question:'Explain the focus.',originalQuestion:'',originalExplanation:'',annotation:null,history:[],image:{captureId:'screen',dataUrl:png,pixelWidth:1,pixelHeight:1,originalPixelWidth:1,originalPixelHeight:1,cropOffset:{x:0,y:0},displayScale:1.25,desktopRect:{x:0,y:0,width:1,height:1},selection:{x:.1,y:.1,width:.5,height:.5}},...overrides};
}
function upstream(answer:unknown=result,extra:Record<string,unknown>={}) {
  return new Response(JSON.stringify({id:'message-1',type:'message',role:'assistant',model:'claude-sonnet-5-5',content:[{type:'text',text:JSON.stringify(answer)}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:120,output_tokens:30,cache_creation_input_tokens:10,cache_read_input_tokens:20},...extra}),{status:200,headers:{'Content-Type':'application/json'}});
}
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('selected provider configuration',()=>{
  it('requires only the selected key and reports no secrets',()=>{
    const both={OPENAI_API_KEY:'test-openai-key',ANTHROPIC_API_KEY:key};
    const anthropic=readConfig({...both,AI_PROVIDER:'anthropic'}),openai=readConfig({...both,AI_PROVIDER:'openai'});
    expect(anthropic.apiKey).toBe(key);expect(openai.apiKey).toBe(both.OPENAI_API_KEY);
    expect(anthropic.model).toBe('claude-sonnet-5-5');expect(openai.model).toBe('gpt-4.1-mini');
    expect(providerStatus(anthropic)).toMatchObject({provider:'anthropic',model:'claude-sonnet-5-5',configured:true});
    expect(JSON.stringify(providerStatus(anthropic))).not.toContain(key);
    expect(providerStatus(readConfig({AI_PROVIDER:'anthropic',OPENAI_API_KEY:'test-only'}))).toMatchObject({configured:false,message:expect.stringContaining('ANTHROPIC_API_KEY')});
    expect(providerStatus(readConfig({AI_PROVIDER:'openai',ANTHROPIC_API_KEY:key})).configured).toBe(false);
    expect(readConfig({AI_PROVIDER:'mock',...both}).apiKey).toBe('');
    expect(()=>readConfig({AI_PROVIDER:'unknown'})).toThrow('AI_PROVIDER');
  });
  it('fails without Anthropic credentials before any network call; never falls back',async()=>{
    const fetcher=vi.fn();
    await expect(createProvider(readConfig({AI_PROVIDER:'anthropic',OPENAI_API_KEY:'test-openai'}),fetcher)(request(),new AbortController().signal)).rejects.toMatchObject({code:'MISSING_CREDENTIALS'});
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('official Anthropic SDK transport and shared context',()=>{
  it('sends one exact PNG, focus, stable IDs and the transformed shared JSON schema only to Anthropic',async()=>{
    const fetcher=vi.fn().mockResolvedValue(upstream()),usage=vi.fn(),before=structuredClone(TUTOR_JSON_SCHEMA);
    // Explicit backend configuration must win over SDK environment defaults.
    vi.stubEnv('ANTHROPIC_BASE_URL','https://unrelated.invalid');vi.stubEnv('ANTHROPIC_AUTH_TOKEN','private-bearer');vi.stubEnv('ANTHROPIC_LOG','debug');
    const logs=vi.spyOn(console,'debug').mockImplementation(()=>{});
    const completed=await createProvider(config,fetcher,usage)(request(),new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,init]=fetcher.mock.calls[0],headers=new Headers(init.headers),body=JSON.parse(init.body);
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');expect(headers.get('x-api-key')).toBe(key);expect(headers.has('authorization')).toBe(false);
    expect(body.model).toBe('claude-sonnet-5-5');expect(body.max_tokens).toBe(1800);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toEqual([{type:'image',source:{type:'base64',media_type:'image/png',data:png.split(',')[1]}},{type:'text',text:buildTutorContext(request(),config.contextCharLimit)}]);
    expect(body.system).toContain('untrusted study material');expect(body.system).toContain('FULL active display');
    const head=JSON.parse(body.messages[0].content[1].text.split('\n')[0]);
    expect(head).toMatchObject({sessionId:'lesson',conversationId:'lesson:main',captureId:'screen',suppliedImage:{selection:request().image.selection}});
    expect(body.output_config.format).toMatchObject({type:'json_schema',schema:{additionalProperties:false}});
    expect(body.output_config.format.schema.properties.annotations.maxItems).toBeUndefined();
    expect(body.output_config.format.schema.properties.annotations.items.properties.id.maxLength).toBeUndefined();
    expect(TUTOR_JSON_SCHEMA).toEqual(before);
    expect(completed.result).toEqual(result);expect(completed.model).toBe('claude-sonnet-5-5');
    expect(completed.usage).toEqual({inputTokens:150,outputTokens:30,cacheReadInputTokens:20,cacheCreationInputTokens:10});
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({captureId:'screen'}),completed.usage,'claude-sonnet-5-5');expect(logs).not.toHaveBeenCalled();
  });
  it.each(['branch','main'])('preserves bounded %s followup context and related boxes without redundant images',async conversation=>{
    const index=[{annotationId:'screen:one',number:1,title:'Factoring',explanation:'Find factors.'},{annotationId:'screen:four',number:4,title:'Roots',explanation:'Set factors to zero.'}];
    const lesson={sessionId:'lesson',captureId:'screen',index,threads:index.map(item=>({conversationId:'lesson:branch:'+item.annotationId,annotationId:item.annotationId,number:item.number,title:item.title,messages:[{role:'assistant' as const,content:('Discussion in box '+item.number+'. ').repeat(100)}]}))};
    const input=request({kind:'chat',question:'How do boxes 1 and 4 connect?',conversationId:conversation==='branch'?'lesson:branch:screen:active':'lesson:main',annotation:conversation==='branch'?{...result.annotations[0],kind:'circle'}:null,originalQuestion:'Factor this expression.',originalExplanation:'Original lesson',history:[{role:'user',content:'My previous question'},{role:'assistant',content:'My previous answer'}],lesson});
    const before=structuredClone(input),fetcher=vi.fn().mockResolvedValue(upstream({...result,annotations:[]}));
    await createProvider({...config,contextCharLimit:8000},fetcher)(input,new AbortController().signal);
    const blocks=JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content,text=blocks.find((b:{type:string})=>b.type==='text').text;
    expect(blocks.filter((b:{type:string})=>b.type==='image')).toHaveLength(1);
    expect(text.length).toBeLessThanOrEqual(8000);expect(text).toContain('Discussion in box 1');expect(text).toContain('Discussion in box 4');expect(text).toContain('My previous answer');expect(text).toContain('Original lesson');
    expect(input).toEqual(before);expect(input.history.some(m=>m.content.includes('Discussion in box'))).toBe(false);
  });
  it('returns the actual model and usage through the existing HTTP contract',async()=>{
    const selected=readConfig({AI_PROVIDER:'anthropic',ANTHROPIC_API_KEY:key,ANTHROPIC_MODEL:'configured-model-alias'});
    const fetcher=vi.fn().mockResolvedValue(upstream()),logger=vi.fn();
    const provider=createProvider(selected,fetcher),server=createApp({config:selected,provider,logger}).listen(0,'127.0.0.1');
    await new Promise<void>(resolve=>server.once('listening',resolve));
    try {
      const url='http://127.0.0.1:'+(server.address() as AddressInfo).port;
      expect(await (await fetch(url+'/health')).json()).toMatchObject({provider:'anthropic',model:'configured-model-alias',configured:true});
      const response=await fetch(url+'/api/tutor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request())});
      expect(response.status).toBe(200);
      expect(tutorResponseSchema.parse(await response.json())).toMatchObject({provider:'anthropic',model:'claude-sonnet-5-5',sessionId:'lesson',captureId:'screen',conversationId:'lesson:main',usage:{inputTokens:150,outputTokens:30}});
      expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('configured-model-alias');
      expect(JSON.stringify(logger.mock.calls)).not.toMatch(/data:image|test-anthropic-key|Explain the focus/);
    } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  it('estimates only explicitly configured prices while retaining cache token counts',async()=>{
    const response=await createProvider({...config,inputUSDPerMillion:2,outputUSDPerMillion:10},vi.fn().mockResolvedValue(upstream()))(request(),new AbortController().signal);
    expect(response.usage?.estimatedCostUSD).toBeCloseTo(.0006);expect(response.usage?.cacheReadInputTokens).toBe(20);
  });
});

describe('Anthropic validation, errors and cancellation',()=>{
  it.each([401,403,404,429,500,529])('sanitizes HTTP %s without SDK retries or a fallback',async status=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({type:'error',error:{type:'api_error',message:'PRIVATE request '+key}}),{status,headers:{'Content-Type':'application/json'}}));
    const error=await createProvider(config,fetcher)(request(),new AbortController().signal).catch(e=>e);
    expect(error.message).not.toMatch(/PRIVATE|test-anthropic-key/);expect(error.message).toContain('Anthropic');expect(fetcher).toHaveBeenCalledTimes(1);
    expect(error.status).toBe(status===429?429:502);
  });
  it.each(['refusal','max_tokens','tool_use','pause_turn','model_context_window_exceeded',null])('rejects incomplete stop reason %s and still records available usage',async stop_reason=>{
    const usage=vi.fn();
    await expect(createProvider(config,vi.fn().mockResolvedValue(upstream(result,{stop_reason})),usage)(request(),new AbortController().signal)).rejects.toMatchObject({code:stop_reason==='refusal'?'MODEL_REFUSAL':'INCOMPLETE_MODEL_OUTPUT'});
    expect(usage).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed JSON, invalid coordinates, duplicates and excessive annotations',async()=>{
    const marker=result.annotations[0];
    const invalid=[upstream(result,{content:[{type:'text',text:'{broken'}]}),upstream({...result,annotations:[{...marker,target:{x:.9,y:0,width:.2,height:.2}}]}),upstream({...result,annotations:[{...marker,target:{x:0,y:0,width:0,height:.2}}]}),upstream({...result,annotations:[marker,marker]}),upstream({...result,annotations:Array.from({length:17},(_,i)=>({...marker,id:'a'+i}))}),upstream({...result,annotations:[{...marker,id:'a'.repeat(65)}]})];
    for(const response of invalid)await expect(createProvider(config,vi.fn().mockResolvedValue(response))(request(),new AbortController().signal)).rejects.toMatchObject({code:'INVALID_MODEL_OUTPUT'});
    await expect(createProvider(config,vi.fn().mockResolvedValue(upstream()))(request({kind:'chat'}),new AbortController().signal)).rejects.toMatchObject({code:'INVALID_MODEL_OUTPUT'});
  });
  it('never presents thinking blocks as an answer and permits uncertain text-only responses',async()=>{
    const answer={...result,annotations:[],warnings:['Location is uncertain.']};
    const response=upstream(answer,{content:[{type:'thinking',thinking:'PRIVATE internal content',signature:'test'},{type:'text',text:JSON.stringify(answer)}]});
    expect((await createProvider(config,vi.fn().mockResolvedValue(response))(request(),new AbortController().signal)).result).toEqual(answer);
  });
  it('rejects an over-limit base64 image locally, without cropping or a request',async()=>{
    const input=request();input.image.dataUrl='data:image/png;base64,'+'a'.repeat(10_000_001);
    const fetcher=vi.fn();await expect(createProvider(config,fetcher)(input,new AbortController().signal)).rejects.toMatchObject({code:'IMAGE_TOO_LARGE'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('handles a pre-cancelled request without touching the network',async()=>{
    const controller=new AbortController();controller.abort();const fetcher=vi.fn();
    await expect(createProvider(config,fetcher)(request(),controller.signal)).rejects.toMatchObject({code:'REQUEST_CANCELLED'});expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['cancel','timeout'])('aborts the SDK transport on %s with one attempt',async action=>{
    let ready!:()=>void,upstreamSignal:AbortSignal|undefined;
    const started=new Promise<void>(resolve=>ready=resolve),controller=new AbortController();
    const fetcher=vi.fn<typeof fetch>().mockImplementation((_url,init)=>new Promise((_resolve,reject)=>{
      upstreamSignal=init!.signal!;ready();upstreamSignal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
    }));
    const pending=createProvider({...config,timeoutMs:action==='timeout'?30:1000},fetcher)(request(),controller.signal);
    const check=expect(pending).rejects.toMatchObject({code:action==='cancel'?'REQUEST_CANCELLED':'REQUEST_TIMEOUT'});
    await started;if(action==='cancel')controller.abort();await check;
    expect(upstreamSignal?.aborted).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
