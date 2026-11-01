import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // The browser tests have a configuration of their own.
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/browser/**'],
    // Suites missing from data/conformance, such as the XML suite, are fetched once, before the test files start.
    globalSetup: ['test/global-setup.ts'],
  },
});
