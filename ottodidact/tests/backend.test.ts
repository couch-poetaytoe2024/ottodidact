import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, validateImage, type AppOptions } from '../server/app';
import { readConfig, providerStatus } from '../server/config';
import { createProvider, validateModelOutput, type TutorProvider } from '../server/ai/client';
import { buildTutorContext } from '../server/ai/context';
import { mockTutor } from '../server/ai/mock';
import { tutorRequestSchema, type TutorRequest } from '../shared/ai';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5qkAAAAASUVORK5CYII=';
function request(overrides: Partial<TutorRequest> = {}): TutorRequest {
  return {
    requestId: 'request-1', sessionId: 'session-original', captureId: 'capture-original', conversationId: 'main',
    kind: 'explain', mode: 'explain', question: 'What does this equation mean?', originalQuestion: '', originalExplanation: '', annotation: null, history: [],
    image: { captureId: 'capture-original', dataUrl: png, pixelWidth: 1, pixelHeight: 1, originalPixelWidth: 1, originalPixelHeight: 1,
      cropOffset: { x: 30, y: 60 }, displayScale: 1.5, desktopRect: { x: 20, y: 40, width: 1, height: 1 }, selection: { x: 0, y: 0, width: 1, height: 1 } },
    ...overrides,
  };
}
const answer = { explanation: 'Subtract 2 from both sides.', annotations: [], warnings: [] };
const config = readConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-placeholder-only' });
const servers: Server[] = [];
async function start(options: AppOptions = {}) {
  const app = createApp({ config, provider:async()=>({result:answer}), logger: vi.fn(), ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  servers.push(server);
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  return {
    url,
    post: (body: unknown = request(), headers: Record<string, string> = {}) =>
      fetch(url + '/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
  };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});
function upstream(result: unknown = answer, extra: object = {}) {
  return new Response(JSON.stringify({
    status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
    usage: { input_tokens: 1000, output_tokens: 100 }, ...extra,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('backend provider boundaries', () => {
  it('rejects unsupported providers and keeps mock credentials empty', () => {
    for(const provider of ['anthropic','unknown'])expect(()=>readConfig({AI_PROVIDER:provider})).toThrow('AI_PROVIDER must be openai or mock');
    const mock=readConfig({AI_PROVIDER:'mock',OPENAI_API_KEY:'test-placeholder-only'});
    expect(mock.apiKey).toBe('');expect(providerStatus(mock)).toMatchObject({provider:'mock',configured:true});
  });
  it('defaults to real OpenAI and exposes actionable missing credentials without a network call', async () => {
    const missing = readConfig({});
    expect(missing.provider).toBe('openai');
    expect(providerStatus(missing)).toMatchObject({ configured: false, provider: 'openai' });
    expect(providerStatus(missing).message).toContain('OPENAI_API_KEY');
    const fetcher = vi.fn();
    const app = await start({ config: missing, provider: createProvider(missing, fetcher) });
    const response = await app.post();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'MISSING_CREDENTIALS' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends the exact image and own context to Responses using strict JSON, high detail, and store:false', async () => {
    const fetcher = vi.fn().mockResolvedValue(upstream());
    const provider = createProvider(config, fetcher);
    const result = await provider(request(), new AbortController().signal);
    expect(result.result).toEqual(answer);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ store: false, model: 'gpt-4.1-mini', max_output_tokens: 1800 });
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body).not.toHaveProperty('reasoning');
    expect(body.text).not.toHaveProperty('verbosity');
    expect(body.input[0].content[1]).toEqual({ type: 'input_image', image_url: png, detail: 'high' });
    expect(body.instructions).toContain('untrusted study material');
    expect(body.instructions).toContain('hint mode');
    expect(body.previous_response_id).toBeUndefined();
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 100 });
  });

  it('uses the configured gpt-6-luna model without changing the image/structured-output contract',async()=>{
    const luna=readConfig({AI_PROVIDER:'openai',OPENAI_MODEL:'gpt-6-luna',OPENAI_API_KEY:'test-only-not-a-real-key'});
    const fetcher=vi.fn().mockResolvedValue(upstream());
    await createProvider(luna,fetcher)(request(),new AbortController().signal);
    const body=JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-6-luna');
    expect(body).not.toHaveProperty('reasoning');
    expect(body.text).not.toHaveProperty('verbosity');
    expect(body.text.format.strict).toBe(true);
    expect(body.input[0].content.filter((part:{type:string})=>part.type==='input_image')).toHaveLength(1);
    expect(providerStatus(luna)).not.toHaveProperty('apiKey');
  });

  it('sends explicitly configured reasoning and verbosity without changing streaming or strict output', async () => {
    const tuned = readConfig({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-6-luna', OPENAI_API_KEY: 'test-only-not-a-real-key',
      OPENAI_REASONING_EFFORT: ' low ', OPENAI_VERBOSITY: ' low ' });
    const fetcher = vi.fn().mockResolvedValue(upstream());
    await createProvider(tuned, fetcher)(request({ kind: 'chat' }), new AbortController().signal, vi.fn());
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: 'gpt-6-luna', stream: true, store: false, reasoning: { effort: 'low' },
      text: { verbosity: 'low', format: { type: 'json_schema', strict: true } } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('allows explicit none effort and omits blank verbosity independently', async () => {
    const tuned = readConfig({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-6-luna', OPENAI_API_KEY: 'test-only-not-a-real-key',
      OPENAI_REASONING_EFFORT: 'none', OPENAI_VERBOSITY: ' ' });
    const fetcher = vi.fn().mockResolvedValue(upstream());
    await createProvider(tuned, fetcher)(request(), new AbortController().signal);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(body.text).not.toHaveProperty('verbosity');
    expect(body).not.toHaveProperty('stream');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid optional model controls and treats blanks as unset', () => {
    for (const name of ['OPENAI_REASONING_EFFORT', 'OPENAI_VERBOSITY']) {
      for (const value of ['invalid', 'LOW', '0']) expect(() => readConfig({ [name]: value })).toThrow(name);
    }
    expect(() => readConfig({ OPENAI_VERBOSITY: 'none' })).toThrow('OPENAI_VERBOSITY');
    expect(readConfig({ OPENAI_REASONING_EFFORT: ' ', OPENAI_VERBOSITY: '' })).toMatchObject({ reasoningEffort: undefined, verbosity: undefined });
  });

  it('keeps one full image plus focus metadata and accepts a text-only concept',async()=>{
    const model={...answer,annotations:[{id:'uncertain',kind:'explanation',concept:'Small symbol',explanation:'The symbol is too small to locate confidently.',target:null}]};
    const fetcher=vi.fn().mockResolvedValue(upstream(model));
    const full=request();full.image.selection={x:.2,y:.3,width:.1,height:.2};
    const result=await createProvider(config,fetcher)(full,new AbortController().signal);
    const body=JSON.parse(fetcher.mock.calls[0][1].body),parts=body.input[0].content;
    expect(parts.filter((part:{type:string})=>part.type==='input_image')).toEqual([{type:'input_image',image_url:full.image.dataUrl,detail:'high'}]);
    const context=JSON.parse(parts[0].text.split('\n')[0]);
    expect(context.suppliedImage.selection).toEqual(full.image.selection);expect(context.annotationScope).toBe('focus-only');
    expect(result.result.annotations[0].target).toBeNull();
  });

  it('estimates cost only from explicitly configured prices and actual usage', async () => {
    const provider = createProvider({ ...config, inputUSDPerMillion: 2, outputUSDPerMillion: 8 }, vi.fn().mockResolvedValue(upstream()));
    const result = await provider(request(), new AbortController().signal);
    expect(result.usage?.estimatedCostUSD).toBeCloseTo(0.0028);
    const partial = createProvider({ ...config, inputUSDPerMillion: 2 }, vi.fn().mockResolvedValue(upstream()));
    expect((await partial(request(), new AbortController().signal)).usage?.estimatedCostUSD).toBeUndefined();
  });

  it('records returned token usage even when the answer is incomplete', async()=>{
    const usage=vi.fn();
    const provider=createProvider(config,vi.fn().mockResolvedValue(upstream(answer,{status:'incomplete'})),usage);
    await expect(provider(request(),new AbortController().signal)).rejects.toThrow('did not finish');
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({requestId:'request-1'}),{inputTokens:1000,outputTokens:100});
  });

  it.each([401, 429, 500])('fails cleanly on upstream HTTP %s without demo substitution or upstream data disclosure', async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response('PRIVATE upstream request body', { status }));
    const app = await start({ provider: createProvider(config, fetcher) });
    const response = await app.post();
    expect(response.status).toBe(status === 429 ? 429 : 502);
    const body = await response.text();
    expect(body).not.toContain('PRIVATE');
    expect(body).not.toContain('annotations');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON, incomplete output, refusal, and invalid model coordinates', async () => {
    const malformed = new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{not-json' }] }] }));
    const refused = new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }));
    for (const response of [malformed, refused, upstream(answer, { status: 'incomplete' })]) {
      await expect(createProvider(config, vi.fn().mockResolvedValue(response))(request(), new AbortController().signal)).rejects.toThrow();
    }
    const marker = { id: 'a', kind: 'circle', concept: 'Equation', explanation: 'A visible equation', target: { x: .9, y: 0, width: .2, height: .2 } };
    expect(() => validateModelOutput({ ...answer, annotations: [marker] }, 'explain')).toThrow('invalid annotations');
    marker.target.x = .2;
    expect(() => validateModelOutput({ ...answer, annotations: [marker, marker] }, 'explain')).toThrow();
    expect(() => validateModelOutput({ ...answer, annotations: [marker] }, 'chat')).toThrow();
    expect(() => validateModelOutput({ ...answer, annotations: [{ ...marker, id: 'unsafe:composed:id' }] }, 'explain')).toThrow();
  });

  it('allows text-only uncertain answers without inventing annotations', async () => {
    const textOnly = { explanation: 'The denominator is unreadable. Please capture the equation more closely.', annotations: [], warnings: ['Unclear denominator'] };
    const result = await createProvider(config, vi.fn().mockResolvedValue(upstream(textOnly)))(request(), new AbortController().signal);
    expect(result.result).toEqual(textOnly);
  });

  it('uses mock only when explicitly configured and clearly labels all responses', async () => {
    const mockConfig = readConfig({ AI_PROVIDER: 'mock' });
    const fetcher = vi.fn();
    const provider = createProvider(mockConfig, fetcher);
    expect((await provider(request(), new AbortController().signal)).result.explanation).toContain('Demo content');
    expect((await provider(request({ kind: 'chat' }), new AbortController().signal)).result.annotations).toEqual([]);
    expect(mockTutor(request())).toEqual(mockTutor(request()));
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('bounded and isolated server context', () => {
  it('uses the referenced snapshot and branch history without unrelated conversations', () => {
    const annotation = { id: 'branch-a', kind: 'circle' as const, concept: 'Original denominator', explanation: 'Fixed explanation', target: { x: .1, y: .2, width: .2, height: .2 } };
    const branch = request({ kind: 'chat', originalQuestion: 'Original question', originalExplanation: 'Original explanation', annotation,
      history: [{ role: 'user', content: 'Only my branch question' }, { role: 'assistant', content: 'Only my branch answer' }] });
    const context = buildTutorContext(branch, 24000);
    expect(context).toContain('capture-original');
    expect(context).toContain('Original question');
    expect(context).toContain('Fixed explanation');
    expect(context).toContain('Only my branch answer');
    expect(context).not.toContain('newer-capture');
    expect(context).not.toContain('unrelated branch');
    const second = buildTutorContext(request({ kind: 'chat', history: [{ role: 'user', content: 'Another branch only' }] }), 24000);
    expect(second).not.toContain('Only my branch answer');
    expect(second).not.toContain('Original denominator');
  });

  it('bounds the actual serialized context, preserving current question and recent history', () => {
    const context = buildTutorContext(request({
      kind: 'chat', originalExplanation: '"\\'.repeat(8000),
      history: Array.from({ length: 12 }, (_, i) => ({ role: 'user' as const, content: ('Message ' + i + ': ') + 'x'.repeat(3000) })),
      question: 'CURRENT QUESTION',
    }), 10000);
    expect(context.length).toBeLessThanOrEqual(10000);
    expect(context).toContain('CURRENT QUESTION');
    expect(context).toContain('Message 11:');
    expect(context).not.toContain('Message 0:');
  });

  it('rejects mismatched capture identities and unexpected unrelated branch fields', () => {
    expect(tutorRequestSchema.safeParse(request({ captureId: 'newer-capture' })).success).toBe(false);
    expect(tutorRequestSchema.safeParse({ ...request(), unrelatedBranches: [] }).success).toBe(false);
    expect(tutorRequestSchema.safeParse(request({ history: [{ role: 'user', content: 'Old chat on initial explanation' }] })).success).toBe(false);
  });
});

describe('local HTTP limits and failures', () => {
  it('exposes provider status while rejecting browser origins and non-local hostnames', async () => {
    const app = await start();
    expect(await (await fetch(app.url + '/health')).json()).toMatchObject({ provider: 'openai', configured: true });
    expect((await app.post(request(), { Origin: 'https://attacker.example' })).status).toBe(403);
    const status=await new Promise<number|undefined>((resolve,reject)=>{
      const req=httpRequest(app.url+'/api/tutor',{method:'POST',headers:{Host:'attacker.example','Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end(JSON.stringify(request()));
    });
    expect(status).toBe(403);
  });

  it('rejects incorrect actual PNG dimensions and malformed captures before provider use', async () => {
    const provider = vi.fn();
    const app = await start({ provider });
    const invalid = request();
    invalid.image.pixelWidth = 2;
    invalid.image.originalPixelWidth = 2;
    expect((await app.post(invalid)).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
    expect(() => validateImage({ ...request().image, dataUrl: 'data:image/png;base64,YWJj' })).toThrow('PNG');
  });

  it('returns 413 for oversized request bodies and 400 for invalid JSON', async () => {
    const provider = vi.fn();
    const app = await start({ provider, bodyLimit: '1kb' });
    expect((await app.post(request({ question: 'x'.repeat(1500) }))).status).toBe(413);
    const response = await fetch(app.url + '/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad-json' });
    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });

  it('applies a bounded rate window and recovers after the window ends', async () => {
    let now = 0;
    const app = await start({ config: { ...config, rateLimitPerMinute: 1 }, now: () => now, provider: async () => ({ result: answer }) });
    expect((await app.post()).status).toBe(200);
    const rejected = await app.post(request({ requestId: 'request-2' }));
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get('Retry-After')).toBe('60');
    now = 60001;
    expect((await app.post(request({ requestId: 'request-3' }))).status).toBe(200);
  });

  it('rejects duplicate in-flight and completed requests', async () => {
    let resolve!: (value: { result: typeof answer }) => void;
    let started!: () => void;
    const ready = new Promise<void>(r => { started = r; });
    const provider = vi.fn(() => { started(); return new Promise<{ result: typeof answer }>(r => { resolve = r; }); });
    const app = await start({ provider });
    const first = app.post();
    await ready;
    expect((await app.post()).status).toBe(409);
    resolve({ result: answer });
    expect((await first).status).toBe(200);
    expect((await app.post()).status).toBe(409);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('times out provider requests and aborts the upstream signal', async () => {
    let upstreamSignal: AbortSignal | undefined;
    const provider: TutorProvider = (_request, signal) => {
      upstreamSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    };
    const app = await start({ config: { ...config, timeoutMs: 30 }, provider });
    expect((await app.post()).status).toBe(504);
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it('aborts upstream when the desktop cancels its HTTP request', async () => {
    let started!: () => void;
    let aborted!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const cancellation = new Promise<void>(resolve => { aborted = resolve; });
    const provider: TutorProvider = (_request, signal) => new Promise((_resolve, reject) => {
      started();
      signal.addEventListener('abort', () => { aborted(); reject(new Error('cancelled')); });
    });
    const app = await start({ provider });
    const controller = new AbortController();
    const pending = fetch(app.url + '/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request()), signal: controller.signal });
    await ready;
    controller.abort();
    await expect(pending).rejects.toThrow();
    await cancellation;
  });

  it('validates injected provider output and logs only IDs/provider/usage', async () => {
    const logs = vi.fn();
    const provider = vi.fn().mockResolvedValue({ result: answer, usage: { inputTokens: 37, outputTokens: 11 } });
    const app = await start({ provider, logger: logs });
    expect((await app.post()).status).toBe(200);
    const output = JSON.stringify(logs.mock.calls);
    expect(output).toContain('inputTokens');
    expect(output).not.toContain('What does this equation mean');
    expect(output).not.toContain('data:image');
    expect(output).not.toContain(config.apiKey);
    provider.mockResolvedValue({ result: { ...answer, annotations: [{ id: 'bad' }] } });
    const invalid = await app.post(request({ requestId: 'request-2' }));
    expect(invalid.status).toBe(502);
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_MODEL_OUTPUT' });
  });
});
