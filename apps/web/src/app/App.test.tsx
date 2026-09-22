import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
describe('Application connection status', () => {
  it('shows the live API connection result', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    render(<App />);
    expect(await screen.findByText('Connected to the rental service')).toBeInTheDocument();
  });
  it('explains a failed connection without claiming the API is healthy', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The rental service is currently unavailable');
    expect(screen.queryByText('Connected to the rental service')).not.toBeInTheDocument();
  });
});
