import { useEffect } from 'react';
import { useBuilderStore } from '@/stores/builder';

interface KeyboardShortcutsOptions {
    onSave?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
}

export const useKeyboardShortcuts = (options: KeyboardShortcutsOptions = {}) => {
    const {
        selectedComponentId,
        removeComponent,
        duplicateComponent,
        copyComponent,
        pasteComponent,
        copiedComponent,
        isPreviewMode,
    } = useBuilderStore();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't trigger shortcuts in preview mode or when typing in inputs
            if (isPreviewMode) return;

            const target = event.target as HTMLElement;
            const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
                target.contentEditable === 'true';

            // Allow some shortcuts even when typing
            const isModifierKey = event.ctrlKey || event.metaKey;

            // Delete - Del or Backspace (only when not typing)
            if ((event.key === 'Delete' || event.key === 'Backspace') && !isTyping && selectedComponentId) {
                event.preventDefault();
                removeComponent(selectedComponentId);
                return;
            }

            // Only handle modifier shortcuts from here
            if (!isModifierKey) return;

            // Ctrl/Cmd + S - Save
            if (event.key === 's' || event.key === 'S') {
                event.preventDefault();
                options.onSave?.();
                return;
            }

            // Ctrl/Cmd + D - Duplicate (only when not typing)
            if ((event.key === 'd' || event.key === 'D') && !isTyping && selectedComponentId) {
                event.preventDefault();
                duplicateComponent(selectedComponentId);
                return;
            }

            // Ctrl/Cmd + C - Copy (only when not typing)
            if ((event.key === 'c' || event.key === 'C') && !isTyping && selectedComponentId) {
                event.preventDefault();
                copyComponent(selectedComponentId);
                return;
            }

            // Ctrl/Cmd + V - Paste (only when not typing)
            if ((event.key === 'v' || event.key === 'V') && !isTyping && copiedComponent) {
                event.preventDefault();
                pasteComponent();
                return;
            }

            // Ctrl/Cmd + Z - Undo
            if (event.key === 'z' || event.key === 'Z') {
                if (event.shiftKey) {
                    // Ctrl/Cmd + Shift + Z - Redo
                    event.preventDefault();
                    options.onRedo?.();
                } else {
                    // Ctrl/Cmd + Z - Undo
                    event.preventDefault();
                    options.onUndo?.();
                }
                return;
            }

            // Ctrl/Cmd + Y - Redo (alternative)
            if (event.key === 'y' || event.key === 'Y') {
                event.preventDefault();
                options.onRedo?.();
                return;
            }

            // Ctrl/Cmd + A - Select All (prevent default browser behavior in builder)
            if ((event.key === 'a' || event.key === 'A') && !isTyping) {
                event.preventDefault();
                // Could implement select all components here if needed
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        selectedComponentId,
        removeComponent,
        duplicateComponent,
        copyComponent,
        pasteComponent,
        copiedComponent,
        isPreviewMode,
        options
    ]);
};
