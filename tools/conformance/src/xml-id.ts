import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import type { XmlIdTest } from './catalogue/xml-id.ts';

/** What reading a test document found: its IDs in document order, and the xml:id errors reported. */
export interface XmlIdResult {
  readonly ids: readonly string[];
  readonly errors: readonly string[];
}

/** Reads a test document with the cursor, collecting the values of attributes of type ID. */
export function readIds(test: XmlIdTest): XmlIdResult {
  const errors: string[] = [];
  const factory = new XMLInputFactory({
    errorHandler: { error: (error) => errors.push(error.code), warning: () => {} },
  });
  const reader = factory.createStreamReader({
    bytes: readFileSync(test.path),
    systemId: pathToFileURL(test.path).href,
  });
  const ids: string[] = [];
  for (let event = reader.next(); event !== EventType.END_DOCUMENT; event = reader.next()) {
    if (event !== EventType.START_ELEMENT) continue;
    for (let i = 0; i < reader.attributeCount(); i++) {
      if (reader.attributeType(i) === 'ID') ids.push(reader.attributeValue(i));
    }
  }
  return { ids, errors: errors.filter((code) => code.startsWith('XMLID_')) };
}
