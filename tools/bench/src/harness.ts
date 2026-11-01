import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { type Workload, decode, detectedEncoding } from '@exemplarjs/adapters';
import type { Correctness } from './correctness.ts';
import type { Dataset } from './datasets.ts';
import { library } from './libraries.ts';
import type { Measurement } from './worker.ts';

/** A library timed only on the documents it reads correctly. */
export interface Fair {
  /** The documents this workload reads that the reference accepts and, for other libraries, read while timed; and their size. */
  readonly eligible: number;
  readonly eligibleBytes: number;
  /** Of those, the documents the library read correctly without throwing, and their size. */
  readonly documents: number;
  /** Of the eligible documents, those whose timed count differed from exemplar's, in the workloads whose counts are checked. */
  readonly miscounted?: number;
  readonly bytes: number;
  /** The library's best round over those documents. */
  readonly bestMs: number;
}

/** One library's rounds on one workload and dataset, summarized. */
export interface Summary {
  readonly library: string;
  readonly version: string;
  readonly workload: Workload;
  readonly dataset: string;
  readonly rounds: readonly Measurement[];
  readonly bestMs: number;
  readonly medianMs: number;
  /** The spread between rounds, as a share of the best. */
  readonly noise: number;
  readonly documents: number;
  /** Documents the library threw on. */
  readonly errors: number;
  /** Left out when the library threw on every document, since the time then measures nothing. */
  readonly nsPerEvent?: number;
  /** For `tree`: the least memory the dataset's trees held in any round, in MB. */
  readonly retainedMB?: number;
  /** Speed on the documents the library reads correctly; left out when output was not checked. */
  readonly fair?: Fair;
}

const WORKER = fileURLToPath(new URL('worker.ts', import.meta.url));

/** Room for the largest datasets' trees, which the default heap limit does not hold. */
const HEAP_LIMIT = '--max-old-space-size=16384';

/** Runs one round in a fresh process, so no library's compiled code or heap affects another's. */
function round(name: string, workload: Workload, dataset: string): Promise<Measurement> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--expose-gc', HEAP_LIMIT, WORKER, name, workload, dataset], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(JSON.parse(stdout) as Measurement);
      else reject(new Error(`${name} ${workload} ${dataset} exited with ${code}`));
    });
  });
}

/** Counts each markup start and each non-blank text run in a document. */
function eventsIn(text: string): number {
  let events = 0;
  let inText = false;
  let blank = true;
  for (let i = 0; i < text.length; i++) {
    // eslint-disable-next-line prefer-code-point -- ASCII is never half a surrogate pair
    const code = text.charCodeAt(i);
    if (code === 0x3c) {
      events += inText && !blank ? 2 : 1;
      inText = false;
    } else if (code === 0x3e) {
      [inText, blank] = [true, true];
    } else if (inText && code > 0x20) {
      blank = false;
    }
  }
  return events;
}

/** Counts a document's events by a rule no library supplies: each markup start and each non-blank text run. */
export function countEvents(bytes: Uint8Array): number {
  try {
    return eventsIn(decode(bytes, detectedEncoding(bytes)));
  } catch {
    // A document no decoder accepts has no events to count.
    return 0;
  }
}

/** The middle value of a list of numbers. */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** The best round's total time over the chosen documents. */
function bestOver(rounds: readonly Measurement[], chosen: ReadonlySet<number>): number {
  const totals = rounds.map(({ perDocument: times }) => {
    let total = 0;
    if (times) for (const [k, index] of times.index.entries()) if (chosen.has(index)) total += times.ms[k] as number;
    return total;
  });
  return Math.min(...totals);
}

/** The documents, by index in the dataset, that a library threw on in any round. */
function thrown(rounds: readonly Measurement[]): Set<number> {
  const failed = new Set<number>();
  for (const times of rounds.flatMap((measurement) => measurement.perDocument ?? [])) {
    for (const [k, index] of times.index.entries()) if (times.failed[k] === 1) failed.add(index);
  }
  return failed;
}

/** The workloads whose timed counts follow the rule in the adapters' `content.ts`, and so must equal exemplar's. */
const COUNTED: ReadonlySet<Workload> = new Set(['read', 'small', 'stream', 'dtd']);

/** The documents, by index, whose count in the first round differs from the reference's, where counts are checked. */
function miscounted(workload: Workload, own: readonly Measurement[], reference: readonly Measurement[]): Set<number> {
  const differ = new Set<number>();
  const mine = own[0]?.perDocument;
  const theirs = reference[0]?.perDocument;
  if (!COUNTED.has(workload) || mine === undefined || theirs === undefined) return differ;
  const expected = new Map(theirs.index.map((index, k) => [index, theirs.counts[k]]));
  for (const [k, index] of mine.index.entries()) if (mine.counts[k] !== expected.get(index)) differ.add(index);
  return differ;
}

/** Times a library on the documents it reads correctly. */
function fairly(
  name: string,
  workload: Workload,
  measured: ReadonlyMap<string, readonly Measurement[]>,
  correctness: Correctness
): Fair | undefined {
  const own = measured.get(name) ?? [];
  const times = own[0]?.perDocument;
  const right = correctness.correct.get(name);
  if (times === undefined || right === undefined) return undefined;
  const reference = measured.get('exemplar') ?? [];
  const failed = thrown(own);
  // A document the reference threw on while timed counts against the reference only: it judges no other library.
  const unjudged = name === 'exemplar' ? new Set<number>() : thrown(reference);
  const counts = miscounted(workload, own, reference);
  const chosen = new Set<number>();
  let eligible = 0;
  let wrongCount = 0;
  let eligibleBytes = 0;
  let bytes = 0;
  for (const [k, index] of times.index.entries()) {
    if (correctness.accepted[index] !== true || unjudged.has(index)) continue;
    eligible++;
    eligibleBytes += times.bytes[k] as number;
    if (counts.has(index) && !failed.has(index)) wrongCount++;
    if (right[index] !== true || failed.has(index) || counts.has(index)) continue;
    chosen.add(index);
    bytes += times.bytes[k] as number;
  }
  return {
    eligible,
    eligibleBytes,
    documents: chosen.size,
    ...(COUNTED.has(workload) && reference.length > 0 && { miscounted: wrongCount }),
    bytes,
    bestMs: bestOver(own, chosen),
  };
}

/** Runs every library's round 1, then every library's round 2, and so on, and summarizes each library. */
export async function measure(
  libraries: readonly string[],
  workload: Workload,
  dataset: Dataset,
  rounds: number,
  events?: number,
  correctness?: Correctness
): Promise<Summary[]> {
  const measured = new Map<string, Measurement[]>(libraries.map((name) => [name, []]));
  for (let r = 0; r < rounds; r++) {
    for (const name of libraries) measured.get(name)?.push(await round(name, workload, dataset.name));
  }
  return libraries.map((name) => {
    const list = measured.get(name) ?? [];
    const times = list.map((measurement) => measurement.ms);
    const bestMs = Math.min(...times);
    const { documents = 0, errors = 0 } = list[0] ?? {};
    const parsed = errors < documents;
    const retained = list.flatMap((measurement) => measurement.retained ?? []);
    const fair = correctness && fairly(name, workload, measured, correctness);
    return {
      library: name,
      version: library(name).version,
      workload,
      dataset: dataset.name,
      rounds: list.map(({ perDocument: _times, ...measurement }) => measurement),
      bestMs,
      medianMs: median(times),
      noise: (Math.max(...times) - bestMs) / bestMs,
      documents,
      errors,
      ...(parsed && events !== undefined && events > 0 && { nsPerEvent: (bestMs * 1e6) / events }),
      ...(parsed && retained.length > 0 && { retainedMB: Math.min(...retained) / 1e6 }),
      ...(fair && { fair }),
    };
  });
}
