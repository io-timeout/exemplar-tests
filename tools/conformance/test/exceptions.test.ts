import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readXIncludeSuite } from '../src/catalogue/xinclude.ts';
import { readXmlIdSuite } from '../src/catalogue/xml-id.ts';
import { readXmlts } from '../src/catalogue/xmlts.ts';
import { applies } from '../src/configurations.ts';
import { readDomTests, runDomTest } from '../src/dom.ts';
import { ensureSuite } from '../src/fetch.ts';
import { PACKAGE } from '../src/paths.ts';
import { expectedFailures } from '../src/ratchet.ts';
import { SECTION_CORRECTIONS } from '../src/verdict.ts';
import { notApplicable } from '../src/xinclude.ts';

const report = readFileSync(path.join(PACKAGE, 'exceptions.md'), 'utf8');
const [, failuresPart = '', notApplicablePart = '', correctionsPart = ''] = report.split(
  /^## (?:Expected failures|Tests that do not apply|Catalogue corrections)$/m
);

/** The tests a part of the report names: the first cell of each table row, in backticks, linked or not. */
function named(part: string): string[] {
  return [...part.matchAll(/^\| \[?`([^`]+)`/gm)].map((match) => match[1] as string).toSorted();
}

/** The DOM tests the harness skips, because they ask for a setting exemplar's test builder cannot give. */
function skippedDomTests(root: string): string[] {
  return readDomTests(root)
    .filter((test) => readFileSync(test.path, 'utf8').includes('setImplementationAttribute('))
    .filter((test) => {
      try {
        return runDomTest(root, test).skipped !== undefined;
      } catch {
        // A page that is not valid JavaScript runs nothing, so it is not skipped.
        return false;
      }
    })
    .map((test) => test.name);
}

describe('exceptions.md', () => {
  it('names every expected failure, and no other test, under "Expected failures"', () => {
    const listed = Object.keys(expectedFailures()).map((key) => {
      const parts = key.split('/');
      // xmlts/<id>/<configuration> and xinclude/<id> name the test second; dom/<level>/core/<test> last.
      return parts[0] === 'dom' ? (parts.at(-1) as string) : (parts[1] as string);
    });
    expect(named(failuresPart)).toEqual([...new Set(listed)].toSorted());
  });

  it('names every test that does not apply, and no other test, under "Tests that do not apply"', async () => {
    const xmlRoot = path.join(await ensureSuite('xmlts'), 'xmlconf');
    const xmlts = readXmlts(xmlRoot).filter((test) => !applies(test));
    const dom = skippedDomTests(await ensureSuite('dom'));
    const xincludeRoot = `${await ensureSuite('xinclude')}/XIncl20060927`;
    const xinclude = readXIncludeSuite(xincludeRoot).filter((test) => notApplicable(test) !== undefined);
    const xmlId = readXmlIdSuite(await ensureSuite('xml-id')).filter((test) => test.feature === 'schema');
    const expected = [...xmlts, ...xinclude, ...xmlId].map((test) => test.id).concat(dom);
    expect(named(notApplicablePart)).toEqual(expected.toSorted());
  }, 60_000);

  it('names every catalogue correction, and no other test, under "Catalogue corrections"', () => {
    expect(named(correctionsPart)).toEqual(Object.keys(SECTION_CORRECTIONS).toSorted());
  });
});
