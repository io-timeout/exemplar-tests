import { describe, expect, it } from 'vitest';
import type { Configuration, Outcome } from '@exemplarjs/adapters';
import type { TestType, XmltsTest, Entities } from '../src/catalogue/xmlts.ts';
import { SECTION_CORRECTIONS, judge } from '../src/verdict.ts';

/** A catalogue entry with the given type and entities. */
function test(type: TestType, entities: Entities = 'none'): XmltsTest {
  return {
    id: 't',
    type,
    entities,
    recommendation: 'XML1.0',
    namespace: true,
    sections: '',
    path: '/t.xml',
    description: '',
  };
}

const accepted = (validityErrors = 0, canonical = '<doc></doc>'): Outcome => ({
  accepted: true,
  canonical,
  validityErrors,
});
const rejected: Outcome = { accepted: false, message: 'bad' };

describe('judge', () => {
  it.each<[TestType, Entities, Configuration, Outcome, boolean]>([
    ['valid', 'none', 'standalone', accepted(), true],
    ['valid', 'none', 'standalone', rejected, false],
    ['valid', 'none', 'validating', accepted(1), false],
    ['invalid', 'none', 'external', accepted(), true],
    ['invalid', 'none', 'validating', accepted(), false],
    ['invalid', 'none', 'validating', accepted(2), true],
    ['not-wf', 'none', 'standalone', rejected, true],
    ['not-wf', 'none', 'standalone', accepted(), false],
    ['not-wf', 'general', 'standalone', accepted(), true],
    ['not-wf', 'general', 'external', accepted(), false],
    ['error', 'none', 'validating', accepted(), true],
    ['error', 'none', 'validating', rejected, true],
  ])('%s with entities %s under %s', (type, entities, configuration, outcome, pass) => {
    expect(judge(test(type, entities), configuration, outcome).pass).toBe(pass);
  });

  it('compares output in the second form, except under standalone when entities are needed', () => {
    expect(judge(test('valid'), 'standalone', accepted(0, '<a></a>'), '<doc></doc>')).toMatchObject({
      pass: false,
      output: 'mismatch',
    });
    expect(judge(test('valid', 'general'), 'standalone', accepted(0, '<a></a>'), '<doc></doc>').output).toBe(
      'unchecked'
    );
    expect(judge(test('valid', 'general'), 'external', accepted(), '<doc></doc>').output).toBe('match');
  });

  it('requires a full location on rejections when asked', () => {
    const located: Outcome = {
      accepted: false,
      message: 'bad',
      code: 'WF',
      line: 1,
      column: 2,
      systemId: 'file:///t.xml',
    };
    expect(judge(test('not-wf'), 'standalone', rejected, undefined, { requireLocation: true }).pass).toBe(false);
    expect(judge(test('not-wf'), 'standalone', located, undefined, { requireLocation: true }).pass).toBe(true);
  });

  it.each<[string, boolean, string, readonly string[] | undefined, boolean]>([
    ['3.3.2', true, 'XML1.0', ['VC_FIXED_DEFAULT'], true],
    ['[60]', true, 'XML1.0', ['VC_FIXED_DEFAULT'], true],
    ['3.1', true, 'XML1.0', ['VC_FIXED_DEFAULT'], false],
    ['3.1', true, 'XML1.0', ['VC_ELEMENT_VALID', 'VC_ATTRIBUTE_TYPE'], true],
    ['3.1', false, 'XML1.0', ['VC_ROOT_ELEMENT'], true],
    ['3.1', false, 'XML1.0', ['VC_ATTRIBUTE_TYPE'], false],
    ['E06', true, 'XML1.0-errata2e', ['VC_ELEMENT_VALID'], true],
    ['3', true, 'NS1.0', ['VC_NAMESPACE_COLON'], true],
    ['3.1', true, 'XML1.0', undefined, true],
  ])(
    'an invalid test of %s (DOCTYPE %s, %s) reporting %j passes: %s',
    (sections, doctype, recommendation, codes, pass) => {
      const invalid: XmltsTest = { ...test('invalid'), sections, doctype, recommendation };
      const outcome: Outcome = { ...accepted(1), ...(codes !== undefined && { validityCodes: codes }) };
      expect(judge(invalid, 'validating', outcome).pass).toBe(pass);
    }
  );

  it('checks a corrected catalogue entry against its corrected section', () => {
    const id = 'ibm-invalid-P41-ibm41i02.xml';
    const invalid: XmltsTest = { ...test('invalid'), id, sections: '3.1', doctype: true };
    const reporting = (code: string): Outcome => ({
      accepted: true,
      canonical: '<doc></doc>',
      validityErrors: 1,
      validityCodes: [code],
    });
    expect(SECTION_CORRECTIONS[id]).toBe('3.3.2');
    expect(judge(invalid, 'validating', reporting('VC_FIXED_DEFAULT')).pass).toBe(true);
    expect(judge(invalid, 'validating', reporting('VC_ATTRIBUTE_TYPE')).pass).toBe(false);
  });
});
