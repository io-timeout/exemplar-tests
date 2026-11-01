import { describe, expect, it } from 'vitest';
import { CanonicalWriter } from '@exemplarjs/adapters';

describe('CanonicalWriter', () => {
  it('writes the first form: sorted attributes, escapes, start and end tags', () => {
    const writer = new CanonicalWriter('first');
    writer.processingInstruction('xml', 'version="1.0"');
    writer.text('\n');
    writer.startElement('doc', [
      ['b', '2'],
      ['a', 'x\t"<&>"\r\n'],
    ]);
    writer.text('a & b');
    writer.startElement('empty', []);
    writer.endElement('empty');
    writer.cdata('<raw>');
    writer.processingInstruction('pi', '');
    writer.endElement('doc');
    expect(writer.toString()).toBe(
      '<doc a="x&#9;&quot;&lt;&amp;&gt;&quot;&#13;&#10;" b="2">a &amp; b<empty></empty>&lt;raw&gt;<?pi ?></doc>'
    );
  });

  it('adds sorted notation declarations in the second form only', () => {
    const notations = (form: 'first' | 'second'): string => {
      const writer = new CanonicalWriter(form);
      writer.notation('png', undefined, 'image/png');
      writer.notation('gif', '+//ISBN 0-7923//NOTATION GIF//EN');
      writer.startElement('test', []);
      writer.endElement('test');
      return writer.toString();
    };
    expect(notations('first')).toBe('<test></test>');
    expect(notations('second')).toBe(
      "<!DOCTYPE test [\n<!NOTATION gif PUBLIC '+//ISBN 0-7923//NOTATION GIF//EN'>\n<!NOTATION png SYSTEM 'image/png'>\n]>\n<test></test>"
    );
  });

  it('writes the XML 1.1 variant with a declaration and C0 and C1 references', () => {
    const writer = new CanonicalWriter('first');
    writer.version('1.1');
    writer.startElement('foo', []);
    writer.text('\u0001\u0085\n');
    writer.endElement('foo');
    expect(writer.toString()).toBe('<?xml version="1.1"?><foo>&#1;&#133;&#10;</foo>');
  });
});
