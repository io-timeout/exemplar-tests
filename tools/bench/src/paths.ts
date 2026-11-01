import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The bench package's directory. */
export const PACKAGE = fileURLToPath(new URL('../', import.meta.url));

/** Where the datasets are kept in version control; XMark and the synthetic documents are generated there, untracked. */
export const DATA = path.join(ROOT, 'data', 'bench');

/** Where the reports are written. */
export const REPORTS = path.join(PACKAGE, 'reports');
