# exemplar-tests

The W3C conformance suites, the differential and fuzz tests, and the benchmarks for [exemplar](https://github.com/io-timeout/exemplar), with the suites and datasets they read.

## Which exemplar

The tests run on exemplar's build, never its sources:

- **Beside an exemplar checkout.** When `../exemplar` holds a checkout, `.pnpmfile.mjs` links every `@exemplarjs` package to it, so the tests run on its build. Build it first, with `pnpm install` and `pnpm compile` there, and again after each change. The lockfile records these links, so CI checks out both repositories side by side.
- **On its own.** Without `../exemplar`, `pnpm install` installs the latest published release of each package instead. That changes the lockfile, which is not committed that way.

Run `pnpm install` again after adding or removing the checkout.

## The repository

| Package                | What it holds                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `configs/build-config` | The tsconfigs and tsdown settings the tools share                                                                |
| `tools/adapters`       | exemplar and other XML libraries behind one interface, and the Java harnesses for Xerces and `javax.xml.catalog` |
| `tools/conformance`    | The W3C suites' runner, the differential tests against libxml2, Xerces and `javax.xml.catalog`, and the fuzzer   |
| `tools/bench`          | The benchmark harness, its dataset list and reports                                                              |
| `data/conformance`     | The W3C suites, unpacked                                                                                         |
| `data/bench`           | The benchmark datasets                                                                                           |

## Commands

| Command                                      | What it does                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm install`                               | Installs everything, linking exemplar's packages to `../exemplar` when it is there                  |
| `pnpm compile`                               | Type-checks and builds the shared config and the adapters                                           |
| `pnpm typecheck`, `pnpm lint`, `pnpm format` | Type-checks, lints and formats                                                                      |
| `pnpm conformance`                           | Runs the W3C suites, with the consistency checks and a short fuzz run                               |
| `pnpm conformance:browser`                   | Runs the XML suite in Chromium, Firefox and WebKit                                                  |
| `pnpm differential`                          | Compares exemplar with libxml2, Xerces and `javax.xml.catalog`                                      |
| `pnpm fuzz`                                  | Fuzzes mutated suite documents against libxml2                                                      |
| `pnpm bench`                                 | Runs the quick benchmark set                                                                        |
| `pnpm bench:remote`                          | Runs the benchmarks on another machine over SSH, with `../exemplar`, and copies the reports back    |
| `pnpm clean:output`                          | Runs each package's `clean:output`, which removes its build and test output; benchmark reports stay |
| `pnpm reset`                                 | Runs `clean:output`, then pnpm's own `clean` on every package                                       |

The differential tests and preparing a dataset need `xmllint` and a JDK; the browser tests need Playwright's browsers, from `pnpm exec playwright install` in `tools/conformance`; XMark needs a C compiler.

## Data

The suites and datasets are committed byte for byte (`.gitattributes` turns off line-end conversion for `data/`), except the W3C XML suite, whose licence allows redistributing it only as its authors publish it: it is downloaded on first use, one 627 KB archive, and cached by CI. Each is pinned by SHA-256: the suites in `tools/conformance/suites.json`, the datasets in `tools/bench/datasets/`. A folder that is missing is downloaded or rebuilt from its pinned source and checked again. XMark is generated on first use and never committed, because its licence is unclear; the synthetic documents are generated too.

| Data                                   | Source                                                        | Licence                                                          |
| -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| XML suite, downloaded on first use     | The W3C, `https://www.w3.org/XML/Test/`                       | Each collection's own notice                                     |
| XInclude suite                         | The W3C, `https://www.w3.org/XML/Test/`                       | W3C Test Suite Licence                                           |
| `xml:id` suite                         | The W3C, `https://www.w3.org/XML/2005/01/xml-id/`             | W3C Test Suite Licence                                           |
| DOM suite                              | The W3C, `https://www.w3.org/2004/04/ecmascript/`             | W3C Software Licence                                             |
| FreeBSD documentation and DocBook DTDs | FreeBSD's documentation, tag `release/12.2.0`; xmlcharent 0.3 | FreeBSD Documentation License; xmlcharent under its OASIS notice |
| PostgreSQL documentation               | PostgreSQL, tag `REL_18_0`                                    | PostgreSQL Licence                                               |
| OpenStack manuals                      | OpenStack, tag `juno-eol`                                     | Apache-2.0, CC BY 3.0 and CC BY-SA 3.0, by book                  |
| Expat recordsets                       | libexpat, a pinned commit                                     | MIT                                                              |

## Documentation

- [docs/testing.md](docs/testing.md): the suites, consistency checks, fuzzers and differentials.
- [tools/conformance/exceptions.md](tools/conformance/exceptions.md): every test exemplar does not pass, and why.
- [docs/benchmarking.md](docs/benchmarking.md): how exemplar is compared with other libraries.

## License

The code is under the Apache License 2.0; see [LICENSE](LICENSE). The suites and datasets keep their own licences, listed above; [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) gives each one's copyright notice and licence text, and what was changed in the datasets derived from them.
