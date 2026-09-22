import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import type { ListingDto } from '@greenstate/contracts';
import { SearchMap } from './SearchMap';

it('retains the selected marker after a background refresh changes the listing price', async () => {
  const listing: ListingDto = { id: '11111111-1111-4111-8111-111111111111', title: 'Berlin apartment', city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.405, propertyType: 'apartment', maxGuests: 2, bedrooms: 1, pricePerNightCents: 10000, currency: 'EUR', rating: null, reviewCount: 0, createdAt: '2026-01-01' };
  const onSelect = vi.fn();
  const view = (items: ListingDto[]) => <MemoryRouter><SearchMap listings={items} total={1} page={1} slug="greenstate" selectedId={listing.id} selectionRevision={1} onSelect={onSelect} /></MemoryRouter>;
  const { rerender } = render(view([listing]));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Show Berlin apartment on map' })).toHaveAttribute('aria-pressed', 'true'));
  rerender(view([{ ...listing, pricePerNightCents: 12000 }]));
  await waitFor(() => {
    const pin = screen.getByRole('button', { name: 'Show Berlin apartment on map' });
    expect(pin).toHaveTextContent('€120.00');
    expect(pin).toHaveAttribute('aria-pressed', 'true');
  });
});
