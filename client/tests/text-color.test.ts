import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTextColor } from '../electron/text-color';
import { applyNotePatch, createBlankNote, validateNote } from '../electron/storage';

test('normalizes CSS RGB forms produced by paste and browser style serialization', () => {
  const colors: [string, string][] = [
    ['rgb(52, 56, 71)', '#343847'],
    ['rgba(52, 56, 71, 1)', '#343847'],
    ['rgb(52 56 71)', '#343847'],
    ['rgb(52 56 71 / 50%)', '#34384780'],
    ['rgba(52 56 71 / .5)', '#34384780'],
    ['rgb(100% 0% 20%)', '#FF0033'],
    ['rgba(100%, 0%, 20%, 25%)', '#FF003340'],
    [' rgb(1e2 0 0 / 1) ', '#640000'],
    ['rgb(300 -5 0)', '#FF0000'],
    ['#abc', '#AABBCC'],
    ['#abc8', '#AABBCC88'],
    ['#343847ff', '#343847FF'],
    ['transparent', '#00000000'],
  ];
  for (const [source, expected] of colors) assert.equal(normalizeTextColor(source), expected, source);
  for (const source of ['inherit', 'currentColor', 'initial', 'unset', '']) assert.equal(normalizeTextColor(source), undefined);
});

test('pasted Tiptap styles preserve null/default families and canonical color across save round trips', () => {
  const note = createBlankNote();
  const text = '继续输入中文 😀';
  for (const style of [
    { color: null, fontFamily: null, fontSize: null },
    { color: 'inherit', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '20.6px' },
    { color: 'rgba(52, 56, 71, 1)', fontFamily: '"PingFang SC"', fontSize: '20.6px' },
    { color: 'rgb(52 56 71 / 100%)', fontFamily: '', fontSize: null },
  ]) {
    const updated = applyNotePatch(note, {
      text,
      editorDoc: { type: 'doc', attrs: { bodyFontSize: 20.6, titleFontSize: 22 }, content: [{
        type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'textStyle', attrs: style }] }],
      }] },
    });
    assert.equal(updated.text, text);
    assert.deepEqual(validateNote(JSON.parse(JSON.stringify(updated))), updated);
    const attrs = updated.editorDoc.content?.[0].content?.[0].marks?.[0].attrs;
    if (style.color?.startsWith('rgb')) assert.equal(attrs?.color, '#343847');
    else assert.equal(attrs?.color, undefined);
  }
});

test('arbitrary CSS, malformed channels and injected font declarations remain rejected', () => {
  for (const color of [
    'url(https://example.com/x)', 'var(--private-value)', 'red; background: url(x)',
    'rgb(1,2)', 'rgb(1 2 3 /)', 'rgb(1 2 3 / .5 / .5)', 'rgb(NaN 2 3)',
    'rgb(calc(1 + 2) 3 4)', 'rgba(1,2,3,expression(x))', '#12345', '#1234567',
  ]) assert.throws(() => normalizeTextColor(color), /颜色无效/, color);
  assert.throws(() => applyNotePatch(createBlankNote(), {
    text: 'x', editorDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{
      type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { fontFamily: 'serif; color:red' } }],
    }] }] },
  }), /字体名称无效/);
});
