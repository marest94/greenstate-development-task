import { useId } from 'react';
export type DateRangeValue = { from: string | null; to: string | null };
export function DateRangeField({ value, today, onChange }: { value: DateRangeValue; today: string; onChange: (value: DateRangeValue) => void }) {
  const id = useId();
  return <div className="date-range-fields">
    <label htmlFor={`${id}-from`}>Check-in<input id={`${id}-from`} name="from" type="date" min={today} value={value.from ?? ''} onChange={event => onChange({ ...value, from: event.target.value || null })} /></label>
    <label htmlFor={`${id}-to`}>Checkout<input id={`${id}-to`} name="to" type="date" min={value.from && value.from > today ? value.from : today} value={value.to ?? ''} onChange={event => onChange({ ...value, to: event.target.value || null })} /></label>
  </div>;
}
