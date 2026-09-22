import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadSkills } from './skills.ts';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'picante-skills-')); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('loadSkills', () => {
  it('returns an empty string when no dirs exist', () => {
    expect(loadSkills([join(tmp, 'a'), join(tmp, 'b')])).toBe('');
  });

  it('returns an empty string when dirs exist but hold no .md files', () => {
    writeFileSync(join(tmp, 'readme.txt'), 'not a skill');
    expect(loadSkills([tmp])).toBe('');
  });

  it('wraps each .md file as a "## Skill:" section under a "# Skills" header', () => {
    writeFileSync(join(tmp, 'deploy.md'), '  Run the deploy.  \n');
    const out = loadSkills([tmp]);
    expect(out.startsWith('\n\n# Skills\n\n')).toBe(true);
    expect(out).toContain('## Skill: deploy\n\nRun the deploy.');
  });

  it('sorts files alphabetically and separates sections with ---', () => {
    writeFileSync(join(tmp, 'b.md'), 'B');
    writeFileSync(join(tmp, 'a.md'), 'A');
    const out = loadSkills([tmp]);
    expect(out.indexOf('## Skill: a')).toBeLessThan(out.indexOf('## Skill: b'));
    expect(out).toContain('\n\n---\n\n');
  });

  it('skips empty files and non-.md files', () => {
    writeFileSync(join(tmp, 'empty.md'), '   \n');
    writeFileSync(join(tmp, 'notes.txt'), 'ignored');
    writeFileSync(join(tmp, 'real.md'), 'content');
    const out = loadSkills([tmp]);
    expect(out).not.toContain('empty');
    expect(out).not.toContain('notes');
    expect(out).toContain('## Skill: real');
  });

  it('merges skills from multiple directories in order, skipping missing ones', () => {
    const d1 = join(tmp, 'one'); const d2 = join(tmp, 'two');
    mkdirSync(d1); mkdirSync(d2);
    writeFileSync(join(d1, 'z.md'), 'from one');
    writeFileSync(join(d2, 'a.md'), 'from two');
    const out = loadSkills([d1, join(tmp, 'missing'), d2]);
    expect(out.indexOf('from one')).toBeLessThan(out.indexOf('from two'));
  });
});
