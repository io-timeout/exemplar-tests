import type { Acceptance, Configuration, Outcome } from '@exemplarjs/adapters';
import type { XmltsTest } from './catalogue/xmlts.ts';

/** How a test's output compared with its expected output. */
export type OutputCheck = 'match' | 'mismatch' | 'unchecked';

/** Whether a test passed, and why not. */
export interface Verdict {
  readonly pass: boolean;
  readonly output: OutputCheck;
  readonly reason?: string;
}

/** Settings for judging one processor. */
export interface JudgeOptions {
  /** Requires every rejection to carry a code, a line and column of at least 1, and a system id. */
  readonly requireLocation?: boolean;
}

/** The sections and productions of XML 1.0 and 1.1 where each validity constraint applies, by exemplar's code. */
const CONSTRAINT_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  VC_ROOT_ELEMENT: ['2.8', '[28]'],
  VC_PE_NESTING: ['2.8', '[29]', '3.2.1', '[49]', '[50]', '3.2.2', '[51]', '3.4', '[62]', '[63]'],
  VC_STANDALONE: ['2.9', '[32]'],
  // Element Valid checks content against the models that 3.2.1 and 3.2.2 define.
  VC_ELEMENT_VALID: ['3', '[39]', '3.2.1', '3.2.2'],
  VC_ATTRIBUTE_TYPE: ['3.1', '[41]'],
  VC_UNIQUE_ELEMENT_TYPE: ['3.2', '[45]'],
  VC_NO_DUPLICATE_TYPES: ['3.2.2', '[51]'],
  VC_ID: ['3.3.1', '[56]'],
  VC_ONE_ID: ['3.3.1', '[56]'],
  VC_ID_DEFAULT: ['3.3.1', '[56]'],
  VC_IDREF: ['3.3.1', '[56]'],
  VC_ENTITY_NAME: ['3.3.1', '[56]'],
  VC_NAME_TOKEN: ['3.3.1', '[56]'],
  VC_NOTATION_ATTRIBUTES: ['3.3.1', '[58]'],
  VC_ONE_NOTATION: ['3.3.1', '[58]'],
  VC_NOTATION_EMPTY: ['3.3.1', '[58]'],
  VC_DUPLICATE_TOKENS: ['3.3.1', '[58]', '[59]'],
  VC_ENUMERATION: ['3.3.1', '[59]'],
  VC_REQUIRED_ATTRIBUTE: ['3.3.2', '[60]'],
  VC_DEFAULT_SYNTAX: ['3.3.2', '[60]'],
  VC_FIXED_DEFAULT: ['3.3.2', '[60]'],
  VC_ENTITY_DECLARED: ['4.1', '[68]', '[69]'],
  VC_NOTATION_DECLARED: ['4.2.2', '[76]'],
  VC_UNIQUE_NOTATION: ['4.7', '[82]'],
};

const CONSTRAINED = new Set(Object.values(CONSTRAINT_SECTIONS).flat());

/** Catalogue entries whose SECTIONS name a part their document does not break, with the one it does; exceptions.md explains each. */
export const SECTION_CORRECTIONS: Readonly<Record<string, string>> = {
  'ibm-invalid-P41-ibm41i02.xml': '3.3.2',
  'o-p75pass1': '3',
};

/** Where an invalid test's validity error must come from: 2.8 when it has no DTD, else the constrained parts its SECTIONS name. */
function wantedSections(test: XmltsTest): string[] {
  // The sections of Namespaces tests are the Namespaces recommendation's.
  if (!test.recommendation.startsWith('XML')) return [];
  if (test.doctype === false) return ['2.8'];
  const sections = SECTION_CORRECTIONS[test.id] ?? test.sections;
  return sections.split(/[\s,]+/).filter((part) => CONSTRAINED.has(part));
}

/** Why an accepted invalid document fails under `validating`: no validity error, or none from the sections it tests. */
function invalidityProblem(test: XmltsTest, outcome: Acceptance): string | undefined {
  if (outcome.validityErrors === 0) return 'reported no validity error in an invalid document';
  const wanted = wantedSections(test);
  const codes = outcome.validityCodes;
  if (codes === undefined || wanted.length === 0) return undefined;
  if (codes.some((code) => CONSTRAINT_SECTIONS[code]?.some((part) => wanted.includes(part)))) return undefined;
  return `reported no validity error from ${wanted.join(' or ')}: ${codes.join(', ')}`;
}

/** Whether a rejection carries everything the location rule asks for. */
function located(outcome: Outcome): boolean {
  if (outcome.accepted) return true;
  const { code, line, column, systemId } = outcome;
  return code !== undefined && (line ?? 0) >= 1 && (column ?? 0) >= 1 && systemId !== undefined;
}

/** Compares an accepted document's canonical output with the expected output, where the rules ask for it. */
function checkOutput(test: XmltsTest, configuration: Configuration, outcome: Outcome, expected?: string): OutputCheck {
  if (!outcome.accepted || expected === undefined || outcome.canonical === undefined) return 'unchecked';
  if (configuration === 'standalone' && test.entities !== 'none') return 'unchecked';
  return outcome.canonical === expected ? 'match' : 'mismatch';
}

/** Decides the verdict for one test under one configuration, by the table in testing.md. */
export function judge(
  test: XmltsTest,
  configuration: Configuration,
  outcome: Outcome,
  expected?: string,
  options: JudgeOptions = {}
): Verdict {
  const output = checkOutput(test, configuration, outcome, expected);
  const fail = (reason: string): Verdict => ({ pass: false, output, reason });
  if (test.type === 'error') return { pass: true, output };
  if (test.type === 'not-wf') {
    if (outcome.accepted && (configuration !== 'standalone' || test.entities === 'none')) {
      return fail('accepted a document that is not well-formed');
    }
    if (options.requireLocation && !located(outcome)) return fail('rejected without a full location');
    return { pass: true, output };
  }
  if (!outcome.accepted) return fail(`rejected: ${outcome.message}`);
  if (configuration === 'validating' && test.type === 'valid' && outcome.validityErrors > 0) {
    return fail('reported a validity error in a valid document');
  }
  const problem = configuration === 'validating' && test.type === 'invalid' && invalidityProblem(test, outcome);
  if (problem) return fail(problem);
  if (output === 'mismatch') return fail('output differs from the expected output');
  return { pass: true, output };
}
