import { useSyncExternalStore, useEffect, useRef } from 'react';
import type { ReactUIPlugin } from './ReactUIPlugin.ts';
import type { AgentUIEvent } from './types.ts';

function ToolCallBadge({ event }: { event: AgentUIEvent & { type: 'tool_call' } }) {
  const argsStr = JSON.stringify(event.args);
  const preview = argsStr.length > 80 ? argsStr.slice(0, 77) + '…' : argsStr;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', fontSize: '0.8rem', color: '#8b949e', fontFamily: 'monospace', padding: '2px 0' }}>
      <span style={{ color: '#e85c2d' }}>⚙</span>
      <span>{event.name}({preview})</span>
    </div>
  );
}

function ToolResultBadge({ event }: { event: AgentUIEvent & { type: 'tool_result' } }) {
  const preview = (event.result.split('\n')[0] ?? '').slice(0, 80);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', fontSize: '0.8rem', color: '#6e7681', fontFamily: 'monospace', padding: '2px 0' }}>
      <span>↳</span>
      <span>{preview}{event.result.length > 80 ? '…' : ''}</span>
    </div>
  );
}

function Message({ event }: { event: AgentUIEvent }) {
  if (event.type === 'session_start') {
    return (
      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#555', padding: '0.5rem 0' }}>
        — session {event.sessionId} —
      </div>
    );
  }
  if (event.type === 'tool_call') return <ToolCallBadge event={event} />;
  if (event.type === 'tool_result') return <ToolResultBadge event={event} />;
  if (event.type === 'error') {
    return (
      <div style={{ padding: '0.6rem 0.9rem', borderRadius: '8px', background: '#2d1b1b', border: '1px solid #5a1e1e', color: '#f87171', fontSize: '0.9rem' }}>
        {event.message}
      </div>
    );
  }

  // text message
  const isUser = event.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '80%',
        padding: '0.65rem 0.95rem',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser ? '#e85c2d' : '#1e1e1e',
        color: isUser ? '#fff' : '#f0ece6',
        fontSize: '0.92rem',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {event.text}
      </div>
    </div>
  );
}

export function AgentChat({ ui }: { ui: ReactUIPlugin }) {
  const events = useSyncExternalStore(
    cb => ui.subscribe(cb),
    () => ui.getSnapshot(),
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
      {events.map((event, i) => <Message key={i} event={event} />)}
      <div ref={bottomRef} />
    </div>
  );
}
