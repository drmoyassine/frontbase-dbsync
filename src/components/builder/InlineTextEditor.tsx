import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Variable picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    // Focus and select all text when editor mounts
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop propagation to prevent parent components from handling the event
    e.stopPropagation();

    // Don't handle Enter/Escape when picker is open
    if (showPicker) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowPicker(false);
        return;
      }
      // Let picker handle arrow keys and enter
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) {
        return;
      }
    }

    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Enter' && multiline && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    const pos = target.selectionStart || 0;
    setCursorPosition(pos);

    const textBeforeCursor = text.slice(0, pos);

    // Check for @ trigger
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const lastSpace = textBeforeCursor.lastIndexOf(' ');
    const lastNewline = textBeforeCursor.lastIndexOf('\n');
    const lastBoundary = Math.max(lastSpace, lastNewline);

    if (atIndex !== -1 && atIndex > lastBoundary) {
      setSearchTerm(textBeforeCursor.slice(atIndex + 1));
      setShowPicker(true);
      updatePickerPosition(target);
      return;
    }

    setShowPicker(false);
  }, [text]);

  const getCaretCoordinates = (element: HTMLInputElement | HTMLTextAreaElement, position: number) => {
    // Create a mirror div to measure text
    const div = document.createElement('div');
    const computed = window.getComputedStyle(element);

    // Copy styles to mirror
    const properties = [
      'fontSize', 'fontFamily', 'fontWeight', 'letterSpacing', 'lineHeight',
      'padding', 'border', 'boxSizing', 'whiteSpace', 'wordWrap'
    ];

    properties.forEach(prop => {
      div.style[prop as any] = computed[prop as any];
    });

    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';

    // Get text before cursor
    const textBeforeCursor = element.value.substring(0, position);
    div.textContent = textBeforeCursor;

    // Add marker span at cursor position
    const marker = document.createElement('span');
    marker.textContent = '|';
    div.appendChild(marker);

    document.body.appendChild(div);

    // Get marker position relative to the div
    const markerRect = marker.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    // Calculate coordinates
    const x = elementRect.left + (markerRect.left - divRect.left);
    const y = elementRect.top + (markerRect.top - divRect.top);

    document.body.removeChild(div);

    return { x, y, height: markerRect.height };
  };

  const updatePickerPosition = (target: HTMLElement) => {
    const inputElement = target as HTMLInputElement | HTMLTextAreaElement;
    const cursorPos = inputElement.selectionStart || 0;

    const coords = getCaretCoordinates(inputElement, cursorPos);

    setPickerPosition({
      top: coords.y + coords.height + 4, // 4px below cursor
      left: coords.x,
    });
  };

  const handleSelect = useCallback((insertValue: string) => {
    const textBeforeCursor = text.slice(0, cursorPosition);
    const textAfterCursor = text.slice(cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const newText = textBeforeCursor.slice(0, atIndex) + insertValue + textAfterCursor;
    setText(newText);
    onChange(newText);
    setShowPicker(false);

    // Focus back on input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [text, cursorPosition, onChange]);

  const handleBlur = () => {
    // Delay to allow picker click
    setTimeout(() => {
      if (!showPicker) {
        handleSave();
      }
    }, 150);
  };

  const handleSave = () => {
    onChange(text);
    onSave();
  };

  const handleCancel = () => {
    setText(value); // Reset to original value
    onCancel();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Also update the parent immediately for sync
    onChange(e.target.value);
  };

  const baseClasses = cn(
    'border-none outline-none bg-transparent resize-none',
    'focus:ring-2 focus:ring-primary/50 focus:ring-offset-1 rounded-sm',
    className
  );

  const inputElement = multiline ? (
    <textarea
      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
      value={text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleBlur}
      className={baseClasses}
      style={{
        ...style,
        minHeight: style.minHeight || 'auto',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        lineHeight: 'inherit',
        color: 'inherit',
      }}
      placeholder={placeholder}
      rows={1}
    />
  ) : (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleBlur}
      className={baseClasses}
      style={{
        ...style,
        fontFamily: 'inherit',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        lineHeight: 'inherit',
        color: 'inherit',
        width: '100%',
      }}
      placeholder={placeholder}
    />
  );

  return (
    <>
      {inputElement}
      {showPicker && (
        <VariablePicker
          searchTerm={searchTerm}
          position={pickerPosition}
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
};