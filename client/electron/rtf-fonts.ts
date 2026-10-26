import type { JSONContent } from '@tiptap/core';

interface RTFState { size: number; unicodeSkip: number; ignored: boolean }
interface FontText { text: string; sizes: number[] }
const destinations = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'objdata',
  'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'annotation',
  'fldinst', 'filetbl', 'listtable', 'listoverridetable', 'generator',
  'xmlnstbl', 'datastore', 'themedata', 'colorschememapping',
]);
const characters: Record<string, string> = {
  par: '\n', line: '\n', tab: '\t', emdash: '—', endash: '–',
  emspace: '\u2003', enspace: '\u2002', qmspace: '\u2005',
  bullet: '•', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
};

/**
 * Read only character/font controls. HTML conversion preserves other supported
 * styling; this pass retains Cocoa's exact \fsmilli sizes, which textutil rounds.
 * Any unexpected text mapping aborts migration instead of guessing.
 */
export function readRTFFonts(buffer: Buffer, defaultSize: number): FontText {
  const input = buffer.toString('latin1');
  const stack: RTFState[] = [];
  let state: RTFState = { size: defaultSize, unicodeSkip: 1, ignored: false };
  let fallback = 0;
  let text = '';
  const sizes: number[] = [];
  let codepage = 'windows-1252';
  function append(value: string, isUnicode = false): void {
    if (state.ignored) return;
    if (!isUnicode && fallback > 0) { fallback--; return; }
    text += value;
    for (let i = 0; i < value.length; i++) sizes.push(state.size);
  }
  for (let i = 0; i < input.length;) {
    const ch = input[i++];
    if (ch === '{') { stack.push({ ...state }); continue; }
    if (ch === '}') { state = stack.pop() ?? state; continue; }
    if (ch === '\r' || ch === '\n') continue;
    if (ch !== '\\') { append(ch); continue; }
    const next = input[i++];
    if (next === '\n' || next === '\r') {
      if (next === '\r' && input[i] === '\n') i++;
      append('\n');
      continue;
    }
    if (next === '\\' || next === '{' || next === '}') { append(next); continue; }
    if (next === '*') { state.ignored = true; continue; }
    if (next === '~') { append('\u00a0'); continue; }
    if (next === '_') { append('\u2011'); continue; }
    if (next === '-') { append('\u00ad'); continue; }
    if (next === "'") {
      const bytes: number[] = [];
      do {
        const value = Number.parseInt(input.slice(i, i + 2), 16);
        i += 2;
        if (Number.isNaN(value)) throw new Error('旧版富文本字符编码无效。');
        bytes.push(value);
        if (input.slice(i, i + 2) !== "\\'") break;
        i += 2;
      } while (i < input.length);
      if (!state.ignored) {
        const skipped = Math.min(fallback, bytes.length);
        fallback -= skipped;
        if (bytes.length > skipped) append(new TextDecoder(codepage, { fatal: true }).decode(Uint8Array.from(bytes.slice(skipped))), true);
      }
      continue;
    }
    if (!/[a-z]/i.test(next ?? '')) continue;
    let word = next;
    while (i < input.length && /[a-z]/i.test(input[i])) word += input[i++];
    let numeric = '';
    if (input[i] === '-') numeric += input[i++];
    while (i < input.length && /\d/.test(input[i])) numeric += input[i++];
    const value = numeric && numeric !== '-' ? Number(numeric) : undefined;
    if (input[i] === ' ') i++;
    if (destinations.has(word)) { state.ignored = true; continue; }
    if (state.ignored) continue;
    if (word === 'bin' && value !== undefined) { i += Math.max(0, value); continue; }
    if (word === 'ansicpg' && value !== undefined) {
      const named: Record<number, string> = { 936: 'gbk', 950: 'big5', 932: 'shift_jis', 949: 'euc-kr', 65001: 'utf-8' };
      codepage = named[value] ?? `windows-${value}`;
      try { new TextDecoder(codepage); }
      catch { throw new Error(`旧版富文本使用暂不支持的字符编码 ${value}，原文件已保留。`); }
    }
    if (word === 'fs' && value !== undefined) state.size = value / 2;
    if (word === 'fsmilli' && value !== undefined) state.size = value / 1000;
    if (word === 'plain') state.size = defaultSize;
    if (word === 'uc' && value !== undefined) state.unicodeSkip = Math.max(0, value);
    if (word === 'u' && value !== undefined) {
      append(String.fromCharCode(value < 0 ? 65536 + value : value), true);
      fallback = state.unicodeSkip;
    }
    if (characters[word]) append(characters[word]);
  }
  return { text, sizes };
}

export function restoreExactRTFFonts(doc: JSONContent, buffer: Buffer, canonicalText: string, defaultSize: number): JSONContent {
  const parsed = readRTFFonts(buffer, defaultSize);
  if (parsed.text !== canonicalText && parsed.text === `${canonicalText}\n`) {
    parsed.text = parsed.text.slice(0, -1);
    parsed.sizes.pop();
  }
  if (parsed.text !== canonicalText) throw new Error('旧版富文本的精确字号映射与正文不一致，已保留原数据并停止迁移。');
  const blocks = new Set(['paragraph', 'heading', 'codeBlock', 'horizontalRule']);
  let position = 0;
  let firstBlock = true;
  function visit(node: JSONContent): JSONContent[] {
    if (blocks.has(node.type ?? '')) {
      if (!firstBlock) position++;
      firstBlock = false;
    }
    if (node.type === 'hardBreak') { position++; return [node]; }
    if (node.type === 'text') {
      const text = node.text ?? '';
      const runs: JSONContent[] = [];
      for (let start = 0; start < text.length;) {
        const size = parsed.sizes[position + start];
        if (size === undefined || !Number.isFinite(size) || size < 1 || size > 200) throw new Error('旧版富文本的字号超出范围，原数据已保留。');
        let end = start + 1;
        while (end < text.length && parsed.sizes[position + end] === size) end++;
        const existing = node.marks?.find((mark) => mark.type === 'textStyle');
        const marks = [
          ...(node.marks ?? []).filter((mark) => mark.type !== 'textStyle'),
          { type: 'textStyle', attrs: { ...existing?.attrs, fontSize: `${size}px` } },
        ];
        runs.push({ ...node, text: text.slice(start, end), marks });
        start = end;
      }
      position += text.length;
      return runs;
    }
    return [{ ...node, ...(node.content ? { content: node.content.flatMap(visit) } : {}) }];
  }
  return visit(doc)[0];
}
