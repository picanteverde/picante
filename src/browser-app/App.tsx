import { useState, useRef, useCallback } from 'react';
import { createLocalStorageBrowserRuntime } from '../runtimes/browser.ts';
import { ReactUIPlugin } from '../plugins/ui/react/ReactUIPlugin.ts';
import { AgentChat } from '../plugins/ui/react/AgentChat.tsx';
import { ConfigPanel } from '../plugins/ui/react/ConfigPanel.tsx';
import { FileExplorer } from '../plugins/ui/react/FileExplorer.tsx';
import { FileEditor } from '../plugins/ui/react/FileEditor.tsx';
import { runAgent } from '../agent.ts';
import { loadSkills } from '../skills.ts';
import { version } from '../../package.json';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const runtime = createLocalStorageBrowserRuntime();
const ui = new ReactUIPlugin();
ui.showHeader('browser', version);

const SYSTEM_PROMPT = `You are picante, an AI agent running in the browser. You can read and write files in the user's selected local folder using the File System Access API. Be concise and helpful.${loadSkills([])}`;

export default function App() {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const historyRef = useRef<ChatCompletionMessageParam[]>([]);

  const send = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || running) return;
    setInput('');
    setRunning(true);
    ui.pushUserMessage(prompt);

    try {
      const cfg = runtime.config.load();
      if (!cfg.apiKey) {
        ui.pushError('No API key configured. Click ⚙ to set up a provider.');
        return;
      }
      historyRef.current.push({ role: 'user', content: prompt });
      const updated = await runAgent(historyRef.current, {
        config: cfg,
        tools: runtime.tools,
        systemPrompt: SYSTEM_PROMPT,
        onStep: (event) => {
          if (event.type === 'text') ui.onText(event.text);
          else if (event.type === 'tool_call') ui.onToolCall(event.name, event.args);
          else if (event.type === 'tool_result') ui.onToolResult(event.name, event.result);
        },
      });
      historyRef.current = updated;
    } catch (e) {
      ui.pushError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [input, running]);

  const cfg = runtime.config.load();
  const model = cfg.model || 'not configured';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Header */}
      <div style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 1rem', borderBottom: '1px solid #222', gap: '0.75rem', flexShrink: 0 }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#e85c2d', fontSize: '1rem' }}>🌶 picante</span>
        <span style={{ color: '#555', fontSize: '0.8rem' }}>v{version}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '0.8rem', color: '#555', fontFamily: 'monospace' }}>{model}</span>
        <button
          onClick={() => setShowConfig(s => !s)}
          style={{ background: showConfig ? '#e85c2d22' : 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#8b949e', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}
        >⚙</button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar */}
        <div style={{ width: 220, borderRight: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <FileExplorer fs={runtime.fs} onFileClick={setSelectedFile} />
        </div>

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {showConfig ? (
            <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
              <div style={{ maxWidth: 480 }}>
                <div style={{ fontWeight: 600, marginBottom: '1rem', fontSize: '0.95rem' }}>Settings</div>
                <ConfigPanel config={runtime.config} onSave={() => setShowConfig(false)} />
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <AgentChat ui={ui} />
              </div>
              <div style={{ borderTop: '1px solid #1e1e1e', padding: '0.75rem', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                  disabled={running}
                  rows={2}
                  style={{
                    flex: 1, resize: 'none', background: '#111', border: '1px solid #2b2b2b',
                    borderRadius: '8px', color: '#f0ece6', padding: '0.6rem 0.8rem',
                    fontSize: '0.92rem', outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={send}
                  disabled={running || !input.trim()}
                  style={{
                    padding: '0 1.25rem', background: running ? '#333' : '#e85c2d',
                    border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600,
                    cursor: running ? 'not-allowed' : 'pointer', fontSize: '0.92rem',
                    flexShrink: 0,
                  }}
                >
                  {running ? '…' : '↑'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* File editor panel */}
        {selectedFile && (
          <div style={{ width: 380, borderLeft: '1px solid #1e1e1e', flexShrink: 0 }}>
            <FileEditor fs={runtime.fs} path={selectedFile} onClose={() => setSelectedFile(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
