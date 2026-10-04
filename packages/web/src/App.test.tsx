import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App skeleton', () => {
  it('shows the issuer, wallet and verifier columns in order', () => {
    stubFetch(new Error('offline'));
    render(<App />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['1. Issuer', '2. Wallet', '3. Verifier']);
  });

  it('announces the server version when /api/health answers', async () => {
    const fetchMock = stubFetch(
      Response.json({
        status: 'ok',
        service: 'inji-interop-playground',
        version: '0.1.0',
        uptimeSeconds: 3,
        time: new Date().toISOString(),
      }),
    );
    render(<App />);
    expect(await screen.findByText('Server 0.1.0 is up')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('says the server is unreachable when the request fails', async () => {
    stubFetch(new Error('connection refused'));
    render(<App />);
    expect(await screen.findByRole('status')).toHaveTextContent('Server unreachable: connection refused');
  });
});
