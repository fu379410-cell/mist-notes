import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { fontTransaction, previewFont, sliderToSize, sizeToSlider, type FontTarget } from './editor';
import { Icon } from './Icons';

export function FontPanel({ editor, onClose, onPreviewTitle, onPreviewBody }: {
  editor: Editor; onClose: () => void; onPreviewTitle: (n: number | null) => void; onPreviewBody: (n: number | null) => void;
}) {
  const selection = useRef({ from: editor.state.selection.from, to: editor.state.selection.to }).current;
  const [target, setTarget] = useState<FontTarget>(selection.from !== selection.to ? 'selection' : 'body');
  const readSize = (scope: FontTarget) => scope === 'title' ? Number(editor.state.doc.attrs.titleFontSize) :
    scope === 'selection' ? parseFloat(editor.getAttributes('textStyle').fontSize || editor.state.doc.attrs.bodyFontSize) :
      Number(editor.state.doc.attrs.bodyFontSize);
  const [size, setSize] = useState(readSize(target));
  const latest = useRef(size);
  const active = useRef(false);
  const clean = () => { previewFont(editor, null); onPreviewTitle(null); onPreviewBody(null); };
  useEffect(() => () => { if (!editor.isDestroyed) clean(); }, [editor]);
  const commit = () => {
    if (!active.current) return;
    active.current = false;
    clean();
    const tr = fontTransaction(editor.state, target, latest.current, selection);
    if (!tr.doc.eq(editor.state.doc)) editor.view.dispatch(tr);
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.view.focus();
  };
  const close = () => { commit(); clean(); onClose(); editor.commands.focus(); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  });
  const change = (position: number) => {
    active.current = true;
    const next = sliderToSize(position);
    setSize(next); latest.current = next;
    if (target === 'title') onPreviewTitle(next);
    else {
      if (target === 'body') onPreviewBody(next);
      previewFont(editor, { ...target === 'body' ? { from: 0, to: editor.state.doc.content.size } : selection, size: next });
    }
  };
  return <section className="font-panel floating" aria-label="拖动调整字号">
    <div className="panel-heading"><strong>拖动调整字号</strong><button className="icon-button" aria-label="关闭字号面板" onClick={close}><Icon name="close"/></button></div>
    <div className="segments" aria-label="字号调整范围">
      {([['body','全文'],['selection','选区'],['title','标题']] as const).map(([scope,label]) =>
        <button key={scope} disabled={scope === 'selection' && selection.from === selection.to} aria-pressed={scope === target}
          onClick={() => { commit(); clean(); setTarget(scope); const value = readSize(scope); setSize(value); latest.current = value; }}>{label}</button>)}
    </div>
    <div className="size-value" aria-live="polite"><span>{size.toFixed(2).replace(/\.?0+$/, '')}</span><small>字号</small></div>
    <div className="slider-row"><span className="small-a">A</span>
      <input aria-label="字体大小" aria-valuetext={`${size}，拖动调整`} type="range" min="0" max="1000" step="0.5"
        value={sizeToSlider(size)} onChange={e => change(Number(e.target.value))}
        onPointerUp={commit} onPointerCancel={() => { active.current=false; clean(); setSize(readSize(target)); }}
        onKeyUp={commit} onBlur={commit}/>
      <span className="large-a">A</span></div>
    <div className="range-labels"><span>1</span><span>200</span></div>
    <p className="muted small">左右拖动，实时预览 · 松手自动保存</p>
  </section>;
}
