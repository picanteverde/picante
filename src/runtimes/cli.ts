import type { Tool } from '../agent.ts';
import type { FileSystemPlugin, UIPlugin, ConfigPlugin, SessionPlugin } from '../plugins/types.ts';
import { BunFileSystemPlugin } from '../plugins/fs/bun.ts';
import { TUIPlugin } from '../plugins/ui/tui.ts';
import { LocalConfigPlugin } from '../plugins/config/local.ts';
import { LocalSessionPlugin } from '../plugins/session/local.ts';
import { createReadFileTool } from '../tools/read-file.ts';
import { createWriteFileTool } from '../tools/write-file.ts';
import { runShellTool } from '../tools/run-shell.ts';
import { runMonitorTool } from '../tools/run-monitor.ts';
import { listModelsTool } from '../tools/list-models.ts';
import { webSearchTool } from '../plugins/web-search.ts';
import { webBrowseTool } from '../plugins/web-browse.ts';
import { webBrowseHeadlessTool } from '../plugins/web-browse-headless.ts';
import { webDownloadTool } from '../plugins/web-download.ts';

export interface CliRuntime {
  fs: FileSystemPlugin;
  ui: TUIPlugin;
  config: ConfigPlugin;
  session: SessionPlugin;
  tools: Tool[];
}

export function createCliRuntime(): CliRuntime {
  const config = new LocalConfigPlugin();
  const loaded = config.load();
  const fs = new BunFileSystemPlugin();
  const ui = new TUIPlugin();
  const session = new LocalSessionPlugin(loaded.sessionDir);
  const tools: Tool[] = [
    createReadFileTool(fs),
    createWriteFileTool(fs),
    runShellTool,
    runMonitorTool,
    listModelsTool,
    webSearchTool,
    webBrowseTool,
    webBrowseHeadlessTool,
    webDownloadTool,
  ];
  return { fs, ui, config, session, tools };
}
