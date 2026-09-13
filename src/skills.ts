import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function loadSkills(skillDirs: string[]): string {
  const sections: string[] = [];
  for (const dir of skillDirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(dir, file), 'utf8').trim();
      if (content) sections.push(`## Skill: ${file.replace(/\.md$/, '')}\n\n${content}`);
    }
  }
  return sections.length ? '\n\n# Skills\n\n' + sections.join('\n\n---\n\n') : '';
}
