import { useEffect, useRef, useState } from 'react';
import type { AICall } from './shared/types';
import { AI_MODEL_LABEL, type AICredentialStatus } from './shared/ai';
import { Icon } from './Icons';
import './ai.css';

function unwrap<T>(reply: AICall<T>): T {
  if (!reply.ok) throw new Error(reply.error.message);
  return reply.value;
}
export function AIOrb({ onClick, busy = false }: { onClick: () => void; busy?: boolean }) {
  return <button className={`ai-orb-button ${busy ? 'working' : ''}`} onClick={onClick}
    aria-label={busy ? '取消 AI 整理' : 'AI 一键整理备忘录'} aria-busy={busy}
    title={busy ? '正在整理，再点一下取消' : '点击一下，自动整理当前备忘录'}>
    <span className="ai-glass-orb" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 5 1.9 5.1L19 12l-5.1 1.9L12 19l-1.9-5.1L5 12l5.1-1.9L12 5Z"/><path d="m19 3 .7 2.3L22 6l-2.3.7L19 9l-.7-2.3L16 6l2.3-.7L19 3Z"/></svg></span>
    <span className="ai-orb-label">{busy ? '整理中' : 'AI'}</span>
  </button>;
}

/** Configuration only; the orb performs the single organize action in place. */
export function AIKeySettings({ onClose, onSaved, organizeAfterSave = false, initialError = '' }: {
  onClose: () => void;
  onSaved: () => void;
  organizeAfterSave?: boolean;
  initialError?: string;
}) {
  const [credential, setCredential] = useState<AICredentialStatus | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(initialError);
  const alive = useRef(true);
  const refreshSequence = useRef(0);
  const refresh = async (clearError = false) => {
    const sequence = ++refreshSequence.current;
    setLoading(true); if (clearError) setError('');
    try {
      const value = unwrap(await window.mist.aiStatus());
      if (alive.current && sequence === refreshSequence.current) setCredential(value);
    } catch (e) {
      if (alive.current && sequence === refreshSequence.current) setError(e instanceof Error ? e.message : '安全存储暂不可用，请重试。');
    } finally {
      if (alive.current && sequence === refreshSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; refreshSequence.current++; };
  }, []);
  const save = async () => {
    if (busy || loading || !credential?.canStore || !key.trim()) return;
    const input = key; setKey(''); setBusy(true); setError('');
    try {
      unwrap(await window.mist.aiSaveKey(input));
      if (alive.current) onSaved();
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '密钥保存失败，请重试。'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <section className="ai-key-settings" aria-label="DeepSeek 密钥设置">
    <div className="ai-key-heading"><div><strong>{organizeAfterSave ? '连接后，即可一键整理' : 'AI 密钥设置'}</strong><p>{AI_MODEL_LABEL}</p></div><button className="icon-button" aria-label="关闭密钥设置" onClick={onClose}><Icon name="close" size={15}/></button></div>
    <label htmlFor="deepseek-key">DeepSeek API 密钥</label>
    <input id="deepseek-key" type="password" value={key} onChange={e => setKey(e.target.value)}
      placeholder={credential?.configured ? '已保存，填写可替换' : '仅在此处填写密钥'} autoComplete="new-password" spellCheck={false}
      maxLength={512} disabled={busy || loading || !credential?.canStore}
      onKeyDown={e => { if (e.key === 'Enter' && key.trim() && !busy) { e.preventDefault(); void save(); } }}/>
    <p className="ai-key-help">密钥在本机加密保存。点击小球时，仅将当前便签交给 DeepSeek 整理，完成后自动应用，可撤销。</p>
    {loading && <p className="ai-key-help" role="status">正在连接系统安全存储…</p>}
    {!loading && (!credential || !credential.canStore) && <p className="ai-key-error">系统安全存储暂不可用。<button className="ai-text-button" disabled={busy} onClick={() => void refresh(true)}>重试安全存储</button></p>}
    {error && <p className="ai-key-error" role="alert">{error}</p>}
    <div className="ai-key-actions"><button className="primary" disabled={!key.trim() || busy || loading || !credential?.canStore} onClick={() => void save()}>{busy ? '保存中…' : organizeAfterSave ? '保存并整理' : '保存密钥'}</button>
      {credential?.configured && <button className="ai-text-button" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { const value = unwrap(await window.mist.aiDeleteKey()); if (alive.current) setCredential(value); }
        catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '删除密钥失败。'); }
        finally { if (alive.current) setBusy(false); }
      }}>删除本机密钥</button>}
    </div>
  </section>;
}
