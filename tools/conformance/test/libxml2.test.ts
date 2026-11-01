import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Configuration, type Outcome, xmllintAdapter } from '@exemplarjs/adapters';
import { readXmlts } from '../src/catalogue/xmlts.ts';
import { ensureSuite } from '../src/fetch.ts';
import { type Result, runXmlts } from '../src/run.ts';

/** What libxml2's own suite program, runxmlconf, saw for one test. */
interface Reference {
  readonly configuration: Configuration;
  readonly outcome: 'rejected' | 'accepted' | 'valid' | 'invalid';
}

const reference = JSON.parse(
  readFileSync(new URL('fixtures/runxmlconf-2.9.13.json', import.meta.url), 'utf8')
) as Record<string, Reference>;

/** Reduces an adapter's outcome to what runxmlconf can tell apart. */
function category(outcome: Outcome | undefined, configuration: Configuration): string {
  if (!outcome) return 'not run';
  if (!outcome.accepted) return 'rejected';
  if (configuration !== 'validating') return 'accepted';
  return outcome.validityErrors > 0 ? 'invalid' : 'valid';
}

const adapter = xmllintAdapter();

describe.runIf(adapter.version === '2.9.13')('the runner with libxml2 2.9.13', () => {
  let results = new Map<string, Result>();

  beforeAll(async () => {
    const tests = readXmlts(path.join(await ensureSuite('xmlts'), 'xmlconf'));
    const run = await runXmlts(adapter, tests);
    results = new Map(run.map((result) => [`${result.id} ${result.configuration}`, result]));
  }, 300_000);

  it('agrees with runxmlconf on every test both run', () => {
    const disagreements = Object.entries(reference).flatMap(([id, expected]) => {
      const actual = category(results.get(`${id} ${expected.configuration}`)?.outcome, expected.configuration);
      return actual === expected.outcome
        ? []
        : [`${id} (${expected.configuration}): ${actual}, not ${expected.outcome}`];
    });
    expect(disagreements).toEqual([]);
  });
});
