// Type-checks translation keys: `t('selector.heading')` compiles, a misspelt key does not.
import 'i18next';
import type en from '../locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
