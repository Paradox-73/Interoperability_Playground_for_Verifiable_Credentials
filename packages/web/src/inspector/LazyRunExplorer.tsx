/**
 * The run explorer (sequence diagram and protocol inspector) loaded on first use, so the first page
 * load carries only the selector, run bar and timeline. Mermaid itself is loaded later still, when the
 * first diagram is drawn (src/sequence/mermaid-loader.ts).
 */
import { lazy, Suspense, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

const RunExplorer = lazy(() => import('./RunExplorer').then((module) => ({ default: module.RunExplorer })));

export function LazyRunExplorer(props: ComponentProps<typeof RunExplorer>) {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <p role="status" className="text-sm text-fg-muted">
          {t('inspector.loading')}
        </p>
      }
    >
      <RunExplorer {...props} />
    </Suspense>
  );
}
