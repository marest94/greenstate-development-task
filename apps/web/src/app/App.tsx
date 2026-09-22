import { useEffect, useState } from 'react';
import { HealthResponseSchema } from '@greenstate/contracts';

export function App() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health/live', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable');
        HealthResponseSchema.parse(await response.json());
        if (!controller.signal.aborted) setStatus('ok');
      })
      .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, []);
  return <main className="welcome">
    <a className="wordmark" href="/">GREENSTATE <span>STAYS</span></a>
    <section className="welcome-card">
      <p className="eyebrow">A PLACE TO FEEL AT HOME</p>
      <h1>Your next stay<br />starts here.</h1>
      <p className="intro">Comfortable spaces. New surroundings. Room to make yourself at home.</p>
      <nav className="welcome-portals" aria-label="Choose a portal"><a href="/greenstate">GreenState Stays</a><a href="/citystays">City Stays</a><a href="/admin">Platform administration</a></nav>
      <p className={`connection connection--${status}`} role={status === 'error' ? 'alert' : 'status'}>
        <span className="status-dot" aria-hidden="true" />
        {status === 'loading' ? 'Connecting to the rental service…' : status === 'ok' ? 'Connected to the rental service' : 'The rental service is currently unavailable'}
      </p>
    </section>
    <footer>GreenState accommodation rental</footer>
  </main>;
}
