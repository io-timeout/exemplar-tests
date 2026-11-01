import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exemplarAdapter } from '@exemplarjs/adapters';
import { readXmlts } from '../src/catalogue/xmlts.ts';
import { applies } from '../src/configurations.ts';
import { ensureSuite } from '../src/fetch.ts';
import { expectedFailures, failureKey, unknownEntries } from '../src/ratchet.ts';
import { runTest } from '../src/run.ts';

const root = path.join(await ensureSuite('xmlts'), 'xmlconf');
const tests = readXmlts(root);
const failures = expectedFailures();
const keys = new Set<string>();

// A listed test runs as `it.fails`, so one that starts passing fails the run until its entry is deleted.
describe('exemplar on the XML suite', () => {
  for (const configuration of exemplarAdapter.configurations) {
    describe(configuration, () => {
      for (const test of tests) {
        if (!applies(test)) continue;
        const key = failureKey('xmlts', test.id, configuration);
        keys.add(key);
        const run = key in failures ? it.fails : it;
        run(test.id, async () => {
          const result = await runTest(exemplarAdapter, test, configuration, { requireLocation: true, root });
          expect(result.pass, result.reason).toBe(true);
        });
      }
    });
  }

  it('lists no expected failure that names no test', () => {
    expect(unknownEntries(failures, keys)).toEqual([]);
  });
});
