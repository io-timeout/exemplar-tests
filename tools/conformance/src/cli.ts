import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  type Adapter,
  exemplarAdapter,
  fastXmlParserAdapter,
  htmlparser2Adapter,
  libxmljs2Adapter,
  saxAdapter,
  saxenAdapter,
  saxesAdapter,
  saxonJsAdapter,
  staxXmlAdapter,
  txmlAdapter,
  xercesAdapter,
  xmldomAdapter,
  xmllintAdapter,
} from '@exemplarjs/adapters';
import { readXmlts } from './catalogue/xmlts.ts';
import { EVALUATED, type EvaluationScores, evaluate, percent, scores } from './evaluation.ts';
import { ensureSuite, pin } from './fetch.ts';
import { expectedFailures, failureKey } from './ratchet.ts';
import { type LibraryReport, summarize, writeReports } from './report.ts';
import { type Result, runXmlts } from './run.ts';

/** The libraries the command line can score, by name. */
const LIBRARIES: Readonly<Record<string, () => Adapter>> = {
  exemplar: () => exemplarAdapter,
  'fast-xml-parser': () => fastXmlParserAdapter,
  htmlparser2: () => htmlparser2Adapter,
  libxmljs2: () => libxmljs2Adapter,
  sax: () => saxAdapter,
  saxen: () => saxenAdapter,
  saxes: () => saxesAdapter,
  'saxon-js': () => saxonJsAdapter,
  'stax-xml': () => staxXmlAdapter,
  txml: () => txmlAdapter,
  '@xmldom/xmldom': () => xmldomAdapter,
  libxml2: () => xmllintAdapter(),
  xerces: () => xercesAdapter(),
};

/** Whether exemplar's results break the expected-failure list: an unexpected failure, or a listed test that passes. */
function ratchetBroken(results: readonly Result[], report: LibraryReport): boolean {
  const failures = expectedFailures();
  const listedPasses = results.filter(
    (result) => result.pass && failureKey(result.suite, result.id, result.configuration) in failures
  );
  for (const result of listedPasses) console.log(`  ${result.id} under ${result.configuration} passes but is listed`);
  return listedPasses.length > 0 || report.rows.some((row) => row.fail > 0);
}

/** Prints a library's score, and for exemplar its expected and unexpected failures. */
function print(adapter: Adapter, report: LibraryReport, own: boolean, evaluation: EvaluationScores | undefined): void {
  const count = (field: 'pass' | 'fail' | 'expectedFailure'): number =>
    report.rows.reduce((sum, row) => sum + row[field], 0);
  const applicable = count('pass') + count('fail') + count('expectedFailure');
  const expected = own ? `, ${count('expectedFailure')} expected failures, ${count('fail')} unexpected` : '';
  console.log(`${adapter.name} ${adapter.version}: ${count('pass')} of ${applicable} applicable tests pass${expected}`);
  if (evaluation) {
    console.log(
      `  evaluation: rejects malformed ${percent(evaluation.rejectsMalformed)}, outside the DTD ${percent(evaluation.outsideDtd)}, data ${percent(evaluation.data)}`
    );
  }
}

/** Scores the named libraries on the XML suite and writes the reports; exemplar breaking its list fails the run. */
async function score(names: readonly string[]): Promise<void> {
  const root = path.join(await ensureSuite('xmlts'), 'xmlconf');
  const tests = readXmlts(root);
  const reports: LibraryReport[] = [];
  for (const name of names) {
    const create = LIBRARIES[name];
    if (!create) throw new Error(`Unknown library ${name}; choose from ${Object.keys(LIBRARIES).join(', ')}`);
    const adapter = create();
    // exemplar's rejections must carry full locations, and its expected failures are listed.
    const own = name === 'exemplar';
    const results = await runXmlts(adapter, tests, { requireLocation: own, root });
    const options = EVALUATED[name];
    const evaluation = options === undefined ? undefined : scores(await evaluate(adapter, tests, options));
    const report = summarize(adapter, results, own ? expectedFailures() : {}, evaluation);
    reports.push(report);
    print(adapter, report, own, evaluation);
    if (own && ratchetBroken(results, report)) process.exitCode = 1;
  }
  writeReports(reports);
}

const { positionals } = parseArgs({ allowPositionals: true });
if (positionals[0] === 'pin') {
  for (const name of positionals.slice(1)) console.log(name, JSON.stringify(await pin(name), undefined, 2));
} else {
  await score(positionals.length > 0 ? positionals : Object.keys(LIBRARIES));
}
