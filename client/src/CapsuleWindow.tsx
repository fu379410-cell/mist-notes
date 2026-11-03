import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState } from './shared/types';
import { resolveTheme } from './shared/themes';
import { ensureDynamicReadableTheme } from './shared/dynamic-gradient';
import { DynamicBackground } from './DynamicBackground';
import { Icon } from './Icons';
import brandMarkUrl from '../resources/brand-mark.png';
import './capsule.css';

const HOVER_DELAY = 180;
const LEAVE_DELAY = 300;
const PREVIEW_LIMIT = 2400;

function previewText(text: string): { text: string; truncated: boolean } {
  let output = '';
  let count = 0;
  for (const character of text) {
    if (count++ === PREVIEW_LIMIT) return { text: `${output}\n…`, truncated: true };
    output += character;
  }
  return { text: output, truncated: false };
}

/** The editor stays mounted in its own hidden window while this surface previews it. */
export function CapsuleWindow({ initial }: { initial: AppState }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const mounted = useRef(true);
  const restoringRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const note = state.notebook.notes.find(item => item.id === state.noteId);
  const isPreview = state.windowMode === 'preview';
  const rawTheme = resolveTheme(note?.theme ?? 'lilac', state.notebook.settings.customThemes);
  const themeSignature = JSON.stringify(rawTheme);
  const theme = useMemo(() => ensureDynamicReadableTheme(rawTheme), [themeSignature]);
  const excerpt = useMemo(() => previewText(note?.text ?? ''), [note?.text]);
  const title = note?.title.trim() || '未命名便签';

  function clearTimers() {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    hoverTimer.current = null;
    leaveTimer.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.mist.onState(next => {
      stateRef.current = next;
      setState(next);
    });
    // A capsule has no pending edits; the corresponding editor owns its queue.
    const unsubscribeFlush = window.mist.onBeforeClose(async () => {});
    return () => {
      mounted.current = false;
      clearTimers();
      unsubscribe();
      unsubscribeFlush();
    };
  }, []);

  function reportError(value: unknown) {
    if (!mounted.current) return;
    setError(value instanceof Error ? value.message : '便签尚未展开，请重试。');
  }

  function preview(expanded: boolean) {
    if (restoringRef.current || (stateRef.current.windowMode === 'preview') === expanded) return;
    void window.mist.previewCapsule(expanded).catch(reportError);
  }

  function enter() {
    clearTimers();
    if (!restoringRef.current) hoverTimer.current = setTimeout(() => preview(true), HOVER_DELAY);
  }

  function leave() {
    clearTimers();
    if (!restoringRef.current) leaveTimer.current = setTimeout(() => preview(false), LEAVE_DELAY);
  }

  function restore() {
    if (restoringRef.current) return;
    clearTimers();
    setError('');
    restoringRef.current = true;
    setRestoring(true);
    void window.mist.restoreFromCapsule().then(() => {
      restoringRef.current = false;
      if (mounted.current) setRestoring(false);
    }).catch(value => {
      restoringRef.current = false;
      if (mounted.current) setRestoring(false);
      reportError(value);
    });
  }

  if (!note) return null;
  return <main className="capsule-host" onMouseEnter={enter} onMouseLeave={leave}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearTimers();
        preview(false);
      }
    }}>
    <section className={`capsule-card${isPreview ? ' is-preview' : ''}`}
      data-edge={state.capsuleEdge ?? 'right'} style={{ color: theme.ink }}
      aria-label={isPreview ? '便签只读预览' : '屏幕边缘便签'}>
      <DynamicBackground theme={theme}/>
      <span className="capsule-frost-edge" aria-hidden="true"/>
      <span className="capsule-corner-accents" aria-hidden="true"/>
      <span className="capsule-edge-mark" aria-hidden="true"/>
      <button className="capsule-heading" disabled={restoring} onClick={restore}
        aria-label={`展开便签：${title}`} title={error || `点击展开：${title}`}>
        <span className="capsule-brand-seat" aria-hidden="true"><img className="capsule-brand-mark" src={brandMarkUrl} alt="" draggable={false}/></span>
        <span className="capsule-title">{title}</span>
        <span className="capsule-open-arrow"><Icon name="arrow" size={14}/></span>
      </button>
      {isPreview && <div className="capsule-preview">
        <button className={`capsule-preview-text${note.text ? '' : ' is-empty'}`}
          aria-label={`展开编辑：${title}`} onClick={restore} disabled={restoring}>
          {excerpt.text || '这张便签还是空白，点击写下第一个想法。'}
        </button>
        <div className="capsule-preview-footer">
          <span>{error || (excerpt.truncated ? '正文节选' : '只读预览')}</span>
          <button onClick={restore} disabled={restoring} className="capsule-edit-button">
            {restoring ? '正在展开…' : '点击展开编辑'}<Icon name="arrow" size={12}/>
          </button>
        </div>
      </div>}
      {!isPreview && error && <span className="capsule-sr-only" role="alert">{error}</span>}
    </section>
  </main>;
}
