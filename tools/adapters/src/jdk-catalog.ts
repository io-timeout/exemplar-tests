import { fileURLToPath } from 'node:url';
import { Harness, javaExecutable, javaVersion } from './xerces.ts';

/** The catalog harness, run with the JDK's single-file source launcher. */
const HARNESS = fileURLToPath(new URL('../java/CatalogHarness.java', import.meta.url));

/** One catalog lookup: an external identifier, or a URI reference against a base. */
export interface CatalogQuery {
  /** The catalog files, as absolute URIs. */
  readonly files: readonly string[];
  readonly prefer: 'public' | 'system';
  readonly defer: boolean;
  readonly kind: 'entity' | 'uri';
  readonly publicId?: string;
  /** The system identifier, or the URI reference. */
  readonly id?: string;
  readonly base?: string;
}

/** Resolves catalog lookups with the JDK; each answer is `match URI`, `none` or `error MESSAGE`. */
export interface JdkCatalog {
  readonly version: string;
  resolve(query: CatalogQuery): Promise<string>;
}

/** The JDK's `javax.xml.catalog`, for the catalog differential. */
export function jdkCatalog(java = javaExecutable()): JdkCatalog {
  let harness: Harness | undefined;
  return {
    version: `JDK ${javaVersion(java)}`,
    resolve(query) {
      harness ??= new Harness(java, HARNESS);
      const { prefer, defer, files, kind, publicId, id, base } = query;
      const fields = [prefer, String(defer), files.join(' '), kind, publicId ?? '-', id ?? '-', base ?? '-'];
      return harness.ask(fields.join('\t'));
    },
  };
}
