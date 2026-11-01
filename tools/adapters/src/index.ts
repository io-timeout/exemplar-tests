/** Adapters that put exemplar and other XML libraries behind one interface. */
export type {
  Acceptance,
  Adapter,
  CanonicalForm,
  Configuration,
  ExemplarApi,
  Input,
  Outcome,
  ParseOptions,
  Rejection,
  Source,
  Workload,
} from './adapter.ts';
export { rejection, unsupported } from './adapter.ts';
export { CanonicalWriter, escape } from './canonical.ts';
export { decode, declaredVersion, detectedEncoding } from './decode.ts';
export { type DomNode, writeDomTree } from './dom-tree.ts';
export { exemplarAdapter } from './exemplar.ts';
export { exemplarBuildAdapter } from './exemplar-build.ts';
export { fastXmlParserAdapter } from './fast-xml-parser.ts';
export { htmlparser2Adapter } from './htmlparser2.ts';
export { type CatalogQuery, type JdkCatalog, jdkCatalog } from './jdk-catalog.ts';
export { libxmljs2Adapter } from './libxmljs2.ts';
export { saxAdapter } from './sax.ts';
export { saxonJsAdapter } from './saxon-js.ts';
export { saxenAdapter } from './saxen.ts';
export { saxesAdapter } from './saxes.ts';
export { staxXmlAdapter } from './stax-xml.ts';
export { txmlAdapter } from './txml.ts';
export { javaExecutable, xercesAdapter } from './xerces.ts';
export { xmldomAdapter } from './xmldom.ts';
export { xmllintAdapter, xmllintCanonical } from './xmllint.ts';
