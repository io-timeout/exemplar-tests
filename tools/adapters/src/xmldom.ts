import { DOMParser, onErrorStopParsing } from '@xmldom/xmldom';
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

/** xmldom stopping at errors, without node locations, which the other trees do not keep either. */
const parser = new DOMParser({ onError: onErrorStopParsing, locator: false });

/** Parses a document with xmldom, which reads the internal subset's entities but no external DTD. */
function canonical(source: Source, form: CanonicalForm): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    const document = parser.parseFromString(decode(source.bytes, source.encoding), 'text/xml');
    writeDomTree(
      Object.assign(Object.create(document) as DomNode, { xmlVersion: declaredVersion(source.bytes, source.encoding) }),
      writer
    );
    return { accepted: true, canonical: writer.toString(), validityErrors: 0 };
  } catch (error) {
    return rejection(error);
  }
}

/** @xmldom/xmldom, a W3C DOM in JavaScript. */
export const xmldomAdapter: Adapter = {
  name: '@xmldom/xmldom',
  version: installedVersion('@xmldom/xmldom'),
  configurations: ['standalone'],
  workloads: ['tree'],
  canonical: (source, _configuration, form) => canonical(source, form),
  build: (input: Input) => parser.parseFromString(input.text, 'text/xml'),
  run(workload: Workload, input: Input) {
    if (workload !== 'tree') throw unsupported('@xmldom/xmldom', workload);
    return parser.parseFromString(input.text, 'text/xml').documentElement === null ? 0 : 1;
  },
};
