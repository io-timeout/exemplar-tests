import { createReadStream } from 'node:fs';
import sax, { type Attribute, type SAXParser } from 'sax';
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
import { attributeLength, instructionLength } from './content.ts';
import { decode, declaredVersion, installedVersion } from './decode.ts';

/** Throws sax's error, so that any error event rejects the document. */
function fail(error: Error): never {
  throw error;
}

/** A strict parser whose error events throw, namespace-aware unless told otherwise; set its handlers by name to keep it fast. */
function strictParser(namespaceAware = true): SAXParser {
  const parser = sax.parser(true, { xmlns: namespaceAware });
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- sax's parser takes handlers only as properties
  parser.onerror = fail;
  return parser;
}

/** An attribute's value, whether sax tracks namespaces or not. */
function valueOf(attribute: Attribute | string): string {
  return typeof attribute === 'string' ? attribute : attribute.value;
}

/** Parses a document with sax in strict mode, namespace-aware unless told otherwise; any error event rejects it. */
function canonical(source: Source, form: CanonicalForm, options?: ParseOptions): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    writer.version(declaredVersion(source.bytes, source.encoding));
    const parser = strictParser(options?.namespaceAware !== false);
    parser.onopentag = (tag) =>
      writer.startElement(
        tag.name,
        Object.entries(tag.attributes).map(([name, attribute]): [string, string] => [name, valueOf(attribute)])
      );
    parser.onclosetag = (name) => writer.endElement(name);
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- sax's parser takes handlers only as properties
    parser.ontext = (text) => writer.text(text);
    parser.oncdata = (text) => writer.cdata(text);
    parser.onprocessinginstruction = (instruction) => writer.processingInstruction(instruction.name, instruction.body);
    parser.write(decode(source.bytes, source.encoding)).close();
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** A parser whose handlers count events, and the count. */
interface Counter {
  readonly parser: SAXParser;
  readonly total: () => number;
}

/** Creates a strict parser whose handlers count events, reading nothing. */
function walking(): Counter {
  let total = 0;
  const add = (): void => {
    total++;
  };
  const parser = strictParser();
  parser.onopentag = add;
  parser.onclosetag = add;
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- sax's parser takes handlers only as properties
  parser.ontext = add;
  parser.oncdata = add;
  parser.onprocessinginstruction = add;
  return { parser, total: () => total };
}

/** Creates a strict parser whose handlers count the content `content.ts` defines. */
function reading(): Counter {
  let total = 0;
  let depth = 0;
  const text = (value: string): void => {
    if (depth > 0) total += value.length;
  };
  const parser = strictParser();
  parser.onopentag = (tag) => {
    depth++;
    total += tag.local.length;
    for (const [name, attribute] of Object.entries(tag.attributes)) total += attributeLength(name, valueOf(attribute));
  };
  parser.onclosetag = () => {
    depth--;
  };
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- sax's parser takes handlers only as properties
  parser.ontext = text;
  parser.oncdata = text;
  parser.onprocessinginstruction = (instruction) => {
    total += instructionLength(instruction.name, instruction.body);
  };
  return { parser, total: () => total };
}

/** Reads a file in 64 KB chunks through the parser. */
async function stream(path: string): Promise<number> {
  const { parser, total } = reading();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of createReadStream(path, { highWaterMark: 65_536 })) {
    parser.write(decoder.decode(chunk as Uint8Array, { stream: true }));
  }
  parser.write(decoder.decode()).close();
  return total();
}

/** sax, the most widely used push parser. */
export const saxAdapter: Adapter = {
  name: 'sax',
  version: installedVersion('sax'),
  configurations: ['standalone'],
  workloads: ['walk', 'read', 'small', 'stream'],
  canonical: (source, _configuration, form, options) => canonical(source, form, options),
  run(workload: Workload, input: Input) {
    if (workload === 'stream') return stream(input.path);
    if (workload !== 'walk' && workload !== 'read' && workload !== 'small') throw unsupported('sax', workload);
    const { parser, total } = workload === 'walk' ? walking() : reading();
    parser.write(input.text).close();
    return total();
  },
};
