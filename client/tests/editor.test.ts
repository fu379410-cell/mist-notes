import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { history, undo, redo, closeHistory } from '@tiptap/pm/history';
import { editorExtensions, fontTransaction, sliderToSize, sizeToSlider } from '../src/editor';

const schema = getSchema(editorExtensions);
function createState() {
  const doc = schema.nodeFromJSON({
    type:'doc', attrs:{bodyFontSize:16,titleFontSize:24},
    content:[{type:'paragraph',content:[
      {type:'text',text:'中文📝',marks:[{type:'bold'},{type:'textStyle',attrs:{fontFamily:'serif',fontSize:'16px'}}]},
      {type:'text',text:'保留局部'},
    ]},{type:'paragraph'},{type:'paragraph',content:[{type:'text',text:'下一段'}]}],
  });
  return EditorState.create({ schema, doc, plugins:[history()] });
}
test('selection font preserves Unicode, blank lines, other marks and unselected runs', () => {
  let state=createState(); const before=state.doc.textContent;
  state=state.apply(fontTransaction(state,'selection',20.25,{from:1,to:5}));
  assert.equal(state.doc.textContent,before);
  const text=state.doc.firstChild!.firstChild!;
  assert.equal(text.text,'中文📝');
  assert.equal(text.marks.find(m=>m.type.name==='textStyle')!.attrs.fontSize,'20.25px');
  assert.equal(text.marks.find(m=>m.type.name==='textStyle')!.attrs.fontFamily,'serif');
  assert.ok(text.marks.some(m=>m.type.name==='bold'));
  assert.equal(state.doc.firstChild!.lastChild!.marks.length,0);
  assert.equal(state.doc.child(1).content.size,0);
});
test('one font gesture undoes/redoes once; subsequent typing stays separate', () => {
  let state=createState(); const original=state.doc;
  state=state.apply(fontTransaction(state,'body',28.8,{from:1,to:1}));
  state=state.apply(closeHistory(state.tr));
  const changed=state.doc;
  assert.ok(undo(state,tr=>{state=state.apply(tr);}));
  assert.ok(state.doc.eq(original));
  assert.ok(redo(state,tr=>{state=state.apply(tr);}));
  assert.ok(state.doc.eq(changed));
  state=state.apply(closeHistory(state.tr).setSelection(TextSelection.atEnd(state.doc)).insertText('继续输入'));
  assert.ok(undo(state,tr=>{state=state.apply(tr);}));
  assert.ok(state.doc.eq(changed));
  assert.ok(undo(state,tr=>{state=state.apply(tr);}));
  assert.ok(state.doc.eq(original));
});
test('title sizes share document history and do not alter body', () => {
  let state=createState(); const body=state.doc.content;
  state=state.apply(fontTransaction(state,'title',35.75,{from:0,to:0}));
  assert.equal(state.doc.attrs.titleFontSize,35.75);
  assert.ok(state.doc.content.eq(body));
  undo(state,tr=>{state=state.apply(tr);}); assert.equal(state.doc.attrs.titleFontSize,24);
  redo(state,tr=>{state=state.apply(tr);}); assert.equal(state.doc.attrs.titleFontSize,35.75);
});
test('logarithmic slider covers full range and preserves fractional precision', () => {
  assert.equal(sliderToSize(0),1); assert.equal(sliderToSize(1000),200);
  for(const size of [1,5,9.78,16,20.25,75.5,200]) assert.equal(sliderToSize(sizeToSlider(size)),size);
});
test('an obsolete selection after deletion cannot crash font application', () => {
  let state=createState();
  state=state.apply(state.tr.delete(1, state.doc.content.size - 1));
  assert.doesNotThrow(()=>fontTransaction(state,'selection',24,{from:1,to:99}));
});
test('returning to the original effective size leaves no empty undo step', () => {
  const state=createState();
  assert.ok(fontTransaction(state,'body',16,{from:1,to:1}).doc.eq(state.doc));
});
