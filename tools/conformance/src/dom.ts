import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { DOMImplementation, DOMImplementationRegistry, type Document, DocumentBuilder } from '@exemplarjs/dom';
import { dtdValidator } from '@exemplarjs/validation';
import { XMLInputFactory } from '@exemplarjs/xml';
import { byCodeUnit } from '@exemplarjs/xml/internal';
import { fileResolver } from '@exemplarjs/xml/resolvers/file';

/** One test page of the DOM Conformance Test Suite. */
export interface DomTest {
  /** The level and module directory, such as `level1/core`. */
  readonly module: string;
  readonly name: string;
  readonly path: string;
}

/** A DOM test's result: passed, failed with the reason, or not run because it needs what exemplar lacks. */
export interface DomResult {
  readonly pass: boolean;
  readonly skipped?: string;
  readonly reason?: string;
}

/** The modules the runner covers. */
export const DOM_MODULES = ['level1/core', 'level2/core', 'level3/core'] as const;

/** Pages in a module directory that are not tests. */
const NOT_TESTS = new Set(['alltests.html', 'index.html']);

/** Lists the test pages of the suite, below the directory it was fetched to. */
export function readDomTests(root: string): DomTest[] {
  return DOM_MODULES.flatMap((module) =>
    readdirSync(path.join(root, module))
      .filter((file) => file.endsWith('.html') && !NOT_TESTS.has(file))
      .toSorted(byCodeUnit)
      .map((file) => ({ module, name: file.slice(0, -5), path: path.join(root, module, file) }))
  );
}

/** The implementation attributes, defaulted as the suite's own configuration defaults them. */
const DEFAULTS: Readonly<Record<string, boolean>> = {
  validating: false,
  expandEntityReferences: false,
  coalescing: false,
  ignoringElementContentWhitespace: false,
  namespaceAware: false,
  ignoringComments: false,
};

/** Level 3 runs through an LSParser, whose defaults are namespace-aware. */
const LEVEL3_DEFAULTS: Readonly<Record<string, boolean>> = { ...DEFAULTS, namespaceAware: true };

/** Attributes every ECMAScript implementation has, which cannot change. */
const FIXED: Readonly<Record<string, boolean>> = { signed: true, hasNullString: true };

const quiet = { warning: () => {}, error: () => {} };

/** The test builder DOMTestCase.js calls, which parses the suite's files with exemplar's DocumentBuilder. */
class ExemplarTestBuilder {
  contentType = 'text/xml';
  readonly supportedContentTypes = ['text/xml'];
  initializationError: unknown = null;
  initializationFatalError: unknown = null;
  readonly skipIncompatibleTests = true;
  readonly async = false;
  readonly #files: string;
  readonly #attributes: Record<string, boolean>;
  readonly #implementation = new DOMImplementation();

  constructor(files: string, level3: boolean) {
    this.#files = files;
    this.#attributes = { ...(level3 ? LEVEL3_DEFAULTS : DEFAULTS) };
  }

  getImplementation(): DOMImplementation {
    return this.#implementation;
  }

  hasFeature(feature: string, version: string | null): boolean {
    return this.#implementation.hasFeature(feature, version);
  }

  setContentType(contentType: string): void {
    this.contentType = contentType;
  }

  getImplementationAttribute(name: string): boolean {
    return FIXED[name] ?? this.#attributes[name] ?? false;
  }

  canSetImplementationAttribute(name: string, value: boolean): boolean {
    if (name in FIXED) return FIXED[name] === value;
    return name in DEFAULTS;
  }

  setImplementationAttribute(name: string, value: boolean): void {
    if (!this.canSetImplementationAttribute(name, value)) {
      this.initializationError = `exemplar does not support ${name}=${String(value)}`;
      return;
    }
    if (name in DEFAULTS) this.#attributes[name] = value;
  }

  preload(): number {
    return 1;
  }

  /** Parses a file of the suite afresh, with the attributes the test set. */
  load(_frame: unknown, _name: string, url: string): Document {
    const file = path.join(this.#files, `${url}.xml`);
    const a = this.#attributes;
    const factory = new XMLInputFactory({
      namespaceAware: a['namespaceAware'] === true,
      coalescing: a['coalescing'] === true,
      replaceEntityReferences: a['expandEntityReferences'] === true,
      accessExternalDTD: ['file'],
      accessExternalEntities: ['file'],
      entityResolver: fileResolver({ root: this.#files }),
      errorHandler: quiet,
      ...(a['validating'] === true && { validator: dtdValidator() }),
    });
    const builder = new DocumentBuilder(factory, {
      ignoringComments: a['ignoringComments'] === true,
      ignoringElementContentWhitespace: a['ignoringElementContentWhitespace'] === true,
    });
    return builder.parse({ systemId: pathToFileURL(file).href, bytes: readFileSync(file) });
  }
}

/** The suite's scripts, compiled once each. */
const scripts = new Map<string, vm.Script>();

function script(file: string): vm.Script {
  let compiled = scripts.get(file);
  if (compiled === undefined) {
    // eslint-disable-next-line code-eval -- the W3C suite's own scripts
    compiled = new vm.Script(readFileSync(file, 'utf8'), { filename: file });
    scripts.set(file, compiled);
  }
  return compiled;
}

/** The test's own script: the page's inline script element. */
function inlineScript(page: string): string {
  const html = readFileSync(page, 'utf8');
  const found = /<script type="text\/javascript">([\s\S]*?)<\/script>/.exec(html);
  if (found?.[1] === undefined) throw new Error(`${page} has no inline script`);
  return found[1];
}

/** A value from the test's realm as text. */
function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : (JSON.stringify(value) ?? '');
}

/** What a test function threw, as a reason. */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'object' && error !== null) {
    const { jsUnitMessage, comment, name, message } = error as Record<string, unknown>;
    if (jsUnitMessage !== undefined) return `${text(comment ?? '')} ${text(jsUnitMessage)}`.trim();
    if (name !== undefined) return `${text(name)}: ${text(message ?? '')}`;
  }
  return text(error);
}

/** Runs one test page in a context of its own with jsUnit, its level's DOMTestCase.js and exemplar's builder. */
export function runDomTest(root: string, test: DomTest): DomResult {
  const directory = path.dirname(test.path);
  const builder = new ExemplarTestBuilder(path.join(directory, 'files'), test.module.startsWith('level3'));
  const notes: string[] = [];
  const context = vm.createContext({
    location: { href: pathToFileURL(test.path).href },
    navigator: { userAgent: 'exemplar' },
    addEventListener: () => {},
    alert: (message: unknown) => notes.push(String(message)),
    info: (message: unknown) => notes.push(String(message)),
    warn: (message: unknown) => notes.push(String(message)),
    debug: () => {},
    DOMException,
    DOMImplementationRegistry,
  });
  // The page is its own window and top frame.
  context['window'] = context;
  context['top'] = context;
  script(path.join(root, 'jsunit/app/jsUnitCore.js')).runInContext(context);
  script(path.join(directory, 'DOMTestCase.js')).runInContext(context);
  context['createConfiguredBuilder'] = () => builder;
  // eslint-disable-next-line code-eval -- the W3C suite's own scripts
  vm.runInContext(inlineScript(test.path), context, { filename: test.path });
  const setUp = `(function () { setUpPage(); return exposeTestFunctionNames().map(function (name) { return this[name]; }, this); })`;
  // eslint-disable-next-line code-eval -- the W3C suite's own scripts
  const run = vm.runInContext(setUp, context) as () => (() => void)[];
  let tests: (() => void)[];
  try {
    tests = run();
  } catch (error) {
    return { pass: false, reason: `setUpPage: ${describe(error)}` };
  }
  if (builder.initializationError !== null) return { pass: false, skipped: text(builder.initializationError) };
  for (const each of tests) {
    try {
      each.call(context);
    } catch (error) {
      return { pass: false, reason: describe(error) };
    }
  }
  return { pass: true };
}
