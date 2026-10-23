// @vitest-environment node
/**
 * Guards the signing boundary documented in SECURITY.md (#260): the browser client never
 * holds private keys and never signs. If one of these checks fails, update SECURITY.md
 * ("Wallet Key Ownership & Signing Boundary") as part of a reviewed design change.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, 'utf8'),
}));

const SIGNING_LIBRARIES = [
  '@stellar/stellar-sdk',
  'stellar-sdk',
  '@stellar/freighter-api',
  'starknet',
  'ethers',
  'bip39',
  'ed25519-hd-key',
  'tweetnacl',
];

const SIGNING_APIS = [
  /Keypair\.(fromSecret|random|fromRawEd25519Seed)/,
  /\.sign\(\s*[a-zA-Z]*[kK]eypair/,
  /signTransaction\s*\(/,
  /\b(mnemonicToSeed|generateMnemonic)\b/,
];

describe('client signing boundary (#260)', () => {
  it('has no signing or key-management library as a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((dep) => SIGNING_LIBRARIES.includes(dep))).toEqual([]);
  });

  it('does not import signing libraries in client source', () => {
    const offenders = files.filter(({ text }) =>
      SIGNING_LIBRARIES.some((lib) => new RegExp(`from ['"]${lib.replace('/', '\\/')}['"]`).test(text)),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('does not call key-generation or signing APIs', () => {
    const offenders = files.filter(({ text }) => SIGNING_APIS.some((pattern) => pattern.test(text)));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('never writes secret-key material to browser storage', () => {
    const storageWrite = /(localStorage|sessionStorage)\.setItem\(\s*['"`][^'"`]*(secret|private|seed|mnemonic)[^'"`]*['"`]/i;
    const offenders = files.filter(({ text }) => storageWrite.test(text));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('only sends a public key to Friendbot', () => {
    const api = files.find((f) => f.path.endsWith(join('services', 'api.ts')))!;
    const friendbotCalls = api.text.match(/FRIENDTEST_URL\}[^`]*`/g) ?? [];
    expect(friendbotCalls.length).toBeGreaterThan(0);
    for (const call of friendbotCalls) {
      // Only the public key (optionally URL-encoded) may be sent
      expect(call).toMatch(/addr=\$\{(encodeURIComponent\()?publicKey\)?\}/);
    }
  });
});
