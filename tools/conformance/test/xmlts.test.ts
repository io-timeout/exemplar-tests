import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { saxAdapter, saxenAdapter, staxXmlAdapter } from '@exemplarjs/adapters';
import { type XmltsTest, readXmlts } from '../src/catalogue/xmlts.ts';
import { applies } from '../src/configurations.ts';
import { EVALUATED, evaluate, percent, scores } from '../src/evaluation.ts';
import { ensureSuite } from '../src/fetch.ts';

let tests: XmltsTest[] = [];

beforeAll(async () => {
  tests = readXmlts(path.join(await ensureSuite('xmlts'), 'xmlconf'));
}, 120_000);

describe('the XML suite catalogue', () => {
  it('holds the entries testing.md counts', () => {
    const byType = Object.groupBy(tests, (test) => test.type);
    expect(tests).toHaveLength(2585);
    expect(byType.valid).toHaveLength(812);
    expect(byType.invalid).toHaveLength(242);
    expect(byType['not-wf']).toHaveLength(1498);
    expect(byType.error).toHaveLength(33);
    expect(tests.filter((test) => test.output !== undefined)).toHaveLength(432);
    expect(tests.filter((test) => applies(test))).toHaveLength(2272);
  });

  it('resolves every test against its own catalogue file', () => {
    expect(tests.filter((test) => !existsSync(test.path)).map((test) => test.id)).toEqual([]);
  });
});

describe('the evaluation profile', () => {
  it.each([
    ['stax-xml', staxXmlAdapter, '62.8% (597/951)', '98.4% (243/247)', '82.2% (88/107)'],
    ['sax', saxAdapter, '38.8% (369/951)', '45.3% (112/247)', '86.0% (92/107)'],
    ['saxen', saxenAdapter, '18.3% (174/951)', '19.8% (49/247)', '84.1% (90/107)'],
  ] as const)('reproduces the evaluation scores for %s', async (name, adapter, rejectsMalformed, outsideDtd, data) => {
    const result = scores(await evaluate(adapter, tests, EVALUATED[name]));
    expect([percent(result.rejectsMalformed), percent(result.outsideDtd), percent(result.data)]).toEqual([
      rejectsMalformed,
      outsideDtd,
      data,
    ]);
  });
});
