import { useId } from 'react';
import type { Availability } from '@greenstate/contracts';
import { formatDate, formatMonth } from '../lib/format';
import type { DateRangeValue } from './DateRangeField';

type Props = {
  month: string;
  today: string;
  days: Availability['days'] | undefined;
  selection?: DateRangeValue;
  onSelect?: (date: string) => void;
};
export function MonthCalendar({ month, today, days, selection, onSelect }: Props) {
  const heading = useId();
  const start = new Date(`${month}-01T12:00:00Z`);
  const offset = (start.getUTCDay() + 6) % 7;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const dayCount = end.getUTCDate();
  const availability = new Map(days?.map(day => [day.date, day.available]));
  const cells = Array.from({ length: Math.ceil((offset + dayCount) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > dayCount) return <td key={index} />;
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const available = availability.get(date);
    const status = available === undefined ? 'loading' : available ? 'available' : 'unavailable';
    const past = date < today;
    const selected = !!selection?.from && (date === selection.from || (!!selection.to && date > selection.from && date < selection.to));
    const label = `${formatDate(date)}, ${status}${past ? ', past' : date === today ? ', today' : ''}`;
    const content = <><span>{day}</span><small aria-hidden="true">{available === undefined ? '…' : available ? 'Free' : 'Busy'}</small></>;
    return <td key={date} className={`calendar-day calendar-day--${status}${past ? ' calendar-day--past' : ''}${selected ? ' calendar-day--selected' : ''}`}>
      {onSelect ? <button type="button" aria-label={label} aria-pressed={selected} disabled={past || available !== true} onClick={() => onSelect(date)}>{content}</button> : <span aria-label={label} aria-current={date === today ? 'date' : undefined}>{content}</span>}
    </td>;
  });
  return <section className="month-calendar">
    <h3 id={heading}>{formatMonth(month)}</h3>
    <table aria-labelledby={heading}>
      <thead><tr>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => <th key={day} scope="col" abbr={day}>{day.slice(0, 2)}</th>)}</tr></thead>
      <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week}>{cells.slice(week * 7, week * 7 + 7)}</tr>)}</tbody>
    </table>
  </section>;
}
