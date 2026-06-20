import React from 'react';
import { useBuilderStore } from '@/stores/builder';
import { InlineTextEditor } from '../InlineTextEditor';
import { cn } from '@/lib/utils';

export const useComponentTextEditor = (componentId: string | undefined) => {
    const { editingTextNode, setEditingTextNode, updateComponentText, isPreviewMode } = useBuilderStore();

    const handleTextEdit = (textProperty: string, text: string) => {
        if (componentId) {
            updateComponentText(componentId, textProperty, text);
        }
    };

    const handleTextEditEnd = () => {
        setEditingTextNode(null);
    };

    const createEditableText = (
        text: string,
        textProperty: string,
        className: string,
        style: React.CSSProperties = {},
        /**
         * Optional pre-resolved display text (e.g. Liquid preview). When provided,
         * the non-editing display shows this; editing still edits the raw `text`
         * (the template). When omitted, `text` is shown directly.
         */
        displayText?: string,
        /** Optional Liquid render error — surfaces a non-blocking red underline. */
        error?: string | null,
    ) => {
        const isEditing = editingTextNode?.componentId === componentId && editingTextNode?.property === textProperty;

        if (isEditing) {
            return (
                // Wrapper with position:relative for the hidden measuring span inside InlineTextEditor
                <span className="inline-block" style={{ position: 'relative' }}>
                    <InlineTextEditor
                        value={text}
                        onChange={(newText) => handleTextEdit(textProperty, newText)}
                        onSave={handleTextEditEnd}
                        onCancel={handleTextEditEnd}
                        className={className}
                        style={style}
                    />
                </span>
            );
        }

        return (
            <span
                className={cn(
                    className,
                    !isPreviewMode && 'cursor-text hover:bg-accent/20 rounded-sm transition-colors duration-200',
                    error && 'underline decoration-red-500 decoration-wavy underline-offset-2'
                )}
                style={style}
                title={error || undefined}
                onClick={(e) => {
                    if (!isPreviewMode && componentId) {
                        e.stopPropagation();
                        setEditingTextNode({ componentId, property: textProperty });
                    }
                }}
                onPointerDown={(e) => {
                    if (!isPreviewMode && componentId) {
                        e.stopPropagation();
                    }
                }}
                onMouseDown={(e) => {
                    if (!isPreviewMode && componentId) {
                        e.stopPropagation();
                    }
                }}
            >
                {displayText ?? text}
            </span>
        );
    };

    return { createEditableText };
};
