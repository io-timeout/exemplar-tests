import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StreamReaderSync, XmlEventType } from 'stax-xml';

/** One test of the XInclude Test Suite. */
export interface XIncludeTest {
  readonly id: string;
  readonly type: 'success' | 'error';
  /** What the test needs beyond XInclude itself, such as `xpointer-scheme`. */
  readonly features: readonly string[];
  readonly path: string;
  /** The expected result, for a success test. */
  readonly output?: string;
  readonly description: string;
}

/** A testcase element being read. */
interface OpenTest {
  readonly attributes: Map<string, string>;
  readonly base: string;
  output: string | undefined;
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

/** The finished test; paths resolve against its collection's base directory. */
function finish(test: OpenTest): XIncludeTest {
  const features = (test.attributes.get('features') ?? '').split(/\s+/).filter(Boolean);
  const output = test.output?.trim();
  return {
    id: test.attributes.get('id') ?? '',
    type: test.attributes.get('type') === 'error' ? 'error' : 'success',
    features,
    path: path.join(test.base, test.attributes.get('href') ?? ''),
    ...(output !== undefined && { output: path.resolve(test.base, output) }),
    description: test.description.replaceAll(/\s+/g, ' ').trim(),
  };
}

/** Records the end of a testcase's element: its output, its description, or the whole test. */
function endElement(name: string, text: string, current: OpenTest, tests: XIncludeTest[]): boolean {
  if (name === 'output') current.output = text;
  if (name === 'description') current.description = text;
  if (name !== 'testcase') return false;
  tests.push(finish(current));
  return true;
}

/** Reads every test of the suite fetched to `root`, the folder holding `testdescr.xml`. */
export function readXIncludeSuite(root: string): XIncludeTest[] {
  const reader = new StreamReaderSync(readFileSync(path.join(root, 'testdescr.xml')), { namespaceAware: false });
  const tests: XIncludeTest[] = [];
  let base = root;
  let current: OpenTest | undefined;
  let text = '';
  while (reader.next() !== null) {
    const type = reader.eventType();
    const name = reader.name();
    if (type === XmlEventType.START_ELEMENT) {
      text = '';
      if (name === 'testcases') base = path.join(root, attributesOf(reader).get('basedir') ?? '');
      if (name === 'testcase') current = { attributes: attributesOf(reader), base, output: undefined, description: '' };
    } else if (type === XmlEventType.CHARACTERS) {
      text += reader.text() ?? '';
    } else if (
      type === XmlEventType.END_ELEMENT &&
      current !== undefined &&
      endElement(name ?? '', text, current, tests)
    ) {
      current = undefined;
    }
  }
  return tests;
}
