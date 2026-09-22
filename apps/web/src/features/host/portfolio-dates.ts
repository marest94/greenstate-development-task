import { IsoDateSchema } from '@greenstate/contracts';
export function offsetDate(value: string, offset: number): string | null {
  if (!IsoDateSchema.safeParse(value).success || !Number.isSafeInteger(offset)) return null;
  const result = new Date(Date.parse(`${value}T00:00:00Z`) + offset * 86400000);
  if (!Number.isFinite(result.getTime())) return null;
  const next = result.toISOString().slice(0, 10);
  return IsoDateSchema.safeParse(next).success ? next : null;
}
