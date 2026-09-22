import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ErrorRequestHandler, Response } from 'express';
import type { ApiError } from '@greenstate/contracts';

const errors: Record<number, [string, string]> = {
  400: ['INVALID_REQUEST', 'The request is invalid.'],
  401: ['AUTHENTICATION_REQUIRED', 'Please sign in to continue.'],
  403: ['ACCESS_DENIED', 'You do not have access to this action.'],
  404: ['RESOURCE_NOT_FOUND', 'The requested resource was not found.'],
  409: ['CONFLICT', 'The resource has changed. Please refresh and try again.'],
  413: ['PAYLOAD_TOO_LARGE', 'The request body is too large.'],
  429: ['RATE_LIMITED', 'Too many requests. Please try again later.'],
};
export class AppError extends HttpException {
  constructor(status: number, readonly code: string, message: string, readonly fields?: ApiError['fields']) {
    super(message, status);
  }
}
export function sendError(res: Response, status: number, code?: string, message?: string, fields?: ApiError['fields']) {
  const fallback = errors[status] ?? ['INTERNAL_ERROR', 'An unexpected error occurred.'];
  const body: ApiError = { status, code: code ?? fallback[0]!, message: message ?? fallback[1]!, requestId: res.locals.requestId };
  if (fields) body.fields = fields;
  res.status(status).json(body);
}
// Parser errors occur before Nest dispatches a controller.
export const parserErrors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
  if (type === 'entity.too.large') return sendError(res, 413);
  if (type === 'entity.parse.failed') return sendError(res, 400, 'INVALID_JSON', 'The request body must be valid JSON.');
  next(error);
};
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof AppError) return sendError(res, error.getStatus(), error.code, error.message, error.fields);
    sendError(res, error instanceof HttpException ? error.getStatus() : 500);
  }
}
