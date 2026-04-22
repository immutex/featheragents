export function getWorkflowInspectorKey(selectedNodeId: string | null, selectedEdgeId: string | null): string {
  if (selectedNodeId) {
    return `node:${selectedNodeId}`;
  }

  if (selectedEdgeId) {
    return `edge:${selectedEdgeId}`;
  }

  return 'empty';
}

function isEditableElement(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function shouldHandleWorkflowDeleteShortcut(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
}): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return false;
  }

  return !isEditableElement(event.target);
}
