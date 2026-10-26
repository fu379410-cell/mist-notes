import { Extension, Node, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import { plainTextDoc } from './shared/document';

export type FontTarget = 'body' | 'selection' | 'title';
export type FontPreview = { from: number; to: number; size: number } | null;
export const previewKey = new PluginKey<FontPreview>('mist-font-preview');
export const MistDocument = Node.create({
  name: 'doc', topNode: true, content: 'block+',
  addAttributes() {
    return { bodyFontSize: { default: 16 }, titleFontSize: { default: 24 }, noteTitle: { default: null } };
  },
});
export const FontPreviewExtension = Extension.create({
  name: 'mistFontPreview',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: previewKey,
      state: {
        init: () => null,
        apply: (tr, old) => tr.getMeta(previewKey) !== undefined ? tr.getMeta(previewKey) : old,
      },
      props: {
        decorations(state) {
          const preview = previewKey.getState(state);
          if (!preview || preview.from === preview.to) return DecorationSet.empty;
          const from = Math.max(0, Math.min(preview.from, state.doc.content.size));
          const to = Math.max(from, Math.min(preview.to, state.doc.content.size));
          const decorations: Decoration[] = [];
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.isText) decorations.push(Decoration.inline(
              Math.max(pos, from), Math.min(pos + node.nodeSize, to),
              { style: `font-size:${preview.size}px !important` },
            ));
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })];
  },
});
export const editorExtensions = [
  MistDocument, StarterKit.configure({ document: false, link: false }),
  TextStyleKit, FontPreviewExtension,
  Placeholder.configure({ placeholder: '把此刻的想法，轻轻放在这里…' }),
];
export function previewFont(editor: Editor, preview: FontPreview) {
  editor.view.dispatch(editor.state.tr.setMeta(previewKey, preview).setMeta('addToHistory', false));
}
export const clampFont = (n: number) => Math.round(Math.min(200, Math.max(1, n)) * 100) / 100;
export const sliderToSize = (n: number) => clampFont(200 ** (n / 1000));
export const sizeToSlider = (n: number) => Math.log(clampFont(n)) / Math.log(200) * 1000;

/** Caller closes history before and after dispatch so one AI application undoes once. */
export function applyAITransaction(state: EditorState, result: { title: string; text: string }): Transaction {
  const replacement = state.schema.nodeFromJSON(plainTextDoc(result.text));
  const tr = closeHistory(state.tr).replaceWith(0, state.doc.content.size, replacement.content)
    .setDocAttribute('noteTitle', result.title)
    .setMeta('mist-ai-commit', true)
    .setMeta(previewKey, null);
  // New prose inherits the document's body size, never the previous selection's
  // local font, color or emphasis. Root title/body font attributes stay intact.
  return tr.setSelection(TextSelection.atEnd(tr.doc)).setStoredMarks(null);
}

// One completed gesture creates one history transaction, retaining other marks.
export function fontTransaction(state: EditorState, target: FontTarget, size: number, selection: { from: number; to: number }): Transaction {
  size = clampFont(size);
  const tr = closeHistory(state.tr).setMeta('mist-font-commit', true);
  if (target === 'title') return tr.setDocAttribute('titleFontSize', size);
  const from = target === 'body' ? 0 : Math.max(0, Math.min(selection.from, state.doc.content.size));
  const to = target === 'body' ? state.doc.content.size : Math.max(from, Math.min(selection.to, state.doc.content.size));
  if (target === 'selection' && from === to) return tr;
  if (target === 'body') tr.setDocAttribute('bodyFontSize', size);
  const style = state.schema.marks.textStyle;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const attrs = node.marks.find(mark => mark.type === style)?.attrs ?? {};
    const effectiveSize = parseFloat(attrs.fontSize || String(state.doc.attrs.bodyFontSize ?? 16));
    if (effectiveSize === size) return;
    tr.addMark(Math.max(from, pos), Math.min(to, pos + node.nodeSize), style.create({ ...attrs, fontSize: `${size}px` }));
  });
  if (target === 'body' || from === to) {
    const current = state.storedMarks ?? state.selection.$from.marks();
    tr.setStoredMarks([...current.filter(mark => mark.type !== style),
      style.create({ ...current.find(mark => mark.type === style)?.attrs, fontSize: `${size}px` })]);
  }
  return tr;
}
