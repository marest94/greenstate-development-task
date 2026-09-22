const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function parsePriceCents(input: string): number | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a price with no more than two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > 2147483647n) throw new Error('Enter a price up to €21,474,836.47.');
  return Number(cents);
}
export function priceInput(cents: number | undefined): string {
  return cents === undefined ? '' : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
export const formatMoney = (cents: number): string => money.format(cents / 100);
export const formatRating = (rating: number | null): string => rating === null ? 'Unrated' : rating.toFixed(1);
export const formatDate = (date: string): string => longDate.format(new Date(`${date}T12:00:00Z`));
export const formatMonth = (month: string): string => longMonth.format(new Date(`${month}-15T12:00:00Z`));
export function shiftMonth(month: string, offset: number): string {
  const date = new Date(`${month}-15T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
export const monthRange = (month: string): { from: string; to: string } => ({ from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` });
export function currentBusinessDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export const countryName = (country: string): string => new Intl.DisplayNames(['en'], { type: 'region' }).of(country) ?? country;
