import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { type Configuration, type Outcome, exemplarAdapter } from '@exemplarjs/adapters';
import { readXmlts } from '../src/catalogue/xmlts.ts';
import { ensureSuite } from '../src/fetch.ts';
import { mutate, mutations } from '../src/mutate.ts';

const root = path.join(await ensureSuite('xmlts'), 'xmlconf');
const documents = readXmlts(root).map((entry) => ({ ...entry, bytes: readFileSync(entry.path) }));
// The nightly run scales the number of runs up; a failure's seed and path replay it.
const RUNS = 300 * Number(process.env['EXEMPLAR_FUZZ_SCALE'] ?? 1);
const SEED = process.env['EXEMPLAR_FUZZ_SEED'];
const PATH = process.env['EXEMPLAR_FUZZ_PATH'];
const CONFIGURATIONS: readonly Configuration[] = ['standalone', 'external', 'validating'];

/** What must agree however a document arrives: the verdict, the output, and a rejection's code and location. */
function summary(outcome: Outcome): string {
  if (outcome.accepted) return `accepted ${outcome.canonical}`;
  return `rejected ${outcome.code} at ${outcome.line}:${outcome.column}`;
}

test.prop(
  [fc.nat(documents.length - 1), mutations, fc.constantFrom(...CONFIGURATIONS), fc.integer({ min: 1, max: 64 })],
  { numRuns: RUNS, ...(SEED !== undefined && { seed: Number(SEED) }), ...(PATH !== undefined && { path: PATH }) }
)(
  'a mutated suite document parses, or fails with a located XMLError, the same in chunks',
  async (index, list, configuration, chunkSize) => {
    const document = documents[index] as (typeof documents)[number];
    const source = { bytes: mutate(document.bytes, list), systemId: pathToFileURL(document.path).href };
    const options = { namespaceAware: document.namespace, root };
    const started = performance.now();
    const whole = await exemplarAdapter.canonical(source, configuration, 'second', options);
    expect(performance.now() - started, 'parsing time in ms').toBeLessThan(5000);
    if (!whole.accepted) {
      // An outcome without a code is something other than an XMLError.
      expect(whole.code, whole.message).toBeDefined();
      expect(whole.line).toBeGreaterThanOrEqual(1);
      expect(whole.column).toBeGreaterThanOrEqual(1);
    }
    const fed = await exemplarAdapter.canonical(source, configuration, 'second', {
      ...options,
      api: 'async',
      chunkSize,
    });
    expect(summary(fed), `async in chunks of ${chunkSize}`).toBe(summary(whole));
  },
  10_000 + RUNS * 5
);
