import { useMemo, useState } from 'react';
import type { NotebookSettings, ThemeDefinition } from './shared/types';
import { CATEGORIES, PRESET_THEMES, ensureReadableTheme, minContrast, themeBackground } from './shared/themes';
import { Icon } from './Icons';

export function ThemePanel({ current, settings, onApply, onSettings, onClose }: {
  current: ThemeDefinition; settings: NotebookSettings; onApply: (theme: ThemeDefinition) => void;
  onSettings: (settings: Partial<NotebookSettings>) => void; onClose: () => void;
}) {
  const [category, setCategory] = useState('全部');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ThemeDefinition>({ ...current, id: '', name: '', category: '我的配色', stops: current.stops.map(s => ({ ...s })) });
  const all = [...PRESET_THEMES, ...settings.customThemes];
  const shown = useMemo(() => {
    let themes = category === '最近' ? settings.recent.map(id => all.find(t => t.id === id)).filter((t): t is ThemeDefinition => !!t)
      : all.filter(t => category === '全部' || (category === '收藏' ? settings.favorites.includes(t.id) : t.category === category));
    return themes.filter(t => `${t.name}${t.category}`.includes(search.trim()));
  }, [category, settings, search]);
  const readable = useMemo(() => ensureReadableTheme(draft), [draft]);
  const saveCustom = () => {
    const theme = { ...readable, id: `custom-${crypto.randomUUID()}`, name: draft.name.trim() || `我的配色 ${settings.customThemes.length + 1}`, category: '我的配色' };
    onSettings({ customThemes: [...settings.customThemes, theme] });
    onApply(theme);
    setEditing(false); setCategory('我的配色');
  };
  return <section className="theme-panel sheet" aria-label="渐变配色">
    <div className="panel-heading">
      <div><strong>{editing ? '自由调色' : '给想法一种颜色'}</strong><p className="eyebrow">{editing ? '创造属于你的渐变' : '240 套渐变 · 八种色彩情绪'}</p></div>
      <button className="icon-button" aria-label="关闭配色面板" onClick={onClose}><Icon name="close"/></button>
    </div>
    {!editing ? <>
      <label className="search-field"><Icon name="search" size={16}/><input aria-label="搜索配色" placeholder="搜索配色名称" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="category-tabs" aria-label="配色分类">
        {['全部','收藏','最近',...CATEGORIES,'我的配色'].map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}
      </div>
      <div className="theme-grid" role="list">
        {shown.map(theme => <div className="theme-card" role="listitem" key={theme.id}>
          <button className={`theme-sample ${current.id === theme.id ? 'selected' : ''}`} title={`应用 ${theme.name}`} aria-label={`应用 ${theme.name}`}
            style={{ background: themeBackground(theme), color: theme.ink }} onClick={() => onApply(theme)}>
            {theme.overlay && <span className="sample-overlay" style={{ background: theme.overlay.color, opacity: theme.overlay.opacity }}/>}
            <span className="sample-glyph">笺</span>{current.id === theme.id && <span className="sample-check"><Icon name="check" size={13}/></span>}
          </button>
          <div className="theme-caption"><span title={theme.name}>{theme.name}</span>
            <button className={`favorite ${settings.favorites.includes(theme.id) ? 'active' : ''}`} aria-label={`${settings.favorites.includes(theme.id) ? '取消收藏' : '收藏'} ${theme.name}`}
              aria-pressed={settings.favorites.includes(theme.id)} onClick={() => onSettings({ favorites: settings.favorites.includes(theme.id) ? settings.favorites.filter(id => id !== theme.id) : [...settings.favorites, theme.id] })}><Icon name="star" size={13}/></button>
          </div>
        </div>)}
        {shown.length === 0 && <p className="empty">这里还没有配色。试试其他分类，或收藏你喜欢的颜色。</p>}
      </div>
      <div className="sheet-bottom"><span className="muted small">{shown.length} 套配色</span><button className="primary" onClick={() => {
        setDraft({ ...current, id:'', name:'', category:'我的配色', stops:current.stops.map(s => ({...s})) });
        setEditing(true);
      }}><Icon name="plus" size={14}/> 自由调色</button></div>
    </> : <>
      <div className="custom-scroll">
        <div className="custom-preview" style={{ background: themeBackground(readable), color: readable.ink }}>
          {readable.overlay && <span className="sample-overlay" style={{ background: readable.overlay.color, opacity: readable.overlay.opacity }}/>}
          <div><span>雾笺</span><p>让想法，轻轻停留。</p></div>
        </div>
        <label className="form-label">配色名称<input maxLength={40} placeholder="为你的渐变起个名字" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
        <div className="panel-heading small"><strong>颜色节点</strong><span className="muted">{draft.stops.length} / 4</span></div>
        {draft.stops.map((stop, i) => <div className="stop-row" key={i}>
          <input type="color" aria-label={`节点 ${i + 1} 颜色`} value={stop.color} onChange={e => setDraft({ ...draft, stops: draft.stops.map((s,j) => i === j ? { ...s, color: e.target.value } : s) })}/>
          <input type="range" aria-label={`节点 ${i + 1} 位置`} min={0} max={100} step={1} value={stop.position * 100}
            onChange={e => setDraft({ ...draft, stops: draft.stops.map((s,j) => i === j ? { ...s, position: Number(e.target.value) / 100 } : s) })}/>
          <span>{Math.round(stop.position * 100)}%</span>
          <button className="icon-button" aria-label={`移除节点 ${i + 1}`} disabled={draft.stops.length === 2}
            onClick={() => setDraft({ ...draft, stops: draft.stops.filter((_,j) => j !== i) })}><Icon name="minus" size={14}/></button>
        </div>)}
        <button className="subtle" disabled={draft.stops.length === 4} onClick={() => setDraft({ ...draft, stops: [...draft.stops, { color: '#DCE5F6', position: 0.5 }] })}><Icon name="plus" size={14}/> 添加颜色</button>
        <label className="form-label">渐变方向 <span>{draft.angle}°</span><input type="range" aria-label="渐变方向" min={0} max={360} value={draft.angle} onChange={e => setDraft({ ...draft, angle: Number(e.target.value) })}/></label>
        <p className="muted small">字色自动适配 · 对比度 {minContrast(readable).toFixed(2)}:1{readable.overlay ? ' · 已加入轻薄阅读底层' : ''}</p>
      </div>
      <div className="sheet-bottom"><button className="subtle" onClick={() => setEditing(false)}>返回色库</button><button className="primary" onClick={saveCustom}>保存并应用</button></div>
    </>}
  </section>;
}
