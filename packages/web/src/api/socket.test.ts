import type { RunEvent } from '@inji-playground/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconnectDelay, RunSocket, type SocketLike } from './socket';

/** In-memory stand-in for a browser WebSocket. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  drop() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close'));
  }
  receive(data: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: typeof data === 'string' ? data : JSON.stringify(data) }),
    );
  }
}

const event = (runId: string): RunEvent => ({
  type: 'step.started',
  runId,
  step: 'token',
  label: 'Wallet exchanges the one-time code for an access token',
  at: '2026-10-04T10:00:00.000Z',
});

function setup() {
  const sockets: FakeSocket[] = [];
  const client = new RunSocket({
    url: 'ws://playground.test/ws',
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    minDelayMs: 100,
    maxDelayMs: 1_000,
    random: () => 0.999_999,
  });
  return { client, sockets };
}

describe('RunSocket', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('connects on the first subscription and subscribes once the socket opens', () => {
    const { client, sockets } = setup();
    expect(sockets).toHaveLength(0);
    expect(client.status).toBe('idle');

    client.subscribe('run-1', () => undefined);
    expect(sockets).toHaveLength(1);
    expect(client.status).toBe('connecting');

    sockets[0]!.open();
    expect(client.status).toBe('open');
    expect(sockets[0]!.sent).toEqual([{ type: 'subscribe', runId: 'run-1' }]);
  });

  it('delivers events to the listeners of their run and to "*" listeners', () => {
    const { client, sockets } = setup();
    const run1 = vi.fn();
    const run2 = vi.fn();
    const all = vi.fn();
    client.subscribe('run-1', run1);
    client.subscribe('run-2', run2);
    client.subscribe('*', all);
    sockets[0]!.open();

    sockets[0]!.receive(event('run-1'));
    expect(run1).toHaveBeenCalledWith(event('run-1'));
    expect(run2).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalledTimes(1);
  });

  it('subscribes once per run and unsubscribes when the last listener leaves', () => {
    const { client, sockets } = setup();
    client.subscribe('run-1', () => undefined);
    sockets[0]!.open();
    const second = client.subscribe('run-1', () => undefined);
    const third = client.subscribe('run-1', () => undefined);
    expect(sockets[0]!.sent).toEqual([{ type: 'subscribe', runId: 'run-1' }]);

    second();
    third();
    expect(sockets[0]!.sent).toHaveLength(1);
  });

  it('sends unsubscribe when the last listener of a run leaves', () => {
    const { client, sockets } = setup();
    const off = client.subscribe('run-1', () => undefined);
    sockets[0]!.open();
    off();
    off(); // a second call is harmless
    expect(sockets[0]!.sent).toEqual([
      { type: 'subscribe', runId: 'run-1' },
      { type: 'unsubscribe', runId: 'run-1' },
    ]);
  });

  it('reconnects with growing delays and subscribes again to every run', () => {
    const { client, sockets } = setup();
    client.subscribe('run-1', () => undefined);
    client.subscribe('*', () => undefined);
    sockets[0]!.open();

    sockets[0]!.drop();
    expect(client.status).toBe('closed');
    vi.advanceTimersByTime(99);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    // The second attempt fails too: the next delay doubles.
    sockets[1]!.drop();
    vi.advanceTimersByTime(199);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    sockets[2]!.open();
    expect(client.status).toBe('open');
    expect(sockets[2]!.sent).toEqual([
      { type: 'subscribe', runId: 'run-1' },
      { type: 'subscribe', runId: '*' },
    ]);

    // A successful connection resets the back-off.
    sockets[2]!.drop();
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(4);
  });

  it('ignores messages that are not run events', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, sockets } = setup();
    const listener = vi.fn();
    client.subscribe('run-1', listener);
    sockets[0]!.open();

    sockets[0]!.receive('not json');
    sockets[0]!.receive({ type: 'step.started', runId: 'run-1' });
    expect(listener).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('skips subscription acknowledgements and logs server errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, sockets } = setup();
    const listener = vi.fn();
    client.subscribe('run-1', listener);
    sockets[0]!.open();

    sockets[0]!.receive({ type: 'subscribed', runId: 'run-1' });
    sockets[0]!.receive({ type: 'unsubscribed', runId: 'run-1' });
    expect(warn).not.toHaveBeenCalled();
    sockets[0]!.receive({ type: 'error', message: 'no run with id "run-1"' });
    expect(warn).toHaveBeenCalledWith('run socket: server error:', 'no run with id "run-1"');
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops reconnecting after dispose', () => {
    const { client, sockets } = setup();
    client.subscribe('run-1', () => undefined);
    sockets[0]!.open();
    sockets[0]!.drop();
    client.dispose();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(client.status).toBe('closed');
  });

  it('notifies status listeners on every change', () => {
    const { client, sockets } = setup();
    const seen: string[] = [];
    client.onStatus(() => seen.push(client.status));
    client.subscribe('run-1', () => undefined);
    sockets[0]!.open();
    sockets[0]!.drop();
    expect(seen).toEqual(['connecting', 'open', 'closed']);
  });
});

describe('reconnectDelay', () => {
  it('doubles from the minimum, stops at the maximum and applies 50-100 % jitter', () => {
    expect(reconnectDelay(0, 500, 10_000, () => 0.999_999)).toBe(500);
    expect(reconnectDelay(3, 500, 10_000, () => 0.999_999)).toBe(4_000);
    expect(reconnectDelay(10, 500, 10_000, () => 0.999_999)).toBe(10_000);
    expect(reconnectDelay(10, 500, 10_000, () => 0)).toBe(5_000);
  });
});
