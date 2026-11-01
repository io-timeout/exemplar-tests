/** The part of sax 1.6's API the adapters use; sax ships no type declarations. */
declare module 'sax' {
  /** An attribute, as sax reports it with namespace processing. */
  export interface Attribute {
    name: string;
    value: string;
    prefix: string;
    local: string;
    uri: string;
  }

  /** A start tag, as sax reports it with namespace processing. */
  export interface Tag {
    name: string;
    prefix: string;
    local: string;
    uri: string;
    /** Attributes are objects with namespace processing, and plain values without it. */
    attributes: Record<string, Attribute | string>;
    isSelfClosing: boolean;
  }

  /** A processing instruction. */
  export interface ProcessingInstruction {
    name: string;
    body: string;
  }

  /** A push parser; handlers are plain properties. */
  export interface SAXParser {
    onerror: (error: Error) => void;
    onopentag: (tag: Tag) => void;
    onclosetag: (name: string) => void;
    ontext: (text: string) => void;
    oncdata: (text: string) => void;
    onprocessinginstruction: (instruction: ProcessingInstruction) => void;
    write(chunk: string): SAXParser;
    close(): SAXParser;
  }

  const sax: {
    parser(strict: boolean, options?: Record<string, unknown>): SAXParser;
  };
  export default sax;
}
