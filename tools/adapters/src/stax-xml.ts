import { createReadStream } from 'node:fs';
import { type AnyXmlEvent, EventReaderSync, StreamReader, StreamReaderSync, WriterSync, XmlEventType } from 'stax-xml';
import {
  type Adapter,
  type CanonicalForm,
  type Input,
  type Outcome,
  type ParseOptions,
  type Source,
  type Workload,
  rejection,
  unsupported,
} from './adapter.ts';
import { CanonicalWriter } from './canonical.ts';
import { attributeLength, instructionLength, localLength } from './content.ts';
import { declaredVersion, installedVersion } from './decode.ts';

/** The cursor accessors the sync and async readers share. */
type Cursor = Pick<
  StreamReaderSync,
  'eventType' | 'name' | 'text' | 'attributeCount' | 'attributeName' | 'attributeValue'
>;

/** Writes the current event to the canonical writer. */
function write(reader: Cursor, writer: CanonicalWriter): void {
  switch (reader.eventType()) {
    case XmlEventType.START_ELEMENT: {
      const attributes: [string, string][] = [];
      for (let i = 0; i < reader.attributeCount(); i++) {
        attributes.push([reader.attributeName(i) ?? '', reader.attributeValue(i) ?? '']);
      }
      writer.startElement(reader.name() ?? '', attributes);
      break;
    }
    case XmlEventType.END_ELEMENT: {
      writer.endElement(reader.name() ?? '');
      break;
    }
    case XmlEventType.CHARACTERS: {
      writer.text(reader.text() ?? '');
      break;
    }
    case XmlEventType.CDATA: {
      writer.cdata(reader.text() ?? '');
      break;
    }
    case XmlEventType.PROCESSING_INSTRUCTION: {
      writer.processingInstruction(reader.name() ?? '', reader.text() ?? '');
      break;
    }
    default:
  }
}

/** Parses a document with stax-xml's current-token reader in document mode. */
function canonical(source: Source, form: CanonicalForm, options?: ParseOptions): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    writer.version(declaredVersion(source.bytes, source.encoding));
    const reader = new StreamReaderSync(source.bytes, {
      documentMode: 'document',
      namespaceAware: options?.namespaceAware ?? true,
      ...(source.encoding !== undefined && { encoding: source.encoding }),
    });
    while (reader.next() !== null) write(reader, writer);
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** A running count of events, or of the content `content.ts` defines, with the element depth it needs. */
interface Tally {
  total: number;
  depth: number;
}

/** Adds the current event to a tally. */
function count(reader: Cursor, read: boolean, tally: Tally): void {
  const type = reader.eventType();
  if (type === XmlEventType.START_ELEMENT) tally.depth++;
  else if (type === XmlEventType.END_ELEMENT) tally.depth--;
  if (!read) {
    tally.total++;
    return;
  }
  switch (type) {
    case XmlEventType.START_ELEMENT: {
      tally.total += localLength(reader.name() ?? '');
      for (let i = 0; i < reader.attributeCount(); i++) {
        tally.total += attributeLength(reader.attributeName(i) ?? '', reader.attributeValue(i) ?? '');
      }
      break;
    }
    case XmlEventType.CHARACTERS:
    case XmlEventType.CDATA: {
      if (tally.depth > 0) tally.total += reader.text()?.length ?? 0;
      break;
    }
    case XmlEventType.PROCESSING_INSTRUCTION: {
      tally.total += instructionLength(reader.name() ?? '', reader.text() ?? '');
      break;
    }
    default:
  }
}

/** Reads a file in 64 KB chunks through the async reader. */
async function stream(path: string): Promise<number> {
  const reader = new StreamReader(createReadStream(path, { highWaterMark: 65_536 }), { documentMode: 'document' });
  const tally = { total: 0, depth: 0 };
  while ((await reader.next()) !== null) count(reader, true, tally);
  return tally.total;
}

/** stax-xml, the StAX-style pull parser. */
export const staxXmlAdapter: Adapter = {
  name: 'stax-xml',
  version: installedVersion('stax-xml'),
  configurations: ['standalone'],
  workloads: ['walk', 'read', 'small', 'stream', 'write'],
  canonical: (source, _configuration, form, options) => canonical(source, form, options),
  prepare(workload: Workload, input: Input) {
    return workload === 'write' ? [...new EventReaderSync(input.text, { documentMode: 'document' })] : undefined;
  },
  run(workload: Workload, input: Input, prepared?: unknown) {
    if (workload === 'write') {
      const writer = new WriterSync();
      for (const event of prepared as readonly AnyXmlEvent[]) writer.writeEvent(event);
      return writer.getXmlString().length;
    }
    if (workload === 'stream') return stream(input.path);
    if (workload !== 'walk' && workload !== 'read' && workload !== 'small') throw unsupported('stax-xml', workload);
    const reader = new StreamReaderSync(input.text, { documentMode: 'document' });
    const read = workload !== 'walk';
    const tally = { total: 0, depth: 0 };
    while (reader.next() !== null) count(reader, read, tally);
    return tally.total;
  },
};
