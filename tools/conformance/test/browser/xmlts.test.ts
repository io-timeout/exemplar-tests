import { describe, expect, inject, it } from 'vitest';
import type { Configuration, Outcome } from '@exemplarjs/adapters';
import { canonicalize } from '@exemplarjs/canonical';
import { cjkDecoders } from '@exemplarjs/encodings-cjk';
import { dtdValidator } from '@exemplarjs/validation';
import { type InputOptions, XMLError, XMLInputFactory } from '@exemplarjs/xml';
import { applies } from '../../src/configurations.ts';
import { judge } from '../../src/verdict.ts';

const { root, tests, files, failures } = inject('xmlts');
const base = `file://${root}/`;

/** Every suite file, fetched before the tests run, by `file:` URL. */
async function fetchAll(): Promise<Map<string, Uint8Array>> {
  const contents = new Map<string, Uint8Array>();
  const queue = [...files];
  const worker = async (): Promise<void> => {
    for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
      const response = await fetch(`/__suite${root}/${file}`);
      contents.set(new URL(file, base).href, new Uint8Array(await response.arrayBuffer()));
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  return contents;
}

const contents = await fetchAll();

/** The factory for a configuration, as the exemplar adapter makes it, with external files read from memory. */
function factoryFor(configuration: Configuration, aware: boolean, collect: (code: string) => void): XMLInputFactory {
  const options: InputOptions = {
    namespaceAware: aware,
    namespacePrefixes: aware,
    decoders: cjkDecoders,
    errorHandler: {
      error: (error) => {
        if (error.code.startsWith('VC_')) collect(error.code);
      },
      warning: () => undefined,
    },
  };
  if (configuration === 'standalone') return new XMLInputFactory(options);
  return new XMLInputFactory({
    ...options,
    accessExternalDTD: ['file'],
    accessExternalEntities: ['file'],
    entityResolver: {
      resolveEntity: ({ systemId, baseURI }) => {
        const uri = new URL(systemId ?? '', baseURI).href;
        const bytes = uri.startsWith(base) ? contents.get(uri) : undefined;
        return bytes === undefined ? undefined : { systemId: uri, bytes };
      },
    },
    ...(configuration === 'validating' && { validator: dtdValidator() }),
  });
}

/** A test document read in a configuration, in the suite's second canonical form, as an outcome. */
function outcomeOf(path: string, namespace: boolean, configuration: Configuration): Outcome {
  const validityCodes: string[] = [];
  const factory = factoryFor(configuration, namespace, (code) => validityCodes.push(code));
  const systemId = `file://${path}`;
  try {
    const reader = factory.createStreamReader({ bytes: contents.get(systemId) as Uint8Array, systemId });
    const canonical = canonicalize(reader, { method: 'suite-second' });
    return { accepted: true, canonical, validityErrors: validityCodes.length, validityCodes };
  } catch (error) {
    if (!(error instanceof XMLError)) throw error;
    const { code, message, line, column, systemId: where } = error;
    return { accepted: false, message, code, line, column, ...(where !== undefined && { systemId: where }) };
  }
}

const decoder = new TextDecoder();

describe(`exemplar on the XML suite in ${navigator.userAgent}`, () => {
  for (const configuration of ['standalone', 'external', 'validating'] as const) {
    it(`passes every applicable test under ${configuration} but the expected failures`, () => {
      const failed: string[] = [];
      const listed: string[] = [];
      let applicable = 0;
      for (const test of tests) {
        if (!applies(test)) continue;
        applicable++;
        const key = `xmlts/${test.id}/${configuration}`;
        if (key in failures) listed.push(key);
        const outcome = outcomeOf(test.path, test.namespace, configuration);
        const output = test.output === undefined ? undefined : contents.get(`file://${test.output}`);
        const expected = output === undefined ? undefined : decoder.decode(output);
        if (!judge(test, configuration, outcome, expected, { requireLocation: true }).pass) failed.push(key);
      }
      expect(applicable, 'the tests testing.md counts').toBe(2272);
      expect(failed.toSorted()).toEqual(listed.toSorted());
    }, 120_000);
  }
});
