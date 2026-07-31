/**
 * iframeInlineEdit — contentEditable text editing inside the iframe document.
 *
 * On double-click of a text-bearing component root (Text/Heading/Button/Badge/
 * Link), we make the root element contentEditable in-place and commit its
 * textContent on blur / Enter via `store.updateComponentText(id, 'text', ...)`.
 * This mirrors the legacy DraggableComponent.handleDoubleClick →
 * setEditingTextNode path, but edits the eSSR-rendered text node directly so
 * the canvas shows exactly what the published page will show. The React
 * InlineTextEditor/useComponentTextEditor remain available for any non-canvas
 * consumers but are no longer exercised by the canvas.
 */

export interface InlineEditCommit {
    componentId: string;
    /** Always 'text' — matches the legacy single-property inline edit. */
    property: string;
    text: string;
}

/**
 * Begin editing `root` (an HTMLElement inside the iframe document).
 *
 * @returns a cleanup function that tears down listeners and clears the
 *          contentEditable attribute (idempotent — safe to call twice).
 */
export function startInlineEdit(
    root: HTMLElement,
    componentId: string,
    onCommit: (commit: InlineEditCommit) => void,
): () => void {
    const doc = root.ownerDocument;
    if (!doc) return () => {};

    root.setAttribute('contenteditable', 'true');
    root.focus();

    // Place the caret at the end of the existing text.
    const sel = doc.getSelection();
    if (sel) {
        const range = doc.createRange();
        range.selectNodeContents(root);
        range.collapse(false); // move end → caret at end
        sel.removeAllRanges();
        sel.addRange(range);
    }

    let committed = false;

    const commit = () => {
        if (committed) return;
        committed = true;
        const text = root.textContent ?? '';
        cleanup();
        onCommit({ componentId, property: 'text', text });
    };

    const cancel = () => {
        if (committed) return;
        committed = true;
        cleanup();
    };

    const onKey = (e: KeyboardEvent) => {
        // Stop the iframe keydown from bubbling to parent shortcuts (Delete /
        // Backspace would otherwise delete the component while typing).
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    };

    const onBlur = () => commit();

    const onStopPropagation = (e: Event) => e.stopPropagation();

    root.addEventListener('keydown', onKey);
    root.addEventListener('blur', onBlur);
    // Prevent pointer interactions inside the editor from triggering selection.
    root.addEventListener('pointerdown', onStopPropagation, true);
    root.addEventListener('mousedown', onStopPropagation, true);

    function cleanup() {
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('blur', onBlur);
        root.removeEventListener('pointerdown', onStopPropagation, true);
        root.removeEventListener('mousedown', onStopPropagation, true);
        root.removeAttribute('contenteditable');
    }

    return cleanup;
}
