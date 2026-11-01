import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { canonicalize } from '@exemplarjs/canonical';
import { xincludeProcessor } from '@exemplarjs/xinclude';
import { XMLError, XMLInputFactory } from '@exemplarjs/xml';
import { fileResolver } from '@exemplarjs/xml/resolvers/file';
import type { XIncludeTest } from './catalogue/xinclude.ts';

/** Features exemplar does not have, which make a test not applicable. */
export const MISSING_FEATURES: Readonly<Record<string, string>> = {
  'xpointer-scheme': 'The xpointer() scheme waits for XPath',
  'unexpanded-entities':
    'The result keeps an entity reference unexpanded, which no canonical form holds, so it cannot be compared',
};

/** Tests that negotiate content with a live server, which the runner does not reach: it reads only the suite's files. */
export const NETWORK_TESTS: ReadonlySet<string> = new Set(['harold-87', 'harold-88', 'harold-89', 'harold-90']);

/** Why a test does not apply, or undefined when it does. */
export function notApplicable(test: XIncludeTest): string | undefined {
  if (NETWORK_TESTS.has(test.id)) return 'It negotiates content with a live server';
  const feature = test.features.find((name) => name in MISSING_FEATURES);
  return feature === undefined ? undefined : MISSING_FEATURES[feature];
}

/** What running a test gave: its result's canonical form, or the error it raised. */
export type XIncludeOutcome =
  | { readonly accepted: true; readonly canonical: string }
  | { readonly accepted: false; readonly code: string; readonly message: string };

/** Factories that read the suite's files below its root, with XInclude on and off. */
function factories(root: string): { including: XMLInputFactory; plain: XMLInputFactory } {
  const plain = new XMLInputFactory({
    accessExternalDTD: ['file'],
    accessExternalEntities: ['file'],
    entityResolver: fileResolver({ root }),
    errorHandler: { error: () => {}, warning: () => {} },
  });
  return { plain, including: plain.withOptions({ xinclude: xincludeProcessor() }) };
}

/** A document's exclusive canonical form, with comments, which leaves out declarations no name uses, as results differ in them. */
function canonicalOf(factory: XMLInputFactory, file: string): string {
  const source = { bytes: readFileSync(file), systemId: pathToFileURL(file).href };
  return canonicalize(factory.createStreamReader(source), { method: 'exc-c14n', comments: true });
}

/** Runs one test: its input read with XInclude on, in canonical form. */
export function runXIncludeTest(root: string, test: XIncludeTest): XIncludeOutcome {
  try {
    return { accepted: true, canonical: canonicalOf(factories(root).including, test.path) };
  } catch (error) {
    if (!(error instanceof XMLError)) throw error;
    return { accepted: false, code: error.code, message: error.message };
  }
}

/** The expected result of a success test, in canonical form. */
export function expectedOutput(root: string, test: XIncludeTest): string {
  return canonicalOf(factories(root).plain, test.output as string);
}
