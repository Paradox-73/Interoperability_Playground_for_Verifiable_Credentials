// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../app/use-document-title';

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('pages.notFound.title'));
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{t('pages.notFound.title')}</h1>
      <p>{t('pages.notFound.body')}</p>
      <Link to="/" className="text-accent underline">
        {t('pages.notFound.home')}
      </Link>
    </div>
  );
}
