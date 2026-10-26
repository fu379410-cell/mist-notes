import type { JSONContent } from '@tiptap/core';

export function plainTextDoc(text: string): JSONContent {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}

/** Matches Tiptap getText({ blockSeparator: '\n' }) for supported editor nodes. */
export function docToPlainText(doc: JSONContent): string {
  let output = '';
  let firstBlock = true;
  const blocks = new Set(['paragraph', 'heading', 'codeBlock', 'horizontalRule']);
  function visit(node: JSONContent): void {
    if (blocks.has(node.type ?? '')) {
      if (!firstBlock) output += '\n';
      firstBlock = false;
    }
    if (node.type === 'text') output += node.text ?? '';
    if (node.type === 'hardBreak') output += '\n';
    node.content?.forEach(visit);
  }
  visit(doc);
  return output;
}
