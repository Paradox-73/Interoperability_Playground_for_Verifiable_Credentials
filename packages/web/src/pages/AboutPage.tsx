/**
 * What the playground is, how capture works, and the versions of every registered implementation.
 */
import { useTranslation } from 'react-i18next';
import { useRoles, useServerHealth } from '../api/queries';
import { useDocumentTitle } from '../app/use-document-title';

export function AboutPage() {
  const { t } = useTranslation();
  const roles = useRoles();
  const health = useServerHealth();
  useDocumentTitle(t('pages.about.title'));
  const cell = 'py-1 pr-3';
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">{t('pages.about.title')}</h1>
      <p>{t('pages.about.what')}</p>
      <p>{t('pages.about.capture')}</p>
      {health.data && (
        <p className="text-sm text-fg-muted">{t('pages.about.server', { version: health.data.version })}</p>
      )}

      <h2 className="text-lg font-semibold">{t('pages.about.versions')}</h2>
      {roles.isPending && <p className="text-sm text-fg-muted">{t('common.loading')}</p>}
      {roles.data && (
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{t('pages.about.versionsCaption')}</caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th scope="col" className={cell}>
                {t('pages.about.columnRole')}
              </th>
              <th scope="col" className={cell}>
                {t('pages.about.columnKind')}
              </th>
              <th scope="col" className={cell}>
                {t('pages.about.columnEcosystem')}
              </th>
              <th scope="col" className={cell}>
                {t('pages.about.columnVersion')}
              </th>
            </tr>
          </thead>
          <tbody>
            {roles.data.map(({ descriptor }) => (
              <tr key={descriptor.id} className="border-b border-line">
                <th scope="row" className={`${cell} font-normal`}>
                  {descriptor.name}
                </th>
                <td className={cell}>{t(`role.kind.${descriptor.kind}`)}</td>
                <td className={cell}>{t(`role.ecosystem.${descriptor.ecosystem}`)}</td>
                <td className={`${cell} font-mono`}>{descriptor.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
