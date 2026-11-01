/** The rule every adapter's `read` and `stream` count by, so that each document's count can be checked against exemplar's. */

/** The length of a qualified name's local part. */
export function localLength(name: string): number {
  return name.length - name.indexOf(':') - 1;
}

/** Whether an attribute is a namespace declaration, which the count leaves out. */
function declaresNamespace(name: string): boolean {
  return name === 'xmlns' || name.startsWith('xmlns:');
}

/** What an attribute adds to the count: its local name and value, or nothing for a namespace declaration. */
export function attributeLength(name: string, value: string): number {
  return declaresNamespace(name) ? 0 : localLength(name) + value.length;
}

/** What a processing instruction adds: its target and data, or nothing for an XML declaration reported as one. */
export function instructionLength(target: string, data: string): number {
  return target === 'xml' ? 0 : target.length + data.length;
}
