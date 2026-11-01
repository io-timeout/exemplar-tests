import { createRequire } from 'node:module';
import type SaxonJS from 'saxon-js';
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
import { type DomNode, writeDomTree } from './dom-tree.ts';

let processor: typeof SaxonJS | undefined;

/** Saxon-JS, loaded on first use; it raises `Error.stackTraceLimit` as it loads, which is put back for the other libraries. */
function saxonJs(): typeof SaxonJS {
  if (processor === undefined) {
    const limit = Error.stackTraceLimit;
    try {
      processor = createRequire(import.meta.url)('saxon-js') as typeof SaxonJS;
    } finally {
      Error.stackTraceLimit = limit;
    }
  }
  return processor;
}

/** Parses a document with Saxon-JS's own parser, which reads no DTD. */
async function canonical(source: Source, form: CanonicalForm): Promise<Outcome> {
  const writer = new CanonicalWriter(form);
  try {
    const document = (await saxonJs().getResource({
      text: decode(source.bytes, source.encoding),
      type: 'xml',
    })) as DomNode;
    writeDomTree(
      Object.assign(Object.create(document) as DomNode, { xmlVersion: declaredVersion(source.bytes, source.encoding) }),
      writer
    );
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** Saxon-JS, Saxonica's XSLT and XPath processor, building its tree with its own parser. */
export const saxonJsAdapter: Adapter = {
  name: 'saxon-js',
  version: installedVersion('saxon-js'),
  configurations: ['standalone'],
  workloads: ['tree'],
  canonical: (source, _configuration, form) => canonical(source, form),
  build: (input: Input) => saxonJs().getResource({ text: input.text, type: 'xml' }),
  async run(workload: Workload, input: Input) {
    if (workload !== 'tree') throw unsupported('saxon-js', workload);
    return (await saxonJs().getResource({ text: input.text, type: 'xml' })) === null ? 0 : 1;
  },
};
