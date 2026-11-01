import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type ExemplarApi,
  type Outcome,
  type ParseOptions,
  decode,
  detectedEncoding,
  exemplarAdapter,
} from '@exemplarjs/adapters';
import { readXmlts } from '../src/catalogue/xmlts.ts';
import { ensureSuite } from '../src/fetch.ts';

const root = path.join(await ensureSuite('xmlts'), 'xmlconf');
const tests = readXmlts(root);
const CHUNK_SIZES = [1, 2, 3, 7, 64, 4096];
// The DOM has no place for processing instructions in the DTD, so it is compared with SAX told to leave them out.
const DOM_APIS: readonly ExemplarApi[] = ['dom', 'async-dom'];
const APIS: readonly ExemplarApi[] = ['events', 'sax', 'async', 'async-events', 'async-sax', 'round-trip'];

/** Whether the bytes decode to a string the way a caller would decode them. */
function decodable(bytes: Uint8Array): boolean {
  try {
    decode(bytes, detectedEncoding(bytes));
    return true;
  } catch {
    return false;
  }
}

/** What must agree however a document is read: the verdict, the output, and a rejection's code and location. */
function summary(outcome: Outcome): string {
  if (outcome.accepted) return `accepted ${outcome.canonical}`;
  return `rejected ${outcome.code} at ${outcome.line}:${outcome.column}`;
}

describe('exemplar reads every suite document the same way however it arrives and whichever API reads it', () => {
  for (const test of tests) {
    it(test.id, async () => {
      const source = { bytes: readFileSync(test.path), systemId: pathToFileURL(test.path).href };
      const read = async (options: ParseOptions = {}): Promise<Outcome> =>
        exemplarAdapter.canonical(source, 'standalone', 'second', { namespaceAware: test.namespace, ...options });
      const whole = await read();
      for (const chunkSize of CHUNK_SIZES) {
        expect(summary(await read({ chunkSize })), `in chunks of ${chunkSize} bytes`).toBe(summary(whole));
      }
      for (const api of APIS) expect(summary(await read({ api })), `with ${api}`).toBe(summary(whole));
      const tree = summary(await read({ api: 'sax', dtdProcessingInstructions: false }));
      for (const api of DOM_APIS) expect(summary(await read({ api })), `with ${api}`).toBe(tree);
      expect(summary(await read({ api: 'async-dom', chunkSize: 7 })), 'async-dom in chunks of 7 bytes').toBe(tree);
      for (const chunkSize of CHUNK_SIZES) {
        const async = await read({ api: 'async', chunkSize });
        expect(summary(async), `async in chunks of ${chunkSize} bytes`).toBe(summary(whole));
      }
      // A string carries no encoding, so a document rejected for its bytes, or not decodable, has no string to compare.
      if ((!whole.accepted && whole.code?.startsWith('ENCODING_')) || !decodable(source.bytes)) return;
      expect(summary(await read({ text: true })), 'as a string').toBe(summary(whole));
    });
  }
});

describe('exemplar reads every suite document the same way with every API when it reads external entities', () => {
  for (const test of tests) {
    it(test.id, async () => {
      const source = { bytes: readFileSync(test.path), systemId: pathToFileURL(test.path).href };
      const read = async (options: ParseOptions = {}): Promise<Outcome> =>
        exemplarAdapter.canonical(source, 'external', 'second', { namespaceAware: test.namespace, root, ...options });
      const cursor = summary(await read());
      for (const api of APIS) expect(summary(await read({ api })), `with ${api}`).toBe(cursor);
      expect(summary(await read({ api: 'async', chunkSize: 7 })), 'async in chunks of 7 bytes').toBe(cursor);
      const tree = summary(await read({ api: 'sax', dtdProcessingInstructions: false }));
      for (const api of DOM_APIS) expect(summary(await read({ api })), `with ${api}`).toBe(tree);
    });
  }
});
