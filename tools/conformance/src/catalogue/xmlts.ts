import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StreamReaderSync, XmlEventType } from 'stax-xml';
import { detectedEncoding } from '@exemplarjs/adapters';

/** What a test document must do, by the catalogue's TYPE. */
export type TestType = 'valid' | 'invalid' | 'not-wf' | 'error';

/** Which external entities a test document needs. */
export type Entities = 'none' | 'general' | 'parameter' | 'both';

/** One entry of the XML Conformance Test Suite's catalogue. */
export interface XmltsTest {
  readonly id: string;
  readonly type: TestType;
  readonly entities: Entities;
  readonly recommendation: string;
  readonly version?: string;
  readonly editions?: readonly string[];
  /** False for tests marked NAMESPACE="no". */
  readonly namespace: boolean;
  readonly sections: string;
  /** The test document's absolute path. */
  readonly path: string;
  /** The expected output's absolute path. */
  readonly output?: string;
  /** For an invalid test, whether its document has a document type declaration. */
  readonly doctype?: boolean;
  readonly description: string;
}

/** Reads the external entities `xmlconf.xml` declares, in the order its body refers to them. */
function catalogueFiles(root: string): string[] {
  const master = readFileSync(path.join(root, 'xmlconf.xml'), 'utf8');
  const declared = new Map<string, string>();
  for (const [, name = '', file = ''] of master.matchAll(/<!ENTITY\s+(\S+)\s+SYSTEM\s+"([^"]+)">/g)) {
    declared.set(name, file);
  }
  const body = master.slice(/\]\s*>/.exec(master)?.index ?? 0);
  const files: string[] = [];
  for (const [, name = ''] of body.matchAll(/&([\w.-]+);/g)) {
    const file = declared.get(name);
    if (file !== undefined) files.push(path.join(root, file));
  }
  return files;
}

/** Whether a document has a document type declaration, read as UTF-16 when its byte-order mark says so, else as ASCII. */
function hasDoctype(file: string): boolean {
  const bytes = readFileSync(file);
  const encoding = detectedEncoding(bytes);
  return new TextDecoder(encoding?.startsWith('utf-16') ? encoding : 'latin1').decode(bytes).includes('<!DOCTYPE');
}

/** Builds a test from a TEST element's attributes, applying the defaults testcases.dtd declares. */
function entry(attributes: Map<string, string>, base: string, description: string): XmltsTest {
  const editions = attributes.get('EDITION')?.trim().split(/\s+/);
  const version = attributes.get('VERSION');
  const output = attributes.get('OUTPUT');
  const type = (attributes.get('TYPE') ?? 'valid') as TestType;
  const file = path.resolve(base, attributes.get('URI') ?? '');
  return {
    id: attributes.get('ID') ?? '',
    type,
    entities: (attributes.get('ENTITIES') ?? 'none') as Entities,
    recommendation: attributes.get('RECOMMENDATION') ?? 'XML1.0',
    ...(version !== undefined && { version }),
    ...(editions !== undefined && { editions }),
    namespace: attributes.get('NAMESPACE') !== 'no',
    sections: attributes.get('SECTIONS') ?? '',
    path: file,
    ...(output !== undefined && { output: path.resolve(base, output) }),
    ...(type === 'invalid' && { doctype: hasDoctype(file) }),
    description: description.replaceAll(/\s+/g, ' ').trim(),
  };
}

/** A TEST element being read. */
interface OpenTest {
  readonly attributes: Map<string, string>;
  description: string;
}

/** Reads the current start tag's attributes. */
function attributesOf(reader: StreamReaderSync): Map<string, string> {
  const attributes = new Map<string, string>();
  for (let i = 0; i < reader.attributeCount(); i++) {
    attributes.set(reader.attributeName(i) ?? '', reader.attributeValue(i) ?? '');
  }
  return attributes;
}

/** Reads one catalogue file, an external entity that may hold several elements; its tests resolve against its own location, as XML Base requires. */
function readCatalogueFile(file: string): XmltsTest[] {
  const bytes = readFileSync(file);
  const encoding = detectedEncoding(bytes);
  const reader = new StreamReaderSync(bytes, {
    documentMode: 'fragment',
    namespaceAware: false,
    ...(encoding !== undefined && { encoding }),
  });
  const bases = [path.dirname(file)];
  const tests: XmltsTest[] = [];
  let current: OpenTest | undefined;
  while (reader.next() !== null) {
    const type = reader.eventType();
    const name = reader.name();
    if (type === XmlEventType.START_ELEMENT && name === 'TESTCASES') {
      bases.push(path.resolve(bases.at(-1) ?? '', attributesOf(reader).get('xml:base') ?? ''));
    } else if (type === XmlEventType.START_ELEMENT && name === 'TEST') {
      current = { attributes: attributesOf(reader), description: '' };
    } else if (type === XmlEventType.END_ELEMENT && name === 'TESTCASES') {
      bases.pop();
    } else if (type === XmlEventType.END_ELEMENT && name === 'TEST' && current) {
      tests.push(entry(current.attributes, bases.at(-1) ?? '', current.description));
      current = undefined;
    } else if (current && (type === XmlEventType.CHARACTERS || type === XmlEventType.CDATA)) {
      current.description += reader.text() ?? '';
    }
  }
  return tests;
}

/** Reads every test in the XML suite unpacked at `root`, the folder holding `xmlconf.xml`. */
export function readXmlts(root: string): XmltsTest[] {
  return catalogueFiles(root).flatMap((file) => readCatalogueFile(file));
}
