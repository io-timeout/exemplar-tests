import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The conformance package's directory. */
export const PACKAGE = fileURLToPath(new URL('../', import.meta.url));

/** Where the suites are kept, unpacked, in version control. */
export const DATA = path.join(ROOT, 'data', 'conformance');
