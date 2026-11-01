import type { CanonicalWriter } from './canonical.ts';

/** The parts of a W3C DOM node the canonical form reads, as exemplar, @xmldom/xmldom and Saxon-JS give them. */
export interface DomNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly nodeValue: string | null;
  readonly firstChild: DomNode | null;
  readonly nextSibling: DomNode | null;
  readonly attributes?: { readonly length: number; item(index: number): DomNode | null } | null;
  /** Documents. */
  readonly doctype?: DomNode | null;
  readonly xmlVersion?: string;
  /** Document types. */
  readonly notations?: { readonly length: number; item(index: number): DomNode | null } | null;
  /** Notations. */
  readonly publicId?: string | null;
  readonly systemId?: string | null;
  /** Processing instructions, whose name Saxon-JS gives only here. */
  readonly target?: string;
}

/** Writes a DOM tree's canonical form: its notations, then its elements, text and processing instructions. */
export function writeDomTree(document: DomNode, writer: CanonicalWriter): void {
  writer.version(document.xmlVersion ?? '1.0');
  const notations = document.doctype?.notations;
  for (let i = 0; i < (notations?.length ?? 0); i++) {
    const notation = notations?.item(i) as DomNode;
    writer.notation(notation.nodeName, notation.publicId ?? undefined, notation.systemId ?? undefined);
  }
  writeChildren(document, writer);
}

function writeChildren(node: DomNode, writer: CanonicalWriter): void {
  for (let c = node.firstChild; c !== null; c = c.nextSibling) writeNode(c, writer);
}

/** Writes one node and what lies below it. */
function writeNode(node: DomNode, writer: CanonicalWriter): void {
  switch (node.nodeType) {
    case 1: {
      const map = node.attributes;
      const attributes = Array.from({ length: map?.length ?? 0 }, (_, i) => {
        const attr = map?.item(i) as DomNode;
        return [attr.nodeName, attr.nodeValue ?? ''] as const;
      });
      writer.startElement(node.nodeName, attributes);
      writeChildren(node, writer);
      writer.endElement(node.nodeName);
      break;
    }
    case 3: {
      writer.text(node.nodeValue ?? '');
      break;
    }
    case 4: {
      writer.cdata(node.nodeValue ?? '');
      break;
    }
    case 5: {
      writeChildren(node, writer);
      break;
    }
    case 7: {
      writer.processingInstruction(node.target ?? node.nodeName, node.nodeValue ?? '');
      break;
    }
    default:
  }
}
