import type { RequestHandler } from 'express';

// Requests are loopback; a global window also limits local process churn.
export function createUsageLimits(maxRequests: number, now = Date.now): RequestHandler {
  let resetAt = now() + 60_000;
  let count = 0;
  return (_req, res, next) => {
    const time = now();
    if (time >= resetAt) { resetAt = time + 60_000; count = 0; }
    if (count >= maxRequests) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((resetAt - time) / 1000)));
      res.status(429).json({ code: 'RATE_LIMIT', error: 'Local request limit reached. Wait one minute and retry.' });
      return;
    }
    count += 1;
    next();
  };
}
