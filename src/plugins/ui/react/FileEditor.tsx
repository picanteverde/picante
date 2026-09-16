import { useState, useEffect } from 'react';
import type { FileSystemPlugin } from '../../types.ts';

interface Props {
  fs: FileSystemPlugin;
  path: string | null;
  onClose?: () => void;
}

export function FileEditor({ fs, path, onClose }: Props) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    setError(null);
    fs.read(path)
      .then(text => { setContent(text); setLoading(false); })
      .catch(e => { setError((e as Error).message); setLoading(false); });
  }, [path, fs]);

  const save = async () => {
    if (!path) return;
    setSaving(true);
    try {
      await fs.write(path, content);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!path) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0e0e0e' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderBottom: '1px solid #222', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.82rem', color: '#8b949e', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{path}</span>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: '0.25rem 0.75rem', background: saved ? '#2d6a2d' : '#e85c2d', border: 'none', borderRadius: '5px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            {saved ? 'Saved ✓' : saving ? '…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '0.25rem 0.5rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: '5px', color: '#8b949e', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      </div>
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>Loading…</div>
      ) : error ? (
        <div style={{ flex: 1, padding: '1rem', color: '#f87171', fontSize: '0.85rem' }}>{error}</div>
      ) : (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            padding: '0.75rem',
            background: '#0e0e0e',
            color: '#f0ece6',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
            fontSize: '0.85rem',
            lineHeight: 1.6,
            tabSize: 2,
          }}
        />
      )}
    </div>
  );
}
