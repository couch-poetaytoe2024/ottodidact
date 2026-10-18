import express, { type ErrorRequestHandler } from 'express';
import { MAX_IMAGE_BYTES, tutorRequestSchema, tutorResponseSchema, type ImageContext } from '../shared/ai';
import { createProvider, validateModelOutput, type TutorProvider } from './ai/client';
import { providerStatus, readConfig, type ServerConfig } from './config';
import { TutorError } from './errors';
import { createUsageLimits } from './middleware/usageLimits';

export function validateImage(image: ImageContext): void {
  const encoded = image.dataUrl.slice('data:image/png;base64,'.length);
  const png = Buffer.from(encoded, 'base64');
  if (png.length > MAX_IMAGE_BYTES) throw new TutorError(413, 'IMAGE_TOO_LARGE', 'Capture exceeds 8 MiB. Select a smaller region.');
  if (png.length < 33 || encoded !== png.toString('base64') ||
      !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR' ||
      png.readUInt32BE(16) !== image.pixelWidth || png.readUInt32BE(20) !== image.pixelHeight) {
    throw new TutorError(400, 'INVALID_IMAGE', 'Capture must be a PNG whose dimensions match its metadata. Take a new capture.');
  }
  if (image.pixelWidth > image.originalPixelWidth || image.pixelHeight > image.originalPixelHeight) {
    throw new TutorError(400, 'INVALID_IMAGE', 'Capture resize metadata is inconsistent. Take a new capture.');
  }
  // Integer resize rounding may produce a one-pixel difference on either edge.
  const crossDifference = Math.abs(image.originalPixelHeight * image.pixelWidth - image.originalPixelWidth * image.pixelHeight);
  if (crossDifference > image.originalPixelWidth + image.originalPixelHeight) throw new TutorError(400, 'INVALID_IMAGE', 'Capture dimensions must preserve the original aspect ratio.');
  if(image.detail){
    const d=image.detail;
    if(d.captureId!==image.captureId)throw new TutorError(400,'INVALID_IMAGE','Detail belongs to another snapshot.');
    validateImage({...image,detail:undefined,dataUrl:d.dataUrl,pixelWidth:d.pixelWidth,pixelHeight:d.pixelHeight,
      originalPixelWidth:Math.round(d.region.width*image.pixelWidth),originalPixelHeight:Math.round(d.region.height*image.pixelHeight)});
  }
}
export interface AppOptions {
  config?: ServerConfig;
  provider?: TutorProvider;
  logger?: (event: Record<string, unknown>) => void;
  now?: () => number;
  bodyLimit?: string;
}
export function createApp(options: AppOptions = {}) {
  const config = options.config ?? readConfig();
  const logger = options.logger ?? (event => console.log(JSON.stringify(event)));
  const provider = options.provider ?? createProvider(config, fetch, (request, usage, model=config.model) => {
    logger({ event: 'tutor_usage', requestId: request.requestId, provider: config.provider, model, ...usage });
  });
  const now = options.now ?? Date.now;
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // No browser CORS exception: the desktop main process is the sole HTTP client.
    if (req.headers.origin || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) {
      res.status(403).json({ code: 'LOCAL_ONLY', error: 'Only the local desktop application may access this backend.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/health', (_req, res) => { res.json(providerStatus(config)); });
  app.use('/api/tutor', createUsageLimits(config.rateLimitPerMinute, now));
  app.use(express.json({ limit: options.bodyLimit ?? '12mb', strict: true }));
  // IDs only, never image or conversation persistence. Failed IDs also stay used:
  // an upstream failure may have incurred cost; explicit retry uses a new ID.
  const seenRequests = new Map<string, { active: boolean; expires: number }>();
  app.post('/api/tutor', async (req, res) => {
    const started=performance.now();
    const parsed = tutorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ code: 'INVALID_REQUEST', error: 'Invalid tutor request. Capture IDs, image metadata, message lengths, and annotation coordinates must be valid.' });
      return;
    }
    const request = parsed.data;
    try { validateImage(request.image); }
    catch (error) {
      const safe = error as TutorError;
      res.status(safe.status).json({ code: safe.code, error: safe.message });
      return;
    }
    const imageReady=performance.now();
    for (const [id, entry] of seenRequests) if (!entry.active && entry.expires <= now()) seenRequests.delete(id);
    if (seenRequests.has(request.requestId)) {
      res.status(409).json({ code: 'DUPLICATE_REQUEST', error: 'This request was already submitted. Wait for it to finish, or use Retry for a new request.' });
      return;
    }
    seenRequests.set(request.requestId, { active: true, expires: now() + 15 * 60_000 });
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), config.timeoutMs);
    const disconnect = () => { if (!res.writableEnded) abort.abort(); };
    res.on('close', disconnect);
    let rejectOnAbort: () => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = () => reject(new TutorError(504, 'REQUEST_TIMEOUT', 'The request was cancelled or timed out. Retry when ready.'));
      abort.signal.addEventListener('abort', rejectOnAbort, { once: true });
    });
    const streaming=req.headers.accept==='text/event-stream';
    const emit=(value:unknown)=>{
      if(res.destroyed||res.writableEnded||abort.signal.aborted)return;
      if(!res.headersSent){res.setHeader('Content-Type','text/event-stream');res.flushHeaders();}
      res.write('data: '+JSON.stringify(value)+'\n\n');
    };
    try {
      const completion = await Promise.race([provider(request, abort.signal,streaming?text=>{
        if(typeof text==='string'&&text.length<=16000)emit({type:'progress',requestId:request.requestId,sessionId:request.sessionId,conversationId:request.conversationId,text});
      }:undefined), cancelled]);
      if (abort.signal.aborted) throw new TutorError(504, 'REQUEST_TIMEOUT', 'The request timed out. Retry with a smaller capture or shorter question.');
      const result = validateModelOutput(completion.result, request.kind);
      const payload = tutorResponseSchema.parse({
        requestId: request.requestId, sessionId: request.sessionId, captureId: request.captureId,
        conversationId: request.conversationId, provider: config.provider, model: completion.model??config.model,
        result, usage: completion.usage,
      });
      logger({ event: 'tutor_complete', requestId: request.requestId, provider: config.provider, model: payload.model,
        concepts:result.annotations.length,markings:result.annotations.reduce((n,a)=>n+Number(!!a.target)+(a.relatedTargets??[]).filter(t=>t.target).length,0),
        timings:{imageValidationMs:imageReady-started,totalMs:performance.now()-started,...completion.timings},
        ...(options.provider ? completion.usage : {}) });
      if (!res.destroyed){if(streaming){emit({type:'complete',response:payload});res.end();}else res.json(payload);}
    } catch (error) {
      const safe = abort.signal.aborted
        ? new TutorError(504, 'REQUEST_TIMEOUT', 'The request was cancelled or timed out. Retry when ready.')
        : error instanceof TutorError ? error : new TutorError(502, 'TUTOR_FAILED', 'The tutor request failed. Retry when ready; no demo answer was substituted.');
      logger({ event: 'tutor_error', requestId: request.requestId, provider: config.provider, code: safe.code,totalMs:performance.now()-started });
      if (!res.destroyed){
        if(res.headersSent){res.write('data: '+JSON.stringify({type:'error',code:safe.code,error:safe.message})+'\n\n');res.end();}
        else res.status(safe.status).json({ code: safe.code, error: safe.message });
      }
    } finally {
      clearTimeout(timeout);
      abort.signal.removeEventListener('abort', rejectOnAbort);
      res.off('close', disconnect);
      seenRequests.set(request.requestId, { active: false, expires: now() + 15 * 60_000 });
    }
  });
  const errors: ErrorRequestHandler = (error: { type?: string }, _req, res, _next) => {
    const tooLarge = error.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({ code: tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON', error: tooLarge ? 'Request exceeds 12 MiB. Select a smaller capture.' : 'Request body must be valid JSON.' });
  };
  app.use(errors);
  return app;
}
