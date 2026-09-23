import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ErrorRequestHandler, Request, Response } from 'express';
import type { ApiError } from '@greenstate/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { requestLogContext, type RequestLog } from './request-id.js';

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

// Explicit codes only; never copy arbitrary properties, names, messages, stacks or causes.
const diagnosticDatabaseCodes = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2002', 'P2003', 'P2024', 'P2025', 'P2028', 'P2034']);
const diagnosticClasses = [
  [Prisma.PrismaClientKnownRequestError, 'PrismaClientKnownRequestError'],
  [Prisma.PrismaClientInitializationError, 'PrismaClientInitializationError'],
  [Prisma.PrismaClientUnknownRequestError, 'PrismaClientUnknownRequestError'],
  [Prisma.PrismaClientValidationError, 'PrismaClientValidationError'],
  [Prisma.PrismaClientRustPanicError, 'PrismaClientRustPanicError'],
  [AppError, 'AppError'], [HttpException, 'HttpException'],
  [TypeError, 'TypeError'], [RangeError, 'RangeError'], [ReferenceError, 'ReferenceError'],
  [SyntaxError, 'SyntaxError'], [URIError, 'URIError'], [EvalError, 'EvalError'], [Error, 'Error'],
] as const;
function diagnosticError(error: unknown): RequestLog {
  for (const [ErrorType, errorClass] of diagnosticClasses) {
    if (!(error instanceof ErrorType)) continue;
    const record: RequestLog = { errorClass };
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) {
      // Read a data property once, without invoking a potentially unsafe accessor.
      const code: unknown = Object.getOwnPropertyDescriptor(error, error instanceof Prisma.PrismaClientKnownRequestError ? 'code' : 'errorCode')?.value;
      if (typeof code === 'string' && diagnosticDatabaseCodes.has(code)) record.errorCode = code;
    }
    return record;
  }
  return { errorClass: 'UnknownThrownValue' };
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly log: (record: RequestLog) => void) {}
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500) this.log({
      event: 'api_error', requestId: res.locals.requestId,
      ...requestLogContext(http.getRequest<Request>()), status, ...diagnosticError(error),
    });
    if (error instanceof AppError) return sendError(res, error.getStatus(), error.code, error.message, error.fields);
    sendError(res, status);
  }
}
