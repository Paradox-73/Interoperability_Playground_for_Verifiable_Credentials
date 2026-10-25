// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The roles a run can choose from: the three selector columns. Each implementation registers once at
 * start-up; its descriptor is validated then, so a malformed adapter fails the server start instead of
 * a run.
 */
import {
  RoleDescriptorSchema,
  type AnyRole,
  type Health,
  type IssuerRole,
  type RoleDescriptor,
  type RoleKind,
  type RoleStatus,
  type VerifierRole,
  type WalletRole,
} from '@inji-playground/protocol';

export interface RoleRegistration {
  role: AnyRole;
  /** Overrides the step timeout derived from the role's ecosystem and interaction. */
  stepTimeoutMs?: number;
}

export interface RegisteredRole {
  descriptor: RoleDescriptor;
  role: AnyRole;
  stepTimeoutMs?: number;
}

const REQUIRED_METHODS: Record<RoleKind, readonly string[]> = {
  issuer: ['startIssuance'],
  wallet: ['receiveCredential', 'present'],
  verifier: ['createRequest', 'awaitResult'],
};

export interface RoleRegistryOptions {
  /** How long a health probe may take before the role is reported `unknown`. */
  healthTimeoutMs?: number;
  /** How long a health result is reused, so a busy UI does not probe the Inji containers every second. */
  healthCacheMs?: number;
}

export class RoleRegistry {
  readonly #roles = new Map<string, RegisteredRole>();
  readonly #health = new Map<string, { at: number; health: Promise<Health> }>();
  readonly #healthTimeoutMs: number;
  readonly #healthCacheMs: number;

  constructor(options: RoleRegistryOptions = {}) {
    this.#healthTimeoutMs = options.healthTimeoutMs ?? 3_000;
    this.#healthCacheMs = options.healthCacheMs ?? 5_000;
  }

  /** Adds a role; throws when its descriptor is invalid, its id is taken or a method is missing. */
  register({ role, stepTimeoutMs }: RoleRegistration): RegisteredRole {
    const descriptor = RoleDescriptorSchema.parse(role.describe());
    if (this.#roles.has(descriptor.id)) throw new Error(`role "${descriptor.id}" is registered twice`);
    const missing = REQUIRED_METHODS[descriptor.kind].filter(
      (name) => typeof (role as unknown as Record<string, unknown>)[name] !== 'function',
    );
    if (missing.length > 0) {
      throw new Error(`role "${descriptor.id}" is a ${descriptor.kind} but lacks ${missing.join(', ')}`);
    }
    const entry: RegisteredRole = { descriptor, role, ...(stepTimeoutMs ? { stepTimeoutMs } : {}) };
    this.#roles.set(descriptor.id, entry);
    return entry;
  }

  get(id: string): RegisteredRole | undefined {
    return this.#roles.get(id);
  }

  /** Registered roles in registration order, optionally of one kind. */
  list(kind?: RoleKind): RegisteredRole[] {
    const all = [...this.#roles.values()];
    return kind ? all.filter((entry) => entry.descriptor.kind === kind) : all;
  }

  issuer(id: string): IssuerRole | undefined {
    const entry = this.#roles.get(id);
    return entry?.descriptor.kind === 'issuer' ? (entry.role as IssuerRole) : undefined;
  }

  wallet(id: string): WalletRole | undefined {
    const entry = this.#roles.get(id);
    return entry?.descriptor.kind === 'wallet' ? (entry.role as WalletRole) : undefined;
  }

  verifier(id: string): VerifierRole | undefined {
    const entry = this.#roles.get(id);
    return entry?.descriptor.kind === 'verifier' ? (entry.role as VerifierRole) : undefined;
  }

  /** Descriptor and health of every role (of one kind), probed in parallel. */
  async status(kind?: RoleKind): Promise<RoleStatus[]> {
    return Promise.all(
      this.list(kind).map(async (entry) => ({
        descriptor: entry.descriptor,
        health: await this.health(entry),
      })),
    );
  }

  /**
   * Health of one role. A probe that throws gives `down`; one that takes longer than the timeout gives
   * `unknown`. Results (also failures) are cached briefly.
   */
  health(entry: RegisteredRole): Promise<Health> {
    const cached = this.#health.get(entry.descriptor.id);
    if (cached && Date.now() - cached.at < this.#healthCacheMs) return cached.health;
    const health = this.#probe(entry);
    this.#health.set(entry.descriptor.id, { at: Date.now(), health });
    return health;
  }

  async #probe(entry: RegisteredRole): Promise<Health> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<Health>((resolve) => {
      timer = setTimeout(
        () =>
          resolve({
            status: 'unknown',
            checkedAt: new Date().toISOString(),
            detail: `no answer to the health probe within ${this.#healthTimeoutMs} ms`,
          }),
        this.#healthTimeoutMs,
      );
    });
    try {
      return await Promise.race([
        entry.role.health().catch((error: unknown): Health => ({
          status: 'down',
          checkedAt: new Date().toISOString(),
          detail: error instanceof Error ? error.message : String(error),
        })),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
