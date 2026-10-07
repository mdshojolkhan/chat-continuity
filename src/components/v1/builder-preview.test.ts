import { describe, expect, it } from 'vitest';
import { buildPreview } from './builder-panel';

describe('builder preview', () => {
  it('previews a project whose entry is public/index.html with nested css/js', () => {
    const html = buildPreview({
      'public/index.html': '<link rel="stylesheet" href="css/style.css"><script src="js/app.js"></script>',
      'public/css/style.css': 'body{color:red}',
      'public/js/app.js': 'console.log(1)',
    });
    expect(html).toBe('<style>body{color:red}</style><script>console.log(1)</script>');
  });
  it('still previews legacy site/ projects first', () => {
    expect(buildPreview({ 'site/index.html': 'A', 'index.html': 'B' })).toBe('A');
  });
  it('returns null when the project has no html entry', () => {
    expect(buildPreview({ 'src/server.js': 'x' })).toBeNull();
  });
});
