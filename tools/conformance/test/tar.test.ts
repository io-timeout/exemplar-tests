import { describe, expect, it } from 'vitest';
import { readTar } from '../src/tar.ts';

const encoder = new TextEncoder();

/** Builds one 512-byte tar header. */
function header(name: string, size: number, type: string, prefix = ''): Uint8Array {
  const block = new Uint8Array(512);
  block.set(encoder.encode(name), 0);
  block.set(encoder.encode(size.toString(8).padStart(11, '0')), 124);
  block.set(encoder.encode(type), 156);
  block.set(encoder.encode('ustar\u0000'), 257);
  block.set(encoder.encode(prefix), 345);
  return block;
}

/** Pads data to a whole number of blocks. */
function padded(data: Uint8Array): Uint8Array {
  const block = new Uint8Array(Math.ceil(data.length / 512) * 512);
  block.set(data);
  return block;
}

/** Joins blocks into one archive, ending with two zero blocks. */
function archive(...blocks: Uint8Array[]): Uint8Array {
  const all = [...blocks, new Uint8Array(1024)];
  const out = new Uint8Array(all.reduce((sum, block) => sum + block.length, 0));
  let offset = 0;
  for (const block of all) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}

describe('readTar', () => {
  it('reads regular files and skips directories', () => {
    const data = encoder.encode('<doc/>');
    const entries = [...readTar(archive(header('dir/', 0, '5'), header('dir/a.xml', data.length, '0'), padded(data)))];
    expect(entries.map((entry) => entry.path)).toEqual(['dir/a.xml']);
    expect(new TextDecoder().decode(entries[0]?.data)).toBe('<doc/>');
  });

  it('joins the ustar prefix to the name', () => {
    const entries = [...readTar(archive(header('a.xml', 0, '0', 'long/prefix')))];
    expect(entries.map((entry) => entry.path)).toEqual(['long/prefix/a.xml']);
  });

  it('follows GNU long names', () => {
    const name = encoder.encode(`${'x'.repeat(120)}.xml`);
    const entries = [
      ...readTar(archive(header('././@LongLink', name.length, 'L'), padded(name), header('short', 0, '0'))),
    ];
    expect(entries.map((entry) => entry.path)).toEqual([`${'x'.repeat(120)}.xml`]);
  });

  it('follows pax path records', () => {
    const record = encoder.encode('25 path=deep/name/a.xml\n');
    const entries = [...readTar(archive(header('pax', record.length, 'x'), padded(record), header('short', 0, '0')))];
    expect(entries.map((entry) => entry.path)).toEqual(['deep/name/a.xml']);
  });
});
