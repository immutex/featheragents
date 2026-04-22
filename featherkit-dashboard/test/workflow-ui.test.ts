import { describe, expect, it } from 'vitest';

import { getWorkflowInspectorKey, shouldHandleWorkflowDeleteShortcut } from '@/lib/workflow-ui';

describe('workflow ui helpers', () => {
  it('builds distinct inspector keys for nodes, edges, and empty state', () => {
    expect(getWorkflowInspectorKey('frame', null)).toBe('node:frame');
    expect(getWorkflowInspectorKey(null, 'workflow-frame-build-pass')).toBe('edge:workflow-frame-build-pass');
    expect(getWorkflowInspectorKey(null, null)).toBe('empty');
  });

  it('handles delete shortcuts outside editable fields only', () => {
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const button = document.createElement('button');

    expect(shouldHandleWorkflowDeleteShortcut({ key: 'Delete', target: wrapper })).toBe(true);
    expect(shouldHandleWorkflowDeleteShortcut({ key: 'Backspace', target: button })).toBe(true);

    expect(shouldHandleWorkflowDeleteShortcut({ key: 'Delete', target: input })).toBe(false);
    expect(shouldHandleWorkflowDeleteShortcut({ key: 'Backspace', target: textarea })).toBe(false);
    expect(shouldHandleWorkflowDeleteShortcut({ key: 'Delete', target: select })).toBe(false);
    expect(shouldHandleWorkflowDeleteShortcut({ key: 'Delete', target: button, metaKey: true })).toBe(false);
    expect(shouldHandleWorkflowDeleteShortcut({ key: 'Enter', target: wrapper })).toBe(false);
  });
});
