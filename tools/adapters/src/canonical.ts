import { byCodeUnit } from '@exemplarjs/xml/internal';
import type { CanonicalForm } from './adapter.ts';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
};

/** Escapes character data as the first canonical form does. */
export function escape(data: string): string {
  return data.replaceAll(/[&<>"\t\n\r]/g, (c) => ESCAPES[c] ?? c);
}

/** Escapes character data as the XML 1.1 variant does: C0 and C1 controls become references too. */
function escape11(data: string): string {
  let out = '';
  for (const c of data) {
    const code = c.codePointAt(0) as number;
    const named = ESCAPES[c];
    if (named !== undefined) out += named;
    else if ((code >= 0x01 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) out += `&#${code};`;
    else out += c;
  }
  return out;
}

/** Compares names in UTF-16 code-unit order, as the evaluation's serializer did. */
function byName(a: readonly [string, string], b: readonly [string, string]): number {
  if (a[0] === b[0]) return 0;
  return a[0] < b[0] ? -1 : 1;
}

/** A notation declaration, for the second canonical form. */
interface Notation {
  readonly publicId?: string;
  readonly systemId?: string;
}

/** Writes the XML Test Suite's first or second canonical form from parse events. */
export class CanonicalWriter {
  readonly form: CanonicalForm;
  readonly #parts: string[] = [];
  readonly #notations = new Map<string, Notation>();
  #version: '1.0' | '1.1' = '1.0';
  #depth = 0;
  #root = '';
  /** Where the root start tag sits in the parts, which the second form's DOCTYPE goes before. */
  #rootPart = -1;

  constructor(form: CanonicalForm) {
    this.form = form;
  }

  /** Selects the XML 1.1 variant: an XML declaration, and references for C0 and C1 controls. */
  version(version: string): void {
    this.#version = version === '1.1' ? '1.1' : '1.0';
  }

  /** Writes a start tag, with its attributes sorted by name. */
  startElement(name: string, attributes: Iterable<readonly [string, string]>): void {
    if (this.#depth === 0 && this.#rootPart === -1) {
      this.#root = name;
      this.#rootPart = this.#parts.length;
    }
    let tag = `<${name}`;
    for (const [attribute, value] of [...attributes].toSorted(byName)) tag += ` ${attribute}="${this.#escape(value)}"`;
    this.#parts.push(`${tag}>`);
    this.#depth++;
  }

  /** Writes an end tag. */
  endElement(name: string): void {
    this.#parts.push(`</${name}>`);
    this.#depth--;
  }

  /** Writes character data; text outside the root element is not part of the form. */
  text(data: string): void {
    if (this.#depth > 0) this.#parts.push(this.#escape(data));
  }

  /** Writes a CDATA section's content as character data. */
  cdata(data: string): void {
    this.#parts.push(this.#escape(data));
  }

  /** Writes a processing instruction; an XML declaration reported as one is dropped. */
  processingInstruction(target: string, data: string): void {
    if (target !== 'xml') this.#parts.push(`<?${target} ${data}?>`);
  }

  /** Records a notation declaration for the second form. */
  notation(name: string, publicId?: string, systemId?: string): void {
    this.#notations.set(name, {
      ...(publicId !== undefined && { publicId }),
      ...(systemId !== undefined && { systemId }),
    });
  }

  /** Returns the document in canonical form. */
  toString(): string {
    const declaration = this.#version === '1.1' ? '<?xml version="1.1"?>' : '';
    const split = Math.max(0, this.#rootPart);
    return declaration + this.#parts.slice(0, split).join('') + this.#doctype() + this.#parts.slice(split).join('');
  }

  #escape(data: string): string {
    return this.#version === '1.1' ? escape11(data) : escape(data);
  }

  #doctype(): string {
    if (this.form === 'first' || this.#notations.size === 0) return '';
    let out = `<!DOCTYPE ${this.#root} [\n`;
    for (const name of [...this.#notations.keys()].toSorted(byCodeUnit)) {
      const { publicId, systemId } = this.#notations.get(name) ?? {};
      if (publicId === undefined) out += `<!NOTATION ${name} SYSTEM '${systemId ?? ''}'>\n`;
      else if (systemId === undefined) out += `<!NOTATION ${name} PUBLIC '${publicId}'>\n`;
      else out += `<!NOTATION ${name} PUBLIC '${publicId}' '${systemId}'>\n`;
    }
    return `${out}]>\n`;
  }
}
