import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Adapter, type Source, exemplarAdapter } from '@exemplarjs/adapters';
import type { Dataset } from './datasets.ts';
import { countEvents } from './harness.ts';

/** How one library's output compared with the reference on a dataset's documents that the reference accepts. */
export interface Difference {
  readonly library: string;
  /** The documents the reference accepts, and so the ones every library is judged on. */
  readonly documents: number;
  /** Of those, the documents the library accepts with other output. */
  readonly wrong: number;
  readonly first?: { readonly document: string; readonly detail: string };
}

/** Which documents the reference accepts, and which each library reads correctly, by index in the dataset. */
export interface Correctness {
  readonly accepted: readonly boolean[];
  readonly correct: ReadonlyMap<string, readonly boolean[]>;
}

/** Summarizes where two outputs part. */
function detail(actual: string, expected: string): string {
  let at = 0;
  while (at < actual.length && actual[at] === expected[at]) at++;
  return `at ${at}: got ${JSON.stringify(actual.slice(at, at + 40))}, expected ${JSON.stringify(expected.slice(at, at + 40))}`;
}

/** A library's canonical output for a document, read as its dataset is, or undefined when it rejects the document. */
async function output(adapter: Adapter, source: Source, dataset: Dataset): Promise<string | undefined> {
  try {
    const outcome = await adapter.canonical(source, dataset.configuration, 'first', { root: dataset.directory });
    return outcome.accepted ? (outcome.canonical ?? '') : undefined;
  } catch {
    return undefined;
  }
}

/** A library's difference from the reference, while it is being counted. */
type Tally = { -readonly [K in keyof Difference]: Difference[K] };

/** Adds one document to a library's tally against the reference's output. */
function record(tally: Tally, actual: string | undefined, reference: string, document: string): void {
  tally.documents++;
  if (actual === reference) return;
  if (actual !== undefined) tally.wrong++;
  tally.first ??= { document, detail: actual === undefined ? 'rejected' : detail(actual, reference) };
}

/** Compares each library's canonical output with exemplar's, document by document, before anything is timed. */
export async function compare(
  adapters: readonly Adapter[],
  dataset: Dataset
): Promise<{ differences: Difference[]; correctness: Correctness; events: number }> {
  const differences = adapters.map((adapter): Tally => ({
    library: adapter.name,
    documents: 0,
    wrong: 0,
  }));
  const accepted: boolean[] = [];
  const correct = new Map<string, boolean[]>(adapters.map((adapter) => [adapter.name, []]));
  let events = 0;
  for (const [index, file] of dataset.documents.entries()) {
    const source = { bytes: readFileSync(file), systemId: pathToFileURL(file).href };
    events += countEvents(source.bytes);
    // Each output is compared as it is made, so a large document is held at most twice.
    const reference = await output(exemplarAdapter, source, dataset);
    accepted[index] = reference !== undefined;
    for (const [n, adapter] of adapters.entries()) {
      const actual = adapter.name === exemplarAdapter.name ? reference : await output(adapter, source, dataset);
      (correct.get(adapter.name) as boolean[])[index] = reference !== undefined && actual === reference;
      // A document the reference rejects judges no library.
      if (reference !== undefined)
        record(differences[n] as Tally, actual, reference, path.relative(dataset.directory, file));
    }
  }
  return { differences, correctness: { accepted, correct }, events };
}
