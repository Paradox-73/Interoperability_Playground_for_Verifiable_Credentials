// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The reference issuer's signed Bitstring Status List is cached until the next revocation; a signing that
 * failed must not be cached, or every later status check would get that error.
 */
import { generateKeyPair } from '@inji-playground/formats';
import { describe, expect, it, vi } from 'vitest';
import { IssuerSigner } from '../src/issuer/signing.js';

describe('Bitstring Status List cache', () => {
  it('a failed signing is not kept: the next request signs the list again', async () => {
    const signer = new IssuerSigner(
      { ed25519: generateKeyPair('EdDSA'), p256: generateKeyPair('ES256') },
      'did:key',
      'http://localhost:28100/ref/issuer',
    );
    const sign = vi
      .spyOn(
        signer as unknown as { signBitstringStatusList(now: Date): Promise<unknown> },
        'signBitstringStatusList',
      )
      .mockRejectedValueOnce(new Error('signing failed'));
    await expect(signer.bitstringStatusList()).rejects.toThrow('signing failed');
    await expect(signer.bitstringStatusList()).resolves.toMatchObject({
      type: expect.arrayContaining(['BitstringStatusListCredential']),
    });
    expect(sign).toHaveBeenCalledTimes(2);
  });
});
