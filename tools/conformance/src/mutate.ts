import { fc } from '@fast-check/vitest';

/** One change to a document's bytes; positions wrap around the document's length. */
export type Mutation =
  | { readonly kind: 'flip'; readonly at: number; readonly bit: number }
  | { readonly kind: 'replace'; readonly at: number; readonly byte: number }
  | { readonly kind: 'insert'; readonly at: number; readonly bytes: readonly number[] }
  | { readonly kind: 'delete'; readonly at: number; readonly length: number }
  | { readonly kind: 'duplicate'; readonly at: number; readonly length: number }
  | { readonly kind: 'truncate'; readonly at: number };

/** Bytes that mean something to an XML parser, or to a decoder. */
const INTERESTING = [
  // eslint-disable-next-line prefer-code-point -- ASCII characters
  ...Array.from('<>&;"\'/!?[]-=: \t\n\r#%xa', (c) => c.charCodeAt(0)),
  0x00,
  0x7f,
  0x80,
  0xc3,
  0xef,
  0xbb,
  0xbf,
  0xfe,
  0xff,
];

const byte = fc.oneof(fc.constantFrom(...INTERESTING), fc.integer({ min: 0, max: 255 }));
const at = fc.nat();
const length = fc.integer({ min: 1, max: 16 });

const inserted = fc.array(byte, { minLength: 1, maxLength: 4 });

/** One mutation of each kind. */
const mutation: fc.Arbitrary<Mutation> = fc.oneof(
  fc.record({ kind: fc.constant('flip' as const), at, bit: fc.integer({ min: 0, max: 7 }) }),
  fc.record({ kind: fc.constant('replace' as const), at, byte }),
  fc.record({ kind: fc.constant('insert' as const), at, bytes: inserted }),
  fc.record({ kind: fc.constant('delete' as const), at, length }),
  fc.record({ kind: fc.constant('duplicate' as const), at, length }),
  fc.record({ kind: fc.constant('truncate' as const), at })
);

/** One to three mutations, as fast-check generates and shrinks them. */
export const mutations: fc.Arbitrary<Mutation[]> = fc.array(mutation, { minLength: 1, maxLength: 3 });

/** Applies one mutation. */
function apply(bytes: Uint8Array, mutation: Mutation): Uint8Array {
  const at = mutation.at % (bytes.length + 1);
  const before = bytes.subarray(0, at);
  switch (mutation.kind) {
    case 'flip':
    case 'replace': {
      if (at === bytes.length) return bytes;
      const copy = bytes.slice();
      copy[at] = mutation.kind === 'flip' ? (copy[at] as number) ^ (1 << mutation.bit) : mutation.byte;
      return copy;
    }
    case 'insert': {
      return concat(before, Uint8Array.from(mutation.bytes), bytes.subarray(at));
    }
    case 'delete': {
      return concat(before, bytes.subarray(at + mutation.length));
    }
    case 'duplicate': {
      return concat(bytes.subarray(0, at + mutation.length), bytes.subarray(at));
    }
    case 'truncate': {
      return before.slice();
    }
  }
}

/** Joins byte arrays. */
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A document's bytes with mutations applied in order. */
export function mutate(bytes: Uint8Array, list: readonly Mutation[]): Uint8Array {
  let out = bytes;
  for (const mutation of list) out = apply(out, mutation);
  return out;
}
