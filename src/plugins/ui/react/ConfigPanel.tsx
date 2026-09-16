import { useState } from 'react';
import type { ConfigPlugin } from '../../types.ts';

const PROVIDERS: Record<string, string> = {
  opencode:    'https://opencode.ai/zen/go/v1',
  openrouter:  'https://openrouter.ai/api/v1',
  fal:         'https://fal.run/fal-ai',
  nvidia:      'https://integrate.api.nvidia.com/v1',
  amd:         'https://api.amd.com/v1',
  openai:      'https://api.openai.com/v1',
};

interface Props {
  config: ConfigPlugin;
  onSave?: () => void;
}

export function ConfigPanel({ config, onSave }: Props) {
  const cfg = config.load();
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl);
  const [apiKey, setApiKey] = useState(cfg.apiKey);
  const [model, setModel] = useState(cfg.model);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleProviderChange = (name: string) => {
    const url = PROVIDERS[name];
    if (url) setBaseUrl(url);
  };

  const handleSave = () => {
    config.write({ LLM_BASE_URL: baseUrl, LLM_API_KEY: apiKey, LLM_MODEL: model });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSave?.();
  };

  const activeProvider = Object.entries(PROVIDERS).find(([, url]) => url === baseUrl)?.[0] ?? 'custom';

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    background: '#111',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#f0ece6',
    fontSize: '0.9rem',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    color: '#8b949e',
    marginBottom: '0.3rem',
    display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>
      <div>
        <label style={labelStyle}>Provider</label>
        <select value={activeProvider} onChange={e => handleProviderChange(e.target.value)} style={inputStyle}>
          {Object.keys(PROVIDERS).map(p => <option key={p} value={p}>{p}</option>)}
          {activeProvider === 'custom' && <option value="custom">custom</option>}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Base URL</label>
        <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={inputStyle} />
      </div>

      <div>
        <label style={labelStyle}>API Key</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => setShowKey(s => !s)}
            style={{ padding: '0 0.75rem', background: '#222', border: '1px solid #333', borderRadius: '6px', color: '#8b949e', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Model</label>
        <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="glm-5.3-flash" style={inputStyle} />
      </div>

      <button
        onClick={handleSave}
        style={{
          padding: '0.6rem 1.2rem',
          background: saved ? '#2d6a2d' : '#e85c2d',
          border: 'none',
          borderRadius: '6px',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: '0.9rem',
          transition: 'background 0.2s',
        }}
      >
        {saved ? 'Saved ✓' : 'Save'}
      </button>
    </div>
  );
}
