import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type * as Libxmljs2 from 'libxmljs2';
import {
  type Adapter,
  type CanonicalForm,
  type Configuration,
  type Input,
  type Outcome,
  type Source,
  type Workload,
  rejection,
  unsupported,
} from './adapter.ts';
import { CanonicalWriter } from './canonical.ts';
import { attributeLength, instructionLength } from './content.ts';
import { declaredVersion, installedVersion } from './decode.ts';

/** libxml2's options for reading as the other libraries do: entities replaced, DTD defaults applied, no network, no size limits. */
const OPTIONS = { noent: true, dtdattr: true, nonet: true, huge: true } as const;

let bindings: typeof Libxmljs2 | undefined;

/** The native bindings, loaded on first use, so that importing the adapters loads no native code. */
function libxmljs2(): typeof Libxmljs2 {
  bindings ??= createRequire(import.meta.url)('libxmljs2') as typeof Libxmljs2;
  return bindings;
}

/** Parses bytes, which libxml2 decodes by the document's own encoding; libxmljs2 takes a Buffer, though its types say string. */
function parseBytes(bytes: Uint8Array, systemId?: string): Libxmljs2.Document {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Given the document's location, libxml2 also reads the DTD and entities it refers to.
  const options = systemId === undefined ? OPTIONS : { ...OPTIONS, dtdload: true, baseUrl: systemId };
  return libxmljs2().parseXml(buffer as unknown as string, options);
}

/** An element's qualified name, from its local name and its namespace's prefix. */
function qualified(name: string, prefix: string | null | undefined): string {
  return prefix ? `${prefix}:${name}` : name;
}

/** Writes an element: its namespace declarations as attributes, as the other trees report them, then its attributes. */
function writeElement(element: Libxmljs2.Element, writer: CanonicalWriter): void {
  const attributes: [string, string][] = element
    .namespaces(true)
    .map((ns) => [ns.prefix() ? `xmlns:${ns.prefix()}` : 'xmlns', ns.href()]);
  for (const attr of element.attrs())
    attributes.push([qualified(attr.name(), attr.namespace()?.prefix()), attr.value()]);
  const name = qualified(element.name(), element.namespace()?.prefix());
  writer.startElement(name, attributes);
  for (const child of element.childNodes()) writeNode(child, writer);
  writer.endElement(name);
}

function writeNode(node: Libxmljs2.Node, writer: CanonicalWriter): void {
  const type = node.type() as string;
  if (type === 'element') writeElement(node as Libxmljs2.Element, writer);
  else if (type === 'text') writer.text((node as Libxmljs2.Element).text());
  else if (type === 'cdata') writer.cdata((node as Libxmljs2.Element).text());
  else if (type === 'pi')
    writer.processingInstruction((node as Libxmljs2.Element).name(), (node as Libxmljs2.Element).text());
}

/** The document's own children, which are the root's siblings: processing instructions, comments and the DTD. */
function* topLevel(document: Libxmljs2.Document): Generator<Libxmljs2.Node> {
  let node: Libxmljs2.Node | null = document.root();
  while (node?.prevSibling() != null) node = node.prevSibling();
  for (; node !== null; node = node.nextSibling()) yield node;
}

/** Parses a document with libxml2 through libxmljs2; any configuration but `standalone` reads its DTD and entities. */
function canonical(source: Source, configuration: Configuration, form: CanonicalForm): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    writer.version(declaredVersion(source.bytes, source.encoding));
    const external = configuration === 'standalone' ? undefined : source.systemId;
    for (const node of topLevel(parseBytes(source.bytes, external))) writeNode(node, writer);
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** Counts the content `content.ts` defines in a node and below it. */
function countNode(node: Libxmljs2.Node): number {
  const type = node.type() as string;
  if (type === 'text' || type === 'cdata') return (node as Libxmljs2.Element).text().length;
  if (type === 'pi') return instructionLength((node as Libxmljs2.Element).name(), (node as Libxmljs2.Element).text());
  if (type !== 'element') return 0;
  const element = node as Libxmljs2.Element;
  let total = element.name().length;
  for (const attr of element.attrs()) total += attributeLength(attr.name(), attr.value());
  for (const child of element.childNodes()) total += countNode(child);
  return total;
}

/** libxmljs2: libxml2's tree, through native bindings, on Node only. */
export const libxmljs2Adapter: Adapter = {
  name: 'libxmljs2',
  version: installedVersion('libxmljs2'),
  configurations: ['standalone'],
  workloads: ['tree', 'dtd'],
  canonical: (source, configuration, form) => canonical(source, configuration, form),
  build: (input: Input) => parseBytes(input.bytes),
  nativeMemory: () => libxmljs2().memoryUsage(),
  run(workload: Workload, input: Input) {
    if (workload === 'dtd') {
      const document = parseBytes(input.bytes, pathToFileURL(input.path).href);
      return [...topLevel(document)].reduce((sum, node) => sum + countNode(node), 0);
    }
    if (workload !== 'tree') throw unsupported('libxmljs2', workload);
    return parseBytes(input.bytes).root() === null ? 0 : 1;
  },
};
