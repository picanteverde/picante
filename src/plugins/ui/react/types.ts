export type AgentUIEvent =
  | { type: 'text'; text: string; role: 'user' | 'assistant' }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'error'; message: string }
  | { type: 'session_start'; sessionId: string };
