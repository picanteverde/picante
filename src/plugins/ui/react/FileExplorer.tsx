import { useState, useCallback } from 'react';
import type { BrowserFileSystemPlugin } from '../../fs/browser.ts';

interface TreeNode {
  name: string;
  isDir: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

function FileIcon({ isDir, name }: { isDir: boolean; name: string }) {
  if (isDir) return <span>📂</span>;
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return <span>🔷</span>;
  if (name.endsWith('.js') || name.endsWith('.jsx')) return <span>🟨</span>;
  if (name.endsWith('.json')) return <span>📋</span>;
  if (name.endsWith('.md')) return <span>📝</span>;
  if (name.endsWith('.html') || name.endsWith('.css')) return <span>🎨</span>;
  return <span>📄</span>;
}

function TreeItem({
  node,
  path,
  depth,
  fs,
  onFileClick,
}: {
  node: TreeNode;
  path: string;
  depth: number;
  fs: BrowserFileSystemPlugin;
  onFileClick?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [children, setChildren] = useState<TreeNode[]>(node.children ?? []);
  const [loaded, setLoaded] = useState(node.loaded ?? false);

  const toggle = useCallback(async () => {
    if (!node.isDir) { onFileClick?.(path); return; }
    if (!expanded && !loaded) {
      try {
        const entries = await fs.list(path);
        const nodes: TreeNode[] = entries.map(name => ({
          name: name.endsWith('/') ? name.slice(0, -1) : name,
          isDir: name.endsWith('/'),
        }));
        setChildren(nodes);
        setLoaded(true);
      } catch { /* ignore */ }
    }
    setExpanded(e => !e);
  }, [node.isDir, expanded, loaded, path, fs, onFileClick]);

  return (
    <div>
      <div
        onClick={toggle}
        title={path}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.2rem 0.5rem',
          paddingLeft: `${0.5 + depth * 1}rem`,
          cursor: 'pointer',
          borderRadius: '4px',
          fontSize: '0.85rem',
          color: '#c9d1d9',
          userSelect: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1e1e1e')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {node.isDir && <span style={{ fontSize: '0.7rem', color: '#555' }}>{expanded ? '▾' : '▸'}</span>}
        <FileIcon isDir={node.isDir} name={node.name} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      </div>
      {node.isDir && expanded && children.map(child => (
        <TreeItem
          key={child.name}
          node={child}
          path={path ? `${path}/${child.name}` : child.name}
          depth={depth + 1}
          fs={fs}
          onFileClick={onFileClick}
        />
      ))}
    </div>
  );
}

interface Props {
  fs: BrowserFileSystemPlugin;
  onFileClick?: (path: string) => void;
}

export function FileExplorer({ fs, onFileClick }: Props) {
  const [rootChildren, setRootChildren] = useState<TreeNode[]>([]);
  const [dirName, setDirName] = useState<string | null>(fs.directoryName());

  const openFolder = async () => {
    try {
      await fs.open();
      const name = fs.directoryName();
      setDirName(name);
      const entries = await fs.list('.');
      setRootChildren(entries.map(e => ({
        name: e.endsWith('/') ? e.slice(0, -1) : e,
        isDir: e.endsWith('/'),
      })));
    } catch { /* user cancelled */ }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dirName ?? 'No folder open'}
        </span>
        <button
          onClick={openFolder}
          style={{ padding: '0.25rem 0.6rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: '5px', color: '#e85c2d', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Open…
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.4rem 0' }}>
        {rootChildren.length === 0 && dirName === null && (
          <div style={{ padding: '1rem', fontSize: '0.82rem', color: '#555', textAlign: 'center' }}>
            Click "Open…" to pick a folder
          </div>
        )}
        {rootChildren.map(child => (
          <TreeItem
            key={child.name}
            node={child}
            path={child.name}
            depth={0}
            fs={fs}
            onFileClick={onFileClick}
          />
        ))}
      </div>
    </div>
  );
}
