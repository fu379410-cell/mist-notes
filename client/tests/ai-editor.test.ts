import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { closeHistory, history, redo, undo } from '@tiptap/pm/history';
import { applyAITransaction, editorExtensions } from '../src/editor';
import { docToPlainText, plainTextDoc } from '../src/shared/document';
import { createBlankNote, emptyNotebook, NotebookStore, validateDocument } from '../electron/storage';

const schema = getSchema(editorExtensions);
function originalState(): EditorState {
  const doc = schema.nodeFromJSON({
    type:'doc', attrs:{ bodyFontSize:20.25, titleFontSize:32.5, noteTitle:'旧标题 🌿' },
    content:[
      { type:'paragraph', content:[
        { type:'text', text:'中文 📝', marks:[{ type:'bold' },{ type:'textStyle', attrs:{ fontSize:'9.78px', fontFamily:'serif', color:'#C05040' } }] },
        { type:'text', text:' 与未选中文字' },
      ] },
      { type:'paragraph' },
      { type:'paragraph', content:[{ type:'text', text:'末段 👩‍💻', marks:[{ type:'italic' }] }] },
      { type:'paragraph' },
    ],
  });
  return EditorState.create({ schema, doc, selection:TextSelection.create(doc,2), storedMarks:doc.firstChild!.firstChild!.marks, plugins:[history()] });
}
function applyAI(state: EditorState, result: { title:string; text:string }): EditorState {
  state = state.apply(applyAITransaction(state,result));
  return state.apply(closeHistory(state.tr));
}

test('one AI transaction undoes title, prose, blank lines, Unicode and local formatting together', () => {
  let state = originalState();
  const original = state.doc;
  const result = { title:'整理后 📌', text:'优先事项 📝\n\n保留空行与 Emoji 👩‍💻\n' };
  state = applyAI(state,result);
  const rewritten = state.doc;
  assert.equal(state.doc.attrs.noteTitle,result.title);
  assert.equal(docToPlainText(state.doc.toJSON()),result.text);
  assert.equal(state.doc.attrs.bodyFontSize,20.25);
  assert.equal(state.doc.attrs.titleFontSize,32.5);
  state.doc.descendants(node => { if (node.isText) assert.equal(node.marks.length,0); });
  assert.equal(state.storedMarks,null);
  assert.ok(undo(state,tr => { state=state.apply(tr); }));
  assert.ok(state.doc.eq(original),'one undo must restore the exact title, body and marks');
  assert.equal(undo(state),false,'AI application created only one undo event');
  assert.ok(redo(state,tr => { state=state.apply(tr); }));
  assert.ok(state.doc.eq(rewritten));
  assert.equal(redo(state),false);
});

test('AI undo retains typing immediately before the request even in the same history time window', () => {
  let state = originalState();
  state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)).insertText('刚输入').setTime(1000));
  const beforeAI = state.doc;
  state = state.apply(applyAITransaction(state, { title:'新标题', text:'整理后的正文' }).setTime(1100));
  state = state.apply(closeHistory(state.tr));
  assert.ok(undo(state, tr => { state = state.apply(tr); }));
  assert.ok(state.doc.eq(beforeAI), 'AI undo must retain the latest pre-request typing');
});

test('typing after AI uses normal body styling and undoes independently before the AI result', () => {
  let state=originalState();
  const original=state.doc;
  state=applyAI(state,{ title:'优化后的标题', text:'整理后的正文 😀' });
  const rewritten=state.doc;
  state=state.apply(state.tr.insertText('继续输入'));
  assert.equal(state.doc.lastChild!.lastChild!.marks.length,0,'do not inherit the old selected font or bold');
  assert.equal(state.doc.attrs.bodyFontSize,20.25);
  assert.ok(undo(state,tr => { state=state.apply(tr); }));
  assert.ok(state.doc.eq(rewritten),'typing undo should leave the AI result intact');
  assert.ok(undo(state,tr => { state=state.apply(tr); }));
  assert.ok(state.doc.eq(original));
  assert.ok(redo(state,tr => { state=state.apply(tr); }));
  assert.ok(state.doc.eq(rewritten));
});

test('manual title edits share document history without touching the prose', () => {
  let state=originalState();
  const original=state.doc;
  state=state.apply(state.tr.setDocAttribute('noteTitle','手动改标题'));
  assert.ok(state.doc.content.eq(original.content));
  assert.ok(undo(state,tr => { state=state.apply(tr); }));
  assert.ok(state.doc.eq(original));
  assert.ok(redo(state,tr => { state=state.apply(tr); }));
  assert.equal(state.doc.attrs.noteTitle,'手动改标题');
});

test('storage keeps history title metadata, accepts legacy/null titles, and rejects invalid metadata', () => {
  const directory=mkdtempSync(join(tmpdir(),'mist-ai-title-test-'));
  try {
    const state=applyAI(originalState(),{ title:'保存标题 📝', text:'正文\n\n尾行😀' });
    const note=createBlankNote();
    note.title=state.doc.attrs.noteTitle;
    note.text=docToPlainText(state.doc.toJSON());
    note.bodyFontSize=state.doc.attrs.bodyFontSize;
    note.titleFontSize=state.doc.attrs.titleFontSize;
    note.editorDoc=state.doc.toJSON();
    const notebook=emptyNotebook(); notebook.notes.push(note);
    const store=new NotebookStore(directory); store.save(notebook);
    assert.deepEqual(store.load(),JSON.parse(JSON.stringify(notebook)));
    assert.equal(store.load()!.notes[0].editorDoc.attrs!.noteTitle,'保存标题 📝');
    assert.equal(validateDocument({ ...plainTextDoc(''), attrs:{ noteTitle:null } }).attrs!.noteTitle,null);
    assert.equal(validateDocument(plainTextDoc('旧数据')).attrs,undefined);
    assert.equal(validateDocument({ ...plainTextDoc(''), attrs:{ noteTitle:'字'.repeat(500) } }).attrs!.noteTitle,'字'.repeat(500));
    assert.throws(() => validateDocument({ ...plainTextDoc(''), attrs:{ noteTitle:'字'.repeat(501) } }),/过长/);
    assert.throws(() => validateDocument({ ...plainTextDoc(''), attrs:{ noteTitle:123 } }),/格式/);
  } finally { rmSync(directory,{ recursive:true }); }
});
