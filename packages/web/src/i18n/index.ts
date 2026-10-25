// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Translation set-up. English is the only language so far; every user-visible string lives in
 * `src/locales/en.json`, so adding a language means adding one JSON file and one entry below.
 *
 * Resources are bundled (no network loading), so `t()` works synchronously from the first render,
 * in the browser and in tests alike.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';

export const defaultNS = 'translation';
export const resources = { en: { translation: en } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS,
  initAsync: false,
  // React escapes text itself.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
