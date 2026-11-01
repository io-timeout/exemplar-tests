/** Runs the benchmarks on another machine over SSH: syncs this checkout and the sibling exemplar there, builds both, runs them, and copies the reports back. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { REPORTS, ROOT } from './paths.ts';
import { exemplarVersion } from './report.ts';

/** The SSH host the benchmarks run on. */
const TARGET = process.env['SSH_BENCH_TARGET'] ?? 'bench';

/** The two checkouts on the remote, side by side in its home directory, as they are here. */
const REMOTE_TESTS = 'exemplar-tests';
const REMOTE_EXEMPLAR = 'exemplar';

/** The sibling exemplar checkout, whose build is benchmarked. */
const EXEMPLAR = path.resolve(ROOT, '..', 'exemplar');

/** What the remote builds itself or never needs; the datasets are synced so it fetches none, and it scores conformance itself. */
const EXCLUDED = [
  'node_modules',
  'dist',
  '.git',
  '.turbo',
  '.idea',
  'coverage',
  '/tools/bench/reports',
  '/tools/conformance/reports',
  '*.tsbuildinfo',
  '.DS_Store',
];

/** Quotes a string for a POSIX shell. */
function quote(s: string): string {
  return "'" + s.replaceAll("'", String.raw`'\''`) + "'";
}

/** Runs a command, throwing if it fails. */
function run(command: string, args: readonly string[]): void {
  const { status } = spawnSync(command, args, { stdio: 'inherit' });
  if (status !== 0) throw new Error(`${command} failed with exit code ${status}`);
}

/** Copies a checkout to the remote, deleting what it no longer has. */
function sync(local: string, remote: string): void {
  console.log(`Syncing ${local} to ${TARGET}:${remote}`);
  run('rsync', ['-az', '--delete', ...EXCLUDED.map((p) => `--exclude=${p}`), `${local}/`, `${TARGET}:${remote}/`]);
}

if (!existsSync(path.join(EXEMPLAR, 'packages'))) {
  throw new Error(`bench:remote benchmarks the exemplar checkout at ${EXEMPLAR}, which is missing`);
}

/** The bench commands whose report shows conformance scores; `quick` is the default. */
const SCORED_COMMANDS = new Set(['quick', 'full', 'run']);
const command = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? 'quick';

const benchArgs = process.argv
  .slice(2)
  .map((arg) => quote(arg))
  .join(' ');
const steps = [
  `cd ${REMOTE_TESTS}`,
  // fnm, where the remote has it, switches to the Node version `.node-version` pins, for both checkouts.
  '{ ! command -v fnm >/dev/null || fnm use --install-if-missing; }',
  `(cd ../${REMOTE_EXEMPLAR} && pnpm install --frozen-lockfile && pnpm compile)`,
  'pnpm install --frozen-lockfile',
  'pnpm compile',
  // Scores every library on the XML suite with this build, for the report's conformance section.
  ...(SCORED_COMMANDS.has(command) ? ['pnpm --filter @exemplarjs/conformance exec node src/cli.ts'] : []),
  `EXEMPLAR_COMMIT=${quote(exemplarVersion())} pnpm --filter @exemplarjs/bench bench ${benchArgs}`,
];

sync(EXEMPLAR, REMOTE_EXEMPLAR);
sync(ROOT.replace(/[\\/]$/, ''), REMOTE_TESTS);
console.log(`Running the benchmarks on ${TARGET}`);
// An interactive login shell, so the remote's own Node and pnpm setup applies.
run('ssh', [TARGET, `bash -lic ${quote(steps.join(' && '))}`]);
console.log(`Copying the reports back to ${REPORTS}`);
run('rsync', ['-az', `${TARGET}:${REMOTE_TESTS}/tools/bench/reports/`, REPORTS]);
