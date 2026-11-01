import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '@exemplarjs/canonical';
import { cjkDecoders } from '@exemplarjs/encodings-cjk';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { ensureSuite } from '../src/fetch.ts';

const japanese = path.join(await ensureSuite('xmlts'), 'xmlconf', 'japanese');
const xml = new XMLInputFactory({ decoders: cjkDecoders, errorHandler: { error: () => undefined } });

/** A document's canonical form, read in chunks of one size so that sequences split across chunks. */
function read(bytes: Uint8Array, size: number): string {
  const chunks = function* () {
    for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
  };
  const reader = xml.createStreamReader(chunks());
  expect(reader.eventType()).toBe(EventType.START_DOCUMENT);
  return canonicalize(reader, { method: 'suite-first' });
}

describe("the suite's Japanese documents read in each encoding as their copies in Unicode do", () => {
  for (const name of ['pr-xml', 'weekly']) {
    it(name, () => {
      const utf8 = readFileSync(path.join(japanese, `${name}-utf-8.xml`));
      const expected = read(utf8, utf8.length);
      for (const encoding of ['euc-jp', 'shift_jis', 'iso-2022-jp']) {
        const bytes = readFileSync(path.join(japanese, `${name}-${encoding}.xml`));
        for (const size of [bytes.length, 7, 1])
          expect(read(bytes, size), `${encoding} in chunks of ${size}`).toBe(expected);
      }
      // The UTF-16 copies were made with each CRLF turned into two LFs, so they are compared with each other.
      const big = readFileSync(path.join(japanese, `${name}-utf-16.xml`));
      const little = readFileSync(path.join(japanese, `${name}-little-endian.xml`));
      expect(read(little, 7)).toBe(read(big, big.length));
    });
  }
});
