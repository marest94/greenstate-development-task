import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateRangeField } from './DateRangeField';
import { MonthCalendar } from './MonthCalendar';
import { Pagination } from './Pagination';

describe('controlled date range', () => {
  it.each([['Check-in', { from: null, to: '2026-10-04' }], ['Checkout', { from: '2026-10-01', to: null }]])('emits clearing %s without losing the other value', (label, expected) => {
    const onChange = vi.fn();
    const { rerender } = render(<DateRangeField value={{ from: '2026-10-01', to: '2026-10-04' }} today="2026-09-22" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expected);
    rerender(<DateRangeField value={{ from: '2026-11-01', to: '2026-11-04' }} today="2026-09-22" onChange={onChange} />);
    expect(screen.getByLabelText('Check-in')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Checkout')).toHaveValue('2026-11-04');
    expect(screen.getByLabelText('Check-in')).toHaveAttribute('min', '2026-09-22');
  });
  it('exposes the two native date inputs in keyboard order', async () => {
    render(<DateRangeField value={{ from: null, to: null }} today="2026-09-22" onChange={() => {}} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByLabelText('Check-in')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Checkout')).toHaveFocus();
  });
});

describe('availability calendar', () => {
  it('shows a single selected arrival date and resynchronizes a changed selection', () => {
    const days = [{ date: '2028-02-28', available: true }, { date: '2028-02-29', available: true }];
    const { rerender } = render(<MonthCalendar month="2028-02" today="2028-02-20" days={days} selection={{ from: '2028-02-28', to: null }} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: '28 February 2028, available' })).toHaveAttribute('aria-pressed', 'true');
    rerender(<MonthCalendar month="2028-02" today="2028-02-20" days={days} selection={{ from: '2028-02-29', to: null }} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: '28 February 2028, available' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '29 February 2028, available' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('includes leap day, marks availability in text, and never treats missing dates as free', () => {
    render(<MonthCalendar month="2028-02" today="2028-02-20" days={[{ date: '2028-02-29', available: true }, { date: '2028-02-28', available: false }]} />);
    const calendar = screen.getByRole('table', { name: 'February 2028' });
    expect(within(calendar).getByLabelText('29 February 2028, available')).toBeVisible();
    expect(within(calendar).getByLabelText('28 February 2028, unavailable')).toBeVisible();
    expect(within(calendar).getByLabelText('27 February 2028, loading')).toBeVisible();
    expect(within(calendar).queryByText('30')).not.toBeInTheDocument();
  });
  it('shows unfetched days as loading and prevents past or occupied dates being selected', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<MonthCalendar month="2028-02" today="2028-02-28" days={undefined} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: '29 February 2028, loading' })).toBeDisabled();
    rerender(<MonthCalendar month="2028-02" today="2028-02-28" days={[{ date: '2028-02-27', available: true }, { date: '2028-02-28', available: false }, { date: '2028-02-29', available: true }]} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: '27 February 2028, available, past' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '28 February 2028, unavailable, today' })).toBeDisabled();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: '29 February 2028, available' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('2028-02-29');
  });
});
it('pagination keeps boundaries disabled and supports keyboard activation', async () => {
  const onChange = vi.fn();
  render(<Pagination page={1} pageSize={20} total={41} onChange={onChange} />);
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(screen.getByText('Page 1 of 3')).toBeVisible();
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard('{Enter}');
  expect(onChange).toHaveBeenCalledWith(2);
});
