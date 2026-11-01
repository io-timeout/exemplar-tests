import { describe, expect, it } from 'vitest';
import { readXIncludeSuite } from '../src/catalogue/xinclude.ts';
import { ensureSuite } from '../src/fetch.ts';
import { expectedFailures, unknownEntries } from '../src/ratchet.ts';
import { expectedOutput, notApplicable, runXIncludeTest } from '../src/xinclude.ts';

const root = `${await ensureSuite('xinclude')}/XIncl20060927`;
const tests = readXIncludeSuite(root);
const failures = expectedFailures();
const keys = new Set<string>();
const applicable = tests.filter((test) => notApplicable(test) === undefined);

describe('exemplar on the XInclude Test Suite', () => {
  it('holds the tests testing.md counts, 21 of which do not apply', () => {
    expect([tests.length, tests.length - applicable.length]).toEqual([174, 21]);
  });

  for (const test of applicable) {
    const key = `xinclude/${test.id}`;
    keys.add(key);
    const run = key in failures ? it.fails : it;
    run(test.id, () => {
      const outcome = runXIncludeTest(root, test);
      if (test.type === 'error') {
        expect(outcome.accepted, 'a fatal error').toBe(false);
        return;
      }
      expect(outcome.accepted ? outcome.canonical : `${outcome.code}: ${outcome.message}`).toBe(
        expectedOutput(root, test)
      );
    });
  }

  it('lists no expected failure that names no test', () => {
    expect(unknownEntries(failures, keys, 'xinclude/')).toEqual([]);
  });
});
