/**
 * Schema migrations of the playground database, applied in order at start-up. A migration is never
 * edited after it has been committed; a change to the schema is a new entry at the end of the list.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'runs, run events, exchanges and artifacts',
    sql: `
      -- One row per run. The columns used by history filters and the matrix are copied out of the JSON
      -- configuration and report, so they can be indexed.
      CREATE TABLE runs (
        id               TEXT PRIMARY KEY,
        status           TEXT NOT NULL CHECK (status IN ('queued', 'running', 'finished')),
        mode             TEXT NOT NULL,
        issuer           TEXT NOT NULL,
        wallet           TEXT NOT NULL,
        verifier         TEXT NOT NULL,
        issuer_version   TEXT NOT NULL,
        wallet_version   TEXT NOT NULL,
        verifier_version TEXT NOT NULL,
        format           TEXT NOT NULL,
        vci_profile      TEXT NOT NULL,
        vp_profile       TEXT NOT NULL,
        scenario         TEXT NOT NULL,
        replay_of        TEXT,
        created_at       TEXT NOT NULL,
        started_at       TEXT,
        finished_at      TEXT,
        outcome          TEXT,
        verdict          TEXT,
        error_step       TEXT,
        error_code       TEXT,
        error_message    TEXT,
        error_exchange   TEXT,
        config_json      TEXT NOT NULL,
        report_json      TEXT
      ) STRICT;
      CREATE INDEX runs_created_at ON runs (created_at DESC);
      CREATE INDEX runs_cell ON runs (issuer, wallet, verifier, format, vp_profile, scenario, created_at DESC);
      CREATE INDEX runs_verdict ON runs (verdict, created_at DESC);

      -- Every event of a run in the order it was emitted; the WebSocket replays these to late subscribers.
      CREATE TABLE run_events (
        run_id     TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
        seq        INTEGER NOT NULL,
        type       TEXT NOT NULL,
        at         TEXT NOT NULL,
        event_json TEXT NOT NULL,
        PRIMARY KEY (run_id, seq)
      ) STRICT;

      -- One HTTP request and response as captured on the wire (full payloads; redacted only on export).
      CREATE TABLE exchanges (
        id            TEXT PRIMARY KEY,
        run_id        TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
        seq           INTEGER NOT NULL,
        capture       TEXT NOT NULL,
        step          TEXT,
        from_party    TEXT NOT NULL,
        to_party      TEXT NOT NULL,
        method        TEXT NOT NULL,
        url           TEXT NOT NULL,
        status        INTEGER,
        started_at    TEXT NOT NULL,
        duration_ms   REAL NOT NULL,
        error         TEXT,
        exchange_json TEXT NOT NULL,
        UNIQUE (run_id, seq)
      ) STRICT;

      -- Credentials, offers, request objects, presentations and results as exchanged.
      CREATE TABLE artifacts (
        run_id     TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
        seq        INTEGER NOT NULL,
        kind       TEXT NOT NULL,
        format     TEXT,
        raw        TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (run_id, seq)
      ) STRICT;
    `,
  },
];
