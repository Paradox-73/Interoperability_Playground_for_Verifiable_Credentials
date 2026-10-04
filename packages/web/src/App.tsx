/**
 * Skeleton page: the product name, the three role columns and the server's health. The selector,
 * run bar and live timeline replace the column placeholders in the UI work packages.
 */
import { ServerHealthSchema, type RoleKind, type ServerHealth } from '@inji-playground/protocol';
import { useEffect, useState } from 'react';

type HealthState =
  { kind: 'checking' } | { kind: 'up'; health: ServerHealth } | { kind: 'down'; reason: string };

const COLUMNS: ReadonlyArray<{ kind: RoleKind; title: string; hint: string }> = [
  { kind: 'issuer', title: 'Issuer', hint: 'Issues the credential (OpenID4VCI)' },
  { kind: 'wallet', title: 'Wallet', hint: 'Holds and presents it' },
  { kind: 'verifier', title: 'Verifier', hint: 'Checks it (OpenID4VP)' },
];

/** Asks the playground server whether it is up; the answer must match the shared health schema. */
async function fetchHealth(signal: AbortSignal): Promise<ServerHealth> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`server answered ${res.status}`);
  return ServerHealthSchema.parse(await res.json());
}

export function App() {
  const [state, setState] = useState<HealthState>({ kind: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then(
      (health) => setState({ kind: 'up', health }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ kind: 'down', reason: error instanceof Error ? error.message : String(error) });
        }
      },
    );
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold">Inji Interoperability Playground</h1>
        <p role="status" aria-live="polite" className="mt-1 text-sm text-slate-700">
          {state.kind === 'checking' && 'Checking the playground server…'}
          {state.kind === 'up' && `Server ${state.health.version} is up`}
          {state.kind === 'down' && `Server unreachable: ${state.reason}`}
        </p>
      </header>
      <main className="grid gap-4 p-6 md:grid-cols-3">
        {COLUMNS.map((column, index) => (
          <section
            key={column.kind}
            aria-labelledby={`column-${column.kind}`}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <h2 id={`column-${column.kind}`} className="text-lg font-medium">
              {index + 1}. {column.title}
            </h2>
            <p className="text-sm text-slate-700">{column.hint}</p>
          </section>
        ))}
      </main>
    </div>
  );
}
