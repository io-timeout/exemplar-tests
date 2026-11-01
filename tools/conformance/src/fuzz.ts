import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { fc } from '@fast-check/vitest';
import { type Outcome, exemplarAdapter, xmllintAdapter } from '@exemplarjs/adapters';
import { type XmltsTest, readXmlts } from './catalogue/xmlts.ts';
import { ensureSuite } from './fetch.ts';
import { type Mutation, mutate, mutations } from './mutate.ts';
import { PACKAGE } from './paths.ts';

/** A mutated document on which exemplar and libxml2 give different verdicts, with what reproduces it. */
interface FuzzDisagreement {
  readonly id: string;
  readonly mutations: readonly Mutation[];
  readonly exemplar: string;
  readonly libxml2: string;
  /** Why the disagreement needs no work, when it is of a kind known to be libxml2's. */
  readonly known?: string;
}

const libxml2 = xmllintAdapter();

/** Kinds of disagreement known to be libxml2's, by what either side says, with the reason. */
const KNOWN: readonly [RegExp, string][] = [
  [
    /is not a valid URI/,
    'libxml2 rejects a namespace name that is not a URI, which Namespaces 1.0 does not make an error',
  ],
  [
    /Invalid URI/,
    'libxml2 rejects a system identifier that is not a URI; §4.2.2 allows any characters and escapes them',
  ],
  [/Expected whitespace after <!DOCTYPE/, 'libxml2 accepts <!DOCTYPE without the whitespace production 28 requires'],
  [/is not a qualified name/, 'libxml2 does not check that names in DTD declarations are QNames (Namespaces 1.0 §7)'],
  [/U\+0000 is not allowed/, 'libxml2 takes a NUL character for the end of the document'],
  [/U\+00(7F|8[0-46-9A-F]|9[0-9A-F]) is not allowed/, "libxml2 does not apply XML 1.1's restricted characters"],
  [
    /PEReference: .*not found/,
    'libxml2 makes a reference to an undeclared parameter entity fatal, which §4.1 makes a validity error here',
  ],
  [
    /Fragment not allowed/,
    'A fragment identifier in a system identifier is an error (§4.2.2), which libxml2 makes fatal',
  ],
  [/Expected a notation name/, 'libxml2 accepts NDATA followed by whitespace and no notation name (production 76)'],
  [/Empty XML namespace is not allowed/, 'libxml2 lacks Namespaces 1.1, in which xmlns:p="" undeclares a prefix'],
  [
    /The bytes are not legal utf-16/,
    'libxml2 ignores bytes at the end of a UTF-16 document that are not a whole character',
  ],
];

/** A verdict as the fuzz differential compares it. */
function verdict(outcome: Outcome): string {
  return outcome.accepted ? 'accepted' : `rejected: ${outcome.message}`;
}

/** Both verdicts on a document's bytes, under `standalone`; libxml2 reads them from a file. */
async function verdicts(test: XmltsTest, bytes: Uint8Array, file: string): Promise<[string, string]> {
  writeFileSync(file, bytes);
  const source = { bytes, systemId: pathToFileURL(file).href };
  const options = { namespaceAware: test.namespace };
  const ours = await exemplarAdapter.canonical(source, 'standalone', 'second', options);
  const theirs = await libxml2.canonical(source, 'standalone', 'second', options);
  return [verdict(ours), verdict(theirs)];
}

/** Makes text safe for one Markdown table cell. */
function cell(text: string): string {
  return text
    .replaceAll('|', String.raw`\|`)
    .replaceAll('\n', ' ')
    .slice(0, 120);
}

/** Mutates suite documents, compares exemplar's verdicts with libxml2's, and writes `reports/fuzz.{md,json}` for triage. */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { runs: { type: 'string', default: '2000' }, seed: { type: 'string' } } });
  const runs = Number(values.runs);
  const seed = values.seed === undefined ? Date.now() % 2 ** 31 : Number(values.seed);
  const root = path.join(await ensureSuite('xmlts'), 'xmlconf');
  const tests = readXmlts(root);
  const directory = mkdtempSync(path.join(tmpdir(), 'exemplar-fuzz-'));
  const file = path.join(directory, 'document.xml');
  // Documents the two already disagree on are left out, as the differential reports those.
  const agrees = new Map<string, boolean>();
  const disagreements: FuzzDisagreement[] = [];
  const cases = fc.sample(fc.tuple(fc.nat(tests.length - 1), mutations), { numRuns: runs, seed });
  for (const [index, list] of cases) {
    const test = tests[index] as XmltsTest;
    const original = readFileSync(test.path);
    if (!agrees.has(test.id)) {
      const [ours, theirs] = await verdicts(test, original, file);
      agrees.set(test.id, ours.startsWith('accepted') === theirs.startsWith('accepted'));
    }
    if (agrees.get(test.id) !== true) continue;
    const [ours, theirs] = await verdicts(test, mutate(original, list), file);
    if (ours.startsWith('accepted') === theirs.startsWith('accepted')) continue;
    const known = KNOWN.find(([pattern]) => pattern.test(ours) || pattern.test(theirs))?.[1];
    disagreements.push({ id: test.id, mutations: list, exemplar: ours, libxml2: theirs, ...(known && { known }) });
  }
  rmSync(directory, { recursive: true, force: true });
  const reports = path.join(PACKAGE, 'reports');
  mkdirSync(reports, { recursive: true });
  const report = { seed, runs, libxml2: libxml2.version, disagreements };
  writeFileSync(path.join(reports, 'fuzz.json'), `${JSON.stringify(report, undefined, 2)}\n`);
  const triage = disagreements.filter((entry) => entry.known === undefined);
  const lines = [
    '# Fuzz differential',
    '',
    `${runs} mutated suite documents, seed ${seed}, against libxml2 ${libxml2.version}: ${disagreements.length} disagreements, ${triage.length} to triage.`,
    '',
    '| Test | Mutations | exemplar | libxml2 | Known |',
    '| --- | --- | --- | --- | --- |',
    ...[...triage, ...disagreements.filter((entry) => entry.known !== undefined)].map(
      (entry) =>
        `| ${entry.id} | ${cell(JSON.stringify(entry.mutations))} | ${cell(entry.exemplar)} | ${cell(entry.libxml2)} | ${cell(entry.known ?? '')} |`
    ),
  ];
  writeFileSync(path.join(reports, 'fuzz.md'), `${lines.join('\n')}\n`);
  console.log(
    `${disagreements.length} disagreements with libxml2 in ${runs} mutated documents (seed ${seed}), ${triage.length} to triage`
  );
  for (const entry of triage) console.log(`  ${entry.id}: exemplar ${entry.exemplar}; libxml2 ${entry.libxml2}`);
}

if (import.meta.main) await main();
