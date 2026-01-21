/**
 * Variable Input - Text input with @ mention support
 * 
 * Wraps any text input to add variable autocomplete functionality.
 * Triggers @ mention picker when user types @
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { VariablePicker } from './VariablePicker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface VariableInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    multiline?: boolean;
    showFiltersOnPipe?: boolean;
    /** Optional list of allowed variable groups (e.g., ['visitor', 'system', 'user', 'record']) */
    allowedGroups?: string[];
}

export function VariableInput({
    value,
    onChange,
    placeholder,
    className,
    multiline = false,
    showFiltersOnPipe = true,
    allowedGroups,
}: VariableInputProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const [triggerChar, setTriggerChar] = useState<'@' | '|' | null>(null);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        onChange(newValue);
    }, [onChange]);

    const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;
        const pos = target.selectionStart || 0;
        setCursorPosition(pos);

        const textBeforeCursor = value.slice(0, pos);

        // Check for @ trigger (variable picker)
        const atIndex = textBeforeCursor.lastIndexOf('@');
        const lastSpace = textBeforeCursor.lastIndexOf(' ');
        const lastNewline = textBeforeCursor.lastIndexOf('\n');
        const lastBoundary = Math.max(lastSpace, lastNewline);

        if (atIndex !== -1 && atIndex > lastBoundary) {
            setSearchTerm(textBeforeCursor.slice(atIndex + 1));
            setTriggerChar('@');
            setShowPicker(true);
            updatePickerPosition(target, atIndex);
            return;
        }

        // Check for | trigger (filter picker) - only if showFiltersOnPipe is enabled
        if (showFiltersOnPipe) {
            const pipeIndex = textBeforeCursor.lastIndexOf('|');
            if (pipeIndex !== -1 && pipeIndex > lastBoundary) {
                // Check if we're inside {{ }} - filters only make sense there
                const openBracket = textBeforeCursor.lastIndexOf('{{');
                const closeBracket = textBeforeCursor.lastIndexOf('}}');
                if (openBracket !== -1 && (closeBracket === -1 || openBracket > closeBracket)) {
                    setSearchTerm(textBeforeCursor.slice(pipeIndex + 1).trim());
                    setTriggerChar('|');
                    setShowPicker(true);
                    updatePickerPosition(target, pipeIndex);
                    return;
                }
            }
        }

        setShowPicker(false);
        setTriggerChar(null);
    }, [value, showFiltersOnPipe]);

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

    const updatePickerPosition = (target: HTMLElement, charIndex: number) => {
        const inputElement = target as HTMLInputElement | HTMLTextAreaElement;
        const cursorPos = inputElement.selectionStart || 0;

        const coords = getCaretCoordinates(inputElement, cursorPos);

        // Position picker below the cursor
        setPickerPosition({
            top: coords.y + coords.height + 4, // 4px below cursor
            left: coords.x,
        });
    };

    const handleSelect = useCallback((insertValue: string) => {
        if (!triggerChar) return;

        const textBeforeCursor = value.slice(0, cursorPosition);
        const textAfterCursor = value.slice(cursorPosition);

        let newValue: string;
        let triggerIndex: number;

        if (triggerChar === '@') {
            triggerIndex = textBeforeCursor.lastIndexOf('@');
            newValue = textBeforeCursor.slice(0, triggerIndex) + insertValue + textAfterCursor;
        } else {
            // For pipe, just append the filter
            triggerIndex = textBeforeCursor.lastIndexOf('|');
            const beforePipe = textBeforeCursor.slice(0, triggerIndex + 1);
            newValue = beforePipe + insertValue + textAfterCursor;
        }

        onChange(newValue);
        setShowPicker(false);
        setTriggerChar(null);

        // Focus back on input
        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    }, [value, cursorPosition, triggerChar, onChange]);

    const handleClose = useCallback(() => {
        setShowPicker(false);
        setTriggerChar(null);
    }, []);

    // Handle blur - close picker with delay to allow click selection
    const handleBlur = useCallback(() => {
        setTimeout(() => {
            if (!document.activeElement?.closest('.variable-picker')) {
                setShowPicker(false);
            }
        }, 150);
    }, []);

    const InputComponent = multiline ? Textarea : Input;

    return (
        <div className="variable-input-wrapper relative">
            <InputComponent
                ref={inputRef as any}
                value={value}
                onChange={handleInput}
                onKeyUp={handleKeyUp}
                onBlur={handleBlur}
                placeholder={placeholder}
                className={cn(
                    // Add visual indicator when value contains variables
                    value.includes('{{') && 'border-blue-300 bg-blue-50/50',
                    className
                )}
            />
            {/* Variable hint */}
            {!showPicker && !value && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    Type @ for variables
                </div>
            )}
            {showPicker && (
                <VariablePicker
                    searchTerm={searchTerm}
                    position={pickerPosition}
                    onSelect={handleSelect}
                    onClose={handleClose}
                    showFilters={triggerChar === '|'}
                    allowedGroups={allowedGroups}
                />
            )}
        </div>
    );
}
