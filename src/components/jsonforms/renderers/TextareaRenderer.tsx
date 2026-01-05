/**
 * Textarea Renderer - Rich text editor using Tiptap with optional markdown support.
 */

import React from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, and, isStringControl, optionIs, ControlProps } from '@jsonforms/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Label } from '@/components/ui/label';
import { Toggle } from '@/components/ui/toggle';
import { Bold, Italic, List, ListOrdered, Heading2, Quote, Code } from 'lucide-react';
import { columnToLabel } from '@/lib/schemaToJsonSchema';
import { useFormInteraction } from '../FormInteractionContext';
import { FieldSettingsPopover } from '@/components/builder/form/FieldSettingsPopover';

interface TextareaRendererProps extends ControlProps { }

const TextareaRendererComponent: React.FC<TextareaRendererProps> = ({
    data,
    handleChange,
    path,
    label,
    schema,
    uischema,
    enabled,
    errors,
}) => {
    const isReadOnly = uischema?.options?.readonly ?? false;
    const displayLabel = label || columnToLabel(path.split('.').pop() || '');
    const enableMarkdown = uischema?.options?.markdown ?? true;
    const { onFieldClick, isBuilderMode, fieldOverrides, onFieldOverrideChange } = useFormInteraction();

    const fieldName = path.split('.').pop() || path;
    const fieldSettings = fieldOverrides?.[fieldName] || {};

    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: `Enter ${displayLabel.toLowerCase()}...`,
            }),
        ],
        content: data ?? '',
        editable: enabled && !isReadOnly,
        onUpdate: ({ editor }) => {
            // Get content as HTML or plain text based on markdown setting
            const content = enableMarkdown ? editor.getHTML() : editor.getText();
            handleChange(path, content || undefined);
        },
    });

    // Update editor content when data changes externally
    React.useEffect(() => {
        if (editor && data !== editor.getHTML()) {
            editor.commands.setContent(data ?? '');
        }
    }, [data, editor]);

    if (!editor) {
        return null;
    }

    const content = (
        <div
            className="space-y-2"
            onClick={(e) => {
                if (!isBuilderMode) {
                    e.stopPropagation();
                }
                onFieldClick?.(path);
            }}
        >
            <Label htmlFor={path} className={errors ? 'text-destructive' : ''}>
                {fieldSettings.label || displayLabel}
                {schema?.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {/* Toolbar - only show if markdown enabled and editable */}
            {enableMarkdown && enabled && !isReadOnly && (
                <div className="flex gap-1 p-1 border rounded-t-md bg-muted/50">
                    <Toggle
                        size="sm"
                        pressed={editor.isActive('bold')}
                        onPressedChange={() => editor.chain().focus().toggleBold().run()}
                    >
                        <Bold className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                        size="sm"
                        pressed={editor.isActive('italic')}
                        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
                    >
                        <Italic className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                        size="sm"
                        pressed={editor.isActive('heading', { level: 2 })}
                        onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    >
                        <Heading2 className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                        size="sm"
                        pressed={editor.isActive('bulletList')}
                        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
                    >
                        <List className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                        size="sm"
                        pressed={editor.isActive('orderedList')}
                        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
                    >
                        <ListOrdered className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                        size="sm"
                        pressed={editor.isActive('blockquote')}
                        onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
                    >
                        <Quote className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                        size="sm"
                        pressed={editor.isActive('codeBlock')}
                        onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}
                    >
                        <Code className="h-4 w-4" />
                    </Toggle>
                </div>
            )}

            {/* Editor */}
            <div
                className={`
          min-h-[120px] max-h-[300px] overflow-y-auto
          rounded-md border bg-background px-3 py-2
          prose prose-sm dark:prose-invert max-w-none
          focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2
          ${enableMarkdown && enabled && !isReadOnly ? 'rounded-t-none border-t-0' : ''}
          ${errors ? 'border-destructive' : 'border-input'}
          ${!enabled || isReadOnly ? 'opacity-50' : ''}
        `}
            >
                <EditorContent editor={editor} />
            </div>

            {errors && (
                <p className="text-sm text-destructive">{errors}</p>
            )}

            <style>{`
        .ProseMirror {
          outline: none;
          min-height: 100px;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
        </div>
    );

    if (isBuilderMode && onFieldOverrideChange) {
        return (
            <FieldSettingsPopover
                fieldName={fieldName}
                settings={fieldSettings}
                onSave={(updates) => onFieldOverrideChange(fieldName, updates)}
                componentType="Form"
                isBuilderMode={true}
            >
                {content}
            </FieldSettingsPopover>
        );
    }

    return content;
};

export const TextareaRenderer = withJsonFormsControlProps(TextareaRendererComponent);

// Tester: match when rendererHint is 'textarea'
export const textareaRendererTester = rankWith(
    4,
    and(isStringControl, optionIs('rendererHint', 'textarea'))
);
