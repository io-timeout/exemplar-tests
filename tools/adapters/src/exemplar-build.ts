import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as ExemplarDom from '@exemplarjs/dom';
import type * as ExemplarWriter from '@exemplarjs/writer';
import type * as Exemplar from '@exemplarjs/xml';
import type * as ExemplarFiles from '@exemplarjs/xml/resolvers/file';
import type { Adapter } from './adapter.ts';
import { exemplarAdapter, timedWorkloads } from './exemplar.ts';

/** Loads one built module. */
async function load<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(file).href)) as T;
}

/** Where a built checkout keeps the reader, the DOM and the writer; one from before the split keeps all three in `packages/exemplar`. */
function modules(checkout: string): { core: string; dom: string; writer: string; files: string } {
  const single = path.join(checkout, 'packages/exemplar/dist');
  if (existsSync(single)) {
    return {
      core: path.join(single, 'index.js'),
      dom: path.join(single, 'dom/index.js'),
      writer: path.join(single, 'writer/index.js'),
      files: path.join(single, 'resolvers/file.js'),
    };
  }
  const built = (name: string, module = 'index.js'): string => path.join(checkout, 'packages', name, 'dist', module);
  return { core: built('xml'), dom: built('dom'), writer: built('writer'), files: built('xml', 'resolvers/file.js') };
}

/** exemplar as another built checkout has it, such as `main`'s, timed beside this one; its output is checked as this build's. */
export async function exemplarBuildAdapter(checkout: string, name: string, version: string): Promise<Adapter> {
  const files = modules(checkout);
  const core = await load<typeof Exemplar>(files.core);
  const dom = await load<typeof ExemplarDom>(files.dom);
  const writer = await load<typeof ExemplarWriter>(files.writer);
  const quiet = { error: () => undefined, warning: () => undefined };
  const read = new core.XMLInputFactory({ errorHandler: quiet });
  // A build without a file resolver cannot read DTDs from files, and so has no `dtd` workload.
  const resolvers = existsSync(files.files) ? await load<typeof ExemplarFiles>(files.files) : undefined;
  const dtd = resolvers?.fileResolver;
  const timed = timedWorkloads({
    read,
    tree: new dom.DocumentBuilder(read),
    write: new writer.XMLOutputFactory(),
    sink: () => new writer.StringSink(),
    ...(dtd && {
      dtd: (root: string) =>
        new core.XMLInputFactory({
          errorHandler: quiet,
          accessExternalDTD: ['file'],
          accessExternalEntities: ['file'],
          entityResolver: dtd({ root }),
        }),
    }),
  });
  const workloads = exemplarAdapter.workloads.filter((workload) => workload !== 'dtd' || dtd !== undefined);
  return { ...exemplarAdapter, ...timed, name, version, workloads };
}
