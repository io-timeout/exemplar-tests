import { createReadStream } from 'node:fs';
import { SaxesParser } from 'saxes';
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

/** An attribute's value, whether saxes tracks namespaces or not. */
function valueOf(attribute: string | { value: string }): string {
  return typeof attribute === 'string' ? attribute : attribute.value;
}

/** Parses a document with saxes, which reads no DTD beyond the predefined entities; errors reject it. */
function canonical(source: Source, form: CanonicalForm, options?: ParseOptions): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    writer.version(declaredVersion(source.bytes, source.encoding));
    const parser = new SaxesParser({ xmlns: options?.namespaceAware !== false, position: false });
    parser.on('error', (error) => {
      throw error;
    });
    parser.on('opentag', (tag) =>
      writer.startElement(
        tag.name,
        Object.entries(tag.attributes).map(([name, attribute]): [string, string] => [name, valueOf(attribute)])
      )
    );
    parser.on('closetag', (tag) => writer.endElement(tag.name));
    parser.on('text', (text) => writer.text(text));
    parser.on('cdata', (text) => writer.cdata(text));
    parser.on('processinginstruction', ({ target, body }) => writer.processingInstruction(target, body));
    parser.write(decode(source.bytes, source.encoding)).close();
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** A namespace-aware parser whose handlers count events, and the count. */
interface Counter {
  readonly parser: SaxesParser<{ xmlns: true; position: false }>;
  readonly total: () => number;
}

/** A namespace-aware parser whose errors throw. */
function strictParser(): SaxesParser<{ xmlns: true; position: false }> {
  const parser = new SaxesParser({ xmlns: true, position: false });
  parser.on('error', (error) => {
    throw error;
  });
  return parser;
}

/** Creates a parser whose handlers count events, reading nothing. */
function walking(): Counter {
  let total = 0;
  const add = (): void => {
    total++;
  };
  const parser = strictParser();
  for (const event of ['opentag', 'closetag', 'text', 'cdata', 'processinginstruction'] as const) parser.on(event, add);
  return { parser, total: () => total };
}

/** Creates a parser whose handlers count the content `content.ts` defines. */
function reading(): Counter {
  let total = 0;
  let depth = 0;
  const text = (value: string): void => {
    if (depth > 0) total += value.length;
  };
  const parser = strictParser();
  parser.on('opentag', (tag) => {
    depth++;
    total += tag.local.length;
    for (const [name, attribute] of Object.entries(tag.attributes)) total += attributeLength(name, attribute.value);
  });
  parser.on('closetag', () => {
    depth--;
  });
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('processinginstruction', ({ target, body }) => {
    total += instructionLength(target, body);
  });
  return { parser, total: () => total };
}

/** Reads a file in 64 KB chunks. */
async function stream(path: string): Promise<number> {
  const { parser, total } = reading();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of createReadStream(path, { highWaterMark: 65_536 })) {
    parser.write(decoder.decode(chunk as Uint8Array, { stream: true }));
  }
  parser.write(decoder.decode()).close();
  return total();
}

/** saxes, a strict SAX-style parser. */
export const saxesAdapter: Adapter = {
  name: 'saxes',
  version: installedVersion('saxes'),
  configurations: ['standalone'],
  workloads: ['walk', 'read', 'small', 'stream'],
  canonical: (source, _configuration, form, options) => canonical(source, form, options),
  run(workload: Workload, input: Input) {
    if (workload === 'stream') return stream(input.path);
    if (workload !== 'walk' && workload !== 'read' && workload !== 'small') throw unsupported('saxes', workload);
    const { parser, total } = workload === 'walk' ? walking() : reading();
    parser.write(input.text).close();
    return total();
  },
};
