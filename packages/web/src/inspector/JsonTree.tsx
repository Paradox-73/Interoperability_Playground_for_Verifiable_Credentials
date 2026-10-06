/**
 * Collapsible JSON viewer built on native `<details>` / `<summary>`, so it opens and closes with the
 * keyboard and screen readers announce it as expandable without extra ARIA.
 */
import { useTranslation } from 'react-i18next';
import { epochToIso, isJsonObject, type JsonValue } from './decode';

/** Claims holding seconds since the epoch (RFC 7519 section 4.1); their date is shown next to them. */
const TIME_CLAIMS = new Set(['iat', 'nbf', 'exp', 'auth_time']);

interface JsonTreeProps {
  value: JsonValue;
  /** Levels opened initially; deeper objects start closed. */
  openDepth?: number;
}

export function JsonTree({ value, openDepth = 2 }: JsonTreeProps) {
  return (
    <div className="relative overflow-x-auto font-mono text-xs leading-5" data-testid="json-tree">
      <Node value={value} depth={0} openDepth={openDepth} />
    </div>
  );
}

function Scalar({ value, name }: { value: JsonValue; name?: string }) {
  const date = name && TIME_CLAIMS.has(name) ? epochToIso(value) : undefined;
  const className = typeof value === 'string' ? 'text-ok' : value === null ? 'text-fg-muted' : 'text-info';
  return (
    <>
      <span className={`break-all ${className}`}>{JSON.stringify(value)}</span>
      {date && <span className="ml-2 text-fg-muted">({date})</span>}
    </>
  );
}

function Node({
  value,
  name,
  depth,
  openDepth,
}: {
  value: JsonValue;
  name?: string;
  depth: number;
  openDepth: number;
}) {
  const { t } = useTranslation();
  const label = name !== undefined && <span className="text-fg">{JSON.stringify(name)}: </span>;
  if (!Array.isArray(value) && !isJsonObject(value)) {
    return (
      <div>
        {label}
        <Scalar value={value} {...(name !== undefined ? { name } : {})} />
      </div>
    );
  }
  const entries: Array<[string | undefined, JsonValue]> = Array.isArray(value)
    ? value.map((item) => [undefined, item])
    : Object.entries(value);
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  if (entries.length === 0) {
    return (
      <div>
        {label}
        <span className="text-fg-muted">
          {open}
          {close}
        </span>
      </div>
    );
  }
  const count = Array.isArray(value)
    ? t('inspector.json.items', { count: entries.length })
    : t('inspector.json.keys', { count: entries.length });
  return (
    <details open={depth < openDepth} className="group">
      <summary className="cursor-pointer select-text">
        {label}
        <span className="text-fg-muted">
          {open}
          <span className="group-open:hidden">
            {' '}
            {count} {close}
          </span>
        </span>
      </summary>
      <div className="ml-4 border-l border-line pl-2">
        {entries.map(([key, child], index) => (
          <Node
            key={key ?? index}
            value={child}
            depth={depth + 1}
            openDepth={openDepth}
            {...(key !== undefined ? { name: key } : {})}
          />
        ))}
      </div>
      <span className="text-fg-muted">{close}</span>
    </details>
  );
}
