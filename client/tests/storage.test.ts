import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyNotePatch, createBlankNote, emptyNotebook, NotebookStore, validateNotebook, validateTheme } from '../electron/storage';
import { plainTextDoc } from '../src/shared/document';
import { minContrast } from '../src/shared/themes';

test('saves Unicode, exact blank lines and font metadata, with previous valid revision', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-storage-test-'));
  try {
    const store = new NotebookStore(directory);
    const notebook = emptyNotebook();
    const note = createBlankNote();
    note.text = '中文 😀\n\n末行\n';
    note.editorDoc = { ...plainTextDoc(note.text), attrs: { bodyFontSize: 20.25, titleFontSize: 32 } };
    note.bodyFontSize = 20.25;
    note.titleFontSize = 32;
    note.frame = { x: -500, y: 30, width: 260, height: 480 };
    notebook.notes.push(note);
    store.save(notebook);
    const first = readFileSync(store.file, 'utf8');
    notebook.notes[0] = applyNotePatch(note, { title: '测试标题', pinned: true });
    store.save(notebook);
    assert.deepEqual(store.load(), notebook);
    assert.equal(readFileSync(store.previousFile, 'utf8'), first);
    if (process.platform !== 'win32') assert.equal(statSync(store.file).mode & 0o777, 0o600);
  } finally { rmSync(directory, { recursive: true }); }
});

test('corrupt or newer files are preserved when an update is attempted', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-corrupt-test-'));
  try {
    const store = new NotebookStore(directory);
    for (const broken of ['{broken', '{"schemaVersion":3,"notes":[]}']) {
      writeFileSync(store.file, broken);
      assert.throws(() => store.load());
      assert.throws(() => store.save(emptyNotebook()));
      assert.equal(readFileSync(store.file, 'utf8'), broken);
    }
  } finally { rmSync(directory, { recursive: true }); }
});

test('rejects text-document drift, invalid font sizes, unauthorized patch fields and duplicate IDs', () => {
  const note = createBlankNote();
  assert.throws(() => applyNotePatch(note, { text: 'unsynchronized' }), /不一致/);
  assert.throws(() => applyNotePatch(note, { bodyFontSize: 201 }), /范围/);
  assert.throws(() => applyNotePatch(note, { bodyFontSize: NaN }), /范围/);
  assert.throws(() => applyNotePatch(note, { id: 'other' }), /不可修改/);
  const notebook = emptyNotebook();
  notebook.notes = [note, note];
  assert.throws(() => validateNotebook(notebook), /重复/);
});

test('rejects malformed custom color stops and malicious document content', () => {
  const theme = {
    id: 'custom-test', name: '测试', category: '自定义',
    stops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }],
    angle: 120, ink: '#ffffff',
  };
  assert.ok(minContrast(validateTheme(theme)) >= 4.5);
  assert.throws(() => validateTheme({ ...theme, stops: theme.stops.slice().reverse() }), /位置/);
  assert.throws(() => validateTheme({ ...theme, angle: Infinity }), /范围/);
  const note = createBlankNote();
  assert.throws(() => applyNotePatch(note, { editorDoc: { type: 'doc', content: [{ type: 'iframe' }] } }), /不支持/);
  assert.throws(() => applyNotePatch(note, {
    text: 'link',
    editorDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{
      type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
    }] }] },
  }), /链接/);
});
