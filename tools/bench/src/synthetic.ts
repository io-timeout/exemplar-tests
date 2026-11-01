/** Average attributes per element, the chance that an element holds text, that a text run holds a predefined entity
 * reference, and that a word is non-ASCII: close to typical technical documentation. */
const ATTRIBUTES = 1.2;
const TEXT = 0.6;
const ENTITIES = 0.05;
const NON_ASCII_SHARE = 0.01;

/** The scaling series' sizes, in elements. */
export const SCALING_SERIES = [100_000, 1_000_000] as const;

const WORDS = ['data', 'module', 'step', 'warning', 'para', 'figure', 'value', 'item', 'title', 'note'];
const NON_ASCII = ['Größe', 'café', 'naïve', 'Ωmega', '数据', 'ключ'];
const NAMES = ['para', 'title', 'item', 'step', 'note', 'list', 'table', 'entry', 'ref', 'emphasis'];

/** A small seeded generator (mulberry32), so every run builds the same document. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    // eslint-disable-next-line prefer-math-trunc -- wraps to 32 bits, as mulberry32 needs and Math.trunc does not
    state = (state + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Picks one item of a list. */
function pick<T>(next: () => number, list: readonly T[]): T {
  return list[Math.floor(next() * list.length)] ?? (list[0] as T);
}

/** Builds a start tag with a random number of attributes. */
function startTag(name: string, next: () => number): string {
  let tag = `<${name}`;
  for (let a = 0; next() < ATTRIBUTES / (ATTRIBUTES + 1) && a < 8; a++) {
    tag += ` a${a}="${pick(next, WORDS)}${Math.floor(next() * 1000)}"`;
  }
  return `${tag}>`;
}

/** Builds a run of words, some non-ASCII, some with entity references. */
function textRun(next: () => number): string {
  const words = Array.from({ length: 3 + Math.floor(next() * 12) }, () =>
    pick(next, next() < NON_ASCII_SHARE ? NON_ASCII : WORDS)
  );
  if (next() < ENTITIES) words.push('&amp;', '&lt;x&gt;');
  return words.join(' ');
}

/** Builds a synthetic document of a number of elements from a fixed seed. */
export function generate(elements: number): string {
  const next = random(1);
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<doc>\n'];
  const open: string[] = [];
  for (let element = 1; element < elements; element++) {
    while (open.length > 0 && (open.length > 12 || next() < 0.35)) parts.push(`</${open.pop()}>\n`);
    const name = pick(next, NAMES);
    parts.push(startTag(name, next));
    if (next() < TEXT) parts.push(textRun(next));
    open.push(name);
  }
  while (open.length > 0) parts.push(`</${open.pop()}>\n`);
  parts.push('</doc>\n');
  return parts.join('');
}
