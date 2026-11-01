import { describe, expect, it } from 'vitest';
import { readDomTests, runDomTest } from '../src/dom.ts';
import { ensureSuite } from '../src/fetch.ts';
import { expectedFailures, unknownEntries } from '../src/ratchet.ts';

const root = await ensureSuite('dom');
const tests = readDomTests(root);
const failures = expectedFailures();
const keys = new Set<string>();

// A listed test runs as `it.fails`; a test that needs what exemplar lacks, such as XML Schema, is skipped with the reason.
describe('exemplar on the DOM Conformance Test Suite', () => {
  for (const test of tests) {
    const key = `dom/${test.module}/${test.name}`;
    keys.add(key);
    const run = key in failures ? it.fails : it;
    run(`${test.module}/${test.name}`, (context) => {
      const result = runDomTest(root, test);
      if (result.skipped !== undefined) context.skip(result.skipped);
      expect(result.pass, result.reason).toBe(true);
    });
  }

  it('lists no expected failure that names no test', () => {
    expect(unknownEntries(failures, keys, 'dom/')).toEqual([]);
  });
});
