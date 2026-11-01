import { createReadStream } from 'node:fs';
import { type Handler, Parser } from 'htmlparser2';
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

/** Splits htmlparser2's `?target data?` into the target and data. */
function instruction(raw: string): [string, string] {
  const body = raw.replace(/^\?/, '').replace(/\?$/, '');
  const end = body.search(/[\s?]|$/);
  return [body.slice(0, end), body.slice(end).trimStart()];
}

/** Parses a document with htmlparser2 in XML mode; it recovers from errors rather than rejecting. */
function canonical(source: Source, form: CanonicalForm): Outcome {
  const writer = new CanonicalWriter(form);
  try {
    writer.version(declaredVersion(source.bytes, source.encoding));
    let cdata = false;
    const handler: Partial<Handler> = {
      onopentag: (name, attributes) => writer.startElement(name, Object.entries(attributes)),
      onclosetag: (name) => writer.endElement(name),
      ontext: (text) => (cdata ? writer.cdata(text) : writer.text(text)),
      oncdatastart: () => {
        cdata = true;
      },
      oncdataend: () => {
        cdata = false;
      },
      onprocessinginstruction: (_name, data) => {
        if (!data.startsWith('!')) writer.processingInstruction(...instruction(data));
      },
      onerror: (error) => {
        throw error;
      },
    };
    const parser = new Parser(handler, { xmlMode: true });
    parser.end(decode(source.bytes, source.encoding));
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

/** Creates a parser whose handlers count events, reading nothing. */
function walking(): Counter {
  let total = 0;
  const add = (): void => {
    total++;
  };
  const parser = new Parser(
    { onopentag: add, onclosetag: add, ontext: add, onprocessinginstruction: add },
    { xmlMode: true }
  );
  return { parser, total: () => total };
}

/** Creates a parser whose handlers count the content `content.ts` defines. */
function reading(): Counter {
  let total = 0;
  let depth = 0;
  const parser = new Parser(
    {
      onopentag: (name, attributes) => {
        depth++;
        total += localLength(name);
        for (const [key, value] of Object.entries(attributes)) total += attributeLength(key, value);
      },
      onclosetag: () => {
        depth--;
      },
      ontext: (text) => {
        if (depth > 0) total += text.length;
      },
      onprocessinginstruction: (_name, data) => {
        if (!data.startsWith('!')) total += instructionLength(...instruction(data));
      },
    },
    { xmlMode: true }
  );
  return { parser, total: () => total };
}

/** Reads a file in 64 KB chunks. */
async function stream(path: string): Promise<number> {
  const { parser, total } = reading();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const chunk of createReadStream(path, { highWaterMark: 65_536 })) {
    parser.write(decoder.decode(chunk as Uint8Array, { stream: true }));
  }
  parser.end(decoder.decode());
  return total();
}

/** htmlparser2 in XML mode, a fast and lenient push parser. */
export const htmlparser2Adapter: Adapter = {
  name: 'htmlparser2',
  version: installedVersion('htmlparser2'),
  configurations: ['standalone'],
  workloads: ['walk', 'read', 'small', 'stream'],
  canonical: (source, _configuration, form) => canonical(source, form),
  run(workload: Workload, input: Input) {
    if (workload === 'stream') return stream(input.path);
    if (workload !== 'walk' && workload !== 'read' && workload !== 'small') throw unsupported('htmlparser2', workload);
    const { parser, total } = workload === 'walk' ? walking() : reading();
    parser.end(input.text);
    return total();
  },
};
