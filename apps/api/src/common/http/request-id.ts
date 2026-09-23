import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

export type RequestLog = Record<string, string | number>;
export function requestLogContext(req: Request) {
  // Only the registered template is safe: both query and path values can contain credentials.
  const route: unknown = req.route?.path;
  return { method: req.method, path: typeof route === 'string' ? route : '[unmatched]' };
}
export const requestMetadata = (log: (record: RequestLog) => void): RequestHandler => (req, res, next) => {
  const started = performance.now();
  // Generate locally: caller-controlled identifiers never enter logs.
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.once('finish', () => log({
    requestId, ...requestLogContext(req),
    status: res.statusCode, durationMs: Math.round(performance.now() - started),
  }));
  next();
};
