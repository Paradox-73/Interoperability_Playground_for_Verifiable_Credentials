/**
 * The playground's persistent store: runs, their events, recorded HTTP exchanges and artefacts, in one
 * SQLite file through Node's built-in `node:sqlite` (no native add-on to build on Windows, in Docker or
 * in CI). All calls are synchronous; a write takes well under a millisecond, and keeping them
 * synchronous is what lets the WebSocket replay stored events and attach a live listener without a gap.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import {
  InteropReportSchema,
  RecordedExchangeSchema,
  RunConfigSchema,
  RunEventSchema,
  type ArtifactKind,
  type CredentialFormat,
  type InteropReport,
  type Outcome,
  type RecordedExchange,
  type ReportError,
  type RunConfig,
  type RunDetail,
  type RunEvent,
  type RunListQuery,
  type RunListResponse,
  type RunMode,
  type RunStatus,
  type RunSummary,
  type StepId,
  type Verdict,
} from '@inji-playground/protocol';
import { MIGRATIONS, type Migration } from './migrations.js';

/** What the orchestrator knows about a run when it is created. */
export interface NewRun {
  id: string;
  mode: RunMode;
  config: RunConfig;
  versions: { issuer: string; wallet: string; verifier: string };
  createdAt: string;
}

/** An artefact row, as returned by `listArtifacts`. */
export interface StoredArtifact {
  seq: number;
  kind: ArtifactKind;
  format?: CredentialFormat;
  raw: string;
  createdAt: string;
}

interface RunRow {
  id: string;
  status: RunStatus;
  mode: RunMode;
  issuer_version: string;
  wallet_version: string;
  verifier_version: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  outcome: Outcome | null;
  verdict: Verdict | null;
  error_step: StepId | null;
  error_code: string | null;
  error_message: string | null;
  error_exchange: string | null;
  config_json: string;
  report_json: string | null;
}

/** Columns a list filter may compare for equality, keyed by the query field name. */
const EQUALITY_FILTERS = {
  issuer: 'issuer',
  wallet: 'wallet',
  verifier: 'verifier',
  format: 'format',
  scenario: 'scenario',
  outcome: 'outcome',
  verdict: 'verdict',
  status: 'status',
  mode: 'mode',
} as const satisfies Partial<Record<keyof RunListQuery, string>>;

export class RunStore {
  readonly #db: DatabaseSync;
  readonly #statements = new Map<string, StatementSync>();

  /**
   * Opens (creating if needed) the database at `path` and applies pending migrations. A file database
   * uses write-ahead logging so the history page can read while a run writes.
   */
  static open(path: string): RunStore {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    if (path !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
    }
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    const store = new RunStore(db);
    store.migrate();
    return store;
  }

  private constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Applies every migration newer than the database's version; returns the versions applied. */
  migrate(migrations: readonly Migration[] = MIGRATIONS): number[] {
    this.#db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT',
    );
    const row = this.#db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as {
      v: number;
    };
    const applied: number[] = [];
    for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
      if (migration.version <= row.v) continue;
      this.transaction(() => {
        this.#db.exec(migration.sql);
        this.#db
          .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
          .run(migration.version, migration.name, new Date().toISOString());
      });
      applied.push(migration.version);
    }
    return applied;
  }

  /** Version of the newest applied migration. */
  schemaVersion(): number {
    return (
      this.#db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as { v: number }
    ).v;
  }

  close(): void {
    if (this.#db.isOpen) this.#db.close();
  }

  createRun(run: NewRun): void {
    const { config } = run;
    this.#stmt(
      `INSERT INTO runs (id, status, mode, issuer, wallet, verifier, issuer_version, wallet_version, verifier_version,
         format, vci_profile, vp_profile, scenario, replay_of, created_at, config_json)
       VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      run.id,
      run.mode,
      config.issuer,
      config.wallet,
      config.verifier,
      run.versions.issuer,
      run.versions.wallet,
      run.versions.verifier,
      config.format,
      config.vciProfile,
      config.vpProfile,
      config.scenario,
      config.replayOf ?? null,
      run.createdAt,
      JSON.stringify(config),
    );
  }

  markStarted(runId: string, at: string): void {
    this.#stmt(`UPDATE runs SET status = 'running', started_at = ? WHERE id = ?`).run(at, runId);
  }

  /**
   * Appends an event to the run's log and returns its sequence number (1, 2, ...). `exchange` and
   * `artifact` events are also written to their own tables, in the same transaction.
   */
  appendEvent(event: RunEvent, at: string): number {
    return this.transaction(() => {
      const { seq } = this.#stmt(
        'SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM run_events WHERE run_id = ?',
      ).get(event.runId) as { seq: number };
      this.#stmt('INSERT INTO run_events (run_id, seq, type, at, event_json) VALUES (?, ?, ?, ?, ?)').run(
        event.runId,
        seq,
        event.type,
        at,
        JSON.stringify(event),
      );
      if (event.type === 'exchange') this.#insertExchange(event.exchange);
      if (event.type === 'artifact') {
        this.#stmt(
          'INSERT INTO artifacts (run_id, seq, kind, format, raw, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(event.runId, seq, event.kind, event.format ?? null, event.raw, at);
      }
      return seq;
    });
  }

  /** Stores the final report and copies its verdict, outcome and error into indexed columns. */
  finishRun(report: InteropReport, finishedAt: string): void {
    this.#stmt(
      `UPDATE runs SET status = 'finished', finished_at = ?, outcome = ?, verdict = ?, error_step = ?, error_code = ?,
         error_message = ?, error_exchange = ?, report_json = ?
       WHERE id = ?`,
    ).run(
      finishedAt,
      report.outcome,
      report.verdict,
      report.error?.step ?? null,
      report.error?.code ?? null,
      report.error?.message ?? null,
      report.error?.exchangeId ?? null,
      JSON.stringify(report),
      report.runId,
    );
  }

  /**
   * Marks runs left `queued` or `running` by a previous server process as finished with verdict
   * `error`, so the history never shows a run that will not move again. Returns how many were marked.
   */
  interruptUnfinished(at: string): number {
    const result = this.#stmt(
      `UPDATE runs SET status = 'finished', finished_at = ?, outcome = 'NOT_RUN', verdict = 'error',
         error_step = 'playground.admin', error_code = 'server.restarted',
         error_message = 'The playground server stopped while this run was in progress.'
       WHERE status <> 'finished'`,
    ).run(at);
    return Number(result.changes);
  }

  getRun(runId: string): RunDetail | undefined {
    const row = this.#stmt('SELECT * FROM runs WHERE id = ?').get(runId) as RunRow | undefined;
    if (!row) return undefined;
    const summary = toSummary(row);
    return row.report_json
      ? { ...summary, report: InteropReportSchema.parse(JSON.parse(row.report_json)) }
      : summary;
  }

  getConfig(runId: string): RunConfig | undefined {
    const row = this.#stmt('SELECT config_json FROM runs WHERE id = ?').get(runId) as
      { config_json: string } | undefined;
    return row ? RunConfigSchema.parse(JSON.parse(row.config_json)) : undefined;
  }

  /** Runs matching every given filter, newest first, with the total count for paging. */
  listRuns(query: RunListQuery): RunListResponse {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    for (const [field, column] of Object.entries(EQUALITY_FILTERS)) {
      const value = query[field as keyof typeof EQUALITY_FILTERS];
      if (value !== undefined) {
        where.push(`${column} = ?`);
        params.push(value);
      }
    }
    if (query.version !== undefined) {
      where.push('(issuer_version = ? OR wallet_version = ? OR verifier_version = ?)');
      params.push(query.version, query.version, query.version);
    }
    // Timestamps are stored as UTC ISO strings, so text order is time order; normalise the bounds the same way.
    if (query.from !== undefined) {
      where.push('created_at >= ?');
      params.push(new Date(query.from).toISOString());
    }
    if (query.to !== undefined) {
      where.push('created_at < ?');
      params.push(new Date(query.to).toISOString());
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const { total } = this.#db.prepare(`SELECT COUNT(*) AS total FROM runs ${clause}`).get(...params) as {
      total: number;
    };
    const rows = this.#db
      .prepare(`SELECT * FROM runs ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, query.limit, query.offset) as unknown as RunRow[];
    return { total, limit: query.limit, offset: query.offset, items: rows.map(toSummary) };
  }

  /** Events of a run in emission order; `afterSeq` skips the ones a client already has. */
  listEvents(runId: string, afterSeq = 0): RunEvent[] {
    const rows = this.#stmt(
      'SELECT event_json FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq',
    ).all(runId, afterSeq) as unknown as Array<{ event_json: string }>;
    return rows.map((row) => RunEventSchema.parse(JSON.parse(row.event_json)));
  }

  listExchanges(runId: string): RecordedExchange[] {
    const rows = this.#stmt('SELECT exchange_json FROM exchanges WHERE run_id = ? ORDER BY seq').all(
      runId,
    ) as unknown as Array<{ exchange_json: string }>;
    return rows.map((row) => RecordedExchangeSchema.parse(JSON.parse(row.exchange_json)));
  }

  listArtifacts(runId: string): StoredArtifact[] {
    const rows = this.#stmt(
      'SELECT seq, kind, format, raw, created_at FROM artifacts WHERE run_id = ? ORDER BY seq',
    ).all(runId) as unknown as Array<{
      seq: number;
      kind: ArtifactKind;
      format: CredentialFormat | null;
      raw: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      seq: row.seq,
      kind: row.kind,
      ...(row.format ? { format: row.format } : {}),
      raw: row.raw,
      createdAt: row.created_at,
    }));
  }

  /** Runs `fn` inside a transaction; nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.#db.isTransaction) return fn();
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #insertExchange(exchange: RecordedExchange): void {
    this.#stmt(
      `INSERT INTO exchanges (id, run_id, seq, capture, step, from_party, to_party, method, url, status, started_at,
         duration_ms, error, exchange_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      exchange.id,
      exchange.runId,
      exchange.seq,
      exchange.capture,
      exchange.step ?? null,
      exchange.from,
      exchange.to,
      exchange.request.method,
      exchange.request.url,
      exchange.response?.status ?? null,
      exchange.startedAt,
      exchange.durationMs,
      exchange.error ?? null,
      JSON.stringify(exchange),
    );
  }

  /** Prepared statements are cached by their SQL text. */
  #stmt(sql: string): StatementSync {
    let statement = this.#statements.get(sql);
    if (!statement) {
      statement = this.#db.prepare(sql);
      this.#statements.set(sql, statement);
    }
    return statement;
  }
}

function toSummary(row: RunRow): RunSummary {
  const error: ReportError | undefined =
    row.error_step && row.error_code && row.error_message
      ? {
          step: row.error_step,
          code: row.error_code,
          message: row.error_message,
          ...(row.error_exchange ? { exchangeId: row.error_exchange } : {}),
        }
      : undefined;
  return {
    runId: row.id,
    status: row.status,
    mode: row.mode,
    config: RunConfigSchema.parse(JSON.parse(row.config_json)),
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.outcome ? { outcome: row.outcome } : {}),
    ...(row.verdict ? { verdict: row.verdict } : {}),
    ...(error ? { error } : {}),
    versions: { issuer: row.issuer_version, wallet: row.wallet_version, verifier: row.verifier_version },
  };
}
