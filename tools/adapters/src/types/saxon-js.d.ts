/** The part of Saxon-JS 2.7's API the adapters use; Saxon-JS ships no type declarations. */
declare module 'saxon-js' {
  const SaxonJS: {
    /** Parses a document; with `type: 'xml'` the promise gives a W3C DOM document. */
    getResource(options: { readonly text: string; readonly type: 'xml' }): Promise<unknown>;
  };
  export default SaxonJS;
}
