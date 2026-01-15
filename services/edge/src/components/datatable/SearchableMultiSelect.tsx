/**
 * Searchable MultiSelect Component (Multiple selection with embedded search)
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SearchableMultiSelectProps {
    value: string[];
    onChange: (value: string[]) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    className?: string;
}

export function SearchableMultiSelect({ value = [], onChange, options, placeholder = 'Select...', className }: SearchableMultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Close on outside click
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const filteredOptions = useMemo(() => {
        if (!search) return options;
        const lowerSearch = search.toLowerCase();
        return options.filter(opt =>
            opt.label.toLowerCase().includes(lowerSearch) ||
            opt.value.toLowerCase().includes(lowerSearch)
        );
    }, [options, search]);

    const toggleValue = (optValue: string) => {
        if (value.includes(optValue)) {
            onChange(value.filter(v => v !== optValue));
        } else {
            onChange([...value, optValue]);
        }
    };

    const displayText = value.length === 0
        ? placeholder
        : value.length === 1
            ? options.find(opt => opt.value === value[0])?.label || value[0]
            : `${value.length} selected`;

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm text-left focus:outline-none focus:ring-1 focus:ring-ring flex items-center justify-between"
            >
                <span className={value.length > 0 ? '' : 'text-muted-foreground'}>{displayText}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-md border border-input bg-background shadow-lg">
                    <div className="p-2 border-b border-input">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                        />
                    </div>
                    {value.length > 0 && (
                        <div
                            className="px-2 py-1.5 text-sm cursor-pointer hover:bg-muted text-muted-foreground border-b border-input"
                            onClick={() => onChange([])}
                        >
                            Clear all
                        </div>
                    )}
                    <div className="max-h-[200px] overflow-y-auto">
                        {filteredOptions.map(opt => (
                            <div
                                key={opt.value}
                                className={cn(
                                    'px-2 py-1.5 text-sm cursor-pointer hover:bg-muted flex items-center gap-2',
                                    value.includes(opt.value) && 'bg-primary/10'
                                )}
                                onClick={() => toggleValue(opt.value)}
                            >
                                <div className={cn(
                                    'w-4 h-4 border rounded flex items-center justify-center',
                                    value.includes(opt.value) ? 'bg-primary border-primary' : 'border-input'
                                )}>
                                    {value.includes(opt.value) && (
                                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                                {opt.label}
                            </div>
                        ))}
                        {filteredOptions.length === 0 && (
                            <div className="px-2 py-4 text-sm text-muted-foreground text-center">No results</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
