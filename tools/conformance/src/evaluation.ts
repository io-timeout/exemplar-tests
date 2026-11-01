import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { type Adapter, type Outcome, type ParseOptions, detectedEncoding } from '@exemplarjs/adapters';
import type { XmltsTest } from './catalogue/xmlts.ts';

/** One test's result under the evaluation profile. */
export interface EvaluationRow {
  readonly id: string;
  readonly type: XmltsTest['type'];
  readonly accepted: boolean;
  /** Undefined when the test's output is not compared. */
  readonly output?: boolean;
  /** Whether the file has no internal subset. */
  readonly outsideDtd: boolean;
  /** Whether the test counts towards the data score. */
  readonly dataTest: boolean;
  readonly toldEncoding: boolean;
}

/** A score as a count and a share. */
export interface Score {
  readonly passed: number;
  readonly total: number;
}

/** The evaluation's three scores. */
export interface EvaluationScores {
  readonly rejectsMalformed: Score;
  readonly outsideDtd: Score;
  readonly data: Score;
}

/** The libraries the evaluation scored, with the options each ran under: sax with its defaults, which leave namespaces off. */
export const EVALUATED: Readonly<Record<string, ParseOptions>> = {
  sax: { namespaceAware: false },
  saxen: {},
  'stax-xml': {},
};

/** Selects the evaluation's tests: XML 1.0 fifth edition and Namespaces 1.0, decidable without external entities. */
export function evaluationTests(tests: readonly XmltsTest[]): XmltsTest[] {
  return tests.filter((test) => {
    if (!/^(?:XML1\.0|NS1\.0)/.test(test.recommendation) || test.version === '1.1') return false;
    if (test.editions !== undefined && !test.editions.includes('5')) return false;
    if (test.type === 'error' || !test.namespace) return false;
    return !(test.type === 'not-wf' && test.entities !== 'none') && existsSync(test.path);
  });
}

/** The expected first-form output, unless the test has none or its expected output holds a DOCTYPE. */
function expectedOutput(test: XmltsTest): string | undefined {
  if (test.output === undefined || test.entities !== 'none') return undefined;
  const expected = readFileSync(test.output, 'utf8');
  return expected.includes('<!DOCTYPE') ? undefined : expected;
}

/** Runs one test as the evaluation did: once as given, and again with the detected encoding if that fails. */
async function attempt(
  adapter: Adapter,
  test: XmltsTest,
  bytes: Uint8Array,
  options?: ParseOptions
): Promise<[Outcome, boolean]> {
  const systemId = pathToFileURL(test.path).href;
  const first = await adapter.canonical({ bytes, systemId }, 'standalone', 'first', options);
  const encoding = detectedEncoding(bytes);
  if (first.accepted || encoding === undefined) return [first, false];
  const retry = await adapter.canonical({ bytes, systemId, encoding }, 'standalone', 'first', options);
  return retry.accepted ? [retry, true] : [first, false];
}

/** Runs the evaluation profile for one library, with the options it ran under. */
export async function evaluate(
  adapter: Adapter,
  tests: readonly XmltsTest[],
  options?: ParseOptions
): Promise<EvaluationRow[]> {
  const rows: EvaluationRow[] = [];
  for (const test of evaluationTests(tests)) {
    const bytes = readFileSync(test.path);
    const [outcome, toldEncoding] = await attempt(adapter, test, bytes, options);
    const expected = expectedOutput(test);
    const markup = new TextDecoder('latin1').decode(bytes);
    rows.push({
      id: test.id,
      type: test.type,
      accepted: outcome.accepted,
      ...(expected !== undefined && { output: outcome.accepted && outcome.canonical === expected }),
      outsideDtd: !/<!DOCTYPE[^>[]*\[/.test(markup),
      dataTest: expected !== undefined && !/<!(?:ATTLIST|ENTITY)/.test(markup),
      toldEncoding,
    });
  }
  return rows;
}

/** Computes the three scores from the evaluation's rows. */
export function scores(rows: readonly EvaluationRow[]): EvaluationScores {
  const malformed = rows.filter((row) => row.type === 'not-wf');
  const outside = malformed.filter((row) => row.outsideDtd);
  const data = rows.filter((row) => row.dataTest);
  return {
    rejectsMalformed: { passed: malformed.filter((row) => !row.accepted).length, total: malformed.length },
    outsideDtd: { passed: outside.filter((row) => !row.accepted).length, total: outside.length },
    data: { passed: data.filter((row) => row.output === true).length, total: data.length },
  };
}

/** Formats a score as the evaluation reported it, such as `62.8% (597/951)`. */
export function percent(score: Score): string {
  return `${((100 * score.passed) / score.total).toFixed(1)}% (${score.passed}/${score.total})`;
}
