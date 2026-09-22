import { DateRangeSchema, IsoDateSchema, type DateRange } from '@greenstate/contracts';
export type { DateRange } from '@greenstate/contracts';
const DAY_MS = 86_400_000;
export const isValidDate = (value: string): boolean => IsoDateSchema.safeParse(value).success;
export function toDbDate(value: string): Date {
  return new Date(`${IsoDateSchema.parse(value)}T00:00:00.000Z`);
}
export function fromDbDate(value: Date): string {
  return IsoDateSchema.parse(value.toISOString().slice(0, 10));
}
export function addDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError('The day offset must be an integer.');
  return fromDbDate(new Date(toDbDate(value).getTime() + days * DAY_MS));
}
export function eachDay(range: DateRange): string[] {
  IsoDateSchema.parse(range.from); IsoDateSchema.parse(range.to);
  if (range.from === range.to) return [];
  DateRangeSchema.parse(range);
  const days: string[] = [];
  for (let day = range.from; day < range.to; day = addDays(day, 1)) days.push(day);
  return days;
}
export function todayIn(timezone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (part: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === part)!.value;
  return IsoDateSchema.parse(`${value('year')}-${value('month')}-${value('day')}`);
}
