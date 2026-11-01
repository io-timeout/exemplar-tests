import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DATA, PACKAGE } from './paths.ts';
import { readTar } from './tar.ts';

/** A suite published as one archive. */
interface ArchiveSuite {
  readonly kind: 'archive';
  readonly url: string;
  readonly sha256: string;
}

/** A suite published as separate files under one base URL. */
interface FilesSuite {
  readonly kind: 'files';
  readonly base: string;
  readonly files: Readonly<Record<string, string>>;
}

/** How a suite is fetched and checked, as `suites.json` pins it. */
export type SuiteSpec = ArchiveSuite | FilesSuite;

/** Marks a suite whose every file has been fetched and checked. */
const COMPLETE = '.complete';

/** Reads the pinned suites. */
export function suites(): Record<string, SuiteSpec> {
  return JSON.parse(readFileSync(path.join(PACKAGE, 'suites.json'), 'utf8')) as Record<string, SuiteSpec>;
}

/** Returns the SHA-256 of some bytes, in hex. */
export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** How many times a download is retried when the server asks it to slow down. */
const RETRIES = 20;

/** Downloads one URL, waiting as the server asks when it answers 429 or 503. */
export async function download(url: string): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    const busy = response.status === 429 || response.status === 503;
    if (!busy || attempt === RETRIES) {
      throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
    }
    const seconds = Number(response.headers.get('retry-after') ?? '') || 30;
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}

/** Fetches a files suite's files a few at a time, checking each against its pinned hash; files already there and matching are kept. */
async function fetchFiles(spec: FilesSuite, directory: string): Promise<void> {
  const files = Object.entries(spec.files);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const [file, expected] = files[next++] as [string, string];
      const existing = path.join(directory, file);
      if (existsSync(existing) && sha256(readFileSync(existing)) === expected) continue;
      const data = await download(new URL(file, spec.base).href);
      const actual = sha256(data);
      if (actual !== expected) throw new Error(`${file} has SHA-256 ${actual}, not the pinned ${expected}`);
      writeBelow(directory, file, data);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}

/** Writes a file below a directory, refusing paths that would leave it. */
export function writeBelow(directory: string, relative: string, data: Uint8Array): void {
  const target = path.resolve(directory, relative);
  if (!target.startsWith(directory + path.sep)) throw new Error(`Refusing to write ${relative} outside ${directory}`);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data);
}

/** Downloads a suite, checks it against its pinned hashes and unpacks it; an interrupted files suite resumes. */
async function fetchSuite(spec: SuiteSpec, directory: string): Promise<void> {
  if (spec.kind === 'archive') {
    await fetchArchive(spec, directory);
    return;
  }
  mkdirSync(directory, { recursive: true });
  await fetchFiles(spec, directory);
  writeFileSync(path.join(directory, COMPLETE), '');
}

/** Unpacks an archive suite beside its directory, then moves it into place, so no reader sees it half written. */
async function fetchArchive(spec: ArchiveSuite, directory: string): Promise<void> {
  const archive = await download(spec.url);
  const actual = sha256(archive);
  if (actual !== spec.sha256) throw new Error(`${spec.url} has SHA-256 ${actual}, not the pinned ${spec.sha256}`);
  const unpacking = `${directory}.unpacking-${process.pid}`;
  rmSync(unpacking, { recursive: true, force: true });
  mkdirSync(unpacking, { recursive: true });
  for (const entry of readTar(gunzipSync(archive))) writeBelow(unpacking, entry.path, entry.data);
  writeFileSync(path.join(unpacking, COMPLETE), '');
  // Another process may have finished first; its copy is the same.
  if (existsSync(path.join(directory, COMPLETE))) {
    rmSync(unpacking, { recursive: true, force: true });
    return;
  }
  rmSync(directory, { recursive: true, force: true });
  renameSync(unpacking, directory);
}

/** Returns the directory a suite is unpacked in, fetching it first if it is missing. */
export async function ensureSuite(name: string): Promise<string> {
  const spec = suites()[name];
  if (!spec) throw new Error(`No suite named ${name} in suites.json`);
  const directory = path.join(DATA, name);
  if (!existsSync(path.join(directory, COMPLETE))) await fetchSuite(spec, directory);
  return directory;
}

/** Downloads a suite's files and returns their SHA-256 hashes, for pinning in `suites.json`. */
export async function pin(name: string): Promise<Record<string, string>> {
  const spec = suites()[name];
  if (!spec) throw new Error(`No suite named ${name} in suites.json`);
  if (spec.kind === 'archive') return { [spec.url]: sha256(await download(spec.url)) };
  const hashes: Record<string, string> = {};
  for (const file of Object.keys(spec.files)) hashes[file] = sha256(await download(new URL(file, spec.base).href));
  return hashes;
}
