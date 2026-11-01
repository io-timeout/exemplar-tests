/** The benchmark harness: workloads, datasets, interleaved rounds and reports. */
import { parseArgs } from 'node:util';
import type { Workload } from '@exemplarjs/adapters';
import { type Difference, compare } from './correctness.ts';
import { type Dataset, datasetNames, ensureDataset } from './datasets.ts';
import { type Summary, measure } from './harness.ts';
import { LIBRARIES, library } from './libraries.ts';
import { type DatasetEntry, conformanceColumns, datasetEntry, environment, writeBenchReports } from './report.ts';
import { isSmall } from './worker.ts';

const WORKLOADS: readonly Workload[] = ['walk', 'read', 'tree', 'stream', 'small', 'write', 'dtd'];

/** The workloads a dataset runs unless it names its own. */
const DEFAULT_WORKLOADS = WORKLOADS.filter((workload) => workload !== 'dtd');

/** Runs the workloads on one dataset after checking each library's output, and returns the summaries. */
async function runDataset(
  dataset: Dataset,
  libraries: readonly string[],
  workloads: readonly Workload[],
  rounds: number
): Promise<{ summaries: Summary[]; differences: Difference[] }> {
  const runs = workloads.filter((workload) => (dataset.workloads ?? DEFAULT_WORKLOADS).includes(workload));
  if (runs.length === 0) console.log(`${dataset.name}: runs none of ${workloads.join(', ')}`);
  // A dataset with workloads of its own is compared only in the libraries that have one of them.
  const compared =
    dataset.workloads === undefined
      ? libraries
      : libraries.filter((name) => runs.some((workload) => library(name).workloads.includes(workload)));
  const inMemory = runs.some((workload) => workload !== 'stream');
  const checked = inMemory
    ? await compare(
        compared.map((name) => library(name)),
        dataset
      )
    : undefined;
  const summaries: Summary[] = [];
  for (const workload of runs) {
    if (workload === 'small' && !dataset.documents.some((file) => isSmall(file))) continue;
    const able = libraries.filter((name) => library(name).workloads.includes(workload));
    if (able.length === 0) continue;
    console.log(`${dataset.name} ${workload}: ${able.join(', ')}`);
    summaries.push(...(await measure(able, workload, dataset, rounds, checked?.events, checked?.correctness)));
  }
  return { summaries, differences: checked?.differences ?? [] };
}

/** Runs datasets and workloads for the libraries, then writes the reports. */
async function run(
  names: readonly string[],
  libraries: readonly string[],
  workloads: readonly Workload[],
  rounds: number
): Promise<void> {
  const started = environment();
  const datasets: DatasetEntry[] = [];
  const differences: Record<string, readonly Difference[]> = {};
  const summaries: Summary[] = [];
  for (const name of names) {
    const dataset = await ensureDataset(name);
    if (dataset.documents.length === 0) continue;
    const results = await runDataset(dataset, libraries, workloads, rounds);
    datasets.push(datasetEntry(dataset));
    differences[name] = results.differences;
    summaries.push(...results.summaries);
  }
  await writeBenchReports({ ...started, datasets, differences, summaries, conformance: conformanceColumns() });
  for (const s of summaries) {
    console.log(`${s.dataset} ${s.workload} ${s.library}: best ${s.bestMs.toFixed(0)} ms, ${s.errors} errors`);
  }
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    datasets: { type: 'string' },
    workloads: { type: 'string' },
    libraries: { type: 'string' },
    rounds: { type: 'string', default: '3' },
  },
});
const [command = 'quick', ...rest] = positionals;
const named = values.datasets?.split(',');
const libraries = values.libraries?.split(',') ?? Object.keys(LIBRARIES);
const rounds = Number(values.rounds);
if (command === 'quick') {
  // Datasets read in full that run long enough to time.
  await run(named ?? ['openstack-manuals', 'xmark'], libraries, ['walk', 'read'], rounds);
} else if (command === 'full') {
  await run(datasetNames(), libraries, WORKLOADS, rounds);
} else if (command === 'run') {
  await run(named ?? [], libraries, (values.workloads?.split(',') ?? ['read']) as Workload[], rounds);
} else if (command === 'fetch' || command === 'pin') {
  for (const name of rest) {
    const dataset = await ensureDataset(name, command === 'pin');
    console.log(`${name}: ${dataset.documents.length} documents in ${dataset.directory}, ${dataset.leftOut} left out`);
  }
} else {
  throw new Error(`Unknown command ${command}; use quick, full, run, fetch or pin`);
}
