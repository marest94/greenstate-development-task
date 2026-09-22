import type { z } from 'zod';
import { AppError } from './errors.js';

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'request';
    (fields[key] ??= []).push(issue.message);
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'Please check the highlighted fields.', fields);
}
