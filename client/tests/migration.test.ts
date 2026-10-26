import assert from 'node:assert/strict';
import test from 'node:test';
import { convertRTFToHTML, legacyHTMLToDoc, migrateLegacyData } from '../electron/migration';
import { docToPlainText } from '../src/shared/document';
import { readRTFFonts, restoreExactRTFFonts } from '../electron/rtf-fonts';

function legacy(text = '中文 😀\n\n末行') {
  return {
    schemaVersion: 1,
    notes: [{
      id: 'unchanged-uuid', title: '本地标题', text, theme: 'sage', pinned: true,
      visible: true, archived: false, frame: [100, 200, 410, 470],
      bodyFontSize: 16, titleFontSize: 32,
      createdAt: '2026-10-18T10:00:00Z', updatedAt: '2026-10-19T10:00:00Z',
    }],
    importedSources: ['native-source-uuid'],
  };
}

test('migrates legacy identities and metadata, converts Cocoa frame, preserves blank lines', () => {
  const source = legacy();
  const old = JSON.stringify(source);
  const notebook = migrateLegacyData(source, 900);
  assert.equal(JSON.stringify(source), old);
  const note = notebook.notes[0];
  assert.equal(note.id, source.notes[0].id);
  assert.equal(note.text, source.notes[0].text);
  assert.equal(docToPlainText(note.editorDoc), source.notes[0].text);
  assert.deepEqual(note.frame, { x: 100, y: 230, width: 410, height: 470 });
  assert.equal(note.theme, 'sage');
  assert.equal(note.pinned, true);
  assert.deepEqual(note.editorDoc.attrs, { bodyFontSize: 16, titleFontSize: 32 });
  assert.deepEqual(notebook.importedSources, ['native-source-uuid', 'MistNotes-v1']);
});

test('parses textutil styles, fractional font spans, Unicode and empty paragraphs', () => {
  const html = `<!doctype html><html><head><style>
    p.p1 { font: 16.0px '.AppleSystemUIFont'; color: #343847; }
    span.s1 { font: 20.25px 'Helvetica'; font-weight: bold; }
  </style></head><body><p class="p1">中文 <span class="s1">😀</span></p><p class="p1"><br></p><p class="p1">末行</p></body></html>`;
  const doc = legacyHTMLToDoc(html, '中文 😀\n\n末行');
  assert.equal(docToPlainText(doc), '中文 😀\n\n末行');
  const emoji = doc.content?.[0].content?.[1];
  assert.equal(emoji?.text, '😀');
  assert.equal(emoji?.marks?.find((m) => m.type === 'textStyle')?.attrs?.fontSize, '20.25px');
  assert.ok(emoji?.marks?.some((m) => m.type === 'bold'));
  assert.equal(doc.content?.[0].content?.[0].marks?.find((m) => m.type === 'textStyle')?.attrs?.color, undefined);
});

test('refuses rich text conversion loss rather than replacing with plain text', () => {
  const source = legacy('must preserve 😀');
  Object.assign(source.notes[0], { richText: Buffer.from('{\\rtf1 example}').toString('base64') });
  assert.throws(() => migrateLegacyData(source, 900, () => '<html><body><p>truncated</p></body></html>'), /不一致/);
});

test('reads Chinese codepage hex runs and Cocoa escaped-newline paragraph controls', () => {
  const rtf = "{\\rtf1\\ansi\\ansicpg936\\fs32 \\'d6\\'d0\\'ce\\'c4\\\n\\\n{\\fsmilli20250 X}}";
  const parsed = readRTFFonts(Buffer.from(rtf), 16);
  assert.equal(parsed.text, '中文\n\nX');
  assert.deepEqual(parsed.sizes, [16, 16, 16, 16, 20.25]);
});

test('macOS textutil real conversion retains selected fractional font and Unicode', { skip: process.platform !== 'darwin' }, () => {
  const rtf = String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2822
{\fonttbl\f0\fnil\fcharset0 Helvetica;}
\pard\f0\fs32 \u20013?\u25991? {\fs40\fsmilli20250 \u-10179?\u-8704?}\par
\par
\u26411?\u34892?}`;
  const html = convertRTFToHTML(Buffer.from(rtf));
  const doc = restoreExactRTFFonts(legacyHTMLToDoc(html, '中文 😀\n\n末行'), Buffer.from(rtf), '中文 😀\n\n末行', 16);
  assert.equal(docToPlainText(doc), '中文 😀\n\n末行');
  const runs = doc.content?.[0].content ?? [];
  const emoji = runs.find((run) => run.text?.includes('😀'));
  assert.equal(emoji?.marks?.find((m) => m.type === 'textStyle')?.attrs?.fontSize, '20.25px');
});
