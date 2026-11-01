import { ensureSuite, suites } from '../src/fetch.ts';

/** Fetches every missing suite once, before the test files start, so that no two of them fetch one at the same time. */
export default async function setup(): Promise<void> {
  for (const name of Object.keys(suites())) await ensureSuite(name);
}
