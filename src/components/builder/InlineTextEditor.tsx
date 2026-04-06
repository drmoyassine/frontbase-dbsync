import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Suggestion from '@tiptap/suggestion';
import { cn } from '@/lib/utils';
import { VariablePicker } from './VariablePicker';

interface InlineTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  placeholder?: string;
}

export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
  value,
  onChange,
  onSave,
  onCancel,
  className = '',
  style = {},
  multiline = false,
  placeholder = ''
}) => {
  // Variable picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  
  const insertMentionRangeRef = useRef<{from: number, to: number} | null>(null);
  // Ref-based tracking for onBlur race condition fix
  const isPickerOpenRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isPickerOpenRef.current = showPicker;
  }, [showPicker]);

  const handleSave = useCallback((currentText: string) => {
    onChange(currentText);
    onSave();
  }, [onChange, onSave]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Memoize the VariableSuggestion extension to prevent re-creation on every render.
  // The callbacks read from refs, so the extension instance is stable.
  const VariableSuggestion = useMemo(() => Extension.create({
    name: 'variableSuggestion',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '@',
          startOfLine: false,
          command: () => {
            // Unused since we insert content manually via React state
          },
          items: ({ query }) => {
            setSearchTerm(query);
            return []; // Let VariablePicker handle filtering
          },
          render: () => {
            return {
              onStart: (props) => {
                insertMentionRangeRef.current = props.range;
                isPickerOpenRef.current = true;
                setShowPicker(true);
                if (props.clientRect) {
                  const rect = props.clientRect();
                  if (rect) {
                    setPickerPosition({ top: rect.bottom + 4, left: rect.left });
                  }
                }
              },
              onUpdate: (props) => {
                insertMentionRangeRef.current = props.range;
                setSearchTerm(props.query);
                if (props.clientRect) {
                  const rect = props.clientRect();
                  if (rect) {
                    setPickerPosition({ top: rect.bottom + 4, left: rect.left });
                  }
                }
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  isPickerOpenRef.current = false;
                  setShowPicker(false);
                  return true;
                }
                if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(props.event.key)) {
                  return true; 
                }
                return false;
              },
              onExit: () => {
                setTimeout(() => {
                  isPickerOpenRef.current = false;
                  setShowPicker(false);
                }, 150);
              },
            };
          },
        })
      ];
    }
  }), []); // Stable — never re-created

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        code: false,
        heading: false,
        bulletList: false,
        orderedList: false,
      }),
      VariableSuggestion,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          'border-none outline-none bg-transparent resize-none select-text cursor-text',
          'focus:ring-2 focus:ring-primary/50 rounded-sm w-full h-full',
          className
        ),
        style: `font-family: inherit; font-size: inherit; font-weight: inherit; line-height: inherit; color: inherit; min-height: ${style.minHeight || 'auto'}; width: 100%; min-width: 100%;`
      },
      handleKeyDown: (view, event) => {
        if (isPickerOpenRef.current) {
           return false;
        }

        if (event.key === 'Enter' && !multiline) {
          event.preventDefault();
          handleSave(view.state.doc.textContent);
          return true;
        } else if (event.key === 'Enter' && multiline && !event.shiftKey) {
          event.preventDefault();
          handleSave(view.state.doc.textContent);
          return true;
        } else if (event.key === 'Escape') {
          event.preventDefault();
          handleCancel();
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getText());
    },
    onBlur: () => {
        // Use ref instead of state to avoid race condition.
        // The ref is updated synchronously, so even if blur fires
        // rapidly after a click, the check is reliable.
        setTimeout(() => {
          if (!isPickerOpenRef.current) {
            handleSave(editor?.getText() || '');
          }
        }, 150);
    }
  });

  useEffect(() => {
    if (editor) {
      editor.commands.focus('end');
    }
  }, [editor]);

  const handleSelect = useCallback((insertValue: string) => {
    if (editor && insertMentionRangeRef.current) {
      const { from, to } = insertMentionRangeRef.current;
      editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, insertValue)
        .run();
      
      onChange(editor.getText());
    }
    isPickerOpenRef.current = false;
    setShowPicker(false);
  }, [editor, onChange]);

  return (
    <div 
      onKeyDown={(e) => e.stopPropagation()} 
      onKeyUp={(e) => e.stopPropagation()}
      style={{ display: 'inline-block', width: '100%', ...style }}
    >
      <EditorContent editor={editor} style={{ display: 'inline-block', width: '100%' }} />
      {showPicker && createPortal(
        <VariablePicker
          searchTerm={searchTerm}
          position={pickerPosition}
          onSelect={handleSelect}
          onClose={() => {
            isPickerOpenRef.current = false;
            setShowPicker(false);
          }}
        />,
        document.body
      )}
    </div>
  );
};