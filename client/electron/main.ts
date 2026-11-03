import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, screen, session, shell, Tray } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppState, Note, Notebook, PointerPosition } from '../src/shared/types';
import {
  applyNotePatch, applySettingsPatch, atomicWrite, createBlankNote, emptyNotebook,
  NotebookStore, readNotebook,
} from './storage';
import { migrateLegacyFile } from './migration';
import { resizedFrame, visibleFrame } from './geometry';
import { createAIService, publicAIError } from './ai';
import { AICredentialStore } from './ai-credentials';
import { CapsuleStore } from './capsule-store';
import { capsuleBounds, dockAnchor, findDockEdge, resolveCapsuleBounds, type DockPlacement } from './capsule-geometry';
import type { AICall } from '../src/shared/types';

app.setName('雾笺');
const dataDirectory = process.env.MIST_DATA_DIR
  ? resolve(process.env.MIST_DATA_DIR)
  : join(app.getPath('appData'), 'MistNotesDesktop');
app.setPath('userData', dataDirectory);
const store = new NotebookStore(dataDirectory);
const capsuleStore = new CapsuleStore(dataDirectory);
let capsuleState: { enabled: boolean; placements: Record<string, DockPlacement> } = { enabled: true, placements: {} };
let capsuleLoadError: string | undefined;
const capsules = new Map<string, BrowserWindow>();
const previewing = new Set<string>();
const folding = new Set<string>();
const dragSessions = new Map<number, { start: Electron.Rectangle; initial: PointerPosition; moved: boolean }>();
const aiCredentials = new AICredentialStore(dataDirectory, safeStorage);
const ai = createAIService({ getKey: () => aiCredentials.readKey() });
const aiJobs = new Map<number, AbortController>();

async function safeAI<T>(work: () => T | Promise<T>): Promise<AICall<T>> {
  try { return { ok: true, value: await work() }; }
  catch (error) { return { ok: false, error: publicAIError(error) }; }
}
async function aiJob<T>(window: BrowserWindow, work: (signal: AbortSignal) => Promise<T>): Promise<AICall<T>> {
  aiJobs.get(window.id)?.abort();
  const controller = new AbortController();
  aiJobs.set(window.id, controller);
  try { return await safeAI(() => work(controller.signal)); }
  finally { if (aiJobs.get(window.id) === controller) aiJobs.delete(window.id); }
}
let notebook: Notebook;
let migrationMessage: string | undefined;
let tray: Tray | undefined;
let quitting = false;
let quitPending = false;
let fatalStartup = false;
const windows = new Map<string, BrowserWindow>();
const frameTimers = new Map<string, ReturnType<typeof setTimeout>>();
const resizeSessions = new Map<number, { start: Electron.Rectangle; initial: PointerPosition; area: Electron.Rectangle }>();
const flushRequests = new Map<string, { senderId: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const closingWindows = new Set<number>();
const devURL = process.env.MIST_DEV_URL;
const appRoot = join(__dirname, '..');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。';
}
function requireNote(id: unknown): Note {
  if (typeof id !== 'string') throw new Error('便签标识格式不正确。');
  const note = notebook.notes.find((item) => item.id === id);
  if (!note) throw new Error('找不到这张便签。');
  return note;
}
function noteForWindow(window: BrowserWindow): Note {
  const entry = [...windows, ...capsules].find(([, value]) => value === window);
  if (!entry) throw new Error('窗口已经关闭。');
  return requireNote(entry[0]);
}
function loginPath(): string { return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath; }
function loginEnabled(): boolean {
  if (!app.isPackaged) return false;
  return app.getLoginItemSettings(process.platform === 'win32' ? { path: loginPath() } : undefined).openAtLogin;
}
function stateFor(window: BrowserWindow): AppState {
  const id = noteForWindow(window).id;
  return {
    notebook, noteId: id, platform: process.platform,
    version: app.getVersion(), loginEnabled: loginEnabled(), migrationMessage,
    windowMode: capsules.get(id) === window ? (previewing.has(id) ? 'preview' : 'capsule') : 'note',
    capsuleEdge: capsuleState.placements[id]?.edge,
    capsuleEnabled: capsuleState.enabled,
  };
}
function broadcast(): void {
  for (const window of [...windows.values(), ...capsules.values()]) {
    if (!window.isDestroyed()) window.webContents.send('mist:state', stateFor(window));
  }
}
function persist(next: Notebook): void {
  store.save(next);
  notebook = next;
  broadcast();
  rebuildMenus();
}
function replaceNote(note: Note): void {
  persist({ ...notebook, notes: notebook.notes.map((item) => item.id === note.id ? note : item) });
}
function saveFrame(id: string): void {
  const timer = frameTimers.get(id);
  if (timer) clearTimeout(timer);
  frameTimers.delete(id);
  const window = windows.get(id);
  if (!window || window.isDestroyed() || window.isMinimized()) return;
  const note = requireNote(id);
  const frame = window.getBounds();
  if (JSON.stringify(frame) !== JSON.stringify(note.frame)) replaceNote({ ...note, frame });
}
function flushFrames(): void {
  for (const id of [...frameTimers.keys()]) saveFrame(id);
}
function requestRendererFlush(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const token = randomUUID();
    const timer = setTimeout(() => {
      flushRequests.delete(token);
      reject(new Error('界面保存尚未完成，雾笺已保持打开。请检查便签右下角保存状态后重试退出。'));
    }, 10_000);
    flushRequests.set(token, { senderId: window.webContents.id, resolve, reject, timer });
    window.webContents.send('mist:flush-request', token);
  });
}
function scheduleFrame(id: string): void {
  const previous = frameTimers.get(id);
  if (previous) clearTimeout(previous);
  frameTimers.set(id, setTimeout(() => {
    try { saveFrame(id); }
    catch (error) { dialog.showErrorBox('窗口位置尚未保存', errorMessage(error)); }
  }, 150));
}
function brandPath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, 'branding', name) : join(appRoot, 'resources', name);
}
function showError(error: unknown): void { dialog.showErrorBox('雾笺', errorMessage(error)); }
function action(callback: () => unknown): () => void {
  return () => { Promise.resolve().then(callback).catch(showError); };
}
function showNote(id: string): void {
  const note = requireNote(id);
  if (note.archived) throw new Error('请先从归档中恢复这张便签。');
  if (!note.visible) replaceNote({ ...note, visible: true });
  const existing = windows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (capsuleState.placements[id]) restoreCapsule(id);
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  createWindow(requireNote(id));
}
function createNote(): void {
  const note = createBlankNote();
  persist({ ...notebook, notes: [...notebook.notes, note] });
  showNote(note.id);
}
function setPinned(id: string, pinned: unknown): void {
  if (typeof pinned !== 'boolean') throw new Error('置顶状态格式不正确。');
  replaceNote({ ...requireNote(id), pinned, updatedAt: new Date().toISOString() });
  windows.get(id)?.setAlwaysOnTop(pinned, 'floating');
}
function archiveNote(id: string): void {
  saveFrame(id);
  removePlacement(id);
  destroyCapsule(id);
  replaceNote({ ...requireNote(id), archived: true, visible: false, updatedAt: new Date().toISOString() });
  const window = windows.get(id);
  if (window) {
    windows.delete(id);
    resizeSessions.delete(window.id);
    window.destroy();
  }
}
function restoreNote(id: string): void {
  replaceNote({ ...requireNote(id), archived: false, visible: true, updatedAt: new Date().toISOString() });
  showNote(id);
}
function setLogin(enabled: unknown): boolean {
  if (typeof enabled !== 'boolean') throw new Error('开机启动状态格式不正确。');
  if (!app.isPackaged) throw new Error('开机启动需要在安装后的客户端中设置。');
  app.setLoginItemSettings({
    openAtLogin: enabled,
    ...(process.platform === 'win32' ? { path: loginPath(), args: [] } : {}),
  });
  const current = loginEnabled();
  if (current !== enabled) throw new Error('系统尚未应用开机启动设置，请在系统登录项中检查雾笺。');
  broadcast();
  rebuildMenus();
  return current;
}

function saveCapsules(next: typeof capsuleState): void {
  if (capsuleLoadError) throw new Error(`胶囊布局暂不可用：${capsuleLoadError}`);
  capsuleStore.save(next);
  capsuleState = next;
}
function removePlacement(id: string): void {
  if (!capsuleState.placements[id]) return;
  const placements = { ...capsuleState.placements };
  delete placements[id];
  saveCapsules({ ...capsuleState, placements });
}
function destroyCapsule(id: string): void {
  const capsule = capsules.get(id);
  capsules.delete(id);
  previewing.delete(id);
  if (capsule && !capsule.isDestroyed()) capsule.destroy();
}
function reflowCapsules(): void {
  const displays = screen.getAllDisplays();
  const occupied = new Map<number, Electron.Rectangle[]>();
  const placements = { ...capsuleState.placements };
  let changed = false;
  for (const [id, placement] of Object.entries(placements)) {
    const capsule = capsules.get(id);
    if (!capsule || capsule.isDestroyed()) continue;
    let display = displays.find(item => item.id === placement.displayId);
    if (!display) {
      const frame = requireNote(id).frame;
      display = frame ? screen.getDisplayMatching(frame) : screen.getPrimaryDisplay();
      placements[id] = { ...placement, displayId: display.id };
      changed = true;
    }
    const other = occupied.get(display.id) ?? [];
    const bounds = resolveCapsuleBounds(placement, display.workArea, other);
    other.push(bounds);
    occupied.set(display.id, other);
    const actual = { ...placement, anchor: dockAnchor(bounds, display.workArea, placement.edge) };
    capsule.setBounds(previewing.has(id) ? capsuleBounds(actual, display.workArea, true) : bounds);
  }
  if (changed) saveCapsules({ ...capsuleState, placements });
}
function restoreCapsule(id: string, focus = true): void {
  let layoutError: unknown;
  try { removePlacement(id); }
  catch (error) {
    // Recover access to the editor even when the separate presentation file cannot be written.
    const placements = { ...capsuleState.placements };
    delete placements[id];
    capsuleState = { ...capsuleState, placements };
    layoutError = error;
  }
  destroyCapsule(id);
  const window = windows.get(id);
  if (!window || window.isDestroyed()) return;
  const note = requireNote(id);
  const frame = note.frame ?? window.getBounds();
  const bounds = visibleFrame(frame, screen.getDisplayMatching(frame).workArea);
  window.setBounds(bounds);
  if (window.isMinimized()) window.restore();
  if (focus) { window.show(); window.focus(); }
  else window.showInactive();
  reflowCapsules();
  broadcast();
  if (layoutError) void dialog.showMessageBox(window, {
    type: 'warning', title: '雾笺', message: '便签已展开，胶囊布局暂未保存。',
    detail: errorMessage(layoutError), buttons: ['好'],
  });
}
function createCapsule(note: Note): void {
  if (capsules.has(note.id) || !capsuleState.placements[note.id]) return;
  const placement = capsuleState.placements[note.id];
  const display = screen.getAllDisplays().find(item => item.id === placement.displayId)
    ?? (note.frame ? screen.getDisplayMatching(note.frame) : screen.getPrimaryDisplay());
  const capsule = new BrowserWindow({
    ...capsuleBounds(placement, display.workArea), show: false,
    title: `${note.title || '雾笺'} · 胶囊`, frame: false, transparent: true,
    backgroundColor: '#00000000', resizable: false, hasShadow: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    alwaysOnTop: true, acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, spellcheck: false,
      webSecurity: true, allowRunningInsecureContent: false,
    },
  });
  capsules.set(note.id, capsule);
  capsule.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  capsule.webContents.on('will-navigate', event => event.preventDefault());
  capsule.webContents.on('will-attach-webview', event => event.preventDefault());
  capsule.webContents.on('did-fail-load', () => {
    if (capsules.get(note.id) === capsule) restoreCapsule(note.id);
  });
  capsule.webContents.on('render-process-gone', () => {
    if (!quitting && capsules.get(note.id) === capsule) restoreCapsule(note.id);
  });
  capsule.once('ready-to-show', () => {
    if (!capsuleState.placements[note.id] || capsules.get(note.id) !== capsule) return;
    reflowCapsules();
    capsule.showInactive();
    windows.get(note.id)?.hide();
  });
  capsule.on('closed', () => {
    if (capsules.get(note.id) !== capsule) return;
    capsules.delete(note.id);
    previewing.delete(note.id);
    if (!quitting) { try { restoreCapsule(note.id); } catch (error) { showError(error); } }
  });
  if (devURL) void capsule.loadURL(devURL);
  else void capsule.loadFile(join(appRoot, 'dist', 'index.html'));
}
async function dockNote(window: BrowserWindow): Promise<void> {
  const note = noteForWindow(window);
  if (!capsuleState.enabled || capsuleState.placements[note.id] || folding.has(note.id)
    || !window.isVisible() || window.isMaximized() || window.isFullScreen()) return;
  const frame = window.getBounds();
  const display = screen.getDisplayMatching(frame);
  const edge = findDockEdge(frame, display.workArea);
  if (!edge) return;
  folding.add(note.id);
  try {
    // Keep the editor mounted. A failed or pending save must never disappear into a capsule.
    await requestRendererFlush(window);
    const current = requireNote(note.id);
    if (window.isDestroyed() || !window.isVisible() || !capsuleState.enabled || !current.visible || current.archived || dragSessions.has(window.id)
      || JSON.stringify(window.getBounds()) !== JSON.stringify(frame)) return;
    saveFrame(note.id);
    saveCapsules({ ...capsuleState, placements: {
      ...capsuleState.placements,
      [note.id]: { edge, displayId: display.id, anchor: dockAnchor(frame, display.workArea, edge) },
    } });
    createCapsule(requireNote(note.id));
    broadcast();
  } finally { folding.delete(note.id); }
}
function setCapsuleEnabled(enabled: unknown): void {
  if (typeof enabled !== 'boolean') throw new Error('胶囊设置格式不正确。');
  const ids = Object.keys(capsuleState.placements);
  let layoutError: unknown;
  const next = { enabled, placements: enabled ? capsuleState.placements : {} };
  try { saveCapsules(next); }
  catch (error) {
    if (enabled) throw error;
    capsuleState = next;
    layoutError = error;
  }
  if (!enabled) for (const id of ids) {
    destroyCapsule(id);
    const window = windows.get(id);
    if (window && !window.isDestroyed()) {
      window.setBounds(visibleFrame(window.getBounds(), screen.getDisplayMatching(window.getBounds()).workArea));
      window.showInactive();
    }
  }
  broadcast();
  if (layoutError) void dialog.showMessageBox({
    type: 'warning', title: '雾笺', message: '胶囊已关闭，便签已展开；设置暂未保存。',
    detail: errorMessage(layoutError), buttons: ['好'],
  });
}
function createWindow(note: Note): void {
  const display = note.frame ? screen.getDisplayMatching(note.frame) : screen.getPrimaryDisplay();
  const offset = (windows.size % 8) * 24;
  const requested = note.frame ?? {
    x: display.workArea.x + display.workArea.width - 460 - offset,
    y: display.workArea.y + 60 + offset, width: 420, height: 500,
  };
  const bounds = visibleFrame(requested, display.workArea);
  const window = new BrowserWindow({
    ...bounds, minWidth: 260, minHeight: 260, show: false,
    title: note.title || '雾笺', backgroundColor: '#e8e3f5',
    resizable: true, transparent: false, hasShadow: true,
    acceptFirstMouse: true,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } }
      : { frame: false, thickFrame: true }),
    alwaysOnTop: note.pinned,
    icon: existsSync(brandPath('icon.png')) ? brandPath('icon.png') : undefined,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, spellcheck: false,
      webSecurity: true, allowRunningInsecureContent: false,
    },
  });
  windows.set(note.id, window);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', () => {
    if (!quitting) dialog.showMessageBox(window, {
      type: 'error', title: '雾笺', message: '便签界面意外关闭，已保存的内容仍在本机。',
      buttons: ['重新打开'], noLink: true,
    }).then(() => { if (!window.isDestroyed()) window.reload(); }).catch(showError);
  });
  window.once('ready-to-show', () => {
    if (!capsuleState.enabled || !capsuleState.placements[note.id]) window.show();
  });
  window.on('resize', () => scheduleFrame(note.id));
  window.on('move', () => scheduleFrame(note.id));
  window.on('close', (event) => {
    aiJobs.get(window.id)?.abort();
    if (quitting) return;
    event.preventDefault();
    if (closingWindows.has(window.id)) return;
    closingWindows.add(window.id);
    requestRendererFlush(window).then(() => {
      if (window.isDestroyed()) return;
      saveFrame(note.id);
      removePlacement(note.id);
      destroyCapsule(note.id);
      replaceNote({ ...requireNote(note.id), visible: false });
      window.hide();
    }).catch(showError).finally(() => closingWindows.delete(window.id));
  });
  window.on('closed', () => {
    aiJobs.get(window.id)?.abort();
    aiJobs.delete(window.id);
    if (windows.get(note.id) === window) windows.delete(note.id);
    resizeSessions.delete(window.id);
    dragSessions.delete(window.id);
    destroyCapsule(note.id);
  });
  if (devURL) void window.loadURL(devURL);
  else void window.loadFile(join(appRoot, 'dist', 'index.html'));
  if (capsuleState.enabled && capsuleState.placements[note.id]) createCapsule(note);
}
async function exportBackup(window?: BrowserWindow): Promise<boolean> {
  flushFrames();
  const options: Electron.SaveDialogOptions = {
    title: '导出雾笺整包备份', defaultPath: `雾笺备份-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: '雾笺备份', extensions: ['json'] }],
  };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  atomicWrite(result.filePath, JSON.stringify(notebook, null, 2));
  return true;
}
async function importBackup(window?: BrowserWindow): Promise<boolean> {
  const options: Electron.OpenDialogOptions = {
    title: '合并导入雾笺备份', properties: ['openFile'],
    filters: [{ name: '雾笺备份', extensions: ['json'] }],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return false;
  const incoming = readNotebook(result.filePaths[0]);
  flushFrames();
  // Keep a permanent pre-import snapshot, beyond the rolling previous-save file.
  const backupDir = join(dataDirectory, 'import-backups');
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  atomicWrite(join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(notebook, null, 2));
  const customThemes = [...notebook.settings.customThemes];
  const remapThemes = new Map<string, string>();
  for (const theme of incoming.settings.customThemes) {
    const current = customThemes.find((item) => item.id === theme.id);
    if (!current) customThemes.push(theme);
    else if (JSON.stringify(current) !== JSON.stringify(theme)) {
      const id = `custom-${randomUUID()}`;
      remapThemes.set(theme.id, id);
      customThemes.push({ ...theme, id });
    }
  }
  const notes = [...notebook.notes];
  let imported = 0;
  for (const original of incoming.notes) {
    const note = { ...original, theme: remapThemes.get(original.theme) ?? original.theme };
    const current = notes.find((item) => item.id === note.id);
    if (current && JSON.stringify(current) === JSON.stringify(note)) continue;
    if (current) {
      note.id = randomUUID();
      note.title = `${note.title || '无标题'}（导入副本）`;
    }
    notes.push(note);
    imported++;
  }
  persist({
    schemaVersion: 2, notes,
    importedSources: [...new Set([...notebook.importedSources, ...incoming.importedSources])],
    settings: {
      customThemes,
      favorites: [...new Set([...notebook.settings.favorites, ...incoming.settings.favorites.map((id) => remapThemes.get(id) ?? id)])],
      recent: [...new Set([...notebook.settings.recent, ...incoming.settings.recent.map((id) => remapThemes.get(id) ?? id)])].slice(0, 50),
    },
  });
  const first = notes.find((note) => !note.archived && !windows.has(note.id));
  if (first) showNote(first.id);
  const message = `已合并导入 ${imported} 张便签。相同便签自动跳过，内容不同的同名标识保留为副本。`;
  if (window && !window.isDestroyed()) await dialog.showMessageBox(window, { type: 'info', message, buttons: ['好'] });
  else await dialog.showMessageBox({ type: 'info', message, buttons: ['好'] });
  return true;
}
async function exportText(id: string, window?: BrowserWindow): Promise<boolean> {
  const note = requireNote(id);
  const filename = (note.title || '无标题便签').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
  const options: Electron.SaveDialogOptions = { title: '导出文字', defaultPath: `${filename}.txt`, filters: [{ name: '纯文本', extensions: ['txt'] }] };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  atomicWrite(result.filePath, note.text);
  return true;
}
function rebuildMenus(): void {
  if (!notebook) return;
  const active = notebook.notes.filter((note) => !note.archived);
  const archived = notebook.notes.filter((note) => note.archived);
  const noteMenu: Electron.MenuItemConstructorOptions[] = [
    { label: '新建便签', accelerator: 'CmdOrCtrl+N', click: action(createNote) },
    { label: '显示全部便签', click: action(() => active.forEach((note) => showNote(note.id))) },
    { type: 'separator' },
    ...active.map((note) => ({ label: note.title || '无标题便签', click: action(() => showNote(note.id)) })),
    { type: 'separator' },
    { label: '归档便签', submenu: archived.length
      ? archived.map((note) => ({ label: note.title || '无标题便签', click: action(() => restoreNote(note.id)) }))
      : [{ label: '暂无归档', enabled: false }] },
    { type: 'separator' },
    { label: '导出整包备份…', click: action(() => exportBackup(BrowserWindow.getFocusedWindow() ?? undefined)) },
    { label: '合并导入备份…', click: action(() => importBackup(BrowserWindow.getFocusedWindow() ?? undefined)) },
  ];
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{
      label: '雾笺', submenu: [
        { label: '关于雾笺', role: 'about' }, { type: 'separator' },
        { label: '登录时启动', type: 'checkbox', checked: loginEnabled(), enabled: app.isPackaged, click: action(() => setLogin(!loginEnabled())) },
        { type: 'separator' }, { label: '隐藏雾笺', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' }, { label: '显示全部', role: 'unhide' },
        { type: 'separator' }, { label: '退出雾笺', role: 'quit' },
      ],
    } as Electron.MenuItemConstructorOptions] : []),
    { label: '便签', submenu: noteMenu },
    { label: '编辑', submenu: [
      { label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' },
      { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' },
    ] },
    { label: '窗口', submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '关闭便签窗口', accelerator: 'CmdOrCtrl+W', click: action(() => BrowserWindow.getFocusedWindow()?.close()) },
    ] },
    ...(process.platform === 'darwin' ? [] : [{
      label: '设置', submenu: [
        { label: '登录时启动', type: 'checkbox', checked: loginEnabled(), enabled: app.isPackaged, click: action(() => setLogin(!loginEnabled())) },
        { type: 'separator' }, { label: '退出雾笺', role: 'quit' },
      ],
    } as Electron.MenuItemConstructorOptions]),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  tray?.setContextMenu(Menu.buildFromTemplate([
    ...noteMenu, { type: 'separator' },
    { label: '登录时启动', type: 'checkbox', checked: loginEnabled(), enabled: app.isPackaged, click: action(() => setLogin(!loginEnabled())) },
    { type: 'separator' }, { label: '退出雾笺', click: action(() => app.quit()) },
  ]));
}
function createTray(): void {
  const path = brandPath(process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.png');
  let icon = existsSync(path) ? nativeImage.createFromPath(path) : nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
  icon = icon.resize({ width: process.platform === 'darwin' ? 18 : 20, height: process.platform === 'darwin' ? 18 : 20 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('雾笺');
  tray.on('double-click', action(() => {
    const first = notebook.notes.find((note) => !note.archived);
    if (first) showNote(first.id); else createNote();
  }));
}
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || event.senderFrame !== event.sender.mainFrame || ![...windows.values(), ...capsules.values()].includes(window)) throw new Error('此窗口无权访问便签数据。');
  const url = event.senderFrame.url;
  if (devURL) {
    if (new URL(url).origin !== new URL(devURL).origin) throw new Error('页面来源无效。');
  } else {
    if (!url.startsWith('file:') || resolve(fileURLToPath(url)) !== resolve(join(appRoot, 'dist', 'index.html'))) throw new Error('页面来源无效。');
  }
  return window;
}
function pointer(value: unknown): PointerPosition {
  const p = value as PointerPosition | null;
  if (!p || typeof p !== 'object' || !Number.isFinite(p.screenX) || !Number.isFinite(p.screenY) || Math.abs(p.screenX) > 100_000 || Math.abs(p.screenY) > 100_000) throw new Error('拖动坐标无效。');
  return p;
}
function registerIPC(): void {
  ipcMain.on('mist:flush-response', (event, value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const response = value as { token?: unknown; error?: unknown };
    if (typeof response.token !== 'string') return;
    const pending = flushRequests.get(response.token);
    if (!pending || pending.senderId !== event.sender.id || event.senderFrame !== event.sender.mainFrame) return;
    clearTimeout(pending.timer);
    flushRequests.delete(response.token);
    if (typeof response.error === 'string') pending.reject(new Error(response.error.slice(0, 500)));
    else pending.resolve();
  });
  const handle = (name: string, callback: (window: BrowserWindow, ...args: any[]) => unknown) => {
    ipcMain.handle(`mist:${name}`, (event, ...args) => {
      const window = senderWindow(event);
      if ([...capsules.values()].includes(window) && !['get-state', 'capsule-preview', 'capsule-restore'].includes(name)) {
        throw new Error('胶囊预览为只读，请先展开便签。');
      }
      return callback(window, ...args);
    });
  };
  handle('get-state', (window) => stateFor(window));
  handle('update-note', (_window, id: unknown, patch: unknown) => {
    const note = applyNotePatch(requireNote(id), patch);
    replaceNote(note);
    const window = windows.get(note.id);
    window?.setTitle(note.title || '雾笺');
    window?.setAlwaysOnTop(note.pinned, 'floating');
    return note;
  });
  handle('update-settings', (_window, patch: unknown) => {
    const settings = applySettingsPatch(notebook.settings, patch);
    persist({ ...notebook, settings });
    return settings;
  });
  handle('create-note', () => createNote());
  handle('set-pinned', (_window, id: unknown, pinned: unknown) => setPinned(requireNote(id).id, pinned));
  handle('archive-note', (_window, id: unknown) => archiveNote(requireNote(id).id));
  handle('restore-note', (_window, id: unknown) => restoreNote(requireNote(id).id));
  handle('show-note', (_window, id: unknown) => showNote(requireNote(id).id));
  handle('resize-start', (window, position: unknown) => {
    const start = window.getBounds();
    resizeSessions.set(window.id, { start, initial: pointer(position), area: screen.getDisplayMatching(start).workArea });
  });
  handle('resize-move', (window, position: unknown) => {
    const resize = resizeSessions.get(window.id);
    if (resize) window.setBounds(resizedFrame(resize.start, resize.initial, pointer(position), resize.area));
  });
  handle('resize-end', (window) => {
    resizeSessions.delete(window.id);
    saveFrame(noteForWindow(window).id);
  });
  handle('drag-start', (window, position: unknown) => {
    dragSessions.set(window.id, { start: window.getBounds(), initial: pointer(position), moved: false });
  });
  handle('drag-move', (window, position: unknown) => {
    const drag = dragSessions.get(window.id);
    if (!drag) return;
    const point = pointer(position);
    const dx = point.screenX - drag.initial.screenX, dy = point.screenY - drag.initial.screenY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    window.setPosition(Math.round(drag.start.x + dx), Math.round(drag.start.y + dy));
  });
  handle('drag-end', async (window, cancelled: unknown = false) => {
    if (typeof cancelled !== 'boolean') throw new Error('拖动状态无效。');
    const drag = dragSessions.get(window.id);
    dragSessions.delete(window.id);
    if (!drag?.moved) return;
    if (cancelled) window.setBounds(drag.start);
    saveFrame(noteForWindow(window).id);
    if (!cancelled) await dockNote(window);
  });
  handle('capsule-preview', (window, expanded: unknown) => {
    if (typeof expanded !== 'boolean') throw new Error('预览状态格式不正确。');
    const id = noteForWindow(window).id;
    if (capsules.get(id) !== window) throw new Error('请从胶囊打开预览。');
    if (expanded) previewing.add(id); else previewing.delete(id);
    reflowCapsules();
    window.webContents.send('mist:state', stateFor(window));
  });
  handle('capsule-restore', window => restoreCapsule(noteForWindow(window).id));
  handle('capsule-enabled', (_window, enabled: unknown) => setCapsuleEnabled(enabled));
  handle('minimize', (window) => window.minimize());
  handle('close', (window) => window.close());
  handle('set-login', (_window, enabled: unknown) => setLogin(enabled));
  handle('export-backup', (window) => exportBackup(window));
  handle('import-backup', (window) => importBackup(window));
  handle('export-text', (window, id: unknown) => exportText(requireNote(id).id, window));
  handle('ai-status', () => safeAI(() => aiCredentials.status()));
  handle('ai-save-key', (_window, key: unknown) => safeAI(() => aiCredentials.save(key)));
  handle('ai-delete-key', () => safeAI(() => {
    for (const controller of aiJobs.values()) controller.abort();
    return aiCredentials.delete();
  }));
  handle('ai-test', (window) => aiJob(window, signal => ai.testConnection(signal)));
  handle('ai-generate', (window, mode: unknown) => aiJob(window, signal => {
    const note = noteForWindow(window);
    return ai.generate({ title: note.title, text: note.text, mode }, signal);
  }));
  handle('ai-cancel', (window) => { aiJobs.get(window.id)?.abort(); });
  handle('flush', () => flushFrames());
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!notebook) return;
    const first = notebook.notes.find((note) => !note.archived);
    if (first) showNote(first.id); else createNote();
  });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const connect = devURL ? "'self' http://127.0.0.1:5173 ws://127.0.0.1:5173" : "'none'";
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [
        `default-src 'self'; script-src 'self'${devURL ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src ${connect}; object-src 'none'; base-uri 'none'`,
      ] } });
    });
    let loaded = store.load();
    if (!loaded && process.platform === 'darwin' && process.env.MIST_SKIP_MIGRATION !== '1') {
      const migration = migrateLegacyFile(join(homedir(), 'Library', 'Application Support', 'MistNotes', 'notes.json'), dataDirectory, screen.getPrimaryDisplay().bounds.height);
      if (migration) { loaded = migration.notebook; migrationMessage = migration.message; }
    }
    notebook = loaded ?? emptyNotebook();
    try { capsuleState = capsuleStore.load(); }
    catch (error) {
      capsuleLoadError = errorMessage(error);
      capsuleState = { enabled: false, placements: {} };
    }
    if (notebook.notes.length === 0) notebook.notes.push(createBlankNote());
    store.save(notebook);
    registerIPC();
    createTray();
    rebuildMenus();
    const reflow = () => { try { reflowCapsules(); broadcast(); } catch (error) { showError(error); } };
    screen.on('display-removed', reflow);
    screen.on('display-added', reflow);
    screen.on('display-metrics-changed', reflow);
    const visible = notebook.notes.filter((note) => note.visible && !note.archived);
    if (visible.length) visible.forEach(createWindow);
    else {
      const first = notebook.notes.find((note) => !note.archived);
      if (first) showNote(first.id);
    }
    if (capsuleLoadError) void dialog.showMessageBox({
      type: 'warning', title: '雾笺', message: '胶囊布局暂不可用，便签已以完整窗口打开。',
      detail: capsuleLoadError, buttons: ['好'],
    });
    app.on('activate', () => {
      const first = notebook.notes.find((note) => !note.archived);
      if (first) showNote(first.id); else createNote();
    });
  }).catch((error) => {
    fatalStartup = true;
    dialog.showErrorBox('雾笺未能打开数据', `${errorMessage(error)}\n\n数据目录：${dataDirectory}`);
    app.quit();
  });
  app.on('before-quit', (event) => {
    if (fatalStartup || quitting) return;
    event.preventDefault();
    if (quitPending) return;
    quitPending = true;
    for (const controller of aiJobs.values()) controller.abort();
    Promise.all([...windows.values()].map(requestRendererFlush)).then(() => {
      flushFrames();
      quitting = true;
      app.quit();
    }).catch(showError).finally(() => { quitPending = false; });
  });
  app.on('window-all-closed', () => { /* Keep the tray available; explicit Quit exits. */ });
}
