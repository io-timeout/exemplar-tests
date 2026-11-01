import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Configuration } from '@exemplarjs/adapters';
import { PACKAGE } from './paths.ts';

/** Tests exemplar does not yet pass, keyed `suite/id/configuration`, each with its reason. */
export type ExpectedFailures = Readonly<Record<string, string>>;

/** The key an expected failure is listed under. */
export function failureKey(suite: string, id: string, configuration: Configuration): string {
  return `${suite}/${id}/${configuration}`;
}

/** Reads `expected-failures.json`, or an empty list when there is none. */
export function expectedFailures(file = path.join(PACKAGE, 'expected-failures.json')): ExpectedFailures {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ExpectedFailures) : {};
}

/** Lists the entries for one suite that name no test the run knows, so they can be deleted. */
export function unknownEntries(failures: ExpectedFailures, keys: ReadonlySet<string>, suite = 'xmlts/'): string[] {
  return Object.keys(failures).filter((key) => key.startsWith(suite) && !keys.has(key));
}
