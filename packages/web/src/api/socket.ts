// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * WebSocket client for `GET /ws`, the server's stream of run events.
 *
 * - Connects lazily, on the first subscription.
 * - Subscriptions are reference-counted per run id (`'*'` = every run). The server is told once per id.
 * - When the connection drops, it reconnects with exponential back-off and jitter, then subscribes
 *   again to every id. The server answers a per-run subscription with that run's stored events first,
 *   so listeners may see an event twice after a reconnect; the run event store drops duplicates.
 * - Every message is validated against `RunEventSchema`; subscription acknowledgements are skipped,
 *   anything else is ignored with a warning.
 */
import { RunEventSchema, type RunEvent, type WsClientMessage } from '@inji-playground/protocol';

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed';
export type RunEventListener = (event: RunEvent) => void;
type SubscriptionId = string;

/** The subset of the browser WebSocket the client uses, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
}

export interface RunSocketOptions {
  url: string;
  createSocket?: (url: string) => SocketLike;
  /** First reconnect delay; doubles on every failed attempt up to `maxDelayMs`. */
  minDelayMs?: number;
  maxDelayMs?: number;
  /** Source of jitter in [0, 1); injectable for deterministic tests. */
  random?: () => number;
}

const OPEN = 1;
const ALL_RUNS = '*';

/**
 * Messages the server sends besides run events: `subscribed` / `unsubscribed` acknowledgements and
 * `error` (for example a subscription to an unknown run id).
 */
type ControlMessage =
  { type: 'subscribed' | 'unsubscribed'; runId: string } | { type: 'error'; message: string };

function isControlMessage(json: unknown): json is ControlMessage {
  if (typeof json !== 'object' || json === null || !('type' in json)) return false;
  return json.type === 'subscribed' || json.type === 'unsubscribed' || json.type === 'error';
}

/** `ws://host/ws` or `wss://host/ws` for the page's own origin. */
export function defaultSocketUrl(location: Location = window.location): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ws`;
}

/**
 * Delay before reconnect attempt `attempt` (0-based): exponential, capped, with jitter between 50 %
 * and 100 % of the value so many tabs do not reconnect in lockstep after a server restart.
 */
export function reconnectDelay(attempt: number, minMs: number, maxMs: number, random: () => number): number {
  const base = Math.min(maxMs, minMs * 2 ** attempt);
  return Math.round(base * (0.5 + random() / 2));
}

export class RunSocket {
  private readonly options: Required<RunSocketOptions>;
  private socket: SocketLike | null = null;
  private readonly listeners = new Map<SubscriptionId, Set<RunEventListener>>();
  private readonly statusListeners = new Set<() => void>();
  private currentStatus: SocketStatus = 'idle';
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(options: RunSocketOptions) {
    this.options = {
      createSocket: (url) => new WebSocket(url),
      minDelayMs: 500,
      maxDelayMs: 10_000,
      random: Math.random,
      ...options,
    };
  }

  get status(): SocketStatus {
    return this.currentStatus;
  }

  /** Calls `listener` whenever the status changes; returns the unsubscribe function. */
  onStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  /** Receives the events of one run (or of every run with `'*'`); returns the unsubscribe function. */
  subscribe(runId: string, listener: RunEventListener): () => void {
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
      this.sendMessage({ type: 'subscribe', runId });
    }
    set.add(listener);
    this.ensureConnected();

    return () => {
      const current = this.listeners.get(runId);
      if (!current?.delete(listener) || current.size > 0) return;
      this.listeners.delete(runId);
      this.sendMessage({ type: 'unsubscribe', runId });
    };
  }

  /** Closes the connection for good (used when the app unmounts and in tests). */
  dispose(): void {
    this.disposed = true;
    this.clearReconnect();
    this.listeners.clear();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    this.setStatus('closed');
  }

  private ensureConnected(): void {
    if (this.disposed || this.socket || this.reconnectTimer) return;
    this.connect();
  }

  private connect(): void {
    this.setStatus('connecting');
    let socket: SocketLike;
    try {
      socket = this.options.createSocket(this.options.url);
    } catch (error) {
      console.warn('run socket: cannot open', error);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setStatus('open');
      for (const runId of this.listeners.keys()) this.sendMessage({ type: 'subscribe', runId });
    };
    socket.onmessage = (message) => this.handleMessage(message.data);
    // The close event always follows an error event, so reconnecting is left to onclose.
    socket.onerror = () => undefined;
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setStatus('closed');
      if (this.listeners.size > 0) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    const { minDelayMs, maxDelayMs, random } = this.options;
    const delay = reconnectDelay(this.attempt, minDelayMs, maxDelayMs, random);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed && !this.socket) this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private sendMessage(message: WsClientMessage): void {
    // While disconnected nothing is sent: onopen subscribes to every current id.
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(message));
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      console.warn('run socket: ignored a message that is not JSON');
      return;
    }
    if (isControlMessage(json)) {
      // Acknowledgements need no action; a server error means a subscription was refused.
      if (json.type === 'error') console.warn('run socket: server error:', json.message);
      return;
    }
    const parsed = RunEventSchema.safeParse(json);
    if (!parsed.success) {
      console.warn('run socket: ignored a message that is not a run event', parsed.error.issues[0]);
      return;
    }
    const event = parsed.data;
    for (const id of [event.runId, ALL_RUNS]) {
      const set = this.listeners.get(id);
      if (!set) continue;
      // Copy first: a listener may unsubscribe while being called.
      for (const listener of [...set]) listener(event);
    }
  }

  private setStatus(status: SocketStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    for (const listener of [...this.statusListeners]) listener();
  }
}
