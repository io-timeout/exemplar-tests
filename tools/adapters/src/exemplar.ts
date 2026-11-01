import { openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalize } from '@exemplarjs/canonical';
import { DocumentBuilder } from '@exemplarjs/dom';
import { cjkDecoders } from '@exemplarjs/encodings-cjk';
import { type Attributes, type Locator, SAXParser, type SAXHandler } from '@exemplarjs/sax';
import { dtdValidator } from '@exemplarjs/validation';
import { StringSink, XMLOutputFactory } from '@exemplarjs/writer';
import {
  type AsyncStreamReader,
  EventType,
  type Source as ExemplarSource,
  type StreamReader,
  XMLError,
  type XMLEvent,
  XMLInputFactory,
} from '@exemplarjs/xml';
import { fileResolver } from '@exemplarjs/xml/resolvers/file';
import {
  type Adapter,
  type CanonicalForm,
  type Configuration,
  type Input,
  type Outcome,
  type ParseOptions,
  type Source,
  type Workload,
  rejection,
  unsupported,
} from './adapter.ts';
import { CanonicalWriter } from './canonical.ts';
import { instructionLength } from './content.ts';
import { decode, detectedEncoding, installedVersion } from './decode.ts';
import { writeDomTree } from './dom-tree.ts';

/** Recoverable errors and warnings are counted, not thrown, so they do not reject a well-formed document. */
const quiet = { error: () => undefined, warning: () => undefined };
const awareFactory = new XMLInputFactory({ namespacePrefixes: true, errorHandler: quiet, decoders: cjkDecoders });
const unawareFactory = new XMLInputFactory({ namespaceAware: false, errorHandler: quiet, decoders: cjkDecoders });
const readFactory = new XMLInputFactory({ errorHandler: quiet, decoders: cjkDecoders });
const treeBuilder = new DocumentBuilder(readFactory);
const writeFactory = new XMLOutputFactory();

/** Factories that read external DTDs and entities below a root, by configuration, root and namespace awareness. */
const externalFactories = new Map<string, XMLInputFactory>();

/** The factory for a configuration: `external` reads `file:` DTDs and entities below the root; `validating` also validates. */
function factoryFor(configuration: Configuration, options?: ParseOptions): XMLInputFactory {
  const aware = options?.namespaceAware !== false;
  if (configuration === 'standalone' || options?.root === undefined) return aware ? awareFactory : unawareFactory;
  const key = `${configuration} ${aware} ${options.root}`;
  let factory = externalFactories.get(key);
  if (!factory) {
    const validating = configuration === 'validating';
    factory = new XMLInputFactory({
      namespaceAware: aware,
      namespacePrefixes: aware,
      errorHandler: quiet,
      accessExternalDTD: ['file'],
      accessExternalEntities: ['file'],
      entityResolver: fileResolver({ root: options.root }),
      decoders: cjkDecoders,
      ...(validating && { validator: dtdValidator() }),
    });
    externalFactories.set(key, factory);
  }
  return factory;
}

/** A factory that reads as `read` does, and reads `file:` DTDs and entities below `root`. */
function dtdFactory(root: string): XMLInputFactory {
  return new XMLInputFactory({
    errorHandler: quiet,
    decoders: cjkDecoders,
    accessExternalDTD: ['file'],
    accessExternalEntities: ['file'],
    entityResolver: fileResolver({ root }),
  });
}

/** Splits bytes into chunks of the given size. */
function* chunks(bytes: Uint8Array, size: number): Generator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}

/** Writes the reader's current event to the canonical writer. */
function write(reader: StreamReader | AsyncStreamReader, event: number, writer: CanonicalWriter): void {
  switch (event) {
    case EventType.START_ELEMENT: {
      const attributes: [string, string][] = [];
      for (let i = 0; i < reader.attributeCount(); i++)
        attributes.push([reader.attributeName(i), reader.attributeValue(i)]);
      writer.startElement(reader.name(), attributes);
      break;
    }
    case EventType.END_ELEMENT: {
      writer.endElement(reader.name());
      break;
    }
    case EventType.CHARACTERS:
    case EventType.SPACE: {
      writer.text(reader.text());
      break;
    }
    case EventType.CDATA: {
      writer.cdata(reader.text());
      break;
    }
    case EventType.PROCESSING_INSTRUCTION: {
      writer.processingInstruction(reader.piTarget(), reader.piData());
      break;
    }
    case EventType.DTD: {
      const { notations, processingInstructions } = reader.doctype();
      for (const { target, data } of processingInstructions) writer.processingInstruction(target, data);
      for (const { name, publicId, systemId } of notations) writer.notation(name, publicId, systemId);
      break;
    }
    default:
  }
}

/** Writes an event object to the canonical writer. */
function writeEvent(event: XMLEvent, writer: CanonicalWriter): void {
  switch (event.type) {
    case EventType.START_DOCUMENT: {
      writer.version(event.version === '1.1' ? '1.1' : '1.0');
      break;
    }
    case EventType.START_ELEMENT: {
      writer.startElement(
        event.name.toString(),
        event.attributes.map((a) => [a.name.toString(), a.value] as const)
      );
      break;
    }
    case EventType.END_ELEMENT: {
      writer.endElement(event.name.toString());
      break;
    }
    case EventType.CHARACTERS:
    case EventType.SPACE: {
      writer.text(event.text);
      break;
    }
    case EventType.CDATA: {
      writer.cdata(event.text);
      break;
    }
    case EventType.PROCESSING_INSTRUCTION: {
      writer.processingInstruction(event.target, event.data);
      break;
    }
    case EventType.DTD: {
      for (const { target, data } of event.doctype.processingInstructions) writer.processingInstruction(target, data);
      for (const { name, publicId, systemId } of event.doctype.notations) writer.notation(name, publicId, systemId);
      break;
    }
    default:
  }
}

/** A SAX handler that writes the canonical form, with the DTD's processing instructions or without. */
function saxWriter(writer: CanonicalWriter, dtdProcessingInstructions = true): SAXHandler {
  let locator: Locator | undefined;
  let cdata = false;
  let inDtd = false;
  return {
    startDTD: () => {
      inDtd = true;
    },
    endDTD: () => {
      inDtd = false;
    },
    setDocumentLocator: (given) => {
      locator = given;
    },
    startDocument: () => writer.version(locator?.xmlVersion ?? '1.0'),
    startElement: (_uri: string, _localName: string, qName: string, attributes: Attributes) => {
      const pairs = Array.from(
        { length: attributes.length },
        (_, i) => [attributes.qName(i), attributes.value(i)] as const
      );
      writer.startElement(qName, pairs);
    },
    endElement: (_uri, _localName, qName) => writer.endElement(qName),
    characters: (text) => (cdata ? writer.cdata(text) : writer.text(text)),
    startCDATA: () => {
      cdata = true;
    },
    endCDATA: () => {
      cdata = false;
    },
    processingInstruction: (target, data) => {
      if (dtdProcessingInstructions || !inDtd) writer.processingInstruction(target, data);
    },
    notationDecl: (name, publicId, systemId) => writer.notation(name, publicId, systemId),
  };
}

/** The bytes as an async stream of chunks, for the async APIs. */
// eslint-disable-next-line require-await -- an async source with nothing to await, so the reader takes its asynchronous path
async function* streamOf(bytes: Uint8Array, size: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}

/** The source exemplar's async APIs read: the bytes as a stream, or the text they decode to. */
function asyncInput(source: Source, options?: ParseOptions): ExemplarSource {
  if (options?.text) return input(source, options);
  const { bytes, systemId } = source;
  const stream = streamOf(bytes, options?.chunkSize ?? bytes.length);
  return { stream, systemId, ...(source.encoding !== undefined && { encoding: source.encoding }) };
}

/** Reads a document with an asynchronous cursor into the canonical writer. */
async function readWithCursor(reader: AsyncStreamReader, writer: CanonicalWriter): Promise<void> {
  const version = (): '1.0' | '1.1' => (reader.version() === '1.1' ? '1.1' : '1.0');
  if (reader.eventType() === EventType.START_DOCUMENT) writer.version(version());
  for (let event = reader.next(); event !== EventType.END_DOCUMENT; event = reader.next()) {
    if (event === EventType.NEED_INPUT) await reader.fill();
    else if (event === EventType.START_DOCUMENT) writer.version(version());
    else write(reader, event, writer);
  }
}

/** Writers for the round trip: checked, or unchecked for documents whose names Namespaces does not allow. */
const checkedWriters = new XMLOutputFactory();
const uncheckedWriters = new XMLOutputFactory({ checkWellFormedness: false });

/** Copies a document through the event writer and returns what it wrote. */
function copied(factory: XMLInputFactory, source: Source, options?: ParseOptions): string {
  const sink = new StringSink();
  const writers = options?.namespaceAware === false ? uncheckedWriters : checkedWriters;
  const writer = writers.createEventWriter(sink);
  writer.add(factory.createEventReader(input(source, options)));
  writer.flush();
  return sink.toString();
}

/** Reads a document with one of exemplar's APIs into the canonical writer; the cursor writes with `canonicalize`. */
async function readWith(
  factory: XMLInputFactory,
  writer: CanonicalWriter,
  source: Source,
  options?: ParseOptions
): Promise<string | undefined> {
  const method = writer.form === 'first' ? 'suite-first' : 'suite-second';
  switch (options?.api ?? 'cursor') {
    case 'cursor': {
      return canonicalize(factory.createStreamReader(input(source, options)), { method });
    }
    case 'round-trip': {
      const text = copied(factory, source, options);
      return canonicalize(factory.createStreamReader({ text, systemId: source.systemId }), { method });
    }
    case 'events': {
      for (const event of factory.createEventReader(input(source, options))) writeEvent(event, writer);
      break;
    }
    case 'async-events': {
      for await (const event of factory.createAsyncEventReader(asyncInput(source, options))) writeEvent(event, writer);
      break;
    }
    case 'sax': {
      saxParser(factory).parse(input(source, options), saxWriter(writer, options?.dtdProcessingInstructions));
      break;
    }
    case 'async-sax': {
      await saxParser(factory).parseAsync(asyncInput(source, options), saxWriter(writer));
      break;
    }
    case 'async': {
      await readWithCursor(factory.createAsyncStreamReader(asyncInput(source, options)), writer);
      break;
    }
    case 'dom': {
      writeDomTree(new DocumentBuilder(factory).parse(input(source, options)), writer);
      break;
    }
    case 'async-dom': {
      writeDomTree(await new DocumentBuilder(factory).parseAsync(asyncInput(source, options)), writer);
      break;
    }
    default: {
      throw new Error(`Unknown API ${options?.api ?? ''}`);
    }
  }
  return undefined;
}

/** A SAX parser over a factory that reports system ids as written, as the canonical form wants them. */
function saxParser(factory: XMLInputFactory): SAXParser {
  return new SAXParser(factory, { resolveDTDURIs: false });
}

/** The source exemplar reads: the bytes whole or in chunks, or the text they decode to. */
function input(source: Source, options?: ParseOptions): ExemplarSource {
  const { bytes, systemId } = source;
  if (options?.text) return { text: decode(bytes, source.encoding ?? detectedEncoding(bytes)), systemId };
  const content = options?.chunkSize === undefined ? { bytes } : { chunks: chunks(bytes, options.chunkSize) };
  return { ...content, systemId, ...(source.encoding !== undefined && { encoding: source.encoding }) };
}

/** Parses a document with one of exemplar's APIs, the cursor by default, and writes its canonical form. */
async function canonical(
  source: Source,
  configuration: Configuration,
  form: CanonicalForm,
  options?: ParseOptions
): Promise<Outcome> {
  // Each parse collects its own validity errors, since parses may run concurrently.
  const validityCodes: string[] = [];
  const counting = {
    error: (error: XMLError) => {
      if (error.code.startsWith('VC_')) validityCodes.push(error.code);
    },
    warning: () => undefined,
  };
  const shared = factoryFor(configuration, options);
  const factory = configuration === 'validating' ? shared.withOptions({ errorHandler: counting }) : shared;
  const writer = new CanonicalWriter(form);
  try {
    const canonical = await readWith(factory, writer, source, options);
    return {
      accepted: true,
      canonical: canonical ?? writer.toString(),
      validityErrors: validityCodes.length,
      validityCodes,
    };
  } catch (error) {
    if (!(error instanceof XMLError)) return rejection(error);
    return {
      accepted: false,
      message: error.message,
      code: error.code,
      line: error.line,
      column: error.column,
      ...(error.systemId !== undefined && { systemId: error.systemId }),
    };
  }
}

/** Counts events, or the content `content.ts` defines. */
function count(reader: StreamReader, read: boolean): number {
  let total = 0;
  let depth = 0;
  for (let event = reader.next(); event !== EventType.END_DOCUMENT; event = reader.next()) {
    if (!read) {
      total++;
      continue;
    }
    if (event === EventType.START_ELEMENT) {
      depth++;
      total += reader.localName().length;
      for (let i = 0; i < reader.attributeCount(); i++)
        total += reader.attributeLocalName(i).length + reader.attributeValue(i).length;
    } else if (event === EventType.END_ELEMENT) {
      depth--;
    } else if (event === EventType.CHARACTERS || event === EventType.CDATA || event === EventType.SPACE) {
      if (depth > 0) total += reader.text().length;
    } else if (event === EventType.PROCESSING_INSTRUCTION) {
      total += instructionLength(reader.piTarget(), reader.piData());
    }
  }
  return total;
}

/** Writes events with the event writer to a string; returns its length. */
function writeEvents(events: readonly XMLEvent[], factory: XMLOutputFactory, sink: StringSink): number {
  const writer = factory.createEventWriter(sink);
  for (const event of events) writer.add(event);
  writer.flush();
  return sink.toString().length;
}

/** Reads a file in 64 KB chunks. */
function* fileChunks(path: string): Generator<Uint8Array> {
  const descriptor = openSync(path, 'r');
  try {
    for (;;) {
      const buffer = new Uint8Array(65_536);
      const read = readSync(descriptor, buffer);
      if (read === 0) return;
      yield buffer.subarray(0, read);
    }
  } finally {
    closeSync(descriptor);
  }
}

/** What the timed workloads read, build and write with, from one build of exemplar. */
export interface TimedFactories {
  readonly read: XMLInputFactory;
  readonly tree: DocumentBuilder;
  readonly write: XMLOutputFactory;
  readonly sink: () => StringSink;
  /** Makes a factory that reads DTDs and entities below a folder; a build without a file resolver has none. */
  readonly dtd?: (root: string) => XMLInputFactory;
}

/** The timed workloads, over one build's factories. */
export function timedWorkloads(factories: TimedFactories): Pick<Adapter, 'build' | 'prepare' | 'run'> {
  const { read, tree, write, sink, dtd } = factories;
  // One factory for each folder the `dtd` workload reads documents from.
  const dtdFactories = new Map<string, XMLInputFactory>();
  const dtdFactoryFor = (root: string): XMLInputFactory => {
    if (dtd === undefined) throw unsupported('exemplar', 'dtd');
    let factory = dtdFactories.get(root);
    if (!factory) {
      factory = dtd(root);
      dtdFactories.set(root, factory);
    }
    return factory;
  };
  return {
    build: (input: Input) => tree.parse(input.text),
    prepare(workload: Workload, input: Input) {
      return workload === 'write' ? [...read.createEventReader(input.text)] : undefined;
    },
    run(workload: Workload, input: Input, prepared?: unknown) {
      if (workload === 'write') return writeEvents(prepared as readonly XMLEvent[], write, sink());
      if (workload === 'tree') return tree.parse(input.text).documentElement === null ? 0 : 1;
      if (workload === 'stream') return count(read.createStreamReader({ chunks: fileChunks(input.path) }), true);
      if (workload === 'dtd') {
        const source = { text: input.text, systemId: pathToFileURL(input.path).href };
        return count(dtdFactoryFor(path.dirname(input.path)).createStreamReader(source), true);
      }
      if (workload !== 'walk' && workload !== 'read' && workload !== 'small') throw unsupported('exemplar', workload);
      return count(read.createStreamReader(input.text), workload !== 'walk');
    },
  };
}

/** exemplar, through its cursor. */
export const exemplarAdapter: Adapter = {
  name: 'exemplar',
  version: installedVersion('@exemplarjs/xml'),
  configurations: ['standalone', 'external', 'validating'],
  workloads: ['walk', 'read', 'tree', 'small', 'stream', 'write', 'dtd'],
  canonical: (source, configuration, form, options) => canonical(source, configuration, form, options),
  ...timedWorkloads({
    read: readFactory,
    tree: treeBuilder,
    write: writeFactory,
    sink: () => new StringSink(),
    dtd: dtdFactory,
  }),
};
