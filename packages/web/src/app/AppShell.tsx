/**
 * Layout around every page: skip link, top bar, the routed page, and the live region.
 */
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { LiveAnnouncer } from './LiveAnnouncer';
import { TopBar } from './TopBar';

export function AppShell() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-bg text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {t('app.skipToContent')}
      </a>
      <TopBar />
      <main id="main" tabIndex={-1} className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <LiveAnnouncer />
    </div>
  );
}
