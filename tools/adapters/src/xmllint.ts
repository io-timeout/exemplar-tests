import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  type Adapter,
  type Configuration,
  type Outcome,
  type ParseOptions,
  type Source,
  unsupported,
} from './adapter.ts';

/** The xmllint options for each configuration. */
const ARGUMENTS: Record<Configuration, string[]> = {
  standalone: ['--noout', '--nonet'],
  external: ['--noout', '--nonet', '--loaddtd', '--noent'],
  validating: ['--noout', '--nonet', '--valid', '--noent'],
};

/** One error line from xmllint: `file:line: kind error : message`. */
const ERROR_LINE = /^(.*?):(\d+): (?:[^:]*: )?(parser|namespace|validity) error : (.*)$/;

/** Turns an xmllint error line into a rejection. */
function rejectionFrom(match: RegExpExecArray | undefined, stderr: string): Outcome {
  if (!match) return { accepted: false, message: stderr.trim().slice(0, 500) };
  const [, file = '', number = '0', , message = ''] = match;
  return { accepted: false, message, line: Number(number), systemId: file };
}

/** Classifies xmllint's result: exit code 1 means no document; namespace errors reject only when namespaces are on. */
function classify(stderr: string, exitCode: number, options?: ParseOptions): Outcome {
  const errors = stderr
    .split('\n')
    .map((line) => ERROR_LINE.exec(line))
    .filter((match) => match !== null);
  const parser = errors.find((match) => match[3] === 'parser');
  const namespace = errors.find((match) => match[3] === 'namespace');
  if (exitCode === 1) return rejectionFrom(parser ?? namespace ?? errors[0], stderr);
  if (namespace && options?.namespaceAware !== false) return rejectionFrom(namespace, stderr);
  const validityErrors = errors.filter((match) => match[3] === 'validity').length;
  return {
    accepted: true,
    validityErrors: exitCode === 3 || exitCode === 4 ? Math.max(validityErrors, 1) : validityErrors,
  };
}

/** Runs xmllint on one file and resolves with its exit code and stderr. */
function runXmllint(executable: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stderr }));
  });
}

/** The xmllint option for each Canonical XML method. */
const C14N_OPTIONS = { c14n: '--c14n', c14n11: '--c14n11', 'exc-c14n': '--exc-c14n' } as const;

/** Canonicalizes a file with xmllint, comments kept as its options keep them; undefined when it fails. */
export function xmllintCanonical(
  file: string,
  method: keyof typeof C14N_OPTIONS,
  executable = process.env['XMLLINT'] ?? '/usr/bin/xmllint'
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--nonet', C14N_OPTIONS[method], file], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve(code === 0 ? Buffer.concat(chunks).toString('utf8') : undefined));
  });
}

/** Creates an adapter for libxml2's xmllint, which gives verdicts but no canonical output. */
export function xmllintAdapter(executable = process.env['XMLLINT'] ?? '/usr/bin/xmllint'): Adapter {
  const { stdout, stderr } = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  const release = /libxml version (\d+)/.exec(`${stdout}${stderr}`)?.[1] ?? '0';
  const version = `${Number(release.slice(0, -4))}.${Number(release.slice(-4, -2))}.${Number(release.slice(-2))}`;
  return {
    name: 'libxml2',
    version,
    configurations: ['standalone', 'external', 'validating'],
    workloads: [],
    async canonical(source: Source, configuration: Configuration, _form, options?: ParseOptions) {
      const { exitCode, stderr } = await runXmllint(executable, [
        ...ARGUMENTS[configuration],
        fileURLToPath(source.systemId),
      ]);
      return classify(stderr, exitCode, options);
    },
    run(workload) {
      throw unsupported('libxml2', workload);
    },
  };
}
