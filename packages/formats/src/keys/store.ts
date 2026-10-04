/**
 * Saves key pairs as JWK files in a directory the caller chooses (the server passes a folder under
 * PLAYGROUND_RUN_DIR, which is outside git). One file per key: `<name>.jwk.json`.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FormatError } from '../errors.js';
import { generateKeyPair, keyPairFromPrivateJwk, type KeyAlgorithm, type KeyPair } from './keys.js';

const KEY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

interface KeyFile {
  alg: KeyAlgorithm;
  privateJwk: KeyPair['privateJwk'];
}

function keyPath(directory: string, name: string): string {
  // The name becomes a file name; rejecting separators and ".." keeps every key inside `directory`.
  if (!KEY_NAME.test(name) || name.includes('..')) {
    throw new FormatError('KEY_INVALID', `key name "${name}" must match ${KEY_NAME.source} without ".."`);
  }
  return join(directory, `${name}.jwk.json`);
}

export async function saveKeyPair(directory: string, name: string, keyPair: KeyPair): Promise<string> {
  const path = keyPath(directory, name);
  await mkdir(directory, { recursive: true });
  const file: KeyFile = { alg: keyPair.alg, privateJwk: keyPair.privateJwk };
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  // writeFile's mode applies only when the file is created; tighten an existing file too.
  // On Windows chmod can only toggle read-only, which is harmless here.
  await chmod(path, 0o600);
  return path;
}

export async function loadKeyPair(directory: string, name: string): Promise<KeyPair> {
  const path = keyPath(directory, name);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    throw new FormatError('KEY_NOT_FOUND', `no key file at ${path}`, { cause });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new FormatError('KEY_INVALID', `key file ${path} is not JSON`, { cause });
  }
  const keyPair = keyPairFromPrivateJwk((parsed as Partial<KeyFile>).privateJwk);
  if ((parsed as Partial<KeyFile>).alg !== keyPair.alg) {
    throw new FormatError(
      'KEY_INVALID',
      `key file ${path} declares alg ${String((parsed as Partial<KeyFile>).alg)}`,
    );
  }
  return keyPair;
}

/**
 * Loads `<name>.jwk.json`, or creates and saves a new key pair when the file does not exist yet, so a
 * role keeps its DID across restarts.
 */
export async function loadOrCreateKeyPair(
  directory: string,
  name: string,
  alg: KeyAlgorithm,
): Promise<KeyPair> {
  try {
    const existing = await loadKeyPair(directory, name);
    if (existing.alg !== alg) {
      throw new FormatError('KEY_INVALID', `key "${name}" exists with alg ${existing.alg}, expected ${alg}`);
    }
    return existing;
  } catch (error) {
    if (!(error instanceof FormatError) || error.code !== 'KEY_NOT_FOUND') throw error;
  }
  const created = generateKeyPair(alg);
  await saveKeyPair(directory, name, created);
  return created;
}
