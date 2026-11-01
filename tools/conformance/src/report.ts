import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Adapter } from '@exemplarjs/adapters';
import { type EvaluationScores, percent } from './evaluation.ts';
import { PACKAGE } from './paths.ts';
import { type ExpectedFailures, failureKey } from './ratchet.ts';
import type { Result } from './run.ts';

/** Counts for one configuration and test type. */
export interface Row {
  readonly suite: string;
  readonly configuration: string;
  readonly type: string;
  pass: number;
  fail: number;
  expectedFailure: number;
  notApplicable: number;
  /** Outputs compared with the expected output, and how many matched. */
  outputChecked: number;
  outputMatched: number;
}

/** One library's results, counted. */
export interface LibraryReport {
  readonly library: string;
  readonly version: string;
  readonly rows: readonly Row[];
  readonly evaluation?: EvaluationScores;
}

/** Counts results by suite, configuration and test type. */
export function summarize(
  adapter: Adapter,
  results: readonly Result[],
  failures: ExpectedFailures = {},
  evaluation?: EvaluationScores
): LibraryReport {
  const rows = new Map<string, Row>();
  for (const result of results) {
    const key = `${result.suite} ${result.configuration} ${result.type}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        suite: result.suite,
        configuration: result.configuration,
        type: result.type,
        pass: 0,
        fail: 0,
        expectedFailure: 0,
        notApplicable: 0,
        outputChecked: 0,
        outputMatched: 0,
      };
      rows.set(key, row);
    }
    if (result.output !== 'unchecked') row.outputChecked++;
    if (result.output === 'match') row.outputMatched++;
    if (!result.applicable) row.notApplicable++;
    else if (result.pass) row.pass++;
    else if (failureKey(result.suite, result.id, result.configuration) in failures) row.expectedFailure++;
    else row.fail++;
  }
  return {
    library: adapter.name,
    version: adapter.version,
    rows: [...rows.values()],
    ...(evaluation !== undefined && { evaluation }),
  };
}

/** Renders the reports as Markdown tables. */
function markdown(reports: readonly LibraryReport[]): string {
  const lines = ['# Conformance', ''];
  for (const report of reports) {
    lines.push(
      `## ${report.library} ${report.version}`,
      '',
      '| Suite | Configuration | Type | Pass | Fail | Expected failure | Not applicable |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...report.rows.map(
        (row) =>
          `| ${row.suite} | ${row.configuration} | ${row.type} | ${row.pass} | ${row.fail} | ${row.expectedFailure} | ${row.notApplicable} |`
      )
    );
    if (report.evaluation) {
      const { rejectsMalformed, outsideDtd, data } = report.evaluation;
      lines.push(
        '',
        `Evaluation profile: rejects malformed ${percent(rejectsMalformed)}, outside the DTD ${percent(outsideDtd)}, data ${percent(data)}.`
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Writes `reports/conformance.md` and `reports/conformance.json`. */
export function writeReports(reports: readonly LibraryReport[], directory = path.join(PACKAGE, 'reports')): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'conformance.json'), `${JSON.stringify(reports, undefined, 2)}\n`);
  writeFileSync(path.join(directory, 'conformance.md'), markdown(reports));
}
