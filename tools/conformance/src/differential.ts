import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type Adapter,
  type Configuration,
  type Outcome,
  exemplarAdapter,
  xercesAdapter,
  xmllintAdapter,
  xmllintCanonical,
} from '@exemplarjs/adapters';
import { canonicalize } from '@exemplarjs/canonical';
import { XMLError, XMLInputFactory } from '@exemplarjs/xml';
import { fileResolver } from '@exemplarjs/xml/resolvers/file';
import { catalogDifferential } from './catalog-differential.ts';
import { type XmltsTest, readXmlts } from './catalogue/xmlts.ts';
import { applies } from './configurations.ts';
import { ensureSuite } from './fetch.ts';
import { PACKAGE } from './paths.ts';
import { expectedFailures, failureKey } from './ratchet.ts';
import { judge } from './verdict.ts';

/**
 * Why a disagreement needs no fix in exemplar: an expected failure, a known reference bug, a verdict the suite
 * requires of exemplar, or one it allows either way. Anything else is left for triage.
 */
export type Status = 'listed' | 'known' | 'suite' | 'allowed' | 'triage';

const REASONS: Partial<Record<Status, string>> = {
  suite: "The suite requires exemplar's result",
  allowed: 'The suite allows either verdict under standalone',
};

/** One document on which exemplar and a reference parser give different verdicts, or different output. */
export interface Disagreement {
  readonly id: string;
  readonly path: string;
  readonly kind: 'verdict' | 'output' | 'c14n' | 'c14n11' | 'exc-c14n' | 'resolution';
  readonly exemplar: string;
  readonly reference: string;
  readonly status: Status;
  readonly reason?: string;
}

/** Reference-parser bugs, keyed `reference/suite/id`, each with its reason. */
export type KnownDifferences = Readonly<Record<string, string>>;

/** Reads `known-differences.json`, or an empty list when there is none. */
export function knownDifferences(file = path.join(PACKAGE, 'known-differences.json')): KnownDifferences {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as KnownDifferences) : {};
}

/** A verdict as the differential compares it: under `validating`, whether the document was valid too. */
function verdict(outcome: Outcome, validating = false): string {
  if (!outcome.accepted) return `rejected: ${outcome.message}`;
  if (!validating) return 'accepted';
  return outcome.validityErrors === 0 ? 'accepted, valid' : 'accepted, invalid';
}

/** Decides a disagreement's status from the lists and the suite's verdict rules. */
function status(listed: boolean, known: boolean, oursPass: boolean, theirsPass: boolean): Status {
  if (listed) return 'listed';
  if (known) return 'known';
  if (!oursPass) return 'triage';
  return theirsPass ? 'allowed' : 'suite';
}

/** Makes text safe for one Markdown table cell. */
function cell(text: string): string {
  return text
    .replaceAll('|', String.raw`\|`)
    .replaceAll('\n', ' ')
    .slice(0, 120);
}

/** Where two canonical outputs first part, with a little of each. */
function firstDifference(ours: string, theirs: string): [string, string] {
  let at = 0;
  while (at < ours.length && ours[at] === theirs[at]) at++;
  const show = (text: string) => JSON.stringify(text.slice(Math.max(0, at - 10), at + 30));
  return [`at ${at}: ${show(ours)}`, show(theirs)];
}

/** Whether an outcome is an accepted document with no validity errors. */
function valid(outcome: Outcome): boolean {
  return outcome.accepted && outcome.validityErrors === 0;
}

/** What two outcomes disagree on, if anything; outputs are compared only when asked. */
function compare(
  ours: Outcome,
  theirs: Outcome,
  outputs: boolean,
  validating: boolean
): { kind: Disagreement['kind']; texts: [string, string] } | undefined {
  const differs = ours.accepted !== theirs.accepted || (validating && valid(ours) !== valid(theirs));
  if (differs) return { kind: 'verdict', texts: [verdict(ours, validating), verdict(theirs, validating)] };
  if (!outputs || !ours.accepted || !theirs.accepted || ours.canonical === theirs.canonical) return undefined;
  return { kind: 'output', texts: firstDifference(ours.canonical ?? '', theirs.canonical ?? '') };
}

/** Whether each outcome passes: by the suite's verdict rules, or for an output difference by the suite's own output. */
function passes(
  test: XmltsTest,
  configuration: Configuration,
  verdicts: boolean,
  outcomes: [Outcome, Outcome]
): [boolean, boolean] {
  const expected = test.output === undefined ? undefined : readFileSync(test.output, 'utf8');
  const pass = (outcome: Outcome): boolean =>
    verdicts
      ? judge(test, configuration, outcome, expected).pass
      : outcome.accepted && expected !== undefined && outcome.canonical === expected;
  return [pass(outcomes[0]), pass(outcomes[1])];
}

/** Compares exemplar with a reference parser on every applicable suite document, under one configuration. */
export async function differential(
  reference: Adapter,
  tests: readonly XmltsTest[],
  root: string,
  outputs: boolean,
  configuration: 'standalone' | 'validating' = 'standalone'
): Promise<Disagreement[]> {
  const failures = expectedFailures();
  const known = knownDifferences();
  const disagreements: Disagreement[] = [];
  for (const test of tests) {
    if (!applies(test)) continue;
    const source = { bytes: readFileSync(test.path), systemId: pathToFileURL(test.path).href };
    const options = { namespaceAware: test.namespace, root };
    const validating = configuration === 'validating';
    if (validating && test.type !== 'valid' && test.type !== 'invalid') continue;
    const ours = await exemplarAdapter.canonical(source, configuration, 'second', options);
    const theirs = await reference.canonical(source, configuration, 'second', options);
    const found = compare(ours, theirs, outputs, validating);
    if (found === undefined) continue;
    const listed = failures[failureKey('xmlts', test.id, configuration)];
    const knownReason = known[`${reference.name}${validating ? '-validating' : ''}/xmlts/${test.id}`];
    const [oursPass, theirsPass] = passes(test, configuration, found.kind === 'verdict', [ours, theirs]);
    const decided = status(listed !== undefined, knownReason !== undefined, oursPass, theirsPass);
    const reason = listed ?? knownReason ?? REASONS[decided];
    disagreements.push({
      id: test.id,
      path: path.relative(root, test.path),
      kind: found.kind,
      exemplar: found.texts[0],
      reference: found.texts[1],
      status: decided,
      ...(reason !== undefined && { reason }),
    });
  }
  return disagreements;
}

/** The Canonical XML methods compared with xmllint. */
const C14N_METHODS = ['c14n', 'c14n11', 'exc-c14n'] as const;

/** exemplar's canonical form of a file with comments, or why it failed. */
function exemplarCanonical(file: string, method: (typeof C14N_METHODS)[number], factory: XMLInputFactory): string {
  try {
    return canonicalize(
      { bytes: readFileSync(file), systemId: pathToFileURL(file).href },
      { method, comments: true, factory }
    );
  } catch (error) {
    if (error instanceof XMLError) return `failed: ${error.code} ${error.message}`;
    throw error;
  }
}

/** Compares exemplar's Canonical XML with xmllint's on every well-formed XML 1.0 suite document. */
export async function c14nDifferential(tests: readonly XmltsTest[], root: string): Promise<Disagreement[]> {
  const known = knownDifferences();
  const factory = new XMLInputFactory({
    accessExternalDTD: ['file'],
    accessExternalEntities: ['file'],
    entityResolver: fileResolver({ root }),
    errorHandler: { error: () => undefined, warning: () => undefined },
  });
  const disagreements: Disagreement[] = [];
  for (const test of tests) {
    if ((test.type !== 'valid' && test.type !== 'invalid') || test.version === '1.1' || !test.namespace) continue;
    const file = test.path;
    for (const method of C14N_METHODS) {
      const ours = exemplarCanonical(file, method, factory);
      const theirs = (await xmllintCanonical(file, method)) ?? 'failed';
      if (ours === theirs || (ours.startsWith('failed') && theirs === 'failed')) continue;
      const reason = known[`libxml2-c14n/xmlts/${test.id}`];
      const [exemplar, reference] = firstDifference(ours, theirs);
      disagreements.push({
        id: test.id,
        path: path.relative(root, test.path),
        kind: method,
        exemplar,
        reference,
        status: reason === undefined ? 'triage' : 'known',
        ...(reason !== undefined && { reason }),
      });
    }
  }
  return disagreements;
}

/** Renders one reference's disagreements as Markdown, triage first. */
function markdown(reference: Adapter, disagreements: readonly Disagreement[]): string {
  const count = (status: Status) => disagreements.filter((entry) => entry.status === status).length;
  const lines = [
    `## exemplar and ${reference.name} ${reference.version}`,
    '',
    `${disagreements.length} disagreements: ${count('triage')} to triage, ${count('listed')} expected failures, ${count('known')} known reference bugs, ${count('suite')} where the suite requires exemplar's verdict, ${count('allowed')} where it allows either.`,
    '',
    '| Test | Kind | Status | exemplar | Reference | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  const order: Status[] = ['triage', 'known', 'suite', 'allowed', 'listed'];
  const sorted = disagreements.toSorted((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  for (const entry of sorted) {
    lines.push(
      `| ${entry.id} | ${entry.kind} | ${entry.status} | ${cell(entry.exemplar)} | ${cell(entry.reference)} | ${cell(entry.reason ?? '')} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Runs the differentials against libxml2, Xerces and javax.xml.catalog; writes `reports/differential.{md,json}`. */
async function main(): Promise<void> {
  const root = path.join(await ensureSuite('xmlts'), 'xmlconf');
  const tests = readXmlts(root);
  const references: [Adapter, boolean][] = [
    [xmllintAdapter(), false],
    [xercesAdapter(), true],
  ];
  const report: Record<string, Disagreement[]> = {};
  const sections = ['# Differential', ''];
  for (const [reference, outputs] of references) {
    const disagreements = await differential(reference, tests, root, outputs);
    report[reference.name] = disagreements;
    sections.push(markdown(reference, disagreements));
    const triage = disagreements.filter((entry) => entry.status === 'triage');
    console.log(
      `${disagreements.length} disagreements with ${reference.name} ${reference.version}, ${triage.length} to triage`
    );
    for (const entry of triage)
      console.log(`  ${entry.id} (${entry.kind}): exemplar ${entry.exemplar}; ${reference.name} ${entry.reference}`);
  }
  const xerces = references[1]?.[0] as Adapter;
  const validating = await differential(xerces, tests, root, false, 'validating');
  report['xerces-validating'] = validating;
  sections.push(markdown({ ...xerces, name: 'xerces (validating)' }, validating));
  const validatingTriage = validating.filter((entry) => entry.status === 'triage');
  console.log(`${validating.length} validating disagreements with xerces, ${validatingTriage.length} to triage`);
  for (const entry of validatingTriage)
    console.log(`  ${entry.id}: exemplar ${entry.exemplar}; xerces ${entry.reference}`);
  const c14n = await c14nDifferential(tests, root);
  report['libxml2-c14n'] = c14n;
  sections.push(markdown({ ...xmllintAdapter(), name: 'libxml2 (Canonical XML)' }, c14n));
  const c14nTriage = c14n.filter((entry) => entry.status === 'triage');
  console.log(`${c14n.length} Canonical XML differences with libxml2, ${c14nTriage.length} to triage`);
  for (const entry of c14nTriage)
    console.log(`  ${entry.id} (${entry.kind}): exemplar ${entry.exemplar}; libxml2 ${entry.reference}`);
  const catalogs = await catalogDifferential(knownDifferences());
  report['jdk-catalog'] = catalogs.disagreements;
  sections.push(markdown({ ...xerces, name: 'javax.xml.catalog', version: catalogs.version }, catalogs.disagreements));
  const catalogTriage = catalogs.disagreements.filter((entry) => entry.status === 'triage');
  console.log(
    `${catalogs.disagreements.length} catalog differences with javax.xml.catalog, ${catalogTriage.length} to triage`
  );
  for (const entry of catalogTriage) console.log(`  ${entry.id}: exemplar ${entry.exemplar}; JDK ${entry.reference}`);
  const directory = path.join(PACKAGE, 'reports');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'differential.json'), `${JSON.stringify(report, undefined, 2)}\n`);
  writeFileSync(path.join(directory, 'differential.md'), sections.join('\n'));
}

if (import.meta.main) await main();
