import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Sets the browser tab title to "<page> · <product>" (WCAG 2.4.2: every page has a descriptive title). */
export function useDocumentTitle(page: string): void {
  const { t } = useTranslation();
  const product = t('app.name');
  useEffect(() => {
    document.title = page ? `${page} · ${product}` : product;
  }, [page, product]);
}
