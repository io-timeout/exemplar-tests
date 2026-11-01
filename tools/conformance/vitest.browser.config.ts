import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { DATA } from './src/paths.ts';

/** Serves the fetched suites' files as they are, at `/__suite/` and their absolute path, which Vite would transform. */
const suiteFiles: Plugin = {
  name: 'suite-files',
  configureServer(server) {
    server.middlewares.use('/__suite', (request, response) => {
      // eslint-disable-next-line no-clear-text-protocols -- a base for parsing a request path, never fetched
      const file = path.resolve(decodeURIComponent(new URL(request.url ?? '', 'http://suite').pathname));
      if (!file.startsWith(DATA + path.sep)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      readFile(file).then(
        (bytes) => {
          response.setHeader('Content-Type', 'application/octet-stream');
          response.end(bytes);
        },
        () => {
          response.statusCode = 404;
          response.end();
        }
      );
    });
  },
};

/** The XML suite in Chromium, Firefox and WebKit. */
export default defineConfig({
  plugins: [suiteFiles],
  test: {
    include: ['test/browser/**/*.test.ts'],
    globalSetup: ['test/browser/setup.ts'],
    // The setup reads the catalogue with the adapters, which Node loads itself, as they use import.meta.resolve.
    server: { deps: { external: [/tools\/adapters/] } },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});
