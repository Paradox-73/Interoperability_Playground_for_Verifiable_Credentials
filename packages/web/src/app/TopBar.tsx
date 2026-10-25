// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Top bar: product name, mode badge, navigation, theme choice, and the status strip of the server,
 * the Inji stack and the live-update connection.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { useCombination } from '../features/selector/use-combination';
import { usePlaygroundStore } from '../state/playground';
import { THEME_PREFERENCES, useThemePreference } from '../theme/theme';
import { StackStatusStrip } from './StackStatusStrip';

const NAV = [
  { to: '/', key: 'playground', end: true },
  { to: '/runs', key: 'runs', end: false },
  { to: '/matrix', key: 'matrix', end: false },
  { to: '/gaps', key: 'gaps', end: false },
  { to: '/about', key: 'about', end: false },
] as const;

export type DisplayMode = 'live' | 'reference' | 'playback';

/** Live when an Inji module takes part in the selected combination (the protocol's RunMode rule). */
export function useDisplayMode(): DisplayMode {
  const playback = usePlaygroundStore((state) => state.playback);
  const { triple } = useCombination();
  if (playback) return 'playback';
  const roles = [triple.issuer, triple.wallet, triple.verifier];
  return roles.some((role) => role?.ecosystem === 'inji') ? 'live' : 'reference';
}

function ModeBadge() {
  const { t } = useTranslation();
  const mode = useDisplayMode();
  const style = {
    live: 'border-accent text-accent',
    reference: 'border-line-strong text-fg',
    playback: 'border-warn text-warn',
  }[mode];
  return (
    <p className={`rounded-full border px-2.5 py-0.5 text-sm ${style}`} data-testid="mode-badge">
      <span className="text-fg-muted">{t('mode.label')}: </span>
      <strong>{t(`mode.${mode}`)}</strong>
      <span className="sr-only"> ({t(`mode.${mode}Hint`)})</span>
    </p>
  );
}

function ThemeSelect() {
  const { t } = useTranslation();
  const [preference, setPreference] = useThemePreference();
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id}>{t('theme.label')}</label>
      <select
        id={id}
        value={preference}
        onChange={(event) => {
          const next = THEME_PREFERENCES.find((p) => p === event.target.value);
          if (next) setPreference(next);
        }}
        className="rounded-md border border-line-strong bg-surface px-2 py-1 text-fg"
      >
        {THEME_PREFERENCES.map((p) => (
          <option key={p} value={p}>
            {t(`theme.${p}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link to="/" className="text-lg font-semibold text-fg">
          {t('app.name')}
        </Link>
        <ModeBadge />
        <nav aria-label={t('app.nav.label')} className="flex-1">
          <ul className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-accent-soft font-semibold text-fg' : 'text-fg hover:bg-surface-muted'}`
                  }
                >
                  {t(`app.nav.${item.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <ThemeSelect />
      </div>
      <StackStatusStrip />
    </header>
  );
}
