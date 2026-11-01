import { createReadStream } from 'node:fs';
import { Parser } from 'saxen';
import {
  type Adapter,
  type CanonicalForm,
  type Input,
  type Outcome,
  type Source,
  type Workload,
  rejection,
  unsupported,
} from './adapter.ts';
import { CanonicalWriter } from './canonical.ts';
import { attributeLength, instructionLength, localLength } from './content.ts';
import { decode, declaredVersion, installedVersion } from './decode.ts';

/** The namespace the `xml` prefix is bound to. */
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

/** Splits saxen's raw `<?target data?>` into its target and data. */
function instruction(raw: string): [string, string] | undefined {
  if (!raw.startsWith('<?') || !raw.endsWith('?>') || raw.length < 5) return undefined;
  const body = raw.slice(2, -2);
  let end = 0;
  while (end < body.length && !/[\s?]/.test(body[end] ?? '')) end++;
  if (end === 0) return undefined;
  return [body.slice(0, end), body.slice(end).trimStart()];
}

/** Parses a document with saxen, decoding entities as its README asks of callers; errors reject it. */
function canonical(source: Source, form: CanonicalForm): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    writer.version(declaredVersion(source.bytes, source.encoding));
    const parser = new Parser();
    parser.on('error', (error) => {
      throw error;
    });
    parser.on('openTag', (name, attributes, decodeEntities) =>
      writer.startElement(
        name,
        Object.entries(attributes()).map(([key, value]): [string, string] => [key, decodeEntities(value)])
      )
    );
    parser.on('closeTag', (name) => writer.endElement(name));
    parser.on('text', (text, decodeEntities) => writer.text(decodeEntities(text)));
    parser.on('cdata', (text) => writer.cdata(text));
    parser.on('question', (raw) => {
      const pi = instruction(raw);
      if (pi) writer.processingInstruction(...pi);
    });
    parser.parse(decode(source.bytes, source.encoding));
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** A parser whose handlers count events, and the count. */
interface Counter {
  readonly parser: Parser;
  readonly total: () => number;
}

/** A namespace-aware parser whose errors throw, with the `xml` prefix bound as the Namespaces specification binds it. */
function strictParser(): Parser {
  const parser = new Parser();
  parser.ns({ [XML_NAMESPACE]: 'xml' });
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
  parser.on('openTag', add).on('closeTag', add).on('text', add).on('cdata', add).on('question', add);
  return { parser, total: () => total };
}

/** Creates a parser whose handlers count the content `content.ts` defines. */
function reading(): Counter {
  let total = 0;
  let depth = 0;
  const parser = strictParser();
  parser.on('openTag', (name, attributes, decodeEntities, selfClosing) => {
    if (!selfClosing) depth++;
    total += localLength(name);
    for (const [key, value] of Object.entries(attributes())) total += attributeLength(key, decodeEntities(value));
  });
  parser.on('closeTag', (_name, _decode, selfClosing) => {
    if (!selfClosing) depth--;
  });
  parser.on('text', (text, decodeEntities) => {
    if (depth > 0) total += decodeEntities(text).length;
  });
  parser.on('cdata', (text) => {
    if (depth > 0) total += text.length;
  });
  parser.on('question', (raw) => {
    const pi = instruction(raw);
    if (pi) total += instructionLength(...pi);
  });
  return { parser, total: () => total };
}

/** Reads a file in 64 KB chunks through the parser's streaming interface. */
async function stream(path: string): Promise<number> {
  const { parser, total } = reading();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of createReadStream(path, { highWaterMark: 65_536 })) {
    parser.write(decoder.decode(chunk as Uint8Array, { stream: true }));
  }
  parser.write(decoder.decode());
  parser.end();
  return total();
}

/** saxen, the fastest of the push parsers analysed. */
export const saxenAdapter: Adapter = {
  name: 'saxen',
  version: installedVersion('saxen'),
  configurations: ['standalone'],
  workloads: ['walk', 'read', 'small', 'stream'],
  canonical: (source, _configuration, form) => canonical(source, form),
  run(workload: Workload, input: Input) {
    if (workload === 'stream') return stream(input.path);
    if (workload !== 'walk' && workload !== 'read' && workload !== 'small') throw unsupported('saxen', workload);
    const { parser, total } = workload === 'walk' ? walking() : reading();
    parser.parse(input.text);
    return total();
  },
};
