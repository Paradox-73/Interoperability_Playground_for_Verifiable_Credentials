/**
 * Empty state for pages whose content arrives with later features (matrix, gaps). It says what the page
 * will hold and what to do now, instead of showing nothing.
 */
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../app/use-document-title';

export function PlaceholderPage({ page }: { page: 'matrix' | 'gaps' }) {
  const { t } = useTranslation();
  const title = t(`pages.${page}.title`);
  useDocumentTitle(title);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
        {t(`pages.${page}.empty`)}
      </p>
    </div>
  );
}
