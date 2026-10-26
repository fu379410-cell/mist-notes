import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, MistAPI } from '../src/shared/types';

const api: MistAPI = {
  getState: () => ipcRenderer.invoke('mist:get-state'),
  updateNote: (id, patch) => ipcRenderer.invoke('mist:update-note', id, patch),
  updateSettings: (patch) => ipcRenderer.invoke('mist:update-settings', patch),
  createNote: () => ipcRenderer.invoke('mist:create-note'),
  setPinned: (id, pinned) => ipcRenderer.invoke('mist:set-pinned', id, pinned),
  archiveNote: (id) => ipcRenderer.invoke('mist:archive-note', id),
  restoreNote: (id) => ipcRenderer.invoke('mist:restore-note', id),
  showNote: (id) => ipcRenderer.invoke('mist:show-note', id),
  resizeStart: (position) => ipcRenderer.invoke('mist:resize-start', position),
  resizeMove: (position) => ipcRenderer.invoke('mist:resize-move', position),
  resizeEnd: () => ipcRenderer.invoke('mist:resize-end'),
  minimize: () => ipcRenderer.invoke('mist:minimize'),
  close: () => ipcRenderer.invoke('mist:close'),
  setLogin: (enabled) => ipcRenderer.invoke('mist:set-login', enabled),
  exportBackup: () => ipcRenderer.invoke('mist:export-backup'),
  importBackup: () => ipcRenderer.invoke('mist:import-backup'),
  exportText: (id) => ipcRenderer.invoke('mist:export-text', id),
  aiStatus: () => ipcRenderer.invoke('mist:ai-status'),
  aiSaveKey: (key) => ipcRenderer.invoke('mist:ai-save-key', key),
  aiDeleteKey: () => ipcRenderer.invoke('mist:ai-delete-key'),
  aiTest: () => ipcRenderer.invoke('mist:ai-test'),
  aiGenerate: (mode) => ipcRenderer.invoke('mist:ai-generate', mode),
  aiCancel: () => ipcRenderer.invoke('mist:ai-cancel'),
  flush: () => ipcRenderer.invoke('mist:flush'),
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on('mist:state', listener);
    return () => ipcRenderer.removeListener('mist:state', listener);
  },
  onBeforeClose: (callback) => {
    const listener = async (_event: Electron.IpcRendererEvent, token: string) => {
      try {
        await callback();
        ipcRenderer.send('mist:flush-response', { token });
      } catch (error) {
        ipcRenderer.send('mist:flush-response', { token, error: error instanceof Error ? error.message : '正文尚未保存。' });
      }
    };
    ipcRenderer.on('mist:flush-request', listener);
    return () => ipcRenderer.removeListener('mist:flush-request', listener);
  },
};
contextBridge.exposeInMainWorld('mist', Object.freeze(api));
