import type { JSONContent } from '@tiptap/core';
import type { AICredentialStatus, AIConnectionResult, AIErrorInfo, AIMode, AIResult } from './ai';

export type AICall<T> = { ok: true; value: T } | { ok: false; error: AIErrorInfo };

export interface ThemeDefinition {
  id: string;
  name: string;
  category: string;
  stops: { color: string; position: number }[];
  angle: number;
  ink: string;
  overlay?: { color: string; opacity: number };
}
export interface NoteFrame { x: number; y: number; width: number; height: number }
export interface Note {
  id: string;
  title: string;
  text: string;
  editorDoc: JSONContent;
  bodyFontSize: number;
  titleFontSize: number;
  theme: string;
  pinned: boolean;
  frame: NoteFrame | null;
  visible: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface NotebookSettings {
  favorites: string[];
  recent: string[];
  customThemes: ThemeDefinition[];
}
export interface Notebook {
  schemaVersion: 2;
  notes: Note[];
  settings: NotebookSettings;
  importedSources: string[];
}
export interface AppState {
  notebook: Notebook;
  noteId: string;
  platform: NodeJS.Platform;
  version: string;
  loginEnabled: boolean;
  migrationMessage?: string;
}
export type NotePatch = Partial<Pick<Note, 'title' | 'text' | 'editorDoc' | 'bodyFontSize' | 'titleFontSize' | 'theme' | 'pinned'>>;
export type SettingsPatch = Partial<NotebookSettings>;
export interface PointerPosition { screenX: number; screenY: number }
export interface MistAPI {
  getState(): Promise<AppState>;
  updateNote(id: string, patch: NotePatch): Promise<Note>;
  updateSettings(patch: SettingsPatch): Promise<NotebookSettings>;
  createNote(): Promise<void>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  archiveNote(id: string): Promise<void>;
  restoreNote(id: string): Promise<void>;
  showNote(id: string): Promise<void>;
  resizeStart(position: PointerPosition): Promise<void>;
  resizeMove(position: PointerPosition): Promise<void>;
  resizeEnd(): Promise<void>;
  minimize(): Promise<void>;
  close(): Promise<void>;
  setLogin(enabled: boolean): Promise<boolean>;
  exportBackup(): Promise<boolean>;
  importBackup(): Promise<boolean>;
  exportText(id: string): Promise<boolean>;
  aiStatus(): Promise<AICall<AICredentialStatus>>;
  aiSaveKey(key: string): Promise<AICall<AICredentialStatus>>;
  aiDeleteKey(): Promise<AICall<AICredentialStatus>>;
  aiTest(): Promise<AICall<AIConnectionResult>>;
  aiGenerate(mode: AIMode): Promise<AICall<AIResult>>;
  aiCancel(): Promise<void>;
  onState(callback: (state: AppState) => void): () => void;
  onBeforeClose(callback: () => Promise<void>): () => void;
  flush(): Promise<void>;
}
declare global {
  interface Window { mist: MistAPI }
}
