import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type CatalogQuery, jdkCatalog } from '@exemplarjs/adapters';
import { catalogResolver } from '@exemplarjs/catalog';
import type { Disagreement, KnownDifferences } from './differential.ts';
import { PACKAGE } from './paths.ts';

/** One lookup of the catalog differential, as `cases.json` gives it. */
interface CatalogCase {
  readonly id: string;
  /** Catalog files in the fixture directory. */
  readonly files: readonly string[];
  readonly kind: 'entity' | 'uri';
  readonly publicId?: string;
  readonly systemId?: string;
  readonly href?: string;
  readonly base?: string;
  readonly prefer?: 'public' | 'system';
  readonly defer?: boolean;
}

const FIXTURES = path.join(PACKAGE, 'test', 'fixtures', 'catalogs');

/** A URI as WHATWG URLs spell it, so that the JDK's `file:/` and exemplar's `file:///` agree. */
function spelled(uri: string): string {
  try {
    return new URL(uri).href;
  } catch {
    return uri;
  }
}

/** An answer in the form both sides are compared in. */
function comparable(answer: string): string {
  if (answer.startsWith('match ')) return `match ${spelled(answer.slice('match '.length))}`;
  return /circular|leads back/i.test(answer) ? 'error: circular' : answer;
}

/** What exemplar's catalog gives a lookup: `match URI`, `none` or `error MESSAGE`. */
function exemplarAnswer(query: CatalogQuery): string {
  try {
    const resolver = catalogResolver({ files: query.files, prefer: query.prefer, defer: query.defer });
    const found =
      query.kind === 'entity'
        ? resolver.matchEntity(query.publicId, query.id)
        : resolver.matchURI(query.id ?? '', query.base);
    return found === undefined ? 'none' : `match ${found}`;
  } catch (error) {
    return `error ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** The lookup a case describes, its files as absolute URIs. */
function queryOf(entry: CatalogCase): CatalogQuery {
  const id = entry.systemId ?? entry.href;
  return {
    files: entry.files.map((file) => pathToFileURL(path.join(FIXTURES, file)).href),
    prefer: entry.prefer ?? 'public',
    defer: entry.defer ?? true,
    kind: entry.kind,
    ...(entry.publicId !== undefined && { publicId: entry.publicId }),
    ...(id !== undefined && { id }),
    ...(entry.base !== undefined && { base: entry.base }),
  };
}

/** Compares exemplar's catalog resolution with the JDK's `javax.xml.catalog` on every lookup in `cases.json`. */
export async function catalogDifferential(
  known: KnownDifferences
): Promise<{ readonly version: string; readonly disagreements: Disagreement[] }> {
  const jdk = jdkCatalog();
  const cases = JSON.parse(readFileSync(path.join(FIXTURES, 'cases.json'), 'utf8')) as CatalogCase[];
  const disagreements: Disagreement[] = [];
  for (const entry of cases) {
    const query = queryOf(entry);
    const ours = comparable(exemplarAnswer(query));
    const theirs = comparable(await jdk.resolve(query));
    if (ours === theirs) continue;
    const reason = known[`jdk-catalog/${entry.id}`];
    disagreements.push({
      id: entry.id,
      path: path.join(FIXTURES, entry.files[0] ?? ''),
      kind: 'resolution',
      exemplar: ours,
      reference: theirs,
      status: reason === undefined ? 'triage' : 'known',
      ...(reason !== undefined && { reason }),
    });
  }
  return { version: jdk.version, disagreements };
}

if (import.meta.main) {
  const { version, disagreements } = await catalogDifferential({});
  console.log(`${disagreements.length} disagreements with javax.xml.catalog, ${version}`);
  for (const entry of disagreements) console.log(`  ${entry.id}: exemplar ${entry.exemplar}; JDK ${entry.reference}`);
}
