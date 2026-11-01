import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Workload } from '@exemplarjs/adapters';
import type { LibraryReport } from '@exemplarjs/conformance';
import { type Bar, type BarChart, type Coverage, renderChart } from './charts.ts';
import type { Difference } from './correctness.ts';
import { type Dataset, inputBytes } from './datasets.ts';
import type { Fair, Summary } from './harness.ts';
import { PACKAGE, REPORTS, ROOT } from './paths.ts';

/** A library's conformance scores, as the benchmark report shows them. */
interface ConformanceColumns {
  readonly rejectsMalformed?: number;
  readonly correctData?: number;
}

/** A dataset as the report describes it. */
export interface DatasetEntry extends Omit<Dataset, 'directory' | 'documents' | 'configuration' | 'workloads'> {
  readonly documents: number;
  readonly bytes: number;
}

/** Everything one benchmark run measured, with what it ran on. */
export interface BenchReport {
  readonly machine: string;
  readonly runtime: string;
  readonly commit: string;
  readonly date: string;
  readonly datasets: readonly DatasetEntry[];
  readonly differences: Readonly<Record<string, readonly Difference[]>>;
  readonly summaries: readonly Summary[];
  readonly conformance: Readonly<Record<string, ConformanceColumns>>;
}

/** Describes the machine, the runtime, the commit and the day of the run. */
export function environment(): Pick<BenchReport, 'machine' | 'runtime' | 'commit' | 'date'> {
  const cpus = os.cpus();
  return {
    machine: `${cpus[0]?.model ?? 'unknown CPU'}, ${cpus.length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.arch()}`,
    runtime: `Node ${process.versions.node}, V8 ${process.versions.v8}`,
    // A copy without history, such as the one `bench:remote` runs, is told which commit it is.
    commit: process.env['EXEMPLAR_COMMIT'] ?? exemplarVersion(),
    date: new Date().toISOString().slice(0, 10),
  };
}

/** The exemplar under test: the commit of the checkout it is linked from, noting uncommitted changes, or the release installed. */
export function exemplarVersion(): string {
  const installed = realpathSync(path.join(PACKAGE, 'node_modules', '@exemplarjs', 'xml'));
  const release = (): string =>
    `release ${(JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8')) as { version: string }).version}`;
  if (installed.includes(`${path.sep}node_modules${path.sep}`)) return release();
  const git = spawnSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: installed, encoding: 'utf8' });
  if (git.status !== 0) return release();
  const changed =
    spawnSync('/usr/bin/git', ['status', '--porcelain'], { cwd: installed, encoding: 'utf8' }).stdout !== '';
  return git.stdout.trim() + (changed ? ' with uncommitted changes' : '');
}

/** Reads each library's conformance scores from the conformance runner's report, if it has run. */
export function conformanceColumns(): Record<string, ConformanceColumns> {
  const file = path.join(ROOT, 'tools', 'conformance', 'reports', 'conformance.json');
  if (!existsSync(file)) return {};
  const columns: Record<string, ConformanceColumns> = {};
  for (const report of JSON.parse(readFileSync(file, 'utf8')) as LibraryReport[]) {
    const standalone = report.rows.filter((row) => row.configuration === 'standalone');
    const malformed = standalone.filter((row) => row.type === 'not-wf');
    const judged = malformed.reduce((sum, row) => sum + row.pass + row.fail + row.expectedFailure, 0);
    const rejected = malformed.reduce((sum, row) => sum + row.pass, 0);
    const checked = standalone.reduce((sum, row) => sum + row.outputChecked, 0);
    const matched = standalone.reduce((sum, row) => sum + row.outputMatched, 0);
    columns[report.library] = {
      ...(judged > 0 && { rejectsMalformed: rejected / judged }),
      ...(checked > 0 && { correctData: matched / checked }),
    };
  }
  return columns;
}

/** Describes a dataset for the report. */
export function datasetEntry(dataset: Dataset): DatasetEntry {
  return {
    name: dataset.name,
    title: dataset.title,
    ...(dataset.about !== undefined && { about: dataset.about }),
    version: dataset.version,
    licence: dataset.licence,
    documents: dataset.documents.length,
    bytes: dataset.documents.reduce((sum, file) => sum + inputBytes(dataset, file), 0),
    leftOut: dataset.leftOut,
  };
}

/** Text as a Markdown code span, so that markup in it shows as written. */
function code(text: string): string {
  const fence = '`'.repeat(Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length)) + 1);
  return `${fence} ${text} ${fence}`;
}

/** Formats a share as a percentage. */
function share(value: number | undefined): string {
  return value === undefined ? 'n/a' : `${(100 * value).toFixed(1)}%`;
}

/** Formats a count with thousands separators. */
function count(value: number): string {
  return value.toLocaleString('en-GB');
}

/** Formats a count that may be missing. */
function counted(value: number | undefined): string {
  return value === undefined ? 'n/a' : count(value);
}

/** A library's speed in MB/s over the documents it read correctly, or 0 when there is nothing to time. */
function mbps(fair: Fair | undefined): number {
  return fair === undefined || fair.bestMs <= 0 ? 0 : fair.bytes / 1e6 / (fair.bestMs / 1000);
}

/** Below these shares of a dataset, by size, a partial reading shows red rather than orange, and FAILED rather than red. */
const MOST = 0.95;
const HALF = 0.5;

/** How much of a dataset a library read correctly, by size. */
function coverage(fair: Fair | undefined): Coverage {
  if (fair === undefined || fair.documents === fair.eligible) return 'all';
  const read = part(fair);
  if (read < HALF) return 'failed';
  return read < MOST ? 'half' : 'most';
}

/** The mark after a value from only part of a dataset. */
function mark(band: Coverage): string {
  return band === 'all' ? '' : ' ‡';
}

/** The workloads in the order the report shows them, with what each library does in them. */
const WORKLOADS: readonly (readonly [Workload, string])[] = [
  ['walk', 'parses and visits every event, reading nothing'],
  ['read', 'reads every element name, attribute and text'],
  ['stream', 'reads the same from a file in 64 KB chunks'],
  ['small', 'reads documents of 2–20 KB, which shows the cost per document'],
  ['tree', "builds the library's own tree"],
  ['write', 'serializes events it read beforehand'],
  ['dtd', 'reads a one-element document with its large DTD, counting the DTD with the document'],
];

/** What a library sorts by: exemplar first, then the others by name. */
function sortKey(name: string): string {
  return name === 'exemplar' ? '' : name.replace(/^@/, '').toLowerCase();
}

/** Libraries in the order the report shows them. */
function ordered(libraries: Iterable<string>): string[] {
  return [...new Set(libraries)].toSorted((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** The share of the documents a library could be judged on that it read correctly, by size. */
function part(fair: Fair): number {
  return fair.eligibleBytes === 0 ? 0 : fair.bytes / fair.eligibleBytes;
}

/** One library's speed in one workload, in MB/s over the documents it read correctly. */
function cell(summary: Summary | undefined): string {
  if (summary === undefined) return '–';
  if (summary.fair === undefined) return 'n/a';
  const band = coverage(summary.fair);
  if (band === 'failed') return 'FAILED';
  const speed = mbps(summary.fair);
  return `${speed === 0 ? '–' : speed.toFixed(1)}${mark(band)}`;
}

/** The tree memory a library's trees held, in MB. */
function memory(summary: Summary | undefined): string {
  if (summary === undefined) return '–';
  const band = coverage(summary.fair);
  if (band === 'failed') return 'FAILED';
  return summary.retainedMB === undefined ? '–' : `${summary.retainedMB.toFixed(0)}${mark(band)}`;
}

/** A GitHub heading anchor for a title. */
function anchor(title: string): string {
  return `#${title
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s_-]/gu, '')
    .replaceAll(/\s/g, '-')}`;
}

/** A Markdown table row. */
function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/** The legend the tables share. */
function legend(rounds: number): string[] {
  return [
    `Speeds are in MB of input per second, from the best of ${rounds} rounds, over the documents each library read correctly. A library that read only part of a dataset correctly is timed on that part, so its speed and exemplar's cover different documents. ‡ marks a library that read at least half of the data, by size, but not all of it; in the charts its bars are orange from 95% and red below. FAILED marks one that read less than half, whose speed would say little about the dataset. exemplar's bars are always blue, and – marks a workload the library does not have.`,
    '',
    'In each workload, a library:',
    '',
    ...WORKLOADS.map(([workload, what]) => `- \`${workload}\` ${what}.`),
    '',
  ];
}

/** One table across the datasets for a workload: a row per dataset, a column per library. */
function glance(report: BenchReport, workload: Workload, rows: (summary: Summary | undefined) => string): string[] {
  const results = report.summaries.filter((entry) => entry.workload === workload);
  if (results.length === 0) return [];
  const libraries = ordered(results.map((entry) => entry.library));
  const lines = [row(['Dataset', ...libraries]), row(['---', ...libraries.map(() => '---:')])];
  for (const dataset of report.datasets) {
    const ofDataset = results.filter((entry) => entry.dataset === dataset.name);
    if (ofDataset.length === 0) continue;
    const find = (library: string): Summary | undefined => ofDataset.find((entry) => entry.library === library);
    lines.push(row([`[${dataset.title}](${anchor(dataset.title)})`, ...libraries.map((name) => rows(find(name)))]));
  }
  return [...lines, ''];
}

/** What the charts measure, and what the memory section notes. */
const SPEED = 'MB/s on the documents each library reads correctly; exemplar in blue.';
const STREAMED = 'MB/s reading each file in 64 KB chunks, on the documents read correctly; exemplar in blue.';
const HELD = 'MB held once every tree is built and kept; lower is better; exemplar in blue.';
const MEMORY =
  "MB still in use once every document's tree has been built and kept: heap, native memory V8 is told of, and native memory a library reports itself. ‡ and FAILED mean the same as for speeds: a library that failed some documents holds fewer trees.";

/** The overview's sections: heading, chart title, what it measures, its workload, and whether it shows memory. */
const SECTIONS = [
  { heading: 'Reading, MB/s', title: 'Reading speed', measure: SPEED, workload: 'read' },
  { heading: 'Streaming from a file, MB/s', title: 'Streaming speed', measure: STREAMED, workload: 'stream' },
  { heading: 'Building trees, MB/s', title: 'Tree building speed', measure: SPEED, workload: 'tree' },
  { heading: 'Reading DTDs, MB/s', title: 'DTD reading speed', measure: SPEED, workload: 'dtd' },
  { heading: 'Memory the trees hold', title: 'Memory the trees hold', measure: HELD, workload: 'tree', memory: true },
] as const;

/** One overview section. */
type Section = (typeof SECTIONS)[number];

/** A section's chart file. */
function file(section: Section): string {
  return `${'memory' in section ? 'memory' : section.workload}.svg`;
}

/** How a section shows a library: its cell and label, as memory or as speed. */
function label(section: Section): (summary: Summary | undefined) => string {
  return 'memory' in section ? memory : cell;
}

/** How the charts' subtitles explain the colours. */
const KEY = 'Share read correctly: all gray, 95%+ orange ‡, 50–95% red ‡, under 50% FAILED.';

/** A section's bars across the datasets. */
function bars(report: BenchReport, section: Section): Bar[] {
  return report.datasets.flatMap((dataset) =>
    report.summaries
      .filter((summary) => summary.dataset === dataset.name && summary.workload === section.workload)
      .map((summary): Bar => {
        const band = coverage(summary.fair);
        const value = 'memory' in section ? (summary.retainedMB ?? 0) : mbps(summary.fair);
        const shown = band === 'failed' ? 0 : value;
        return {
          dataset: dataset.title,
          library: summary.library,
          value: shown,
          label: label(section)(summary),
          coverage: band,
        };
      })
  );
}

/** The conformance scores the report shows, by title. */
const SCORES = [
  ['Rejects malformed', 'rejectsMalformed'],
  ['Correct data', 'correctData'],
] as const;

/** The conformance scores as a chart: a panel per score, a bar per library. */
function checkingChart(report: BenchReport, libraries: readonly string[]): BarChart | undefined {
  const scored: Bar[] = SCORES.flatMap(([title, key]) =>
    libraries.flatMap((library) => {
      const value = report.conformance[library]?.[key];
      return value === undefined
        ? []
        : [{ dataset: title, library, value: 100 * value, label: share(value), coverage: 'all' as const }];
    })
  );
  if (scored.length === 0) return undefined;
  return {
    title: 'How much each library checks',
    subtitle: ['Share of the W3C XML suite each library passes; higher checks more; exemplar in blue.'],
    datasets: SCORES.map(([title]) => title),
    libraries,
    bars: scored,
    max: 100,
  };
}

/** The charts the report has data for, by file name. */
function charts(report: BenchReport): Map<string, BarChart> {
  const out = new Map<string, BarChart>();
  for (const section of SECTIONS) {
    const shown = bars(report, section);
    if (shown.length === 0) continue;
    out.set(file(section), {
      title: section.title,
      subtitle: [section.measure, KEY],
      datasets: report.datasets.map((dataset) => dataset.title),
      libraries: ordered(shown.map((bar) => bar.library)),
      bars: shown,
    });
  }
  const checks = checkingChart(report, ordered(report.summaries.map((entry) => entry.library)));
  if (checks !== undefined) out.set('checking.svg', checks);
  return out;
}

/** The charts a report shows, by file name. */
type Charts = ReadonlyMap<string, BarChart>;

/** The image of a chart, when the report has data for it. */
function figure(shown: Charts, file: string): string[] {
  const chart = shown.get(file);
  return chart === undefined ? [] : [`![${chart.title}](charts/${file})`, ''];
}

/** The overview: a chart and a table for each section. */
function atAGlance(report: BenchReport, shown: Charts, rounds: number): string[] {
  return [
    '## At a glance',
    '',
    ...legend(rounds),
    ...SECTIONS.flatMap((section) => [
      `### ${section.heading}`,
      '',
      ...('memory' in section ? [MEMORY, ''] : []),
      ...figure(shown, file(section)),
      ...glance(report, section.workload, label(section)),
    ]),
  ];
}

/** How much of XML each library checks, from the conformance reports. */
function checking(report: BenchReport, shown: Charts): string[] {
  return [
    '## How much each library checks',
    '',
    'A library that checks less of XML can be faster. From the conformance reports: "Rejects malformed" is the share of the not-well-formed test documents a library rejects, and "Correct data" the share of the expected outputs it matches.',
    '',
    ...figure(shown, 'checking.svg'),
    row(['Library', ...SCORES.map(([title]) => title)]),
    row(['---', ...SCORES.map(() => '---:')]),
    ...ordered(report.summaries.map((entry) => entry.library)).map((name) =>
      row([name, ...SCORES.map(([, key]) => share(report.conformance[name]?.[key]))])
    ),
    '',
  ];
}

/** The datasets, what each holds and what preparation left out. */
function datasetsTable(report: BenchReport): string[] {
  return [
    '## Datasets',
    '',
    "Preparing a dataset checks every document with the JDK's Xerces and keeps only those it accepts.",
    '',
    '| Dataset | Documents | MB | Left out in preparation | Version | Licence |',
    '| --- | ---: | ---: | ---: | --- | --- |',
    ...report.datasets.map(
      (d) =>
        `| [${d.title}](${anchor(d.title)}) | ${count(d.documents)} | ${(d.bytes / 1e6).toFixed(1)} | ${count(d.leftOut)} | ${d.version} | ${d.licence} |`
    ),
    '',
  ];
}

/** A note when exemplar rejected documents that Xerces accepted in preparation, which then count for no library. */
function rejectedByReference(differences: readonly Difference[] | undefined, dataset: DatasetEntry): string[] {
  const accepted = differences?.find((difference) => difference.library === 'exemplar')?.documents;
  if (accepted === undefined) return ['Output was not checked on this dataset, so speeds cover every document.', ''];
  if (accepted === dataset.documents) return [];
  return [
    `exemplar rejects ${count(dataset.documents - accepted)} of the ${count(dataset.documents)} documents, though Xerces accepted them in preparation. They count for no library.`,
    '',
  ];
}

/** One dataset's results: a row per library, a column per workload, then the raw measurements. */
function datasetSection(report: BenchReport, dataset: DatasetEntry): string[] {
  const results = report.summaries.filter((entry) => entry.dataset === dataset.name);
  const differences = report.differences[dataset.name];
  const workloads = WORKLOADS.map(([workload]) => workload).filter((w) => results.some((e) => e.workload === w));
  const trees = workloads.includes('tree');
  const lines = [
    `## ${dataset.title}`,
    '',
    ...(dataset.about === undefined ? [] : [...dataset.about.map((point) => `- ${point}`), '']),
    `${count(dataset.documents)} ${dataset.documents === 1 ? 'document' : 'documents'}, ${(dataset.bytes / 1e6).toFixed(1)} MB. Speeds are in MB/s.`,
    '',
    ...rejectedByReference(differences, dataset),
    row(['Library', 'Reads correctly', ...workloads.map((w) => `\`${w}\``), ...(trees ? ['Tree MB'] : [])]),
    row(['---', ...Array.from({ length: workloads.length + (trees ? 2 : 1) }, () => '---:')]),
  ];
  const preferred: Workload[] = ['read', 'tree', ...workloads];
  for (const library of ordered(results.map((entry) => entry.library))) {
    const find = (workload: Workload): Summary | undefined =>
      results.find((entry) => entry.library === library && entry.workload === workload);
    const judged = preferred.map((w) => find(w)?.fair).find((fair) => fair !== undefined);
    const correct = judged === undefined ? 'n/a' : percent(part(judged));
    const cells = workloads.map((w) => cell(find(w)));
    if (trees) cells.push(memory(find('tree')));
    lines.push(row([library, correct, ...cells]));
  }
  return [...lines, '', ...measurements(results, differences ?? [])];
}

/** A share as a whole percentage, where a small share above none shows as under 1%. */
function percent(value: number): string {
  return value > 0 && value < 0.01 ? '<1%' : `${Math.floor(100 * value)}%`;
}

/** The raw measurements of one dataset, for checking: times over every document, errors and memory. */
function measurements(results: readonly Summary[], differences: readonly Difference[]): string[] {
  const byLibrary = new Map(differences.map((difference) => [difference.library, difference]));
  const lines = [
    '<details><summary>Raw measurements</summary>',
    '',
    'Times here cover every document the workload reads, including those a library throws on or reads wrongly.',
    '',
    '| Library | Workload | Best ms | Median ms | Noise | Threw on | Wrong output | Count differs | ns/event | Retained MB |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const s of results) {
    const wrong = counted(byLibrary.get(s.library)?.wrong);
    lines.push(
      `| ${s.library} ${s.version} | ${s.workload} | ${s.bestMs.toFixed(0)} | ${s.medianMs.toFixed(0)} | ${share(s.noise)} | ${count(s.errors)} of ${count(s.documents)} | ${wrong} | ${counted(s.fair?.miscounted)} | ${s.nsPerEvent?.toFixed(0) ?? 'n/a'} | ${s.retainedMB?.toFixed(0) ?? 'n/a'} |`
    );
  }
  for (const difference of differences) {
    if (!difference.first) continue;
    const { document, detail } = difference.first;
    const how = detail === 'rejected' ? 'rejects it' : code(detail);
    lines.push('', `${difference.library} first differs in ${code(document)}: ${how}`);
  }
  return [...lines, '', '</details>', ''];
}

/** How the numbers were measured, briefly; benchmarking.md has the method in full. */
function method(rounds: number): string[] {
  return [
    '## How this was measured',
    '',
    "- **Correct output only.** Before anything is timed, each library's output for every document is compared with exemplar's, which the differential tests check against libxml2. When reading, streaming and reading DTDs, what each library counts in a document while timed must also equal exemplar's count. A library is timed only on the documents it reads correctly.",
    '- **Coverage.** A library that reads only part of a dataset correctly is timed on that part. From half of the data, by size, its speed is shown with ‡, and its bars are orange from 95% and red below. Under half, it is shown as FAILED: a part chosen by what the library can read says little about the dataset.',
    `- **Rounds.** Every round runs in a fresh process after a warm-up pass, and the best of ${rounds} rounds is reported.`,
    '- **No DTDs, but in `dtd`.** Every library, exemplar included, reads each document standalone: without its external DTD or external entities, which most of the libraries cannot read. Entities an internal subset declares are expanded. The `dtd` workload alone reads the DTD and entities each document refers to, from the files beside it.',
    "- **Prepared data.** Each dataset holds only the documents the JDK's Xerces accepts, read as the benchmarks read them.",
    '- **The full method** is in [benchmarking.md](../../../docs/benchmarking.md).',
    '',
  ];
}

/** Renders the report as Markdown. */
function markdown(report: BenchReport, shown: Charts): string {
  const rounds = report.summaries[0]?.rounds.length ?? 0;
  const commit = report.commit.replace(/^(\w{7})\w*/, '$1');
  const sections = ['At a glance', 'How much each library checks', 'Datasets', ...report.datasets.map((d) => d.title)];
  return [
    '# Benchmarks',
    '',
    `${report.date} · ${report.machine} · ${report.runtime} · commit ${commit} · best of ${rounds} rounds`,
    '',
    sections.map((title) => `[${title}](${anchor(title)})`).join(' · '),
    '',
    ...atAGlance(report, shown, rounds),
    ...checking(report, shown),
    ...datasetsTable(report),
    ...report.datasets.flatMap((dataset) => datasetSection(report, dataset)),
    ...method(rounds),
  ].join('\n');
}

/** Writes `reports/bench.md`, its charts in `reports/charts`, and `reports/bench.json`. */
export async function writeBenchReports(report: BenchReport): Promise<void> {
  mkdirSync(path.join(REPORTS, 'charts'), { recursive: true });
  writeFileSync(path.join(REPORTS, 'bench.json'), `${JSON.stringify(report, undefined, 2)}\n`);
  const shown = charts(report);
  for (const [file, chart] of shown) writeFileSync(path.join(REPORTS, 'charts', file), await renderChart(chart));
  writeFileSync(path.join(REPORTS, 'bench.md'), markdown(report, shown));
}
