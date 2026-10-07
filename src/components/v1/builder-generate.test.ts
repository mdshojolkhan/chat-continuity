import { describe, expect, it } from 'vitest';
import { classifyGenerate } from './builder-panel';

describe('classifyGenerate', () => {
  it('counts completed file writes as saved', () => {
    expect(classifyGenerate([{ toolId: 'file_write', status: 'completed' }]).written).toBe(1);
  });
  it('text-only reply saves nothing', () => {
    expect(classifyGenerate([]).written).toBe(0);
  });
  it('reports the real storage error', () => {
    const r = classifyGenerate([{ toolId: 'file_write', status: 'failed', error: 'Storage down' }]);
    expect(r.written).toBe(0);
    expect(r.writeErrors).toEqual(['Storage down']);
  });
});
