import type { Configuration } from '@exemplarjs/adapters';
import type { XmltsTest } from './catalogue/xmlts.ts';

/** Every configuration the suites run under. */
export const CONFIGURATIONS: readonly Configuration[] = ['standalone', 'external', 'validating'];

/** Whether a test applies to the fifth edition of XML 1.0, or to a version that has no editions listed. */
export function applies(test: XmltsTest): boolean {
  return test.editions === undefined || test.editions.includes('5');
}
