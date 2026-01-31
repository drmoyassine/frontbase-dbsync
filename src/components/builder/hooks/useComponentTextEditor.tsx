import React from 'react';
import { useBuilderStore } from '@/stores/builder';
import { InlineTextEditor } from '../InlineTextEditor';
import { cn } from '@/lib/utils';

export const useComponentTextEditor = (componentId: string | undefined) => {
    const { editingComponentId, setEditingComponentId, updateComponentText, isPreviewMode } = useBuilderStore();

    const handleTextEdit = (textProperty: string, text: string) => {
        if (componentId) {
            updateComponentText(componentId, textProperty, text);
        }
    };

    const handleTextEditEnd = () => {
        setEditingComponentId(null);
    };

    const isEditing = editingComponentId === componentId;

    const createEditableText = (text: string, textProperty: string, className: string, style: React.CSSProperties = {}) => {
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
                    !isPreviewMode && 'cursor-text hover:bg-accent/20 rounded-sm transition-colors duration-200'
                )}
                style={style}
                onClick={(e) => {
                    if (!isPreviewMode && componentId) {
                        e.stopPropagation();
                        setEditingComponentId(componentId);
                    }
                }}
            >
                {text}
            </span>
        );
    };

    return { createEditableText };
};
