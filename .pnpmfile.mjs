/** Links exemplar's packages to a sibling `../exemplar` checkout when there is one, in place of the published release. */
import { existsSync } from 'node:fs';
import path from 'node:path';

const SCOPE = '@exemplarjs/';

/** The sibling checkout's packages, relative to this workspace's root. */
const SIBLING = '../exemplar/packages';

export const hooks = {
  /** Points each catalog entry for an exemplar package at the sibling's copy, if the sibling has it. */
  updateConfig(config) {
    const catalog = { ...config.catalogs?.default };
    for (const name of Object.keys(catalog).filter((entry) => entry.startsWith(SCOPE))) {
      const local = `${SIBLING}/${name.slice(SCOPE.length)}`;
      if (existsSync(path.join(import.meta.dirname, local, 'package.json'))) catalog[name] = `link:${local}`;
    }
    return { ...config, catalogs: { ...config.catalogs, default: catalog } };
  },
};
