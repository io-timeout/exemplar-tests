/** The W3C conformance runner: catalogues, configurations, verdicts and reports. */
export type { Entities, TestType, XmltsTest } from './catalogue/xmlts.ts';
export { readXmlts } from './catalogue/xmlts.ts';
export { CONFIGURATIONS, applies } from './configurations.ts';
export type { EvaluationRow, EvaluationScores, Score } from './evaluation.ts';
export { evaluate, evaluationTests, percent, scores } from './evaluation.ts';
export type { SuiteSpec } from './fetch.ts';
export { download, ensureSuite, pin, sha256, suites, writeBelow } from './fetch.ts';
export type { ExpectedFailures } from './ratchet.ts';
export { expectedFailures, failureKey, unknownEntries } from './ratchet.ts';
export type { LibraryReport, Row } from './report.ts';
export { summarize, writeReports } from './report.ts';
export type { Result, RunOptions } from './run.ts';
export { runTest, runXmlts } from './run.ts';
export type { TarEntry } from './tar.ts';
export { readTar } from './tar.ts';
export type { JudgeOptions, OutputCheck, Verdict } from './verdict.ts';
export { judge } from './verdict.ts';
