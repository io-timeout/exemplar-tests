import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StreamReaderSync, XmlEventType } from 'stax-xml';

/** One test of the xml:id Test Suite. */
export interface XmlIdTest {
  readonly id: string;
  readonly category: string;
  /** What the test needs beyond xml:id, such as `schema`. */
  readonly feature?: string;
  readonly path: string;
  /** The values of the document's IDs, in document order. */
  readonly ids: readonly string[];
}

/** A test-case element being read. */
interface OpenTest {
  readonly id: string;
  readonly category: string;
  readonly feature: string | undefined;
  directory: string;
  file: string;
  readonly ids: string[];
}

/** Reads the current start tag's attributes. */
function attributesOf(reader: StreamReaderSync): Map<string, string> {
  const attributes = new Map<string, string>();
  for (let i = 0; i < reader.attributeCount(); i++) {
    attributes.set(reader.attributeName(i) ?? '', reader.attributeValue(i) ?? '');
  }
  return attributes;
}

/** Starts a test from its test-case element. */
function open(reader: StreamReaderSync): OpenTest {
  const attributes = attributesOf(reader);
  return {
    id: attributes.get('id') ?? '',
    category: attributes.get('category') ?? '',
    feature: attributes.get('feature'),
    directory: '',
    file: '',
    ids: [],
  };
}

/** Keeps what an element inside a test case says. */
function take(test: OpenTest, name: string, text: string): void {
  if (name === 'file-path') test.directory = text.trim();
  else if (name === 'input-file') test.file = text.trim();
  else if (name === 'id') test.ids.push(text);
}

/** The finished test. */
function finish(test: OpenTest, root: string): XmlIdTest {
  const { id, category, feature, directory, file, ids } = test;
  return { id, category, ...(feature !== undefined && { feature }), path: path.join(root, directory, file), ids };
}

/** Reads every test of the suite fetched to `root`, the folder holding `test-suite.xml`. */
export function readXmlIdSuite(root: string): XmlIdTest[] {
  const reader = new StreamReaderSync(readFileSync(path.join(root, 'test-suite.xml')), { namespaceAware: false });
  const tests: XmlIdTest[] = [];
  let current: OpenTest | undefined;
  let text = '';
  while (reader.next() !== null) {
    const type = reader.eventType();
    const name = reader.name();
    if (type === XmlEventType.START_ELEMENT) {
      text = '';
      if (name === 'test-case') current = open(reader);
    } else if (type === XmlEventType.CHARACTERS) {
      text += reader.text() ?? '';
    } else if (type === XmlEventType.END_ELEMENT && current !== undefined) {
      if (name === 'test-case') {
        tests.push(finish(current, root));
        current = undefined;
      } else {
        take(current, name ?? '', text);
      }
    }
  }
  return tests;
}
