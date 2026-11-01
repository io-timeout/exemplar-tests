import { describe, expect, it } from 'vitest';
import { jdkCatalog } from '@exemplarjs/adapters';
import { catalogDifferential } from '../src/catalog-differential.ts';
import { knownDifferences } from '../src/differential.ts';

const known = knownDifferences();

describe.runIf(jdkCatalog().version !== 'JDK 0')('exemplar against javax.xml.catalog', () => {
  it('agrees on every lookup but the known differences, each of which still differs', async () => {
    const { disagreements } = await catalogDifferential(known);
    expect(disagreements.filter((entry) => entry.status === 'triage')).toEqual([]);
    const listed = Object.keys(known).filter((key) => key.startsWith('jdk-catalog/'));
    expect(disagreements.map((entry) => `jdk-catalog/${entry.id}`).toSorted()).toEqual(listed.toSorted());
  }, 60_000);
});
