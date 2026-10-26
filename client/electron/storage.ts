import { randomUUID } from 'node:crypto';
import {
  closeSync, chmodSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { JSONContent } from '@tiptap/core';
import type { Note, Notebook, NoteFrame, NotePatch, NotebookSettings, SettingsPatch, ThemeDefinition } from '../src/shared/types';
import { docToPlainText, plainTextDoc } from '../src/shared/document';
import { ensureReadableTheme } from '../src/shared/themes';
import { normalizeTextColor } from './text-color';

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_TEXT = 1_000_000;
const allowedNodes = new Set(['doc', 'paragraph', 'text', 'hardBreak', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'horizontalRule']);
const allowedMarks = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'textStyle', 'link', 'highlight']);

function fail(message: string): never { throw new Error(message); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}格式不正确。`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || value.length > max) fail(`${label}格式不正确或过长。`);
  return value;
}
function nonempty(value: unknown, label: string, max = 128): string {
  const result = string(value, label, max);
  if (!result.trim()) fail(`${label}不能为空。`);
  return result;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label}必须为开关值。`);
  return value;
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label}超出可用范围。`);
  return value;
}
function date(value: unknown, label: string): string {
  const result = string(value, label, 64);
  if (!Number.isFinite(Date.parse(result))) fail(`${label}无效。`);
  return result;
}
function stringArray(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) fail(`${label}格式不正确或数量过多。`);
  return [...new Set(value.map((item) => nonempty(item, label, 256)))];
}
function hex(value: unknown): string {
  if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) fail('配色必须使用六位十六进制颜色。');
  return value.toUpperCase();
}

export function validateTheme(value: unknown): ThemeDefinition {
  const theme = record(value, '配色');
  if (!Array.isArray(theme.stops) || theme.stops.length < 2 || theme.stops.length > 4) fail('配色需要 2–4 个颜色节点。');
  const stops = theme.stops.map((value) => {
    const stop = record(value, '颜色节点');
    return { color: hex(stop.color), position: number(stop.position, '节点位置', 0, 1) };
  });
  if (stops.some((s, i) => i > 0 && s.position < stops[i - 1].position)) fail('颜色节点需要按位置排列。');
  const result: ThemeDefinition = {
    id: nonempty(theme.id, '配色标识'), name: nonempty(theme.name, '配色名称', 80),
    category: nonempty(theme.category, '配色分类', 80), stops,
    angle: number(theme.angle, '渐变方向', 0, 360), ink: hex(theme.ink),
  };
  if (theme.overlay !== undefined) {
    const overlay = record(theme.overlay, '阅读底层');
    result.overlay = { color: hex(overlay.color), opacity: number(overlay.opacity, '阅读底层透明度', 0, 1) };
  }
  return ensureReadableTheme(result);
}

export function validateFrame(value: unknown): NoteFrame | null {
  if (value === null) return null;
  const frame = record(value, '窗口位置');
  return {
    x: number(frame.x, '窗口横向位置', -100_000, 100_000),
    y: number(frame.y, '窗口纵向位置', -100_000, 100_000),
    width: number(frame.width, '窗口宽度', 260, 30_000),
    height: number(frame.height, '窗口高度', 260, 30_000),
  };
}

export function validateDocument(value: unknown): JSONContent {
  let count = 0;
  function validate(value: unknown, depth: number): JSONContent {
    if (++count > 200_000 || depth > 100) fail('便签文档过大或嵌套过深。');
    const node = record(value, '便签文档');
    const type = string(node.type, '文档节点', 40);
    if (!allowedNodes.has(type)) fail(`暂不支持文档节点 ${type}，原数据已保留。`);
    const output: JSONContent = { type };
    if (type === 'text') {
      output.text = string(node.text, '正文');
      if (!output.text) fail('文档包含空文字节点。');
    }
    if (node.attrs !== undefined) {
      const attrs = record(node.attrs, '文档属性');
      const known: Record<string, unknown> = {};
      if (attrs.level !== undefined) known.level = number(attrs.level, '标题层级', 1, 6);
      if (attrs.start !== undefined) known.start = number(attrs.start, '列表序号', 1, 1_000_000);
      if (attrs.language !== undefined) known.language = attrs.language === null ? null : string(attrs.language, '语言', 80);
      if (attrs.textAlign !== undefined) {
        if (!['left', 'right', 'center', 'justify', null].includes(attrs.textAlign as string | null)) fail('段落对齐无效。');
        known.textAlign = attrs.textAlign;
      }
      if (type === 'doc' && attrs.bodyFontSize !== undefined) known.bodyFontSize = number(attrs.bodyFontSize, '正文字号', 1, 200);
      if (type === 'doc' && attrs.titleFontSize !== undefined) known.titleFontSize = number(attrs.titleFontSize, '标题字号', 1, 200);
      if (type === 'doc' && attrs.noteTitle !== undefined) known.noteTitle = attrs.noteTitle === null ? null : string(attrs.noteTitle, '标题', 500);
      output.attrs = known;
    }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks) || node.marks.length > 20) fail('文字样式无效。');
      output.marks = node.marks.map((value) => {
        const mark = record(value, '文字样式');
        const type = string(mark.type, '文字样式', 40);
        if (!allowedMarks.has(type)) fail(`暂不支持文字样式 ${type}，原数据已保留。`);
        const attrs = mark.attrs === undefined ? {} : record(mark.attrs, '文字样式属性');
        const safe: Record<string, unknown> = {};
        if (type === 'textStyle') {
          if (attrs.fontSize != null) {
            const size = string(attrs.fontSize, '字号', 30);
            const match = size.match(/^(\d+(?:\.\d+)?)(?:px|pt)$/);
            if (!match) fail('字号样式无效。');
            number(Number(match[1]), '字号', 1, 200);
            safe.fontSize = `${Number(match[1])}px`;
          }
          if (attrs.color != null) {
            const color = normalizeTextColor(string(attrs.color, '文字颜色', 120));
            if (color !== undefined) safe.color = color;
          }
          if (attrs.fontFamily != null) {
            const font = string(attrs.fontFamily, '字体', 120);
            if (/[;{}<>]/.test(font)) fail('字体名称无效。');
            if (font.trim()) safe.fontFamily = font;
          }
        }
        if (type === 'link') {
          const href = string(attrs.href, '链接', 10_000);
          if (!/^(https?:|mailto:)/i.test(href)) fail('链接只支持网页和电子邮箱地址。');
          safe.href = href;
          safe.target = '_blank';
          safe.rel = 'noopener noreferrer nofollow';
        }
        if (type === 'highlight' && attrs.color != null) safe.color = hex(attrs.color);
        return { type, ...(Object.keys(safe).length ? { attrs: safe } : {}) };
      });
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) fail('文档内容格式不正确。');
      output.content = node.content.map((child) => validate(child, depth + 1));
    }
    if (type === 'text' && output.content) fail('文字节点不能包含子节点。');
    return output;
  }
  const doc = validate(value, 0);
  if (doc.type !== 'doc') fail('便签文档缺少根节点。');
  if (docToPlainText(doc).length > MAX_TEXT) fail('便签正文过长。');
  return doc;
}

export function validateNote(value: unknown): Note {
  const note = record(value, '便签');
  const editorDoc = validateDocument(note.editorDoc);
  const text = string(note.text, '正文');
  if (docToPlainText(editorDoc) !== text) fail('正文与格式文档不一致，已停止写入以保留原数据。');
  return {
    id: nonempty(note.id, '便签标识'), title: string(note.title, '标题', 500), text, editorDoc,
    bodyFontSize: number(note.bodyFontSize, '正文字号', 1, 200),
    titleFontSize: number(note.titleFontSize, '标题字号', 1, 200),
    theme: nonempty(note.theme, '配色标识'), pinned: boolean(note.pinned, '置顶状态'),
    frame: validateFrame(note.frame), visible: boolean(note.visible, '显示状态'),
    archived: boolean(note.archived, '归档状态'), createdAt: date(note.createdAt, '创建时间'),
    updatedAt: date(note.updatedAt, '更新时间'),
  };
}

export function validateSettings(value: unknown): NotebookSettings {
  const settings = record(value, '设置');
  if (!Array.isArray(settings.customThemes) || settings.customThemes.length > 2000) fail('自定义配色数量过多。');
  const customThemes = settings.customThemes.map(validateTheme);
  if (new Set(customThemes.map((theme) => theme.id)).size !== customThemes.length) fail('自定义配色标识重复。');
  return {
    favorites: stringArray(settings.favorites, '收藏配色', 3000),
    recent: stringArray(settings.recent, '最近配色', 50),
    customThemes,
  };
}

export function validateNotebook(value: unknown): Notebook {
  const notebook = record(value, '备份');
  if (notebook.schemaVersion !== 2) fail(`不支持数据版本 ${String(notebook.schemaVersion)}，原文件已保留。`);
  if (!Array.isArray(notebook.notes) || notebook.notes.length > 10_000) fail('便签列表格式不正确或数量过多。');
  const notes = notebook.notes.map(validateNote);
  if (new Set(notes.map((note) => note.id)).size !== notes.length) fail('便签标识重复。');
  return {
    schemaVersion: 2, notes, settings: validateSettings(notebook.settings),
    importedSources: stringArray(notebook.importedSources, '迁移记录', 20_000),
  };
}

export function parseNotebook(data: string): Notebook {
  try { return validateNotebook(JSON.parse(data)); }
  catch (error) {
    if (error instanceof SyntaxError) fail('便签数据不是有效 JSON，原文件已保留。');
    throw error;
  }
}
export function readNotebook(path: string): Notebook {
  if (statSync(path).size > MAX_BACKUP_BYTES) fail('备份超过 50 MB，暂时无法读取。');
  return parseNotebook(readFileSync(path, 'utf8'));
}
export function emptyNotebook(): Notebook {
  return { schemaVersion: 2, notes: [], settings: { favorites: [], recent: [], customThemes: [] }, importedSources: [] };
}
export function createBlankNote(): Note {
  const now = new Date().toISOString();
  const editorDoc = { ...plainTextDoc(''), attrs: { bodyFontSize: 16, titleFontSize: 22 } };
  return {
    id: randomUUID(), title: '', text: '', editorDoc, bodyFontSize: 16,
    titleFontSize: 22, theme: 'lilac', pinned: false, frame: null,
    visible: true, archived: false, createdAt: now, updatedAt: now,
  };
}
export function applyNotePatch(note: Note, value: unknown): Note {
  const patch = record(value, '便签更新');
  const keys = new Set(['title', 'text', 'editorDoc', 'bodyFontSize', 'titleFontSize', 'theme', 'pinned']);
  if (Object.keys(patch).some((key) => !keys.has(key))) fail('便签更新包含不可修改的字段。');
  return validateNote({ ...note, ...patch as NotePatch, updatedAt: new Date().toISOString() });
}
export function applySettingsPatch(settings: NotebookSettings, value: unknown): NotebookSettings {
  const patch = record(value, '设置更新');
  const keys = new Set(['favorites', 'recent', 'customThemes']);
  if (Object.keys(patch).some((key) => !keys.has(key))) fail('设置更新包含未知字段。');
  return validateSettings({ ...settings, ...patch as SettingsPatch });
}

/** File replacement is atomic; the previous valid document stays available. */
export function atomicWrite(path: string, data: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, data, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export class NotebookStore {
  readonly file: string;
  readonly previousFile: string;
  constructor(readonly directory: string) {
    this.file = join(directory, 'notes.json');
    this.previousFile = join(directory, 'notes.previous.json');
  }
  load(): Notebook | null { return existsSync(this.file) ? readNotebook(this.file) : null; }
  save(notebook: Notebook): void {
    const safe = validateNotebook(notebook);
    const data = JSON.stringify(safe, null, 2);
    if (Buffer.byteLength(data, 'utf8') > MAX_BACKUP_BYTES) fail('便签总数据超过 50 MB，原文件已保留。');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    chmodSync(this.directory, 0o700);
    if (existsSync(this.file)) {
      const previous = readFileSync(this.file, 'utf8');
      parseNotebook(previous);
      atomicWrite(this.previousFile, previous);
    }
    atomicWrite(this.file, data);
  }
}
