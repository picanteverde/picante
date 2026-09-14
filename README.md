# picante

A terminal-native AI agent. Ask it anything, give it tools — it gets things done.

**[picanteverde.github.io/picante](https://picanteverde.github.io/picante)**

## Install

```bash
curl -fsSL https://picanteverde.github.io/picante/install.sh | bash
```

Installs a pre-built binary for your platform (macOS/Linux, x64/arm64) to `/usr/local/bin/picante`.

## Configure

Create `~/.picante/config.toml` (global) or `.picante.toml` (project-local):

```toml
LLM_BASE_URL = "https://openrouter.ai/api/v1"
LLM_MODEL    = "google/gemini-flash-1.5"
LLM_API_KEY  = "sk-or-v1-..."
```

Or use environment variables — they take precedence over config files:

```bash
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_MODEL=gpt-4o
export LLM_API_KEY=sk-...
```

## Usage

```bash
# Single prompt
picante "summarise the files in this directory"

# Interactive REPL
picante

# Resume last session
picante --resume

# Resume specific session
picante --resume 2026-09-14-083241

# List sessions
picante --sessions
```

## Providers

List available models from any built-in provider:

```bash
OPENROUTER_API_KEY=sk-... picante providers openrouter --filter free
picante providers list
```

Built-in providers: `openrouter`, `opencode`, `fal`, `nvidia`, `amd`.

## Built-in tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write content to a file |
| `run_shell` | Execute a shell command |
| `run_monitor` | Stream output from a long-running command |
| `web_search` | DuckDuckGo web search |
| `web_browse` | Fetch + parse a URL (no JS) |
| `web_browse_headless` | Headless Chromium, JS enabled (requires `bun add puppeteer`) |
| `web_download` | Download a file from a URL to disk |
| `list_models` | List models from a provider |

## Skills

Drop `.md` files into `~/.picante/skills/` or `./.picante/skills/` to extend the system prompt with domain knowledge.

## Sessions

Conversations persist to `~/.picante/sessions/`. Use `--resume` to continue any session.

## Development

```bash
bun install
bun run dev          # watch mode
bun run build        # compile binaries for all platforms → dist/
```

Requires [Bun](https://bun.sh) v1.0+.
