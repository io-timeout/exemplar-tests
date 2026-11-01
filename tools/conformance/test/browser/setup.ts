import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { type XmltsTest, readXmlts } from '../../src/catalogue/xmlts.ts';
import { ensureSuite } from '../../src/fetch.ts';
import { type ExpectedFailures, expectedFailures } from '../../src/ratchet.ts';

/** What the browser tests are given: the suite's catalogue, its files, and the expected failures. */
export interface BrowserSuite {
  readonly root: string;
  readonly tests: readonly XmltsTest[];
  /** Every file below the root, relative to it. */
  readonly files: readonly string[];
  readonly failures: ExpectedFailures;
}

declare module 'vitest' {
  export interface ProvidedContext {
    xmlts: BrowserSuite;
  }
}

/** Every file below a directory, relative to it. */
function filesBelow(directory: string, prefix = ''): string[] {
  return readdirSync(directory).flatMap((name) => {
    const relative = prefix === '' ? name : `${prefix}/${name}`;
    const full = path.join(directory, name);
    return statSync(full).isDirectory() ? filesBelow(full, relative) : [relative];
  });
}

/** Reads the catalogue in Node and gives it to the tests that run in the browsers. */
export default async function setup(project: TestProject): Promise<void> {
  const root = path.join(await ensureSuite('xmlts'), 'xmlconf');
  project.provide('xmlts', { root, tests: readXmlts(root), files: filesBelow(root), failures: expectedFailures() });
}
