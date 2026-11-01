/** The part of saxen 11's API the adapters use; saxen ships no type declarations. */
declare module 'saxen' {
  /** Decodes the references in raw text or an attribute value. */
  export type Decode = (text: string) => string;

  /** A push parser with one handler per event name. */
  export class Parser {
    constructor(options?: { proxy?: boolean });
    on(
      event: 'openTag',
      handler: (name: string, attributes: () => Record<string, string>, decode: Decode, selfClosing: boolean) => void
    ): this;
    on(event: 'closeTag', handler: (name: string, decode: Decode, selfClosing: boolean) => void): this;
    on(event: 'text', handler: (text: string, decode: Decode) => void): this;
    on(event: 'cdata' | 'comment' | 'question' | 'attention', handler: (text: string) => void): this;
    on(event: 'error' | 'warn', handler: (error: Error) => void): this;
    ns(uriToPrefix?: Readonly<Record<string, string>>): this;
    parse(xml: string): this;
    write(chunk: string): this;
    end(): this;
  }
}
