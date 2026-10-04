/**
 * App shell: routing, top bar, stack status strip and theme choice.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { CHECKED_AT } from './fixtures/roles';
import { api, stackHandler } from './msw/handlers';
import { server } from './msw/server';
import { renderApp } from './render';

describe('routing', () => {
  it.each([
    ['/runs', 'Runs'],
    ['/matrix', 'Compatibility matrix'],
    ['/gaps', 'Interoperability gaps'],
    ['/about', 'About the playground'],
    ['/no-such-page', 'Page not found'],
  ])('%s shows the page "%s" and titles the tab', async (route, title) => {
    renderApp(route);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe(`${title} · Inji Interoperability Playground`));
  });

  it('marks the current page in the navigation and moves between pages', async () => {
    const { user, router } = renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Playground' })).toHaveAttribute('aria-current', 'page');

    await user.click(within(nav).getByRole('link', { name: 'About' }));
    expect(router.state.location.pathname).toBe('/about');
    expect(within(nav).getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
  });

  it('lists every registered role with its version on the about page', async () => {
    renderApp('/about');
    const table = await screen.findByRole('table', { name: 'Implementations registered on this server' });
    const row = within(table).getByRole('row', { name: /Inji Verify \(API\)/ });
    expect(row).toHaveTextContent('Verifier');
    expect(row).toHaveTextContent('Inji');
    expect(row).toHaveTextContent('0.18.2');
    expect(await screen.findByText('Playground server version: 0.1.0')).toBeInTheDocument();
  });

  it('offers a skip link to the main content', () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});

describe('status strip', () => {
  it('says when the Inji stack is not configured', async () => {
    renderApp('/');
    const strip = screen.getByRole('region', { name: 'Service status' });
    expect(await within(strip).findByText('Playground server 0.1.0')).toBeInTheDocument();
    expect(
      await within(strip).findByText('Inji stack not configured: reference roles only'),
    ).toBeInTheDocument();
  });

  it('shows one chip per Inji service with its status as a word', async () => {
    server.use(
      stackHandler({
        mode: 'host',
        checkedAt: CHECKED_AT,
        services: [
          { name: 'certify', health: { status: 'up', checkedAt: CHECKED_AT } },
          {
            name: 'verify-service',
            health: { status: 'down', checkedAt: CHECKED_AT, detail: 'connection refused' },
          },
        ],
      }),
    );
    renderApp('/');
    const strip = screen.getByRole('region', { name: 'Service status' });
    const certify = (await within(strip).findByText('certify')).closest('li')!;
    expect(certify).toHaveTextContent('Healthy');
    const verify = within(strip).getByText('verify-service').closest('li')!;
    expect(verify).toHaveTextContent('Down · connection refused');
  });

  it('reports an unreachable server', async () => {
    server.use(
      http.get(api('/api/health'), () => HttpResponse.json({ message: 'gateway down' }, { status: 502 })),
    );
    renderApp('/');
    expect(await screen.findByText('Playground server unreachable: gateway down')).toBeInTheDocument();
  });

  it('reports the live-update connection', () => {
    renderApp('/');
    expect(screen.getByText('Live updates: not connected yet')).toBeInTheDocument();
  });
});

describe('theme', () => {
  it('switches to the dark theme and remembers the choice', async () => {
    const { user } = renderApp('/');
    await user.selectOptions(screen.getByLabelText('Theme'), 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('inji-playground.theme')).toBe('dark');

    await user.selectOptions(screen.getByLabelText('Theme'), 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
