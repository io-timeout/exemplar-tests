import { describe, expect, it } from 'vitest';
import { readXmlIdSuite } from '../src/catalogue/xml-id.ts';
import { ensureSuite } from '../src/fetch.ts';
import { expectedFailures, unknownEntries } from '../src/ratchet.ts';
import { readIds } from '../src/xml-id.ts';

const root = await ensureSuite('xml-id');
const tests = readXmlIdSuite(root);
const failures = expectedFailures();
const keys = new Set<string>();

const applicable = tests.filter((test) => test.feature !== 'schema');

describe('exemplar on the xml:id Test Suite', () => {
  it('holds the tests testing.md counts, two of which need a schema-aware processor', () => {
    expect([tests.length, tests.length - applicable.length]).toEqual([13, 2]);
  });

  for (const test of applicable) {
    const key = `xml-id/${test.id}`;
    keys.add(key);
    const run = key in failures ? it.fails : it;
    run(test.id, () => {
      const { ids, errors } = readIds(test);
      expect(ids).toEqual(test.ids);
      // Other tests may report errors too: the value of normal_001 is not an NCName, which is an xml:id error.
      if (test.category === 'error') expect(errors.length, 'xml:id errors').toBeGreaterThan(0);
    });
  }

  it('lists no expected failure that names no test', () => {
    expect(unknownEntries(failures, keys, 'xml-id/')).toEqual([]);
  });
});
