import { readFileSync, statSync } from 'node:fs';
import { type Adapter, type Input, type Workload, decode, detectedEncoding } from '@exemplarjs/adapters';
import { type Dataset, ensureDataset, inputBytes } from './datasets.ts';
import { library } from './libraries.ts';

/** The timed pass, document by document: each input's index among the dataset's documents, size, time, 1 if it threw, and count. */
interface DocumentTimes {
  readonly index: readonly number[];
  readonly bytes: readonly number[];
  readonly ms: readonly number[];
  readonly failed: readonly number[];
  /** What the adapter counted in each document; 0 where it threw. */
  readonly counts: readonly number[];
}

/** What one worker process measured: one warm-up pass, then one timed pass. */
export interface Measurement {
  readonly ms: number;
  readonly documents: number;
  readonly errors: number;
  readonly heapUsed: number;
  readonly maxRss: number;
  /** For `tree`: the heap and external memory every document's tree holds, all kept at once. */
  readonly retained?: number;
  /** Left out of the report's rounds once the harness has summed it over the documents each comparison needs. */
  readonly perDocument?: DocumentTimes;
}

/** Whether a document is the size the `small` workload reads: 2–20 KB. */
export function isSmall(file: string): boolean {
  const { size } = statSync(file);
  return size >= 2048 && size <= 20_480;
}

/** An input with its index among the dataset's documents and its size in bytes. */
interface Indexed extends Input {
  readonly index: number;
  readonly size: number;
}

/** Loads documents into memory before timing; a document that cannot be decoded is left out. */
function load(dataset: Dataset, workload: Workload): Indexed[] {
  const inputs: Indexed[] = [];
  for (const [index, file] of dataset.documents.entries()) {
    if (workload === 'stream') {
      inputs.push({ path: file, bytes: new Uint8Array(0), text: '', index, size: statSync(file).size });
      continue;
    }
    if (workload === 'small' && !isSmall(file)) continue;
    const bytes = readFileSync(file);
    try {
      const text = decode(bytes, detectedEncoding(bytes));
      inputs.push({ path: file, bytes, text, index, size: inputBytes(dataset, file) });
    } catch {
      // A document no decoder accepts cannot be given to string-based libraries.
    }
  }
  return inputs;
}

/** What the adapter prepares for each input before timing, or undefined where it prepares nothing or fails. */
function prepare(adapter: Adapter, workload: Workload, inputs: readonly Input[]): unknown[] {
  return inputs.map((input) => {
    try {
      return adapter.prepare?.(workload, input);
    } catch {
      // A document the adapter cannot prepare fails when it is run, and is counted as an error.
      return null;
    }
  });
}

/** Per-document results, each starting at 0: time, 1 if the document threw, and what the adapter counted. */
function results(length: number): { ms: number[]; failed: number[]; counts: number[] } {
  const zeros = (): number[] => Array.from({ length }, () => 0);
  return { ms: zeros(), failed: zeros(), counts: zeros() };
}

/** Runs a workload over every input once, recording each input's results. */
async function pass(
  adapter: Adapter,
  workload: Workload,
  inputs: readonly Input[],
  prepared: readonly unknown[],
  out: ReturnType<typeof results>
): Promise<void> {
  for (const [i, input] of inputs.entries()) {
    const start = performance.now();
    try {
      const result = adapter.run(workload, input, prepared[i]);
      out.counts[i] = typeof result === 'number' ? result : await result;
    } catch {
      out.failed[i] = 1;
    }
    out.ms[i] = performance.now() - start;
  }
}

/** Collects garbage, then again after a turn of the event loop, so that native memory freed by finalizers is gone too. */
async function settle(): Promise<void> {
  globalThis.gc?.();
  await new Promise((resolve) => setImmediate(resolve));
  globalThis.gc?.();
}

/** Measures one library on one workload and dataset, in this process. */
async function work(name: string, workload: Workload, datasetName: string): Promise<Measurement> {
  const adapter = library(name);
  const inputs = load(await ensureDataset(datasetName), workload);
  const prepared = prepare(adapter, workload, inputs);
  await pass(adapter, workload, inputs, prepared, results(inputs.length));
  await settle();
  const times = results(inputs.length);
  const start = performance.now();
  await pass(adapter, workload, inputs, prepared, times);
  const ms = performance.now() - start;
  await settle();
  const heapUsed = process.memoryUsage().heapUsed;
  const retained = workload === 'tree' && adapter.build ? await retainedBy(adapter, inputs) : undefined;
  return {
    ms,
    documents: inputs.length,
    errors: times.failed.reduce((sum, failed) => sum + failed, 0),
    heapUsed,
    maxRss: process.resourceUsage().maxRSS * 1024,
    ...(retained !== undefined && { retained }),
    perDocument: { index: inputs.map((input) => input.index), bytes: inputs.map((input) => input.size), ...times },
  };
}

/** The memory in use: the heap, native memory V8 is told of, and native memory the library reports itself. */
function used(adapter: Adapter): number {
  const { heapUsed, external } = process.memoryUsage();
  return heapUsed + external + (adapter.nativeMemory?.() ?? 0);
}

/** The trees being measured, held here so that nothing collects them before the measurement. */
let kept: unknown[] = [];

/** The memory the trees of every input hold while all are kept. */
async function retainedBy(adapter: Adapter, inputs: readonly Input[]): Promise<number> {
  await settle();
  const before = used(adapter);
  for (const input of inputs) {
    try {
      kept.push(await adapter.build?.(input));
    } catch {
      // A document the library throws on holds no tree.
    }
  }
  await settle();
  const after = used(adapter);
  const trees = kept.length;
  kept = [];
  return trees === 0 ? 0 : after - before;
}

if (import.meta.main) {
  const [name = '', workload = 'read', dataset = ''] = process.argv.slice(2);
  process.stdout.write(`${JSON.stringify(await work(name, workload as Workload, dataset))}\n`);
}
