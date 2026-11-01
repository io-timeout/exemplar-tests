import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Decodes a document for a library that takes strings: strict UTF-8, or the encoding given; ISO-8859-1 as registered. */
export function decode(bytes: Uint8Array, encoding?: string): string {
  // TextDecoder reads ISO-8859-1 as windows-1252, so its bytes are mapped directly.
  if (encoding !== undefined && /^(iso-8859-1|iso_8859-1|latin1|l1)$/i.test(encoding)) {
    let text = '';
    // eslint-disable-next-line prefer-code-point -- Latin-1 bytes
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return text;
  }
  return new TextDecoder(encoding ?? 'utf-8', { fatal: true }).decode(bytes);
}

/** Returns the encoding a conformant parser would detect from the BOM or the XML declaration, unless it is UTF-8. */
export function detectedEncoding(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /^<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/.exec(head)?.[1];
  return declared && !/^utf-?8$/i.test(declared) ? declared.toLowerCase() : undefined;
}

/** Returns the version the document's XML declaration names, or 1.0. */
export function declaredVersion(bytes: Uint8Array, encoding?: string): string {
  let head: string;
  try {
    head = new TextDecoder(encoding ?? detectedEncoding(bytes) ?? 'utf-8').decode(bytes.subarray(0, 256));
  } catch {
    return '1.0';
  }
  return /^\uFEFF?<\?xml\s+version\s*=\s*["']([^"']+)["']/.exec(head)?.[1] ?? '1.0';
}

/** Reads an installed package's version from the package.json above its entry point. */
export function installedVersion(name: string): string {
  let dir = path.dirname(fileURLToPath(import.meta.resolve(name)));
  while (dir !== path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    if (existsSync(file)) {
      const json = JSON.parse(readFileSync(file, 'utf8')) as { name?: string; version?: string };
      if (json.name === name && json.version !== undefined) return json.version;
    }
    dir = path.dirname(dir);
  }
  throw new Error(`Cannot find the installed version of ${name}`);
}
