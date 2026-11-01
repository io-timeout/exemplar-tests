import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { type Configuration, type Workload, javaExecutable } from '@exemplarjs/adapters';
import { download, readTar, sha256, writeBelow } from '@exemplarjs/conformance';
import { byCodeUnit } from '@exemplarjs/xml/internal';
import { DATA, PACKAGE } from './paths.ts';
import { SCALING_SERIES, generate } from './synthetic.ts';

/** Files taken from a `.tar.gz`, with its top folder removed. */
interface ArchiveSource {
  readonly kind: 'archive';
  readonly url: string;
  readonly include: string;
  readonly exclude?: string;
}

/** Files fetched one by one, into `target` below the dataset when it is given. */
interface FilesSource {
  readonly kind: 'files';
  readonly base: string;
  readonly files: readonly string[];
  readonly target?: string;
}

/** A small file whose text the spec gives; with `copies`, that many files numbered before the extension. */
interface GeneratedSource {
  readonly kind: 'generated';
  readonly path: string;
  readonly text: string;
  readonly copies?: number;
}

/** XMark documents built by compiling CWI's generator. */
interface XmarkSource {
  readonly kind: 'xmark';
  readonly url: string;
  readonly factors: readonly number[];
}

/** A copy of another dataset with one transformation applied; `copy` takes only the files `include` selects. */
interface DerivedSource {
  readonly kind: 'derived';
  readonly from: string;
  readonly transform: 'crlf' | 'expanded' | 'simplified' | 'copy';
  readonly include?: string;
}

type Source = ArchiveSource | FilesSource | GeneratedSource | XmarkSource | DerivedSource;

/** A dataset as `datasets.json` describes it. */
interface DatasetSpec {
  /** What the report calls the dataset, and what it explains about it, a point per entry. */
  readonly title: string;
  readonly about?: readonly string[];
  readonly version: string;
  readonly licence: string;
  /** Selects, by relative path, the files the workloads read; a dataset without it only supplies files to others. */
  readonly documents?: string;
  /** How its documents are read: `external` reads the DTDs and entities they refer to, below the dataset's folder. */
  readonly configuration?: Configuration;
  /** The workloads run on it; all but `dtd` by default. */
  readonly workloads?: readonly Workload[];
  readonly sources: readonly Source[];
}

/** A dataset ready to run. */
export interface Dataset extends Pick<DatasetSpec, 'title' | 'about' | 'version' | 'licence' | 'workloads'> {
  readonly name: string;
  readonly configuration: Configuration;
  readonly directory: string;
  /** The absolute paths of the documents the workloads read. */
  readonly documents: readonly string[];
  /** How many of the files `documents` selects were left out in preparation, by xmllint or Xerces. */
  readonly leftOut: number;
}

/** A document preparation left out, and why. */
interface Rejection {
  readonly document: string;
  readonly error: string;
}

/** The documents preparation checked: those Xerces accepts, and the others with why they were left out. */
interface Inventory {
  readonly documents: readonly string[];
  readonly rejected: readonly Rejection[];
}

/** Marks a dataset whose every file has been fetched and checked. */
const COMPLETE = '.complete';

/** The file, beside a dataset's own, that lists the documents preparation accepted. */
const INVENTORY = '.inventory.json';

/** The program that checks documents with the JDK's Xerces. */
const CHECKER = path.join(PACKAGE, 'java', 'Inventory.java');

/** The XMark generator's source file, kept with the dataset so its hash is checked. */
const XMARK_SOURCE = 'unix.c';

/** The datasets `datasets.json` describes, by name. */
const SPECS = JSON.parse(readFileSync(path.join(PACKAGE, 'datasets.json'), 'utf8')) as Record<string, DatasetSpec>;

/** Every dataset name: the public ones and the synthetic scaling series. */
export function datasetNames(): string[] {
  return [...Object.keys(SPECS), ...SCALING_SERIES.map((size) => `synthetic-${size}`)];
}

/** Whether a dataset's documents include a file, by its relative path. */
function selector(spec: DatasetSpec): (relative: string) => boolean {
  const pattern = spec.documents === undefined ? undefined : new RegExp(spec.documents);
  return (relative) => pattern?.test(relative) === true;
}

/** Lists every file below a directory, as paths relative to it. */
function filesBelow(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== COMPLETE && entry.name !== INVENTORY)
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .toSorted(byCodeUnit);
}

/** Extracts the files an archive source selects. */
async function fromArchive(source: ArchiveSource, directory: string): Promise<void> {
  const include = new RegExp(source.include);
  const exclude = source.exclude === undefined ? undefined : new RegExp(source.exclude);
  for (const entry of readTar(gunzipSync(await download(source.url)))) {
    const relative = entry.path.slice(entry.path.indexOf('/') + 1);
    if (include.test(relative) && !exclude?.test(relative)) writeBelow(directory, relative, entry.data);
  }
}

/** Fetches each file of a files source. */
async function fromFiles(source: FilesSource, directory: string): Promise<void> {
  for (const file of source.files) {
    writeBelow(directory, path.join(source.target ?? '', file), await download(new URL(file, source.base).href));
  }
}

/** Compiles CWI's xmlgen and generates one document per factor. */
async function fromXmark(source: XmarkSource, directory: string): Promise<void> {
  const tools = path.join(DATA, 'tools', 'xmark');
  mkdirSync(tools, { recursive: true });
  writeBelow(directory, XMARK_SOURCE, await download(source.url));
  const binary = path.join(tools, 'xmlgen');
  const compiled = spawnSync('/usr/bin/cc', ['-O2', '-w', '-o', binary, path.join(directory, XMARK_SOURCE)]);
  if (compiled.status !== 0) throw new Error(`Compiling xmlgen failed: ${String(compiled.stderr)}`);
  for (const factor of source.factors) {
    const generated = spawnSync(binary, ['-f', String(factor), '-o', path.join(directory, `xmark-${factor}.xml`)]);
    if (generated.status !== 0) throw new Error(`xmlgen -f ${factor} failed: ${String(generated.stderr)}`);
  }
}

/** Turns every LF not already after a CR into CRLF. */
function toCrlf(bytes: Buffer): Buffer {
  return Buffer.from(bytes.toString('latin1').replaceAll(/(?<!\r)\n/g, '\r\n'), 'latin1');
}

/** xmllint's first error, on one line, without the directory it ran in. */
function firstError(stderr: string, directory: string): string {
  const lines = stderr.split('\n').filter((line) => line.trim() !== '');
  const line = lines.find((text) => /error/i.test(text)) ?? lines[0] ?? 'failed';
  const prefix = directory + path.sep;
  return `xmllint: ${line.replaceAll(prefix, '').trim()}`;
}

/** Rewrites a document with xmllint, which reads its DTDs through the catalogs and so checks it; returns what it reports on failing. */
function rewrite(
  file: string,
  target: string,
  options: readonly string[],
  catalogs: readonly string[]
): string | undefined {
  const run = spawnSync('/usr/bin/xmllint', [...options, '--output', target, file], {
    env: { ...process.env, XML_CATALOG_FILES: catalogs.join(' ') },
    encoding: 'latin1',
  });
  if (run.error) throw new Error(`Running xmllint failed: ${run.error.message}`);
  if (run.status === 0) {
    if (!existsSync(target)) throw new Error(`xmllint accepted ${file} but wrote nothing`);
    return undefined;
  }
  rmSync(target, { force: true });
  return run.stderr;
}

/** Builds a derived copy of another dataset; returns the documents xmllint fails on, which it leaves out. */
async function fromDerived(source: DerivedSource, spec: DatasetSpec, directory: string): Promise<Rejection[]> {
  const original = await ensureDataset(source.from);
  const selects = selector(spec);
  if (source.transform === 'copy') {
    const include = new RegExp(source.include ?? '');
    for (const relative of filesBelow(original.directory).filter((name) => include.test(name))) {
      writeBelow(directory, relative, readFileSync(path.join(original.directory, relative)));
    }
    return [];
  }
  if (source.transform === 'crlf') {
    for (const relative of filesBelow(original.directory)) {
      const bytes = readFileSync(path.join(original.directory, relative));
      writeBelow(directory, relative, selects(relative) ? toCrlf(bytes) : bytes);
    }
    return [];
  }
  // --nsclean declares each namespace once rather than on every element; UTF-8 output can hold every character.
  const options = ['--noent', '--loaddtd', '--nsclean', '--nonet', '--encode', 'UTF-8'];
  // A simplified copy also drops the DOCTYPE, so that it is plain XML.
  if (source.transform === 'simplified') options.push('--dropdtd');
  const rejected: Rejection[] = [];
  const files = filesBelow(original.directory);
  const catalogs = files.filter((relative) => path.basename(relative) === 'catalog.xml');
  for (const relative of files.filter((name) => selects(name))) {
    const file = path.join(original.directory, relative);
    // Documents without a DOCTYPE are left out: most are fragments that other documents include.
    if (!/<!DOCTYPE/.test(readFileSync(file, 'latin1').slice(0, 2000))) continue;
    // The catalogs in the document's own top folder come first, so that a translation finds its own entities.
    const top = `${relative.split(path.sep)[0]}${path.sep}`;
    const ordered = [...catalogs.filter((c) => c.startsWith(top)), ...catalogs.filter((c) => !c.startsWith(top))];
    const target = path.join(directory, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    const failed = rewrite(
      file,
      target,
      options,
      ordered.map((c) => path.join(original.directory, c))
    );
    if (failed !== undefined) rejected.push({ document: relative, error: firstError(failed, original.directory) });
  }
  return rejected;
}

/** Where a generated source is written: its path, or its numbered copies, such as `document-1.xml`. */
function copies(source: GeneratedSource): string[] {
  if (source.copies === undefined) return [source.path];
  const { name, ext } = path.parse(source.path);
  return Array.from({ length: source.copies }, (_, i) =>
    path.join(path.dirname(source.path), `${name}-${i + 1}${ext}`)
  );
}

/** Runs every source of a dataset into its directory; returns the documents a transform left out. */
async function build(spec: DatasetSpec, directory: string): Promise<Rejection[]> {
  const rejected: Rejection[] = [];
  for (const source of spec.sources) {
    if (source.kind === 'archive') await fromArchive(source, directory);
    else if (source.kind === 'files') await fromFiles(source, directory);
    else if (source.kind === 'xmark') await fromXmark(source, directory);
    else if (source.kind === 'derived') rejected.push(...(await fromDerived(source, spec, directory)));
    else for (const target of copies(source)) writeBelow(directory, target, new TextEncoder().encode(source.text));
  }
  return rejected;
}

/** Checks every file against the dataset's manifest, or writes the manifest when pinning. */
function verify(name: string, directory: string, pinning: boolean): void {
  const manifest = path.join(PACKAGE, 'datasets', `${name}.json`);
  const hashes: Record<string, string> = {};
  for (const relative of filesBelow(directory)) hashes[relative] = sha256(readFileSync(path.join(directory, relative)));
  if (pinning) {
    writeFileSync(manifest, `${JSON.stringify(hashes, undefined, 1)}\n`);
    return;
  }
  const pinned = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, string>;
  const wrong = [...new Set([...Object.keys(pinned), ...Object.keys(hashes)])].filter(
    (file) => pinned[file] !== hashes[file]
  );
  if (wrong.length > 0) throw new Error(`${name}: ${wrong.length} files differ from the manifest, such as ${wrong[0]}`);
}

/** Checks each document a dataset selects with the JDK's Xerces, and writes the inventory of those it accepts. */
function takeInventory(spec: DatasetSpec, directory: string, earlier: readonly Rejection[]): void {
  const candidates = filesBelow(directory).filter(selector(spec));
  if (candidates.length === 0 && earlier.length === 0) return;
  const java = javaExecutable();
  const checked = spawnSync(java, [CHECKER], {
    input: candidates.map((relative) => path.join(directory, relative)).join('\n'),
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  });
  const answers = checked.stdout.split('\n');
  if (checked.status !== 0 || answers.length < candidates.length) {
    throw new Error(`Checking documents with ${java} failed: ${checked.stderr || checked.error?.message}`);
  }
  const inventory: Inventory = {
    documents: candidates.filter((_, i) => answers[i] === 'ok'),
    rejected: [
      ...earlier,
      ...candidates.flatMap((document, i) => (answers[i] === 'ok' ? [] : [{ document, error: answers[i] ?? '' }])),
    ],
  };
  writeFileSync(path.join(directory, INVENTORY), `${JSON.stringify(inventory, undefined, 1)}\n`);
}

/** Builds a synthetic document of the scaling series, if it is not there yet. */
function synthetic(name: string): Dataset {
  const elements = Number(name.slice('synthetic-'.length));
  const directory = path.join(DATA, name);
  const file = path.join(directory, 'document.xml');
  if (!existsSync(file)) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, generate(elements));
  }
  return {
    name,
    title: `Synthetic, ${elements >= 1_000_000 ? elements / 1_000_000 + ' M' : elements / 1000 + ' K'} elements`,
    version: 'seed 1',
    licence: 'generated',
    configuration: 'standalone',
    directory,
    documents: [file],
    leftOut: 0,
  };
}

/** The bytes a workload reads for a document: the document, and in a dataset read with its DTDs, the files that are not documents. */
export function inputBytes(dataset: Dataset, file: string): number {
  const own = statSync(file).size;
  if (dataset.configuration === 'standalone') return own;
  const documents = new Set(dataset.documents);
  const others = filesBelow(dataset.directory)
    .map((relative) => path.join(dataset.directory, relative))
    .filter((other) => !documents.has(other));
  return others.reduce((sum, other) => sum + statSync(other).size, own);
}

/** Returns a dataset, fetching or building it first if needed; pinning writes its manifest instead of checking it. */
export async function ensureDataset(name: string, pinning = false): Promise<Dataset> {
  if (name.startsWith('synthetic-')) return synthetic(name);
  const spec = SPECS[name];
  if (!spec) throw new Error(`No dataset named ${name} in datasets.json`);
  const directory = path.join(DATA, name);
  const derived = spec.sources.some((source) => source.kind === 'derived');
  if (pinning || !existsSync(path.join(directory, COMPLETE))) {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    const rejected = await build(spec, directory);
    if (!derived) verify(name, directory, pinning);
    takeInventory(spec, directory, rejected);
    writeFileSync(path.join(directory, COMPLETE), '');
  }
  // A dataset that only supplies files to others has no inventory, and so no documents.
  const file = path.join(directory, INVENTORY);
  const inventory = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Inventory) : undefined;
  return {
    name,
    title: spec.title,
    ...(spec.about !== undefined && { about: spec.about }),
    version: spec.version,
    licence: spec.licence,
    configuration: spec.configuration ?? 'standalone',
    ...(spec.workloads !== undefined && { workloads: spec.workloads }),
    directory,
    documents: (inventory?.documents ?? []).map((relative) => path.join(directory, relative)),
    leftOut: inventory?.rejected.length ?? 0,
  };
}
