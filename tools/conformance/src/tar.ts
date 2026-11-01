const BLOCK = 512;
const latin1 = new TextDecoder('latin1');

/** One regular file from a tar archive. */
export interface TarEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

/** Reads a NUL-terminated header field. */
function field(header: Uint8Array, start: number, length: number): string {
  const text = latin1.decode(header.subarray(start, start + length));
  const end = text.indexOf('\0');
  return end === -1 ? text : text.slice(0, end);
}

/** Reads the `path` record of a pax extended header. */
function paxPath(data: Uint8Array): string | undefined {
  for (const record of new TextDecoder().decode(data).split('\n')) {
    const equals = record.indexOf('=');
    const space = record.indexOf(' ');
    if (space !== -1 && equals > space && record.slice(space + 1, equals) === 'path') return record.slice(equals + 1);
  }
  return undefined;
}

/** Reads the regular files of an uncompressed tar archive, following GNU and pax long names. */
export function* readTar(archive: Uint8Array): Generator<TarEntry> {
  let offset = 0;
  let longName: string | undefined;
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) return;
    const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8);
    const type = field(header, 156, 1) || '0';
    const prefix = field(header, 257, 6) === 'ustar' ? field(header, 345, 155) : '';
    const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    const data = archive.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    longName = undefined;
    if (type === 'L') longName = field(data, 0, data.length);
    else if (type === 'x') longName = paxPath(data);
    else if (type === '0' || type === '7') yield { path: name, data };
  }
}
