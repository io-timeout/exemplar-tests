/** A conformance configuration: which external content a parser reads, and whether it validates. */
export type Configuration = 'standalone' | 'external' | 'validating';

/** The XML Test Suite's canonical forms; the second adds notation declarations. */
export type CanonicalForm = 'first' | 'second';

/** A benchmark task every library performs the same way. */
export type Workload = 'walk' | 'read' | 'tree' | 'stream' | 'small' | 'write' | 'dtd';

/** A document to parse: its bytes, its location and any encoding supplied from outside. */
export interface Source {
  readonly bytes: Uint8Array;
  /** The document's file URL. */
  readonly systemId: string;
  readonly encoding?: string;
}

/** A document the library rejected, with as much of the error as it reports. */
export interface Rejection {
  readonly accepted: false;
  readonly message: string;
  readonly code?: string;
  readonly line?: number;
  readonly column?: number;
  readonly systemId?: string;
}

/** A document the library accepted, in canonical form when the library can write one. */
export interface Acceptance {
  readonly accepted: true;
  readonly canonical?: string;
  readonly validityErrors: number;
  /** The codes of the validity errors, for adapters that report them. */
  readonly validityCodes?: readonly string[];
}

/** What a library made of one document. */
export type Outcome = Acceptance | Rejection;

/** Per-document settings beyond the configuration. */
export interface ParseOptions {
  /** False for documents that use colons in ways Namespaces forbids. */
  readonly namespaceAware?: boolean;
  /** Feeds the bytes in chunks of this size, for adapters that read chunks. */
  readonly chunkSize?: number;
  /** Decodes the bytes to a string first, for adapters that read strings as well as bytes. */
  readonly text?: boolean;
  /** The directory external entities and DTDs may be read from, under the configurations that read them. */
  readonly root?: string;
  /** For exemplar: the reading API to parse with; the cursor by default. */
  readonly api?: ExemplarApi;
  /** For exemplar's SAX: false leaves out processing instructions in the DTD, which a DOM has no place for. */
  readonly dtdProcessingInstructions?: boolean;
}

/** exemplar's reading APIs: the cursor, event objects, SAX and the DOM, each sync or async; or a copy through the writer, read again. */
export type ExemplarApi =
  | 'cursor'
  | 'async'
  | 'events'
  | 'async-events'
  | 'sax'
  | 'async-sax'
  | 'dom'
  | 'async-dom'
  | 'round-trip';

/** A document prepared for a timed workload. */
export interface Input {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly text: string;
}

/** One XML library behind the interface the conformance runner and the benchmarks share. */
export interface Adapter {
  readonly name: string;
  readonly version: string;
  readonly configurations: readonly Configuration[];
  readonly workloads: readonly Workload[];
  /** Parses a document and returns its canonical form, or why it was rejected. */
  canonical(
    source: Source,
    configuration: Configuration,
    form: CanonicalForm,
    options?: ParseOptions
  ): Outcome | Promise<Outcome>;
  /** Prepares an input before timing, for workloads such as `write` that start from the library's own form of the document. */
  prepare?(workload: Workload, input: Input): unknown;
  /** Performs one workload and returns a count that depends on everything it read or wrote. */
  run(workload: Workload, input: Input, prepared?: unknown): number | Promise<number>;
  /** Builds and returns the library's tree, which the `tree` workload keeps to measure the heap it retains. */
  build?(input: Input): unknown;
  /** The memory the library holds outside V8, which the `tree` workload counts as retained too. */
  nativeMemory?(): number;
}

/** Turns anything a library throws into a rejection. */
export function rejection(error: unknown): Rejection {
  const message = error instanceof Error ? error.message : String(error);
  return { accepted: false, message: message.slice(0, 500) };
}

/** Builds the error an adapter throws for a workload its library has no style for. */
export function unsupported(adapter: string, workload: Workload): Error {
  return new Error(`${adapter} has no style for the ${workload} workload`);
}
