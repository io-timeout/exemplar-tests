import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Adapter, Configuration, Outcome } from '@exemplarjs/adapters';
import type { TestType, XmltsTest } from './catalogue/xmlts.ts';
import { CONFIGURATIONS, applies } from './configurations.ts';
import { type JudgeOptions, type OutputCheck, judge } from './verdict.ts';

/** One test's result under one configuration. */
export interface Result {
  readonly suite: 'xmlts';
  readonly id: string;
  readonly type: TestType;
  readonly configuration: Configuration;
  readonly applicable: boolean;
  readonly pass: boolean;
  readonly output: OutputCheck;
  readonly reason?: string;
  readonly outcome?: Outcome;
}

/** Settings for one run. */
export interface RunOptions extends JudgeOptions {
  /** How many documents an asynchronous adapter parses at once. */
  readonly concurrency?: number;
  /** The suite's directory, which `external` and `validating` may read entities and DTDs from. */
  readonly root?: string;
}

/** Runs tasks with at most `limit` in flight, keeping their order. */
async function pool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = Array.from({ length: tasks.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      if (task) results[index] = await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** Runs one test under one configuration and judges it. */
export async function runTest(
  adapter: Adapter,
  test: XmltsTest,
  configuration: Configuration,
  options: RunOptions
): Promise<Result> {
  const base = { suite: 'xmlts', id: test.id, type: test.type, configuration } as const;
  if (!applies(test)) return { ...base, applicable: false, pass: false, output: 'unchecked' };
  const source = { bytes: readFileSync(test.path), systemId: pathToFileURL(test.path).href };
  const outcome = await adapter.canonical(source, configuration, 'second', {
    namespaceAware: test.namespace,
    ...(options.root !== undefined && { root: options.root }),
  });
  const expected = test.output === undefined ? undefined : readFileSync(test.output, 'utf8');
  const verdict = judge(test, configuration, outcome, expected, options);
  return { ...base, applicable: true, ...verdict, outcome };
}

/** Runs every test through an adapter under each configuration it supports. */
export function runXmlts(adapter: Adapter, tests: readonly XmltsTest[], options: RunOptions = {}): Promise<Result[]> {
  const configurations = CONFIGURATIONS.filter((configuration) => adapter.configurations.includes(configuration));
  const tasks = configurations.flatMap((configuration) =>
    tests.map((test) => () => runTest(adapter, test, configuration, options))
  );
  return pool(tasks, options.concurrency ?? 8);
}
