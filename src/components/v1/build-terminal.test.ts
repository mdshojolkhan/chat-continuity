import { describe, expect, it } from 'vitest';
import { validateImplementation, wantsDocumentation } from './build-terminal';

describe('build terminal implementation rules', () => {
  it('treats "Do not create documentation" as an implementation request', () => {
    expect(wantsDocumentation('Create a chat app. Do not create documentation.')).toBe(false);
  });
  it('rejects a build that only writes a single HTML file', () => {
    expect(validateImplementation(new Map([['index.html', '<h1>Chat</h1>']]), false).length).toBeGreaterThan(0);
  });
  it('rejects unrequested Markdown docs', () => {
    const files = new Map([['server/index.js', 'x'], ['ARCHITECTURE.md', '# x']]);
    expect(validateImplementation(files, false)).toHaveLength(1);
  });
  it('accepts separate frontend and backend source files', () => {
    const files = new Map([['package.json', '{}'], ['server/index.js', 'x'], ['src/main.tsx', 'x']]);
    expect(validateImplementation(files, false)).toEqual([]);
  });
});
