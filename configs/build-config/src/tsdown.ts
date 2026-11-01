import { type UserConfig, defineConfig } from 'tsdown';

/** Shared tsdown settings for a package the other tools import: ES modules and declarations, one file per source module. */
export function createLibraryConfig(options: UserConfig = {}): UserConfig {
  return defineConfig({
    // Every module is an entry, so that each keeps all its exports.
    entry: ['src/**/*.ts'],
    outDir: 'dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    fixedExtension: false,
    tsconfig: true,
    unbundle: true,
    deps: { neverBundle: true },
    ...options,
  });
}
