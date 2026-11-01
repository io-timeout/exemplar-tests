import { type ChildProcessByStdio, spawn, spawnSync } from 'node:child_process';
import type { Socket } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  type Adapter,
  type Configuration,
  type Outcome,
  type ParseOptions,
  type Source,
  unsupported,
} from './adapter.ts';

/** The harness, run with the JDK's single-file source launcher. */
const HARNESS = fileURLToPath(new URL('../java/XercesHarness.java', import.meta.url));

/** The `java` to run: `$JAVA_HOME/bin/java` when set, else the system one. */
export function javaExecutable(): string {
  const home = process.env['JAVA_HOME'];
  return home === undefined ? '/usr/bin/java' : path.join(home, 'bin', 'java');
}

/** The version a `java` reports, or 0 when it cannot be run. */
export function javaVersion(java: string): string {
  const { stderr } = spawnSync(java, ['-version'], { encoding: 'utf8' });
  return /version "([^"]+)"/.exec(stderr ?? '')?.[1] ?? '0';
}

/** One Java harness process, answering one request per line in the order they were sent. */
export class Harness {
  readonly #child: ChildProcessByStdio<Writable, Readable, null>;
  readonly #output: Socket;
  readonly #waiting: ((line: string) => void)[] = [];

  constructor(java: string, script = HARNESS) {
    this.#child = spawn(java, [script], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.#output = this.#child.stdout as unknown as Socket;
    this.#child.unref();
    (this.#child.stdin as unknown as Socket).unref();
    this.#output.unref();
    createInterface({ input: this.#child.stdout }).on('line', (line) => {
      this.#waiting.shift()?.(line);
      // The process keeps Node alive only while an answer is awaited.
      if (this.#waiting.length === 0) this.#output.unref();
    });
  }

  /** Sends one request and resolves with its answer. */
  ask(request: string): Promise<string> {
    return new Promise((resolve) => {
      if (this.#waiting.length === 0) this.#output.ref();
      this.#waiting.push(resolve);
      this.#child.stdin.write(`${request}\n`);
    });
  }
}

/** The JSON line the harness writes for one document. */
interface Answer {
  readonly accepted: boolean;
  readonly canonical?: string;
  readonly validityErrors?: number;
  readonly message?: string;
  readonly line?: number;
  readonly column?: number;
  readonly systemId?: string;
}

/** Turns the harness's answer into an outcome. */
function outcome(answer: Answer): Outcome {
  if (answer.accepted) {
    return { accepted: true, canonical: answer.canonical ?? '', validityErrors: answer.validityErrors ?? 0 };
  }
  return {
    accepted: false,
    message: answer.message ?? '',
    ...(answer.line !== undefined && answer.line > 0 && { line: answer.line }),
    ...(answer.column !== undefined && answer.column > 0 && { column: answer.column }),
    ...(answer.systemId !== undefined && { systemId: answer.systemId }),
  };
}

/** Creates an adapter for the JDK's Xerces, which gives verdicts and canonical output for the differential tests. */
export function xercesAdapter(java = javaExecutable()): Adapter {
  const version = javaVersion(java);
  let harness: Harness | undefined;
  return {
    name: 'xerces',
    version: `JDK ${version}`,
    configurations: ['standalone', 'external', 'validating'],
    workloads: [],
    async canonical(source: Source, configuration: Configuration, _form, options?: ParseOptions) {
      harness ??= new Harness(java);
      const file = fileURLToPath(source.systemId);
      const root = options?.root ?? path.dirname(file);
      const answer = await harness.ask([configuration, options?.namespaceAware !== false, root, file].join('\t'));
      return outcome(JSON.parse(answer) as Answer);
    },
    run(workload) {
      throw unsupported('xerces', workload);
    },
  };
}
