import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Fragment, Slice } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import type { AppState, Note, NotePatch, SettingsPatch } from './shared/types';
import { docToPlainText } from './shared/document';
import { resolveTheme, themeBackground } from './shared/themes';
import { applyAITransaction, editorExtensions } from './editor';
import { AIKeySettings, AIOrb } from './AIControls';
import { OneClickAIError, runOneClickAI } from './one-click-ai';
import { DynamicBackground } from './DynamicBackground';
import { ensureDynamicReadableTheme } from './shared/dynamic-gradient';
import { FontPanel } from './FontPanel';
import { ThemePanel } from './ThemePanel';
import { Icon } from './Icons';
import logoUrl from '../resources/brand-mark.png';

export function App() {
  const [initial, setInitial] = useState<AppState | null>(null);
  const [failure, setFailure] = useState('');
  useEffect(() => { window.mist.getState().then(setInitial).catch(e => setFailure(String(e.message || e))); }, []);
  if (failure) return <main className="startup-error"><h1>无法打开便签</h1><p>{failure}</p><button onClick={() => location.reload()}>重试</button></main>;
  if (!initial) return <main className="startup-error"><img src={logoUrl} width={48}/><p>正在打开雾笺…</p></main>;
  const note = initial.notebook.notes.find(n => n.id === initial.noteId);
  return note ? <NoteWindow key={note.id} initial={initial} initialNote={note}/> : <main className="startup-error"><p>这张便签已归档</p><button onClick={() => window.mist.createNote()}>新建便签</button></main>;
}
function NoteWindow({ initial, initialNote }: { initial: AppState; initialNote: Note }) {
  const [state, setState] = useState(initial);
  const [note, setNote] = useState(initialNote);
  const noteRef = useRef(note); noteRef.current = note;
  const [panel, setPanel] = useState<'font'|'theme'|'menu'|null>(null);
  const [aiBusy, setAIBusy] = useState(false);
  const aiRequest = useRef<AbortController | null>(null);
  const [aiUndoReady, setAIUndoReady] = useState(false);
  const [aiFeedback, setAIFeedback] = useState('');
  const [aiKeyPopover, setAIKeyPopover] = useState(false);
  const [aiKeyError, setAIKeyError] = useState('');
  const [aiSettings, setAISettings] = useState(false);
  const [titlePreview, setTitlePreview] = useState<number|null>(null);
  const [bodyPreview, setBodyPreview] = useState<number|null>(null);
  const [status, setStatus] = useState('已保存到本机');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initial.migrationMessage || '');
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const settingsPending = useRef(0);
  const settingsRef = useRef(initial.notebook.settings);
  const saveFailed = useRef(false);
  const [login, setLogin] = useState(initial.loginEnabled);
  const run = (action: Promise<unknown>) => action.catch(e => { setError(String(e.message || e)); });
  const save = useCallback((patch: NotePatch) => {
    setNote(n => ({ ...n, ...patch }));
    pending.current += 1; setStatus('保存中…');
    queue.current = queue.current.then(async () => {
      try { await window.mist.updateNote(initialNote.id, patch); }
      catch (e) { saveFailed.current = true; setError(String((e as Error).message || e)); setStatus('保存失败'); throw e; }
    }).catch(() => {}).finally(() => { pending.current -= 1; if (!pending.current && !saveFailed.current) setStatus('已保存到本机'); });
  }, [initialNote.id]);
  useEffect(() => window.mist.onState(next => {
    if (!settingsPending.current) settingsRef.current = next.notebook.settings;
    setState({ ...next, notebook: { ...next.notebook, settings: settingsRef.current } }); setLogin(next.loginEnabled);
    if (!pending.current) {
      const remote = next.notebook.notes.find(n => n.id === initialNote.id);
      if (remote) setNote(n => ({ ...n, pinned: remote.pinned, theme: remote.theme }));
    }
  }), []);
  useEffect(() => window.mist.onBeforeClose(async () => {
    aiRequest.current?.abort();
    await queue.current;
    if (saveFailed.current) throw new Error('仍有内容未成功保存，请先重试保存。');
  }), []);
  useEffect(() => () => { aiRequest.current?.abort(); void window.mist.aiCancel().catch(() => {}); }, []);
  const editor = useEditor({
    extensions: editorExtensions,
    content: { ...initialNote.editorDoc, attrs: { ...initialNote.editorDoc.attrs, bodyFontSize: initialNote.bodyFontSize, titleFontSize: initialNote.titleFontSize, noteTitle: initialNote.title } },
    editorProps: {
      attributes: { 'aria-label': '便签正文', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'false' },
      clipboardTextParser: (text, context, _plain, view) => {
        const marks = view.state.storedMarks ?? context.marks();
        return new Slice(Fragment.fromArray(text.replace(/\r\n?/g,'\n').split('\n').map(line =>
          view.state.schema.nodes.paragraph.create(null, line ? view.state.schema.text(line, marks) : undefined))), 0, 0);
      },
    },
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.getMeta('mist-ai-commit')) { setAIUndoReady(false); setAIFeedback(''); }
      const editorDoc = editor.getJSON();
      save({ editorDoc, title: typeof editorDoc.attrs?.noteTitle === 'string' ? editorDoc.attrs.noteTitle : noteRef.current.title,
        text: docToPlainText(editorDoc), bodyFontSize: Number(editorDoc.attrs?.bodyFontSize ?? 16), titleFontSize: Number(editorDoc.attrs?.titleFontSize ?? 24) });
    },
  });
  useEffect(() => {
    if (panel !== 'font' || !editor) return;
    const watch = ({ transaction }: { transaction: import('@tiptap/pm/state').Transaction }) => {
      if (!transaction.getMeta('mist-font-commit') && (transaction.docChanged || transaction.selectionSet)) setPanel(null);
    };
    editor.on('transaction', watch);
    return () => { editor.off('transaction', watch); };
  }, [panel, editor]);
  const theme = ensureDynamicReadableTheme(resolveTheme(note.theme, state.notebook.settings.customThemes));
  const saveSettings = (patch: SettingsPatch) => {
    settingsRef.current = { ...settingsRef.current, ...patch };
    setState(s => ({ ...s, notebook: { ...s.notebook, settings: settingsRef.current } }));
    settingsPending.current += 1;
    queue.current = queue.current.then(async () => {
      try { await window.mist.updateSettings(patch); }
      catch (e) { saveFailed.current=true; setError(String((e as Error).message || e)); setStatus('保存失败'); }
    }).finally(() => { settingsPending.current -= 1; });
  };
  const chooseTheme = (themeId: string) => {
    save({ theme: themeId });
    saveSettings({ recent: [themeId, ...settingsRef.current.recent.filter(id => id !== themeId)].slice(0,24) });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (panel === 'font') return; // Font panel owns preview commit on blur.
        setPanel(null);
        setAIKeyPopover(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 't') { event.preventDefault(); setPanel(p => p === 'font' ? null : 'font'); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [panel]);
  const pointer = (event: React.PointerEvent) => ({ screenX: window.screenX + event.clientX, screenY: window.screenY + event.clientY });
  const resize = useRef(false);
  const afterSaved = async (fn: () => Promise<unknown>) => {
    await queue.current;
    if (saveFailed.current) throw new Error('仍有内容未成功保存，请先重试保存。');
    await window.mist.flush(); await fn();
  };
  const organizeAI = async () => {
    if (aiRequest.current) {
      aiRequest.current.abort();
      await window.mist.aiCancel();
      return;
    }
    if (!editor) return;
    if (!docToPlainText(editor.getJSON()).trim() && !String(editor.state.doc.attrs.noteTitle || '').trim()) {
      setAIFeedback('先写一点内容，再点击整理。'); return;
    }
    const controller = new AbortController();
    aiRequest.current = controller;
    setAIBusy(true); setAIKeyPopover(false); setAIFeedback(''); setError(''); setPanel(null);
    try {
      await runOneClickAI({
        signal: controller.signal,
        waitForSave: async () => {
          for (;;) {
            const saving = queue.current;
            await saving;
            if (controller.signal.aborted || saving === queue.current) break;
          }
          if (saveFailed.current) throw new Error('请先重试保存，再整理这张便签。');
        },
        snapshot: () => JSON.stringify(editor.getJSON()),
        generate: () => window.mist.aiGenerate('organize'),
        apply: async result => {
          editor.view.dispatch(applyAITransaction(editor.state, result));
          editor.view.dispatch(closeHistory(editor.state.tr));
          editor.commands.focus(undefined, { scrollIntoView: false });
          setAIUndoReady(true); setAIFeedback('已整理');
          await queue.current;
          if (saveFailed.current) throw new Error('整理结果尚未保存，请使用重试保存。');
        },
      });
    } catch (e) {
      if (e instanceof OneClickAIError && (e.code === 'missing_key' || e.code === 'authentication' || e.code === 'credential_error')) {
        setAIKeyError(e.code === 'missing_key' ? '' : e.message); setAIKeyPopover(true);
      } else if (e instanceof OneClickAIError && (e.code === 'cancelled' || e.code === 'stale')) {
        setAIFeedback(e.code === 'cancelled' ? '已取消整理' : '内容已修改，本次整理已跳过');
      } else setError(e instanceof Error ? e.message : '整理未完成，请重试。');
    } finally {
      if (aiRequest.current === controller) { aiRequest.current = null; setAIBusy(false); }
    }
  };
  return <main className={`note-shell ${theme.ink === '#F7F5FC' ? 'dark-note' : ''}`} style={{
    background: themeBackground(theme), color: theme.ink,
    '--body-size': `${bodyPreview ?? note.bodyFontSize}px`, '--title-size': `${titlePreview ?? note.titleFontSize}px`,
  } as CSSProperties}>
    <DynamicBackground theme={theme}/>
    <div className="window-bar">
      <span className={`window-drag ${state.platform === 'darwin' ? 'mac' : ''}`}>雾笺</span>
      {state.platform !== 'darwin' && <div className="window-controls"><button aria-label="最小化" onClick={() => run(window.mist.minimize())}><Icon name="minus" size={14}/></button><button aria-label="收起窗口" onClick={() => run(afterSaved(() => window.mist.close()))}><Icon name="close" size={14}/></button></div>}
    </div>
    <header className="note-header">
      <div className="brand"><img src={logoUrl} alt=""/><span>雾笺</span><small>随手记</small></div>
      <div className="tools">
        <button className={`icon-button aa ${panel === 'font' ? 'active' : ''}`} aria-label="调整字号" title="拖动调整字号 ⌘T" onMouseDown={e => e.preventDefault()} onClick={() => setPanel(p => p === 'font' ? null : 'font')}>A<span>A</span></button>
        <button className="icon-button" aria-label="新建便签" title="新建便签" onClick={() => run(window.mist.createNote())}><Icon name="plus"/></button>
        <button className={`icon-button ${note.pinned ? 'active' : ''}`} aria-label={note.pinned ? '取消置顶' : '置顶便签'} title="置顶便签" aria-pressed={note.pinned} onClick={() => save({ pinned: !note.pinned })}><Icon name="pin"/></button>
        <button className="icon-button" aria-label="更多选项" onClick={() => setPanel(p => p === 'menu' ? null : 'menu')}><Icon name="menu"/></button>
      </div>
    </header>
    <div className="title-scroll"><input className="note-title" aria-label="便签标题" placeholder="未命名便签" value={note.title} onChange={e => { if (editor) editor.view.dispatch(editor.state.tr.setDocAttribute('noteTitle', e.target.value)); }} maxLength={300}/></div>
    <div className="editor-scroll"><EditorContent editor={editor}/></div>
    <footer className="note-footer">
      <div className="footer-actions"><button className="palette-button" aria-label="选择渐变配色" title="240 套持续流动的动态渐变与自由调色" onClick={() => setPanel('theme')}>
        <span className="palette-orb" style={{ background: themeBackground(theme) }}/><span className="theme-name">{theme.name}</span><Icon name="arrow" size={12}/>
      </button><AIOrb busy={aiBusy} onClick={() => run(organizeAI())}/></div>
      <div className="status-row"><span className="ai-feedback" role="status"><span>{aiBusy ? '正在整理…再点小球可取消' : aiFeedback || status}</span>{!aiBusy && aiUndoReady && <button onClick={() => { editor?.commands.undo(); editor?.commands.focus(undefined, { scrollIntoView: false }); setAIUndoReady(false); setAIFeedback('已恢复原文'); }}>撤销</button>}</span><span>{Array.from(note.text).length} 字</span></div>
    </footer>
    <div className="resize-grip" role="separator" aria-label="拖动右下角调整便签大小" title="拖动这里调整大小"
      onPointerDown={e => { e.preventDefault(); resize.current = true; e.currentTarget.setPointerCapture(e.pointerId); run(window.mist.resizeStart(pointer(e))); }}
      onPointerMove={e => { if (resize.current) run(window.mist.resizeMove(pointer(e))); }}
      onPointerUp={e => { resize.current=false; e.currentTarget.releasePointerCapture(e.pointerId); run(window.mist.resizeEnd()); }}
      onPointerCancel={() => { resize.current=false; run(window.mist.resizeEnd()); }}>
      <svg width="24" height="24" viewBox="0 0 24 24"><path d="m7 20 13-13M13 20l7-7M19 20l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    </div>
    {panel === 'font' && editor && <FontPanel editor={editor} onClose={() => setPanel(null)} onPreviewTitle={setTitlePreview} onPreviewBody={setBodyPreview}/>}
    {panel === 'theme' && <ThemePanel current={theme} settings={state.notebook.settings} onApply={t => chooseTheme(t.id)} onSettings={saveSettings} onClose={() => setPanel(null)}/>}
    {aiKeyPopover && <div className="ai-inline-key"><AIKeySettings organizeAfterSave initialError={aiKeyError} onClose={() => setAIKeyPopover(false)} onSaved={() => { setAIKeyPopover(false); void organizeAI(); }}/></div>}
    {panel === 'menu' && <section className="menu-panel sheet" aria-label="便签与设置">
      <div className="panel-heading"><div><strong>你的雾笺</strong><p className="eyebrow">每一个想法，都好好留着</p></div><button className="icon-button" aria-label="关闭更多选项" onClick={() => setPanel(null)}><Icon name="close"/></button></div>
      <div className="menu-scroll">
        <div className="menu-section-label">便签</div>
        {state.notebook.notes.filter(n => !n.archived).map(n => <button key={n.id} className="menu-item" onClick={() => { run(window.mist.showNote(n.id)); setPanel(null); }}><span className="mini-dot" style={{ background: themeBackground(resolveTheme(n.theme, state.notebook.settings.customThemes)) }}/><span>{n.title || '未命名便签'}</span>{n.id === note.id && <Icon name="check" size={14}/>}</button>)}
        <button className="menu-item" onClick={() => run(window.mist.createNote())}><Icon name="plus"/><span>新建便签</span></button>
        <div className="menu-divider"/>
        <button className="menu-item" onClick={() => run(afterSaved(() => window.mist.exportText(note.id)))}>导出这张便签为 TXT</button>
        <button className="menu-item" onClick={() => run(afterSaved(() => window.mist.archiveNote(note.id)))}><Icon name="archive"/><span>归档这张便签</span><small>可恢复</small></button>
        {state.notebook.notes.some(n => n.archived) && <><div className="menu-section-label">已归档 · 点击恢复</div>{state.notebook.notes.filter(n => n.archived).map(n => <button className="menu-item" key={n.id} onClick={() => run(window.mist.restoreNote(n.id))}><Icon name="restore"/><span>{n.title || '未命名便签'}</span></button>)}</>}
        <div className="menu-divider"/>
        <div className="menu-section-label">本机设置</div>
        <button className="menu-item" disabled={aiBusy} aria-expanded={aiSettings} onClick={() => { setAISettings(value => !value); setAIKeyPopover(false); }}>AI 密钥设置</button>
        {aiSettings && <AIKeySettings onClose={() => setAISettings(false)} onSaved={() => { setAISettings(false); setAIFeedback('密钥已在本机保存'); }}/ >}
        <label className="menu-item">登录时自动打开<input type="checkbox" checked={login} onChange={e => run(window.mist.setLogin(e.target.checked).then(setLogin))}/></label>
        <button className="menu-item" onClick={() => run(afterSaved(() => window.mist.exportBackup()))}>导出全部便签与配色</button>
        <button className="menu-item" onClick={() => run(afterSaved(async () => { if (await window.mist.importBackup()) location.reload(); }))}>导入备份文件</button>
      </div>
    </section>}
    {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="关闭迁移提示" onClick={() => setNotice('')}><Icon name="close" size={14}/></button></div>}
    {error && <div className="error-toast" role="alert"><span>{error}</span>
      {saveFailed.current && <button onClick={() => {
        const n = noteRef.current;
        run(queue.current.then(() => window.mist.updateNote(n.id, { title:n.title, text:n.text, editorDoc:n.editorDoc, bodyFontSize:n.bodyFontSize, titleFontSize:n.titleFontSize, theme:n.theme, pinned:n.pinned }))
          .then(() => window.mist.updateSettings(settingsRef.current)).then(() => { saveFailed.current=false; setError(''); setStatus('已保存到本机'); }));
      }}>重试保存</button>}
      <button aria-label="关闭错误提示" onClick={() => setError('')}><Icon name="close" size={14}/></button></div>}
  </main>;
}
