import { describe, expect, it } from 'vitest';

import { StreamView } from '../../src/orchestrator/tui/stream.js';

describe('StreamView', () => {
  it('keeps only the latest configured lines', () => {
    const stream = new StreamView(3);

    stream.push('one');
    stream.push('two');
    stream.push('three');
    stream.push('four');

    expect(stream.render()).toBe('> two\n> three\n> four');
  });
});
