import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { JSONContent } from '@tiptap/core';
import type { Note, Notebook } from '../src/shared/types';
import { docToPlainText, plainTextDoc } from '../src/shared/document';
import { emptyNotebook, MAX_BACKUP_BYTES, validateNotebook } from './storage';
import { restoreExactRTFFonts } from './rtf-fonts';

interface LegacyNote {
  id: string; title: string; text: string; richText?: string;
  bodyFontSize?: number; titleFontSize?: number; theme: string; pinned: boolean;
  frame?: number[]; visible: boolean; archived: boolean; createdAt: string; updatedAt: string;
}
type Styles = Record<string, string>;
function declarations(css: string): Styles {
  return Object.fromEntries(css.split(';').flatMap((item) => {
    const colon = item.indexOf(':');
    return colon < 0 ? [] : [[item.slice(0, colon).trim().toLowerCase(), item.slice(colon + 1).trim()]];
  }));
}

/** Converts textutil's restricted HTML without executing or rendering the HTML. */
export function legacyHTMLToDoc(html: string, canonicalText: string): JSONContent {
  const $ = load(html);
  const rules: { selector: string; styles: Styles }[] = [];
  $('style').each((_, style) => {
    for (const match of $(style).text().matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const selector of match[1].split(',')) {
        if (/^[a-zA-Z0-9._-]+$/.test(selector.trim())) rules.push({ selector: selector.trim(), styles: declarations(match[2]) });
      }
    }
  });
  function stylesFor(node: Element, inherited: Styles): Styles {
    let styles = { ...inherited };
    for (const rule of rules) if ($(node).is(rule.selector)) styles = { ...styles, ...rule.styles };
    return { ...styles, ...declarations(node.attribs?.style ?? '') };
  }
  function marksFrom(styles: Styles, tags: string[]): NonNullable<JSONContent['marks']> {
    const marks: NonNullable<JSONContent['marks']> = [];
    const font = styles.font ?? '';
    if (tags.includes('b') || tags.includes('strong') || /bold/i.test(font) || /bold|[6-9]00/.test(styles['font-weight'] ?? '')) marks.push({ type: 'bold' });
    if (tags.includes('i') || tags.includes('em') || /italic|oblique/i.test(`${font} ${styles['font-style'] ?? ''}`)) marks.push({ type: 'italic' });
    if (tags.includes('u') || (styles['text-decoration'] ?? '').includes('underline')) marks.push({ type: 'underline' });
    if (tags.includes('s') || tags.includes('strike') || (styles['text-decoration'] ?? '').includes('line-through')) marks.push({ type: 'strike' });
    const attributes: Record<string, unknown> = {};
    const size = (styles['font-size'] ?? font).match(/(\d+(?:\.\d+)?)(?:px|pt)/);
    if (size) attributes.fontSize = `${Math.min(200, Math.max(1, Number(size[1])))}px`;
    const family = styles['font-family'] ?? font.match(/\d+(?:\.\d+)?(?:px|pt)\s+(.+)/)?.[1];
    if (family) attributes.fontFamily = family.replace(/["']/g, '').trim();
    // The old default ink becomes inherited so all new palettes remain readable.
    if (styles.color && !/^#343847$/i.test(styles.color) && !/^rgb\(\s*52,\s*56,\s*71\s*\)$/i.test(styles.color)) attributes.color = styles.color;
    if (Object.keys(attributes).length) marks.push({ type: 'textStyle', attrs: attributes });
    return marks;
  }
  function inline(node: AnyNode, styles: Styles, tags: string[], convertedSpace = false): JSONContent[] {
    if (node.type === 'text') {
      const text = convertedSpace ? node.data.replace(/\u00a0/g, ' ') : node.data;
      return text ? [{ type: 'text', text, ...(marksFrom(styles, tags).length ? { marks: marksFrom(styles, tags) } : {}) }] : [];
    }
    if (node.type !== 'tag') return [];
    if (node.name === 'br') return [{ type: 'hardBreak' }];
    const nextStyles = stylesFor(node, styles);
    return node.children.flatMap((child) => inline(child, nextStyles, [...tags, node.name], convertedSpace || (node.attribs.class ?? '').includes('Apple-converted-space')));
  }
  const paragraphs: JSONContent[] = [];
  const paragraphElements = $('body').find('p, h1, h2, h3, h4, h5, h6, pre, div').filter((_, node) => $(node).find('p, h1, h2, h3, h4, h5, h6, pre, div').length === 0);
  paragraphElements.each((_, node) => {
    const styles = stylesFor(node, {});
    const content = node.children.flatMap((child) => inline(child, styles, [node.name]));
    // textutil represents empty paragraphs with a single <br>.
    paragraphs.push({ type: 'paragraph', ...(content.length === 1 && content[0].type === 'hardBreak' ? {} : content.length ? { content } : {}) });
  });
  if (paragraphs.length === 0 && canonicalText === '') return plainTextDoc('');
  let doc: JSONContent = { type: 'doc', content: paragraphs };
  let actual = docToPlainText(doc);
  if (actual !== canonicalText && actual.endsWith('\n') && actual.slice(0, -1) === canonicalText && !paragraphs.at(-1)?.content?.length) {
    paragraphs.pop();
    doc = { type: 'doc', content: paragraphs };
    actual = docToPlainText(doc);
  }
  if (actual !== canonicalText && `${actual}\n` === canonicalText) {
    paragraphs.push({ type: 'paragraph' });
    actual = docToPlainText(doc);
  }
  if (actual !== canonicalText) throw new Error('旧版富文本转换后与原正文不一致。已保留旧文件和副本，未覆盖或降级为纯文本。');
  return doc;
}

export function convertRTFToHTML(data: Buffer): string {
  const temporary = mkdtempSync(join(tmpdir(), 'mistnotes-migration-'));
  try {
    const rtf = join(temporary, 'note.rtf');
    writeFileSync(rtf, data, { mode: 0o600 });
    return execFileSync('/usr/bin/textutil', ['-convert', 'html', '-stdout', rtf], {
      encoding: 'utf8', maxBuffer: MAX_BACKUP_BYTES, timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('旧版富文本转换未完成。旧文件已保留，请先使用旧版导出并重试。');
  } finally { rmSync(temporary, { recursive: true }); }
}

export function migrateLegacyData(
  raw: unknown,
  primaryDisplayHeight: number,
  convert: (data: Buffer) => string = convertRTFToHTML,
): Notebook {
  if (!raw || typeof raw !== 'object') throw new Error('旧版便签数据格式不正确。');
  const legacy = raw as { schemaVersion?: unknown; notes?: unknown; importedSources?: unknown };
  if (legacy.schemaVersion !== 1 || !Array.isArray(legacy.notes)) throw new Error('旧版便签数据版本不受支持，原文件已保留。');
  const result = emptyNotebook();
  result.importedSources = [
    ...(Array.isArray(legacy.importedSources) ? legacy.importedSources.filter((x): x is string => typeof x === 'string') : []),
    'MistNotes-v1',
  ];
  result.notes = legacy.notes.map((value): Note => {
    const note = value as LegacyNote;
    if (typeof note.text !== 'string') throw new Error('旧版便签正文格式不正确。');
    let editorDoc = plainTextDoc(note.text);
    if (note.richText != null) {
      if (typeof note.richText !== 'string' || !/^[A-Za-z0-9+/\s]*={0,2}$/.test(note.richText)) throw new Error('旧版富文本编码无效，原文件已保留。');
      const rtf = Buffer.from(note.richText, 'base64');
      editorDoc = restoreExactRTFFonts(legacyHTMLToDoc(convert(rtf), note.text), rtf, note.text, note.bodyFontSize ?? 16);
    }
    editorDoc.attrs = { bodyFontSize: note.bodyFontSize ?? 16, titleFontSize: note.titleFontSize ?? 24 };
    let frame: Note['frame'] = null;
    if (Array.isArray(note.frame) && note.frame.length === 4 && note.frame.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      const [x, y, width, height] = note.frame;
      frame = { x, y: primaryDisplayHeight - y - height, width: Math.max(260, width), height: Math.max(260, height) };
    }
    return {
      id: note.id, title: note.title, text: note.text, editorDoc,
      bodyFontSize: note.bodyFontSize ?? 16, titleFontSize: note.titleFontSize ?? 24,
      theme: note.theme ?? 'lilac', pinned: note.pinned ?? false, frame,
      visible: note.visible ?? true, archived: note.archived ?? false,
      createdAt: note.createdAt, updatedAt: note.updatedAt,
    };
  });
  return validateNotebook(result);
}

export function migrateLegacyFile(legacyPath: string, destination: string, primaryHeight: number): { notebook: Notebook; message: string } | null {
  if (!existsSync(legacyPath)) return null;
  if (statSync(legacyPath).size > MAX_BACKUP_BYTES) throw new Error('旧版便签超过 50 MB，原文件已保留。');
  const source = readFileSync(legacyPath, 'utf8');
  const backupDir = join(destination, `legacy-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(backupDir, 'notes.json'), source, { mode: 0o600 });
  const previous = join(dirname(legacyPath), 'notes.previous.json');
  if (existsSync(previous)) copyFileSync(previous, join(backupDir, 'notes.previous.json'));
  let raw: unknown;
  try { raw = JSON.parse(source); }
  catch { throw new Error('旧版便签文件无法解析，原文件及副本已保留。'); }
  const notebook = migrateLegacyData(raw, primaryHeight);
  return { notebook, message: `已复制迁移 ${notebook.notes.length} 张旧便签。原文件及迁移前副本均已保留。` };
}
