import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export type RequestLog = Record<string, string | number>;
export const requestMetadata = (log: (record: RequestLog) => void): RequestHandler => (req, res, next) => {
  const started = performance.now();
  // Generate locally: caller-controlled identifiers never enter logs.
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.once('finish', () => log({
    requestId, method: req.method, path: req.path,
    status: res.statusCode, durationMs: Math.round(performance.now() - started),
  }));
  next();
};
