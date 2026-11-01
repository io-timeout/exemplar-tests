import { type TNode, parse } from 'txml/txml';
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

/** txml's options for XML: whitespace and entities kept as the document has them. */
const OPTIONS = { keepWhitespace: true, decodeEntities: true, keepComments: false } as const;

/** Writes txml's nodes: elements, text, and processing instructions as targets, which it keeps without their data. */
function writeNodes(nodes: readonly (TNode | string)[], writer: CanonicalWriter, depth: number): void {
  for (const node of nodes) {
    if (typeof node === 'string') {
      // At the top level, txml keeps the DOCTYPE and whitespace as strings.
      if (depth > 0) writer.text(node);
    } else if (node.tagName.startsWith('?')) {
      if (node.tagName !== '?xml') writer.processingInstruction(node.tagName.slice(1), '');
    } else {
      const attributes = Object.entries(node.attributes).map(([name, value]) => [name, value ?? ''] as const);
      writer.startElement(node.tagName, attributes);
      writeNodes(node.children, writer, depth + 1);
      writer.endElement(node.tagName);
    }
  }
}

/** Parses a document with txml, which reads no DTD and recovers from some errors. */
function canonical(source: Source, form: CanonicalForm): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    writer.version(declaredVersion(source.bytes, source.encoding));
    writeNodes(parse(decode(source.bytes, source.encoding), OPTIONS), writer, 0);
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** txml, a small tree parser. */
export const txmlAdapter: Adapter = {
  name: 'txml',
  version: installedVersion('txml'),
  configurations: ['standalone'],
  workloads: ['tree'],
  canonical: (source, _configuration, form) => canonical(source, form),
  build: (input: Input) => parse(input.text, OPTIONS),
  run(workload: Workload, input: Input) {
    if (workload !== 'tree') throw unsupported('txml', workload);
    return parse(input.text, OPTIONS).length;
  },
};
