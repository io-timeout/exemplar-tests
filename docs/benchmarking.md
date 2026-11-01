# exemplar benchmarking

The benchmarks have two jobs:

- back exemplar's speed claims with honest, repeatable comparisons against the other JavaScript XML libraries;
- show whether a change makes exemplar faster or slower than `main`.

They sit beside the conformance runner, which scores the same libraries, so one report shows how fast each library is and how correct.

## Terms

| Term            | Meaning                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Adapter         | The code that drives one library through a common interface, in `tools/adapters`.                                              |
| Workload        | A task every library performs the same way, such as reading every name, attribute and text.                                    |
| Dataset         | A set of documents a workload runs over.                                                                                       |
| Round           | One timed pass of a workload over a dataset.                                                                                   |
| Interleaving    | Running every library's round 1, then every library's round 2, and so on, so slow drift on the machine affects them all alike. |
| Noise           | The spread between the rounds of one variant: what a real difference must exceed.                                              |
| Retained memory | Memory still in use after a forced garbage collection, with the results held: heap, and native memory where it can be counted. |
| Peak RSS        | The most memory the process used at once.                                                                                      |

## Where things are

The harness, workloads, dataset list and reports are in `tools/bench`, and one adapter per library in `tools/adapters`; the [README](../README.md#the-repository) lists every package. `pnpm bench` runs the benchmarks through Turborepo. The `bench` task is never cached, because its results depend on the machine and the moment.

`pnpm bench:remote` runs them on another machine over SSH, `SSH_BENCH_TARGET` or `bench` by default, which needs Node, pnpm, rsync, and `make` and a C++ compiler to build libxmljs2. It needs the [`exemplar`](https://github.com/io-timeout/exemplar) checkout beside this one, whose build it benchmarks. It syncs both checkouts into `exemplar` and `exemplar-tests` in the remote's home directory, with the datasets but without `node_modules`, builds, history or reports. There it switches to the Node version `.node-version` pins, when the remote has fnm, then builds exemplar, installs and compiles this repository, scores every library on the XML suite with the conformance command line for the commands whose report shows conformance (`quick`, `full` and `run`), which needs `xmllint` and Java there too, and runs `bench` with the same arguments, such as `pnpm bench:remote run --datasets xmark`, then copies the reports back into `tools/bench/reports`. The report names the exemplar commit benchmarked, which `EXEMPLAR_COMMIT` passes on. A dedicated machine keeps backups, indexing and other work from skewing the timings.

## Libraries

| Library                | Styles                          | Runtimes          |
| ---------------------- | ------------------------------- | ----------------- |
| exemplar               | Pull, events, push, DOM, writer | All               |
| sax                    | Push                            | All               |
| saxes                  | Push                            | All               |
| saxen                  | Push                            | All               |
| stax-xml               | Pull, events, writer            | All               |
| txml                   | Tree                            | All               |
| fast-xml-parser        | Object, writer                  | All               |
| htmlparser2 (XML mode) | Push                            | All               |
| @xmldom/xmldom         | DOM, serializer                 | All               |
| libxmljs2              | DOM, push (native libxml2)      | Node only         |
| Saxon-JS               | Tree, through its own parser    | Node and browsers |

Versions are pinned exactly in the catalog in `pnpm-workspace.yaml` and updated deliberately, each update in a change of its own.

**Settings.** Each library runs with its own defaults, except where they would give wrong data, and with namespace processing on wherever it offers it, as exemplar does by default:

- sax, saxes, saxen and stax-xml process namespaces, saxen with the `xml` prefix bound; htmlparser2 has no namespace processing. saxen's namespace mode renames prefixes, so its correctness check alone reads without it. The checked counts cannot tell whether a library processes namespaces: they take local names and leave out `xmlns` attributes by their names;
- txml keeps whitespace and decodes entities, and fast-xml-parser keeps attributes, order and values as written;
- libxml2 replaces entities and applies the attribute defaults the internal subset declares, as the XML specification asks.

libxmljs2 compiles native code, so it needs pnpm's permission to run its build script.

libxml2's `xmllint` and the JDK's Xerces also have adapters. They check correctness and conformance only, because a separate process or a JVM cannot be timed fairly against an in-process library.

## Adapters

Each adapter has three parts:

- the library's name, version, and the configurations it supports;
- `canonical(source, configuration, form)`, which returns a document in the first or second canonical form, the forms the conformance runner compares, or a rejection carrying the error's code, line, column and system id where the library gives them;
- `run(workload, source)`, which performs one workload.

A tree library's adapter also has `build(input)`, which returns the tree for the retained-memory measure.

An adapter uses each library the way that library's documentation recommends for the task, with the settings that make it parse XML correctly. For example: sax in strict mode, stax-xml in document mode, and saxen with its decoder called on every text and attribute value.

## Correct output first

Before a library is timed on a dataset, its canonical output for every document is compared with exemplar's. exemplar's own output is checked against Xerces on the XML suite by the differential tests.

The comparison decides what each library is timed on:

- **Speed counts correct output only.** A library's speed is its time on the documents it reads correctly: its output matches the reference exactly, and it does not throw while timed. Documents it rejects or reads wrongly are left out of its speed. Otherwise a library that gives up early would be credited with the text it never read: on the FreeBSD documentation as published, saxes and stax-xml stop at the first entity they cannot read in 90% of the documents, after about a fifth of the text.
- **Coverage.** The report says how many documents, and what share of their bytes, each library reads correctly. A library that reads only part of a dataset is timed on that part, which is not the set exemplar is timed on, so the report grades it by that share:
  - all of it: shown as measured, in gray;
  - 95% or more: its speed marked ‡, in orange;
  - from 50% up to 95%: its speed marked ‡, in red;
  - under 50%: FAILED, with no speed. The part is chosen by what the library can read, not by chance, and below half it says too little about the dataset.

  exemplar's bars are always blue.

- **Left out for everyone.** Documents the reference rejects count for no library, and a document exemplar throws on while timed counts against exemplar alone. Preparation keeps only documents that Xerces accepts, so such a rejection is a disagreement between exemplar and Xerces, which the report shows.

The report also counts, for every library, the documents it throws on and those it reads wrongly, and shows the first difference.

## Workloads

| Workload | What each library does                                                        | Libraries            |
| -------- | ----------------------------------------------------------------------------- | -------------------- |
| `walk`   | Parse and visit every event, reading nothing                                  | Pull and push        |
| `read`   | Read every element name, attribute name and value, and text, all decoded      | Pull and push        |
| `tree`   | Build the library's own tree or object                                        | Tree, DOM and object |
| `stream` | `read`, from a file in 64 KB chunks, in bounded memory                        | Those that stream    |
| `small`  | `read`, over thousands of documents of 2–20 KB, to show per-document overhead | Pull and push        |
| `write`  | Serialize a prepared document: the library's own events, read before timing   | Those with writers   |
| `dtd`    | `read`, of a one-element document with a large DTD read from files            | Those that read DTDs |

A library with no style for a workload shows "–".

**Checked counts.** The output check runs untimed, so in `read`, `small`, `stream` and `dtd` the timed code is checked too. Each adapter counts the same content in each document: the local names of elements and attributes, attribute values, text and CDATA inside the root element, and processing instructions' targets and data, leaving out namespace declarations and an XML declaration reported as an instruction. A document whose count differs from exemplar's is left out of the library's speed, as if it had read the document wrongly, and the raw measurements say how many there were. `walk` counts events, which libraries report differently, so its counts are not checked.

## Datasets

Every dataset is public and lets its results be published. Each is listed in `tools/bench/datasets.json` with its source, version and licence, and is committed in `data/bench/<name>/`, byte for byte, with its inventory. XMark is the exception: its licence is unclear, so it is generated on first use and never committed. `tools/bench/datasets/<name>.json` pins a SHA-256 for every file a fetched dataset holds; for XMark that covers the generator's source and its output. A derived dataset is rebuilt from its pinned source and checked by Xerces. A dataset whose folder is missing is downloaded or rebuilt from its pinned source and checked. `bench pin <name>` downloads a dataset again and writes its manifest.

**Preparation.** Once a dataset's files are in place, the JDK's Xerces checks every document the dataset selects, read as the benchmarks read it: namespace-aware, without the external DTD or entities, and under JDK 24's limits, which the check sets itself so that any JDK applies the same ones. The documents Xerces accepts form the dataset's inventory, `.inventory.json` in its folder, which also lists those left out and why. Only the inventory is benchmarked. Preparing a dataset therefore needs a JDK: `$JAVA_HOME/bin/java`, or `/usr/bin/java`.

**Synthetic.** A generator with a fixed seed builds documents shaped like technical documentation: 1.2 attributes per element on average, text in 60% of elements, an entity reference in 5% of text runs, and 1% non-ASCII words.

A scaling series runs at 100 K and 1 M elements. Time per element must stay flat as size grows, which catches O(N²) behaviour that a fixed corpus hides.

**Real documents and standard benchmarks:**

| Dataset                      | Version                                                                  | Size                                                    | Licence                                                          | What it exercises                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FreeBSD documentation        | Tag `release/12.2.0`, with the DocBook ISO entity sets of xmlcharent 0.3 | 2,564 files, 86 MB                                      | FreeBSD Documentation License; xmlcharent under its OASIS notice | Technical documentation in DocBook 5: internal subsets, eight encodings, namespaces, and documents of every size. Read without their DTDs, as every dataset is, so references to the entities the DTDs declare are not expanded |
| PostgreSQL documentation     | Tag `REL_18_0`                                                           | One file, 12 MB                                         | PostgreSQL Licence                                               | One large book in DocBook 4.5, without namespaces                                                                                                                                                                               |
| OpenStack manuals            | Tag `juno-eol`                                                           | 1,016 files, 7.7 MB                                     | Apache-2.0, CC BY 3.0 and CC BY-SA 3.0, by book                  | Small DocBook 5 documents, half of them with XInclude elements, which are read as elements                                                                                                                                      |
| XMark                        | `xmlgen` source pinned by hash, factor 1                                 | 116 MB                                                  | Unclear, so generated locally and never redistributed            | The standard academic benchmark: long text and mixed content                                                                                                                                                                    |
| Expat recordsets             | A pinned commit: `ns_att_test.xml` and `recset.xml`                      | 66 MB                                                   | MIT                                                              | Rows of 28 attributes with prefixed names                                                                                                                                                                                       |
| DocBook DTD with entity sets | From the FreeBSD documentation's sources                                 | 20 copies of a one-element document, with 2.3 MB of DTD | FreeBSD Documentation License; xmlcharent under its OASIS notice | DTD parsing: DocBook 5.0's content models, attribute lists and defaults and parameter entities, and 14,208 entity declarations in FreeBSD's author and manual-page sets and the ISO character sets                              |

- The FreeBSD documentation runs as two copies of its sources, `freebsd-doc-source`, which supplies files and runs nothing: `freebsd-doc`, as published but with its LF line endings turned into CRLF, and `freebsd-doc-simplified`, made from `freebsd-doc`.
- **Simplified** means plain XML: every entity resolved and the DOCTYPE removed. As published, the documents declare entities in internal subsets and in DTDs the benchmarks do not read, and many libraries cannot read an internal subset at all, so most libraries fail on most documents and their speeds cover only small parts of the dataset. Simplified, every library is compared on the same content, while `freebsd-doc` keeps measuring the documents as published.
- xmllint builds the simplified copy from each `freebsd-doc` document that has a DOCTYPE. It reads the document with its DTDs through FreeBSD's catalogs, each translation's own first, which checks it, replaces every entity, removes the DOCTYPE, and writes UTF-8 with each namespace declared once. A document xmllint fails on, being malformed, using an entity no DTD declares, or needing a DTD the archive does not hold, is left out with xmllint's error, and Xerces then checks the rest as for every dataset. Documents without a DOCTYPE are not rewritten: most are parts of books, which hold them.
- The DocBook DTD dataset, `dtd`, copies `docbook50.dtd`, FreeBSD's `authors.ent` and `man-refs.ent` and the 19 ISO character entity sets from `freebsd-doc-source`, and generates `all.dtd`, which reads them all, and 20 copies of a document that refers to it. The element takes its namespace from DocBook's attribute defaults and holds an author's name and three characters, so a library that skips the DTD counts differently. It runs only `dtd`, and its speeds count the DTD files with each copy, as the bytes each parse reads; the copies give V8 the parses it needs to optimize.
- The PostgreSQL book is assembled with xmllint in the same way, as PostgreSQL's own build does, but keeps its DOCTYPE. It is built from the about 400 files that its internal subset includes as external entities. The sources and the DocBook 4.5 DTD are a dataset of their own, `postgresql-doc-source`, which supplies files and runs nothing.

## Method

- **No DTDs, but in `dtd`.** Every library, exemplar included, reads each document standalone: without its external DTD or external entities, which most of the libraries cannot read. Entities an internal subset declares are expanded. The `dtd` workload alone reads the DTD and entities a document refers to, as files below its dataset's folder: exemplar through its cursor and file resolver, under its default limits, and libxml2 through libxmljs2's `parseXml` with `dtdload`, which builds a tree, as its SAX parser reads no DTD; the tree of one element costs next to nothing beside the DTD. Its output check reads the same way.
- **Isolation.** Each round of each combination of library, workload and dataset runs in a fresh child process, which makes a full warm-up pass before it times one, so one library's compiled code and heap cannot affect another's. Between the passes it collects garbage twice, with a turn of the event loop between, so that native trees, which finalizers free, are gone before timing starts.
- **Rounds.** Three rounds run interleaved across libraries. The best and the median are reported.
- **Input.** Documents are loaded into memory before timing, so disk speed is not measured. `stream` is the exception: reading the file is the point.
- **Heap.** `pnpm bench` runs the harness and its workers with a 16 GB heap limit, so that XMark's trees fit.
- **Measures:**
  - throughput, as input MB/s over the documents a library reads correctly;
  - ns per event, with events counted once per dataset, as each markup start and each non-blank text run;
  - retained memory, for `tree`: what every document's tree holds with all of them kept at once, as heap, native memory V8 is told of, and native memory a library reports itself, as libxmljs2 does;
  - peak RSS, from `process.resourceUsage().maxRSS`.
- **Records.** Every report carries the machine, the Node and V8 versions, the library versions, each dataset's version and the commit.

## Comparing a change with `main`

`EXEMPLAR_BASELINE` names another built checkout of exemplar, usually of `main`, which the bench then times as the library `exemplar@main`, in the same interleaved rounds as the sibling checkout's `exemplar`. `run` takes the datasets, workloads, libraries and number of rounds:

```bash
EXEMPLAR_BASELINE=$HOME/exemplar-main pnpm --filter @exemplarjs/bench bench run --datasets xmark,freebsd-doc --workloads walk,read,tree --libraries exemplar,exemplar@main --rounds 10
```

The baseline needs only its packages' `dist`: `pnpm install` and `pnpm compile` in that checkout. `bench:remote` does not pass `EXEMPLAR_BASELINE` on, so to compare on the bench machine, build the baseline there and run the bench in a shell on it.

The baseline's output is not checked, only its counts. It reads with exemplar's built-in decoders alone, so in `stream`, the one workload that hands it bytes, it throws on `freebsd-doc`'s EUC-JP documents and is timed on the rest; compare that cell on the same documents.

## Published numbers

Shared CI runners vary from run to run, so the numbers exemplar publishes come from one fixed machine. That machine runs the full matrix nightly, on Node: every library, every workload and every dataset.

Each run writes `reports/bench.md` and `reports/bench.json`. The report has:

- **At a glance:** a table each for `read`, `stream`, `tree` and `dtd` across every dataset, and one for the memory the trees hold, each under a bar chart of the same numbers. The charts are drawn with Vega-Lite and written as SVG to `reports/charts`: a panel per dataset with its own scale, on a light gray background, with exemplar's bars in blue and the others' colored by [coverage](#correct-output-first). Each cell gives a library's speed in MB/s over the documents it reads correctly, marked ‡ or shown as FAILED by coverage.
- **How much each library checks:** its conformance scores, as a chart and a table, since a library that checks less can be faster. "Rejects malformed" is the share of `not-wf` tests it rejects under `standalone`, and "Correct data" the share of `OUTPUT` comparisons it passes, both from the [conformance reports](testing.md#reports). Run the conformance command line with no names first, so that every library has its scores.
- **Datasets:** what each holds, and how many files preparation left out.
- **A section per dataset:** what the dataset is, then a row per library and a column per workload, with the share of the dataset each library reads correctly and the memory its trees hold. The raw measurements are folded away below.
- **How this was measured**, briefly.

**Over time.** No results are stored in the repository. Nightly results are kept as CI artifacts.
