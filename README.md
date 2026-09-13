# picante

Agent CLI powered by any OpenAI-compatible LLM.

## Setup

```bash
bun install

# Configure via env vars or .picante.toml
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_MODEL=gpt-4o
export LLM_API_KEY=sk-...
```

Or create `.picante.toml` in your project or `~/.picante/config.toml`:

```toml
LLM_BASE_URL = "https://api.openai.com/v1"
LLM_MODEL = "gpt-4o"
LLM_API_KEY = "sk-..."
```

## Usage

```bash
# Single-shot
bun src/index.ts "summarise the files in this directory"

# Interactive REPL
bun src/index.ts

# Resume last session
bun src/index.ts --resume

# Resume specific session
bun src/index.ts --resume 2026-08-30T05-00-00

# List sessions
bun src/index.ts --sessions
```

## Built-in tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with optional line range |
| `write_file` | Write content to a file |
| `run_shell` | Execute a shell command |
| `run_monitor` | Stream output from a long-running command |
| `web_search` | DuckDuckGo web search |
| `web_browse` | Fetch + parse a URL (no JS) |
| `web_browse_headless` | Headless Chromium, JS enabled (requires `bun add puppeteer`) |
| `web_download` | Download a file from a URL to disk |

## Skills

Drop `.md` files into `~/.picante/skills/` or `./.picante/skills/` — loaded as additional system prompt context (same format as Claude Code skills).

## Sessions

Persisted to `~/.picante/sessions/<id>.json`. Use `--resume` to continue a conversation.
