import { XMLParser } from 'fast-xml-parser';
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
import { decode, declaredVersion, installedVersion } from './decode.ts';

/** fast-xml-parser's options for XML data: attributes, order, CDATA and values kept as strings. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  cdataPropName: '#cdata',
  ignorePiTags: false,
  processEntities: true,
});

/** One node of the ordered output: its name maps to its children, and `:@` holds its attributes. */
type Ordered = Record<string, unknown> & { readonly ':@'?: Readonly<Record<string, string>> };

/** Writes the ordered output: elements, text, CDATA, and processing instructions, which it keeps without their data. */
function writeNodes(nodes: readonly Ordered[], writer: CanonicalWriter, depth: number): void {
  for (const node of nodes) {
    const name = Object.keys(node).find((key) => key !== ':@') ?? '';
    const children = (node[name] ?? []) as Ordered[];
    if (name === '#text') {
      if (depth > 0) writer.text(String(node[name]));
    } else if (name === '#cdata') {
      for (const child of children) writer.cdata((child['#text'] as string | undefined) ?? '');
    } else if (name.startsWith('?')) {
      if (name !== '?xml') writer.processingInstruction(name.slice(1), '');
    } else {
      writer.startElement(name, Object.entries(node[':@'] ?? {}));
      writeNodes(children, writer, depth + 1);
      writer.endElement(name);
    }
  }
}

/** Parses a document with fast-xml-parser, which reads internal entities but no external DTD, and recovers from errors. */
function canonical(source: Source, form: CanonicalForm): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    writer.version(declaredVersion(source.bytes, source.encoding));
    writeNodes(parser.parse(decode(source.bytes, source.encoding)) as Ordered[], writer, 0);
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** fast-xml-parser, which builds plain objects. */
export const fastXmlParserAdapter: Adapter = {
  name: 'fast-xml-parser',
  version: installedVersion('fast-xml-parser'),
  configurations: ['standalone'],
  workloads: ['tree'],
  canonical: (source, _configuration, form) => canonical(source, form),
  build: (input: Input) => parser.parse(input.text) as unknown,
  run(workload: Workload, input: Input) {
    if (workload !== 'tree') throw unsupported('fast-xml-parser', workload);
    return (parser.parse(input.text) as unknown[]).length;
  },
};
